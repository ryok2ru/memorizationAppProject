import { describe, expect, it } from 'vitest';
import { moveItem, reorderTarget, shiftFor } from './reorder';

// 高さ 64px、間隔 10px のカードが 4 枚（中心は 32, 106, 180, 254）
const centers = [32, 106, 180, 254];

describe('reorderTarget', () => {
  it('動かさなければ元の位置', () => {
    expect(reorderTarget(centers, 1, 0)).toBe(1);
  });

  it('次のカードの中心を越えたら 1 つ下、越えなければ元のまま', () => {
    expect(reorderTarget(centers, 0, 73)).toBe(0);
    expect(reorderTarget(centers, 0, 75)).toBe(1);
    expect(reorderTarget(centers, 0, 150)).toBe(2);
  });

  it('上へも動かせる', () => {
    expect(reorderTarget(centers, 3, -75)).toBe(2);
    expect(reorderTarget(centers, 3, -150)).toBe(1);
  });

  it('端を越えても 0〜末尾に収まる', () => {
    expect(reorderTarget(centers, 1, -1000)).toBe(0);
    expect(reorderTarget(centers, 1, 1000)).toBe(3);
  });
});

describe('moveItem', () => {
  it('下へ・上へ動かした新しい配列を返し、入力は変えない', () => {
    const list = ['a', 'b', 'c', 'd'];
    expect(moveItem(list, 0, 2)).toEqual(['b', 'c', 'a', 'd']);
    expect(moveItem(list, 3, 1)).toEqual(['a', 'd', 'b', 'c']);
    expect(moveItem(list, 2, 2)).toEqual(['a', 'b', 'c', 'd']);
    expect(list).toEqual(['a', 'b', 'c', 'd']);
  });
});

describe('shiftFor', () => {
  it('下へ動かすと間のカードが 1 つ上にずれる', () => {
    expect([0, 1, 2, 3].map((i) => shiftFor(i, 0, 2, 74))).toEqual([0, -74, -74, 0]);
  });

  it('上へ動かすと間のカードが 1 つ下にずれる', () => {
    expect([0, 1, 2, 3].map((i) => shiftFor(i, 3, 1, 74))).toEqual([0, 74, 74, 0]);
  });

  it('位置が変わらなければ何もずらさない', () => {
    expect([0, 1, 2, 3].map((i) => shiftFor(i, 2, 2, 74))).toEqual([0, 0, 0, 0]);
  });
});
