import type { Grade, Word, ReviewLog } from '../domain/types';
import { rate as fsrsRate, isFinitePayload, isShortTermState } from '../domain/fsrs';
import { saveRating } from '../db/repo';
import type { SessionKind } from './queue';

export type StudyMode = 'flashcard' | 'enToJa' | 'jaToEn';

/** 6-1 の 4 種を scope × kind で表す。scope は 'all' かフォルダ id */
export interface SessionContext {
  scope: 'all' | string;
  kind: SessionKind;
}

export interface SessionItem {
  firstRating?: Grade;
  shownCount: number;
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
}

export function createSession(context: SessionContext, mode: StudyMode, queue: string[], now = Date.now()): SessionState {
  return { context, mode, queue: queue.slice(), index: 0, items: {}, startedAt: now, endedEarly: false, lastDue: {} };
}

export const currentWordId = (s: SessionState): string | undefined => s.queue[s.index];
export const isFinished = (s: SessionState): boolean => s.finishedAt != null || s.index >= s.queue.length;
export const remaining = (s: SessionState): number => Math.max(0, s.queue.length - s.index);
/** 完了 = 評価済みの単語数（再出題は数えない） */
export const completed = (s: SessionState): number =>
  Object.values(s.items).filter((i) => i.firstRating != null).length;

export function markShown(s: SessionState, wordId: string): SessionState {
  const item = s.items[wordId] ?? { shownCount: 0 };
  return { ...s, items: { ...s.items, [wordId]: { ...item, shownCount: item.shownCount + 1 } } };
}

/**
 * 評価結果（保存済み）をセッション状態に反映する。6-3 の手順 3〜5。
 */
export function applyRating(s: SessionState, wordId: string, grade: Grade, updated: Word, now = Date.now()): SessionState {
  const item = s.items[wordId] ?? { shownCount: 0 };
  const items = {
    ...s.items,
    [wordId]: { ...item, firstRating: item.firstRating ?? grade },
  };
  const queue = isShortTermState(updated.state) ? [...s.queue, wordId] : s.queue;
  const index = s.index + 1;
  const next: SessionState = { ...s, items, queue, index, lastDue: { ...s.lastDue, [wordId]: updated.due } };
  if (index >= queue.length) next.finishedAt = now;
  return next;
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
