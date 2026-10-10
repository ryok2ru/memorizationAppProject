import { beforeEach, describe, expect, it } from 'vitest';
import {
  BACKUP_SCHEMA_VERSION,
  BackupFormatError,
  SUPPORTED_SCHEMA_VERSIONS,
  backupFileName,
  base64ToBytes,
  bytesToBase64,
  exportBackup,
  exportResultMessage,
  importBackup,
  parseBackup,
} from './backup';
import { cardToNode, clearAll, createFolder, createWord, getWordImage, readSnapshot, saveRating, saveSettings } from '../db/repo';
import { db } from '../db/db';
import { addRelation } from './relations';
import { rate } from '../domain/fsrs';

const now = new Date(2026, 8, 18, 9, 5, 0).getTime();

describe('backup', () => {
  beforeEach(async () => {
    await clearAll();
  });

  it('round trips export and import', async () => {
    const f = await createFolder('A', now);
    const w = await createWord({ folderId: f.id, englishTerm: 'a', japaneseDefinition: 'あ', memo: 'm' }, now);
    const r = rate(w, 3, now);
    await saveRating(r.word, r.log);
    await saveSettings({ maxCardsPerSession: 40, notifyEnabled: true });
    const before = await readSnapshot();
    const { text, fileName } = await exportBackup(now);
    expect(fileName).toBe('memoraq-backup-20260918-0905.json');
    await clearAll();
    expect((await readSnapshot()).words).toEqual([]);
    const parsed = parseBackup(text);
    expect(parsed.app).toBe('Memoraq');
    expect(parsed.exportedAt).toBe(now);
    await importBackup(parsed);
    const after = await readSnapshot();
    expect(after).toEqual(before);
  });

  it('writes schemaVersion 2 and reads 1 と 2 の両方', async () => {
    const f = await createFolder('A', now);
    await createWord({ folderId: f.id, englishTerm: 'a', japaneseDefinition: 'あ', memo: '' }, now);
    const { text } = await exportBackup(now);
    expect(JSON.parse(text).schemaVersion).toBe(BACKUP_SCHEMA_VERSION);
    expect(BACKUP_SCHEMA_VERSION).toBe(2);
    expect(SUPPORTED_SCHEMA_VERSIONS).toEqual([1, 2]);
  });

  it('favorite が無いレコード（schemaVersion 1 のファイル）は false として読む', () => {
    const v1 = {
      app: 'Memoraq',
      schemaVersion: 1,
      exportedAt: now,
      folders: [{ id: 'f', name: 'A', createdAt: now, sortOrder: 0 }],
      words: [{ id: 'w', folderId: 'f', englishTerm: 'a', japaneseDefinition: 'あ', memo: '', createdAt: now, updatedAt: now }],
      reviewLogs: [],
    };
    const parsed = parseBackup(JSON.stringify(v1));
    expect(parsed.words[0].favorite).toBe(false);
    // 読み込んだ結果は現在のスキーマとして扱う
    expect(parsed.schemaVersion).toBe(2);
    expect(parsed.settings.schemaVersion).toBe(2);

    const kept = { ...v1, schemaVersion: 2, words: [{ ...v1.words[0], favorite: true }] };
    expect(parseBackup(JSON.stringify(kept)).words[0].favorite).toBe(true);
  });

  it('項目名が無いフォルダは英単語・日本語訳として読み、あればそのまま（4-2、10-2）', () => {
    const file = {
      app: 'Memoraq',
      schemaVersion: 2,
      exportedAt: now,
      folders: [
        { id: 'f', name: 'A', createdAt: now, sortOrder: 0 },
        { id: 'g', name: 'B', createdAt: now, sortOrder: 1, frontLabel: '用語', backLabel: '説明' },
      ],
      words: [],
      reviewLogs: [],
    };
    const parsed = parseBackup(JSON.stringify(file));
    expect(parsed.folders.map((f) => [f.frontLabel, f.backLabel])).toEqual([
      ['英単語', '日本語訳'],
      ['用語', '説明'],
    ]);
  });

  it('calendarStartDate は書き出しと読み込みで保たれ、無いファイルは null として読む（10-2）', async () => {
    const start = new Date(2026, 8, 10, 15, 0).getTime();
    await saveSettings({ calendarStartDate: start });
    const { text } = await exportBackup(now);
    expect(parseBackup(text).settings.calendarStartDate).toBe(start);

    const old = JSON.parse(text);
    delete old.settings.calendarStartDate;
    expect(parseBackup(JSON.stringify(old)).settings.calendarStartDate).toBeNull();
    // settings 自体が無いファイルも null
    delete old.settings;
    expect(parseBackup(JSON.stringify(old)).settings.calendarStartDate).toBeNull();
  });

  it('rejects wrong app or schemaVersion or invalid JSON', () => {
    expect(() => parseBackup('{')).toThrow(BackupFormatError);
    expect(() => parseBackup(JSON.stringify({ app: 'Other', schemaVersion: 2, folders: [], words: [], reviewLogs: [] }))).toThrow(
      BackupFormatError,
    );
    // 旧名のファイルも読まない（改名前のバックアップは無い）
    expect(() => parseBackup(JSON.stringify({ app: 'VocaVault', schemaVersion: 2, folders: [], words: [], reviewLogs: [] }))).toThrow(
      BackupFormatError,
    );
    // 知らないバージョンは読まない
    expect(() => parseBackup(JSON.stringify({ app: 'Memoraq', schemaVersion: 3, folders: [], words: [], reviewLogs: [] }))).toThrow(
      BackupFormatError,
    );
    expect(() => parseBackup(JSON.stringify({ app: 'Memoraq', schemaVersion: 2, folders: [] }))).toThrow(BackupFormatError);
    expect(() => parseBackup(JSON.stringify({ app: 'Memoraq', schemaVersion: 2, folders: [], words: [], reviewLogs: [] }))).not.toThrow();
    expect(backupFileName(new Date(2026, 0, 1, 0, 0).getTime())).toBe('memoraq-backup-20260101-0000.json');
  });
});

