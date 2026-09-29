import type { ImportColumnRole, ImportDelimiter, Settings, Word } from '../domain/types';
import { isWordValid, trimWord } from '../domain/validation';
import type { Labels } from '../domain/labels';
import { buildNewWord, bulkAddWords, listWordsInFolder } from '../db/repo';

export interface ParsedRow {
  englishTerm: string;
  japaneseDefinition: string;
  memo: string;
}

/** 取込画面で指定する 3 項目（10-3）。settings にも同じ形で保存する */
export interface ImportOptions {
  delimiter: ImportDelimiter;
  hasHeader: boolean;
  /** 左の列から順に割り当て。列数より短ければ残りは「使わない」 */
  columns: ImportColumnRole[];
}

export type ImportSettings = Pick<Settings, 'importDelimiter' | 'importHasHeader' | 'importColumns'>;

export const DELIMITER_OPTIONS: { value: ImportDelimiter; label: string }[] = [
  { value: ',', label: 'カンマ' },
  { value: '\t', label: 'タブ' },
  { value: ';', label: 'セミコロン' },
];

/** 列の割り当ての選択肢。en = カードの表、ja = カードの裏で、表示は取込先フォルダの項目名（10-3） */
export const roleOptions = (labels: Labels): { value: ImportColumnRole; label: string }[] => [
  { value: 'en', label: labels.front },
  { value: 'ja', label: labels.back },
  { value: 'memo', label: 'メモ' },
  { value: 'skip', label: '使わない' },
];

export const stripBom = (text: string) => text.replace(/^﻿/, '');

