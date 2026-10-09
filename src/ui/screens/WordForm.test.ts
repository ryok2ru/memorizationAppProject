import { describe, expect, it } from 'vitest';
import { imageChanged } from './WordForm';

describe('imageChanged（7-4 の画像の変更判定）', () => {
  const data = new ArrayBuffer(4);
  const img = { data, type: 'image/jpeg', side: 'back' as const };

  it('同じ画像・同じ面なら変更なし', () => {
    expect(imageChanged(null, null)).toBe(false);
    expect(imageChanged(img, { ...img })).toBe(false);
  });

  it('追加・削除・差し替え・面の変更は変更あり', () => {
    expect(imageChanged(null, img)).toBe(true);
    expect(imageChanged(img, null)).toBe(true);
    expect(imageChanged(img, { ...img, data: new ArrayBuffer(4) })).toBe(true);
    expect(imageChanged(img, { ...img, side: 'front' })).toBe(true);
  });
});
