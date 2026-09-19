import { useRef, useState, type PointerEvent, type ReactNode } from 'react';

interface Props {
  /** 左スワイプ（削除）。省略すると左スワイプは効かない */
  onDelete?: () => void;
  /** 右スワイプ（お気に入りの切り替え）。省略すると右スワイプは効かない */
  onFavorite?: () => void;
  /** 右スワイプで現れるアイコン。★ 付きの行は ★（外す動作）、そうでなければ ☆（付ける動作） */
  favorite?: boolean;
  disabled?: boolean;
  children: ReactNode;
}

/** 横か縦かを決めるまでの移動量 */
const DECIDE_PX = 10;
/** 確定する移動量（行幅に対する割合）。左（削除）も右（お気に入り）も同じで、未満で離したら元に戻す */
export const SWIPE_RATIO = 0.2;

type Mode = 'undecided' | 'swipe' | 'scroll';

/**
 * 横スワイプの行（7-3）。左にスワイプすると右端からゴミ箱（削除）、右にスワイプすると左端から ☆ / ★
 * （お気に入りの切り替え）が移動量に応じて徐々に現れる。
 * どちらも横方向の移動が縦方向より大きいときだけスワイプとして扱い、縦は touch-action: pan-y でブラウザのスクロールに任せる。
 */
export function SwipeRow({ onDelete, onFavorite, favorite = false, disabled = false, children }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const gesture = useRef<{ id: number; x: number; y: number; mode: Mode } | null>(null);
  /** 判定できる距離を動かしたか。動かした後の click では行のリンクへ遷移しない */
  const moved = useRef(false);
  const [offset, setOffset] = useState(0); // 負 = 左（削除）、正 = 右（お気に入り）
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
    // 効く向きにだけ動かす
    setOffset(Math.max(onDelete ? -width() : 0, Math.min(onFavorite ? width() : 0, dx)));
  };

  const finish = (e: PointerEvent<HTMLDivElement>, cancelled: boolean) => {
    const g = gesture.current;
    if (!g || g.id !== e.pointerId) return;
    gesture.current = null;
    if (g.mode !== 'swipe') return;
    const dx = e.clientX - g.x;
    const confirm = width() * SWIPE_RATIO;
    setAnimating(true);
    if (!cancelled && onDelete && -dx >= confirm) {
      setOffset(-width());
      onDelete();
    } else if (!cancelled && onFavorite && dx >= confirm) {
      // 行は一覧に残るので元の位置に戻し、切り替わった ★ だけが見える（確認や「元に戻す」は出さない）
      setOffset(0);
      onFavorite();
    } else {
      setOffset(0);
    }
  };

  const confirm = width() * SWIPE_RATIO;
  const deleteReveal = Math.min(1, Math.max(0, -offset) / confirm);
  const favoriteReveal = Math.min(1, Math.max(0, offset) / confirm);

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
      {onFavorite && (
        <div className="swipe-under favorite" aria-hidden="true" style={{ opacity: favoriteReveal, width: Math.max(56, offset) }}>
          <span className="swipe-icon" style={{ transform: `scale(${0.6 + 0.4 * favoriteReveal})` }}>
            {favorite ? '★' : '☆'}
          </span>
        </div>
      )}
      {onDelete && (
        <div className="swipe-under delete" aria-hidden="true" style={{ opacity: deleteReveal, width: Math.max(56, -offset) }}>
          <span className="swipe-icon" style={{ transform: `scale(${0.6 + 0.4 * deleteReveal})` }}>
            🗑
          </span>
        </div>
      )}
      <div className={`swipe-content${animating ? ' animating' : ''}`} style={{ transform: `translateX(${offset}px)` }}>
        {children}
      </div>
    </div>
  );
}
