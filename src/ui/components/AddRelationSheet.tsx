import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { useCloseOnOutside } from './modal';
import { useSheetDrag } from './sheetDrag';
import { LinkFields } from './EditLinkSheet';
import { ADD_TITLES } from './RelationList';
import { errorMessage } from '../hooks';
import type { LinkDirection, RelationBlock, Section } from '../../domain/relations';
import {
  addRelation,
  canCreateNode,
  labelSuggestions,
  loadSearchData,
  searchCandidates,
  type Candidate,
  type RelationTarget,
  type SearchData,
} from '../../app/relations';
import { RelationError } from '../../db/repo';

export interface AddRelationSheetHandle {
  /** 押した処理の中で同期的に呼ぶ。シートを開き、検索欄にフォーカスしてキーボードを出す（7-12-2） */
  open: (section: Section) => void;
}

interface Props {
  /** 関係を足す項目（表示中の項目、グラフでは中心） */
  selfId: string;
  /** 追加したあと（図や一覧を描き直す） */
  onAdded: () => void;
}

const BLOCK_TEXT: Record<RelationBlock, string> = { self: 'この項目', exists: '関係あり', cycle: '循環になるため追加できません' };

/** 連結の次の段で選んでいる相手 */
interface LinkTarget {
  target: RelationTarget;
  name: string;
}

/** 関係の追加シート（7-12-2）。全フォルダのカードとノードから相手を探す。名前だけでノードを作れる */
export const AddRelationSheet = forwardRef<AddRelationSheetHandle, Props>(function AddRelationSheet({ selfId, onAdded }, handle) {
  const ref = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [section, setSection] = useState<Section>('parents');
  const [data, setData] = useState<SearchData | null>(null);
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [link, setLink] = useState<LinkTarget | null>(null);
  const [dir, setDir] = useState<LinkDirection>('none');
  const [label, setLabel] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const close = () => {
    setIsOpen(false);
    ref.current?.close();
  };
  const outside = useCloseOnOutside(close);
  const drag = useSheetDrag(ref, isOpen, close);

  useImperativeHandle(handle, () => ({
    open(next: Section) {
      setSection(next);
      setQuery('');
      setDebounced('');
      setLink(null);
      setDir('none');
      setLabel('');
      setMessage(null);
      setData(null);
      setIsOpen(true);
      const el = ref.current;
      if (el && !el.open) el.showModal();
      // iOS でキーボードを出すため、押した処理の中で同期的にフォーカスする（7-2 と同じ）
      inputRef.current?.focus();
      void loadSearchData().then(setData);
    },
  }));

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query), 300);
    return () => clearTimeout(t);
  }, [query]);

  const candidates: Candidate[] = useMemo(
    () => (data ? searchCandidates(data, debounced, selfId, section) : []),
    [data, debounced, selfId, section],
  );
  const showCreate = data != null && canCreateNode(data, debounced);
  const suggestions = useMemo(() => (data ? labelSuggestions(data.edges) : []), [data]);

  const save = async (target: RelationTarget, linkValue?: { dir: LinkDirection; label: string }) => {
    if (busy) return;
    setBusy(true);
    try {
      await addRelation(selfId, section, target, linkValue);
      close();
      onAdded();
    } catch (e) {
      setMessage(e instanceof RelationError ? e.message : errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const choose = (target: RelationTarget, name: string) => {
    setMessage(null);
    // 上位・下位はその場で追加して閉じる。連結は同じシートで向きとラベルの段に進む
    if (section === 'links') setLink({ target, name });
    else void save(target);
  };

  return (
    <dialog
      className={`sheet add-relation-sheet${drag.sliding ? ' sheet-slide' : ''}`}
      ref={ref}
      style={drag.style}
      tabIndex={-1}
      onCancel={(e) => {
        e.preventDefault();
        close();
      }}
      {...outside}
      aria-labelledby="add-relation-title"
      data-testid="add-relation-sheet"
    >
      <div className="sheet-handle sheet-title-row" {...drag.handleProps}>
        {link && (
          <button type="button" className="btn-text sheet-back" aria-label="検索に戻る" onClick={() => setLink(null)}>
            ‹
          </button>
        )}
        <h2 id="add-relation-title">{link ? `「${link.name}」との連結` : ADD_TITLES[section]}</h2>
      </div>
      {/* 検索欄は常に置いておき、開いた処理の中でフォーカスできるようにする。連結の次の段では隠す */}
      <input
        ref={inputRef}
        type="search"
        enterKeyHint="search"
        className="add-relation-search"
        placeholder="名前で検索"
        value={query}
        hidden={link != null}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        }}
        aria-label="名前で検索"
        data-testid="add-relation-search"
      />
      <div className="sheet-body">
        {link ? (
          <>
            <LinkFields dir={dir} label={label} suggestions={suggestions} onDir={setDir} onLabel={setLabel} />
          </>
        ) : (
          <ul className="candidate-list" aria-label="検索結果">
            {candidates.map((c) => (
              <li key={c.item.id}>
                <button
                  type="button"
                  className="candidate-row"
                  disabled={c.block != null || busy}
                  onClick={() => choose({ id: c.item.id }, c.item.name)}
                >
                  <span className="row-text">
                    <span className={`row-title${c.item.kind === 'node' ? ' is-node' : ''}`}>{c.item.name}</span>
                    <span className="row-sub">{c.item.kind === 'node' ? 'ノード' : `${c.item.back}・${c.item.folderName}`}</span>
                  </span>
                  {c.block && <span className="row-side">{BLOCK_TEXT[c.block]}</span>}
                </button>
              </li>
            ))}
            {showCreate && (
              <li>
                <button
                  type="button"
                  className="candidate-row candidate-create"
                  disabled={busy}
                  onClick={() => choose({ newNodeName: debounced.trim() }, debounced.trim())}
                  data-testid="create-node"
                >
                  ＋「{debounced.trim()}」をノードとして作成
                </button>
              </li>
            )}
          </ul>
        )}
        {message && <p className="error">{message}</p>}
      </div>
      {link && (
        <div className="btn-row">
          <button type="button" className="btn-primary" disabled={busy} onClick={() => void save(link.target, { dir, label })} data-testid="add-link">
            追加
          </button>
        </div>
      )}
    </dialog>
  );
});
