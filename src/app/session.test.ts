import { beforeEach, describe, expect, it } from 'vitest';
import {
  applyRating,
  canUndo,
  completed,
  createSession,
  currentWordId,
  endEarly,
  isFinished,
  rateAndSave,
  remaining,
  summarize,
  undoAndSave,
  undoLast,
} from './session';
import type { Word } from '../domain/types';
import { newCardFields } from '../domain/fsrs';
import { clearAll, createFolder, createWord, getWord, listReviewLogsForWord } from '../db/repo';

const now = new Date(2026, 8, 18, 10, 0, 0).getTime();
const mk = (id: string, patch: Partial<Word> = {}): Word => ({
  id,
  folderId: 'f',
  englishTerm: id,
  japaneseDefinition: id,
  memo: '',
  createdAt: now,
  updatedAt: now,
  ...newCardFields(now),
  ...patch,
});
const ctx = { scope: 'all' as const, kind: 'review' as const };
let logSeq = 0;
const logId = () => `log-${++logSeq}`;

describe('session state', () => {
  it('counts only the first rating and re-queues learning cards', () => {
    let s = createSession(ctx, 'flashcard', ['a', 'b'], now);
    expect(currentWordId(s)).toBe('a');
    expect(remaining(s)).toBe(2);
    s = applyRating(s, mk('a'), 1, mk('a', { state: 1, due: now + 600000 }), logId(), now);
    expect(s.queue).toEqual(['a', 'b', 'a']);
    expect(s.index).toBe(1);
    expect(completed(s)).toBe(1);
    expect(remaining(s)).toBe(2);
    s = applyRating(s, mk('b'), 3, mk('b', { state: 2, due: now + 86400000 }), logId(), now);
    expect(s.queue).toEqual(['a', 'b', 'a']);
    expect(isFinished(s)).toBe(false);
    s = applyRating(s, mk('a', { state: 1 }), 3, mk('a', { state: 2, due: now + 86400000 }), logId(), now + 1000);
    expect(isFinished(s)).toBe(true);
    expect(s.finishedAt).toBe(now + 1000);
    const sum = summarize(s);
    expect(sum.counts).toEqual({ 1: 1, 2: 0, 3: 1, 4: 0 });
    expect(sum.rated).toBe(2);
    expect(sum.accuracy).toBe(50);
    expect(completed(s)).toBe(2);
  });

  it('re-queues relearning cards too', () => {
    let s = createSession(ctx, 'flashcard', ['a'], now);
    s = applyRating(s, mk('a', { state: 2 }), 1, mk('a', { state: 3, due: now + 600000 }), logId(), now);
    expect(s.queue).toEqual(['a', 'a']);
    expect(isFinished(s)).toBe(false);
  });

  it('endEarly marks the session and keeps saved ratings', () => {
    let s = createSession(ctx, 'enToJa', ['a', 'b', 'c'], now);
    s = applyRating(s, mk('a'), 4, mk('a', { state: 2, due: now + 3 * 86400000 }), logId(), now);
    s = endEarly(s, now + 5000);
    expect(s.endedEarly).toBe(true);
    expect(isFinished(s)).toBe(true);
    const sum = summarize(s);
    expect(sum.rated).toBe(1);
    expect(sum.accuracy).toBe(100);
    expect(sum.durationMs).toBe(5000);
    expect(sum.earliestDue).toBe(now + 3 * 86400000);
  });

  it('accuracy is floored and 0 when nothing rated', () => {
    let s = createSession(ctx, 'flashcard', ['a', 'b', 'c'], now);
    expect(summarize(s, now).accuracy).toBe(0);
    s = applyRating(s, mk('a'), 3, mk('a', { state: 2 }), logId(), now);
    s = applyRating(s, mk('b'), 2, mk('b', { state: 2 }), logId(), now);
    s = applyRating(s, mk('c'), 1, mk('c', { state: 2 }), logId(), now);
    expect(summarize(s).accuracy).toBe(33);
  });
});

