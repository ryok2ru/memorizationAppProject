import type { Word } from '../domain/types';
import { isWordValid, trimWord } from '../domain/validation';
import { buildNewWord, bulkAddWords, listWordsInFolder } from '../db/repo';

export interface ParsedRow {
  englishTerm: string;
  japaneseDefinition: string;
  memo: string;
}

export interface ParseResult {
  rows: ParsedRow[];
  formatErrors: number;
  delimiter: ',' | '\t';
  hadHeader: boolean;
}

/** 引用符を扱う行分割。区切り文字はタブかカンマ */
export function parseDelimited(text: string, delimiter: ',' | '\t'): string[][] {
  const records: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  let i = 0;
  const n = text.length;
  const pushField = () => {
    row.push(field);
    field = '';
  };
  const pushRow = () => {
    row.push(field);
    field = '';
    records.push(row);
    row = [];
  };
  while (i < n) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      field += ch;
      i += 1;
      continue;
    }
    if (ch === '"' && field.length === 0) {
      inQuotes = true;
      i += 1;
      continue;
    }
    if (ch === delimiter) {
      pushField();
      i += 1;
      continue;
    }
    if (ch === '\r') {
      i += 1;
      continue;
    }
    if (ch === '\n') {
      pushRow();
      i += 1;
      continue;
    }
    field += ch;
    i += 1;
  }
  if (field.length > 0 || row.length > 0) pushRow();
  return records;
}

const HEADER_PREFIXES = ['英単語', 'englishterm', 'english'];

export function isHeaderRow(first: string[]): boolean {
  const cell = (first[0] ?? '').replace(/^﻿/, '').trim().toLowerCase();
  return HEADER_PREFIXES.some((p) => cell.startsWith(p.toLowerCase()));
}

export function detectDelimiter(text: string): ',' | '\t' {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? '';
  return firstLine.includes('\t') ? '\t' : ',';
}

/** テキストを行に変換。BOM 除去、区切り判定、ヘッダー判定、バリデーション */
export function parseImportText(text: string): ParseResult {
  const body = text.replace(/^﻿/, '');
  const delimiter = detectDelimiter(body);
  const records = parseDelimited(body, delimiter);
  let hadHeader = false;
  if (records.length > 0 && isHeaderRow(records[0])) {
    hadHeader = true;
    records.shift();
  }
  const rows: ParsedRow[] = [];
  let formatErrors = 0;
  for (const rec of records) {
    if (rec.every((c) => c.trim() === '')) continue; // 空行は無視
    const candidate = trimWord({
      englishTerm: rec[0] ?? '',
      japaneseDefinition: rec[1] ?? '',
      memo: rec[2] ?? '',
    });
    if (!isWordValid(candidate)) {
      formatErrors += 1;
      continue;
    }
    rows.push(candidate);
  }
  return { rows, formatErrors, delimiter, hadHeader };
}

export interface ImportPlan {
  words: Word[];
  imported: number;
  duplicates: number;
  formatErrors: number;
}

/** 既存単語との重複（大文字小文字無視）とファイル内重複を除く */
export function planImport(text: string, folderId: string, existing: Word[], now = Date.now()): ImportPlan {
  const parsed = parseImportText(text);
  const seen = new Set(existing.map((w) => w.englishTerm.trim().toLowerCase()));
  const words: Word[] = [];
  let duplicates = 0;
  for (const row of parsed.rows) {
    const key = row.englishTerm.toLowerCase();
    if (seen.has(key)) {
      duplicates += 1;
      continue;
    }
    seen.add(key);
    words.push(buildNewWord({ folderId, ...row }, now));
  }
  return { words, imported: words.length, duplicates, formatErrors: parsed.formatErrors };
}

export function importResultMessage(plan: Pick<ImportPlan, 'imported' | 'duplicates' | 'formatErrors'>): string {
  const skipped = plan.duplicates + plan.formatErrors;
  return `${plan.imported}件を取り込みました（スキップ ${skipped}件: 重複 ${plan.duplicates}件、形式エラー ${plan.formatErrors}件）`;
}

export async function importText(text: string, folderId: string, now = Date.now()): Promise<ImportPlan> {
  const existing = await listWordsInFolder(folderId);
  const plan = planImport(text, folderId, existing, now);
  if (plan.words.length > 0) await bulkAddWords(plan.words);
  return plan;
}
