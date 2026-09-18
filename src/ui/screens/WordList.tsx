import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { Header } from '../components/Header';
import { StateBar } from '../components/StateBar';
import { EmptyState } from '../components/EmptyState';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { SwipeRow } from '../components/SwipeRow';
import { syncModal } from '../components/modal';
import { useAsync, errorMessage } from '../hooks';
import {
  deleteWord,
  deleteWords,
  getFolder,
  listFavoriteWords,
  listFolders,
  listWordsInFolder,
  moveWords,
  setFavorites,
} from '../../db/repo';
import { updateBadge } from '../../app/badge';
import { endOfDay, relativeDueLabel } from '../../domain/dates';
import { FAVORITES, LIMITS, STATE_ICONS, STATE_NAMES, type CardState, type Folder, type Word } from '../../domain/types';

type Filter = 'all' | 'due' | 'mastered';

const FILTER_LABELS: Record<Filter, string> = { all: 'すべて', due: '要復習', mastered: '習得済み' };

/** 並べ替えの基準（7-3）。選択も向きも保存せず、一覧を開くたびに既定に戻す */
export type SortKey = 'created' | 'alpha' | 'state' | 'due' | 'favorite';

/** 並べ替えの向き。asc は下の COMPARATORS の順、desc はその逆順 */
export type SortDir = 'asc' | 'desc';

export const SORT_KEYS: SortKey[] = ['created', 'alpha', 'state', 'due', 'favorite'];

export const DEFAULT_SORT: SortKey = 'created';

/** シートとボタンに出す名前（基準名のみ。向きは隣のボタンで示す） */
export const SORT_LABELS: Record<SortKey, string> = {
  created: '登録日',
  alpha: 'アルファベット',
  state: '学習状態',
  due: '次回の復習日',
  favorite: 'お気に入り',
};

/** 基準を変えたときに戻す向き（7-3）。登録日だけ降順（新しい順）が既定 */
export const DEFAULT_DIR: Record<SortKey, SortDir> = {
  created: 'desc',
  alpha: 'asc',
  state: 'asc',
  due: 'asc',
  favorite: 'desc',
};

/** 向きの切り替えボタンに出す記号 */
export const DIR_MARKS: Record<SortDir, string> = { asc: '↑', desc: '↓' };

/** 向きを含めた並びの説明（読み上げとボタンの aria-label 用） */
export const SORT_DIR_LABELS: Record<SortKey, Record<SortDir, string>> = {
  created: { asc: '古い順', desc: '新しい順' },
  alpha: { asc: 'A→Z', desc: 'Z→A' },
  state: { asc: 'New → Learning → Relearning → Review', desc: 'Review → Relearning → Learning → New' },
  due: { asc: '近い順（未学習は最後）', desc: '遠い順（未学習は最初）' },
  favorite: { asc: '☆ なしが上', desc: '★ 付きが上' },
};

export const flipDir = (dir: SortDir): SortDir => (dir === 'asc' ? 'desc' : 'asc');

/** 学習状態の並び: New → Learning → Relearning → Review */
const STATE_RANK: Record<CardState, number> = { 0: 0, 1: 1, 2: 3, 3: 2 };

/**
 * 基準ごとの昇順（asc）の比較。降順は結果をそのまま逆順にするので、
 * 同点の並び（未学習の位置や同じグループ内の登録日）もまとめて反転する（7-3）。
 */
const COMPARATORS: Record<SortKey, (a: Word, b: Word) => number> = {
  created: (a, b) => a.createdAt - b.createdAt,
  alpha: (a, b) => a.englishTerm.localeCompare(b.englishTerm) || a.createdAt - b.createdAt,
  // 同じ状態の中は due 昇順
  state: (a, b) => STATE_RANK[a.state] - STATE_RANK[b.state] || a.due - b.due || a.createdAt - b.createdAt,
  // 未学習（state = 0）は最後に回し、それ以外は due の近い順
  due: (a, b) =>
    Number(a.state === 0) - Number(b.state === 0) || (a.state === 0 ? 0 : a.due - b.due) || a.createdAt - b.createdAt,
  // asc は ☆ なしが先。desc（既定）にすると ★ 付きが上で、同じグループ内は登録日の新しい順になる
  favorite: (a, b) => Number(a.favorite) - Number(b.favorite) || a.createdAt - b.createdAt,
};

/** フィルターと検索の結果に対して並べ替える（7-3）。入力の配列は変えない */
export function sortWords(words: Word[], key: SortKey, dir: SortDir = DEFAULT_DIR[key]): Word[] {
  const list = words.slice().sort(COMPARATORS[key]);
  return dir === 'asc' ? list : list.reverse();
}

