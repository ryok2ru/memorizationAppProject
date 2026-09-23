import { GRADES, GRADE_NAMES, type Grade, type ReviewLog } from '../domain/types';
import { addDays, dateKey } from '../domain/dates';
import { listReviewLogs } from '../db/repo';
import { loadSettings } from './settings';

/**
 * 学習カレンダー（7-11）の集計。ReviewLog を一度読み込み、review をローカル日付に変換して日付ごとにまとめる。
 * 進捗リセットの有無は見ない（リセット前の日も学習日）。表示開始日（Settings.calendarStartDate）だけで絞る。
 * ストリーク（6-7、streak.ts）とは別の集計で、互いに影響しない。
 */

/** 1 日分の内訳。words = その日に評価した単語数、ratings = 各単語のその日の最初の評価の件数 */
export interface DaySummary {
  words: number;
  ratings: Record<Grade, number>;
}

/** 日付キー（YYYY-MM-DD）→ その日の内訳。学習した日だけが入る */
export type CalendarDays = Map<string, DaySummary>;

/** 年と月（month は 0 = 1 月） */
export interface YearMonth {
  year: number;
  month: number;
}

type LogLike = Pick<ReviewLog, 'wordId' | 'rating' | 'review'>;

/**
 * 日付ごとに集計する。startDate が数値ならその日時以降（review >= startDate）の ReviewLog だけを対象にする。
 * 同じ日に同じ単語を複数回評価した場合（再出題）は、その日の最初の評価だけを数える（6-6 の結果画面と同じ考え方）。
 */
export function summarizeByDay(logs: readonly LogLike[], startDate: number | null): CalendarDays {
  const sorted = logs.filter((l) => startDate == null || l.review >= startDate).sort((a, b) => a.review - b.review);
  const days: CalendarDays = new Map();
  const seen = new Map<string, Set<string>>();
  for (const log of sorted) {
    const key = dateKey(log.review);
    let day = days.get(key);
    let words = seen.get(key);
    if (!day || !words) {
      day = { words: 0, ratings: { 1: 0, 2: 0, 3: 0, 4: 0 } };
      words = new Set();
      days.set(key, day);
      seen.set(key, words);
    }
    if (words.has(log.wordId)) continue;
    words.add(log.wordId);
    day.words += 1;
    day.ratings[log.rating] += 1;
  }
  return days;
}

/** 日付キーをローカル時刻の 0:00 に戻す */
function keyToTime(key: string): number {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d).getTime();
}

/** 最長の連続日数（学習した日が途切れず続いた最大の日数）。月や年をまたいでも数える */
export function longestStreak(dayKeys: Iterable<string>): number {
  const keys = [...new Set(dayKeys)].sort();
  let best = 0;
  let run = 0;
  let prev: string | null = null;
  for (const key of keys) {
    run = prev != null && dateKey(addDays(keyToTime(prev), 1)) === key ? run + 1 : 1;
    best = Math.max(best, run);
    prev = key;
  }
  return best;
}

const monthPrefix = ({ year, month }: YearMonth) => `${year}-${String(month + 1).padStart(2, '0')}-`;

/** その月の学習日数 */
export function countDaysInMonth(dayKeys: Iterable<string>, ym: YearMonth): number {
  const prefix = monthPrefix(ym);
  let n = 0;
  for (const key of dayKeys) if (key.startsWith(prefix)) n += 1;
  return n;
}

/** カレンダーの上に並べる 3 つの数字（7-11） */
export interface CalendarStats {
  /** 今月（now の月）の学習日数 */
  thisMonth: number;
  /** 最長の連続日数（全期間。表示開始日があればそれ以降） */
  longest: number;
  /** 総学習日数 */
  total: number;
}

export function calendarStats(days: CalendarDays, now: number): CalendarStats {
  return {
    thisMonth: countDaysInMonth(days.keys(), toYearMonth(now)),
    longest: longestStreak(days.keys()),
    total: days.size,
  };
}

export function toYearMonth(ms: number): YearMonth {
  const d = new Date(ms);
  return { year: d.getFullYear(), month: d.getMonth() };
}

/** delta か月ずらす（年をまたぐ） */
export function shiftMonth({ year, month }: YearMonth, delta: number): YearMonth {
  const d = new Date(year, month + delta, 1);
  return { year: d.getFullYear(), month: d.getMonth() };
}

/** a が b より前の月か */
export function isBeforeMonth(a: YearMonth, b: YearMonth): boolean {
  return a.year < b.year || (a.year === b.year && a.month < b.month);
}

/**
 * 日曜始まりの月カレンダー。週ごとの配列で、各マスはその日の日付キー、月の外は null。
 * 最初の週の 1 日より前と、最後の週の末日より後を null で埋める。
 */
export function monthGrid({ year, month }: YearMonth): (string | null)[][] {
  const first = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (string | null)[] = Array.from({ length: first.getDay() }, () => null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(dateKey(new Date(year, month, d).getTime()));
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks: (string | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

/** 日付キー → 「M月D日」 */
export function formatDayKey(key: string): string {
  const [, m, d] = key.split('-').map(Number);
  return `${m}月${d}日`;
}

/** タップした日の内訳の 1 行（7-11） */
export function daySummaryText(key: string, day: DaySummary | undefined): string {
  if (!day) return `${formatDayKey(key)}: 学習の記録はありません`;
  const parts = GRADES.map((g) => `${GRADE_NAMES[g]} ${day.ratings[g]}`).join(' / ');
  return `${formatDayKey(key)}: ${day.words}語を学習（${parts}）`;
}

/** 設定画面の表示（7-8）: 「M月D日以降を表示中」 */
export function calendarStartLabel(startDate: number): string {
  return `${formatDayKey(dateKey(startDate))}以降を表示中`;
}

/** カレンダー画面のデータ。ReviewLog を一度だけ読み、表示開始日で絞って日付ごとに集計する */
export async function loadCalendar(): Promise<CalendarDays> {
  const [logs, settings] = await Promise.all([listReviewLogs(), loadSettings()]);
  return summarizeByDay(logs, settings.calendarStartDate);
}
