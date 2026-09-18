import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Header } from '../components/Header';
import { SummaryCard } from '../components/SummaryCard';
import { StateBar } from '../components/StateBar';
import { EmptyState } from '../components/EmptyState';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { InputDialog } from '../components/InputDialog';
import { syncModal } from '../components/modal';
import { useAsync, isStandalone, errorMessage } from '../hooks';
import { createFolder, deleteFolder, listAllWords, listFolders, renameFolder } from '../../db/repo';
import { loadOverview, loadFolderStats, type FolderStats } from '../../app/stats';
import { loadStreak, streakMessage } from '../../app/streak';
import { loadSettings, requestPersistentStorage } from '../../app/settings';
import { finishToday, needsRefresh } from '../../app/notify';
import { updateBadge } from '../../app/badge';
import { validateFolderName } from '../../domain/validation';
import { formatShortDateTime } from '../../domain/dates';
import { LIMITS, type Folder, type Word } from '../../domain/types';

/** 検索結果の表示上限。超えた分は絞り込みを促す */
const MAX_RESULTS = 100;

interface HomeData {
  folders: Folder[];
  stats: Record<string, FolderStats>;
  overview: Awaited<ReturnType<typeof loadOverview>>;
  streak: Awaited<ReturnType<typeof loadStreak>>;
  settings: Awaited<ReturnType<typeof loadSettings>>;
}

async function loadHome(): Promise<HomeData> {
  const now = Date.now();
  const [folders, overview, streak, settings] = await Promise.all([listFolders(), loadOverview(null, now), loadStreak(now), loadSettings()]);
  const stats: Record<string, FolderStats> = {};
  await Promise.all(folders.map(async (f) => (stats[f.id] = await loadFolderStats(f.id, now))));
  return { folders, stats, overview, streak, settings };
}

