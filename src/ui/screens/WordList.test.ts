import { describe, expect, it } from 'vitest';
import { MOVED_MS, moveTargets, movedMessage } from './WordList';
import type { Folder } from '../../domain/types';

const folder = (id: string, name: string): Folder => ({ id, name, createdAt: 0, sortOrder: 0 });

describe('moveTargets', () => {
  const folders = [folder('a', 'A'), folder('b', 'B'), folder('c', 'C')];

  it('excludes the current folder from the destinations', () => {
    expect(moveTargets(folders, 'b').map((f) => f.id)).toEqual(['a', 'c']);
  });

  it('is empty when the current folder is the only one, so the dialog shows "no destination"', () => {
    expect(moveTargets([folder('a', 'A')], 'a')).toHaveLength(0);
    expect(moveTargets([], 'a')).toHaveLength(0);
  });

  it('keeps every folder when the current one is not in the list', () => {
    expect(moveTargets(folders, 'zzz')).toHaveLength(3);
  });
});

describe('movedMessage', () => {
  it('names the count and the destination folder', () => {
    expect(movedMessage(2, 'B')).toBe('2件を「B」に移動しました');
    expect(movedMessage(1, '英検 2級')).toBe('1件を「英検 2級」に移動しました');
  });

  it('is shown for 4 seconds', () => {
    expect(MOVED_MS).toBe(4000);
  });
});
