import { describe, expect, it } from 'vitest';
import Dexie from 'dexie';
import { DB_NAME, db } from './db';

/** v2 の words。favorite と [favorite+due] を宣言していた */
const V2_WORDS = 'id, folderId, due, state, favorite, [folderId+due], [folderId+state], [favorite+due]';

describe('Dexie のスキーマ（4-6、4-7）', () => {
  it('v2 の DB を v5 で開くと、v3 でインデックス宣言だけが減ってレコードは残り、v4 で設定に calendarStartDate = null、v5 でフォルダに英単語・日本語訳の項目名が入る', async () => {
    const old = new Dexie(DB_NAME);
    old.version(2).stores({
      folders: 'id, sortOrder',
      words: V2_WORDS,
      reviewLogs: 'id, wordId, review',
      settings: 'id',
    });
    await old.open();
    await old.table('folders').put({ id: 'f', name: 'TOEIC', createdAt: 1, sortOrder: 0 });
    await old.table('words').put({ id: 'w1', folderId: 'f', englishTerm: 'apple', favorite: true });
    await old.table('settings').put({ id: 'app', maxCardsPerSession: 40 });
    old.close();

    await db.open();
    expect(db.verno).toBe(5);
    // 真偽値は IndexedDB のキーに使えず検索に効かないので、favorite と [favorite+due] は宣言しない
    expect(db.words.schema.indexes.map((i) => i.name)).toEqual(['folderId', 'due', 'state', '[folderId+due]', '[folderId+state]']);
    // upgrade でのデータ変換は無い。★ はそのまま残る
    expect((await db.words.get('w1'))?.favorite).toBe(true);
    // v4: 既存の設定レコードに calendarStartDate = null（全期間）を入れる。他の項目はそのまま
    expect(await db.settings.get('app')).toEqual({ id: 'app', maxCardsPerSession: 40, calendarStartDate: null });
    // v5: 既存のフォルダは英単語帳として作られたので「英単語」「日本語訳」。他の項目はそのまま
    expect(await db.folders.get('f')).toEqual({ id: 'f', name: 'TOEIC', createdAt: 1, sortOrder: 0, frontLabel: '英単語', backLabel: '日本語訳' });
  });
});
