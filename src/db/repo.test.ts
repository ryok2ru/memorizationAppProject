import { beforeEach, describe, expect, it } from 'vitest';
import { db } from './db';
import {
  clearAll,
  countByState,
  countNewWords,
  createFolder,
  createWord,
  deleteFolder,
  deleteWord,
  deleteWords,
  ensureFsrsFields,
  getSettings,
  getWord,
  listDueWords,
  listNewWords,
  listReviewLogsForWord,
  listReviewTimes,
  readSnapshot,
  replaceAll,
  resetProgress,
  saveRating,
  saveSettings,
} from './repo';
import { rate } from '../domain/fsrs';
import { addDays } from '../domain/dates';
import type { Word } from '../domain/types';

const now = new Date(2026, 8, 18, 10, 0, 0).getTime();

beforeEach(async () => {
  await clearAll();
});

describe('folders', () => {
  it('assigns increasing sortOrder', async () => {
    const a = await createFolder('A', now);
    const b = await createFolder('B', now);
    expect(a.sortOrder).toBe(0);
    expect(b.sortOrder).toBe(1);
  });

  it('deleteFolder cascades to words and review logs', async () => {
    const f = await createFolder('A', now);
    const other = await createFolder('B', now);
    const w = await createWord({ folderId: f.id, englishTerm: 'a', japaneseDefinition: 'あ', memo: '' }, now);
    const keep = await createWord({ folderId: other.id, englishTerm: 'b', japaneseDefinition: 'い', memo: '' }, now);
    const r = rate(w, 3, now);
    await saveRating(r.word, r.log);
    expect(await db.reviewLogs.count()).toBe(1);
    await deleteFolder(f.id);
    expect(await db.folders.count()).toBe(1);
    expect(await db.words.count()).toBe(1);
    expect(await getWord(keep.id)).toBeDefined();
    expect(await db.reviewLogs.count()).toBe(0);
  });
});

describe('words and queries', () => {
  it('lists due words (state != 0 and due <= end of today) in due order', async () => {
    const f = await createFolder('A', now);
    const g = await createFolder('B', now);
    const w1 = await createWord({ folderId: f.id, englishTerm: 'a', japaneseDefinition: 'あ', memo: '' }, now);
    const w2 = await createWord({ folderId: f.id, englishTerm: 'b', japaneseDefinition: 'い', memo: '' }, now);
    const w3 = await createWord({ folderId: g.id, englishTerm: 'c', japaneseDefinition: 'う', memo: '' }, now);
    await createWord({ folderId: f.id, englishTerm: 'd', japaneseDefinition: 'え', memo: '' }, now); // stays New
    // w1: reviewed, due later today (learning step)
    const r1 = rate(w1, 3, now);
    await saveRating(r1.word, r1.log);
    // w2: reviewed with Easy -> due in days (not today)
    const r2 = rate(w2, 4, now);
    await saveRating(r2.word, r2.log);
    // w3: overdue in another folder
    const r3 = rate(w3, 3, addDays(now, -3));
    await saveRating(r3.word, r3.log);

    const all = await listDueWords(null, now);
    expect(all.map((w) => w.id)).toEqual([w3.id, w1.id]);
    const inF = await listDueWords(f.id, now);
    expect(inF.map((w) => w.id)).toEqual([w1.id]);

    const news = await listNewWords(f.id, now);
    expect(news.map((w) => w.englishTerm)).toEqual(['d']);
    expect(await countNewWords(null)).toBe(1);
    const byState = await countByState(f.id);
    expect(byState).toEqual({ 0: 1, 1: 1, 2: 1, 3: 0 });
  });

  it('deleteWord removes its review logs', async () => {
    const f = await createFolder('A', now);
    const w = await createWord({ folderId: f.id, englishTerm: 'a', japaneseDefinition: 'あ', memo: '' }, now);
    const r = rate(w, 3, now);
    await saveRating(r.word, r.log);
    expect((await listReviewLogsForWord(w.id)).length).toBe(1);
    await deleteWord(w.id);
    expect(await getWord(w.id)).toBeUndefined();
    expect((await listReviewLogsForWord(w.id)).length).toBe(0);
  });

  it('deleteWords removes several words and their review logs in one go', async () => {
    const f = await createFolder('A', now);
    const a = await createWord({ folderId: f.id, englishTerm: 'a', japaneseDefinition: 'あ', memo: '' }, now);
    const b = await createWord({ folderId: f.id, englishTerm: 'b', japaneseDefinition: 'い', memo: '' }, now);
    const c = await createWord({ folderId: f.id, englishTerm: 'c', japaneseDefinition: 'う', memo: '' }, now);
    for (const w of [a, b, c]) {
      const r = rate(w, 3, now);
      await saveRating(r.word, r.log);
    }
    await deleteWords([a.id, c.id]);
    expect(await getWord(a.id)).toBeUndefined();
    expect(await getWord(b.id)).toBeDefined();
    expect(await getWord(c.id)).toBeUndefined();
    expect(await db.reviewLogs.count()).toBe(1);
    await deleteWords([]);
    expect(await db.words.count()).toBe(1);
  });

  it('resetProgress reinitialises FSRS fields but keeps logs', async () => {
    const f = await createFolder('A', now);
    const g = await createFolder('B', now);
    const w = await createWord({ folderId: f.id, englishTerm: 'a', japaneseDefinition: 'あ', memo: '' }, now);
    const v = await createWord({ folderId: g.id, englishTerm: 'b', japaneseDefinition: 'い', memo: '' }, now);
    for (const x of [w, v]) {
      const r = rate(x, 3, now);
      await saveRating(r.word, r.log);
    }
    const later = now + 1000;
    expect(await resetProgress(f.id, later)).toBe(1);
    const w2 = await getWord(w.id);
    expect(w2?.state).toBe(0);
    expect(w2?.reps).toBe(0);
    expect(w2?.last_review).toBeNull();
    expect(w2?.englishTerm).toBe('a');
    expect((await getWord(v.id))?.state).toBe(1);
    expect(await db.reviewLogs.count()).toBe(2);
    expect(await resetProgress(null, later)).toBe(2);
    expect((await getWord(v.id))?.state).toBe(0);
    expect((await listReviewTimes()).length).toBe(2);
  });

  it('ensureFsrsFields fills missing fields', () => {
    const partial = { id: 'x', folderId: 'f', englishTerm: 'a', japaneseDefinition: 'b', memo: '', createdAt: now, updatedAt: now } as Word;
    const fixed = ensureFsrsFields(partial, now);
    expect(fixed.state).toBe(0);
    expect(fixed.due).toBe(now);
    expect(fixed.last_review).toBeNull();
  });
});

describe('settings and snapshot', () => {
  it('returns defaults and persists patches', async () => {
    expect((await getSettings()).maxCardsPerSession).toBe(30);
    await saveSettings({ maxCardsPerSession: 50, notifyEnabled: true });
    const s = await getSettings();
    expect(s.maxCardsPerSession).toBe(50);
    expect(s.notifyEnabled).toBe(true);
    expect(s.id).toBe('app');
  });

  it('replaceAll replaces everything', async () => {
    const f = await createFolder('A', now);
    await createWord({ folderId: f.id, englishTerm: 'a', japaneseDefinition: 'あ', memo: '' }, now);
    const snap = await readSnapshot();
    await clearAll();
    await createFolder('Z', now);
    await replaceAll(snap);
    const after = await readSnapshot();
    expect(after.folders).toEqual(snap.folders);
    expect(after.words).toEqual(snap.words);
    expect(after.settings).toEqual(snap.settings);
  });
});