/** 引用符を扱う行分割。ダブルクォート内の区切り文字と改行を許し、"" は " */
export function parseDelimited(text: string, delimiter: ImportDelimiter): string[][] {
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

const firstLine = (text: string) => stripBom(text).split(/\r?\n/, 1)[0] ?? '';

/** 自動判定: 1 行目にタブがあればタブ、なければセミコロンがありカンマがなければセミコロン、それ以外はカンマ */
export function detectDelimiter(text: string): ImportDelimiter {
  const line = firstLine(text);
  if (line.includes('\t')) return '\t';
  if (line.includes(';') && !line.includes(',')) return ';';
  return ',';
}

/** 前回使った区切りが 1 行目に含まれていればそれ、なければ自動判定 */
export function initialDelimiter(text: string, saved: ImportDelimiter): ImportDelimiter {
  return firstLine(text).includes(saved) ? saved : detectDelimiter(text);
}

const HEADER_KEYWORDS: Record<Exclude<ImportColumnRole, 'skip'>, string[]> = {
  en: ['英単語', '英語', 'english', 'word', 'term'],
  ja: ['日本語', '訳', 'japanese', 'meaning', 'definition', 'translation'],
  memo: ['メモ', '備考', 'memo', 'note', 'comment'],
};

/**
 * 見出しのセルから列の役割を推定する。該当しなければ null。
 * labels（取込先フォルダの項目名）があれば、セル全体がそれと一致するかを先に見る（10-3）
 */
export function roleFromHeader(cell: string, labels?: Labels): ImportColumnRole | null {
  const c = stripBom(cell).trim().toLowerCase();
  if (c.length === 0) return null;
  if (labels) {
    if (c === labels.front.trim().toLowerCase()) return 'en';
    if (c === labels.back.trim().toLowerCase()) return 'ja';
  }
  for (const role of ['en', 'ja', 'memo'] as const) {
    if (HEADER_KEYWORDS[role].some((k) => c.startsWith(k.toLowerCase()))) return role;
  }
  return null;
}

/** 1 行目のいずれかのセルが見出しの語なら見出し行とみなす */
export const looksLikeHeader = (row: string[], labels?: Labels): boolean => row.some((c) => roleFromHeader(c, labels) != null);

/** 見出し行から割り当てを作る。表と裏の両方が見つからなければ null。同じ役割は先頭の列だけに付ける */
export function mappingFromHeader(row: string[], labels?: Labels): ImportColumnRole[] | null {
  const used = new Set<ImportColumnRole>();
  const mapping = row.map((cell) => {
    const role = roleFromHeader(cell, labels);
    if (!role || used.has(role)) return 'skip' as const;
    used.add(role);
    return role;
  });
  return used.has('en') && used.has('ja') ? mapping : null;
}

/** 列数に合わせて切り詰め / 「使わない」で埋める */
export function fitColumns(columns: ImportColumnRole[], count: number): ImportColumnRole[] {
  const out = columns.slice(0, count);
  while (out.length < count) out.push('skip');
  return out;
}

export const hasEnAndJa = (columns: ImportColumnRole[]) =>
  columns.filter((c) => c === 'en').length === 1 && columns.filter((c) => c === 'ja').length === 1;

export const columnCount = (records: string[][]) => records.reduce((m, r) => Math.max(m, r.length), 0);

/**
 * 列の割り当ての初期値（10-3）。
 * 1. 見出し行から表と裏が決まればそれ。
 * 2. 前回保存した割り当てが列数の範囲で表と裏を含めばそれ。
 * 3. それ以外は左から 表, 裏, メモ。
 */
export function initialColumns(records: string[][], hasHeader: boolean, saved: ImportColumnRole[], labels?: Labels): ImportColumnRole[] {
  const count = columnCount(records);
  if (hasHeader && records.length > 0) {
    const fromHeader = mappingFromHeader(records[0], labels);
    if (fromHeader) return fitColumns(fromHeader, count);
  }
  const fromSaved = fitColumns(saved, count);
  if (hasEnAndJa(fromSaved)) return fromSaved;
  return fitColumns(['en', 'ja', 'memo'], count);
}

/** ファイルを選んだ直後の初期値。見出しの有無は 1 行目に見出しの語があれば ON、なければ前回の値 */
export function initialOptions(text: string, saved: ImportSettings, labels?: Labels): ImportOptions {
  const delimiter = initialDelimiter(text, saved.importDelimiter);
  const records = parseDelimited(stripBom(text), delimiter);
  const hasHeader = records.length > 0 && looksLikeHeader(records[0], labels) ? true : saved.importHasHeader;
  return { delimiter, hasHeader, columns: initialColumns(records, hasHeader, saved.importColumns, labels) };
}

export interface ParseResult {
  rows: ParsedRow[];
  formatErrors: number;
}

/** 分割済みのレコードに割り当てを適用し、バリデーションする。見出し行と空行は除く */
export function mapRecords(records: string[][], options: ImportOptions): ParseResult {
  const rows: ParsedRow[] = [];
  let formatErrors = 0;
  const pick = (rec: string[], role: ImportColumnRole) => {
    const idx = options.columns.indexOf(role);
    return idx < 0 ? '' : (rec[idx] ?? '');
  };
  records.forEach((rec, i) => {
    if (options.hasHeader && i === 0) return;
    if (rec.every((c) => c.trim() === '')) return; // 空行は無視
    const candidate = trimWord({
      englishTerm: pick(rec, 'en'),
      japaneseDefinition: pick(rec, 'ja'),
      memo: pick(rec, 'memo'),
    });
    if (!isWordValid(candidate)) {
      formatErrors += 1;
      return;
    }
    rows.push(candidate);
  });
  return { rows, formatErrors };
}

/** テキストを行に変換。BOM 除去、区切り、見出し、列の割り当て、バリデーション */
export function parseImportText(text: string, options: ImportOptions): ParseResult {
  return mapRecords(parseDelimited(stripBom(text), options.delimiter), options);
}

export interface ImportPlan {
  words: Word[];
  imported: number;
  duplicates: number;
  formatErrors: number;
}

/** 既存単語との重複（大文字小文字無視）とファイル内重複を除く */
export function planImport(text: string, folderId: string, existing: Word[], options: ImportOptions, now = Date.now()): ImportPlan {
  const parsed = parseImportText(text, options);
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

export async function importText(text: string, folderId: string, options: ImportOptions, now = Date.now()): Promise<ImportPlan> {
  const existing = await listWordsInFolder(folderId);
  const plan = planImport(text, folderId, existing, options, now);
  if (plan.words.length > 0) await bulkAddWords(plan.words);
  return plan;
}
