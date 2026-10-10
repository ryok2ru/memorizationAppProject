import type { Folder, Word, ReviewLog, Settings, WordImage, ImageSide, Edge, NodeItem } from '../domain/types';
import { DEFAULT_SETTINGS } from '../domain/types';
import { LEGACY_LABELS } from '../domain/labels';
import { readSnapshot, replaceAll, type Snapshot } from '../db/repo';

export interface Backup {
  app: 'Memoraq';
  /** 書き出しは常に BACKUP_SCHEMA_VERSION。読み込みは SUPPORTED_SCHEMA_VERSIONS を受け付ける（10-2） */
  schemaVersion: number;
  exportedAt: number;
  folders: Folder[];
  words: Word[];
  reviewLogs: ReviewLog[];
  settings: Settings;
  /** カードの画像（4-8）。無いファイル（画像を持つ前に書き出したもの）は空として読む */
  images?: BackupImage[];
  /** 関係（4-9）。無いファイル（関係を持つ前に書き出したもの）は関係なしとして読む */
  edges?: Edge[];
  /** ノード（4-10）。無いファイルはノードなしとして読む */
  nodes?: NodeItem[];
}

/** バックアップ JSON の中の画像。バイト列は base64 の文字列にする（10-2） */
export interface BackupImage {
  wordId: string;
  type: string;
  side: ImageSide;
  updatedAt: number;
  /** 画像のバイト列の base64（data: の接頭辞は付けない） */
  data: string;
}

const B64_CHUNK = 0x8000;

export function bytesToBase64(data: ArrayBuffer): string {
  const bytes = new Uint8Array(data);
  let bin = '';
  for (let i = 0; i < bytes.length; i += B64_CHUNK) bin += String.fromCharCode(...bytes.subarray(i, i + B64_CHUNK));
  return btoa(bin);
}

export function base64ToBytes(b64: string): ArrayBuffer {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
}

const toBackupImage = (img: WordImage): BackupImage => ({
  wordId: img.wordId,
  type: img.type,
  side: img.side,
  updatedAt: img.updatedAt,
  data: bytesToBase64(img.data),
});

const fromBackupImage = (img: BackupImage): WordImage => ({
  wordId: img.wordId,
  type: img.type,
  side: img.side,
  updatedAt: img.updatedAt,
  data: base64ToBytes(img.data),
});

const BASE64_RE = /^[A-Za-z0-9+/]*={0,2}$/;

/**
 * 読み込んだ画像を検証する（10-2）。形が不正なら BackupFormatError。
 * 表示する面が無い・不正なら裏（既定）として読み、words にも nodes にも無い id の画像は捨てる
 * （ノードに戻したカードの画像はノードの id で残っている。4-8、4-12）
 */
