import { describe, expect, it } from 'vitest';
import { detectDelimiter, importResultMessage, isHeaderRow, parseDelimited, parseImportText, planImport } from './csv';
import type { Word } from '../domain/types';
import { newCardFields } from '../domain/fsrs';

const now = 1_700_000_000_000;
const existing = (term: string): Word => ({
  id: term,
  folderId: 'f',
  englishTerm: term,
  japaneseDefinition: 'x',
  memo: '',
  createdAt: now,
  updatedAt: now,
  ...newCardFields(now),
});

describe('csv parsing', () => {
  it('detects tab vs comma from the first line', () => {
    expect(detectDelimiter('a\tb\nc,d')).toBe('\t');
    expect(detectDelimiter('a,b\nc\td')).toBe(',');
  });
  it('detects header rows', () => {
    expect(isHeaderRow(['英単語', '日本語訳'])).toBe(true);
    expect(isHeaderRow(['englishTerm'])).toBe(true);
    expect(isHeaderRow(['English word'])).toBe(true);
    expect(isHeaderRow(['﻿英単語'])).toBe(true);
    expect(isHeaderRow(['apple'])).toBe(false);
  });
  it('handles quotes, escaped quotes and newlines inside quotes', () => {
    const rows = parseDelimited('"a,b","say ""hi""","line1\nline2"\r\nc,d\n', ',');
    expect(rows).toEqual([
      ['a,b', 'say "hi"', 'line1\nline2'],
      ['c', 'd'],
    ]);
  });
  it('parses BOM + header + comma with quoted multi-candidate definition', () => {
    const text = '﻿英単語,日本語訳,メモ\nambiguous,"曖昧な,あいまいな",note\n';
    const r = parseImportText(text);
    expect(r.hadHeader).toBe(true);
    expect(r.delimiter).toBe(',');
    expect(r.rows).toEqual([{ englishTerm: 'ambiguous', japaneseDefinition: '曖昧な,あいまいな', memo: 'note' }]);
  });
  it('parses TSV without header and counts format errors', () => {
    const text = 'apple\tりんご\nbanana\t\n\t\n' + 'x'.repeat(201) + '\ty\n';
    const r = parseImportText(text);
    expect(r.delimiter).toBe('\t');
    expect(r.hadHeader).toBe(false);
    expect(r.rows.map((x) => x.englishTerm)).toEqual(['apple']);
    expect(r.formatErrors).toBe(2);
  });
});

describe('planImport', () => {
  it('skips duplicates ignoring case (existing and within the file)', () => {
    const text = 'Apple,りんご\nbanana,バナナ\nBANANA,ばなな\ncherry,さくらんぼ\n,missing\n';
    const plan = planImport(text, 'f', [existing('apple')], now);
    expect(plan.imported).toBe(2);
    expect(plan.duplicates).toBe(2);
    expect(plan.formatErrors).toBe(1);
    expect(plan.words.map((w) => w.englishTerm)).toEqual(['banana', 'cherry']);
    expect(plan.words[0].state).toBe(0);
    expect(plan.words[0].folderId).toBe('f');
    expect(importResultMessage(plan)).toBe('2件を取り込みました（スキップ 3件: 重複 2件、形式エラー 1件）');
  });
});
