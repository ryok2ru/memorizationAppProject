import { describe, expect, it } from 'vitest';
import {
  SHEET_CLOSE_PX,
  SHEET_FLICK_PX,
  SHEET_FLICK_VELOCITY,
  SHEET_VELOCITY_WINDOW_MS,
  backdropScale,
  flickVelocity,
  sheetOffset,
  shouldCloseSheet,
  type Sample,
} from './sheetDrag';

describe('sheetOffset（見出しを引いた量。7-9）', () => {
  it('下に引いた分はそのまま', () => {
    expect(sheetOffset(0)).toBe(0);
    expect(sheetOffset(37)).toBe(37);
  });

  it('上方向には動かさない', () => {
    expect(sheetOffset(-1)).toBe(0);
    expect(sheetOffset(-120)).toBe(0);
  });
});

describe('backdropScale（引っ張り中の背景の暗さ。7-9）', () => {
  it('移動量に応じて薄くなり、画面下まで滑りきったら 0', () => {
    expect(backdropScale(0, 400)).toBe(1);
    expect(backdropScale(100, 400)).toBe(0.75);
    expect(backdropScale(400, 400)).toBe(0);
    expect(backdropScale(600, 400)).toBe(0);
  });

  it('上に引いても、高さが測れないときも従来どおりの暗さ', () => {
    expect(backdropScale(-50, 400)).toBe(1);
    expect(backdropScale(100, 0)).toBe(1);
  });
});

describe('flickVelocity（下に払う速さ。7-9）', () => {
  /** 16ms ごとに 8px 下に動いた記録（0.5px/ms） */
  const steady: Sample[] = [0, 1, 2, 3].map((i) => ({ y: i * 8, t: i * 16 }));

  it('直近の窓の中の移動量から求める', () => {
    expect(flickVelocity(steady, 32, 64)).toBeCloseTo(0.5, 5);
  });

  it('窓より古い記録は使わない', () => {
    const old: Sample[] = [{ y: 0, t: 0 }, { y: 200, t: 1000 }];
    // 1000ms 時点の記録だけが窓（100ms）の中。そこから 20px / 40ms
    expect(flickVelocity(old, 220, 1040)).toBeCloseTo(0.5, 5);
  });

  it('指を止めてから離したら 0 に近づく', () => {
    const paused = [...steady, { y: 24, t: SHEET_VELOCITY_WINDOW_MS * 5 }];
    expect(flickVelocity(paused, 24, SHEET_VELOCITY_WINDOW_MS * 5 + 200)).toBe(0);
  });

  it('記録が無い、または時間が進んでいないときは 0', () => {
    expect(flickVelocity([], 100, 100)).toBe(0);
    expect(flickVelocity([{ y: 0, t: 50 }], 30, 50)).toBe(0);
  });
});

describe('shouldCloseSheet（指を離したときに閉じるか。7-9）', () => {
  it('80px 以上引いて離したら閉じる', () => {
    expect(shouldCloseSheet(SHEET_CLOSE_PX, 0)).toBe(true);
    expect(shouldCloseSheet(SHEET_CLOSE_PX - 1, 0)).toBe(false);
  });

  it('短い距離でも速く下に払ったら閉じる', () => {
    expect(shouldCloseSheet(SHEET_FLICK_PX, SHEET_FLICK_VELOCITY)).toBe(true);
    expect(shouldCloseSheet(20, 1.2)).toBe(true);
  });

  it('タップや、ゆっくり少し引いただけでは閉じない', () => {
    expect(shouldCloseSheet(0, 0)).toBe(false);
    expect(shouldCloseSheet(SHEET_FLICK_PX - 1, 3)).toBe(false);
    expect(shouldCloseSheet(40, SHEET_FLICK_VELOCITY - 0.1)).toBe(false);
  });

  it('上に払っても閉じない', () => {
    expect(shouldCloseSheet(-100, -2)).toBe(false);
  });
});