export function Home() {
  const navigate = useNavigate();
  const { data, reload } = useAsync(loadHome, []);
  const [adding, setAdding] = useState(false);
  const [menuFolder, setMenuFolder] = useState<Folder | null>(null);
  const [renaming, setRenaming] = useState<Folder | null>(null);
  const [deleting, setDeleting] = useState<Folder | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [standalone] = useState(() => isStandalone());
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');

  useEffect(() => {
    void updateBadge();
  }, []);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query), 300);
    return () => clearTimeout(t);
  }, [query]);

  // 全フォルダ横断の検索（7-2）。1 文字以上入力したときだけ全単語を読む
  const searching = debounced.trim() !== '';
  const { data: allWords } = useAsync<Word[] | null>(() => (searching ? listAllWords() : Promise.resolve(null)), [searching, data]);
  const results = useMemo(() => {
    if (!searching || !allWords) return [];
    const q = debounced.trim().toLowerCase();
    return allWords
      .filter((w) => w.englishTerm.toLowerCase().includes(q) || w.japaneseDefinition.toLowerCase().includes(q))
      .sort((a, b) => a.englishTerm.localeCompare(b.englishTerm));
  }, [searching, allWords, debounced]);
  const folderName = (id: string) => data?.folders.find((f) => f.id === id)?.name ?? '';

  const existingNames = (except?: string) => (data?.folders ?? []).filter((f) => f.id !== except).map((f) => f.name);

  const onAdd = async (name: string) => {
    setAdding(false);
    requestPersistentStorage();
    try {
      await createFolder(name);
      reload();
    } catch (e) {
      setMessage(errorMessage(e));
    }
  };

  const onRename = async (name: string) => {
    if (!renaming) return;
    const id = renaming.id;
    setRenaming(null);
    try {
      await renameFolder(id, name);
      reload();
    } catch (e) {
      setMessage(errorMessage(e));
    }
  };

  const onDelete = async () => {
    if (!deleting) return;
    const id = deleting.id;
    setDeleting(null);
    try {
      await deleteFolder(id);
      await updateBadge();
      reload();
    } catch (e) {
      setMessage(errorMessage(e));
    }
  };

  const onFinishToday = async () => {
    try {
      const { url } = await finishToday();
      reload();
      window.location.href = url;
    } catch (e) {
      setMessage(errorMessage(e));
    }
  };

  const settings = data?.settings;
  const lastAt = settings?.lastNotifyScheduledAt ?? null;

  return (
    <div className="screen">
      <Header
        title="VocaVault"
        right={
          <>
            <button type="button" className="btn-icon" aria-label="フォルダを追加" onClick={() => setAdding(true)}>
              ＋
            </button>
            <Link to="/settings" className="btn btn-icon" aria-label="設定">
              ⚙︎
            </Link>
          </>
        }
      />

      {!standalone && (
        <div className="notice" role="note">
          Safari の共有メニューから「ホーム画面に追加」すると、全画面で使えてデータも消えにくくなります。
        </div>
      )}

      {message && (
        <div className="notice" role="alert">
          {message}
        </div>
      )}

      <input
        type="search"
        placeholder="全フォルダから検索（英語・日本語訳）"
        aria-label="全フォルダから検索"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />

      {data && (
        <>
          <SummaryCard
            due={data.overview.due}
            news={data.overview.news}
            onStartReview={() => navigate('/study/select?scope=all')}
            onStartNew={() => navigate('/study/select?scope=all')}
          />

          <div className="center" data-testid="streak">
            {streakMessage(data.streak)}
          </div>

          <StateBar counts={data.overview.byState} />

          {searching ? (
            allWords == null ? null : results.length === 0 ? (
              <EmptyState message="該当する単語がありません" />
            ) : (
              <>
                <div className="small muted center" data-testid="search-count">
                  {results.length > MAX_RESULTS ? `${results.length}件中${MAX_RESULTS}件を表示。さらに絞り込んでください` : `${results.length}件`}
                </div>
                <ul className="word-list" aria-label="検索結果">
                  {results.slice(0, MAX_RESULTS).map((w) => (
                    <li key={w.id} className="word-row">
                      <Link to={`/words/${w.id}`} className="btn word-row-main">
                        <span className="row-text">
                          <span className="row-title">{w.englishTerm}</span>
                          <span className="row-sub">{w.japaneseDefinition}</span>
                        </span>
                        <span className="row-side">{folderName(w.folderId)}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </>
            )
          ) : data.folders.length === 0 ? (
            <EmptyState message="フォルダがありません。＋で追加してください" />
          ) : (
            <ul className="folder-list" aria-label="フォルダ一覧">
              {data.folders.map((f) => {
                const s = data.stats[f.id] ?? { total: 0, due: 0 };
                return (
                  <li key={f.id} className="folder-card">
                    <Link to={`/folders/${f.id}`} className="btn folder-main">
                      <span className="folder-icon" aria-hidden="true">
                        📁
                      </span>
                      <span className="row-text">
                        <span className="row-title">{f.name}</span>
                        <span className="row-sub">
                          {s.total}語 ・ 今日の復習 {s.due}語
                        </span>
                      </span>
                    </Link>
                    <button type="button" className="btn-icon" aria-label={`${f.name} のメニュー`} onClick={() => setMenuFolder(f)}>
                      …
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          {settings?.notifyEnabled && (
            <div className="card" style={{ gap: 8, display: 'flex', flexDirection: 'column' }}>
              <button type="button" className="btn-primary" onClick={onFinishToday}>
                今日の学習を終える
              </button>
              <p className="small center">
                {lastAt == null
                  ? 'まだ予約していません'
                  : `最終予約: ${formatShortDateTime(lastAt)}、${settings.lastNotifyItemCount}日分`}
                {lastAt != null && needsRefresh(lastAt, Date.now()) && ' — 予約を更新しましょう'}
              </p>
            </div>
          )}
        </>
      )}

      <InputDialog
        open={adding}
        title="フォルダを追加"
        placeholder="フォルダ名"
        maxLength={LIMITS.folderName}
        confirmLabel="追加"
        validate={(v) => validateFolderName(v, existingNames())}
        onConfirm={onAdd}
        onCancel={() => setAdding(false)}
      />

      <InputDialog
        open={renaming != null}
        title="フォルダ名を変更"
        initialValue={renaming?.name ?? ''}
        maxLength={LIMITS.folderName}
        validate={(v) => validateFolderName(v, existingNames(renaming?.id))}
        onConfirm={onRename}
        onCancel={() => setRenaming(null)}
      />

      <FolderMenu
        folder={menuFolder}
        onClose={() => setMenuFolder(null)}
        onRename={() => {
          setRenaming(menuFolder);
          setMenuFolder(null);
        }}
        onDelete={() => {
          setDeleting(menuFolder);
          setMenuFolder(null);
        }}
      />

      <ConfirmDialog
        open={deleting != null}
        title="フォルダを削除"
        message={`「${deleting?.name ?? ''}」と配下の単語、学習履歴をすべて削除します。よろしいですか？`}
        confirmLabel="削除"
        danger
        onConfirm={onDelete}
        onCancel={() => setDeleting(null)}
      />
    </div>
  );
}

function FolderMenu({
  folder,
  onClose,
  onRename,
  onDelete,
}: {
  folder: Folder | null;
  onClose: () => void;
  onRename: () => void;
  onDelete: () => void;
}) {
  const open = folder != null;
  return (
    <dialog
      open={false}
      tabIndex={-1}
      ref={(el) => syncModal(el, open)}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      aria-label="フォルダのメニュー"
    >
      <h2>{folder?.name}</h2>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <button type="button" className="btn-secondary" onClick={onRename}>
          名前を変更
        </button>
        <button type="button" className="btn-danger" onClick={onDelete}>
          削除
        </button>
        <button type="button" className="btn-secondary" onClick={onClose}>
          キャンセル
        </button>
      </div>
    </dialog>
  );
}
