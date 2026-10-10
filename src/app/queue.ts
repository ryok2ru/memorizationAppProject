import type { Scope, Word } from '../domain/types';
import { listDueWords, listEdges, listNewWords } from '../db/repo';
import { areSiblings, parentsMap } from '../domain/relations';

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
 * 兄弟が隣り合わないように並べ替える（6-2 の手順 4）。先頭から順に、直前に置いたカードの兄弟でない最初のカードを
 * 残りから選んで置く。そういうカードが残っていなければ残りの先頭を置く（貪欲法。カードは落とさない）。
 * parents は下位 id → 上位 id の一覧（domain/relations の parentsMap）
 */
export function separateSiblings(ids: readonly string[], parents: Map<string, string[]>): string[] {
  const rest = ids.slice();
  const out: string[] = [];
  while (rest.length > 0) {
    const prev = out[out.length - 1];
    let i = prev === undefined ? 0 : rest.findIndex((id) => !areSiblings(parents, prev, id));
    if (i < 0) i = 0;
    out.push(rest.splice(i, 1)[0]);
  }
  return out;
}

/**
 * 6-2 のキュー構築（純粋関数）。due は due 昇順、news は createdAt 昇順で渡す。
 * parents（下位 id → 上位 id）を渡すと、New のみのときに兄弟を隣り合わせにしない
 */
export function buildQueueFrom(
  due: Word[],
  news: Word[],
  maxCards: number,
  shuffleOn: boolean,
  random: () => number = Math.random,
  parents: Map<string, string[]> = new Map(),
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
  if (kind === 'new' && parents.size > 0) ids = separateSiblings(ids, parents);
  return { kind, ids };
}

/** scope は 'all'（全フォルダ）、'favorites'（★ 付きのみ）、またはフォルダ id（6-1） */
export async function buildQueue(scope: Scope, maxCards: number, shuffleOn: boolean, now = Date.now()): Promise<QueueResult> {
  const due = await listDueWords(scope, now);
  const news = due.length > 0 ? [] : await listNewWords(scope, now);
  // 兄弟の判定は New のみのときだけ要る。階層の関係を全件読む（4-6）
  const parents = news.length > 0 ? parentsMap(await listEdges()) : new Map<string, string[]>();
  return buildQueueFrom(due, news, maxCards, shuffleOn, Math.random, parents);
}
