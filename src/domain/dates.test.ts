import { describe, expect, it } from 'vitest';
import {
  addDays,
  dateKey,
  diffDays,
  endOfDay,
  formatDuration,
  formatNotifyAt,
  nextReviewLabel,
  parseHHMM,
  relativeDueLabel,
  reviewDayLabel,
  startOfDay,
} from './dates';

const now = new Date(2026, 8, 18, 15, 30, 0).getTime(); // 2026-09-18 15:30 local

describe('dates', () => {
  it('dateKey uses local date', () => {
    expect(dateKey(now)).toBe('2026-09-18');
    expect(dateKey(new Date(2026, 0, 5, 0, 0, 0).getTime())).toBe('2026-01-05');
  });
  it('endOfDay is 23:59:59.999 local', () => {
    const e = new Date(endOfDay(now));
    expect(e.getHours()).toBe(23);
    expect(e.getMinutes()).toBe(59);
    expect(e.getSeconds()).toBe(59);
    expect(e.getMilliseconds()).toBe(999);
    expect(dateKey(endOfDay(now))).toBe('2026-09-18');
    expect(new Date(startOfDay(now)).getHours()).toBe(0);
  });
  it('addDays / diffDays', () => {
    expect(dateKey(addDays(now, 1))).toBe('2026-09-19');
    expect(diffDays(addDays(now, 3), now)).toBe(3);
    expect(diffDays(now, addDays(now, 3))).toBe(-3);
  });
  it('reviewDayLabel', () => {
    // 結果画面の一覧（7-7）。評価直後なので今日より前は出ないが、出たときは「今日」にまとめる
    expect(reviewDayLabel(now, now)).toBe('今日');
    expect(reviewDayLabel(endOfDay(now), now)).toBe('今日');
    expect(reviewDayLabel(addDays(now, -1), now)).toBe('今日');
    expect(reviewDayLabel(addDays(now, 1), now)).toBe('明日');
    expect(reviewDayLabel(addDays(now, 30), now)).toBe('30日後');
  });
  it('relativeDueLabel', () => {
    expect(relativeDueLabel(now, 0, now)).toBe('未学習');
    expect(relativeDueLabel(addDays(now, -2), 2, now)).toBe('2日超過');
    expect(relativeDueLabel(startOfDay(now), 2, now)).toBe('今日');
    expect(relativeDueLabel(endOfDay(now), 1, now)).toBe('今日');
    expect(relativeDueLabel(addDays(now, 1), 2, now)).toBe('明日');
    expect(relativeDueLabel(addDays(now, 5), 2, now)).toBe('5日後');
  });
  it('nextReviewLabel', () => {
    expect(nextReviewLabel(now + 600000, now)).toBe('今日');
    expect(nextReviewLabel(addDays(now, 3), now)).toBe('9月21日（3日後）');
  });
  it('formatDuration', () => {
    expect(formatDuration(202000)).toBe('3分22秒');
    expect(formatDuration(5000)).toBe('5秒');
  });
  it('formatNotifyAt / parseHHMM', () => {
    expect(formatNotifyAt(new Date(2026, 8, 19, 8, 0).getTime())).toBe('2026-09-19 08:00');
    expect(parseHHMM('08:00')).toEqual({ h: 8, m: 0 });
    expect(parseHHMM('21:15')).toEqual({ h: 21, m: 15 });
    expect(parseHHMM('bad')).toEqual({ h: 8, m: 0 });
  });
});
