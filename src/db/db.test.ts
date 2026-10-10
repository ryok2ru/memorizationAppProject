import { describe, expect, it } from 'vitest';
import Dexie from 'dexie';
import { DB_NAME, db } from './db';

/** v2 の words。favorite と [favorite+due] を宣言していた */
const V2_WORDS = 'id, folderId, due, state, favorite, [folderId+due], [folderId+state], [favorite+due]';

describe('Dexie のスキーマ（4-6、4-7）', () => {
  it('v2 の DB を最新（v7）で開くと、v3 でインデックス宣言だけが減ってレコードは残り、v4 で設定に calendarStartDate = null、v5 でフォルダに英単語・日本語訳の項目名が入り、v6 で画像のテーブル、v7 で関係とノードのテーブルが加わる', async () => {
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
    expect(db.verno).toBe(7);
    // 真偽値は IndexedDB のキーに使えず検索に効かないので、favorite と [favorite+due] は宣言しない
    expect(db.words.schema.indexes.map((i) => i.name)).toEqual(['folderId', 'due', 'state', '[folderId+due]', '[folderId+state]']);
    // upgrade でのデータ変換は無い。★ はそのまま残る
    expect((await db.words.get('w1'))?.favorite).toBe(true);
    // v4: 既存の設定レコードに calendarStartDate = null（全期間）を入れる。他の項目はそのまま
    expect(await db.settings.get('app')).toEqual({ id: 'app', maxCardsPerSession: 40, calendarStartDate: null });
    // v5: 既存のフォルダは英単語帳として作られたので「英単語」「日本語訳」。他の項目はそのまま
    expect(await db.folders.get('f')).toEqual({ id: 'f', name: 'TOEIC', createdAt: 1, sortOrder: 0, frontLabel: '英単語', backLabel: '日本語訳' });
    // v6: 画像のテーブルが空で加わる。主キーは wordId
    expect(db.images.schema.primKey.name).toBe('wordId');
    expect(await db.images.count()).toBe(0);
    // v7: 関係とノードのテーブルが空で加わる。関係は from と to で引く
    expect(db.edges.schema.indexes.map((i) => i.name)).toEqual(['from', 'to']);
    expect(db.nodes.schema.indexes).toEqual([]);
    expect(await db.edges.count()).toBe(0);
    expect(await db.nodes.count()).toBe(0);
  });

  it('v6 の DB を v7 で開くと、空の edges と nodes が加わり、既存のレコードはそのまま残る', async () => {
    db.close();
    await Dexie.delete(DB_NAME);
    const old = new Dexie(DB_NAME);
    old.version(6).stores({
      folders: 'id, sortOrder',
      words: 'id, folderId, due, state, [folderId+due], [folderId+state]',
      reviewLogs: 'id, wordId, review',
      settings: 'id',
      images: 'wordId',
    });
    await old.open();
    const word = { id: 'w1', folderId: 'f', englishTerm: 'apple', favorite: false };
    await old.table('words').put(word);
    await old.table('reviewLogs').put({ id: 'l1', wordId: 'w1', review: 5 });
    old.close();

    await db.open();
    expect(db.verno).toBe(7);
    expect(await db.words.get('w1')).toEqual(word);
    expect(await db.reviewLogs.count()).toBe(1);
    expect(await db.edges.count()).toBe(0);
    expect(await db.nodes.count()).toBe(0);
  });
});
