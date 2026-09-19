import { describe, expect, it } from 'vitest';
import { isOutside, outsidePress, type Edges } from './modal';

/** 幅 200 × 高さ 100 のダイアログを画面の (100, 50) に置いたときの 4 辺 */
const edges: Edges = { left: 100, right: 300, top: 50, bottom: 150 };

describe('isOutside（外側タップの座標判定。7-9）', () => {
  it('中身の上（余白を含む）は外側ではない', () => {
    expect(isOutside(edges, 200, 100)).toBe(false);
    expect(isOutside(edges, 100, 50)).toBe(false);
    expect(isOutside(edges, 300, 150)).toBe(false);
  });

  it('4 辺のどれかを外れたら外側', () => {
    expect(isOutside(edges, 99, 100)).toBe(true);
    expect(isOutside(edges, 301, 100)).toBe(true);
    expect(isOutside(edges, 200, 49)).toBe(true);
    expect(isOutside(edges, 200, 151)).toBe(true);
  });
});

describe('outsidePress（押し始めと離した位置の両方が外側のときだけ閉じる。7-9）', () => {
  it('外側で押して外側で離したら閉じる', () => {
    const press = outsidePress();
    press.start(true);
    expect(press.end(true)).toBe(true);
  });

  it('中身の上で押し始めたら、外側で離しても閉じない', () => {
    const press = outsidePress();
    press.start(false);
    expect(press.end(true)).toBe(false);
  });

  it('外側で押しても、中身の上で離したら閉じない', () => {
    const press = outsidePress();
    press.start(true);
    expect(press.end(false)).toBe(false);
  });

  it('押し始めが無いまま離しても閉じない', () => {
    expect(outsidePress().end(true)).toBe(false);
  });

  it('押下が取り消されたら、その後に外側で離しても閉じない', () => {
    const press = outsidePress();
    press.start(true);
    press.end(false); // pointercancel
    expect(press.end(true)).toBe(false);
  });
});
