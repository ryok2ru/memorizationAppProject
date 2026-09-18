import { describe, expect, it } from 'vitest';
import { DEFAULT_SORT, MOVED_MS, SORT_KEYS, SORT_LABELS, SORT_SHORT_LABELS, moveTargets, movedMessage, sortWords } from './WordList';
import type { CardState, Folder, Word } from '../../domain/types';

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

const word = (id: string, en: string, createdAt: number, state: CardState, due: number): Word =>
  ({
    id,
    folderId: 'f',
    englishTerm: en,
    japaneseDefinition: '訳',
    memo: '',
    createdAt,
    updatedAt: createdAt,
    due,
    stability: 0,
    difficulty: 0,
    elapsed_days: 0,
    scheduled_days: 0,
    learning_steps: 0,
    reps: 0,
    lapses: 0,
    state,
    last_review: null,
  }) satisfies Word;

// 登録順 / 頭文字 / 状態 / due をばらばらにした 5 語
const banana = word('1', 'banana', 100, 2, 500); // Review
const apple = word('2', 'Apple', 200, 0, 900); // New
const cherry = word('3', 'cherry', 300, 3, 300); // Relearning
const date = word('4', 'date', 400, 1, 400); // Learning
const fig = word('5', 'fig', 500, 2, 100); // Review
const words = [banana, apple, cherry, date, fig];

describe('sortWords', () => {
  it('既定は登録日の新しい順', () => {
    expect(DEFAULT_SORT).toBe('createdDesc');
    expect(sortWords(words, 'createdDesc').map((w) => w.id)).toEqual(['5', '4', '3', '2', '1']);
  });

  it('登録日の古い順', () => {
    expect(sortWords(words, 'createdAsc').map((w) => w.id)).toEqual(['1', '2', '3', '4', '5']);
  });

  it('アルファベット順（A→Z）', () => {
    expect(sortWords(words, 'alpha').map((w) => w.englishTerm)).toEqual(['Apple', 'banana', 'cherry', 'date', 'fig']);
  });

  it('学習状態は New → Learning → Relearning → Review で、同じ状態の中は due 昇順', () => {
    expect(sortWords(words, 'state').map((w) => w.id)).toEqual(['2', '4', '3', '5', '1']);
  });

  it('次回の復習日は近い順で、未学習は最後', () => {
    expect(sortWords(words, 'due').map((w) => w.id)).toEqual(['5', '3', '4', '1', '2']);
  });

  it('入力の配列は変えない', () => {
    const input = [...words];
    sortWords(input, 'alpha');
    expect(input.map((w) => w.id)).toEqual(['1', '2', '3', '4', '5']);
  });
});

describe('並べ替えの名前', () => {
  it('5 つの選択肢に、シート用の名前とボタン用の短い名前がある', () => {
    expect(SORT_KEYS).toEqual(['createdDesc', 'createdAsc', 'alpha', 'state', 'due']);
    expect(SORT_KEYS.map((k) => SORT_LABELS[k])).toEqual([
      '登録日（新しい順）',
      '登録日（古い順）',
      'アルファベット順（A→Z）',
      '学習状態',
      '次回の復習日',
    ]);
    expect(SORT_KEYS.map((k) => SORT_SHORT_LABELS[k])).toEqual(['新しい順', '古い順', 'A→Z', '学習状態', '復習日']);
  });
});
