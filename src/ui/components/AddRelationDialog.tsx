import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { syncModal, useCloseOnOutside } from './modal';
import { LinkFields } from './EditLinkSheet';
import { ADD_TITLES } from './RelationList';
import { errorMessage } from '../hooks';
import type { LinkDirection, RelationBlock, Section } from '../../domain/relations';
import { validateNodeName } from '../../domain/validation';
import {
  addRelation,
  canCreateNode,
  labelSuggestions,
  loadSearchData,
  sameNameCandidates,
  searchCandidates,
  type Candidate,
  type RelationTarget,
  type SearchData,
} from '../../app/relations';
import { RelationError } from '../../db/repo';

export interface AddRelationDialogHandle {
  /** ダイアログを開く。検索欄にはフォーカスせず、まず候補の一覧を見せる（7-12-2） */
  open: (section: Section) => void;
}

interface Props {
  /** 関係を足す項目（表示中の項目） */
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
  const inputRef = useRef<HTMLInputElement>(null);
  const [section, setSection] = useState<Section>('parents');
  const [data, setData] = useState<SearchData | null>(null);
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  // 「ノードを追加」で、検索欄をノードの名前の入力欄に切り替えているか
  const [nodeMode, setNodeMode] = useState(false);
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
      setNodeMode(false);
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

  const candidates: Candidate[] = useMemo(() => {
    if (!data) return [];
    return nodeMode ? sameNameCandidates(data, debounced, selfId, section) : searchCandidates(data, debounced, selfId, section);
  }, [data, debounced, selfId, section, nodeMode]);
  const name = debounced.trim();
  const showCreate = data != null && canCreateNode(data, debounced);
  const nameError = nodeMode && name ? validateNodeName(name) : null;
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

  /** 検索とノードの名前の入力を切り替える。入力は空にする */
  const switchMode = (toNode: boolean) => {
    setNodeMode(toNode);
    setQuery('');
    setDebounced('');
    setMessage(null);
    // 名前を入れるために押したので、押した処理の中で同期的にフォーカスしてキーボードを出す（iOS）
    if (toNode) inputRef.current?.focus();
  };

  const back = () => {
    if (link) setLink(null);
    else switchMode(false);
  };

  const row = (c: Candidate) => (
    <li key={c.item.id}>
      <button type="button" className="candidate-row" disabled={c.block != null || busy} onClick={() => choose({ id: c.item.id }, c.item.name)}>
        <span className="row-text">
          <span className={`row-title${c.item.kind === 'node' ? ' is-node' : ''}`}>{c.item.name}</span>
          <span className="row-sub">{c.item.kind === 'node' ? 'ノード' : `${c.item.back}・${c.item.folderName}`}</span>
        </span>
        {c.block && <span className="row-side">{BLOCK_TEXT[c.block]}</span>}
      </button>
    </li>
  );

  const createRow = (
    <li>
      <button type="button" className="candidate-row candidate-create" disabled={busy} onClick={() => choose({ newNodeName: name }, name)} data-testid="create-node">
        ＋「{name}」をノードとして作成
      </button>
    </li>
  );

  let list;
  if (nodeMode) {
    // 名前が同じ項目があっても作れる（4-10）。あれば作成の行の下に出して、存在が分かるようにする
    list = (
      <>
        {nameError && <p className="error">{nameError}</p>}
        {name && !nameError && <ul className="candidate-list">{createRow}</ul>}
        {candidates.length > 0 && (
          <>
            <h3 className="candidate-caption">同じ名前の項目</h3>
            <ul className="candidate-list" aria-label="同じ名前の項目" data-testid="same-name">
              {candidates.map(row)}
            </ul>
          </>
        )}
      </>
    );
  } else {
    list = (
      <ul className="candidate-list" aria-label="候補">
        {candidates.map(row)}
        {showCreate && createRow}
      </ul>
    );
  }

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
        {(link || nodeMode) && (
          <button type="button" className="btn-text sheet-back" aria-label={link ? '戻る' : '検索に戻る'} onClick={back}>
            ‹
          </button>
        )}
        <h2 id="add-relation-title">{link ? `「${link.name}」との連結` : ADD_TITLES[section]}</h2>
        <button type="button" className="btn-icon" aria-label="閉じる" onClick={close}>
          ✕
        </button>
      </div>
      {/* 「ノードを追加」は検索欄の上。押すと検索欄がノードの名前の入力欄に変わる */}
      {!link && !nodeMode && (
        <button type="button" className="btn-outline add-relation-node" onClick={() => switchMode(true)} data-testid="add-node">
          ノードを追加
        </button>
      )}
      {/* 検索欄は一覧と一緒にスクロールさせず、見出しの下に置いたままにする。連結の次の段では隠す */}
      <input
        ref={inputRef}
        type={nodeMode ? 'text' : 'search'}
        enterKeyHint={nodeMode ? 'done' : 'search'}
        className="add-relation-search"
        placeholder={nodeMode ? 'ノードの名前' : '名前で検索'}
        hidden={link != null}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        }}
        aria-label={nodeMode ? 'ノードの名前' : '名前で検索'}
        data-testid="add-relation-search"
      />
      <div className="card-popup-body">
        {link ? <LinkFields dir={dir} label={label} suggestions={suggestions} onDir={setDir} onLabel={setLabel} /> : list}
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
