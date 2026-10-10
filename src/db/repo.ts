import Dexie from 'dexie';
import { db } from './db';
import type { Folder, Word, ReviewLog, Settings, CardState, FsrsFields, Scope, WordImage, ImageSide, Edge, NodeItem, SavedCard } from '../domain/types';
import { DEFAULT_SETTINGS, isFavoritesScope, scopeFolderId } from '../domain/types';
import { newCardFields, FSRS_KEYS } from '../domain/fsrs';
import { DEFAULT_LABELS, type Labels } from '../domain/labels';
import { endOfDay } from '../domain/dates';
import { orphanNodes, relationBlock } from '../domain/relations';

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

/** フォルダを作る。項目名を省略すると「表」「裏」（4-2） */
export async function createFolder(name: string, now = Date.now(), labels: Labels = DEFAULT_LABELS): Promise<Folder> {
  return db.transaction('rw', db.folders, async () => {
    const last = await db.folders.orderBy('sortOrder').last();
    const folder: Folder = {
      id: uuid(),
      name: name.trim(),
      frontLabel: labels.front.trim(),
      backLabel: labels.back.trim(),
      createdAt: now,
      sortOrder: last ? last.sortOrder + 1 : 0,
    };
    await db.folders.add(folder);
    return folder;
  });
}

/** フォルダ名と項目名を更新する（7-2 の「フォルダを編集」）。配下の単語は変えない */
export async function updateFolder(id: string, name: string, labels: Labels): Promise<void> {
  await db.folders.update(id, { name: name.trim(), frontLabel: labels.front.trim(), backLabel: labels.back.trim() });
}

/** フォルダの並び替え（7-2）。ids の順に sortOrder を 0 からの連番で振り直す。1 トランザクションで行う */
export async function reorderFolders(ids: string[]): Promise<void> {
  await db.transaction('rw', db.folders, async () => {
    await Promise.all(ids.map((id, i) => db.folders.update(id, { sortOrder: i })));
  });
}

/** フォルダと配下の単語、その履歴を削除 */
export async function deleteFolder(id: string): Promise<void> {
  await deleteFolders([id]);
}

/**
 * フォルダと配下の単語・ReviewLog・画像・関係をまとめて 1 トランザクションで削除する（7-2 の一括削除）。
 * 関係がなくなるノードも消す（4-12）
 */
export async function deleteFolders(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  await db.transaction('rw', [db.folders, ...ITEM_TABLES()], async () => {
    const wordIds = await db.words.where('folderId').anyOf(ids).primaryKeys();
    await removeItemsInTx(wordIds);
    await db.folders.bulkDelete(ids);
  });
}

