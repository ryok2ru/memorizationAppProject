import { useEffect, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { Link, useNavigate } from 'react-router-dom';
import { Header } from '../components/Header';
import { SummaryCard } from '../components/SummaryCard';
import { EmptyState } from '../components/EmptyState';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { FolderDialog, type FolderDialogValue } from '../components/FolderDialog';
import { InfoSheet } from '../components/InfoSheet';
import { SwipeRow } from '../components/SwipeRow';
import { syncModal, useCloseOnOutside } from '../components/modal';
import { allSelected, toggleAll } from '../components/selection';
import { moveItem, useReorder } from '../components/reorder';
import { useAsync, isStandalone, errorMessage } from '../hooks';
import { createFolder, deleteFolder, deleteFolders, listAllWords, listFolders, reorderFolders, setFavorite, updateFolder } from '../../db/repo';
import { loadOverview, loadScopeStats, type ScopeStats } from '../../app/stats';
import { loadStreak, streakMessage } from '../../app/streak';
import { loadSettings, requestPersistentStorage } from '../../app/settings';
import { finishToday, needsRefresh } from '../../app/notify';
import { updateBadge } from '../../app/badge';
import { validateFolderName } from '../../domain/validation';
import { formatShortDateTime } from '../../domain/dates';
import { FAVORITES, LIMITS, type Folder, type Word } from '../../domain/types';
import { folderLabels } from '../../domain/labels';

/** 検索結果の表示上限。超えた分は絞り込みを促す */
const MAX_RESULTS = 100;

/** フォルダの一括削除の確認文（7-2）。cards は選んだフォルダの単語数の合計 */
export const bulkDeleteFoldersMessage = (n: number, cards: number): string =>
  `${n}件のフォルダと配下のカード${cards}枚、学習履歴をすべて削除します。よろしいですか？`;

/**
 * フォルダの複製ダイアログの名前の初期値（7-2）。「元の名前のコピー」、それもあれば「元の名前のコピー 2」「… 3」と空いている番号を付ける。
 * 重複の判定は validateFolderName と同じく大文字小文字を無視する。50 文字を超えるときは元の名前の末尾を削る
 */
export function copyFolderName(name: string, existingNames: string[]): string {
  const taken = new Set(existingNames.map((e) => e.trim().toLowerCase()));
  for (let n = 1; ; n++) {
    const suffix = n === 1 ? 'のコピー' : `のコピー ${n}`;
    const candidate = name.trim().slice(0, LIMITS.folderName - suffix.length).trimEnd() + suffix;
    if (!taken.has(candidate.toLowerCase())) return candidate;
  }
}

interface HomeData {
  folders: Folder[];
  stats: Record<string, ScopeStats>;
  /** 「★ お気に入り」カードの件数（7-2）。total = ★ の単語数、due = そのうち今日の復習数 */
  favorites: ScopeStats;
  overview: Awaited<ReturnType<typeof loadOverview>>;
  streak: Awaited<ReturnType<typeof loadStreak>>;
  settings: Awaited<ReturnType<typeof loadSettings>>;
}

async function loadHome(): Promise<HomeData> {
  const now = Date.now();
  const [folders, favorites, overview, streak, settings] = await Promise.all([
    listFolders(),
    loadScopeStats(FAVORITES, now),
    loadOverview('all', now),
    loadStreak(now),
    loadSettings(),
  ]);
  const stats: Record<string, ScopeStats> = {};
  await Promise.all(folders.map(async (f) => (stats[f.id] = await loadScopeStats(f.id, now))));
  return { folders, stats, favorites, overview, streak, settings };
}

export function Home() {
  const navigate = useNavigate();
  const { data, reload } = useAsync(loadHome, []);
  const [adding, setAdding] = useState(false);
  const [menuFolder, setMenuFolder] = useState<Folder | null>(null);
  const [editing, setEditing] = useState<Folder | null>(null);
  const [copying, setCopying] = useState<Folder | null>(null);
  const [deleting, setDeleting] = useState<Folder | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [info, setInfo] = useState(false);
  const [standalone] = useState(() => isStandalone());
  /** フォルダの見出し行を検索欄に置き換えているか（7-2） */
  const [searchOpen, setSearchOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [confirmBulk, setConfirmBulk] = useState(false);
  /** 並べ替えた直後の並び（フォルダ id）。保存と読み直しが終わるまでの間、画面にすぐ反映するために使う */
  const [order, setOrder] = useState<string[] | null>(null);
  const listRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    void updateBadge();
  }, []);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query), 300);
    return () => clearTimeout(t);
  }, [query]);

  // 全フォルダ横断の検索（7-2）。1 文字以上入力したときだけ全単語を読む
  const searching = debounced.trim() !== '';
  const { data: allWords, reload: reloadWords } = useAsync<Word[] | null>(
    () => (searching ? listAllWords() : Promise.resolve(null)),
    [searching, data],
  );
  const results = useMemo(() => {
    if (!searching || !allWords) return [];
    const q = debounced.trim().toLowerCase();
    return allWords
      .filter((w) => w.englishTerm.toLowerCase().includes(q) || w.japaneseDefinition.toLowerCase().includes(q))
      .sort((a, b) => a.englishTerm.localeCompare(b.englishTerm));
  }, [searching, allWords, debounced]);
  const folderName = (id: string) => data?.folders.find((f) => f.id === id)?.name ?? '';

  // iOS はタップの処理の中でフォーカスしないとキーボードを出さないので、検索欄を同期で描いてからフォーカスする
  const openSearch = () => {
    flushSync(() => setSearchOpen(true));
    searchRef.current?.focus();
  };

  // 入力を消して見出し行に戻す。300ms 待たずにフォルダ一覧へ戻すため、遅延後の値もすぐ空にする
  const closeSearch = () => {
    setSearchOpen(false);
    setQuery('');
    setDebounced('');
  };

  // ---------- フォルダの複数選択と一括削除（7-2） ----------

  const exitSelect = () => {
    setSelecting(false);
    setSelected(new Set());
  };

  const toggleSelected = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  // 読み直したら DB の並びに戻す（保存した並びと同じなので見た目は変わらない）
  useEffect(() => setOrder(null), [data]);
  const folders = useMemo(() => {
    const list = data?.folders ?? [];
    if (!order) return list;
    const byId = new Map(list.map((f) => [f.id, f]));
    return order.flatMap((id) => byId.get(id) ?? []);
  }, [data, order]);

  const folderIds = useMemo(() => folders.map((f) => f.id), [folders]);
  const allFoldersSelected = allSelected(selected, folderIds);
  /** 選んだフォルダの単語数の合計（確認文に出す） */
  const selectedCards = [...selected].reduce((n, id) => n + (data?.stats[id]?.total ?? 0), 0);

  const onBulkDelete = async () => {
    setConfirmBulk(false);
    const ids = [...selected];
    try {
      await deleteFolders(ids);
      await updateBadge();
      exitSelect();
      reload();
    } catch (e) {
      setMessage(errorMessage(e));
    }
  };

  // ---------- フォルダの並び替え（7-2）。選択モード中の ≡ を縦にドラッグする ----------

  const onReorder = async (from: number, to: number) => {
    const ids = moveItem(folderIds, from, to);
    setOrder(ids);
    try {
      await reorderFolders(ids);
    } catch (e) {
      setMessage(errorMessage(e));
    }
    reload();
  };
  const reorder = useReorder(listRef, (from, to) => void onReorder(from, to));

  /** 検索結果の行の右スワイプでお気に入りを切り替える（7-2、7-3）。★ の件数が変わるのでホームの集計も読み直す */
  const swipeFavorite = async (word: Word) => {
    try {
      await setFavorite(word.id, !word.favorite);
    } catch (e) {
      setMessage(errorMessage(e));
    }
    reloadWords();
    reload();
  };

  const existingNames = (except?: string) => (data?.folders ?? []).filter((f) => f.id !== except).map((f) => f.name);

  const onAdd = async ({ name, labels }: FolderDialogValue) => {
    setAdding(false);
    requestPersistentStorage();
    try {
      await createFolder(name, Date.now(), labels);
      reload();
    } catch (e) {
      setMessage(errorMessage(e));
    }
  };

  const onEdit = async ({ name, labels }: FolderDialogValue) => {
    if (!editing) return;
    const id = editing.id;
    setEditing(null);
    try {
      await updateFolder(id, name, labels);
      reload();
    } catch (e) {
      setMessage(errorMessage(e));
    }
  };

  const onCopy = async ({ name, labels }: FolderDialogValue) => {
    setCopying(null);
    requestPersistentStorage();
    try {
      await createFolder(name, Date.now(), labels);
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
    <div className={`screen${selecting ? ' has-fixed-bottom' : ''}`}>
      {/* ホームだけタイトルを出さない。左に ⓘ とカレンダー、右に歯車（7-2）。フォルダの「＋」は「フォルダ」の見出し行に置く */}
      <Header
        left={
          <>
            {/* ⓘ は左上端。歯車より一回り小さい 22px（.btn-icon）で、タップ領域は 44px のまま（7-2） */}
            <button type="button" className="btn-icon" aria-label="状態と評価の説明" onClick={() => setInfo(true)} data-testid="open-info">
              ⓘ
            </button>
            {/* カレンダーは ⓘ と同じ 22px（7-11） */}
            <Link to="/calendar" className="btn btn-icon" aria-label="学習カレンダー" data-testid="open-calendar">
              <CalendarIcon />
            </Link>
          </>
        }
        right={
          <Link to="/settings" className="btn btn-icon btn-icon-lg" aria-label="設定">
            ⚙︎
          </Link>
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

      {data && (
        <>
          {/* 上からストリーク、サマリーカード（7-2） */}
          <div className="center" data-testid="streak">
            {streakMessage(data.streak)}
          </div>

          <SummaryCard
            due={data.overview.due}
            news={data.overview.news}
            onStartReview={() => navigate('/study/select?scope=all')}
            onStartNew={() => navigate('/study/select?scope=all')}
          />

          {/* 実体のないフォルダ。★ 付きが 1 件以上のときだけフォルダの上に出し、「…」メニューも選択も持たない。検索中も出したままにする（7-2） */}
          {data.favorites.total > 0 && (
            <div className="folder-card favorites-card" data-testid="favorites-card">
              <Link to="/favorites" className="btn folder-main">
                <span className="folder-icon" aria-hidden="true">
                  ★
                </span>
                <span className="row-text">
                  <span className="row-title">お気に入り</span>
                  <span className="row-sub">
                    {data.favorites.total}枚 ・ 今日の復習 {data.favorites.due}枚
                  </span>
                </span>
              </Link>
            </div>
          )}

          <section className="folder-section" aria-label={searchOpen ? '全フォルダから検索' : 'フォルダ'}>
            {/* 見出し「フォルダ」の行。お気に入りとの区切りを兼ね、右端にフォルダの操作を置く。虫眼鏡を押すと行ごと検索欄に変わる（7-2） */}
            <div className="folder-toolbar">
              {searchOpen ? (
                <form
                  role="search"
                  className="folder-search"
                  onSubmit={(e) => {
                    // キーボードの「検索」でキーボードを閉じ、結果を見やすくする
                    e.preventDefault();
                    searchRef.current?.blur();
                  }}
                >
                  <input
                    ref={searchRef}
                    type="search"
                    enterKeyHint="search"
                    placeholder="全フォルダから検索"
                    aria-label="全フォルダから検索"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                  />
                  <button type="button" className="btn-text" onClick={closeSearch} data-testid="close-search">
                    キャンセル
                  </button>
                </form>
              ) : (
                <>
                  <h2>フォルダ</h2>
                  {selecting ? (
                    <>
                      <button
                        type="button"
                        className="btn-text"
                        onClick={() => setSelected((prev) => toggleAll(prev, folderIds))}
                        data-testid="select-all-folders"
                      >
                        {allFoldersSelected ? '選択解除' : 'すべて選択'}
                      </button>
                      <button type="button" className="btn-text" onClick={exitSelect} style={{ fontWeight: 600 }}>
                        完了
                      </button>
                    </>
                  ) : (
                    <>
                      {/* 虫眼鏡はカレンダーと同じ 22px の線の図形（7-2） */}
                      <button type="button" className="btn-icon" aria-label="全フォルダから検索" onClick={openSearch} data-testid="open-search">
                        <SearchIcon />
                      </button>
                      <button type="button" className="btn-icon" aria-label="フォルダを追加" onClick={() => setAdding(true)}>
                        ＋
                      </button>
                      <button
                        type="button"
                        className="btn-text"
                        disabled={data.folders.length === 0}
                        onClick={() => setSelecting(true)}
                        data-testid="select-folders"
                      >
                        選択
                      </button>
                    </>
                  )}
                </>
              )}
            </div>

            {searching ? (
              allWords == null ? null : results.length === 0 ? (
                <EmptyState message="該当するカードがありません" />
              ) : (
                <>
                  <div className="small muted center" data-testid="search-count">
                    {results.length > MAX_RESULTS ? `${results.length}件中${MAX_RESULTS}件を表示。さらに絞り込んでください` : `${results.length}件`}
                  </div>
                  <ul className="word-list" aria-label="検索結果">
                    {results.slice(0, MAX_RESULTS).map((w) => (
                      <li key={w.id} className="word-row">
                        {/* 右スワイプでお気に入りを切り替える。削除は単語一覧だけなので左スワイプは渡さない（7-3） */}
                        <SwipeRow onFavorite={() => void swipeFavorite(w)} favorite={w.favorite}>
                          <Link to={`/words/${w.id}`} className="btn word-row-main">
                            {/* 一覧と同じ ★ の表示（7-2、7-3） */}
                            <span
                              className={`row-star${w.favorite ? ' on' : ''}`}
                              role={w.favorite ? 'img' : undefined}
                              aria-label={w.favorite ? 'お気に入り' : undefined}
                            >
                              {w.favorite ? '★' : ''}
                            </span>
                            <span className="row-text">
                              <span className="row-title">{w.englishTerm}</span>
                              <span className="row-sub">{w.japaneseDefinition}</span>
                            </span>
                            <span className="row-side">{folderName(w.folderId)}</span>
                          </Link>
                        </SwipeRow>
                      </li>
                    ))}
                  </ul>
                </>
              )
            ) : (
              <ul ref={listRef} className={`folder-list${reorder.dragging ? ' reordering' : ''}`} aria-label="フォルダ一覧">
                {folders.map((f, i) => {
                  const s = data.stats[f.id] ?? { total: 0, due: 0 };
                  const body = (
                    <>
                      <span className="folder-icon" aria-hidden="true">
                        📁
                      </span>
                      <span className="row-text">
                        <span className="row-title">{f.name}</span>
                        <span className="row-sub">
                          {s.total}枚 ・ 今日の復習 {s.due}枚
                        </span>
                      </span>
                    </>
                  );
                  const item = reorder.itemProps(i);
                  return (
                    <li key={f.id} className={`folder-card${selecting ? ' selecting' : ''}${item.className}`} style={item.style}>
                      {selecting ? (
                        // 選択中はカード全体でチェックを切り替え、「…」の代わりに並べ替えのつまみ（≡）を出す
                        <>
                          <label className="btn folder-main select-row">
                            <input type="checkbox" checked={selected.has(f.id)} onChange={() => toggleSelected(f.id)} aria-label={`${f.name} を選択`} />
                            {body}
                          </label>
                          <button type="button" className="btn-icon btn-grip" aria-label={`${f.name} を並べ替え`} {...reorder.handleProps(i)}>
                            <span aria-hidden="true" />
                            <span aria-hidden="true" />
                            <span aria-hidden="true" />
                          </button>
                        </>
                      ) : (
                        <>
                          <Link to={`/folders/${f.id}`} className="btn folder-main">
                            {body}
                          </Link>
                          <button type="button" className="btn-icon btn-menu" aria-label={`${f.name} のメニュー`} onClick={() => setMenuFolder(f)}>
                            <span aria-hidden="true" />
                            <span aria-hidden="true" />
                            <span aria-hidden="true" />
                          </button>
                        </>
                      )}
                    </li>
                  );
                })}
                {folders.length === 0 && (
                  <li>
                    <EmptyState message="フォルダがありません。＋で追加してください" />
                  </li>
                )}
              </ul>
            )}
          </section>

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

      {selecting && (
        <div className="fixed-bottom">
          <button type="button" className="btn-danger-solid" disabled={selected.size === 0} onClick={() => setConfirmBulk(true)} data-testid="bulk-delete-folders">
            {selected.size}件を削除
          </button>
        </div>
      )}

      <FolderDialog
        open={adding}
        title="フォルダを追加"
        confirmLabel="追加"
        validateName={(v) => validateFolderName(v, existingNames())}
        onConfirm={(v) => void onAdd(v)}
        onCancel={() => setAdding(false)}
      />

      <FolderDialog
        open={editing != null}
        title="フォルダを編集"
        initial={editing ? { name: editing.name, labels: folderLabels(editing) } : undefined}
        validateName={(v) => validateFolderName(v, existingNames(editing?.id))}
        onConfirm={(v) => void onEdit(v)}
        onCancel={() => setEditing(null)}
      />

      {/* 複製はフォルダ名と項目名だけ。初期値は「元の名前のコピー」と元の項目名で、カードは写さない（7-2） */}
      <FolderDialog
        open={copying != null}
        title="フォルダを複製"
        confirmLabel="複製"
        initial={copying ? { name: copyFolderName(copying.name, existingNames()), labels: folderLabels(copying) } : undefined}
        validateName={(v) => validateFolderName(v, existingNames())}
        onConfirm={(v) => void onCopy(v)}
        onCancel={() => setCopying(null)}
      />

      <FolderMenu
        folder={menuFolder}
        onClose={() => setMenuFolder(null)}
        onEdit={() => {
          setEditing(menuFolder);
          setMenuFolder(null);
        }}
        onCopy={() => {
          setCopying(menuFolder);
          setMenuFolder(null);
        }}
        onDelete={() => {
          setDeleting(menuFolder);
          setMenuFolder(null);
        }}
      />

      <InfoSheet open={info} onClose={() => setInfo(false)} />

      <ConfirmDialog
        open={deleting != null}
        title="フォルダを削除"
        message={`「${deleting?.name ?? ''}」と配下のカード、学習履歴をすべて削除します。よろしいですか？`}
        confirmLabel="削除"
        danger
        onConfirm={onDelete}
        onCancel={() => setDeleting(null)}
      />

      <ConfirmDialog
        open={confirmBulk}
        title="フォルダを削除"
        message={bulkDeleteFoldersMessage(selected.size, selectedCards)}
        confirmLabel="削除"
        danger
        onConfirm={() => void onBulkDelete()}
        onCancel={() => setConfirmBulk(false)}
      />
    </div>
  );
}

function FolderMenu({
  folder,
  onClose,
  onEdit,
  onCopy,
  onDelete,
}: {
  folder: Folder | null;
  onClose: () => void;
  onEdit: () => void;
  onCopy: () => void;
  onDelete: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const open = folder != null;
  useEffect(() => syncModal(ref.current, open), [open]);
  const outside = useCloseOnOutside(onClose);
  return (
    <dialog
      ref={ref}
      tabIndex={-1}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      {...outside}
      aria-label="フォルダのメニュー"
      data-testid="folder-menu"
    >
      {/* 見出しはフォルダ名。その下に区切り線を引き、以下は独立した枠線付きボタンを縦に並べる（7-2） */}
      <h2 className="menu-title">{folder?.name}</h2>
      <div className="menu-buttons">
        <button type="button" className="btn-outline" onClick={onEdit}>
          フォルダを編集
        </button>
        <button type="button" className="btn-outline" onClick={onCopy}>
          フォルダを複製
        </button>
        <button type="button" className="btn-outline-danger" onClick={onDelete}>
          削除
        </button>
        <button type="button" className="btn-outline-quiet" onClick={onClose}>
          キャンセル
        </button>
      </div>
    </dialog>
  );
}

/** カレンダーのアイコン。文字の ⓘ と同じ 22px の正方形に、文字色（--accent）の線で描く */
function CalendarIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
      <rect x="3" y="5" width="18" height="16" rx="2.5" />
      <path d="M3 10h18M8 3v4M16 3v4" />
    </svg>
  );
}

/** 虫眼鏡のアイコン（7-2）。カレンダーと同じ 22px の正方形に、同じ太さの文字色（--accent）の線で描く */
function SearchIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="M15.5 15.5 20 20" />
    </svg>
  );
}
