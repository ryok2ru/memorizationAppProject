import Dexie from 'dexie';
import { db } from './db';
import type { Folder, Word, ReviewLog, Settings, CardState, FsrsFields, Scope } from '../domain/types';
import { DEFAULT_SETTINGS, isFavoritesScope, scopeFolderId } from '../domain/types';
import { newCardFields, FSRS_KEYS } from '../domain/fsrs';
import { endOfDay } from '../domain/dates';

const uuid = () => crypto.randomUUID();

/** Word に FSRS 項目が欠けていれば補い、favorite が無ければ false にする（4-3、10-4） */
export function ensureFsrsFields(word: Word, now: number): Word {
  const w = word.favorite === true ? word : { ...word, favorite: false };
  const missing = FSRS_KEYS.filter((k) => !(k in w) || (k !== 'last_review' && w[k] == null));
  if (missing.length === 0) return w;
  console.warn(`word ${w.id} is missing FSRS fields: ${missing.join(', ')}`);
  return { ...newCardFields(now), ...w, ...Object.fromEntries(missing.map((k) => [k, newCardFields(now)[k]])) } as Word;
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
    favorite: false,
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

/** ☆ の付け外し（7-3、7-4、7-6）。favorite と updatedAt だけを更新する */
export async function setFavorite(id: string, favorite: boolean, now = Date.now()): Promise<void> {
  await db.words.update(id, { favorite, updatedAt: now });
}

/** 複数の単語の ☆ を 1 トランザクションでまとめて付け外しする（7-3 の選択モード） */
export async function setFavorites(ids: string[], favorite: boolean, now = Date.now()): Promise<number> {
  if (ids.length === 0) return 0;
  return db.transaction('rw', db.words, async () => db.words.where('id').anyOf(ids).modify({ favorite, updatedAt: now }));
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

/**
 * scope の単語を絞り込む述語。'favorites' なら favorite = true だけを残す。
 * IndexedDB のキーに真偽値は使えず favorite インデックスでは引けないので、読み込んだ配列を絞り込む（4-6）。
 */
const inScope = (scope: Scope) => (w: Word) => !isFavoritesScope(scope) || w.favorite;

/** お気に入りを含む全フォルダの単語一覧（7-3 の #/favorites）。並べ替えは画面側で行う */
export async function listFavoriteWords(): Promise<Word[]> {
  return withFsrs(await db.words.toArray()).filter((w) => w.favorite);
}

/** 復習対象: state ≠ 0 かつ due ≤ 今日の終わり。due 昇順 */
export async function listDueWords(scope: Scope, now = Date.now()): Promise<Word[]> {
  const end = endOfDay(now);
  const folderId = scopeFolderId(scope);
  const rows =
    folderId == null
      ? await db.words.where('due').belowOrEqual(end).toArray()
      : await db.words.where('[folderId+due]').between([folderId, Dexie.minKey], [folderId, end], true, true).toArray();
  return withFsrs(rows, now)
    .filter((w) => w.state !== 0 && inScope(scope)(w))
    .sort((a, b) => a.due - b.due || a.createdAt - b.createdAt);
}

/** New: state = 0。createdAt 昇順 */
export async function listNewWords(scope: Scope, now = Date.now()): Promise<Word[]> {
  const folderId = scopeFolderId(scope);
  const rows =
    folderId == null
      ? await db.words.where('state').equals(0).toArray()
      : await db.words.where('[folderId+state]').equals([folderId, 0]).toArray();
  return withFsrs(rows, now)
    .filter(inScope(scope))
    .sort((a, b) => a.createdAt - b.createdAt);
}

export async function countDueWords(scope: Scope, now = Date.now()): Promise<number> {
  return (await listDueWords(scope, now)).length;
}

export async function countNewWords(scope: Scope): Promise<number> {
  return (await listNewWords(scope)).length;
}

/** scope の総単語数（フォルダカードの総単語数、お気に入りカードの ★ 件数。7-2） */
export async function countWords(scope: Scope): Promise<number> {
  const folderId = scopeFolderId(scope);
  if (isFavoritesScope(scope)) return (await listFavoriteWords()).length;
  return folderId == null ? db.words.count() : db.words.where('folderId').equals(folderId).count();
}

export async function countByState(scope: Scope): Promise<Record<CardState, number>> {
  const result: Record<CardState, number> = { 0: 0, 1: 0, 2: 0, 3: 0 };
  const folderId = scopeFolderId(scope);
  const rows = folderId == null ? await db.words.toArray() : await db.words.where('folderId').equals(folderId).toArray();
  for (const w of withFsrs(rows).filter(inScope(scope))) result[w.state] += 1;
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
  return { ...DEFAULT_SETTINGS, ...(s ?? {}), id: 'app', schemaVersion: 2 };
}

export async function saveSettings(patch: Partial<Settings>): Promise<Settings> {
  return db.transaction('rw', db.settings, async () => {
    const current = await getSettings();
    const next: Settings = { ...current, ...patch, id: 'app', schemaVersion: 2 };
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
    await db.settings.put({ ...DEFAULT_SETTINGS, ...snapshot.settings, id: 'app', schemaVersion: 2 });
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