describe('undo (6-3)', () => {
  it('records what each rating changed', () => {
    let s = createSession(ctx, 'flashcard', ['a'], now);
    expect(canUndo(s)).toBe(false);
    const before = mk('a');
    s = applyRating(s, before, 1, mk('a', { state: 1, due: now + 600000 }), 'log-x', now);
    expect(canUndo(s)).toBe(true);
    expect(s.undo).toHaveLength(1);
    expect(s.undo[0]).toMatchObject({
      wordId: 'a',
      logId: 'log-x',
      requeued: true,
      setFirstRating: true,
      index: 0,
      prevDue: undefined,
    });
    expect(s.undo[0].before).toEqual(newCardFields(now));
    expect(Object.keys(s.undo[0].before).sort()).toEqual(Object.keys(newCardFields(now)).sort());
  });

  it('restores state, re-queue and summary to before the rating', () => {
    const start = createSession(ctx, 'flashcard', ['a', 'b'], now);
    let s = applyRating(start, mk('a'), 1, mk('a', { state: 1, due: now + 600000 }), logId(), now);
    expect(s.queue).toEqual(['a', 'b', 'a']);
    s = undoLast(s);
    expect(s.queue).toEqual(['a', 'b']);
    expect(s.index).toBe(0);
    expect(currentWordId(s)).toBe('a');
    expect(s.items.a?.firstRating).toBeUndefined();
    expect(s.lastDue).toEqual({});
    expect(s.undo).toEqual([]);
    expect(canUndo(s)).toBe(false);
    expect(completed(s)).toBe(0);
    expect(remaining(s)).toBe(2);
    const sum = summarize(s, now);
    expect(sum.counts).toEqual({ 1: 0, 2: 0, 3: 0, 4: 0 });
    expect(sum.rated).toBe(0);
    expect(sum.earliestDue).toBeNull();
  });

  it('keeps the first rating and previous due when undoing a re-shown card', () => {
    let s = createSession(ctx, 'flashcard', ['a'], now);
    s = applyRating(s, mk('a'), 1, mk('a', { state: 1, due: now + 600000 }), logId(), now);
    // 再出題分を Good → Review（再出題なし）。firstRating は Again のまま
    s = applyRating(s, mk('a', { state: 1 }), 3, mk('a', { state: 2, due: now + 86400000 }), logId(), now + 1000);
    expect(s.undo[1]).toMatchObject({ requeued: false, setFirstRating: false, index: 1, prevDue: now + 600000 });
    expect(isFinished(s)).toBe(true);
    s = undoLast(s);
    expect(s.finishedAt).toBeUndefined();
    expect(isFinished(s)).toBe(false);
    expect(s.index).toBe(1);
    expect(s.queue).toEqual(['a', 'a']);
    expect(s.items.a?.firstRating).toBe(1);
    expect(s.lastDue).toEqual({ a: now + 600000 });
    expect(summarize(s, now).counts[1]).toBe(1);
  });

  it('can go back to the start of the session, and no further', () => {
    const start = createSession(ctx, 'enToJa', ['a', 'b', 'c'], now);
    let s = applyRating(start, mk('a'), 3, mk('a', { state: 2, due: now + 86400000 }), logId(), now);
    s = applyRating(s, mk('b'), 2, mk('b', { state: 1, due: now + 600000 }), logId(), now);
    s = applyRating(s, mk('c'), 4, mk('c', { state: 2, due: now + 4 * 86400000 }), logId(), now);
    expect(s.queue).toEqual(['a', 'b', 'c', 'b']);
    expect(s.index).toBe(3);
    s = undoLast(s);
    expect(s.index).toBe(2);
    expect(s.queue).toEqual(['a', 'b', 'c', 'b']);
    s = undoLast(s);
    expect(s.index).toBe(1);
    expect(s.queue).toEqual(['a', 'b', 'c']);
    s = undoLast(s);
    expect(s.index).toBe(0);
    expect(s.items).toEqual({ a: { shownCount: 0 }, b: { shownCount: 0 }, c: { shownCount: 0 } });
    expect(s.lastDue).toEqual({});
    expect(canUndo(s)).toBe(false);
    // 空のときは何も変えない
    expect(undoLast(s)).toBe(s);
  });
});

