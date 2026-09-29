import { describe, expect, it } from 'vitest';
import { isWordValid, trimWord, validateFolderLabel, validateFolderName, validateWord } from './validation';
import { DEFAULT_LABELS } from './labels';

const ok = { englishTerm: 'apple', japaneseDefinition: 'りんご', memo: '' };
const L = DEFAULT_LABELS;

describe('validateWord', () => {
  it('accepts a valid word', () => {
    expect(validateWord(ok, L)).toEqual({});
    expect(isWordValid(ok)).toBe(true);
  });
  it('rejects blank after trim', () => {
    expect(validateWord({ ...ok, englishTerm: '   ' }, L).englishTerm).toBeTruthy();
    expect(validateWord({ ...ok, japaneseDefinition: '\t' }, L).japaneseDefinition).toBeTruthy();
  });
  it('enforces upper limits', () => {
    expect(validateWord({ ...ok, englishTerm: 'a'.repeat(200) }, L)).toEqual({});
    expect(validateWord({ ...ok, englishTerm: 'a'.repeat(201) }, L).englishTerm).toBeTruthy();
    expect(validateWord({ ...ok, japaneseDefinition: 'あ'.repeat(500) }, L)).toEqual({});
    expect(validateWord({ ...ok, japaneseDefinition: 'あ'.repeat(501) }, L).japaneseDefinition).toBeTruthy();
    expect(validateWord({ ...ok, memo: 'm'.repeat(1000) }, L)).toEqual({});
    expect(validateWord({ ...ok, memo: 'm'.repeat(1001) }, L).memo).toBeTruthy();
  });
  it('エラー文にフォルダの項目名を使う', () => {
    const labels = { front: '用語', back: '説明' };
    expect(validateWord({ ...ok, englishTerm: '' }, labels).englishTerm).toBe('用語を入力してください');
    expect(validateWord({ ...ok, japaneseDefinition: 'あ'.repeat(501) }, labels).japaneseDefinition).toBe('説明は500文字以内にしてください');
  });
  it('trims values', () => {
    expect(trimWord({ englishTerm: ' a ', japaneseDefinition: ' b ', memo: ' c ' })).toEqual({
      englishTerm: 'a',
      japaneseDefinition: 'b',
      memo: 'c',
    });
  });
});

describe('validateFolderName', () => {
  it('accepts a new unique name', () => {
    expect(validateFolderName('TOEIC', ['基本'])).toBeNull();
  });
  it('rejects blank and too long', () => {
    expect(validateFolderName('  ', [])).toBeTruthy();
    expect(validateFolderName('x'.repeat(50), [])).toBeNull();
    expect(validateFolderName('x'.repeat(51), [])).toBeTruthy();
  });
  it('rejects case-insensitive duplicates', () => {
    expect(validateFolderName('toeic', ['TOEIC'])).toBeTruthy();
    expect(validateFolderName(' Toeic ', ['toeic'])).toBeTruthy();
  });
});

describe('validateFolderLabel', () => {
  it('必須で 20 文字まで', () => {
    expect(validateFolderLabel('用語', '表の項目名')).toBeNull();
    expect(validateFolderLabel('  ', '表の項目名')).toBe('表の項目名を入力してください');
    expect(validateFolderLabel('x'.repeat(20), '裏の項目名')).toBeNull();
    expect(validateFolderLabel('x'.repeat(21), '裏の項目名')).toBe('裏の項目名は20文字以内にしてください');
  });
});