/** 選択した単語の ☆ を切り替えたあとのトースト（7-3） */
export const favoriteMessage = (n: number, on: boolean): string =>
  on ? `${n}件をお気に入りに追加しました` : `${n}件をお気に入りから外しました`;

/** 選択モードの削除の確認文（7-3、8）。★ 付きを含むときだけ件数を添える */
export const bulkDeleteMessage = (n: number, favorites: number): string =>
  favorites > 0
    ? `${n}件の単語と学習履歴を削除します。お気に入り${favorites}件を含みます。よろしいですか？`
    : `${n}件の単語と学習履歴を削除します。よろしいですか？`;

/** スワイプ削除の「元に戻す」を表示する時間 */
export const UNDO_MS = 5000;
/** 移動後のトースト「N件を「フォルダ名」に移動しました」を表示する時間 */
export const MOVED_MS = 4000;

/** 移動後のトーストの文面（7-3、7-4）。単語フォームからの移動でも同じ文面を使う */
export const movedMessage = (n: number, folderName: string): string => `${n}件を「${folderName}」に移動しました`;

/** 移動先の候補: 現在のフォルダを除く。一覧と「移動先が無い」の判定の両方にこの結果を使う */
export const moveTargets = (folders: Folder[], currentId: string): Folder[] => folders.filter((f) => f.id !== currentId);

/** 単語一覧へ遷移するときに location.state で渡すもの。message は通知欄（取込の結果）、toast は画面下に 4 秒出す文面 */
interface ListState {
  message?: string;
  toast?: string;
}

/**
 * 単語一覧（7-3）。favorites が true のときは #/favorites の「★ お気に入り」一覧で、
 * 全フォルダの ★ 付き単語を出し、「＋」と取込を出さず、各行にフォルダ名を小さく添える。
 */
