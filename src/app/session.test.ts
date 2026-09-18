import { beforeEach, describe, expect, it } from 'vitest';
import {
  applyRating,
  completed,
  createSession,
  currentWordId,
  endEarly,
  isFinished,
  rateAndSave,
  remaining,
  summarize,
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

describe('session state', () => {
  it('counts only the first rating and re-queues learning cards', () => {
    let s = createSession(ctx, 'flashcard', ['a', 'b'], now);
    expect(currentWordId(s)).toBe('a');
    expect(remaining(s)).toBe(2);
    s = applyRating(s, 'a', 1, mk('a', { state: 1, due: now + 600000 }), now);
    expect(s.queue).toEqual(['a', 'b', 'a']);
    expect(s.index).toBe(1);
    expect(completed(s)).toBe(1);
    expect(remaining(s)).toBe(2);
    s = applyRating(s, 'b', 3, mk('b', { state: 2, due: now + 86400000 }), now);
    expect(s.queue).toEqual(['a', 'b', 'a']);
    expect(isFinished(s)).toBe(false);
    s = applyRating(s, 'a', 3, mk('a', { state: 2, due: now + 86400000 }), now + 1000);
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
    s = applyRating(s, 'a', 1, mk('a', { state: 3, due: now + 600000 }), now);
    expect(s.queue).toEqual(['a', 'a']);
    expect(isFinished(s)).toBe(false);
  });

  it('endEarly marks the session and keeps saved ratings', () => {
    let s = createSession(ctx, 'enToJa', ['a', 'b', 'c'], now);
    s = applyRating(s, 'a', 4, mk('a', { state: 2, due: now + 3 * 86400000 }), now);
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
    s = applyRating(s, 'a', 3, mk('a', { state: 2 }), now);
    s = applyRating(s, 'b', 2, mk('b', { state: 2 }), now);
    s = applyRating(s, 'c', 1, mk('c', { state: 2 }), now);
    expect(summarize(s).accuracy).toBe(33);
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
