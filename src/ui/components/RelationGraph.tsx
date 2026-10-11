import type { GraphLayout, GraphSide } from '../../app/graph';

interface Props {
  layout: GraphLayout;
  centerId: string;
  onTap: (id: string) => void;
  onMore: (side: GraphSide) => void;
}

/**
 * グラフ画面の関係モード（7-13）。線は SVG で手書きし、項目と「+N」は app/graph.ts が計算した座標に
 * ボタンとして重ねる（名前の末尾の省略とタップ領域を HTML で扱うため）
 */
export function RelationGraph({ layout, centerId, onTap, onMore }: Props) {
  return (
    <div className="relation-graph" style={{ width: layout.width, height: layout.height }} data-testid="relation-graph">
      <svg width={layout.width} height={layout.height} aria-hidden="true">
        <defs>
          <marker id="graph-arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="8" markerHeight="8" orient="auto-start-reverse">
            <path d="M0 0L8 4L0 8z" className="graph-arrow" />
          </marker>
        </defs>
        {layout.lines.map((l, i) => (
          <path key={i} d={l.d} className={l.kind === 'hierarchy' ? 'graph-line-h' : 'graph-line-l'} markerEnd={l.arrow ? 'url(#graph-arrow)' : undefined} />
        ))}
      </svg>
      {layout.items.map((p) => (
        <div key={`${p.side}:${p.item.id}`} className="graph-item-wrap" style={{ left: p.x, top: p.y, width: p.w }}>
          <button
            type="button"
            className={`graph-item${p.item.id === centerId ? ' is-center' : ''}${p.item.kind === 'node' ? ' is-node' : ''}`}
            onClick={() => onTap(p.item.id)}
            data-testid={p.item.id === centerId ? 'graph-center' : 'graph-item'}
          >
            {p.item.name}
          </button>
          {p.item.label && <div className="graph-label">{p.item.label}</div>}
        </div>
      ))}
      {layout.more.map((m) => (
        <button
          key={`more:${m.side}`}
          type="button"
          className="graph-item graph-more"
          style={{ left: m.x, top: m.y, width: m.w, position: 'absolute' }}
          onClick={() => onMore(m.side)}
          data-testid={`graph-more-${m.side}`}
        >
          +{m.count}
        </button>
      ))}
    </div>
  );
}
