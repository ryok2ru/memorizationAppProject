import { describe, expect, it } from 'vitest';
import { computeStreak, streakMessage } from './streak';
import { addDays } from '../domain/dates';

const now = new Date(2026, 8, 18, 15, 0, 0).getTime();

describe('computeStreak', () => {
  it('empty', () => {
    const s = computeStreak([], now);
    expect(s).toEqual({ current: 0, isActiveToday: false, isBroken: false, hasAny: false });
    expect(streakMessage(s)).toBe('最初の学習を始めましょう！');
  });
  it('consecutive days including today', () => {
    const s = computeStreak([now, addDays(now, -1), addDays(now, -2), addDays(now, -2) + 100], now);
    expect(s.current).toBe(3);
    expect(s.isActiveToday).toBe(true);
    expect(s.isBroken).toBe(false);
    expect(streakMessage(s)).toBe('🔥 3日連続学習中！');
  });
  it('streak up to yesterday counts and is not broken', () => {
    const s = computeStreak([addDays(now, -1), addDays(now, -2)], now);
    expect(s.current).toBe(2);
    expect(s.isActiveToday).toBe(false);
    expect(s.isBroken).toBe(false);
    expect(streakMessage(s)).toBe('🔥 2日連続学習中！');
  });
  it('broken when neither today nor yesterday', () => {
    const s = computeStreak([addDays(now, -2), addDays(now, -3)], now);
    expect(s.current).toBe(0);
    expect(s.isBroken).toBe(true);
    expect(streakMessage(s)).toBe('昨日は学習をお休みしました。今日から再開しましょう！');
  });
  it('gap before today resets count to today only', () => {
    const s = computeStreak([now, addDays(now, -3)], now);
    expect(s.current).toBe(1);
  });
});
