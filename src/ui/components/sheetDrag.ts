import { useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type RefObject } from 'react';

/** これ以上引き下げて離したら閉じる（7-9） */
export const SHEET_CLOSE_PX = 80;
/** 短い距離でも払って閉じる速さ（px/ms） */
export const SHEET_FLICK_VELOCITY = 0.5;
/** 速さで閉じるのに最低限必要な距離（px）。タップを払いと数えないため */
export const SHEET_FLICK_PX = 10;
/** 速さを見る時間の窓（ms）。指を止めてから離したときに払いと数えないため */
export const SHEET_VELOCITY_WINDOW_MS = 100;
/** 指を離したあとの動き（元に戻る / 画面下まで滑る）の長さ（ms）。CSS の .sheet-slide と合わせる */
export const SHEET_SLIDE_MS = 200;

/** 見出しを引いた量（7-9）。上方向には動かさないので 0 以上に丸める */
export function sheetOffset(dy: number): number {
  return Math.max(0, dy);
}

/**
 * 背景の暗さの倍率（7-9）。引いた量に応じて薄くし、シートが画面下まで滑りきった時点で 0 にする。
 * 高さが測れないときは 1（従来どおりの暗さ）。
 */
export function backdropScale(dy: number, sheetHeight: number): number {
  if (sheetHeight <= 0) return 1;
  return Math.max(0, 1 - sheetOffset(dy) / sheetHeight);
}

/** 指の位置と時刻の記録。払う速さを求めるのに使う */
export interface Sample {
  y: number;
  t: number;
}

/**
 * 下に払う速さ（px/ms）。直近 SHEET_VELOCITY_WINDOW_MS の移動量から求める。
 * samples は古い順。指を止めてから離した場合は窓の中に古い記録が残らず、0 に近づく
 */
export function flickVelocity(samples: readonly Sample[], y: number, t: number): number {
  const from = samples.find((s) => t - s.t <= SHEET_VELOCITY_WINDOW_MS) ?? samples[samples.length - 1];
  if (!from) return 0;
  const dt = t - from.t;
  if (dt <= 0) return 0;
  return (y - from.y) / dt;
}

/** 指を離したときに閉じるか（7-9）。80px 以上引いた、または短い距離でも速く下に払った */
export function shouldCloseSheet(dy: number, velocity: number): boolean {
  const d = sheetOffset(dy);
  if (d >= SHEET_CLOSE_PX) return true;
  return d >= SHEET_FLICK_PX && velocity >= SHEET_FLICK_VELOCITY;
}

/** 記録しておく Sample の数。1 件 16ms 程度なので、速さの窓（100ms）より少し長く残る */
const MAX_SAMPLES = 10;

interface Gesture {
  id: number;
  /** 押し始めた y */
  y: number;
  samples: Sample[];
}

/** 指を離したあとの動き */
type Slide = 'none' | 'settle' | 'close';

export interface SheetDrag {
  /** 追従中と滑っている間だけ <dialog> に渡す style（transform と背景の暗さ） */
  style: CSSProperties | undefined;
  /** 滑っている間だけ true。CSS の遷移を付けるためのクラスに使う */
  sliding: boolean;
  /** 見出し（引っ張れる領域）にそのまま展開する pointer のハンドラ */
  handleProps: {
    onPointerDown: (e: ReactPointerEvent<HTMLElement>) => void;
    onPointerMove: (e: ReactPointerEvent<HTMLElement>) => void;
    onPointerUp: (e: ReactPointerEvent<HTMLElement>) => void;
    onPointerCancel: (e: ReactPointerEvent<HTMLElement>) => void;
  };
}

/**
 * 下から出るシートの見出しを引き下げて閉じる操作（7-9）。
 * 見出しにだけ付けるので、本文や選択肢は今までどおりスクロール・タップできる。
 * 閉じるときは外側タップと同じ `onClose`（キャンセル）を呼ぶ。
 * 外側タップの判定（modal.ts）は「押し始めが中身の外側」のときだけ閉じるので、
 * 見出しから始まるこの操作とは干渉しない。
 */
export function useSheetDrag(ref: RefObject<HTMLDialogElement>, open: boolean, onClose: () => void): SheetDrag {
  const [dy, setDy] = useState(0);
  /** 指を置いた時点のシートの高さ。背景の暗さと滑らせる距離に使う */
  const [height, setHeight] = useState(0);
  const [slide, setSlide] = useState<Slide>('none');
  const gesture = useRef<Gesture | null>(null);
  /** 描画ごとに変わる可能性のある onClose を、滑り終わりのタイマーから参照する */
  const close = useRef(onClose);
  close.current = onClose;

  // 閉じたら引いた量を捨てる（次に開くときは元の位置から）
  useEffect(() => {
    if (open) return;
    gesture.current = null;
    setDy(0);
    setSlide('none');
  }, [open]);

  // 滑り終わり。閉じる向きならキャンセルと同じ処理を呼ぶ
  useEffect(() => {
    if (slide === 'none') return undefined;
    const closing = slide === 'close';
    const t = setTimeout(() => {
      setSlide('none');
      if (closing) close.current();
    }, SHEET_SLIDE_MS);
    return () => clearTimeout(t);
  }, [slide]);

  const sheetHeight = () => ref.current?.getBoundingClientRect().height ?? 0;

  const handleProps = {
    onPointerDown: (e: ReactPointerEvent<HTMLElement>) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      gesture.current = { id: e.pointerId, y: e.clientY, samples: [{ y: e.clientY, t: e.timeStamp }] };
      setHeight(sheetHeight());
      setSlide('none');
      setDy(0);
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
    },
    onPointerMove: (e: ReactPointerEvent<HTMLElement>) => {
      const g = gesture.current;
      if (!g || g.id !== e.pointerId) return;
      g.samples.push({ y: e.clientY, t: e.timeStamp });
      if (g.samples.length > MAX_SAMPLES) g.samples.shift();
      setDy(sheetOffset(e.clientY - g.y));
    },
    onPointerUp: (e: ReactPointerEvent<HTMLElement>) => {
      const g = gesture.current;
      if (!g || g.id !== e.pointerId) return;
      gesture.current = null;
      const d = sheetOffset(e.clientY - g.y);
      if (shouldCloseSheet(d, flickVelocity(g.samples, e.clientY, e.timeStamp))) {
        // 画面下まで滑らせてから閉じる。下端は画面の下端にあるので、高さの分だけ動かせば隠れる
        const h = sheetHeight();
        setDy(h > 0 ? h : d + SHEET_CLOSE_PX);
        setSlide('close');
      } else {
        setDy(0);
        setSlide('settle');
      }
    },
    onPointerCancel: (e: ReactPointerEvent<HTMLElement>) => {
      const g = gesture.current;
      if (!g || g.id !== e.pointerId) return;
      gesture.current = null;
      setDy(0);
      setSlide('settle');
    },
  };

  const active = dy > 0 || slide !== 'none';
  const style = active
    ? ({ transform: `translateY(${dy}px)`, '--sheet-backdrop': String(backdropScale(dy, height)) } as CSSProperties)
    : undefined;
  return { style, sliding: slide !== 'none', handleProps };
}
