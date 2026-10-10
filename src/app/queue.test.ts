import { describe, expect, it } from 'vitest';
import { buildQueueFrom, separateSiblings, shuffle } from './queue';
import { parentsMap } from '../domain/relations';
import type { Edge } from '../domain/types';
import type { Word } from '../domain/types';
import { newCardFields } from '../domain/fsrs';

const now = 1_700_000_000_000;
const mk = (id: string, state: 0 | 2 = 2, due = now): Word => ({
  id,
  folderId: 'f',
  englishTerm: id,
  japaneseDefinition: id,
  memo: '',
  favorite: false,
  createdAt: now,
  updatedAt: now,
  ...newCardFields(now),
  state,
  due,
});

describe('buildQueueFrom', () => {
  it('prefers due words in given order', () => {
    const q = buildQueueFrom([mk('a'), mk('b')], [mk('n', 0)], 30, false);
    expect(q).toEqual({ kind: 'review', ids: ['a', 'b'] });
  });
  it('falls back to New words when nothing is due', () => {
    const q = buildQueueFrom([], [mk('n1', 0), mk('n2', 0)], 30, false);
    expect(q).toEqual({ kind: 'new', ids: ['n1', 'n2'] });
  });
  it('returns empty queue when both are empty', () => {
    expect(buildQueueFrom([], [], 30, false).ids).toEqual([]);
  });
  it('truncates to maxCards for both kinds', () => {
    const many = Array.from({ length: 50 }, (_, i) => mk(`w${i}`));
    expect(buildQueueFrom(many, [], 30, false).ids).toHaveLength(30);
    const news = Array.from({ length: 50 }, (_, i) => mk(`n${i}`, 0));
    expect(buildQueueFrom([], news, 10, false).ids).toHaveLength(10);
  });
  it('shuffle keeps the same set of elements', () => {
    const many = Array.from({ length: 20 }, (_, i) => mk(`w${i}`));
    let seed = 42;
    const rnd = () => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed / 2147483648;
    };
    const q = buildQueueFrom(many, [], 30, true, rnd);
    expect(q.ids.slice().sort()).toEqual(many.map((w) => w.id).sort());
    expect(q.ids).not.toEqual(many.map((w) => w.id));
    expect(shuffle([1, 2, 3], () => 0)).toEqual([2, 3, 1]);
  });
});

describe('兄弟の並べ替え（6-2 の手順 4）', () => {
  const h = (from: string, to: string): Edge => ({ id: `${from}-${to}`, kind: 'hierarchy', from, to, directed: false, label: '', createdAt: 0 });
  // 動物 → 犬・猫・鳥。果物 → りんご・みかん
  const parents = parentsMap([h('animal', 'dog'), h('animal', 'cat'), h('animal', 'bird'), h('fruit', 'apple'), h('fruit', 'orange')]);
  const adjacent = (ids: string[]) => ids.slice(1).filter((id, i) => parents.get(id)?.some((p) => parents.get(ids[i])?.includes(p))).length;

  it('New のみで兄弟が隣り合わない', () => {
    const news = ['dog', 'cat', 'bird', 'apple', 'orange', 'x'].map((id) => mk(id, 0));
    const q = buildQueueFrom([], news, 30, false, Math.random, parents);
    expect(q.kind).toBe('new');
    expect(adjacent(q.ids)).toBe(0);
    expect(q.ids.slice().sort()).toEqual(news.map((w) => w.id).sort());
  });

  it('離せないときもカードを落とさず、隣り合わせは残りが兄弟だけになった所だけ', () => {
    const ids = separateSiblings(['dog', 'cat', 'bird', 'x'], parents);
    expect(ids).toEqual(['dog', 'x', 'cat', 'bird']);
    expect(adjacent(ids)).toBe(1);
  });

  it('シャッフル OFF で兄弟がいなければ順序は変わらない', () => {
    const news = ['a', 'dog', 'b', 'apple', 'c'].map((id) => mk(id, 0));
    expect(buildQueueFrom([], news, 30, false, Math.random, parents).ids).toEqual(['a', 'dog', 'b', 'apple', 'c']);
  });

  it('シャッフル OFF では登録順を保ったまま必要な所だけを動かす', () => {
    expect(separateSiblings(['dog', 'cat', 'x', 'bird', 'y'], parents)).toEqual(['dog', 'x', 'cat', 'y', 'bird']);
  });

  it('上位がノードでも兄弟として扱う（parents の上位はカードかノードかを問わない）', () => {
    const p = parentsMap([h('node-id', 'a'), h('node-id', 'b')]);
    expect(separateSiblings(['a', 'b', 'c'], p)).toEqual(['a', 'c', 'b']);
  });

  it('復習のセッションでは並べ替えない', () => {
    const due = ['dog', 'cat', 'x'].map((id) => mk(id));
    expect(buildQueueFrom(due, [], 30, false, Math.random, parents).ids).toEqual(['dog', 'cat', 'x']);
  });
});
