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

/** v2: Word に favorite を足す（4-3、4-7）。既存レコードには false を入れる */
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

/**
 * v3: favorite と [favorite+due] のインデックス宣言を外す（4-6、4-7）。
 * IndexedDB のキーに真偽値は使えないので、宣言してもレコードはインデックスに載らず検索に効かない。
 * レコードは変わらないので upgrade は要らない。お気に入りの抽出は配列の絞り込みで行う（db/repo.ts）。
 */
db.version(3).stores({
  folders: 'id, sortOrder',
  words: 'id, folderId, due, state, [folderId+due], [folderId+state]',
  reviewLogs: 'id, wordId, review',
  settings: 'id',
});
