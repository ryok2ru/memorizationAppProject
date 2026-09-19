import Dexie, { type EntityTable } from 'dexie';
import type { Folder, Word, ReviewLog, Settings } from '../domain/types';

export const DB_NAME = 'vocavault';

export const db = new Dexie(DB_NAME) as Dexie & {
  folders: EntityTable<Folder, 'id'>;
  words: EntityTable<Word, 'id'>;
  reviewLogs: EntityTable<ReviewLog, 'id'>;
  settings: EntityTable<Settings, 'id'>;
};

db.version(1).stores({
  folders: 'id, sortOrder',
  words: 'id, folderId, due, state, [folderId+due], [folderId+state]',
  reviewLogs: 'id, wordId, review',
  settings: 'id',
});

/**
 * v2: Word に favorite を足す（4-3、4-7）。既存レコードには false を入れる。
 * IndexedDB のキーに真偽値は使えないため、favorite / [favorite+due] は宣言どおり作るが
 * 検索には使えない。お気に入りの抽出は読み込んだ配列を絞り込んで行う（db/repo.ts）。
 */
db.version(2)
  .stores({
    folders: 'id, sortOrder',
    words: 'id, folderId, due, state, favorite, [folderId+due], [folderId+state], [favorite+due]',
    reviewLogs: 'id, wordId, review',
    settings: 'id',
  })
  .upgrade((tx) =>
    tx
      .table('words')
      .toCollection()
      .modify((w: { favorite?: boolean }) => {
        w.favorite = false;
      }),
  );
