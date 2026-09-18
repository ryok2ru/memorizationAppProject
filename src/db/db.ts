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
