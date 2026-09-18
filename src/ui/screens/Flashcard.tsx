import { useEffect, useMemo, useRef, useState } from 'react';
import { ProgressBar } from '../components/ProgressBar';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { useStudy } from '../useStudy';
import { preview } from '../../domain/fsrs';
import { GRADES, GRADE_NAMES, type Grade } from '../../domain/types';

/** 横か縦かを決める移動量 */
const DECIDE_PX = 10;
/** 評価が確定する移動量 */
const CONFIRM_PX = 120;
/** 横スワイプの最大の傾き（度） */
const MAX_TILT_DEG = 8;
/** 背景と評価名の最大の不透明度 */
const MAX_OPACITY = 0.9;
/** カードが抜けるアニメーションの長さ（ms）。CSS の .study-card.leave と合わせる */
const LEAVE_MS = 250;
/** 元の位置に戻るアニメーションの長さ（ms）。CSS の .study-card.settle と合わせる */
const SETTLE_MS = 200;

type Axis = 'x' | 'y';
interface Drag {
  axis: Axis;
  /** 決めた軸方向の移動量（符号付き px） */
  d: number;
}
type Anim = 'none' | 'settle' | 'leave';

/** 下 = Again、左 = Hard、右 = Good、上 = Easy */
export function swipeGrade(axis: Axis, d: number): Grade {
  if (axis === 'x') return d > 0 ? 3 : 2;
  return d > 0 ? 1 : 4;
}

