import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Header } from '../components/Header';
import { useAsync, errorMessage } from '../hooks';
import { getSession, ratedEntries, setSession, summarize } from '../../app/session';
import { hadStudiedTodayBefore, loadStreak } from '../../app/streak';
import { loadSettings } from '../../app/settings';
import { finishToday } from '../../app/notify';
import { updateBadge } from '../../app/badge';
import { getWords, setFavorite } from '../../db/repo';
import { formatDuration, nextReviewLabel, reviewDayLabel } from '../../domain/dates';
import { GRADES, GRADE_NAMES, type Word } from '../../domain/types';

export function Result() {
  const navigate = useNavigate();
  const [session] = useState(() => getSession());
  const [message, setMessage] = useState<string | null>(null);
  /** 一覧の ☆ を押した分の上書き。押した時点で保存するので、読み直さずにこの画面だけで表示を切り替える */
  const [favorites, setFavorites] = useState<Record<string, boolean>>({});
  const { data } = useAsync(async () => {
    if (!session) return null;
    // 評価した単語を出題順に（7-7）。単語の本文は id から読み直す
    const entries = ratedEntries(session);
    const [streak, studiedBefore, settings, words] = await Promise.all([
      loadStreak(),
      hadStudiedTodayBefore(session.startedAt),
      loadSettings(),
      getWords(entries.map((e) => e.wordId)),
    ]);
    const rows = entries
      .map((e) => ({ ...e, word: words.get(e.wordId) }))
      .filter((r): r is typeof r & { word: Word } => r.word != null);
    return { streak, firstToday: streak.isActiveToday && !studiedBefore, settings, rows };
  }, [session?.startedAt]);

  useEffect(() => {
    if (!session) navigate('/', { replace: true });
    else void updateBadge();
  }, [session, navigate]);

  if (!session) return null;
  const summary = summarize(session);
  const now = Date.now();

  const onFinishToday = async () => {
    try {
      const { url } = await finishToday();
      window.location.href = url;
    } catch (e) {
      setMessage(errorMessage(e));
    }
  };

  /** 一覧の ☆（7-7）。押すたびに切り替えてその場で保存する */
  const toggleFavorite = async (word: Word) => {
    const next = !(favorites[word.id] ?? word.favorite);
    setFavorites((f) => ({ ...f, [word.id]: next }));
    try {
      await setFavorite(word.id, next);
    } catch (e) {
      console.error('failed to toggle favorite', e);
      setFavorites((f) => ({ ...f, [word.id]: !next }));
      setMessage(errorMessage(e));
    }
  };

  const goHome = () => {
    setSession(null);
    navigate('/', { replace: true });
  };
  const again = () => {
    setSession(null);
    navigate(`/study/select?scope=${session.context.scope}`, { replace: true });
  };

  return (
    <div className="screen has-fixed-bottom result-screen">
      <Header title="結果" />

      <h2 className="heading" data-testid="result-heading">
        {session.endedEarly ? 'お疲れ様でした' : 'セッション完了！'}
      </h2>

      {message && (
        <div className="notice" role="alert">
          {message}
        </div>
      )}

      {/* 内訳は上から Again / Hard / Good / Easy の順（7-7）。GRADES は 1〜4 の昇順 */}
      <div className="result-bars" aria-label="評価内訳">
        {GRADES.map((g) => (
          <div key={g} className="result-bar">
            <span>{GRADE_NAMES[g]}</span>
            <div className="track">
              <div
                className={`fill grade-${g}`}
                style={{ width: summary.rated === 0 ? 0 : `${(summary.counts[g] / summary.rated) * 100}%` }}
              />
            </div>
            <span data-testid={`count-${g}`}>{summary.counts[g]}</span>
          </div>
        ))}
      </div>

      <div className="stat-grid">
        <div className="stat">
          <div className="label">正答率</div>
          <div className="value" data-testid="accuracy">
            {summary.accuracy}%
          </div>
        </div>
        <div className="stat">
          <div className="label">所要時間</div>
          <div className="value">{formatDuration(summary.durationMs)}</div>
        </div>
        <div className="stat" style={{ gridColumn: '1 / -1' }}>
          <div className="label">次回最も早い復習日</div>
          <div className="value">{summary.earliestDue == null ? '—' : nextReviewLabel(summary.earliestDue, now)}</div>
        </div>
      </div>

      {/* 「次回最も早い復習日」の下。このセッションで評価した単語を出題順に並べる（7-7）。
          評価が 0 件（途中終了）のときは枠ごと出さない */}
      {data != null && data.rows.length > 0 && (
        <div className="stat result-words">
          <div className="label">評価した単語</div>
          <ul className="result-word-list" aria-label="評価した単語">
            {data.rows.map(({ word, grade, due }) => {
              const on = favorites[word.id] ?? word.favorite;
              return (
                <li key={word.id} className="result-word-row">
                  <button
                    type="button"
                    className={`result-star${on ? ' on' : ''}`}
                    aria-pressed={on}
                    aria-label={`${word.englishTerm} を${on ? 'お気に入りから外す' : 'お気に入りに追加'}`}
                    onClick={() => void toggleFavorite(word)}
                    data-testid={`result-star-${word.id}`}
                  >
                    {on ? '★' : '☆'}
                  </button>
                  <span className="result-word-en">{word.englishTerm}</span>
                  <span className="result-word-ja">{word.japaneseDefinition}</span>
                  {/* 最初に押した評価。再出題分の評価は使わない */}
                  <span className={`result-word-grade text-grade-${grade}`}>{GRADE_NAMES[grade]}</span>
                  <span className="result-word-due">{reviewDayLabel(due, now)}</span>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {data?.firstToday && (
        <div className="center" data-testid="streak-result">
          🔥 {data.streak.current}日連続学習！
        </div>
      )}

      {data?.settings.notifyEnabled && (
        <button type="button" className="btn-primary" onClick={onFinishToday}>
          今日の学習を終える
        </button>
      )}

      {/* 画面下部に固定（7-7）。上から「もう一度」（枠線のみ）、「ホームへ」（強調色）。内容はこの上でスクロールする */}
      <div className="fixed-bottom result-actions">
        <button type="button" className="btn-outline" onClick={again} data-testid="again">
          もう一度
        </button>
        <button type="button" className="btn-primary" onClick={goHome} data-testid="go-home">
          ホームへ
        </button>
      </div>
    </div>
  );
}
