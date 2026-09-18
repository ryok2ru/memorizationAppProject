import { dateKey, addDays, startOfDay } from '../domain/dates';
import { countReviewsBetween, listReviewTimes } from '../db/repo';

export interface Streak {
  current: number;
  isActiveToday: boolean;
  isBroken: boolean;
  hasAny: boolean;
}

export function computeStreak(reviewTimes: Iterable<number>, now = Date.now()): Streak {
  const days = new Set<string>();
  for (const t of reviewTimes) days.add(dateKey(t));
  const hasAny = days.size > 0;
  const todayKey = dateKey(now);
  const isActiveToday = days.has(todayKey);
  let cursor = isActiveToday ? now : addDays(now, -1);
  let current = 0;
  while (days.has(dateKey(cursor))) {
    current += 1;
    cursor = addDays(cursor, -1);
  }
  const isBroken = hasAny && !isActiveToday && !days.has(dateKey(addDays(now, -1)));
  return { current: isBroken ? 0 : current, isActiveToday, isBroken, hasAny };
}

export function streakMessage(s: Streak): string {
  if (!s.hasAny) return '最初の学習を始めましょう！';
  if (s.isBroken) return '昨日は学習をお休みしました。今日から再開しましょう！';
  return `🔥 ${s.current}日連続学習中！`;
}

export async function loadStreak(now = Date.now()): Promise<Streak> {
  return computeStreak(await listReviewTimes(), now);
}

/** startedAt より前に今日の学習記録があったか（結果画面の「当日初の学習」判定） */
export async function hadStudiedTodayBefore(startedAt: number): Promise<boolean> {
  return (await countReviewsBetween(startOfDay(startedAt), startedAt)) > 0;
}
