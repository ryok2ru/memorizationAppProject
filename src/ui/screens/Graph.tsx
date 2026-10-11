import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Header } from '../components/Header';
import { RelationGraph } from '../components/RelationGraph';
import { Outline } from '../components/Outline';
import { syncModal, useCloseOnOutside } from '../components/modal';
import { useSheetDrag } from '../components/sheetDrag';
import { itemPath } from './ItemDetail';
import { listAllWords, listEdges, listFolders, listNodes } from '../../db/repo';
import { cardRef, nodeRef, type ItemRef } from '../../app/relations';
import { layoutRelationGraph, type GraphInput, type GraphItem, type GraphSide } from '../../app/graph';
import { groupRelations, relationsOf } from '../../domain/relations';
import type { Edge } from '../../domain/types';

type GraphMode = 'relation' | 'hierarchy';

/** 幅は 320〜480px（7-13）。画面の左右の余白（16px ずつ）を除いた幅 */
const clampWidth = (w: number) => Math.max(288, Math.min(448, w));

/** 中心の関係を 4 方向に振り分ける（7-13）。上 = 上位、下 = 下位、左 = 方向なしと ←、右 = → */
export function graphInput(centerId: string, edges: readonly Edge[], refs: Map<string, ItemRef>): GraphInput {
  const toItem = (id: string, label?: string, directed?: boolean): GraphItem => {
    const ref = refs.get(id)!;
    return { id, name: ref.name, kind: ref.kind, label: label || undefined, directed };
  };
  const entries = relationsOf(edges, centerId).filter((e) => refs.has(e.otherId));
  const g = groupRelations(entries, (id) => refs.get(id)!.name);
  return {
    center: toItem(centerId),
    top: g.parents.map((e) => toItem(e.otherId)),
    bottom: g.children.map((e) => toItem(e.otherId)),
    left: g.links.filter((e) => e.symbol !== '→').map((e) => toItem(e.otherId, e.edge.label, e.symbol === '←')),
    right: g.links.filter((e) => e.symbol === '→').map((e) => toItem(e.otherId, e.edge.label, true)),
  };
}

/** グラフ画面（7-13）。関係モードと階層モード（アウトライン） */
export function Graph() {
  const { itemId = '' } = useParams();
  const [params] = useSearchParams();
  const mode: GraphMode = params.get('mode') === 'hierarchy' ? 'hierarchy' : 'relation';
  const navigate = useNavigate();
  // 開いたときの中心。中心の移動は同じ画面の中で URL を置き換えるだけなので、画面を出るまで残る
  const [origin] = useState(itemId);
  const [data, setData] = useState<{ edges: Edge[]; refs: Map<string, ItemRef> } | null>(null);
  const [width, setWidth] = useState(358);
  const [moreSide, setMoreSide] = useState<GraphSide | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    const [edges, words, nodes, folders] = await Promise.all([listEdges(), listAllWords(), listNodes(), listFolders()]);
    const fm = new Map(folders.map((f) => [f.id, f]));
    const refs = new Map<string, ItemRef>();
    for (const w of words) refs.set(w.id, cardRef(w, fm));
    for (const n of nodes) refs.set(n.id, nodeRef(n));
    setData({ edges, refs });
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (data && !data.refs.has(itemId)) navigate('/', { replace: true });
  }, [data, itemId, navigate]);

  useEffect(() => {
    const measure = () => {
      if (boxRef.current) setWidth(clampWidth(boxRef.current.clientWidth));
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [data]);

  const input = useMemo(() => (data && data.refs.has(itemId) ? graphInput(itemId, data.edges, data.refs) : null), [data, itemId]);
  const layout = useMemo(() => (input ? layoutRelationGraph(input, width) : null), [input, width]);

  /** 中心の移動は履歴に積まず URL を置き換える。中心をもう一度タップすると詳細画面を開く（7-13） */
  const tap = (id: string) => {
    setMoreSide(null);
    if (id === itemId) {
      const ref = data?.refs.get(id);
      if (ref) navigate(itemPath(ref.kind, id));
      return;
    }
    navigate(`/graph/${id}?mode=${mode}`, { replace: true });
  };

  /** モードを切り替えると、中心は開いたときの項目に戻る（7-13） */
  const setMode = (m: GraphMode) => {
    if (m === mode) return;
    setMoreSide(null);
    navigate(`/graph/${origin}?mode=${m}`, { replace: true });
  };

  return (
    <div className="screen">
      <Header back="back" title="関係" />
      <div className="segmented" role="group" aria-label="モード" data-testid="graph-mode">
        <button type="button" aria-pressed={mode === 'relation'} onClick={() => setMode('relation')}>
          関係
        </button>
        <button type="button" aria-pressed={mode === 'hierarchy'} onClick={() => setMode('hierarchy')}>
          階層
        </button>
      </div>
      <div ref={boxRef} className="graph-box">
        {data &&
          input &&
          (mode === 'relation' && layout ? (
            <RelationGraph layout={layout} centerId={itemId} onTap={tap} onMore={setMoreSide} />
          ) : mode === 'hierarchy' ? (
            <Outline centerId={itemId} edges={data.edges} refs={data.refs} onTap={tap} />
          ) : null)}
      </div>
      <MoreSheet items={moreSide && input ? input[moreSide] : null} side={moreSide} onTap={tap} onClose={() => setMoreSide(null)} />
    </div>
  );
}

const SIDE_TITLES: Record<GraphSide, string> = { top: '上位', bottom: '下位', left: '連結（— と ←）', right: '連結（→）' };

/** グラフの「+N」の一覧（7-13）。下から出るシートで、その方向の項目をすべて並べる。行のタップで中心が移る */
function MoreSheet({ items, side, onTap, onClose }: { items: GraphItem[] | null; side: GraphSide | null; onTap: (id: string) => void; onClose: () => void }) {
  const open = items != null && side != null;
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => syncModal(ref.current, open), [open]);
  const outside = useCloseOnOutside(onClose);
  const drag = useSheetDrag(ref, open, onClose);
  return (
    <dialog
      className={`sheet${drag.sliding ? ' sheet-slide' : ''}`}
      ref={ref}
      style={drag.style}
      tabIndex={-1}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      {...outside}
      aria-labelledby="graph-more-title"
      data-testid="graph-more-sheet"
    >
      <h2 id="graph-more-title" className="sheet-handle" {...drag.handleProps}>
        {side ? SIDE_TITLES[side] : ''}
      </h2>
      <ul className="sheet-body candidate-list">
        {(items ?? []).map((it) => (
          <li key={it.id}>
            <button type="button" className="candidate-row" onClick={() => onTap(it.id)}>
              <span className="row-text">
                <span className={`row-title${it.kind === 'node' ? ' is-node' : ''}`}>{it.name}</span>
                {it.label && <span className="row-sub">{it.label}</span>}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </dialog>
  );
}
