import { describe, expect, it } from 'vitest';
import { DEFAULT_LABELS, folderLabels, labelsForScope } from './labels';
import type { Folder } from './types';

const folder = (id: string, frontLabel: string, backLabel: string): Folder => ({ id, name: id, frontLabel, backLabel, createdAt: 0, sortOrder: 0 });

describe('folderLabels', () => {
  it('フォルダの項目名を返し、無ければ表・裏', () => {
    expect(folderLabels(folder('a', '用語', '説明'))).toEqual({ front: '用語', back: '説明' });
    expect(folderLabels(undefined)).toEqual(DEFAULT_LABELS);
    expect(folderLabels({ frontLabel: '', backLabel: '説明' })).toEqual({ front: '表', back: '説明' });
  });
});

describe('labelsForScope', () => {
  const en = folder('en', '英単語', '日本語訳');
  const en2 = folder('en2', '英単語', '日本語訳');
  const law = folder('law', '用語', '説明');

  it('フォルダならそのフォルダの項目名', () => {
    expect(labelsForScope('law', [en, law])).toEqual({ front: '用語', back: '説明' });
    // 見つからなければ表・裏
    expect(labelsForScope('gone', [en])).toEqual(DEFAULT_LABELS);
  });

  it('全フォルダ・お気に入りは、全フォルダの項目名が同じならそれ、違えば表・裏', () => {
    expect(labelsForScope('all', [en, en2])).toEqual({ front: '英単語', back: '日本語訳' });
    expect(labelsForScope('favorites', [en, en2])).toEqual({ front: '英単語', back: '日本語訳' });
    expect(labelsForScope('all', [en, law])).toEqual(DEFAULT_LABELS);
    expect(labelsForScope('favorites', [en, law])).toEqual(DEFAULT_LABELS);
    expect(labelsForScope('all', [])).toEqual(DEFAULT_LABELS);
  });
});
