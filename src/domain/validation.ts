import { LIMITS } from './types';
import { DEFAULT_LABELS, type Labels } from './labels';

/** englishTerm = カードの表、japaneseDefinition = カードの裏（4-3） */
export interface WordInput {
  englishTerm: string;
  japaneseDefinition: string;
  memo: string;
}

export type WordErrors = Partial<Record<keyof WordInput, string>>;

/** エラー文の項目名は labels（所属フォルダの項目名）を使う */
export function validateWord(input: WordInput, labels: Labels): WordErrors {
  const errors: WordErrors = {};
  const en = input.englishTerm.trim();
  const ja = input.japaneseDefinition.trim();
  if (en.length === 0) errors.englishTerm = `${labels.front}を入力してください`;
  else if (en.length > LIMITS.englishTerm)
    errors.englishTerm = `${labels.front}は${LIMITS.englishTerm}文字以内にしてください`;
  if (ja.length === 0) errors.japaneseDefinition = `${labels.back}を入力してください`;
  else if (ja.length > LIMITS.japaneseDefinition)
    errors.japaneseDefinition = `${labels.back}は${LIMITS.japaneseDefinition}文字以内にしてください`;
  if (input.memo.length > LIMITS.memo) errors.memo = `メモは${LIMITS.memo}文字以内にしてください`;
  return errors;
}

/** 項目名はエラー文にしか使わないので、可否だけなら項目名は要らない */
export const isWordValid = (input: WordInput) => Object.keys(validateWord(input, DEFAULT_LABELS)).length === 0;

/** trim 済みの値を返す */
export function trimWord(input: WordInput): WordInput {
  return {
    englishTerm: input.englishTerm.trim(),
    japaneseDefinition: input.japaneseDefinition.trim(),
    memo: input.memo.trim(),
  };
}

/**
 * フォルダ名の検証。existingNames は自分以外の既存名。
 * 大文字小文字を区別せず一意。
 */
export function validateFolderName(name: string, existingNames: string[]): string | null {
  const n = name.trim();
  if (n.length === 0) return 'フォルダ名を入力してください';
  if (n.length > LIMITS.folderName) return `フォルダ名は${LIMITS.folderName}文字以内にしてください`;
  const lower = n.toLowerCase();
  if (existingNames.some((e) => e.trim().toLowerCase() === lower)) return '同じ名前のフォルダがあります';
  return null;
}

/** フォルダの項目名（表・裏）の検証（4-2）。name はエラー文に出す欄の名前 */
export function validateFolderLabel(label: string, name: string): string | null {
  const n = label.trim();
  if (n.length === 0) return `${name}を入力してください`;
  if (n.length > LIMITS.folderLabel) return `${name}は${LIMITS.folderLabel}文字以内にしてください`;
  return null;
}