describe('画像のバックアップ（4-8、10-2）', () => {
  beforeEach(async () => {
    await clearAll();
  });

  const fileWith = (images: unknown) =>
    JSON.stringify({
      app: 'Memoraq',
      schemaVersion: 2,
      folders: [{ id: 'f', name: 'A', createdAt: now, sortOrder: 0 }],
      words: [{ id: 'w', folderId: 'f', englishTerm: 'a', japaneseDefinition: 'あ', memo: '', createdAt: now, updatedAt: now }],
      reviewLogs: [],
      images,
    });

  it('base64 の変換が往復する（区切りの 32KB をまたぐ長さを含む）', () => {
    const src = new Uint8Array(70000).map((_, i) => (i * 7) % 256);
    expect([...new Uint8Array(base64ToBytes(bytesToBase64(src.buffer)))]).toEqual([...src]);
    expect(bytesToBase64(new Uint8Array([0, 255]).buffer)).toBe('AP8=');
  });

  it('画像を base64 で書き出し、読み込むとバイト列と表示する面が戻る', async () => {
    const f = await createFolder('A', now);
    const w = await createWord({ folderId: f.id, englishTerm: 'a', japaneseDefinition: 'あ', memo: '' }, now, {
      data: new Uint8Array([1, 2, 250]).buffer,
      type: 'image/jpeg',
      side: 'front',
    });
    const { text } = await exportBackup(now);
    expect(JSON.parse(text).images).toEqual([{ wordId: w.id, type: 'image/jpeg', side: 'front', updatedAt: now, data: 'AQL6' }]);
    await clearAll();
    await importBackup(parseBackup(text));
    const img = await getWordImage(w.id);
    expect(img?.side).toBe('front');
    expect([...new Uint8Array(img!.data)]).toEqual([1, 2, 250]);
  });

  it('画像の無いファイルは画像なしで読み、schemaVersion は 2 のまま', () => {
    const parsed = parseBackup(fileWith(undefined));
    expect(parsed.images).toEqual([]);
    expect(parsed.schemaVersion).toBe(2);
  });

  it('存在しない単語の画像は捨て、表示する面が不正なら裏、type が不正なら image/jpeg として読む', () => {
    const parsed = parseBackup(
      fileWith([
        { wordId: 'w', type: 'text/html', side: 'x', updatedAt: 1, data: 'AQL6' },
        { wordId: 'gone', type: 'image/jpeg', side: 'front', updatedAt: 1, data: 'AQL6' },
      ]),
    );
    expect(parsed.images).toEqual([{ wordId: 'w', type: 'image/jpeg', side: 'back', updatedAt: 1, data: 'AQL6' }]);
  });

  it('画像の形が不正なファイルは読まない', () => {
    expect(() => parseBackup(fileWith('x'))).toThrow(BackupFormatError);
    expect(() => parseBackup(fileWith([null]))).toThrow(BackupFormatError);
    expect(() => parseBackup(fileWith([{ wordId: 'w', side: 'back' }]))).toThrow(BackupFormatError);
    expect(() => parseBackup(fileWith([{ wordId: 'w', side: 'back', data: '<not base64>' }]))).toThrow(BackupFormatError);
  });
});

