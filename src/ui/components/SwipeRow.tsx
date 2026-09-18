import { useRef, useState, type PointerEvent, type ReactNode } from 'react';

interface Props {
  /** 行幅の 20% 以上スワイプして離したときに呼ぶ */
  onDelete: () => void;
  disabled?: boolean;
  children: ReactNode;
}

/** 横か縦かを決めるまでの移動量 */
const DECIDE_PX = 10;
/** 削除が確定する移動量（行幅に対する割合）。未満で離したら元に戻す */
export const DELETE_RATIO = 0.2;

type Mode = 'undecided' | 'swipe' | 'scroll';

/**
 * 左スワイプで右端からゴミ箱が現れる行（7-3）。
 * 横方向の移動が縦方向より大きいときだけスワイプとして扱い、縦は touch-action: pan-y でブラウザのスクロールに任せる。
 */
export function SwipeRow({ onDelete, disabled = false, children }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const gesture = useRef<{ id: number; x: number; y: number; mode: Mode } | null>(null);
  /** 判定できる距離を動かしたか。動かした後の click では行のリンクへ遷移しない */
  const moved = useRef(false);
  const [offset, setOffset] = useState(0); // 0 以下（左方向）
  const [animating, setAnimating] = useState(false);

  const width = () => Math.max(1, ref.current?.clientWidth ?? 1);

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (disabled) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    gesture.current = { id: e.pointerId, x: e.clientX, y: e.clientY, mode: 'undecided' };
    moved.current = false;
    setAnimating(false);
  };

  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const g = gesture.current;
    if (!g || g.id !== e.pointerId) return;
    const dx = e.clientX - g.x;
    const dy = e.clientY - g.y;
    if (g.mode === 'undecided') {
      if (Math.abs(dx) < DECIDE_PX && Math.abs(dy) < DECIDE_PX) return;
      moved.current = true;
      if (Math.abs(dx) > Math.abs(dy)) {
        g.mode = 'swipe';
        try {
          e.currentTarget.setPointerCapture(e.pointerId);
        } catch {
          /* ignore */
        }
      } else {
        g.mode = 'scroll';
      }
    }
    if (g.mode !== 'swipe') return;
    setOffset(Math.max(-width(), Math.min(0, dx)));
  };

  const finish = (e: PointerEvent<HTMLDivElement>, cancelled: boolean) => {
    const g = gesture.current;
    if (!g || g.id !== e.pointerId) return;
    gesture.current = null;
    if (g.mode !== 'swipe') return;
    const dx = e.clientX - g.x;
    setAnimating(true);
    if (!cancelled && -dx >= width() * DELETE_RATIO) {
      setOffset(-width());
      onDelete();
    } else {
      setOffset(0);
    }
  };

  const reveal = Math.min(1, -offset / (width() * DELETE_RATIO));

  return (
    <div
      ref={ref}
      className="swipe-row"
      data-testid="swipe-row"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={(e) => finish(e, false)}
      onPointerCancel={(e) => finish(e, true)}
      onDragStart={(e) => e.preventDefault()} // リンクのネイティブドラッグでポインター操作が中断されないようにする
      onClickCapture={(e) => {
        if (moved.current) {
          e.preventDefault();
          e.stopPropagation();
          moved.current = false;
        }
      }}
    >
      <div className="swipe-under" aria-hidden="true" style={{ opacity: reveal, width: Math.max(56, -offset) }}>
        <span className="swipe-trash" style={{ transform: `scale(${0.6 + 0.4 * reveal})` }}>
          🗑
        </span>
      </div>
      <div className={`swipe-content${animating ? ' animating' : ''}`} style={{ transform: `translateX(${offset}px)` }}>
        {children}
      </div>
    </div>
  );
}
