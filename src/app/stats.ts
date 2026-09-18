import type { CardState } from '../domain/types';
import { countByState, countDueWords, countNewWords, countWordsInFolder } from '../db/repo';

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

export async function loadOverview(folderId: string | null, now = Date.now()): Promise<Overview> {
  const [due, news, byState] = await Promise.all([
    countDueWords(folderId, now),
    countNewWords(folderId),
    countByState(folderId),
  ]);
  return { due, news, byState, total: totalOf(byState) };
}

export interface FolderStats {
  total: number;
  due: number;
}

export async function loadFolderStats(folderId: string, now = Date.now()): Promise<FolderStats> {
  const [total, due] = await Promise.all([countWordsInFolder(folderId), countDueWords(folderId, now)]);
  return { total, due };
}
