import { describe, expect, it } from 'vitest';
import {
  calendarStartLabel,
  calendarStats,
  countDaysInMonth,
  daySummaryText,
  isBeforeMonth,
  longestStreak,
  monthGrid,
  shiftMonth,
  summarizeByDay,
} from './calendar';
import type { Grade } from '../domain/types';

/** ローカル時刻の日時（month は 1 始まり） */
const at = (y: number, m: number, d: number, h = 12, mi = 0) => new Date(y, m - 1, d, h, mi).getTime();
const log = (wordId: string, rating: Grade, review: number) => ({ wordId, rating, review });

describe('summarizeByDay（日付ごとの集計）', () => {
  it('review をローカル日付に変換し、日ごとに単語数と評価の内訳を数える', () => {
    const days = summarizeByDay(
      [
        log('a', 3, at(2026, 9, 20, 8)),
        log('b', 1, at(2026, 9, 20, 23, 59)),
        log('c', 4, at(2026, 9, 21, 0, 0)),
      ],
      null,
    );
    expect([...days.keys()]).toEqual(['2026-09-20', '2026-09-21']);
    expect(days.get('2026-09-20')).toEqual({ words: 2, ratings: { 1: 1, 2: 0, 3: 1, 4: 0 } });
    expect(days.get('2026-09-21')).toEqual({ words: 1, ratings: { 1: 0, 2: 0, 3: 0, 4: 1 } });
  });

  it('同じ日の同じ単語は、その日の最初の評価だけを数える（入力の順番によらない）', () => {
    const days = summarizeByDay(
      [log('a', 3, at(2026, 9, 20, 9, 10)), log('a', 1, at(2026, 9, 20, 9, 0)), log('a', 2, at(2026, 9, 21, 9))],
      null,
    );
    expect(days.get('2026-09-20')).toEqual({ words: 1, ratings: { 1: 1, 2: 0, 3: 0, 4: 0 } });
    // 別の日なら同じ単語でも数える
    expect(days.get('2026-09-21')).toEqual({ words: 1, ratings: { 1: 0, 2: 1, 3: 0, 4: 0 } });
  });

  it('記録が無ければ空', () => {
    expect(summarizeByDay([], null).size).toBe(0);
  });
});

describe('表示開始日の反映', () => {
  const logs = [log('a', 3, at(2026, 9, 19, 10)), log('b', 3, at(2026, 9, 20, 9)), log('c', 3, at(2026, 9, 20, 15)), log('d', 3, at(2026, 9, 21, 10))];

  it('null なら全期間', () => {
    expect([...summarizeByDay(logs, null).keys()]).toEqual(['2026-09-19', '2026-09-20', '2026-09-21']);
  });

  it('設定されていれば、その日時以降（同時刻を含む）の ReviewLog だけを対象にする', () => {
    const days = summarizeByDay(logs, at(2026, 9, 20, 12));
    expect([...days.keys()]).toEqual(['2026-09-20', '2026-09-21']);
    // 開始日時より前の同じ日の記録（b）は数えない
    expect(days.get('2026-09-20')?.words).toBe(1);
    expect(summarizeByDay(logs, at(2026, 9, 21, 10)).size).toBe(1);
  });

  it('3 つの数字も表示開始日以降だけで数える', () => {
    const now = at(2026, 9, 23);
    expect(calendarStats(summarizeByDay(logs, null), now)).toEqual({ thisMonth: 3, longest: 3, total: 3 });
    expect(calendarStats(summarizeByDay(logs, at(2026, 9, 20, 12)), now)).toEqual({ thisMonth: 2, longest: 2, total: 2 });
    expect(calendarStats(summarizeByDay(logs, at(2026, 9, 22)), now)).toEqual({ thisMonth: 0, longest: 0, total: 0 });
  });

  it('設定画面の表示は「M月D日以降を表示中」', () => {
    expect(calendarStartLabel(at(2026, 9, 3, 15, 30))).toBe('9月3日以降を表示中');
  });
});

