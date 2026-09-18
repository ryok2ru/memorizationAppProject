import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { Header } from '../components/Header';
import { StateBar } from '../components/StateBar';
import { EmptyState } from '../components/EmptyState';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { SwipeRow } from '../components/SwipeRow';
import { useAsync, errorMessage } from '../hooks';
import { deleteWord, deleteWords, getFolder, listFolders, listWordsInFolder, moveWords } from '../../db/repo';
import { updateBadge } from '../../app/badge';
import { endOfDay, relativeDueLabel } from '../../domain/dates';
import { LIMITS, STATE_ICONS, STATE_NAMES, type CardState, type Folder, type Word } from '../../domain/types';

type Filter = 'all' | 'due' | 'mastered';

const FILTER_LABELS: Record<Filter, string> = { all: 'すべて', due: '要復習', mastered: '習得済み' };

/** スワイプ削除の「元に戻す」を表示する時間 */
export const UNDO_MS = 5000;
/** 「N件を移動しました」を表示する時間 */
export const MOVED_MS = 3000;

export function WordList() {
  const { folderId = '' } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { data, reload } = useAsync(async () => {
    const [folder, words, folders] = await Promise.all([getFolder(folderId), listWordsInFolder(folderId), listFolders()]);
    return { folder, words, folders };
  }, [folderId]);
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  // 取込の結果（10-3）は単語フォームから location.state で受け取り、この画面で表示する
  const [message, setMessage] = useState<string | null>(() => (location.state as { message?: string } | null)?.message ?? null);
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

  // 受け取った結果を履歴から消し、再読み込みや戻る操作でもう一度出ないようにする
  useEffect(() => {
    if (location.state != null) navigate(location.pathname, { replace: true, state: null });
  }, [location.state, location.pathname, navigate]);

  const words = data?.words ?? [];
  /** 移動先の候補: 現在のフォルダを除く */
  const otherFolders = useMemo(() => (data?.folders ?? []).filter((f) => f.id !== folderId), [data, folderId]);
  const byState = useMemo(() => {
    const c: Record<CardState, number> = { 0: 0, 1: 0, 2: 0, 3: 0 };
    for (const w of words) c[w.state] += 1;
    return c;
  }, [words]);
  const dueCount = useMemo(() => words.filter((w) => w.state !== 0 && w.due <= endOfDay(now)).length, [words, now]);
  const newCount = byState[0];

  const shown = useMemo(() => {
    const end = endOfDay(now);
    let list: Word[];
    if (filter === 'due') list = words.filter((w) => w.state !== 0 && w.due <= end).sort((a, b) => a.due - b.due);
    else if (filter === 'mastered')
      list = words.filter((w) => w.state === 2 && w.stability >= LIMITS.masteredStability).sort((a, b) => b.createdAt - a.createdAt);
    else list = words.slice().sort((a, b) => a.due - b.due);
    const q = debounced.trim().toLowerCase();
    if (q) list = list.filter((w) => w.englishTerm.toLowerCase().includes(q) || w.japaneseDefinition.toLowerCase().includes(q));
    if (pending) list = list.filter((w) => w.id !== pending.id); // 削除保留中の行は隠す
    return list;
  }, [words, filter, debounced, now, pending]);

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
      const text = `${n}件を移動しました`;
      setMessage(text);
      setTimeout(() => setMessage((m) => (m === text ? null : m)), MOVED_MS);
    } catch (e) {
      setMessage(errorMessage(e));
    }
  };

  const startLabel = dueCount > 0 ? `学習開始（${dueCount}語）` : newCount > 0 ? `新しい単語を学習（${newCount}語）` : '学習できる単語がありません';

  const rowText = (w: Word) => (
    <>
      <span className="row-text">
        <span className="row-title">{w.englishTerm}</span>
        <span className="row-sub">{w.japaneseDefinition}</span>
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
        title={data?.folder?.name ?? ''}
        back="/"
        right={
          selecting ? (
            <button type="button" className="btn-text" onClick={exitSelect} style={{ fontWeight: 600 }}>
              完了
            </button>
          ) : (
            <>
              <button type="button" className="btn-icon" aria-label="単語を追加" onClick={() => navigate(`/folders/${folderId}/words/new`)}>
                ＋
              </button>
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

      <div className="segmented" role="group" aria-label="フィルター">
        {(['all', 'due', 'mastered'] as Filter[]).map((f) => (
          <button key={f} type="button" aria-pressed={filter === f} onClick={() => setFilter(f)}>
            {FILTER_LABELS[f]}
          </button>
        ))}
      </div>

      {filtering && (
        <div className="small muted center" data-testid="count-display">
          {words.length}語中{shown.length}語を表示中
        </div>
      )}

      <StateBar counts={byState} />

      {data && words.length === 0 ? (
        <EmptyState message="単語がありません。＋で追加するか取込してください" />
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

      {pending && (
        <div className="toast" role="status" data-testid="undo-toast">
          <span>削除しました</span>
          <button type="button" onClick={undoDelete}>
            元に戻す
          </button>
        </div>
      )}

      <div className="fixed-bottom">
        {selecting ? (
          <div className="btn-row">
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
            onClick={() => navigate(`/study/select?scope=${folderId}`)}
          >
            {startLabel}
          </button>
        )}
      </div>

      <ConfirmDialog
        open={confirmBulk}
        title="単語を削除"
        message={`${selected.size}件の単語と学習履歴を削除します。よろしいですか？`}
        confirmLabel="削除"
        danger
        onConfirm={() => void bulkDelete()}
        onCancel={() => setConfirmBulk(false)}
      />

      <MoveDialog open={moving} folders={otherFolders} count={selected.size} onPick={(f) => void bulkMove(f)} onCancel={() => setMoving(false)} />
    </div>
  );
}

/** 移動先フォルダを選ぶダイアログ。folders は現在のフォルダを除いた一覧 */
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
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    else if (!open && el.open) el.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
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
