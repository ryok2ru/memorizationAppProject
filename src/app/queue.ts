import type { Word } from '../domain/types';
import { listDueWords, listNewWords } from '../db/repo';

export type SessionKind = 'review' | 'new';

export interface QueueResult {
  kind: SessionKind;
  ids: string[];
}

/** Fisher-Yates */
export function shuffle<T>(items: T[], random: () => number = Math.random): T[] {
  const arr = items.slice();
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * 6-2 のキュー構築（純粋関数）。due は due 昇順、news は createdAt 昇順で渡す。
 */
export function buildQueueFrom(
  due: Word[],
  news: Word[],
  maxCards: number,
  shuffleOn: boolean,
  random: () => number = Math.random,
): QueueResult {
  let kind: SessionKind = 'review';
  let source = due;
  if (source.length === 0) {
    kind = 'new';
    source = news;
  }
  if (source.length === 0) return { kind: 'review', ids: [] };
  let ids = source.slice(0, Math.max(0, maxCards)).map((w) => w.id);
  if (shuffleOn) ids = shuffle(ids, random);
  return { kind, ids };
}

/** folderId が null なら全フォルダ */
export async function buildQueue(
  folderId: string | null,
  maxCards: number,
  shuffleOn: boolean,
  now = Date.now(),
): Promise<QueueResult> {
  const due = await listDueWords(folderId, now);
  const news = due.length > 0 ? [] : await listNewWords(folderId, now);
  return buildQueueFrom(due, news, maxCards, shuffleOn);
}
