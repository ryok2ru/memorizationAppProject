import { describe, expect, it } from 'vitest';
import { bulkDeleteFoldersMessage, copyFolderName } from './Home';
import { validateFolderName } from '../../domain/validation';

describe('bulkDeleteFoldersMessage', () => {
  it('names the folder count and the total cards under them', () => {
    expect(bulkDeleteFoldersMessage(2, 35)).toBe('2件のフォルダと配下のカード35枚、学習履歴をすべて削除します。よろしいですか？');
  });
});

describe('copyFolderName', () => {
  it('appends のコピー to the original name', () => {
    expect(copyFolderName('英単語', ['英単語'])).toBe('英単語のコピー');
  });

  it('numbers the copy from 2 when the name is taken, ignoring case like validateFolderName', () => {
    expect(copyFolderName('TOEIC', ['TOEIC', 'toeicのコピー'])).toBe('TOEICのコピー 2');
    expect(copyFolderName('TOEIC', ['TOEIC', 'TOEICのコピー', 'TOEICのコピー 2'])).toBe('TOEICのコピー 3');
  });

  it('trims the original name and fills a gap in the numbers', () => {
    expect(copyFolderName('  単語  ', ['単語', '単語のコピー', '単語のコピー 3'])).toBe('単語のコピー 2');
  });

  it('cuts the end of a long name so the result stays within 50 characters and passes validation', () => {
    const long = 'あ'.repeat(50);
    const first = copyFolderName(long, [long]);
    expect(first).toBe('あ'.repeat(46) + 'のコピー');
    const second = copyFolderName(long, [long, first]);
    expect(second).toBe('あ'.repeat(44) + 'のコピー 2');
    expect(validateFolderName(second, [long, first])).toBeNull();
  });
});
