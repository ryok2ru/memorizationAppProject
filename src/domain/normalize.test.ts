import { describe, expect, it } from 'vitest';
import { checkEn, checkJa, normalizeEn, normalizeJa, splitCandidates } from './normalize';

describe('normalizeJa', () => {
  it('converts full-width alphanumerics to half-width', () => {
    expect(normalizeJa('ＡＢＣ１２３')).toBe('ABC123');
  });
  it('converts half-width katakana to full-width', () => {
    expect(normalizeJa('ｱｲﾏｲ')).toBe('アイマイ');
  });
  it('trims surrounding whitespace', () => {
    expect(normalizeJa('  曖昧な　')).toBe('曖昧な');
  });
  it('does not unify hiragana and katakana', () => {
    expect(normalizeJa('あいまい')).not.toBe(normalizeJa('アイマイ'));
  });
});

describe('splitCandidates', () => {
  it('splits on , 、 ，', () => {
    expect(splitCandidates('曖昧な,あいまいな、不明瞭な，ぼんやりした')).toEqual([
      '曖昧な',
      'あいまいな',
      '不明瞭な',
      'ぼんやりした',
    ]);
  });
  it('drops empty candidates', () => {
    expect(splitCandidates('a,, b ,')).toEqual(['a', 'b']);
  });
});

describe('normalizeEn / checkEn', () => {
  it('ignores case', () => {
    expect(normalizeEn('  Ambiguous ')).toBe('ambiguous');
    expect(checkEn('ambiguous', 'AMBIGUOUS')).toBe(true);
  });
  it('rejects mismatch and empty input', () => {
    expect(checkEn('ambiguous', 'ambigous')).toBe(false);
    expect(checkEn('ambiguous', '   ')).toBe(false);
  });
});

describe('checkJa', () => {
  it('matches any candidate after normalization', () => {
    expect(checkJa('曖昧な,あいまいな', ' あいまいな ')).toBe(true);
    expect(checkJa('ＡＢＣ', 'abc')).toBe(false);
    expect(checkJa('ＡＢＣ', 'ABC')).toBe(true);
  });
  it('distinguishes hiragana from katakana', () => {
    expect(checkJa('あいまい', 'アイマイ')).toBe(false);
  });
  it('rejects empty input', () => {
    expect(checkJa('a', '')).toBe(false);
  });
});
