import Dexie from 'dexie';
import { db } from './db';
import type { Folder, Word, ReviewLog, Settings, CardState, FsrsFields } from '../domain/types';
import { DEFAULT_SETTINGS } from '../domain/types';
import { newCardFields, FSRS_KEYS } from '../domain/fsrs';
import { endOfDay } from '../domain/dates';

const uuid = () => crypto.randomUUID();

/** Word に FSRS 項目が欠けていれば補う（10-4） */
export function ensureFsrsFields(word: Word, now: number): Word {
  const missing = FSRS_KEYS.filter((k) => !(k in word) || (k !== 'last_review' && word[k] == null));
  if (missing.length === 0) return word;
  console.warn(`word ${word.id} is missing FSRS fields: ${missing.join(', ')}`);
  return { ...newCardFields(now), ...word, ...Object.fromEntries(missing.map((k) => [k, newCardFields(now)[k]])) } as Word;
}

const withFsrs = (words: Word[], now = Date.now()) => words.map((w) => ensureFsrsFields(w, now));

// ---------- folders ----------

export async function listFolders(): Promise<Folder[]> {
  return db.folders.orderBy('sortOrder').toArray();
}

export async function getFolder(id: string): Promise<Folder | undefined> {
  return db.folders.get(id);
}

export async function createFolder(name: string, now = Date.now()): Promise<Folder> {
  return db.transaction('rw', db.folders, async () => {
    const last = await db.folders.orderBy('sortOrder').last();
    const folder: Folder = {
      id: uuid(),
      name: name.trim(),
      createdAt: now,
      sortOrder: last ? last.sortOrder + 1 : 0,
    };
    await db.folders.add(folder);
    return folder;
  });
}

export async function renameFolder(id: string, name: string): Promise<void> {
  await db.folders.update(id, { name: name.trim() });
}

/** フォルダと配下の単語、その履歴を削除 */
export async function deleteFolder(id: string): Promise<void> {
  await db.transaction('rw', db.folders, db.words, db.reviewLogs, async () => {
    const wordIds = await db.words.where('folderId').equals(id).primaryKeys();
    if (wordIds.length > 0) {
      await db.reviewLogs.where('wordId').anyOf(wordIds).delete();
      await db.words.bulkDelete(wordIds);
    }
    await db.folders.delete(id);
  });
}

// ---------- words ----------

export async function listWordsInFolder(folderId: string): Promise<Word[]> {
  return withFsrs(await db.words.where('folderId').equals(folderId).toArray());
}

export async function listAllWords(): Promise<Word[]> {
  return withFsrs(await db.words.toArray());
}

export async function getWord(id: string): Promise<Word | undefined> {
  const w = await db.words.get(id);
  return w ? ensureFsrsFields(w, Date.now()) : undefined;
}

export async function getWords(ids: string[]): Promise<Map<string, Word>> {
  const rows = await db.words.bulkGet(ids);
  const map = new Map<string, Word>();
  const now = Date.now();
  rows.forEach((w) => {
    if (w) map.set(w.id, ensureFsrsFields(w, now));
  });
  return map;
}

export interface NewWordInput {
  folderId: string;
  englishTerm: string;
  japaneseDefinition: string;
  memo: string;
}

export function buildNewWord(input: NewWordInput, now = Date.now()): Word {
  return {
    id: uuid(),
    folderId: input.folderId,
    englishTerm: input.englishTerm,
    japaneseDefinition: input.japaneseDefinition,
    memo: input.memo,
    createdAt: now,
    updatedAt: now,
    ...newCardFields(now),
  };
}

export async function createWord(input: NewWordInput, now = Date.now()): Promise<Word> {
  const word = buildNewWord(input, now);
  await db.words.add(word);
  return word;
}

export async function bulkAddWords(words: Word[]): Promise<void> {
  await db.transaction('rw', db.words, async () => {
    await db.words.bulkAdd(words);
  });
}

/** 単語フォームの保存。本文と、指定があれば所属フォルダ（7-4）を更新する。FSRS 項目は変えない */
export async function updateWordText(
  id: string,
  input: { englishTerm: string; japaneseDefinition: string; memo: string; folderId?: string },
  now = Date.now(),
): Promise<void> {
  await db.words.update(id, { ...input, updatedAt: now });
}

/** 複数の単語を別のフォルダへ移動（7-3）。folderId と updatedAt だけを 1 トランザクションで更新し、FSRS 項目と ReviewLog は変えない */
export async function moveWords(ids: string[], folderId: string, now = Date.now()): Promise<number> {
  if (ids.length === 0) return 0;
  return db.transaction('rw', db.words, async () => db.words.where('id').anyOf(ids).modify({ folderId, updatedAt: now }));
}

/** 単語と ReviewLog を削除 */
export async function deleteWord(id: string): Promise<void> {
  await deleteWords([id]);
}

/** 複数の単語と ReviewLog を 1 トランザクションで削除 */
export async function deleteWords(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  await db.transaction('rw', db.words, db.reviewLogs, async () => {
    await db.reviewLogs.where('wordId').anyOf(ids).delete();
    await db.words.bulkDelete(ids);
  });
}

/** 評価結果の保存。Word の更新と ReviewLog の追加を 1 トランザクションで行う */
export async function saveRating(word: Word, log: ReviewLog): Promise<void> {
  await db.transaction('rw', db.words, db.reviewLogs, async () => {
    await db.words.put(word);
    await db.reviewLogs.add(log);
  });
}

