import { useEffect, useRef, useState } from 'react';
import { ProgressBar } from '../components/ProgressBar';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { FavoriteButton } from '../components/FavoriteButton';
import { useStudy } from '../useStudy';
import { checkEn, checkJa, splitCandidates } from '../../domain/normalize';
import { GRADE_NAMES } from '../../domain/types';

export function Typing() {
  const { session, word, message, busy, rate, undo, canUndo, favorite, toggleFavorite, quit, remaining, completed } = useStudy(
    (m) => m === 'enToJa' || m === 'jaToEn',
  );
  const [input, setInput] = useState('');
  const [judged, setJudged] = useState<'ok' | 'ng' | null>(null);
  const [confirmQuit, setConfirmQuit] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const enToJa = session?.mode === 'enToJa';

  useEffect(() => {
    setInput('');
    setJudged(null);
    setTimeout(() => inputRef.current?.focus(), 0);
  }, [word?.id, session?.index]);

  // iOS のキーボードで入力欄が隠れないようにする（8-6）
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const onResize = () => inputRef.current?.scrollIntoView({ block: 'center' });
    vv.addEventListener('resize', onResize);
    return () => vv.removeEventListener('resize', onResize);
  }, []);

  if (!session) return null;

  const judge = () => {
    if (!word || judged) return;
    const ok = enToJa ? checkJa(word.japaneseDefinition, input) : checkEn(word.englishTerm, input);
    setJudged(ok ? 'ok' : 'ng');
  };

  const prompt = word ? (enToJa ? word.englishTerm : word.japaneseDefinition) : '';
  const answer = word ? (enToJa ? splitCandidates(word.japaneseDefinition).join('、') : word.englishTerm) : '';

  return (
    <div className="screen study-screen">
      <header className="header">
        <div className="header-side">
          <button
            type="button"
            className="btn-icon"
            aria-label="直前の評価を取り消す"
            disabled={!canUndo || busy}
            onClick={() => void undo()}
            data-testid="undo"
          >
            ↶
          </button>
        </div>
        <h1>{enToJa ? '英→日 入力' : '日→英 入力'}</h1>
        <div className="header-side right">
          {/* ☆ は ✕ の左。表面・裏面のどちらでも押せて、カードの反転や評価には関わらない（7-6） */}
          {word && <FavoriteButton favorite={favorite} onToggle={() => void toggleFavorite()} />}
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
        <>
          <div className="card center" data-testid="typing-prompt">
            <div className="study-term">{prompt}</div>
            {word.memo && judged && <div className="study-memo">{word.memo}</div>}
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              judge();
            }}
            style={{ display: 'flex', flexDirection: 'column', gap: 12 }}
          >
            {enToJa ? (
              <input
                ref={inputRef}
                type="text"
                lang="ja"
                value={input}
                disabled={!!judged}
                aria-label="答え"
                placeholder="日本語訳を入力"
                onChange={(e) => setInput(e.target.value)}
                data-testid="typing-input"
              />
            ) : (
              <input
                ref={inputRef}
                type="text"
                lang="en"
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
                value={input}
                disabled={!!judged}
                aria-label="答え"
                placeholder="英単語を入力"
                onChange={(e) => setInput(e.target.value)}
                data-testid="typing-input"
              />
            )}
            {!judged && (
              <div className="btn-row">
                <button type="button" className="btn-secondary" disabled={busy} onClick={() => void rate(2)}>
                  スキップ
                </button>
                <button type="submit" className="btn-primary" disabled={busy}>
                  確認
                </button>
              </div>
            )}
          </form>

          {judged && (
            <div className={`judge ${judged}`} data-testid="judge" role="status">
              <div className="mark">{judged === 'ok' ? '✓' : '✕'}</div>
              <div>
                正解: <strong>{answer}</strong>
              </div>
              {judged === 'ng' && <div className="muted">入力: {input || '（なし）'}</div>}
            </div>
          )}

          {judged === 'ok' && (
            <div className="btn-row">
              <button type="button" className="grade-btn grade-3" disabled={busy} onClick={() => void rate(3)} data-testid="grade-3">
                {GRADE_NAMES[3]}
              </button>
              <button type="button" className="grade-btn grade-4" disabled={busy} onClick={() => void rate(4)} data-testid="grade-4">
                {GRADE_NAMES[4]}
              </button>
            </div>
          )}
          {judged === 'ng' && (
            <button type="button" className="btn-primary" disabled={busy} onClick={() => void rate(1)}>
              次へ
            </button>
          )}
        </>
      )}

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
