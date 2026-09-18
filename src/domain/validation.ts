import { LIMITS } from './types';

export interface WordInput {
  englishTerm: string;
  japaneseDefinition: string;
  memo: string;
}

export type WordErrors = Partial<Record<keyof WordInput, string>>;

export function validateWord(input: WordInput): WordErrors {
  const errors: WordErrors = {};
  const en = input.englishTerm.trim();
  const ja = input.japaneseDefinition.trim();
  if (en.length === 0) errors.englishTerm = '英単語を入力してください';
  else if (en.length > LIMITS.englishTerm)
    errors.englishTerm = `英単語は${LIMITS.englishTerm}文字以内にしてください`;
  if (ja.length === 0) errors.japaneseDefinition = '日本語訳を入力してください';
  else if (ja.length > LIMITS.japaneseDefinition)
    errors.japaneseDefinition = `日本語訳は${LIMITS.japaneseDefinition}文字以内にしてください`;
  if (input.memo.length > LIMITS.memo) errors.memo = `メモは${LIMITS.memo}文字以内にしてください`;
  return errors;
}

export const isWordValid = (input: WordInput) => Object.keys(validateWord(input)).length === 0;

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
