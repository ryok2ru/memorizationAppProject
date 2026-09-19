import type { CardState, Scope } from '../domain/types';
import { countByState, countDueWords, countNewWords, countWords } from '../db/repo';

export type StateCounts = Record<CardState, number>;

export const totalOf = (c: StateCounts) => c[0] + c[1] + c[2] + c[3];

/** 予想時間（分） = ceil(N × 30 ÷ 60) */
export const estimateMinutes = (n: number) => Math.ceil((n * 30) / 60);

export interface Overview {
  due: number;
  news: number;
  byState: StateCounts;
  total: number;
}

export async function loadOverview(scope: Scope, now = Date.now()): Promise<Overview> {
  const [due, news, byState] = await Promise.all([countDueWords(scope, now), countNewWords(scope), countByState(scope)]);
  return { due, news, byState, total: totalOf(byState) };
}

export interface ScopeStats {
  total: number;
  due: number;
}

/** ホームのカード 1 枚分（フォルダ、または「★ お気に入り」）の件数（7-2） */
export async function loadScopeStats(scope: Scope, now = Date.now()): Promise<ScopeStats> {
  const [total, due] = await Promise.all([countWords(scope), countDueWords(scope, now)]);
  return { total, due };
}
