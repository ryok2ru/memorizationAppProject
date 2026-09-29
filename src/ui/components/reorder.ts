import { useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type RefObject } from 'react';

/**
 * 落とす位置（7-2 のフォルダの並び替え）。centers は各項目の中心の y（上から順）、from はつかんだ項目、dy は指の移動量。
 * つかんだ項目の中心（centers[from] + dy）より上に中心がある他の項目の数を返す。0〜centers.length − 1 に収まる
 */
export function reorderTarget(centers: readonly number[], from: number, dy: number): number {
  const c = centers[from] + dy;
  return centers.reduce((n, y, i) => (i !== from && y < c ? n + 1 : n), 0);
}

/** from の項目を to の位置へ動かした新しい配列。入力の配列は変えない */
export function moveItem<T>(list: readonly T[], from: number, to: number): T[] {
  const next = list.slice();
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

/**
 * ドラッグ中に他の項目をずらす量（px）。from より下から to までの項目は 1 つ上（−step）、
 * to から from より上までの項目は 1 つ下（+step）。つかんだ項目自身と範囲外は 0
 */
export function shiftFor(i: number, from: number, to: number, step: number): number {
  if (i === from) return 0;
  if (from < to && i > from && i <= to) return -step;
  if (to < from && i >= to && i < from) return step;
  return 0;
}

interface Drag {
  id: number;
  from: number;
  /** 押し始めた y */
  y: number;
  centers: number[];
  /** つかんだ項目の高さ + 項目の間隔。他の項目をずらす量 */
  step: number;
}

export interface Reorder {
  /** ドラッグ中なら true。一覧に付けるクラス（ずらす動きの transition）に使う */
  dragging: boolean;
  /** 各項目（li）に渡す style とクラス */
  itemProps: (i: number) => { style: CSSProperties | undefined; className: string };
  /** つまみ（≡）にそのまま展開する pointer のハンドラ */
  handleProps: (i: number) => {
    onPointerDown: (e: ReactPointerEvent<HTMLElement>) => void;
    onPointerMove: (e: ReactPointerEvent<HTMLElement>) => void;
    onPointerUp: (e: ReactPointerEvent<HTMLElement>) => void;
    onPointerCancel: (e: ReactPointerEvent<HTMLElement>) => void;
  };
}

/**
 * つまみを縦にドラッグして一覧の項目を並べ替える（7-2）。
 * list は項目（直下の li）を持つ要素。指を置いた時点で各項目の位置を測り、つかんだ項目を指に追従させ、
 * 他の項目は落とす位置に合わせてずらす。離したら onDrop(from, to) を呼ぶ（位置が変わらなければ呼ばない）。
 */
export function useReorder(list: RefObject<HTMLElement>, onDrop: (from: number, to: number) => void): Reorder {
  const drag = useRef<Drag | null>(null);
  const [state, setState] = useState<{ drag: Drag; dy: number } | null>(null);

  const end = () => {
    drag.current = null;
    setState(null);
  };

  const handleProps = (i: number) => ({
    onPointerDown: (e: ReactPointerEvent<HTMLElement>) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      const el = list.current;
      if (!el) return;
      const rects = Array.from(el.querySelectorAll(':scope > li')).map((li) => li.getBoundingClientRect());
      if (!rects[i]) return;
      const gap = parseFloat(getComputedStyle(el).rowGap) || 0;
      const d: Drag = {
        id: e.pointerId,
        from: i,
        y: e.clientY,
        centers: rects.map((r) => r.top + r.height / 2),
        step: rects[i].height + gap,
      };
      drag.current = d;
      setState({ drag: d, dy: 0 });
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
    },
    onPointerMove: (e: ReactPointerEvent<HTMLElement>) => {
      const d = drag.current;
      if (!d || d.id !== e.pointerId) return;
      setState({ drag: d, dy: e.clientY - d.y });
    },
    onPointerUp: (e: ReactPointerEvent<HTMLElement>) => {
      const d = drag.current;
      if (!d || d.id !== e.pointerId) return;
      const to = reorderTarget(d.centers, d.from, e.clientY - d.y);
      end();
      if (to !== d.from) onDrop(d.from, to);
    },
    onPointerCancel: (e: ReactPointerEvent<HTMLElement>) => {
      const d = drag.current;
      if (!d || d.id !== e.pointerId) return;
      end();
    },
  });

  const itemProps = (i: number) => {
    if (!state) return { style: undefined, className: '' };
    const { drag: d, dy } = state;
    if (i === d.from) return { style: { transform: `translateY(${dy}px)` }, className: ' reorder-active' };
    const shift = shiftFor(i, d.from, reorderTarget(d.centers, d.from, dy), d.step);
    return { style: shift === 0 ? undefined : { transform: `translateY(${shift}px)` }, className: '' };
  };

  return { dragging: state != null, itemProps, handleProps };
}