export function WordList({ favorites = false }: { favorites?: boolean } = {}) {
  const { folderId = '' } = useParams();
  /** 学習セッションと並べ替えの対象範囲。お気に入り一覧は 'favorites' */
  const scope = favorites ? FAVORITES : folderId;
  const navigate = useNavigate();
  const location = useLocation();
  const { data, reload } = useAsync(async () => {
    const [folder, words, folders] = await Promise.all([
      favorites ? Promise.resolve(undefined) : getFolder(folderId),
      favorites ? listFavoriteWords() : listWordsInFolder(folderId),
      listFolders(),
    ]);
    return { folder, words, folders };
  }, [folderId, favorites]);
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [sort, setSort] = useState<SortKey>(DEFAULT_SORT);
  const [dir, setDir] = useState<SortDir>(DEFAULT_DIR[DEFAULT_SORT]);
  const [sorting, setSorting] = useState(false);
  // 取込の結果（10-3）は単語フォームから location.state で受け取り、この画面で表示する
  const [message, setMessage] = useState<string | null>(() => (location.state as ListState | null)?.message ?? null);
  // 画面下のトースト（移動の結果）。4 秒で消す
  const [toast, setToast] = useState<string | null>(null);
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [confirmBulk, setConfirmBulk] = useState(false);
  const [moving, setMoving] = useState(false);
  const [pending, setPending] = useState<Word | null>(null);
  const pendingRef = useRef<{ word: Word; timer: ReturnType<typeof setTimeout> } | null>(null);
  const now = Date.now();

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query), 300);
    return () => clearTimeout(t);
  }, [query]);

  // 並べ替えの基準も向きも保存しない。一覧を開くたびに既定（登録日の新しい順）に戻す（7-3）
  useEffect(() => {
    setSort(DEFAULT_SORT);
    setDir(DEFAULT_DIR[DEFAULT_SORT]);
  }, [folderId, favorites]);

  /** 画面下に text を 4 秒出す。消すときにそのままなら消し、別の文面に変わっていたら消さない */
  const showToast = useCallback((text: string) => {
    setToast(text);
    setTimeout(() => setToast((t) => (t === text ? null : t)), MOVED_MS);
  }, []);

  // 受け取った結果を履歴から消し、再読み込みや戻る操作でもう一度出ないようにする。単語フォームからの移動のトーストもここで出す
  useEffect(() => {
    const s = location.state as ListState | null;
    if (s == null) return;
    navigate(location.pathname, { replace: true, state: null });
    if (s.toast) showToast(s.toast);
  }, [location.state, location.pathname, navigate, showToast]);

  // 一覧から消えた単語は選択から外す（お気に入り一覧で ★ を外したときなど）
  useEffect(() => {
    if (!data) return;
    const ids = new Set(data.words.map((w) => w.id));
    setSelected((prev) => {
      const next = new Set([...prev].filter((id) => ids.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [data]);

  const words = data?.words ?? [];
  // お気に入り一覧は特定のフォルダに属さないので、移動先から除くフォルダはない
  const otherFolders = useMemo(() => moveTargets(data?.folders ?? [], favorites ? '' : folderId), [data, folderId, favorites]);
  const folderName = useCallback((id: string) => data?.folders.find((f) => f.id === id)?.name ?? '', [data]);
  const byState = useMemo(() => {
    const c: Record<CardState, number> = { 0: 0, 1: 0, 2: 0, 3: 0 };
    for (const w of words) c[w.state] += 1;
    return c;
  }, [words]);
  const dueCount = useMemo(() => words.filter((w) => w.state !== 0 && w.due <= endOfDay(now)).length, [words, now]);
  const newCount = byState[0];

  // フィルター → 検索 → 並べ替え の順に適用する（7-3）。フィルター別の既定ソートは持たない
  const shown = useMemo(() => {
    const end = endOfDay(now);
    let list: Word[];
    if (filter === 'due') list = words.filter((w) => w.state !== 0 && w.due <= end);
    else if (filter === 'mastered') list = words.filter((w) => w.state === 2 && w.stability >= LIMITS.masteredStability);
    else list = words;
    const q = debounced.trim().toLowerCase();
    if (q) list = list.filter((w) => w.englishTerm.toLowerCase().includes(q) || w.japaneseDefinition.toLowerCase().includes(q));
    if (pending) list = list.filter((w) => w.id !== pending.id); // 削除保留中の行は隠す
    return sortWords(list, sort, dir);
  }, [words, filter, debounced, now, pending, sort, dir]);

  const filtering = filter !== 'all' || debounced.trim() !== '';

  // ---------- スワイプ削除（保留 → 5 秒後か画面遷移時に確定） ----------

  const commitPending = useCallback(async () => {
    const p = pendingRef.current;
    if (!p) return;
    pendingRef.current = null;
    clearTimeout(p.timer);
    setPending(null);
    try {
      await deleteWord(p.word.id);
      await updateBadge();
    } catch (e) {
      setMessage(errorMessage(e));
    }
    reload();
  }, [reload]);

  const swipeDelete = (word: Word) => {
    void commitPending(); // 直前の保留分があれば先に確定する
    const timer = setTimeout(() => void commitPending(), UNDO_MS);
    pendingRef.current = { word, timer };
    setPending(word);
  };

  const undoDelete = () => {
    const p = pendingRef.current;
    if (!p) return;
    clearTimeout(p.timer);
    pendingRef.current = null;
    setPending(null);
  };

  // 画面遷移（アンマウント）時に保留中の削除を確定する
  useEffect(
    () => () => {
      void commitPending();
    },
    [commitPending],
  );

  // ---------- 複数選択と一括削除 ----------

  const toggleSelected = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const exitSelect = () => {
    setSelecting(false);
    setSelected(new Set());
  };

  /** 選択中の単語（削除・☆ の判定に使う） */
  const selectedWords = useMemo(() => words.filter((w) => selected.has(w.id)), [words, selected]);
  /** 選択中がすべて ★ なら「☆ を外す」、それ以外は「☆ を付ける」（7-3） */
  const favoriteOn = !(selectedWords.length > 0 && selectedWords.every((w) => w.favorite));
  const selectedFavorites = selectedWords.filter((w) => w.favorite).length;

  /** 選択中の単語の ☆ をまとめて付け外しする。選択は解除せず、結果をトーストで出す */
  const bulkFavorite = async () => {
    const ids = [...selected];
    try {
      const n = await setFavorites(ids, favoriteOn);
      reload();
      showToast(favoriteMessage(n, favoriteOn));
    } catch (e) {
      setMessage(errorMessage(e));
    }
  };

  const bulkDelete = async () => {
    setConfirmBulk(false);
    const ids = [...selected];
    try {
      await deleteWords(ids);
      await updateBadge();
      exitSelect();
      reload();
    } catch (e) {
      setMessage(errorMessage(e));
    }
  };

  /** 選択中の単語を dest へまとめて移動（7-3）。folderId と updatedAt だけを 1 トランザクションで更新する */
  const bulkMove = async (dest: Folder) => {
    setMoving(false);
    const ids = [...selected];
    try {
      const n = await moveWords(ids, dest.id);
      exitSelect();
      reload();
      showToast(movedMessage(n, dest.name));
    } catch (e) {
      setMessage(errorMessage(e));
    }
  };

  const startLabel = dueCount > 0 ? `学習開始（${dueCount}語）` : newCount > 0 ? `新しい単語を学習（${newCount}語）` : '学習できる単語がありません';

  const rowText = (w: Word) => (
    <>
      {/* 行の一番左。★ 付きだけ小さな ★ を出し、それ以外も同じ幅を空けて文字の位置をそろえる（7-3） */}
      <span className={`row-star${w.favorite ? ' on' : ''}`} role={w.favorite ? 'img' : undefined} aria-label={w.favorite ? 'お気に入り' : undefined}>
        {w.favorite ? '★' : ''}
      </span>
      <span className="row-text">
        <span className="row-title">{w.englishTerm}</span>
        <span className="row-sub">{w.japaneseDefinition}</span>
        {favorites && <span className="row-folder">{folderName(w.folderId)}</span>}
      </span>
      <span className="row-side">
        <span role="img" aria-label={STATE_NAMES[w.state]}>
          {STATE_ICONS[w.state]}
        </span>{' '}
        {relativeDueLabel(w.due, w.state, now)}
      </span>
    </>
  );

  return (
    <div className="screen has-fixed-bottom">
      <Header
        title={favorites ? '★ お気に入り' : (data?.folder?.name ?? '')}
        back="/"
        right={
          selecting ? (
            <button type="button" className="btn-text" onClick={exitSelect} style={{ fontWeight: 600 }}>
              完了
            </button>
          ) : (
            <>
              {/* お気に入り一覧には「＋」を置かない（7-3）。取込は単語フォーム（新規）の中だけ */}
              {!favorites && (
                <button type="button" className="btn-icon" aria-label="単語を追加" onClick={() => navigate(`/folders/${folderId}/words/new`)}>
                  ＋
                </button>
              )}
              <button type="button" className="btn-text" disabled={words.length === 0} onClick={() => setSelecting(true)}>
                選択
              </button>
            </>
          )
        }
      />

      {message && (
        <div className="notice" role="status" data-testid="import-result">
          {message}
        </div>
      )}

      <input
        type="search"
        placeholder="検索（英語・日本語訳）"
        aria-label="検索"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />

      <div className="list-controls">
        <div className="segmented" role="group" aria-label="フィルター">
          {(['all', 'due', 'mastered'] as Filter[]).map((f) => (
            <button key={f} type="button" aria-pressed={filter === f} onClick={() => setFilter(f)}>
              {FILTER_LABELS[f]}
            </button>
          ))}
        </div>
        <button type="button" className="sort-btn" aria-label={`並べ替え: ${SORT_LABELS[sort]}`} onClick={() => setSorting(true)} data-testid="sort-button">
          <span aria-hidden="true">⇅</span> {SORT_LABELS[sort]}
        </button>
        {/* 向きの切り替え。ワンタップで昇順と降順を入れ替える（7-3） */}
        <button
          type="button"
          className="sort-btn sort-dir"
          aria-label={`並び順: ${SORT_DIR_LABELS[sort][dir]}。押すと逆順`}
          onClick={() => setDir(flipDir)}
          data-testid="sort-dir"
        >
          {DIR_MARKS[dir]}
        </button>
      </div>

      {filtering && (
        <div className="small muted center" data-testid="count-display">
          {words.length}語中{shown.length}語を表示中
        </div>
      )}

      <StateBar counts={byState} />

      {data && words.length === 0 ? (
        <EmptyState message={favorites ? 'お気に入りの単語がありません' : '単語がありません。＋で追加するか取込してください'} />
      ) : (
        <ul className="word-list" aria-label="単語一覧">
          {shown.map((w) => (
            <li key={w.id} className="word-row">
              {selecting ? (
                <label className="word-row-main select-row">
                  <input type="checkbox" checked={selected.has(w.id)} onChange={() => toggleSelected(w.id)} aria-label={`${w.englishTerm} を選択`} />
                  {rowText(w)}
                </label>
              ) : (
                <SwipeRow onDelete={() => swipeDelete(w)}>
                  <Link to={`/words/${w.id}`} className="btn word-row-main">
                    {rowText(w)}
                  </Link>
                </SwipeRow>
              )}
            </li>
          ))}
        </ul>
      )}

      {/* 画面下のトースト。削除の「元に戻す」を優先し、同じ位置に重ねない */}
      {pending ? (
        <div className="toast" role="status" data-testid="undo-toast">
          <span>削除しました</span>
          <button type="button" onClick={undoDelete}>
            元に戻す
          </button>
        </div>
      ) : toast ? (
        <div className="toast" role="status" data-testid="moved-toast">
          <span>{toast}</span>
        </div>
      ) : null}

      <div className="fixed-bottom">
        {selecting ? (
          <div className="btn-row">
            <button
              type="button"
              className="btn-secondary"
              disabled={selected.size === 0}
              aria-label={favoriteOn ? 'お気に入りに追加' : 'お気に入りから外す'}
              onClick={() => void bulkFavorite()}
              data-testid="bulk-favorite"
            >
              ☆
            </button>
            <button type="button" className="btn-secondary" disabled={selected.size === 0} onClick={() => setMoving(true)} data-testid="bulk-move">
              移動
            </button>
            <button type="button" className="btn-danger-solid" disabled={selected.size === 0} onClick={() => setConfirmBulk(true)} data-testid="bulk-delete">
              {selected.size}件を削除
            </button>
          </div>
        ) : (
          <button
            type="button"
            className="btn-primary"
            disabled={dueCount === 0 && newCount === 0}
            onClick={() => navigate(`/study/select?scope=${scope}`)}
          >
            {startLabel}
          </button>
        )}
      </div>

      <ConfirmDialog
        open={confirmBulk}
        title="単語を削除"
        message={bulkDeleteMessage(selected.size, selectedFavorites)}
        confirmLabel="削除"
        danger
        onConfirm={() => void bulkDelete()}
        onCancel={() => setConfirmBulk(false)}
      />

      <SortSheet
        open={sorting}
        value={sort}
        onPick={(k) => {
          setSort(k);
          // 基準を変えたら向きはその基準の既定に戻す（7-3）
          setDir(DEFAULT_DIR[k]);
          setSorting(false);
        }}
        onCancel={() => setSorting(false)}
      />

      <MoveDialog open={moving} folders={otherFolders} count={selected.size} onPick={(f) => void bulkMove(f)} onCancel={() => setMoving(false)} />
    </div>
  );
}

/**
 * 移動先フォルダを選ぶダイアログ。folders は現在のフォルダを除いた一覧（moveTargets）で、
 * 一覧が空なら「移動先のフォルダがありません」。見た目は他の確認ダイアログと同じ（枠線なし、行は枠線のないボタン）
 */
function MoveDialog({
  open,
  folders,
  count,
  onPick,
  onCancel,
}: {
  open: boolean;
  folders: Folder[];
  count: number;
  onPick: (folder: Folder) => void;
  onCancel: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => syncModal(ref.current, open), [open]);
  return (
    <dialog
      ref={ref}
      tabIndex={-1}
      onCancel={(e) => {
        e.preventDefault();
        onCancel();
      }}
      aria-labelledby="move-title"
      data-testid="move-dialog"
    >
      <h2 id="move-title">{count}件の移動先</h2>
      {folders.length === 0 ? (
        <p>移動先のフォルダがありません</p>
      ) : (
        <div className="dialog-list">
          {folders.map((f) => (
            <button key={f.id} type="button" className="btn-secondary" onClick={() => onPick(f)}>
              <span aria-hidden="true">📁</span> {f.name}
            </button>
          ))}
        </div>
      )}
      <div className="btn-row">
        <button type="button" className="btn-secondary" onClick={onCancel}>
          キャンセル
        </button>
      </div>
    </dialog>
  );
}

/** 並べ替えを選ぶシート（7-3）。下から出し、現在の選択にチェックを付ける */
function SortSheet({
  open,
  value,
  onPick,
  onCancel,
}: {
  open: boolean;
  value: SortKey;
  onPick: (key: SortKey) => void;
  onCancel: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => syncModal(ref.current, open), [open]);
  return (
    <dialog
      className="sheet"
      ref={ref}
      tabIndex={-1}
      onCancel={(e) => {
        e.preventDefault();
        onCancel();
      }}
      aria-labelledby="sort-title"
      data-testid="sort-sheet"
    >
      <h2 id="sort-title">並べ替え</h2>
      <div className="menu-list sheet-body">
        {SORT_KEYS.map((k) => (
          <button key={k} type="button" className="menu-item" aria-pressed={value === k} onClick={() => onPick(k)}>
            <span className="menu-check" aria-hidden="true">
              {value === k ? '✓' : ''}
            </span>
            {SORT_LABELS[k]}
          </button>
        ))}
      </div>
      <div className="btn-row">
        <button type="button" className="btn-secondary" onClick={onCancel}>
          キャンセル
        </button>
      </div>
    </dialog>
  );
}