/**
 * 評価の取り消し（6-3）。Word の FSRS 項目を評価前の値に戻し、その評価で追加した ReviewLog を削除する。
 * 1 トランザクションで行う。単語がすでに無ければ FSRS 項目の書き戻しは何もしない。
 */
export async function revertRating(wordId: string, before: FsrsFields, logId: string): Promise<void> {
  await db.transaction('rw', db.words, db.reviewLogs, async () => {
    await db.words.update(wordId, { ...before });
    await db.reviewLogs.delete(logId);
  });
}

// ---------- queries ----------

/** 復習対象: state ≠ 0 かつ due ≤ 今日の終わり。due 昇順 */
export async function listDueWords(folderId: string | null, now = Date.now()): Promise<Word[]> {
  const end = endOfDay(now);
  const rows =
    folderId == null
      ? await db.words.where('due').belowOrEqual(end).toArray()
      : await db.words.where('[folderId+due]').between([folderId, Dexie.minKey], [folderId, end], true, true).toArray();
  return withFsrs(rows, now)
    .filter((w) => w.state !== 0)
    .sort((a, b) => a.due - b.due || a.createdAt - b.createdAt);
}

/** New: state = 0。createdAt 昇順 */
export async function listNewWords(folderId: string | null, now = Date.now()): Promise<Word[]> {
  const rows =
    folderId == null
      ? await db.words.where('state').equals(0).toArray()
      : await db.words.where('[folderId+state]').equals([folderId, 0]).toArray();
  return withFsrs(rows, now).sort((a, b) => a.createdAt - b.createdAt);
}

export async function countDueWords(folderId: string | null, now = Date.now()): Promise<number> {
  return (await listDueWords(folderId, now)).length;
}

export async function countNewWords(folderId: string | null): Promise<number> {
  return folderId == null
    ? db.words.where('state').equals(0).count()
    : db.words.where('[folderId+state]').equals([folderId, 0]).count();
}

export async function countWordsInFolder(folderId: string): Promise<number> {
  return db.words.where('folderId').equals(folderId).count();
}

export async function countByState(folderId: string | null): Promise<Record<CardState, number>> {
  const result: Record<CardState, number> = { 0: 0, 1: 0, 2: 0, 3: 0 };
  const rows = folderId == null ? await db.words.toArray() : await db.words.where('folderId').equals(folderId).toArray();
  for (const w of withFsrs(rows)) result[w.state] += 1;
  return result;
}

/** ストリーク用: review のミリ秒だけを全件読む */
export async function listReviewTimes(): Promise<number[]> {
  return db.reviewLogs.orderBy('review').keys() as Promise<number[]>;
}

export async function listReviewLogsForWord(wordId: string): Promise<ReviewLog[]> {
  return db.reviewLogs.where('wordId').equals(wordId).toArray();
}

// ---------- progress reset ----------

/** 進捗リセット。folderId が null なら全単語。ReviewLog は削除しない */
export async function resetProgress(folderId: string | null, now = Date.now()): Promise<number> {
  return db.transaction('rw', db.words, async () => {
    const coll = folderId == null ? db.words.toCollection() : db.words.where('folderId').equals(folderId);
    const fields = newCardFields(now);
    return coll.modify((w) => {
      Object.assign(w, fields, { updatedAt: now });
    });
  });
}

// ---------- settings ----------

export async function getSettings(): Promise<Settings> {
  const s = await db.settings.get('app');
  return { ...DEFAULT_SETTINGS, ...(s ?? {}), id: 'app', schemaVersion: 1 };
}

export async function saveSettings(patch: Partial<Settings>): Promise<Settings> {
  return db.transaction('rw', db.settings, async () => {
    const current = await getSettings();
    const next: Settings = { ...current, ...patch, id: 'app', schemaVersion: 1 };
    await db.settings.put(next);
    return next;
  });
}

// ---------- backup ----------

export interface Snapshot {
  folders: Folder[];
  words: Word[];
  reviewLogs: ReviewLog[];
  settings: Settings;
}

export async function readSnapshot(): Promise<Snapshot> {
  return db.transaction('r', db.folders, db.words, db.reviewLogs, db.settings, async () => ({
    folders: await db.folders.toArray(),
    words: await db.words.toArray(),
    reviewLogs: await db.reviewLogs.toArray(),
    settings: await getSettings(),
  }));
}

/** 全テーブルを消して置き換える */
export async function replaceAll(snapshot: Snapshot): Promise<void> {
  await db.transaction('rw', db.folders, db.words, db.reviewLogs, db.settings, async () => {
    await Promise.all([db.folders.clear(), db.words.clear(), db.reviewLogs.clear(), db.settings.clear()]);
    await db.folders.bulkAdd(snapshot.folders);
    await db.words.bulkAdd(snapshot.words);
    await db.reviewLogs.bulkAdd(snapshot.reviewLogs);
    await db.settings.put({ ...DEFAULT_SETTINGS, ...snapshot.settings, id: 'app', schemaVersion: 1 });
  });
}

export async function clearAll(): Promise<void> {
  await db.transaction('rw', db.folders, db.words, db.reviewLogs, db.settings, async () => {
    await Promise.all([db.folders.clear(), db.words.clear(), db.reviewLogs.clear(), db.settings.clear()]);
  });
}

/** review が [from, to) にある ReviewLog の件数 */
export async function countReviewsBetween(from: number, to: number): Promise<number> {
  return db.reviewLogs.where('review').between(from, to, true, false).count();
}
