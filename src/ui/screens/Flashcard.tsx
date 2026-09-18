import { useEffect, useMemo, useRef, useState } from 'react';
import { ProgressBar } from '../components/ProgressBar';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { useStudy } from '../useStudy';
import { preview } from '../../domain/fsrs';
import { GRADES, GRADE_LABELS, type Grade } from '../../domain/types';

const SWIPE_THRESHOLD = 60;

function swipeGrade(dx: number, dy: number): Grade | null {
  if (Math.max(Math.abs(dx), Math.abs(dy)) < SWIPE_THRESHOLD) return null;
  if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? 3 : 2; // 右 = Good、左 = Hard
  return dy > 0 ? 1 : 4; // 下 = Again、上 = Easy
}

export function Flashcard() {
  const { session, word, message, busy, rate, quit, remaining, completed } = useStudy((m) => m === 'flashcard');
  const [flipped, setFlipped] = useState(false);
  const [confirmQuit, setConfirmQuit] = useState(false);
  const [drag, setDrag] = useState<{ dx: number; dy: number } | null>(null);
  const start = useRef<{ x: number; y: number; id: number } | null>(null);

  useEffect(() => {
    setFlipped(false);
    setDrag(null);
  }, [word?.id, session?.index]);

  const labels = useMemo(() => (word ? preview(word, Date.now()) : null), [word]);
  const dragGrade = drag ? swipeGrade(drag.dx, drag.dy) : null;

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!flipped) return;
    start.current = { x: e.clientX, y: e.clientY, id: e.pointerId };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!start.current || start.current.id !== e.pointerId) return;
    setDrag({ dx: e.clientX - start.current.x, dy: e.clientY - start.current.y });
  };
  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!start.current || start.current.id !== e.pointerId) return;
    const dx = e.clientX - start.current.x;
    const dy = e.clientY - start.current.y;
    start.current = null;
    setDrag(null);
    const g = flipped ? swipeGrade(dx, dy) : null;
    if (g) void rate(g);
    else if (Math.max(Math.abs(dx), Math.abs(dy)) < 8) setFlipped(true);
  };

  if (!session) return null;

  return (
    <div className="screen">
      <header className="header">
        <div className="header-side" />
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
          className="study-card"
          role="button"
          tabIndex={0}
          aria-label={flipped ? '裏面' : '表面。タップで裏返す'}
          data-testid="study-card"
          data-flipped={flipped}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={() => {
            start.current = null;
            setDrag(null);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') setFlipped(true);
          }}
          onClick={() => {
            // ポインター非対応環境（キーボード等）向けの反転
            if (!flipped) setFlipped(true);
          }}
          style={drag ? { transform: `translate(${drag.dx * 0.3}px, ${drag.dy * 0.3}px)` } : undefined}
        >
          {dragGrade && (
            <span className={`swipe-label grade-${dragGrade}`} data-testid="swipe-label">
              {GRADE_LABELS[dragGrade]}
            </span>
          )}
          {flipped ? (
            <>
              <div className="study-term small">{word.englishTerm}</div>
              <div className="study-def">{word.japaneseDefinition}</div>
              {word.memo && <div className="study-memo">{word.memo}</div>}
            </>
          ) : (
            <div className="study-term">{word.englishTerm}</div>
          )}
        </div>
      )}

      <div className="grade-buttons">
        {GRADES.map((g) => (
          <button
            key={g}
            type="button"
            className={`grade-btn grade-${g}`}
            disabled={!flipped || busy || !word}
            onClick={() => void rate(g)}
            data-testid={`grade-${g}`}
          >
            {GRADE_LABELS[g]}
            <small>{labels ? labels[g].label : ''}</small>
          </button>
        ))}
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
