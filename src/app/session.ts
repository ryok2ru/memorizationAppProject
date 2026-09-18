import type { Grade, Word, ReviewLog, FsrsFields, Scope } from '../domain/types';
import { rate as fsrsRate, isFinitePayload, isShortTermState, FSRS_KEYS } from '../domain/fsrs';
import { saveRating, revertRating } from '../db/repo';
import type { SessionKind } from './queue';

export type StudyMode = 'flashcard' | 'enToJa' | 'jaToEn';

/** 6-1 の 6 種を scope × kind で表す。scope は 'all'、'favorites'、またはフォルダ id */
export interface SessionContext {
  scope: Scope;
  kind: SessionKind;
}

export interface SessionItem {
  firstRating?: Grade;
  shownCount: number;
}

/** 評価 1 件を取り消すための記録（6-3）。末尾が直前の評価 */
export interface UndoEntry {
  wordId: string;
  /** 評価前の FSRS 項目 */
  before: FsrsFields;
  /** その評価で追加した ReviewLog の id */
  logId: string;
  /** その評価でキュー末尾に再出題を追加したか */
  requeued: boolean;
  /** その評価で firstRating を設定したか */
  setFirstRating: boolean;
  /** 評価前の index */
  index: number;
  /** 評価前の lastDue[wordId]（未評価なら undefined） */
  prevDue?: number;
}

export interface SessionState {
  context: SessionContext;
  mode: StudyMode;
  queue: string[];
  index: number;
  items: Record<string, SessionItem>;
  startedAt: number;
  finishedAt?: number;
  endedEarly: boolean;
  /** 評価した単語の更新後 due（結果画面用） */
  lastDue: Record<string, number>;
  /** 取り消しスタック。ページ再読み込みで消える */
  undo: UndoEntry[];
}

export function createSession(context: SessionContext, mode: StudyMode, queue: string[], now = Date.now()): SessionState {
  return { context, mode, queue: queue.slice(), index: 0, items: {}, startedAt: now, endedEarly: false, lastDue: {}, undo: [] };
}

export const currentWordId = (s: SessionState): string | undefined => s.queue[s.index];
export const isFinished = (s: SessionState): boolean => s.finishedAt != null || s.index >= s.queue.length;
export const remaining = (s: SessionState): number => Math.max(0, s.queue.length - s.index);
/** 完了 = 評価済みの単語数（再出題は数えない） */
export const completed = (s: SessionState): number =>
  Object.values(s.items).filter((i) => i.firstRating != null).length;
export const canUndo = (s: SessionState): boolean => s.undo.length > 0;

export function markShown(s: SessionState, wordId: string): SessionState {
  const item = s.items[wordId] ?? { shownCount: 0 };
  return { ...s, items: { ...s.items, [wordId]: { ...item, shownCount: item.shownCount + 1 } } };
}

const pickFsrs = (w: Word): FsrsFields => Object.fromEntries(FSRS_KEYS.map((k) => [k, w[k]])) as unknown as FsrsFields;

/**
 * 評価結果（保存済み）をセッション状態に反映する。6-3 の手順 3〜6。
 * @param before 評価前の Word（取り消し用に FSRS 項目を控える）
 * @param updated 評価後の Word
 * @param logId その評価で保存した ReviewLog の id
 */
export function applyRating(
  s: SessionState,
  before: Word,
  grade: Grade,
  updated: Word,
  logId: string,
  now = Date.now(),
): SessionState {
  const wordId = before.id;
  const item = s.items[wordId] ?? { shownCount: 0 };
  const setFirstRating = item.firstRating == null;
  const items = {
    ...s.items,
    [wordId]: { ...item, firstRating: item.firstRating ?? grade },
  };
  const requeued = isShortTermState(updated.state);
  const queue = requeued ? [...s.queue, wordId] : s.queue;
  const index = s.index + 1;
  const entry: UndoEntry = {
    wordId,
    before: pickFsrs(before),
    logId,
    requeued,
    setFirstRating,
    index: s.index,
    prevDue: s.lastDue[wordId],
  };
  const next: SessionState = {
    ...s,
    items,
    queue,
    index,
    lastDue: { ...s.lastDue, [wordId]: updated.due },
    undo: [...s.undo, entry],
  };
  if (index >= queue.length) next.finishedAt = now;
  return next;
}

/**
 * 直前の評価をセッション状態から取り消す（6-3）。DB は戻さない（undoAndSave が行う）。
 * スタックが空ならそのまま返す。
 */
