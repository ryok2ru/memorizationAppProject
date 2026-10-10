import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Header } from '../components/Header';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { FavoriteButton } from '../components/FavoriteButton';
import { CardFields, useCardEditor } from '../components/CardFields';
import { DetailTabs, type DetailTab } from '../components/DetailTabs';
import { RelationList } from '../components/RelationList';
import { AddRelationDialog, type AddRelationDialogHandle } from '../components/AddRelationDialog';
import { EditLinkSheet } from '../components/EditLinkSheet';
import { MOVED_MS, UNDO_MS, movedMessage } from './WordList';
import { errorMessage, useWordImage } from '../hooks';
import {
  cardToNode,
  deleteEdge,
  deleteItems,
  getNode,
  getWord,
  getWordImage,
  listEdges,
  listFolders,
  nodeToCard,
  renameNode,
  restoreEdge,
  setFavorite,
  updateWordText,
} from '../../db/repo';
import { updateBadge } from '../../app/badge';
import {
  cardRef,
  defaultFolderForNode,
  edgeOrphanMessage,
  labelSuggestions,
  loadRelationView,
  nodeRef,
  orphansIfEdgeDeleted,
  orphansIfItemsDeleted,
  withOrphanSuffix,
  type ItemRef,
  type RelationRow,
  type RelationView,
} from '../../app/relations';
import { requestPersistentStorage } from '../../app/settings';
import { detailDueLabel } from '../../domain/dates';
import { validateNodeName } from '../../domain/validation';
import { STATE_ICONS, STATE_NAMES, type Edge, type Folder, type NodeItem, type Word } from '../../domain/types';

export type ItemKind = 'card' | 'node';

/** 項目の詳細画面の URL（7-1） */
export const itemPath = (kind: ItemKind, id: string): string => (kind === 'card' ? `/words/${id}` : `/nodes/${id}`);

/** ルートから開く。id が変わったら作り直す（関係の行から別の項目へ移ったとき、状態を持ち越さない） */
export function ItemDetailRoute({ kind }: { kind: ItemKind }) {
  const { wordId, nodeId } = useParams();
  const id = (kind === 'card' ? wordId : nodeId) ?? '';
  return <ItemDetail key={`${kind}:${id}`} kind={kind} id={id} />;
}

type Mode = 'view' | 'editMain' | 'editRelations' | 'toCard';

interface Loaded {
  word: Word | null;
  node: NodeItem | null;
  self: ItemRef;
  folders: Folder[];
  view: RelationView;
}

/** 確認ダイアログ。onConfirm は確定したときの処理 */
interface Confirm {
  title?: string;
  message: string;
  confirmLabel: string;
  danger: boolean;
  onConfirm: () => void;
}

/**
 * カード詳細画面（7-12）。カードとノードの両方を表示し、「カード（ノード）」と「関係」を切り替える。
 * 右上の編集で、見ている側をその場で編集する
 */