export function Flashcard() {
  const { session, word, message, busy, rate, undo, canUndo, quit, cardKey, isRestored, remaining, completed } = useStudy(
    (m) => m === 'flashcard',
  );
  const [flipped, setFlipped] = useState(false);
  const [confirmQuit, setConfirmQuit] = useState(false);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [anim, setAnim] = useState<Anim>('none');
  const gesture = useRef<{ id: number; x: number; y: number; axis: Axis | null } | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  // 出題位置が変わったら表面に戻す。取り消しで戻った位置は裏面（評価ボタン有効）で出す
  useEffect(() => {
    setFlipped(isRestored(cardKey));
    setDrag(null);
    setAnim('none');
    gesture.current = null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cardKey]);

  // ドラッグ中は touchmove の既定動作（スクロール・ラバーバンド）を止める。passive: false が必要
  useEffect(() => {
    const el = cardRef.current;
    if (!el) return;
    const onTouchMove = (e: TouchEvent) => {
      if (gesture.current) e.preventDefault();
    };
    el.addEventListener('touchmove', onTouchMove, { passive: false });
    return () => el.removeEventListener('touchmove', onTouchMove);
  }, [word?.id]);

  // 確定: カードが抜けた後に評価する。未確定: 戻るアニメーションの後に通常状態へ
  useEffect(() => {
    if (anim === 'leave' && drag) {
      const g = swipeGrade(drag.axis, drag.d);
      const t = setTimeout(() => void rate(g), LEAVE_MS);
      return () => clearTimeout(t);
    }
    if (anim === 'settle') {
      const t = setTimeout(() => setAnim('none'), SETTLE_MS);
      return () => clearTimeout(t);
    }
    return undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anim]);

  const labels = useMemo(() => (word ? preview(word, Date.now()) : null), [word]);
  const anyRequeue = labels != null && GRADES.some((g) => labels[g].requeue);

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (busy || anim === 'leave' || !word) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    gesture.current = { id: e.pointerId, x: e.clientX, y: e.clientY, axis: null };
    setAnim('none');
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  };
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const g = gesture.current;
    if (!g || g.id !== e.pointerId) return;
    const dx = e.clientX - g.x;
    const dy = e.clientY - g.y;
    if (!g.axis) {
      if (Math.abs(dx) < DECIDE_PX && Math.abs(dy) < DECIDE_PX) return;
      g.axis = Math.abs(dx) >= Math.abs(dy) ? 'x' : 'y';
    }
    setDrag({ axis: g.axis, d: g.axis === 'x' ? dx : dy });
  };
  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const g = gesture.current;
    if (!g || g.id !== e.pointerId) return;
    gesture.current = null;
    if (!g.axis) {
      // 10px 未満はタップ。表面なら裏返す
      setDrag(null);
      if (!flipped) setFlipped(true);
      return;
    }
    const d = g.axis === 'x' ? e.clientX - g.x : e.clientY - g.y;
    if (Math.abs(d) >= CONFIRM_PX) {
      setDrag({ axis: g.axis, d });
      setAnim('leave');
    } else {
      setDrag(null);
      setAnim('settle');
    }
  };
  const onPointerCancel = (e: React.PointerEvent<HTMLDivElement>) => {
    const g = gesture.current;
    if (!g || g.id !== e.pointerId) return;
    gesture.current = null;
    setDrag(null);
    setAnim('settle');
  };

  if (!session) return null;

  // スワイプ中の見た目: 追従、0〜120px で色と評価名を濃く、横は最大 8 度傾ける
  const dragGrade = drag ? swipeGrade(drag.axis, drag.d) : null;
  const progress = drag ? (anim === 'leave' ? 1 : Math.min(1, Math.abs(drag.d) / CONFIRM_PX)) : 0;
  let transform: string | undefined;
  if (drag) {
    const sign = drag.d > 0 ? 1 : -1;
    const tilt = drag.axis === 'x' ? MAX_TILT_DEG * Math.max(-1, Math.min(1, drag.d / CONFIRM_PX)) : 0;
    if (anim === 'leave') {
      const far = drag.axis === 'x' ? window.innerWidth + 200 : window.innerHeight + 200;
      transform = drag.axis === 'x' ? `translate(${sign * far}px, 0) rotate(${sign * MAX_TILT_DEG}deg)` : `translate(0, ${sign * far}px)`;
    } else {
      transform = drag.axis === 'x' ? `translate(${drag.d}px, 0) rotate(${tilt}deg)` : `translate(0, ${drag.d}px)`;
    }
  }
  const cardClass = `study-card${anim === 'leave' ? ' leave' : anim === 'settle' ? ' settle' : ''}`;

  return (
    <div className="screen study-screen">
      <header className="header">
        <div className="header-side">
          <button
            type="button"
            className="btn-icon"
            aria-label="直前の評価を取り消す"
            disabled={!canUndo || busy || anim === 'leave'}
            onClick={() => void undo()}
            data-testid="undo"
          >
            ↶
          </button>
        </div>
        <h1>フラッシュカード</h1>
        <div className="header-side right">
          <button type="button" className="btn-icon" aria-label="セッションを終了" onClick={() => setConfirmQuit(true)}>
            ✕
          </button>
        </div>
      </header>

      <ProgressBar remaining={remaining} completed={completed} />

      {message && (
        <div className="notice" role="alert">
          {message}
        </div>
      )}

      {word && (
        <div
          ref={cardRef}
          className={cardClass}
          role="button"
          tabIndex={0}
          aria-label={flipped ? '裏面' : '表面。タップで答えを表示。スワイプで評価'}
          data-testid="study-card"
          data-flipped={flipped}
          data-swipe-grade={dragGrade ?? undefined}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerCancel}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') setFlipped(true);
          }}
          onDragStart={(e) => e.preventDefault()}
          style={transform ? { transform } : undefined}
        >
          {flipped ? (
            <>
              <div className="study-term small">{word.englishTerm}</div>
              <div className="study-def">{word.japaneseDefinition}</div>
              {word.memo && <div className="study-memo">{word.memo}</div>}
            </>
          ) : (
            <>
              <div className="study-term">{word.englishTerm}</div>
              <div className="study-hint" data-testid="front-hint">
                タップで答えを表示。スワイプで評価
              </div>
            </>
          )}
          {dragGrade && (
            <>
              <div className={`swipe-fill grade-${dragGrade}`} style={{ opacity: MAX_OPACITY * progress }} aria-hidden="true" />
              <div className="swipe-grade" style={{ opacity: MAX_OPACITY * progress }} data-testid="swipe-label" aria-hidden="true">
                {GRADE_NAMES[dragGrade]}
              </div>
            </>
          )}
        </div>
      )}

      {/* 評価ボタンは裏面だけに表示する。表面では場所だけ確保して表示しない（カードの大きさを変えないため） */}
      <div className={`grade-area${flipped ? '' : ' hidden'}`} aria-hidden={!flipped}>
        <div className="grade-buttons">
          {GRADES.map((g) => (
            <button
              key={g}
              type="button"
              className={`grade-btn grade-${g}`}
              disabled={!flipped || busy || !word || anim === 'leave'}
              onClick={() => void rate(g)}
              data-testid={`grade-${g}`}
            >
              {GRADE_NAMES[g]}
              <small data-testid={`preview-${g}`}>{labels ? labels[g].label : ''}</small>
            </button>
          ))}
        </div>
        {anyRequeue && (
          <p className="requeue-hint" data-testid="requeue-hint">
            ↻ このセッションでもう一度出ます
          </p>
        )}
      </div>

      <ConfirmDialog
        open={confirmQuit}
        message="セッションを終了しますか？"
        confirmLabel="終了"
        onConfirm={() => {
          setConfirmQuit(false);
          void quit();
        }}
        onCancel={() => setConfirmQuit(false)}
      />
    </div>
  );
}