describe('関係とノードのバックアップ（10-2）', () => {
  beforeEach(async () => {
    await clearAll();
  });

  const base = {
    app: 'Memoraq',
    schemaVersion: 2,
    exportedAt: now,
    folders: [{ id: 'f', name: 'A', frontLabel: '表', backLabel: '裏', createdAt: now, sortOrder: 0 }],
    words: [{ id: 'w', folderId: 'f', englishTerm: 'a', japaneseDefinition: 'あ', memo: '', createdAt: now, updatedAt: now }],
    reviewLogs: [],
  };
  const file = (extra: object) => JSON.stringify({ ...base, ...extra });

  it('関係とノード（ノードに戻したカードの画像を含む）が往復する', async () => {
    const f = await createFolder('A', now);
    const a = await createWord({ folderId: f.id, englishTerm: 'a', japaneseDefinition: 'あ', memo: '' }, now);
    const b = await createWord({ folderId: f.id, englishTerm: 'b', japaneseDefinition: 'い', memo: '' }, now);
    await addRelation(a.id, 'links', { id: b.id }, { dir: 'out', label: '対義' }, now);
    await addRelation(a.id, 'parents', { newNodeName: '上' }, undefined, now);
    await db.images.put({ wordId: b.id, data: new Uint8Array([1, 2]).buffer, type: 'image/jpeg', side: 'back', updatedAt: now });
    await cardToNode(b.id, now);
    const before = await readSnapshot();
    const { text } = await exportBackup(now);
    await clearAll();
    await importBackup(parseBackup(text));
    const after = await readSnapshot();
    expect(after.edges).toEqual(before.edges);
    expect(after.nodes).toEqual(before.nodes);
    expect(after.nodes).toHaveLength(2);
    expect(await getWordImage(b.id)).toBeDefined();
  });

  it('edges・nodes の無いファイルは関係なしで読む', () => {
    const parsed = parseBackup(file({}));
    expect(parsed.edges).toEqual([]);
    expect(parsed.nodes).toEqual([]);
    expect(parsed.schemaVersion).toBe(2);
  });

  it('端の欠けた関係と、関係のなくなったノードを捨てる。label と directed は既定で補う', () => {
    const parsed = parseBackup(
      file({
        nodes: [
          { id: 'n1', name: 'keep', createdAt: 1, updatedAt: 1 },
          { id: 'n2', name: 'lonely', createdAt: 1, updatedAt: 1, saved: null },
        ],
        edges: [
          { id: 'e1', kind: 'link', from: 'w', to: 'n1' },
          { id: 'e2', kind: 'hierarchy', from: 'n2', to: 'gone', createdAt: 1 },
        ],
        images: [{ wordId: 'n2', type: 'image/jpeg', side: 'back', updatedAt: 1, data: 'AQL6' }],
      }),
    );
    expect(parsed.edges).toEqual([{ id: 'e1', kind: 'link', from: 'w', to: 'n1', directed: false, label: '', createdAt: 0 }]);
    expect(parsed.nodes).toEqual([{ id: 'n1', name: 'keep', createdAt: 1, updatedAt: 1, saved: null }]);
    // 捨てたノードの画像も捨てる
    expect(parsed.images).toEqual([]);
  });

  it('形の不正な edges・nodes を拒否する', () => {
    expect(() => parseBackup(file({ edges: {} }))).toThrow(BackupFormatError);
    expect(() => parseBackup(file({ nodes: 'x' }))).toThrow(BackupFormatError);
    expect(() => parseBackup(file({ edges: [{ id: 'e', from: 'w' }] }))).toThrow(BackupFormatError);
    expect(() => parseBackup(file({ nodes: [{ id: 'n' }] }))).toThrow(BackupFormatError);
  });
});

describe('exportResultMessage', () => {
  it('共有シートで完了したときとダウンロードしたときはファイル名を出す', () => {
    expect(exportResultMessage('shared', 'memoraq-backup-20260918-0905.json')).toBe('memoraq-backup-20260918-0905.json を書き出しました');
    expect(exportResultMessage('downloaded', 'a.json')).toBe('a.json を書き出しました');
  });

  it('共有シートを閉じただけのときは何も出さない', () => {
    expect(exportResultMessage('cancelled', 'a.json')).toBeNull();
  });
});
