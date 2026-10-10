import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { syncModal, useCloseOnOutside } from './modal';
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
  type SearchResult,
  type RelationTarget,
  type SearchData,
} from '../../app/relations';
import { RelationError } from '../../db/repo';

export interface AddRelationDialogHandle {
  /** ダイアログを開く。検索欄にはフォーカスせず、まず候補の一覧を見せる（7-12-2） */
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

/**
 * 関係の追加ダイアログ（7-12-2）。全フォルダのカードとノードから相手を探す。名前だけでノードを作れる。
 * 中央に出し、開いたときは検索欄にフォーカスしない（キーボードは検索欄を押したときに出る）
 */
export const AddRelationDialog = forwardRef<AddRelationDialogHandle, Props>(function AddRelationDialog({ selfId, onAdded }, handle) {
  const ref = useRef<HTMLDialogElement>(null);
  const [section, setSection] = useState<Section>('parents');
  const [data, setData] = useState<SearchData | null>(null);
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [link, setLink] = useState<LinkTarget | null>(null);
  const [dir, setDir] = useState<LinkDirection>('none');
  const [label, setLabel] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const close = () => syncModal(ref.current, false);
  const outside = useCloseOnOutside(close);

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
      // 検索欄にはフォーカスしない（開いた瞬間に欄へフォーカスすると、iOS が欄を見せようとして表示位置をずらすため）。
      // syncModal はフォーカスをダイアログ自身に置くので、フォーカス枠も出ない
      syncModal(ref.current, true);
      void loadSearchData().then(setData);
    },
  }));

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query), 300);
    return () => clearTimeout(t);
  }, [query]);

  const result: SearchResult = useMemo(
    () => (data ? searchCandidates(data, debounced, selfId, section) : { items: [], rest: 0 }),
    [data, debounced, selfId, section],
  );
  const browsing = debounced.trim() === '';
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
      className="add-relation-dialog"
      ref={ref}
      tabIndex={-1}
      onCancel={(e) => {
        e.preventDefault();
        close();
      }}
      {...outside}
      aria-labelledby="add-relation-title"
      data-testid="add-relation-dialog"
    >
      <div className="card-popup-head">
        {link && (
          <button type="button" className="btn-text sheet-back" aria-label="検索に戻る" onClick={() => setLink(null)}>
            ‹
          </button>
        )}
        <h2 id="add-relation-title">{link ? `「${link.name}」との連結` : ADD_TITLES[section]}</h2>
        <button type="button" className="btn-icon" aria-label="閉じる" onClick={close}>
          ✕
        </button>
      </div>
      {/* 検索欄は一覧と一緒にスクロールさせず、見出しの下に置いたままにする。連結の次の段では隠す */}
      <input
        type="search"
        enterKeyHint="search"
        className="add-relation-search"
        placeholder="名前で検索"
      hidden={link != null}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        }}
        aria-label="名前で検索"
        data-testid="add-relation-search"
      />
      <div className="card-popup-body">
        {link ? (
          <LinkFields dir={dir} label={label} suggestions={suggestions} onDir={setDir} onLabel={setLabel} />
        ) : (
          <>
            <ul className="candidate-list" aria-label="候補">
              {result.items.map((c) => (
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
            {/* 空欄のときは先頭 100 件だけを出し、残りは検索で絞り込んでもらう（7-12-2） */}
            {browsing && result.rest > 0 && (
              <p className="small muted candidate-rest" data-testid="candidate-rest">
                ほか {result.rest}件。検索で絞り込めます
              </p>
            )}
          </>
        )}
        {message && <p className="error">{message}</p>}
      </div>
      {link && (
        <div className="add-relation-foot">
          <button type="button" className="btn-primary" disabled={busy} onClick={() => void save(link.target, { dir, label })} data-testid="add-link">
            追加
          </button>
        </div>
      )}
    </dialog>
  );
});
