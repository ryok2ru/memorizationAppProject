import { describe, expect, it } from 'vitest';
import Dexie from 'dexie';
import { DB_NAME, db } from './db';

/** v2 の words。favorite と [favorite+due] を宣言していた */
const V2_WORDS = 'id, folderId, due, state, favorite, [folderId+due], [folderId+state], [favorite+due]';

describe('Dexie のスキーマ（4-6、4-7）', () => {
  it('v2 の DB を v3 で開くと、インデックス宣言だけが減ってレコードは残る', async () => {
    const old = new Dexie(DB_NAME);
    old.version(2).stores({
      folders: 'id, sortOrder',
      words: V2_WORDS,
      reviewLogs: 'id, wordId, review',
      settings: 'id',
    });
    await old.open();
    await old.table('words').put({ id: 'w1', folderId: 'f', englishTerm: 'apple', favorite: true });
    old.close();

    await db.open();
    expect(db.verno).toBe(3);
    // 真偽値は IndexedDB のキーに使えず検索に効かないので、favorite と [favorite+due] は宣言しない
    expect(db.words.schema.indexes.map((i) => i.name)).toEqual(['folderId', 'due', 'state', '[folderId+due]', '[folderId+state]']);
    // upgrade でのデータ変換は無い。★ はそのまま残る
    expect((await db.words.get('w1'))?.favorite).toBe(true);
  });
});
