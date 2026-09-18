import { describe, expect, it } from 'vitest';
import { isWordValid, trimWord, validateFolderName, validateWord } from './validation';

const ok = { englishTerm: 'apple', japaneseDefinition: 'りんご', memo: '' };

describe('validateWord', () => {
  it('accepts a valid word', () => {
    expect(validateWord(ok)).toEqual({});
    expect(isWordValid(ok)).toBe(true);
  });
  it('rejects blank after trim', () => {
    expect(validateWord({ ...ok, englishTerm: '   ' }).englishTerm).toBeTruthy();
    expect(validateWord({ ...ok, japaneseDefinition: '\t' }).japaneseDefinition).toBeTruthy();
  });
  it('enforces upper limits', () => {
    expect(validateWord({ ...ok, englishTerm: 'a'.repeat(200) })).toEqual({});
    expect(validateWord({ ...ok, englishTerm: 'a'.repeat(201) }).englishTerm).toBeTruthy();
    expect(validateWord({ ...ok, japaneseDefinition: 'あ'.repeat(500) })).toEqual({});
    expect(validateWord({ ...ok, japaneseDefinition: 'あ'.repeat(501) }).japaneseDefinition).toBeTruthy();
    expect(validateWord({ ...ok, memo: 'm'.repeat(1000) })).toEqual({});
    expect(validateWord({ ...ok, memo: 'm'.repeat(1001) }).memo).toBeTruthy();
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
