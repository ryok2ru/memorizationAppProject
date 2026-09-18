import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAsync, errorMessage } from '../hooks';
import { getSession, setSession, summarize } from '../../app/session';
import { hadStudiedTodayBefore, loadStreak } from '../../app/streak';
import { loadSettings } from '../../app/settings';
import { finishToday } from '../../app/notify';
import { updateBadge } from '../../app/badge';
import { formatDuration, nextReviewLabel } from '../../domain/dates';
import { GRADES, GRADE_NAMES } from '../../domain/types';

export function Result() {
  const navigate = useNavigate();
  const [session] = useState(() => getSession());
  const [message, setMessage] = useState<string | null>(null);
  const { data } = useAsync(async () => {
    if (!session) return null;
    const [streak, studiedBefore, settings] = await Promise.all([loadStreak(), hadStudiedTodayBefore(session.startedAt), loadSettings()]);
    return { streak, firstToday: streak.isActiveToday && !studiedBefore, settings };
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

  const goHome = () => {
    setSession(null);
    navigate('/', { replace: true });
  };
  const again = () => {
    setSession(null);
    navigate(`/study/select?scope=${session.context.scope}`, { replace: true });
  };

  return (
    <div className="screen">
      <header className="header">
        <div className="header-side" />
        <h1>結果</h1>
        <div className="header-side right" />
      </header>

      <h2 className="heading" data-testid="result-heading">
        {session.endedEarly ? 'お疲れ様でした' : 'セッション完了！'}
      </h2>

      {message && (
        <div className="notice" role="alert">
          {message}
        </div>
      )}

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

      <div className="btn-row">
        <button type="button" className="btn-secondary" onClick={goHome}>
          ホームへ
        </button>
        <button type="button" className="btn-primary" onClick={again}>
          もう一度
        </button>
      </div>
    </div>
  );
}
