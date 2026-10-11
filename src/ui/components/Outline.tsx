import { useMemo, useState } from 'react';
import { ancestorPaths, childrenMap, limitLevel, outlineChildren, treePrefix } from '../../app/graph';
import type { ItemRef } from '../../app/relations';
import type { Edge } from '../../domain/types';

interface Props {
  centerId: string;
  edges: Edge[];
  refs: Map<string, ItemRef>;
  onTap: (id: string) => void;
}

/** グラフ画面の階層モード（アウトライン。7-13）。上位への経路と、中心を根にした下位の木。連結は出さない */
export function Outline({ centerId, edges, refs, onTap }: Props) {
  const nameOf = (id: string) => refs.get(id)?.name ?? '';
  const paths = useMemo(() => ancestorPaths(edges, centerId, nameOf), [edges, centerId, refs]); // nameOf は refs から決まる
  const children = useMemo(() => childrenMap(edges), [edges]);
  // 開いている枝と、「ほか N件」で全件を出している段。同じ項目が木の複数の場所に出るので、根からの経路で区別する
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [showAll, setShowAll] = useState<Set<string>>(new Set());
  const toggle = (set: Set<string>, key: string) => {
    const next = new Set(set);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    return next;
  };

  const name = (id: string) => {
    const ref = refs.get(id);
    return (
      <button type="button" className={`outline-name${ref?.kind === 'node' ? ' is-node' : ''}${id === centerId ? ' is-center' : ''}`} onClick={() => onTap(id)}>
        {ref?.name ?? ''}
        {ref?.kind === 'node' && <span className="relation-tag">ノード</span>}
      </button>
    );
  };

  /** key の項目の下位を 1 段ぶん並べる。ancestorsLast は木の線に使う */
  const level = (parentId: string, key: string, ancestorsLast: boolean[]): JSX.Element => {
    const list = outlineChildren(children, parentId, nameOf);
    const { shown, rest } = limitLevel(list, showAll.has(key));
    return (
      <>
        {shown.map((childId, i) => {
          const childKey = `${key}/${childId}`;
          const isLast = i === shown.length - 1 && rest === 0;
          const count = children.get(childId)?.length ?? 0;
          const open = expanded.has(childKey);
          return (
            <div key={childKey}>
              <div className="outline-row">
                <span className="outline-tree" aria-hidden="true">
                  {treePrefix(ancestorsLast, isLast)}
                </span>
                {count > 0 ? (
                  <button
                    type="button"
                    className="outline-toggle"
                    aria-expanded={open}
                    aria-label={open ? '閉じる' : '開く'}
                    onClick={() => setExpanded((s) => toggle(s, childKey))}
                  >
                    <span className="outline-toggle-icon" aria-hidden="true">
                      {open ? '▾' : '▸'}
                    </span>
                    {!open && count}
                  </button>
                ) : null}
                {name(childId)}
              </div>
              {open && level(childId, childKey, [...ancestorsLast, isLast])}
            </div>
          );
        })}
        {rest > 0 && (
          <div className="outline-row">
            <span className="outline-tree" aria-hidden="true">
              {treePrefix(ancestorsLast, true)}
            </span>
            <button type="button" className="btn-text outline-more" onClick={() => setShowAll((s) => toggle(s, key))}>
              ほか {rest}件
            </button>
          </div>
        )}
      </>
    );
  };

  const hasChildren = (children.get(centerId)?.length ?? 0) > 0;
  return (
    <div className="outline" data-testid="outline">
      <section className="section">
        <h2>上位への経路</h2>
        {paths.paths.length === 0 ? (
          <p className="small muted">なし</p>
        ) : (
          <ul className="outline-paths">
            {paths.paths.map((p) => (
              <li key={p.join('/')}>
                {p.map((id, i) => (
                  <span key={`${id}:${i}`}>
                    {i > 0 && <span className="muted"> › </span>}
                    {name(id)}
                  </span>
                ))}
              </li>
            ))}
            {paths.total > paths.paths.length && <li className="small muted">ほか {paths.total - paths.paths.length}本</li>}
          </ul>
        )}
      </section>
      <section className="section">
        <h2>下位</h2>
        <div className="outline-row">{name(centerId)}</div>
        {hasChildren ? level(centerId, centerId, []) : <p className="small muted">なし</p>}
      </section>
    </div>
  );
}
