import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Header } from '../components/Header';
import { Switch } from '../components/Switch';
import { useAsync } from '../hooks';
import { listFolders } from '../../db/repo';
import { loadOverview, estimateMinutes } from '../../app/stats';
import { loadSettings } from '../../app/settings';
import { buildQueue } from '../../app/queue';
import { createSession, setSession, type StudyMode } from '../../app/session';
import { isFavoritesScope, scopeFolderId } from '../../domain/types';
import { labelsForScope } from '../../domain/labels';

export function ModeSelect() {
  const [params] = useSearchParams();
  const scope = params.get('scope') ?? 'all';
  const folderId = scopeFolderId(scope);
  const favorites = isFavoritesScope(scope);
  /** 戻る先と、キューが空のときの遷移元 */
  const backTo = favorites ? '/favorites' : folderId ? `/folders/${folderId}` : '/';
  const navigate = useNavigate();
  const { data } = useAsync(async () => {
    const [overview, settings, folders] = await Promise.all([loadOverview(scope), loadSettings(), listFolders()]);
    return { overview, settings, folders };
  }, [scope]);
  const [shuffleOn, setShuffleOn] = useState(false);
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    if (data) setShuffleOn(data.settings.cardOrder === 'random');
  }, [data]);

  if (!data) return <div className="screen"><Header title="" back={backTo} /></div>;

  const { overview, settings, folders } = data;
  const folder = folders.find((f) => f.id === folderId);
  // タイプ入力のボタンは対象範囲の項目名で書く（7-5）
  const labels = labelsForScope(scope, folders);
  const isReview = overview.due > 0;
  const count = isReview ? overview.due : overview.news;
  const empty = count === 0;
  const name = folder?.name ?? '';
  const title = folderId
    ? isReview || empty
      ? `学習を始める（${name}）`
      : `学習を始める（${name}）— 新しいカードを学習`
    : favorites
      ? isReview || empty
        ? 'お気に入りを復習する'
        : 'お気に入り — 新しいカードを学習'
      : isReview || empty
        ? '全フォルダを復習する'
        : '全フォルダ — 新しいカードを学習';

  const start = async (mode: StudyMode) => {
    if (starting) return;
    setStarting(true);
    try {
      const q = await buildQueue(scope, settings.maxCardsPerSession, shuffleOn);
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
      <Header title={title} back={backTo} />

      <div className="card">
        {isReview ? (
          <>
            <h2>復習 {count}枚</h2>
            <p>予想時間: 約{estimateMinutes(count)}分</p>
          </>
        ) : (
          <h2>新しいカードを学習: {count}枚</h2>
        )}
      </div>

      {empty && <div className="notice center muted">学習できるカードがありません</div>}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <button type="button" className="btn-primary" disabled={empty || starting} onClick={() => void start('flashcard')}>
          フラッシュカード
        </button>
        <button type="button" className="btn-primary" disabled={empty || starting} onClick={() => void start('enToJa')}>
          {labels.front}→{labels.back} 入力
        </button>
        <button type="button" className="btn-primary" disabled={empty || starting} onClick={() => void start('jaToEn')}>
          {labels.back}→{labels.front} 入力
        </button>
      </div>

      <div className="setting-row card">
        <span>シャッフル</span>
        <Switch checked={shuffleOn} onChange={setShuffleOn} label="シャッフル" />
      </div>
    </div>
  );
}
