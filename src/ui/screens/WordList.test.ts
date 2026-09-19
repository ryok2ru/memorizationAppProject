import { describe, expect, it } from 'vitest';
import {
  DEFAULT_DIR,
  DEFAULT_SORT,
  DIR_MARKS,
  MOVED_MS,
  SORT_KEYS,
  SORT_LABELS,
  SORT_SHORT_LABELS,
  bulkDeleteMessage,
  favoriteMessage,
  flipDir,
  moveTargets,
  movedMessage,
  sortWords,
} from './WordList';
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

const word = (id: string, en: string, createdAt: number, state: CardState, due: number, favorite = false): Word =>
  ({
    id,
    folderId: 'f',
    englishTerm: en,
    japaneseDefinition: '訳',
    memo: '',
    favorite,
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

// 登録順 / 頭文字 / 状態 / due / ☆ をばらばらにした 5 語
const banana = word('1', 'banana', 100, 2, 500, true); // Review、★
const apple = word('2', 'Apple', 200, 0, 900); // New
const cherry = word('3', 'cherry', 300, 3, 300, true); // Relearning、★
const date = word('4', 'date', 400, 1, 400); // Learning
const fig = word('5', 'fig', 500, 2, 100); // Review
const words = [banana, apple, cherry, date, fig];

describe('sortWords', () => {
  it('既定は登録日の新しい順', () => {
    expect(DEFAULT_SORT).toBe('created');
    expect(DEFAULT_DIR.created).toBe('desc');
    expect(sortWords(words, 'created').map((w) => w.id)).toEqual(['5', '4', '3', '2', '1']);
  });

  it('アルファベットの既定は A→Z', () => {
    expect(DEFAULT_DIR.alpha).toBe('asc');
    expect(sortWords(words, 'alpha').map((w) => w.englishTerm)).toEqual(['Apple', 'banana', 'cherry', 'date', 'fig']);
  });

  it('学習状態の既定は New → Learning → Relearning → Review で、同じ状態の中は due 昇順', () => {
    expect(DEFAULT_DIR.state).toBe('asc');
    expect(sortWords(words, 'state').map((w) => w.id)).toEqual(['2', '4', '3', '5', '1']);
  });

  it('次回の復習日の既定は近い順で、未学習は最後', () => {
    expect(DEFAULT_DIR.due).toBe('asc');
    expect(sortWords(words, 'due').map((w) => w.id)).toEqual(['5', '3', '4', '1', '2']);
  });

  it('お気に入りの既定は ★ が上で、同じグループ内は登録日の新しい順', () => {
    expect(DEFAULT_DIR.favorite).toBe('desc');
    expect(sortWords(words, 'favorite').map((w) => w.id)).toEqual(['3', '1', '5', '4', '2']);
  });

  it('入力の配列は変えない', () => {
    const input = [...words];
    sortWords(input, 'alpha');
    expect(input.map((w) => w.id)).toEqual(['1', '2', '3', '4', '5']);
  });
});

describe('向きの反転', () => {
  it('flipDir が昇順と降順を入れ替える', () => {
    expect(flipDir('asc')).toBe('desc');
    expect(flipDir('desc')).toBe('asc');
    expect(DIR_MARKS).toEqual({ asc: '↑', desc: '↓' });
  });

  it('どの基準でも、向きを反転すると並びがそのまま逆順になる', () => {
    for (const key of SORT_KEYS) {
      const def = sortWords(words, key, DEFAULT_DIR[key]).map((w) => w.id);
      const flipped = sortWords(words, key, flipDir(DEFAULT_DIR[key])).map((w) => w.id);
      expect(flipped).toEqual([...def].reverse());
    }
  });

  it('登録日を反転すると古い順', () => {
    expect(sortWords(words, 'created', 'asc').map((w) => w.id)).toEqual(['1', '2', '3', '4', '5']);
  });

  it('アルファベットを反転すると Z→A', () => {
    expect(sortWords(words, 'alpha', 'desc').map((w) => w.englishTerm)).toEqual(['fig', 'date', 'cherry', 'banana', 'Apple']);
  });

  it('学習状態を反転すると Review → Relearning → Learning → New', () => {
    expect(sortWords(words, 'state', 'desc').map((w) => w.id)).toEqual(['1', '5', '3', '4', '2']);
  });

  it('次回の復習日を反転すると遠い順で、未学習の位置も反転して先頭に来る', () => {
    expect(sortWords(words, 'due', 'desc').map((w) => w.id)).toEqual(['2', '1', '4', '3', '5']);
  });

  it('お気に入りを反転すると ☆ なしが上に来る', () => {
    expect(sortWords(words, 'favorite', 'asc').map((w) => w.id)).toEqual(['2', '4', '5', '1', '3']);
  });
});

describe('並べ替えの名前', () => {
  it('シートには 5 つの基準の長い名前を出す', () => {
    expect(SORT_KEYS).toEqual(['created', 'alpha', 'state', 'due', 'favorite']);
    expect(SORT_KEYS.map((k) => SORT_LABELS[k])).toEqual(['登録日', 'アルファベット', '学習状態', '次回の復習日', 'お気に入り']);
  });

  it('ボタンには短い表示名を出す', () => {
    expect(SORT_KEYS.map((k) => SORT_SHORT_LABELS[k])).toEqual(['登録日', 'A→Z', '状態', '復習日', '★']);
  });

  it('短い表示名は幅を固定する既定の「登録日」に収まる長さにする', () => {
    for (const k of SORT_KEYS) expect(SORT_SHORT_LABELS[k].length).toBeLessThanOrEqual(SORT_SHORT_LABELS.created.length);
  });
});

describe('選択モードの文面', () => {
  it('☆ を付けたときと外したときで書き分ける', () => {
    expect(favoriteMessage(3, true)).toBe('3件をお気に入りに追加しました');
    expect(favoriteMessage(1, false)).toBe('1件をお気に入りから外しました');
  });

  it('削除の確認は ★ 付きを含むときだけ件数を添える', () => {
    expect(bulkDeleteMessage(2, 0)).toBe('2件の単語と学習履歴を削除します。よろしいですか？');
    expect(bulkDeleteMessage(5, 2)).toBe('5件の単語と学習履歴を削除します。お気に入り2件を含みます。よろしいですか？');
  });
});
