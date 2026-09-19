const DAY_MS = 24 * 60 * 60 * 1000;

const pad2 = (n: number) => String(n).padStart(2, '0');

/** ローカル日付キー YYYY-MM-DD */
export function dateKey(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/** ローカル時刻での当日 0:00 */
export function startOfDay(ms: number): number {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** ローカル時刻での当日 23:59:59.999 */
export function endOfDay(ms: number): number {
  const d = new Date(ms);
  d.setHours(23, 59, 59, 999);
  return d.getTime();
}

/** ローカル時刻で n 日後の同時刻（DST をまたいでも日付単位で進める） */
export function addDays(ms: number, n: number): number {
  const d = new Date(ms);
  d.setDate(d.getDate() + n);
  return d.getTime();
}

/** 日付（0:00）同士の差を日数で返す。a が b より後なら正 */
export function diffDays(a: number, b: number): number {
  return Math.round((startOfDay(a) - startOfDay(b)) / DAY_MS);
}

/** 評価したあとの次回の復習（7-7 の結果画面の一覧）。評価直後なので超過は出ない */
export function reviewDayLabel(due: number, now: number): string {
  const d = diffDays(due, now);
  if (d <= 0) return '今日';
  if (d === 1) return '明日';
  return `${d}日後`;
}

/** 単語一覧の復習予定表示（7-3） */
export function relativeDueLabel(due: number, state: number, now: number): string {
  if (state === 0) return '未学習';
  const d = diffDays(due, now);
  if (d < 0) return `${-d}日超過`;
  return reviewDayLabel(due, now);
}

/** 結果画面の「次回最も早い復習日」表示（6-6） */
export function nextReviewLabel(due: number, now: number): string {
  const d = diffDays(due, now);
  if (d <= 0) return '今日';
  const dt = new Date(due);
  return `${dt.getMonth() + 1}月${dt.getDate()}日（${d}日後）`;
}

/** 所要時間「3分22秒」 */
export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return m > 0 ? `${m}分${s}秒` : `${s}秒`;
}

/** 「M/D HH:MM」 */
export function formatShortDateTime(ms: number): string {
  const d = new Date(ms);
  return `${d.getMonth() + 1}/${d.getDate()} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

/** "YYYY-MM-DD HH:MM"（通知予約用、ローカル時刻） */
export function formatNotifyAt(ms: number): string {
  const d = new Date(ms);
  return `${dateKey(ms)} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

/** "HH:MM" を分解する。不正なら 8:00 */
export function parseHHMM(s: string): { h: number; m: number } {
  const m = /^(\d{1,2}):(\d{2})$/.exec(s);
  if (!m) return { h: 8, m: 0 };
  const h = Math.min(23, Math.max(0, Number(m[1])));
  const mi = Math.min(59, Math.max(0, Number(m[2])));
  return { h, m: mi };
}
