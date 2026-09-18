import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Header } from '../components/Header';
import { StateBar } from '../components/StateBar';
import { EmptyState } from '../components/EmptyState';
import { useAsync, errorMessage } from '../hooks';
import { getFolder, listWordsInFolder } from '../../db/repo';
import { importResultMessage, importText } from '../../app/csv';
import { updateBadge } from '../../app/badge';
import { endOfDay, relativeDueLabel } from '../../domain/dates';
import { LIMITS, STATE_ICONS, STATE_NAMES, type CardState, type Word } from '../../domain/types';

type Filter = 'all' | 'due' | 'mastered';

const FILTER_LABELS: Record<Filter, string> = { all: 'すべて', due: '要復習', mastered: '習得済み' };

export function WordList() {
  const { folderId = '' } = useParams();
  const navigate = useNavigate();
  const { data, reload } = useAsync(async () => {
    const [folder, words] = await Promise.all([getFolder(folderId), listWordsInFolder(folderId)]);
    return { folder, words };
  }, [folderId]);
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [message, setMessage] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const now = Date.now();

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query), 300);
    return () => clearTimeout(t);
  }, [query]);

  const words = data?.words ?? [];
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
    return list;
  }, [words, filter, debounced, now]);

  const filtering = filter !== 'all' || debounced.trim() !== '';

  const onImportFile = async (file: File | undefined) => {
    if (!file) return;
    try {
      const text = await file.text();
      const plan = await importText(text, folderId);
      setMessage(importResultMessage(plan));
      await updateBadge();
      reload();
    } catch (e) {
      setMessage(errorMessage(e));
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const startLabel = dueCount > 0 ? `学習開始（${dueCount}語）` : newCount > 0 ? `新しい単語を学習（${newCount}語）` : '学習できる単語がありません';

  return (
    <div className="screen has-fixed-bottom">
      <Header
        title={data?.folder?.name ?? ''}
        back="/"
        right={
          <>
            <Link to={`/folders/${folderId}/words/new`} className="btn btn-icon" aria-label="単語を追加">
              ＋
            </Link>
            <button type="button" className="btn-icon" aria-label="メニュー" aria-expanded={menuOpen} onClick={() => setMenuOpen((o) => !o)}>
              ⋯
            </button>
          </>
        }
      />

      {menuOpen && (
        <div className="card" role="menu">
          <button
            type="button"
            className="btn-secondary"
            role="menuitem"
            onClick={() => {
              setMenuOpen(false);
              fileRef.current?.click();
            }}
          >
            CSV/TSV 取込
          </button>
        </div>
      )}
      <input
        ref={fileRef}
        type="file"
        accept=".csv,.tsv,.txt,text/csv,text/tab-separated-values,text/plain"
        style={{ display: 'none' }}
        aria-label="CSV/TSV ファイル"
        data-testid="import-file"
        onChange={(e) => void onImportFile(e.target.files?.[0])}
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
        <ul className="list" aria-label="単語一覧">
          {shown.map((w) => (
            <li key={w.id} className="row">
              <Link to={`/words/${w.id}`} className="btn row-main">
                <span className="row-title">{w.englishTerm}</span>
                <span className="row-sub">{w.japaneseDefinition}</span>
              </Link>
              <span className="row-side">
                <span role="img" aria-label={STATE_NAMES[w.state]}>
                  {STATE_ICONS[w.state]}
                </span>{' '}
                {relativeDueLabel(w.due, w.state, now)}
              </span>
            </li>
          ))}
        </ul>
      )}

      <div className="fixed-bottom">
        <button
          type="button"
          className="btn-primary"
          disabled={dueCount === 0 && newCount === 0}
          onClick={() => navigate(`/study/select?scope=${folderId}`)}
        >
          {startLabel}
        </button>
      </div>
    </div>
  );
}
