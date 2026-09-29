import { describe, expect, it } from 'vitest';
import { bulkDeleteFoldersMessage } from './Home';

describe('bulkDeleteFoldersMessage', () => {
  it('names the folder count and the total cards under them', () => {
    expect(bulkDeleteFoldersMessage(2, 35)).toBe('2件のフォルダと配下のカード35枚、学習履歴をすべて削除します。よろしいですか？');
  });
});