describe('rateAndSave', () => {
  beforeEach(async () => {
    await clearAll();
  });

  it('saves word and log immediately', async () => {
    const f = await createFolder('A', now);
    const w = await createWord({ folderId: f.id, englishTerm: 'a', japaneseDefinition: 'あ', memo: '' }, now);
    const r = await rateAndSave(w, 3, now);
    expect(r.ok).toBe(true);
    const stored = await getWord(w.id);
    expect(stored?.state).toBe(1);
    expect((await listReviewLogsForWord(w.id)).length).toBe(1);
  });

  it('rejects non-finite results without saving', async () => {
    const f = await createFolder('A', now);
    const w = await createWord({ folderId: f.id, englishTerm: 'a', japaneseDefinition: 'あ', memo: '' }, now);
    const broken = { ...w, state: 2 as const, stability: NaN, difficulty: NaN };
    const r = await rateAndSave(broken, 3, now);
    expect(r.ok).toBe(false);
    expect((await listReviewLogsForWord(w.id)).length).toBe(0);
  });
});

describe('undoAndSave', () => {
  beforeEach(async () => {
    await clearAll();
  });

  it('reverts the word, deletes the log and rewinds the session', async () => {
    const f = await createFolder('A', now);
    const a = await createWord({ folderId: f.id, englishTerm: 'a', japaneseDefinition: 'あ', memo: '' }, now);
    const b = await createWord({ folderId: f.id, englishTerm: 'b', japaneseDefinition: 'い', memo: '' }, now);
    let s = createSession(ctx, 'flashcard', [a.id, b.id], now);
    const r1 = await rateAndSave(a, 1, now);
    if (!r1.ok) throw new Error('save failed');
    s = applyRating(s, a, 1, r1.word, r1.log.id, now);
    const r2 = await rateAndSave(b, 3, now + 1000);
    if (!r2.ok) throw new Error('save failed');
    s = applyRating(s, b, 3, r2.word, r2.log.id, now + 1000);
    expect(s.queue).toEqual([a.id, b.id, a.id, b.id]);
    expect((await listReviewLogsForWord(b.id)).length).toBe(1);

    // b の評価を取り消す: 履歴が消え、FSRS 項目が New に戻る
    const u1 = await undoAndSave(s);
    expect(u1.ok).toBe(true);
    if (!u1.ok) return;
    expect(u1.wordId).toBe(b.id);
    s = u1.state;
    expect(s.index).toBe(1);
    expect(s.queue).toEqual([a.id, b.id, a.id]);
    expect((await listReviewLogsForWord(b.id)).length).toBe(0);
    const storedB = await getWord(b.id);
    expect(storedB).toMatchObject(newCardFields(now));
    expect(storedB?.englishTerm).toBe('b');
    // a はそのまま
    expect((await listReviewLogsForWord(a.id)).length).toBe(1);
    expect((await getWord(a.id))?.state).toBe(1);

    // a も取り消す: 開始時点に戻る
    const u2 = await undoAndSave(s);
    expect(u2.ok).toBe(true);
    if (!u2.ok) return;
    s = u2.state;
    expect(s.index).toBe(0);
    expect(s.queue).toEqual([a.id, b.id]);
    expect((await listReviewLogsForWord(a.id)).length).toBe(0);
    expect(await getWord(a.id)).toMatchObject(newCardFields(now));
    expect(summarize(s, now).rated).toBe(0);
    expect(canUndo(s)).toBe(false);

    // 空のときは失敗を返し、何もしない
    const u3 = await undoAndSave(s);
    expect(u3).toEqual({ ok: false, reason: 'empty' });
  });
});