/** フォルダ配下の単語の id（確認文で孤立ノードを数えるのに使う。7-2） */
export async function listWordIdsInFolders(folderIds: string[]): Promise<string[]> {
  return db.words.where('folderId').anyOf(folderIds).primaryKeys();
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

/** 単語フォームで選んだ画像（4-8）。data は縮小済みのバイト列 */
export interface WordImageInput {
  data: ArrayBuffer;
  type: string;
  side: ImageSide;
}

/** 画像の保存・削除。image が null なら削除、undefined なら何もしない。呼び出し側のトランザクションの中で使う */
async function writeImage(wordId: string, image: WordImageInput | null | undefined, now: number): Promise<void> {
  if (image === undefined) return;
  if (image === null) await db.images.delete(wordId);
  else await db.images.put({ wordId, data: image.data, type: image.type, side: image.side, updatedAt: now });
}

/** 単語を追加する。画像を渡せば単語と同じトランザクションで保存する（7-4） */
export async function createWord(input: NewWordInput, now = Date.now(), image?: WordImageInput | null): Promise<Word> {
  const word = buildNewWord(input, now);
  await db.transaction('rw', db.words, db.images, async () => {
    await db.words.add(word);
    await writeImage(word.id, image, now);
  });
  return word;
}

export async function bulkAddWords(words: Word[]): Promise<void> {
  await db.transaction('rw', db.words, async () => {
    await db.words.bulkAdd(words);
  });
}

/**
 * 単語フォームの保存。本文と、指定があれば所属フォルダ（7-4）を更新する。FSRS 項目は変えない。
 * image は null なら画像を削除、値があれば置き換え、undefined なら画像に触れない（4-8）。1 トランザクションで行う
 */
export async function updateWordText(
  id: string,
  input: { englishTerm: string; japaneseDefinition: string; memo: string; folderId?: string },
  now = Date.now(),
  image?: WordImageInput | null,
): Promise<void> {
  await db.transaction('rw', db.words, db.images, async () => {
    await db.words.update(id, { ...input, updatedAt: now });
    await writeImage(id, image, now);
  });
}

/** カードの画像（4-8）。無ければ undefined */
export async function getWordImage(wordId: string): Promise<WordImage | undefined> {
  return db.images.get(wordId);
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

/** 単語と ReviewLog・画像・関係を削除し、関係がなくなるノードも消す（4-12） */
export async function deleteWord(id: string): Promise<void> {
  await deleteItems([id]);
}

/** 複数の単語と ReviewLog・画像・関係を 1 トランザクションで削除し、関係がなくなるノードも消す（4-12） */
export async function deleteWords(ids: string[]): Promise<void> {
  await deleteItems(ids);
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

/**
 * 評価の一括取り消し（6-3 の「結果を破棄して終了」）。entries は undo スタックと同じ並び（古い順）で、
 * 各単語の FSRS 項目をその単語の一番古い `before`（＝セッション開始前の値）に戻し、
 * 追加した ReviewLog をすべて削除する。**1 トランザクションで行う。**
 */
export async function revertRatings(entries: { wordId: string; before: FsrsFields; logId: string }[]): Promise<void> {
  if (entries.length === 0) return;
  // 同じ単語が複数回評価されていても、書き戻すのは最初の評価の直前の値だけ
  const oldest = new Map<string, FsrsFields>();
  for (const e of entries) if (!oldest.has(e.wordId)) oldest.set(e.wordId, e.before);
  await db.transaction('rw', db.words, db.reviewLogs, async () => {
    for (const [wordId, before] of oldest) await db.words.update(wordId, { ...before });
    await db.reviewLogs.bulkDelete(entries.map((e) => e.logId));
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

/** 全 ReviewLog を評価日時の昇順で返す（7-11 のカレンダーの集計） */
export async function listReviewLogs(): Promise<ReviewLog[]> {
  return db.reviewLogs.orderBy('review').toArray();
}

export async function listReviewLogsForWord(wordId: string): Promise<ReviewLog[]> {
  return db.reviewLogs.where('wordId').equals(wordId).toArray();
}

// ---------- relations（4-9〜4-12） ----------

/** 項目（カードとノード）を消すときに触るテーブル */
const ITEM_TABLES = () => [db.words, db.reviewLogs, db.images, db.edges, db.nodes];

/**
 * 呼び出し側のトランザクションの中で使う。項目（カードかノード）を消し、その関係・ReviewLog・画像も消す。
 * 関係が 0 になるノードも同じく消す（4-12。ノードに戻したカードの ReviewLog と画像を含む）。消した孤立ノードの id を返す
 */
async function removeItemsInTx(ids: string[]): Promise<string[]> {
  if (ids.length === 0) return [];
  const edges = await db.edges.toArray();
  const nodeIds = await db.nodes.toCollection().primaryKeys();
  const orphans = orphanNodes(edges, nodeIds, ids);
  const all = [...ids, ...orphans];
  const gone = new Set(all);
  await db.edges.bulkDelete(edges.filter((e) => gone.has(e.from) || gone.has(e.to)).map((e) => e.id));
  await db.reviewLogs.where('wordId').anyOf(all).delete();
  await db.images.bulkDelete(all);
  await db.words.bulkDelete(all);
  await db.nodes.bulkDelete(all);
  return orphans;
}

/** 項目（カードかノード）を 1 トランザクションで削除する（4-12）。消した孤立ノードの id を返す */
export async function deleteItems(ids: string[]): Promise<string[]> {
  if (ids.length === 0) return [];
  return db.transaction('rw', ITEM_TABLES(), () => removeItemsInTx(ids));
}

/** 関係を消せない・足せないとき（4-11 の規則に反する、項目が無い） */
export class RelationError extends Error {
  constructor(message = '追加できませんでした') {
    super(message);
    this.name = 'RelationError';
  }
}

export async function listEdges(): Promise<Edge[]> {
  return db.edges.toArray();
}

/** 項目から出る関係と入る関係（4-6 の from と to のインデックス） */
export async function listEdgesOf(id: string): Promise<Edge[]> {
  const [out, inn] = await Promise.all([db.edges.where('from').equals(id).toArray(), db.edges.where('to').equals(id).toArray()]);
  return [...out, ...inn];
}

export async function listNodes(): Promise<NodeItem[]> {
  return db.nodes.toArray();
}

export async function getNode(id: string): Promise<NodeItem | undefined> {
  return db.nodes.get(id);
}

export async function getNodes(ids: string[]): Promise<Map<string, NodeItem>> {
  const rows = await db.nodes.bulkGet(ids);
  const map = new Map<string, NodeItem>();
  rows.forEach((n) => {
    if (n) map.set(n.id, n);
  });
  return map;
}

/**
 * 関係を追加する（7-12-2）。node を渡せば、そのノードの作成と関係の追加を 1 トランザクションで行う。
 * 保存の直前に 4-11 の規則（自分自身・1 組 1 関係・循環）と両端の存在を確かめ直し、守れないときは RelationError
 */
export async function addEdge(edge: Edge, node?: NodeItem): Promise<void> {
  await db.transaction('rw', db.edges, db.nodes, db.words, async () => {
    if (node) await db.nodes.add(node);
    for (const id of [edge.from, edge.to]) {
      if (!(await db.words.get(id)) && !(await db.nodes.get(id))) throw new RelationError();
    }
    if (relationBlock(await db.edges.toArray(), edge.kind, edge.from, edge.to)) throw new RelationError();
    await db.edges.add(edge);
  });
}

/** 連結の向きとラベルを変える（7-12-3） */
export async function updateLink(id: string, patch: Pick<Edge, 'from' | 'to' | 'directed' | 'label'>): Promise<void> {
  await db.edges.update(id, patch);
}

/**
 * 関係を 1 つ削除する（7-12 の ⊖）。関係が 0 になるノードも同じトランザクションで消す（4-12）。
 * 消した孤立ノードの id を返す
 */
export async function deleteEdge(id: string): Promise<string[]> {
  return db.transaction('rw', ITEM_TABLES(), async () => {
    const edges = await db.edges.toArray();
    const orphans = orphanNodes(edges, await db.nodes.toCollection().primaryKeys(), [], [id]);
    await db.edges.delete(id);
    await removeItemsInTx(orphans);
    return orphans;
  });
}

/** ⊖ の「元に戻す」（7-12）。消した関係を同じ id で戻す */
export async function restoreEdge(edge: Edge): Promise<void> {
  await db.edges.put(edge);
}

/** ノードの名前を変える（7-12） */
export async function renameNode(id: string, name: string, now = Date.now()): Promise<void> {
  await db.nodes.update(id, { name, updatedAt: now });
}

const pickFsrs = (src: FsrsFields): FsrsFields => Object.fromEntries(FSRS_KEYS.map((k) => [k, src[k]])) as unknown as FsrsFields;

/**
 * カードをノードに戻す（4-12）。同じ id で NodeItem を作り、words からは消す。
 * ReviewLog と画像は残す。関係が 1 つも無いカードは戻せない（RelationError）
 */
export async function cardToNode(wordId: string, now = Date.now()): Promise<NodeItem> {
  return db.transaction('rw', db.words, db.nodes, db.edges, async () => {
    const raw = await db.words.get(wordId);
    if (!raw) throw new RelationError('カードが見つかりません');
    const hasEdge = (await db.edges.where('from').equals(wordId).count()) + (await db.edges.where('to').equals(wordId).count()) > 0;
    if (!hasEdge) throw new RelationError('関係のないカードはノードにできません');
    const w = ensureFsrsFields(raw, now);
    const saved: SavedCard = {
      folderId: w.folderId,
      japaneseDefinition: w.japaneseDefinition,
      memo: w.memo,
      favorite: w.favorite,
      createdAt: w.createdAt,
      ...pickFsrs(w),
    };
    const node: NodeItem = { id: wordId, name: w.englishTerm, createdAt: now, updatedAt: now, saved };
    await db.nodes.put(node);
    await db.words.delete(wordId);
    return node;
  });
}

/**
 * ノードをカードにする（4-12）。同じ id で Word を作り、nodes からは消す。
 * saved があれば favorite・createdAt・FSRS 項目を戻し（学習の続きから再開）、なければ新しいカードとして作る。
 * image は writeImage と同じ（null で削除、undefined なら触れない）。1 トランザクションで行う
 */
export async function nodeToCard(nodeId: string, input: NewWordInput, now = Date.now(), image?: WordImageInput | null): Promise<Word> {
  return db.transaction('rw', db.words, db.nodes, db.images, async () => {
    const node = await db.nodes.get(nodeId);
    if (!node) throw new RelationError('ノードが見つかりません');
    const s = node.saved;
    const word: Word = {
      id: nodeId,
      folderId: input.folderId,
      englishTerm: input.englishTerm,
      japaneseDefinition: input.japaneseDefinition,
      memo: input.memo,
      favorite: s?.favorite ?? false,
      createdAt: s?.createdAt ?? now,
      updatedAt: now,
      ...(s ? pickFsrs(s) : newCardFields(now)),
    };
    await db.words.add(word);
    await db.nodes.delete(nodeId);
    await writeImage(nodeId, image, now);
    return word;
  });
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
  images: WordImage[];
  edges: Edge[];
  nodes: NodeItem[];
}

export async function readSnapshot(): Promise<Snapshot> {
  return db.transaction('r', ALL_TABLES(), async () => ({
    folders: await db.folders.toArray(),
    words: await db.words.toArray(),
    reviewLogs: await db.reviewLogs.toArray(),
    settings: await getSettings(),
    images: await db.images.toArray(),
    edges: await db.edges.toArray(),
    nodes: await db.nodes.toArray(),
  }));
}

const ALL_TABLES = () => [db.folders, db.words, db.reviewLogs, db.settings, db.images, db.edges, db.nodes];

/** 全テーブルを消して置き換える */
export async function replaceAll(snapshot: Snapshot): Promise<void> {
  await db.transaction('rw', ALL_TABLES(), async () => {
    await Promise.all(ALL_TABLES().map((t) => t.clear()));
    await db.folders.bulkAdd(snapshot.folders);
    await db.words.bulkAdd(snapshot.words);
    await db.reviewLogs.bulkAdd(snapshot.reviewLogs);
    await db.images.bulkAdd(snapshot.images);
    await db.edges.bulkAdd(snapshot.edges);
    await db.nodes.bulkAdd(snapshot.nodes);
    await db.settings.put({ ...DEFAULT_SETTINGS, ...snapshot.settings, id: 'app', schemaVersion: 2 });
  });
}

export async function clearAll(): Promise<void> {
  await db.transaction('rw', ALL_TABLES(), async () => {
    await Promise.all(ALL_TABLES().map((t) => t.clear()));
  });
}

/** review が [from, to) にある ReviewLog の件数 */
export async function countReviewsBetween(from: number, to: number): Promise<number> {
  return db.reviewLogs.where('review').between(from, to, true, false).count();
}