describe('longestStreak（最長連続日数）', () => {
  it('空なら 0、1 日なら 1', () => {
    expect(longestStreak([])).toBe(0);
    expect(longestStreak(['2026-09-20'])).toBe(1);
  });

  it('途切れた区間のうち最長のものを返す（順不同・重複あり）', () => {
    expect(longestStreak(['2026-09-10', '2026-09-01', '2026-09-02', '2026-09-03', '2026-09-11', '2026-09-02'])).toBe(3);
  });

  it('月・年をまたいでも続けて数える', () => {
    expect(longestStreak(['2026-08-30', '2026-08-31', '2026-09-01', '2026-09-02'])).toBe(4);
    expect(longestStreak(['2025-12-31', '2026-01-01'])).toBe(2);
    // うるう年でない 2 月の末日
    expect(longestStreak(['2026-02-28', '2026-03-01'])).toBe(2);
    expect(longestStreak(['2026-02-28', '2026-03-02'])).toBe(1);
  });
});

describe('月の扱い（月またぎ）', () => {
  it('月の学習日数はその月の日だけを数える', () => {
    const keys = ['2026-08-31', '2026-09-01', '2026-09-30', '2026-10-01'];
    expect(countDaysInMonth(keys, { year: 2026, month: 8 })).toBe(2);
    expect(countDaysInMonth(keys, { year: 2026, month: 7 })).toBe(1);
  });

  it('月末 23:59 と翌月 1 日 0:00 の記録は別の月に入る', () => {
    const days = summarizeByDay([log('a', 3, at(2026, 8, 31, 23, 59)), log('a', 3, at(2026, 9, 1, 0, 0))], null);
    expect(calendarStats(days, at(2026, 9, 15))).toEqual({ thisMonth: 1, longest: 2, total: 2 });
  });

  it('shiftMonth は年をまたぐ。isBeforeMonth で今月より先を判定する', () => {
    expect(shiftMonth({ year: 2026, month: 0 }, -1)).toEqual({ year: 2025, month: 11 });
    expect(shiftMonth({ year: 2026, month: 11 }, 1)).toEqual({ year: 2027, month: 0 });
    expect(isBeforeMonth({ year: 2026, month: 7 }, { year: 2026, month: 8 })).toBe(true);
    expect(isBeforeMonth({ year: 2026, month: 8 }, { year: 2026, month: 8 })).toBe(false);
    expect(isBeforeMonth({ year: 2025, month: 11 }, { year: 2026, month: 0 })).toBe(true);
  });

  it('monthGrid は日曜始まりで、月の外を null で埋める', () => {
    // 2026 年 9 月 1 日は火曜日、30 日は水曜日
    const weeks = monthGrid({ year: 2026, month: 8 });
    expect(weeks).toHaveLength(5);
    expect(weeks[0]).toEqual([null, null, '2026-09-01', '2026-09-02', '2026-09-03', '2026-09-04', '2026-09-05']);
    expect(weeks[4]).toEqual(['2026-09-27', '2026-09-28', '2026-09-29', '2026-09-30', null, null, null]);
    // 2026 年 2 月は日曜始まり・28 日でちょうど 4 週
    const feb = monthGrid({ year: 2026, month: 1 });
    expect(feb).toHaveLength(4);
    expect(feb[0][0]).toBe('2026-02-01');
    expect(feb[3][6]).toBe('2026-02-28');
  });
});

describe('daySummaryText（タップした日の内訳）', () => {
  it('学習した日は単語数と評価の内訳', () => {
    expect(daySummaryText('2026-09-05', { words: 12, ratings: { 1: 2, 2: 1, 3: 8, 4: 1 } })).toBe(
      '9月5日: 12語を学習（Again 2 / Hard 1 / Good 8 / Easy 1）',
    );
  });

  it('学習していない日', () => {
    expect(daySummaryText('2026-10-01', undefined)).toBe('10月1日: 学習の記録はありません');
  });
});