export function undoLast(s: SessionState): SessionState {
  const entry = s.undo[s.undo.length - 1];
  if (!entry) return s;
  let queue = s.queue;
  if (entry.requeued && queue[queue.length - 1] === entry.wordId) queue = queue.slice(0, -1);
  const items = { ...s.items };
  const item = items[entry.wordId];
  if (item && entry.setFirstRating) {
    const { firstRating: _omit, ...rest } = item;
    items[entry.wordId] = rest;
  }
  const lastDue = { ...s.lastDue };
  if (entry.prevDue == null) delete lastDue[entry.wordId];
  else lastDue[entry.wordId] = entry.prevDue;
  const { finishedAt: _finished, ...rest } = s;
  return { ...rest, queue, items, lastDue, index: entry.index, undo: s.undo.slice(0, -1) };
}

/** 保存失敗時など、評価を記録せず次に進む */
export function skipCurrent(s: SessionState, now = Date.now()): SessionState {
  const index = s.index + 1;
  const next: SessionState = { ...s, index };
  if (index >= s.queue.length) next.finishedAt = now;
  return next;
}

export function endEarly(s: SessionState, now = Date.now()): SessionState {
  return { ...s, endedEarly: true, finishedAt: s.finishedAt ?? now };
}

export interface SessionSummary {
  counts: Record<Grade, number>;
  rated: number;
  accuracy: number; // 0..100、切り捨て
  durationMs: number;
  earliestDue: number | null;
}

export function summarize(s: SessionState, now = Date.now()): SessionSummary {
  const counts: Record<Grade, number> = { 1: 0, 2: 0, 3: 0, 4: 0 };
  for (const item of Object.values(s.items)) if (item.firstRating) counts[item.firstRating] += 1;
  const rated = counts[1] + counts[2] + counts[3] + counts[4];
  const accuracy = rated === 0 ? 0 : Math.floor(((counts[3] + counts[4]) / rated) * 100);
  const dues = Object.values(s.lastDue);
  return {
    counts,
    rated,
    accuracy,
    durationMs: (s.finishedAt ?? now) - s.startedAt,
    earliestDue: dues.length === 0 ? null : Math.min(...dues),
  };
}

export type RateOutcome =
  | { ok: true; word: Word; log: ReviewLog }
  | { ok: false; reason: 'nan' | 'save' | 'quota' };

/**
 * FSRS で評価し、Dexie に即時保存する（6-3 手順 1〜2、5-5、10-4）。
 * 書き込み失敗は 1 回再試行する。
 */
export async function rateAndSave(word: Word, grade: Grade, now = Date.now()): Promise<RateOutcome> {
  const result = fsrsRate(word, grade, now);
  if (!isFinitePayload(result.word, result.log)) {
    console.error('FSRS returned a non-finite value; rating not saved', result);
    return { ok: false, reason: 'nan' };
  }
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      await saveRating(result.word, result.log);
      return { ok: true, word: result.word, log: result.log };
    } catch (e) {
      if (isQuotaError(e)) return { ok: false, reason: 'quota' };
      console.error('failed to save rating', e);
    }
  }
  return { ok: false, reason: 'save' };
}

export type UndoOutcome =
  | { ok: true; state: SessionState; wordId: string }
  | { ok: false; reason: 'empty' | 'save' | 'quota' };

/**
 * 直前の評価を取り消す（6-3）。単語の FSRS 項目を評価前に戻し、その評価の ReviewLog を削除する
 * DB 書き込み（1 トランザクション）が成功したときだけ、セッション状態を評価前に戻す。
 * 書き込み失敗は 1 回再試行する。
 */
export async function undoAndSave(s: SessionState): Promise<UndoOutcome> {
  const entry = s.undo[s.undo.length - 1];
  if (!entry) return { ok: false, reason: 'empty' };
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      await revertRating(entry.wordId, entry.before, entry.logId);
      return { ok: true, state: undoLast(s), wordId: entry.wordId };
    } catch (e) {
      if (isQuotaError(e)) return { ok: false, reason: 'quota' };
      console.error('failed to undo rating', e);
    }
  }
  return { ok: false, reason: 'save' };
}

export function isQuotaError(e: unknown): boolean {
  const name = (e as { name?: string } | null)?.name ?? '';
  const inner = (e as { inner?: { name?: string } } | null)?.inner?.name ?? '';
  return name === 'QuotaExceededError' || inner === 'QuotaExceededError';
}

// ---------- メモリ上のセッション保持（ページ再読み込みで消える） ----------

let current: SessionState | null = null;
const listeners = new Set<() => void>();

export function getSession(): SessionState | null {
  return current;
}

export function setSession(s: SessionState | null): void {
  current = s;
  listeners.forEach((l) => l());
}

export function subscribeSession(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
