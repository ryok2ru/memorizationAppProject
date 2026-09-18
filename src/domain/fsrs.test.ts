import { describe, expect, it } from 'vitest';
import { fromCard, isFinitePayload, newCardFields, preview, rate, retrievability, toCard } from './fsrs';
import type { Word } from './types';

const now = new Date(2026, 8, 18, 10, 0, 0).getTime();
const MIN = 60000;
const DAY = 86400000;

function makeWord(): Word {
  return {
    id: 'w1',
    folderId: 'f1',
    englishTerm: 'apple',
    japaneseDefinition: 'りんご',
    memo: '',
    createdAt: now,
    updatedAt: now,
    ...newCardFields(now),
  };
}

describe('fsrs wrapper', () => {
  it('newCardFields returns a New card', () => {
    const f = newCardFields(now);
    expect(f.state).toBe(0);
    expect(f.due).toBe(now);
    expect(f.last_review).toBeNull();
    expect(f.reps).toBe(0);
  });

  it('New + Good -> Learning, due about 10 minutes later', () => {
    const { word, log } = rate(makeWord(), 3, now);
    expect(word.state).toBe(1);
    expect(word.due - now).toBeGreaterThanOrEqual(9 * MIN);
    expect(word.due - now).toBeLessThanOrEqual(11 * MIN);
    expect(word.last_review).toBe(now);
    expect(log.wordId).toBe('w1');
    expect(log.rating).toBe(3);
    expect(log.state).toBe(0);
    expect(log.review).toBe(now);
  });

  it('Learning + Good -> Review, due at least 1 day later', () => {
    const first = rate(makeWord(), 3, now).word;
    const t2 = now + 10 * MIN;
    const { word } = rate(first, 3, t2);
    expect(word.state).toBe(2);
    expect(word.due - t2).toBeGreaterThanOrEqual(DAY - MIN);
  });

  it('Review + Again -> Relearning, lapses + 1', () => {
    const w1 = rate(makeWord(), 3, now).word;
    const w2 = rate(w1, 3, now + 10 * MIN).word;
    expect(w2.state).toBe(2);
    const t3 = w2.due + DAY;
    const { word } = rate(w2, 1, t3);
    expect(word.state).toBe(3);
    expect(word.lapses).toBe(w2.lapses + 1);
    expect(word.due - t3).toBeGreaterThanOrEqual(9 * MIN);
  });

  it('New + Easy -> Review', () => {
    const { word } = rate(makeWord(), 4, now);
    expect(word.state).toBe(2);
    expect(word.due - now).toBeGreaterThanOrEqual(DAY - MIN);
  });

  it('preview returns 4 labels', () => {
    const p = preview(makeWord(), now);
    expect(Object.keys(p)).toHaveLength(4);
    expect(p[1].label).toMatch(/分後$/);
    expect(p[3].label).toMatch(/分後$/);
    expect(p[4].label).toMatch(/日後$/);
    for (const g of [1, 2, 3, 4] as const) expect(p[g].due).toBeGreaterThan(now);
  });

  it('toCard / fromCard round trip', () => {
    const fields = rate(makeWord(), 3, now).word;
    const back = fromCard(toCard(fields));
    expect(back).toEqual({
      due: fields.due,
      stability: fields.stability,
      difficulty: fields.difficulty,
      elapsed_days: fields.elapsed_days,
      scheduled_days: fields.scheduled_days,
      learning_steps: fields.learning_steps,
      reps: fields.reps,
      lapses: fields.lapses,
      state: fields.state,
      last_review: fields.last_review,
    });
    const empty = fromCard(toCard(newCardFields(now)));
    expect(empty.last_review).toBeNull();
  });

  it('retrievability and finiteness check', () => {
    const w = rate(makeWord(), 3, now).word;
    const r = retrievability(w, now + 5 * MIN);
    expect(r).toBeGreaterThan(0);
    expect(r).toBeLessThanOrEqual(1);
    const { word, log } = rate(makeWord(), 3, now);
    expect(isFinitePayload(word, log)).toBe(true);
    expect(isFinitePayload({ ...word, stability: NaN }, log)).toBe(false);
  });
});
