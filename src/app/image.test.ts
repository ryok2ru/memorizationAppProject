import { describe, expect, it } from 'vitest';
import { fitSize, imageVisible } from './image';

describe('fitSize（4-8 の縮小）', () => {
  it('長辺を 1280px に収め、縦横比を保つ', () => {
    expect(fitSize(4032, 3024)).toEqual({ width: 1280, height: 960 });
    expect(fitSize(3024, 4032)).toEqual({ width: 960, height: 1280 });
  });

  it('小さい画像は拡大しない', () => {
    expect(fitSize(800, 600)).toEqual({ width: 800, height: 600 });
    expect(fitSize(1280, 1280)).toEqual({ width: 1280, height: 1280 });
  });

  it('極端に細長くても 1px 未満にしない', () => {
    expect(fitSize(100000, 10)).toEqual({ width: 1280, height: 1 });
  });
});

describe('imageVisible（6-4 の画像を出す面）', () => {
  it('表に付けた画像は表が出ているとき、裏に付けた画像は裏が出ているときに出る', () => {
    // フラッシュカードの表面（表だけ）
    expect(imageVisible('front', { front: true, back: false })).toBe(true);
    expect(imageVisible('back', { front: true, back: false })).toBe(false);
    // フラッシュカードの裏面・タイプ入力の判定後（両方）
    expect(imageVisible('front', { front: true, back: true })).toBe(true);
    expect(imageVisible('back', { front: true, back: true })).toBe(true);
    // 裏→表の出題中（裏だけ）
    expect(imageVisible('front', { front: false, back: true })).toBe(false);
    expect(imageVisible('back', { front: false, back: true })).toBe(true);
  });
});
