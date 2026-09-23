import type { Folder, Word, ReviewLog, Settings } from '../domain/types';
import { DEFAULT_SETTINGS } from '../domain/types';
import { readSnapshot, replaceAll, type Snapshot } from '../db/repo';

export interface Backup {
  app: 'VocaVault';
  /** 書き出しは常に BACKUP_SCHEMA_VERSION。読み込みは SUPPORTED_SCHEMA_VERSIONS を受け付ける（10-2） */
  schemaVersion: number;
  exportedAt: number;
  folders: Folder[];
  words: Word[];
  reviewLogs: ReviewLog[];
  settings: Settings;
}

/** 書き出す schemaVersion。Dexie のバージョンと同じ番号（4-7） */
export const BACKUP_SCHEMA_VERSION = 2;

/** 読み込めるバージョン。1 は favorite が無いので false として扱う */
export const SUPPORTED_SCHEMA_VERSIONS: readonly number[] = [1, 2];

export function buildBackup(snapshot: Snapshot, now = Date.now()): Backup {
  return {
    app: 'VocaVault',
    schemaVersion: BACKUP_SCHEMA_VERSION,
    exportedAt: now,
    folders: snapshot.folders,
    words: snapshot.words,
    reviewLogs: snapshot.reviewLogs,
    settings: snapshot.settings,
  };
}

const pad2 = (n: number) => String(n).padStart(2, '0');

export function backupFileName(now = Date.now()): string {
  const d = new Date(now);
  return `vocavault-backup-${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}-${pad2(d.getHours())}${pad2(d.getMinutes())}.json`;
}

export class BackupFormatError extends Error {
  constructor() {
    super('このファイルは読み込めません');
    this.name = 'BackupFormatError';
  }
}

/** JSON 文字列を検証して Backup を返す。不正なら BackupFormatError */
export function parseBackup(text: string): Backup {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new BackupFormatError();
  }
  if (typeof data !== 'object' || data === null) throw new BackupFormatError();
  const b = data as Partial<Backup>;
  if (b.app !== 'VocaVault' || typeof b.schemaVersion !== 'number' || !SUPPORTED_SCHEMA_VERSIONS.includes(b.schemaVersion)) {
    throw new BackupFormatError();
  }
  if (!Array.isArray(b.folders) || !Array.isArray(b.words) || !Array.isArray(b.reviewLogs)) throw new BackupFormatError();
  const merged: Settings = { ...DEFAULT_SETTINGS, ...(b.settings ?? {}), id: 'app', schemaVersion: BACKUP_SCHEMA_VERSION };
  // calendarStartDate が無い（または数値でない）ファイルは null（全期間）として読む（4-5、10-2）
  const settings: Settings = { ...merged, calendarStartDate: typeof merged.calendarStartDate === 'number' ? merged.calendarStartDate : null };
  return {
    app: 'VocaVault',
    schemaVersion: BACKUP_SCHEMA_VERSION,
    exportedAt: typeof b.exportedAt === 'number' ? b.exportedAt : 0,
    folders: b.folders,
    // favorite が無いレコード（schemaVersion 1 のファイル）は false として読む（4-3、10-2）
    words: b.words.map((w) => ({ ...w, favorite: w?.favorite === true })),
    reviewLogs: b.reviewLogs,
    settings,
  };
}

export async function exportBackup(now = Date.now()): Promise<{ text: string; fileName: string }> {
  const backup = buildBackup(await readSnapshot(), now);
  return { text: JSON.stringify(backup), fileName: backupFileName(now) };
}

export async function importBackup(backup: Backup): Promise<void> {
  await replaceAll({
    folders: backup.folders,
    words: backup.words,
    reviewLogs: backup.reviewLogs,
    settings: backup.settings,
  });
}

/** 共有シートか <a download> で保存する（10-2） */
export async function saveBackupFile(text: string, fileName: string): Promise<'share' | 'download'> {
  const file = new File([text], fileName, { type: 'application/json' });
  const nav = navigator as Navigator & {
    canShare?: (data: ShareData) => boolean;
    share?: (data: ShareData) => Promise<void>;
  };
  if (nav.canShare?.({ files: [file] }) && nav.share) {
    try {
      await nav.share({ files: [file], title: fileName });
      return 'share';
    } catch (e) {
      if ((e as { name?: string }).name === 'AbortError') return 'share';
      // 共有に失敗したらダウンロードにフォールバック
    }
  }
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return 'download';
}