function parseImages(raw: unknown, itemIds: Set<string>): BackupImage[] {
  if (raw === undefined) return [];
  if (!Array.isArray(raw)) throw new BackupFormatError();
  const result: BackupImage[] = [];
  for (const item of raw as Partial<BackupImage>[]) {
    if (typeof item !== 'object' || item === null) throw new BackupFormatError();
    if (typeof item.wordId !== 'string' || typeof item.data !== 'string' || !BASE64_RE.test(item.data)) throw new BackupFormatError();
    if (!itemIds.has(item.wordId)) continue;
    result.push({
      wordId: item.wordId,
      type: typeof item.type === 'string' && item.type.startsWith('image/') ? item.type : 'image/jpeg',
      side: item.side === 'front' ? 'front' : 'back',
      updatedAt: typeof item.updatedAt === 'number' ? item.updatedAt : 0,
      data: item.data,
    });
  }
  return result;
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;

/** 読み込んだノードを検証する（10-2）。形が不正なら BackupFormatError。saved が無ければ null */
function parseNodes(raw: unknown): NodeItem[] {
  if (raw === undefined) return [];
  if (!Array.isArray(raw)) throw new BackupFormatError();
  return raw.map((n: unknown) => {
    if (!isObject(n) || typeof n.id !== 'string' || typeof n.name !== 'string') throw new BackupFormatError();
    return {
      id: n.id,
      name: n.name,
      createdAt: typeof n.createdAt === 'number' ? n.createdAt : 0,
      updatedAt: typeof n.updatedAt === 'number' ? n.updatedAt : 0,
      saved: isObject(n.saved) ? (n.saved as unknown as NodeItem['saved']) : null,
    };
  });
}

/** 読み込んだ関係を検証する（10-2）。形が不正なら BackupFormatError。label が無ければ空文字、directed が無ければ false */
function parseEdges(raw: unknown): Edge[] {
  if (raw === undefined) return [];
  if (!Array.isArray(raw)) throw new BackupFormatError();
  return raw.map((e: unknown) => {
    if (!isObject(e) || typeof e.id !== 'string' || typeof e.from !== 'string' || typeof e.to !== 'string') throw new BackupFormatError();
    const kind = e.kind === 'link' ? 'link' : 'hierarchy';
    return {
      id: e.id,
      kind,
      from: e.from,
      to: e.to,
      directed: kind === 'link' && e.directed === true,
      label: kind === 'link' && typeof e.label === 'string' ? e.label : '',
      createdAt: typeof e.createdAt === 'number' ? e.createdAt : 0,
    };
  });
}

/**
 * 関係とノードの整合を取る（10-2、4-11）。端の項目が words にも nodes にも無い関係を捨て、
 * その後で関係が 1 つも無いノードを捨てる（孤立ノードを残さない）
 */
export function pruneRelations(wordIds: Set<string>, nodes: NodeItem[], edges: Edge[]): { nodes: NodeItem[]; edges: Edge[] } {
  const nodeIds = new Set(nodes.map((n) => n.id));
  const exists = (id: string) => wordIds.has(id) || nodeIds.has(id);
  const kept = edges.filter((e) => exists(e.from) && exists(e.to));
  const linked = new Set(kept.flatMap((e) => [e.from, e.to]));
  return { edges: kept, nodes: nodes.filter((n) => linked.has(n.id)) };
}

/** 書き出す schemaVersion。Dexie のバージョンと同じ番号（4-7） */
export const BACKUP_SCHEMA_VERSION = 2;

/** 読み込めるバージョン。1 は favorite が無いので false として扱う */
export const SUPPORTED_SCHEMA_VERSIONS: readonly number[] = [1, 2];

export function buildBackup(snapshot: Snapshot, now = Date.now()): Backup {
  return {
    app: 'Memoraq',
    schemaVersion: BACKUP_SCHEMA_VERSION,
    exportedAt: now,
    folders: snapshot.folders,
    words: snapshot.words,
    reviewLogs: snapshot.reviewLogs,
    settings: snapshot.settings,
    images: snapshot.images.map(toBackupImage),
    edges: snapshot.edges,
    nodes: snapshot.nodes,
  };
}

const pad2 = (n: number) => String(n).padStart(2, '0');

export function backupFileName(now = Date.now()): string {
  const d = new Date(now);
  return `memoraq-backup-${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}-${pad2(d.getHours())}${pad2(d.getMinutes())}.json`;
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
  if (b.app !== 'Memoraq' || typeof b.schemaVersion !== 'number' || !SUPPORTED_SCHEMA_VERSIONS.includes(b.schemaVersion)) {
    throw new BackupFormatError();
  }
  if (!Array.isArray(b.folders) || !Array.isArray(b.words) || !Array.isArray(b.reviewLogs)) throw new BackupFormatError();
  const merged: Settings = { ...DEFAULT_SETTINGS, ...(b.settings ?? {}), id: 'app', schemaVersion: BACKUP_SCHEMA_VERSION };
  // calendarStartDate が無い（または数値でない）ファイルは null（全期間）として読む（4-5、10-2）
  const settings: Settings = { ...merged, calendarStartDate: typeof merged.calendarStartDate === 'number' ? merged.calendarStartDate : null };
  // 関係とノードが無いファイルは関係なしとして読む。端の欠けた関係と、関係のなくなったノードは捨てる（4-11、10-2）
  const wordIds = new Set(b.words.map((w) => w?.id));
  const relations = pruneRelations(wordIds, parseNodes(b.nodes), parseEdges(b.edges));
  const itemIds = new Set([...wordIds, ...relations.nodes.map((n) => n.id)]);
  return {
    app: 'Memoraq',
    schemaVersion: BACKUP_SCHEMA_VERSION,
    exportedAt: typeof b.exportedAt === 'number' ? b.exportedAt : 0,
    // 項目名が無いフォルダ（v5 より前に書き出したファイル）は英単語帳として作られたので「英単語」「日本語訳」で読む（4-2、10-2）
    folders: b.folders.map((f) => ({
      ...f,
      frontLabel: typeof f?.frontLabel === 'string' && f.frontLabel.trim() ? f.frontLabel : LEGACY_LABELS.front,
      backLabel: typeof f?.backLabel === 'string' && f.backLabel.trim() ? f.backLabel : LEGACY_LABELS.back,
    })),
    // favorite が無いレコード（schemaVersion 1 のファイル）は false として読む（4-3、10-2）
    words: b.words.map((w) => ({ ...w, favorite: w?.favorite === true })),
    reviewLogs: b.reviewLogs,
    settings,
    // 画像が無いファイルは画像なしとして読む。schemaVersion は上げない（4-7、10-2）
    images: parseImages(b.images, itemIds),
    edges: relations.edges,
    nodes: relations.nodes,
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
    images: (backup.images ?? []).map(fromBackupImage),
    edges: backup.edges ?? [],
    nodes: backup.nodes ?? [],
  });
}

/** 書き出しの結果。shared = 共有シートで何かを選んで完了、cancelled = 共有シートを閉じた、downloaded = <a download> で保存 */
export type SaveResult = 'shared' | 'cancelled' | 'downloaded';

/** 共有シートか <a download> で保存する（10-2） */
export async function saveBackupFile(text: string, fileName: string): Promise<SaveResult> {
  const file = new File([text], fileName, { type: 'application/json' });
  const nav = navigator as Navigator & {
    canShare?: (data: ShareData) => boolean;
    share?: (data: ShareData) => Promise<void>;
  };
  if (nav.canShare?.({ files: [file] }) && nav.share) {
    try {
      await nav.share({ files: [file], title: fileName });
      return 'shared';
    } catch (e) {
      if ((e as { name?: string }).name === 'AbortError') return 'cancelled';
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
  return 'downloaded';
}

/** 書き出し後に設定画面に出す文（10-2）。共有シートを閉じただけのときは何も出さない */
export function exportResultMessage(result: SaveResult, fileName: string): string | null {
  if (result === 'cancelled') return null;
  return `${fileName} を書き出しました`;
}
