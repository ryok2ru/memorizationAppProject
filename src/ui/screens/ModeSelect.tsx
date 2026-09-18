import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Header } from '../components/Header';
import { Switch } from '../components/Switch';
import { useAsync } from '../hooks';
import { getFolder } from '../../db/repo';
import { loadOverview, estimateMinutes } from '../../app/stats';
import { loadSettings } from '../../app/settings';
import { buildQueue } from '../../app/queue';
import { createSession, setSession, type StudyMode } from '../../app/session';

export function ModeSelect() {
  const [params] = useSearchParams();
  const scope = params.get('scope') ?? 'all';
  const folderId = scope === 'all' ? null : scope;
  const navigate = useNavigate();
  const { data } = useAsync(async () => {
    const [overview, settings, folder] = await Promise.all([
      loadOverview(folderId),
      loadSettings(),
      folderId ? getFolder(folderId) : Promise.resolve(undefined),
    ]);
    return { overview, settings, folder };
  }, [scope]);
  const [shuffleOn, setShuffleOn] = useState(false);
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    if (data) setShuffleOn(data.settings.cardOrder === 'random');
  }, [data]);

  if (!data) return <div className="screen"><Header title="" back={folderId ? `/folders/${folderId}` : '/'} /></div>;

  const { overview, settings, folder } = data;
  const isReview = overview.due > 0;
  const count = isReview ? overview.due : overview.news;
  const empty = count === 0;
  const name = folder?.name ?? '';
  const title = folderId
    ? isReview || empty
      ? `学習を始める（${name}）`
      : `学習を始める（${name}）— 新しい単語を学習`
    : isReview || empty
      ? '全フォルダを復習する'
      : '全フォルダ — 新しい単語を学習';

  const start = async (mode: StudyMode) => {
    if (starting) return;
    setStarting(true);
    try {
      const q = await buildQueue(folderId, settings.maxCardsPerSession, shuffleOn);
      if (q.ids.length === 0) {
        setStarting(false);
        return;
      }
      setSession(createSession({ scope, kind: q.kind }, mode, q.ids));
      navigate(mode === 'flashcard' ? '/study/flashcard' : '/study/typing', { replace: true });
    } catch (e) {
      console.error(e);
      setStarting(false);
    }
  };

  return (
    <div className="screen">
      <Header title={title} back={folderId ? `/folders/${folderId}` : '/'} />

      <div className="card">
        {isReview ? (
          <>
            <h2>復習 {count}語</h2>
            <p>予想時間: 約{estimateMinutes(count)}分</p>
          </>
        ) : (
          <h2>新しい単語を学習: {count}語</h2>
        )}
      </div>

      {empty && <div className="notice center muted">学習できる単語がありません</div>}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <button type="button" className="btn-primary" disabled={empty || starting} onClick={() => void start('flashcard')}>
          フラッシュカード
        </button>
        <button type="button" className="btn-primary" disabled={empty || starting} onClick={() => void start('enToJa')}>
          英→日 入力
        </button>
        <button type="button" className="btn-primary" disabled={empty || starting} onClick={() => void start('jaToEn')}>
          日→英 入力
        </button>
      </div>

      <div className="setting-row card">
        <span>シャッフル</span>
        <Switch checked={shuffleOn} onChange={setShuffleOn} label="シャッフル" />
      </div>
    </div>
  );
}
