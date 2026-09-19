import { beforeEach, describe, expect, it } from 'vitest';
import {
  BACKUP_SCHEMA_VERSION,
  BackupFormatError,
  SUPPORTED_SCHEMA_VERSIONS,
  backupFileName,
  exportBackup,
  importBackup,
  parseBackup,
} from './backup';
import { clearAll, createFolder, createWord, readSnapshot, saveRating, saveSettings } from '../db/repo';
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
    expect(fileName).toBe('vocavault-backup-20260918-0905.json');
    await clearAll();
    expect((await readSnapshot()).words).toEqual([]);
    const parsed = parseBackup(text);
    expect(parsed.app).toBe('VocaVault');
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
      app: 'VocaVault',
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

  it('rejects wrong app or schemaVersion or invalid JSON', () => {
    expect(() => parseBackup('{')).toThrow(BackupFormatError);
    expect(() => parseBackup(JSON.stringify({ app: 'Other', schemaVersion: 2, folders: [], words: [], reviewLogs: [] }))).toThrow(
      BackupFormatError,
    );
    // 知らないバージョンは読まない
    expect(() => parseBackup(JSON.stringify({ app: 'VocaVault', schemaVersion: 3, folders: [], words: [], reviewLogs: [] }))).toThrow(
      BackupFormatError,
    );
    expect(() => parseBackup(JSON.stringify({ app: 'VocaVault', schemaVersion: 2, folders: [] }))).toThrow(BackupFormatError);
    expect(() => parseBackup(JSON.stringify({ app: 'VocaVault', schemaVersion: 2, folders: [], words: [], reviewLogs: [] }))).not.toThrow();
    expect(backupFileName(new Date(2026, 0, 1, 0, 0).getTime())).toBe('vocavault-backup-20260101-0000.json');
  });
});
