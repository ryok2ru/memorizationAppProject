import { beforeEach, describe, expect, it } from 'vitest';
import { BackupFormatError, backupFileName, exportBackup, importBackup, parseBackup } from './backup';
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

  it('rejects wrong app or schemaVersion or invalid JSON', () => {
    expect(() => parseBackup('{')).toThrow(BackupFormatError);
    expect(() => parseBackup(JSON.stringify({ app: 'Other', schemaVersion: 1, folders: [], words: [], reviewLogs: [] }))).toThrow(
      BackupFormatError,
    );
    expect(() => parseBackup(JSON.stringify({ app: 'VocaVault', schemaVersion: 2, folders: [], words: [], reviewLogs: [] }))).toThrow(
      BackupFormatError,
    );
    expect(() => parseBackup(JSON.stringify({ app: 'VocaVault', schemaVersion: 1, folders: [] }))).toThrow(BackupFormatError);
    expect(() => parseBackup(JSON.stringify({ app: 'VocaVault', schemaVersion: 1, folders: [], words: [], reviewLogs: [] }))).not.toThrow();
    expect(backupFileName(new Date(2026, 0, 1, 0, 0).getTime())).toBe('vocavault-backup-20260101-0000.json');
  });
});
