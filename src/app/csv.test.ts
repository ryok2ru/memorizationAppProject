import { describe, expect, it } from 'vitest';
import {
  detectDelimiter,
  fitColumns,
  hasEnAndJa,
  importResultMessage,
  initialColumns,
  initialDelimiter,
  initialOptions,
  looksLikeHeader,
  mappingFromHeader,
  parseDelimited,
  parseImportText,
  planImport,
  roleFromHeader,
  type ImportOptions,
} from './csv';
import type { Word } from '../domain/types';
import { DEFAULT_SETTINGS } from '../domain/types';
import { newCardFields } from '../domain/fsrs';

const now = 1_700_000_000_000;
const existing = (term: string): Word => ({
  id: term,
  folderId: 'f',
  englishTerm: term,
  japaneseDefinition: 'x',
  memo: '',
  favorite: false,
  createdAt: now,
  updatedAt: now,
  ...newCardFields(now),
});
const saved = { importDelimiter: DEFAULT_SETTINGS.importDelimiter, importHasHeader: false, importColumns: DEFAULT_SETTINGS.importColumns };
const opts = (patch: Partial<ImportOptions> = {}): ImportOptions => ({ delimiter: ',', hasHeader: false, columns: ['en', 'ja', 'memo'], ...patch });

describe('delimiter detection', () => {
  it('detects tab, semicolon and comma from the first line', () => {
    expect(detectDelimiter('a\tb\nc,d')).toBe('\t');
    expect(detectDelimiter('a,b\nc\td')).toBe(',');
    expect(detectDelimiter('a;b\nc;d')).toBe(';');
    expect(detectDelimiter('a;"b,c"\n')).toBe(','); // カンマがあればカンマ
    expect(detectDelimiter('﻿a\tb')).toBe('\t');
  });
  it('prefers the saved delimiter when the first line contains it', () => {
    expect(initialDelimiter('a;"b,c"\n', ';')).toBe(';');
    expect(initialDelimiter('a\tb\n', ',')).toBe('\t');
    expect(initialDelimiter('a,b\n', ';')).toBe(',');
  });
});

describe('header detection and column mapping', () => {
  it('maps header cells to roles', () => {
    expect(roleFromHeader('英単語')).toBe('en');
    expect(roleFromHeader('﻿English word')).toBe('en');
    expect(roleFromHeader('englishTerm')).toBe('en');
    expect(roleFromHeader('日本語訳')).toBe('ja');
    expect(roleFromHeader('Japanese')).toBe('ja');
    expect(roleFromHeader('メモ')).toBe('memo');
    expect(roleFromHeader('note')).toBe('memo');
    expect(roleFromHeader('apple')).toBeNull();
    expect(roleFromHeader('')).toBeNull();
  });
  it('looksLikeHeader needs at least one header word', () => {
    expect(looksLikeHeader(['英単語', '日本語訳'])).toBe(true);
    expect(looksLikeHeader(['x', 'meaning'])).toBe(true);
    expect(looksLikeHeader(['apple', 'りんご'])).toBe(false);
  });
  it('mappingFromHeader requires en and ja and keeps only the first of duplicates', () => {
    expect(mappingFromHeader(['メモ', '日本語訳', '英単語'])).toEqual(['memo', 'ja', 'en']);
    expect(mappingFromHeader(['英単語', 'english', '日本語訳'])).toEqual(['en', 'skip', 'ja']);
    expect(mappingFromHeader(['英単語', 'メモ'])).toBeNull();
  });
  it('fitColumns pads and truncates', () => {
    expect(fitColumns(['en', 'ja', 'memo'], 2)).toEqual(['en', 'ja']);
    expect(fitColumns(['en', 'ja'], 4)).toEqual(['en', 'ja', 'skip', 'skip']);
    expect(hasEnAndJa(['ja', 'skip', 'en'])).toBe(true);
    expect(hasEnAndJa(['en', 'en', 'ja'])).toBe(false);
  });
  it('initialColumns: header > saved > default', () => {
    const rows = [
      ['メモ', '日本語訳', '英単語'],
      ['m', 'j', 'e'],
    ];
    expect(initialColumns(rows, true, ['en', 'ja', 'memo'])).toEqual(['memo', 'ja', 'en']);
    expect(initialColumns(rows, false, ['ja', 'en', 'skip'])).toEqual(['ja', 'en', 'skip']);
    expect(initialColumns([['a', 'b']], false, ['skip', 'skip', 'en', 'ja'])).toEqual(['en', 'ja']);
    expect(initialColumns([['a', 'b', 'c', 'd']], false, ['en', 'ja'])).toEqual(['en', 'ja', 'skip', 'skip']);
    expect(initialColumns([['a', 'b', 'c', 'd']], false, ['en', 'en'])).toEqual(['en', 'ja', 'memo', 'skip']);
  });
  it('initialOptions turns the header on when the first row has header words, else uses the saved value', () => {
    const withHeader = initialOptions('英単語,日本語訳\napple,りんご\n', { ...saved, importHasHeader: false });
    expect(withHeader).toEqual({ delimiter: ',', hasHeader: true, columns: ['en', 'ja'] });
    const noHeader = initialOptions('apple\tりんご\tmemo\n', { ...saved, importHasHeader: true, importColumns: ['ja', 'en', 'memo'] });
    expect(noHeader).toEqual({ delimiter: '\t', hasHeader: true, columns: ['ja', 'en', 'memo'] });
    const plain = initialOptions('apple;りんご\n', { ...saved, importDelimiter: ';' });
    expect(plain).toEqual({ delimiter: ';', hasHeader: false, columns: ['en', 'ja'] });
  });
});

