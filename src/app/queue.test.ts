import { describe, expect, it } from 'vitest';
import { buildQueueFrom, shuffle } from './queue';
import type { Word } from '../domain/types';
import { newCardFields } from '../domain/fsrs';

const now = 1_700_000_000_000;
const mk = (id: string, state: 0 | 2 = 2, due = now): Word => ({
  id,
  folderId: 'f',
  englishTerm: id,
  japaneseDefinition: id,
  memo: '',
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