export function ItemDetail({ kind, id }: { kind: ItemKind; id: string }) {
  const navigate = useNavigate();
  const [data, setData] = useState<Loaded | null>(null);
  // 初期表示は、カードは「カード」、ノードは「関係」（7-12）
  const [tab, setTab] = useState<DetailTab>(kind === 'card' ? 'main' : 'relations');
  const [mode, setMode] = useState<Mode>('view');
  const [message, setMessage] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [undoEdge, setUndoEdge] = useState<Edge | null>(null);
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const [editLink, setEditLink] = useState<RelationRow | null>(null);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [nodeName, setNodeName] = useState('');
  const [imageVersion, setImageVersion] = useState(0);
  const editor = useCardEditor();
  const sheetRef = useRef<AddRelationDialogHandle>(null);
  const undoTimer = useRef<ReturnType<typeof setTimeout>>();
  const image = useWordImage(kind === 'card' ? id : undefined, imageVersion);

  const load = useCallback(async () => {
    const [word, node, folders, view] = await Promise.all([
      kind === 'card' ? getWord(id) : Promise.resolve(undefined),
      kind === 'node' ? getNode(id) : Promise.resolve(undefined),
      listFolders(),
      loadRelationView(id),
    ]);
    if (kind === 'card' && !word) {
      // ノードに戻した後に「戻る」で来たときなどは、ノードの画面に置き換える。どちらにも無ければホームへ
      navigate((await getNode(id)) ? itemPath('node', id) : '/', { replace: true });
      return;
    }
    if (kind === 'node' && !node) {
      navigate((await getWord(id)) ? itemPath('card', id) : '/', { replace: true });
      return;
    }
    const folderMap = new Map(folders.map((f) => [f.id, f]));
    setData({
      word: word ?? null,
      node: node ?? null,
      self: word ? cardRef(word, folderMap) : nodeRef(node!),
      folders,
      view,
    });
  }, [kind, id, navigate]);

  useEffect(() => {
    void load().catch((e) => setMessage(errorMessage(e)));
  }, [load]);

  useEffect(() => () => clearTimeout(undoTimer.current), []);

  const showToast = (text: string, ms: number, edge: Edge | null = null) => {
    clearTimeout(undoTimer.current);
    setToast(text);
    setUndoEdge(edge);
    undoTimer.current = setTimeout(() => {
      setToast(null);
      setUndoEdge(null);
    }, ms);
  };

  if (!data) {
    return (
      <div className="screen">
        <Header back="back" title={kind === 'card' ? 'カード' : 'ノード'} />
        {message && <div className="notice">{message}</div>}
      </div>
    );
  }

  const { word, node, self, folders, view } = data;
  const mainLabel = kind === 'card' ? 'カード' : 'ノード';
  const run = async (fn: () => Promise<void>) => {
    try {
      setMessage(null);
      await fn();
    } catch (e) {
      setMessage(errorMessage(e));
    }
  };

  // ---------- 右上の編集 ----------

  const startEdit = () => {
    if (tab === 'relations') {
      setMode('editRelations');
      return;
    }
    if (word) {
      void getWordImage(id).then((img) => {
        editor.reset(
          { folderId: word.folderId, englishTerm: word.englishTerm, japaneseDefinition: word.japaneseDefinition, memo: word.memo },
          img ? { data: img.data, type: img.type, side: img.side } : null,
        );
        setMode('editMain');
      });
    } else if (node) {
      setNodeName(node.name);
      setMode('editMain');
    }
  };

  const cancelEdit = () => {
    const dirty = mode === 'editMain' && node ? nodeName !== node.name : editor.dirty;
    if (!dirty) {
      setMode('view');
      return;
    }
    setConfirm({
      message: '変更を破棄しますか？',
      confirmLabel: '破棄',
      danger: true,
      onConfirm: () => setMode('view'),
    });
  };

  const nodeNameError = validateNodeName(nodeName);
  const canSave = mode === 'editMain' && node ? nodeNameError == null : editor.canSave;

  const save = () =>
    run(async () => {
      if (mode === 'editMain' && word) {
        // 本文・フォルダ・画像を保存する。FSRS の状態・ReviewLog・☆ は変えない（7-12）
        await updateWordText(id, { ...editor.value(), folderId: editor.form.folderId }, Date.now(), editor.imageArg());
        const dest = folders.find((f) => f.id === editor.form.folderId);
        if (editor.form.folderId !== word.folderId && dest) showToast(movedMessage(1, dest.name), MOVED_MS);
        setImageVersion((v) => v + 1);
      } else if (mode === 'editMain' && node) {
        await renameNode(id, nodeName.trim());
      } else if (mode === 'toCard') {
        // ノードをカードにする（4-12）。学習に出るカードが増えるのでバッジを更新する
        requestPersistentStorage();
        await nodeToCard(id, { folderId: editor.form.folderId, ...editor.value() }, Date.now(), editor.imageArg());
        await updateBadge();
        navigate(itemPath('card', id), { replace: true });
        return;
      }
      setMode('view');
      await load();
    });

  // ---------- カード側 ----------

  const toggleFavorite = () =>
    run(async () => {
      if (!word) return;
      await setFavorite(id, !word.favorite);
      await load();
    });

  const askToNode = () =>
    setConfirm({
      message:
        'このカードを学習から外し、ノードにします。フォルダから外れ、関係を見る画面にだけ表示されます。学習の記録は残り、カードに戻すと続きから再開します。',
      confirmLabel: 'ノードにする',
      danger: false,
      onConfirm: () =>
        void run(async () => {
          await cardToNode(id);
          // 学習に出るカードが減るのでバッジを更新する（4-12）
          await updateBadge();
          navigate(itemPath('node', id), { replace: true });
        }),
    });

  const askDelete = () =>
    void run(async () => {
      const orphans = (await orphansIfItemsDeleted([id])).length;
      const base = word ? 'このカードと学習履歴を削除します。よろしいですか？' : `ノード「${node!.name}」と、その関係をすべて削除します。よろしいですか？`;
      setConfirm({
        title: word ? 'カードを削除' : 'ノードを削除',
        message: withOrphanSuffix(base, orphans),
        confirmLabel: '削除',
        danger: true,
        onConfirm: () =>
          void run(async () => {
            await deleteItems([id]);
            if (word) {
              // カードが減るのでバッジを更新し、元のフォルダの単語一覧へ戻る
              await updateBadge();
              navigate(`/folders/${word.folderId}`, { replace: true });
            } else {
              // ノードの削除では今日の復習数は変わらないのでバッジは更新しない（4-12）
              navigate(-1);
            }
          }),
      });
    });

  const startToCard = () =>
    void run(async () => {
      const img = await getWordImage(id);
      editor.reset(
        {
          folderId: defaultFolderForNode(node!, folders, view) ?? '',
          englishTerm: node!.name,
          japaneseDefinition: node!.saved?.japaneseDefinition ?? '',
          memo: node!.saved?.memo ?? '',
        },
        img ? { data: img.data, type: img.type, side: img.side } : null,
      );
      setMode('toCard');
    });

  // ---------- 関係側 ----------

  const openRow = (row: RelationRow) => navigate(itemPath(row.item.kind, row.item.id));

  const removeRow = (row: RelationRow) =>
    void run(async () => {
      const edge = row.entry.edge;
      const orphans = await orphansIfEdgeDeleted(edge.id);
      const remove = async () => {
        await deleteEdge(edge.id);
        // 表示中のノード自身が孤立して消えたら、直前の画面へ戻る
        if (orphans.some((o) => o.id === id)) {
          navigate(-1);
          return;
        }
        await load();
      };
      if (orphans.length === 0) {
        await remove();
        showToast('関係を削除しました', UNDO_MS, edge);
        return;
      }
      // 孤立ノードが出るときは「元に戻す」を使わず確認する（4-12）
      setConfirm({
        message: edgeOrphanMessage(orphans),
        confirmLabel: '削除',
        danger: true,
        onConfirm: () => void run(remove),
      });
    });

  const undoRemove = () =>
    void run(async () => {
      if (!undoEdge) return;
      clearTimeout(undoTimer.current);
      setToast(null);
      setUndoEdge(null);
      await restoreEdge(undoEdge);
      await load();
    });

  const openEditLink = (row: RelationRow) =>
    void listEdges().then((edges) => {
      setSuggestions(labelSuggestions(edges));
      setEditLink(row);
    });

  // ---------- 上部バー ----------

  const editing = mode !== 'view';
  let header;
  if (mode === 'editRelations') {
    header = (
      <Header
        title={mainLabel}
        right={
          <button type="button" className="btn-text" style={{ fontWeight: 600 }} onClick={() => setMode('view')} data-testid="done-relations">
            完了
          </button>
        }
      />
    );
  } else if (editing) {
    header = (
      <Header
        title={mode === 'toCard' ? 'カードにする' : mainLabel}
        left={
          <button type="button" className="btn-text" onClick={cancelEdit}>
            キャンセル
          </button>
        }
        right={
          <button type="button" className="btn-text" style={{ fontWeight: 600 }} disabled={!canSave} onClick={() => void save()} data-testid="save">
            保存
          </button>
        }
      />
    );
  } else {
    header = (
      <Header
        back="back"
        title={mainLabel}
        right={
          <>
            {word && <FavoriteButton favorite={word.favorite} onToggle={() => void toggleFavorite()} />}
            <button type="button" className="btn-text" onClick={startEdit} data-testid="edit">
              編集
            </button>
          </>
        }
      />
    );
  }

  const cardForm = (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
      style={{ display: 'flex', flexDirection: 'column', gap: 16 }}
    >
      <CardFields editor={editor} folders={folders} onMessage={setMessage} />
    </form>
  );

  let body;
  if (mode === 'toCard') {
    body = cardForm;
  } else if (tab === 'main' && word) {
    body =
      mode === 'editMain' ? (
        <>
          {cardForm}
          {/* 関係が 1 つも無ければ「ノードに戻す」は出さない（4-12） */}
          {view.count > 0 && (
            <button type="button" className="btn-outline" onClick={askToNode} data-testid="to-node">
              ノードに戻す
            </button>
          )}
          <button type="button" className="btn-outline-danger" onClick={askDelete} data-testid="delete-item">
            このカードを削除
          </button>
        </>
      ) : (
        <>
          <div className="detail-card detail-page" data-testid="card-detail">
            <div className="detail-front">{word.englishTerm}</div>
            <div className="detail-back">{word.japaneseDefinition}</div>
            {/* 画像は表示する面の設定にかかわらず出す（7-12） */}
            {image && <img className="card-image" src={image.url} alt="" draggable={false} />}
            {word.memo && (
              <div className="detail-memo">
                <h3>メモ</h3>
                <p>{word.memo}</p>
              </div>
            )}
          </div>
          <div className="detail-state" data-testid="card-state">
            <span>
              <span aria-hidden="true">{STATE_ICONS[word.state]}</span> {STATE_NAMES[word.state]}
            </span>
            <span className="muted">次の復習: {detailDueLabel(word.due, word.state, Date.now())}</span>
          </div>
        </>
      );
  } else if (tab === 'main' && node) {
    body =
      mode === 'editMain' ? (
        <>
          <label className="field">
            <span>名前</span>
            <input type="text" value={nodeName} onChange={(e) => setNodeName(e.target.value)} data-testid="node-name" />
            {nodeName.trim() && nodeNameError && <p className="error">{nodeNameError}</p>}
          </label>
          <button type="button" className="btn-outline-danger" onClick={askDelete} data-testid="delete-item">
            このノードを削除
          </button>
        </>
      ) : (
        <div className="detail-card detail-page">
          <div className="detail-front is-node">{node.name}</div>
          <button type="button" className="btn-outline" disabled={folders.length === 0} onClick={startToCard} data-testid="to-card">
            カードにする
          </button>
          {folders.length === 0 && <p className="small muted">先にフォルダを作成してください</p>}
        </div>
      );
  } else {
    body = (
      <>
        {/* 関係側でも名前を出し続ける（7-12）。ここは表示だけで、表と裏はカード側の編集でだけ変える */}
        <div className="detail-card detail-page" data-testid="relation-names">
          {word ? (
            <>
              <div className="detail-front">{word.englishTerm}</div>
              <div className="detail-back">{word.japaneseDefinition}</div>
            </>
          ) : (
            <div className="detail-front is-node">{node!.name}</div>
          )}
        </div>
        {/* 「グラフで見る」は通常だけ。編集中は代わりに各区分の「＋」が出る（7-12） */}
        {mode === 'view' && view.count > 0 && (
          <div className="graph-link">
            <button type="button" className="btn-text" onClick={() => navigate(`/graph/${id}?mode=relation`)} data-testid="open-graph">
              グラフで見る ›
            </button>
          </div>
        )}
        <RelationList
          self={self}
          view={view}
          mode={mode === 'editRelations' ? 'edit' : 'view'}
          onOpen={openRow}
          onAdd={(section) => sheetRef.current?.open(section)}
          onRemove={removeRow}
          onEditLink={openEditLink}
        />
      </>
    );
  }

  return (
    <div className="screen">
      {header}
      {mode !== 'toCard' && <DetailTabs mainLabel={mainLabel} relationCount={view.count} value={tab} onChange={setTab} disabled={editing} />}

      {message && (
        <div className="notice" role="alert">
          {message}
        </div>
      )}

      {body}

      {toast && (
        <div className="toast" role="status" data-testid="detail-toast">
          <span>{toast}</span>
          {undoEdge && (
            <button type="button" onClick={undoRemove}>
              元に戻す
            </button>
          )}
        </div>
      )}

      <AddRelationDialog ref={sheetRef} selfId={id} onAdded={() => void load()} />
      <EditLinkSheet
        selfId={id}
        row={editLink}
        suggestions={suggestions}
        onClose={() => setEditLink(null)}
        onSaved={() => {
          setEditLink(null);
          void load();
        }}
      />
      <ConfirmDialog
        open={confirm != null}
        title={confirm?.title}
        message={confirm?.message ?? ''}
        confirmLabel={confirm?.confirmLabel}
        danger={confirm?.danger}
        onConfirm={() => {
          const c = confirm;
          setConfirm(null);
          c?.onConfirm();
        }}
        onCancel={() => setConfirm(null)}
      />
    </div>
  );
}