describe('parsing', () => {
  it('handles quotes, escaped quotes and newlines inside quotes', () => {
    const rows = parseDelimited('"a,b","say ""hi""","line1\nline2"\r\nc,d\n', ',');
    expect(rows).toEqual([
      ['a,b', 'say "hi"', 'line1\nline2'],
      ['c', 'd'],
    ]);
    expect(parseDelimited('a;"b;c"\n', ';')).toEqual([['a', 'b;c']]);
  });
  it('parses BOM + header + comma with quoted multi-candidate definition', () => {
    const text = '﻿英単語,日本語訳,メモ\nambiguous,"曖昧な,あいまいな",note\n';
    const r = parseImportText(text, opts({ hasHeader: true }));
    expect(r.rows).toEqual([{ englishTerm: 'ambiguous', japaneseDefinition: '曖昧な,あいまいな', memo: 'note' }]);
    expect(r.formatErrors).toBe(0);
  });
  it('applies the column mapping and ignores skipped columns', () => {
    const text = 'x\tりんご\tapple\tnote\n';
    const r = parseImportText(text, opts({ delimiter: '\t', columns: ['skip', 'ja', 'en', 'memo'] }));
    expect(r.rows).toEqual([{ englishTerm: 'apple', japaneseDefinition: 'りんご', memo: 'note' }]);
    const noMemo = parseImportText(text, opts({ delimiter: '\t', columns: ['skip', 'ja', 'en'] }));
    expect(noMemo.rows[0].memo).toBe('');
  });
  it('treats the first row as data when hasHeader is off, and counts format errors', () => {
    const text = 'apple\tりんご\nbanana\t\n\t\n' + 'x'.repeat(201) + '\ty\n';
    const r = parseImportText(text, opts({ delimiter: '\t' }));
    expect(r.rows.map((x) => x.englishTerm)).toEqual(['apple']);
    expect(r.formatErrors).toBe(2);
    const header = parseImportText('英単語,日本語訳\napple,りんご\n', opts());
    expect(header.rows.map((x) => x.englishTerm)).toEqual(['英単語', 'apple']);
  });
});

describe('planImport', () => {
  it('skips duplicates ignoring case (existing and within the file)', () => {
    const text = 'Apple,りんご\nbanana,バナナ\nBANANA,ばなな\ncherry,さくらんぼ\n,missing\n';
    const plan = planImport(text, 'f', [existing('apple')], opts(), now);
    expect(plan.imported).toBe(2);
    expect(plan.duplicates).toBe(2);
    expect(plan.formatErrors).toBe(1);
    expect(plan.words.map((w) => w.englishTerm)).toEqual(['banana', 'cherry']);
    expect(plan.words[0].state).toBe(0);
    expect(plan.words[0].folderId).toBe('f');
    expect(importResultMessage(plan)).toBe('2件を取り込みました（スキップ 3件: 重複 2件、形式エラー 1件）');
  });
});
