import { LIMITS, type Edge, type EdgeKind } from './types';

/** 関係側の区分（7-12）。上位・下位・連結 */
export type Section = 'parents' | 'children' | 'links';

/** 連結の記号（7-12）。— は方向なし、→ はこの項目から相手へ、← は相手からこの項目へ */
export type LinkSymbol = '—' | '→' | '←';

/** 連結の向き（7-12-2）。表示中の項目から見たもの */
export type LinkDirection = 'none' | 'out' | 'in';

/** 項目から見た関係 1 件 */
export interface RelationEntry {
  edge: Edge;
  /** 相手の項目の id */
  otherId: string;
  section: Section;
  /** 連結のときだけ */
  symbol?: LinkSymbol;
}

/** 2 つの項目の間に関係があるか（4-11 の 1 組 1 関係。種類と向きを問わない） */
export function hasRelation(edges: readonly Edge[], a: string, b: string): boolean {
  return edges.some((e) => (e.from === a && e.to === b) || (e.from === b && e.to === a));
}

/** 階層の関係から、上位 id → 下位 id の一覧を作る */
export function childrenMap(edges: readonly Edge[]): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const e of edges) {
    if (e.kind !== 'hierarchy') continue;
    const list = map.get(e.from);
    if (list) list.push(e.to);
    else map.set(e.from, [e.to]);
  }
  return map;
}

/** 階層の関係から、下位 id → 上位 id の一覧を作る */
export function parentsMap(edges: readonly Edge[]): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const e of edges) {
    if (e.kind !== 'hierarchy') continue;
    const list = map.get(e.to);
    if (list) list.push(e.from);
    else map.set(e.to, [e.from]);
  }
  return map;
}

/** id から下位をたどって届く項目（id 自身は含まない） */
export function descendants(edges: readonly Edge[], id: string): Set<string> {
  const children = childrenMap(edges);
  const seen = new Set<string>();
  const stack = [...(children.get(id) ?? [])];
  while (stack.length > 0) {
    const c = stack.pop()!;
    if (seen.has(c)) continue;
    seen.add(c);
    stack.push(...(children.get(c) ?? []));
  }
  return seen;
}

/** 階層で parent を child の上位にすると循環になるか（4-11）。parent が child 自身か、child の下位なら循環 */
export function wouldCycle(edges: readonly Edge[], parent: string, child: string): boolean {
  return parent === child || descendants(edges, child).has(parent);
}

/** 関係を追加できない理由（4-11）。追加できれば null */
export type RelationBlock = 'self' | 'exists' | 'cycle';

/**
 * 関係を追加できるか（4-11）。階層は from = 上位、to = 下位。
 * 自分自身・すでに関係がある・循環になる、のどれかなら理由を返す
 */
export function relationBlock(edges: readonly Edge[], kind: EdgeKind, from: string, to: string): RelationBlock | null {
  if (from === to) return 'self';
  if (hasRelation(edges, from, to)) return 'exists';
  if (kind === 'hierarchy' && wouldCycle(edges, from, to)) return 'cycle';
  return null;
}

/** 連結の記号（7-12）。id から見た向き */
export function linkSymbol(edge: Edge, id: string): LinkSymbol {
  if (!edge.directed) return '—';
  return edge.from === id ? '→' : '←';
}

/** 連結の記号から向きへ（7-12-3 の初期値） */
export const symbolDirection = (s: LinkSymbol): LinkDirection => (s === '—' ? 'none' : s === '→' ? 'out' : 'in');

/** 連結の向きの保存（7-12-2）。from・to・directed を返す */
export function linkEnds(self: string, other: string, dir: LinkDirection): Pick<Edge, 'from' | 'to' | 'directed'> {
  if (dir === 'in') return { from: other, to: self, directed: true };
  return { from: self, to: other, directed: dir === 'out' };
}

/** id の関係を区分と記号に振り分ける（並べ替えはしない） */
export function relationsOf(edges: readonly Edge[], id: string): RelationEntry[] {
  const list: RelationEntry[] = [];
  for (const edge of edges) {
    if (edge.from !== id && edge.to !== id) continue;
    const otherId = edge.from === id ? edge.to : edge.from;
    if (edge.kind === 'hierarchy') list.push({ edge, otherId, section: edge.to === id ? 'parents' : 'children' });
    else list.push({ edge, otherId, section: 'links', symbol: linkSymbol(edge, id) });
  }
  return list;
}

const SYMBOL_ORDER: Record<LinkSymbol, number> = { '—': 0, '→': 1, '←': 2 };

export interface GroupedRelations {
  parents: RelationEntry[];
  children: RelationEntry[];
  links: RelationEntry[];
}

/**
 * 区分ごとにまとめて並べる（7-12）。上位・下位は名前の文字順、
 * 連結は「—」「→」「←」の順にまとめ、その中で文字順
 */
export function groupRelations(entries: readonly RelationEntry[], nameOf: (id: string) => string): GroupedRelations {
  const byName = (a: RelationEntry, b: RelationEntry) => nameOf(a.otherId).localeCompare(nameOf(b.otherId), 'ja');
  return {
    parents: entries.filter((e) => e.section === 'parents').sort(byName),
    children: entries.filter((e) => e.section === 'children').sort(byName),
    links: entries
      .filter((e) => e.section === 'links')
      .sort((a, b) => SYMBOL_ORDER[a.symbol!] - SYMBOL_ORDER[b.symbol!] || byName(a, b)),
  };
}

/** ラベルの候補（4-11）。連結のラベル（空を除く）を新しい関係から順に、重複を除いて最大 8 件 */
export function labelSuggestions(edges: readonly Edge[], max: number = LIMITS.labelSuggestions): string[] {
  const out: string[] = [];
  const sorted = edges.filter((e) => e.kind === 'link').sort((a, b) => b.createdAt - a.createdAt);
  for (const e of sorted) {
    const label = e.label.trim();
    if (label === '' || out.includes(label)) continue;
    out.push(label);
    if (out.length >= max) break;
  }
  return out;
}

/** 兄弟か（6-2）。同じ上位を 1 つ以上共有する。上位はカードでもノードでもよい */
export function areSiblings(parents: Map<string, string[]>, a: string, b: string): boolean {
  const pa = parents.get(a);
  const pb = parents.get(b);
  if (!pa || !pb) return false;
  return pa.some((p) => pb.includes(p));
}

/**
 * 削除で関係が 0 になるノード（4-11、4-12）。
 * removedItemIds の項目（とその関係）と removedEdgeIds の関係を消した後に、関係が 1 つも残らないノードの id を返す。
 * 削除する項目自身と、もともと関係の無いノードは含めない。関係 0 のノードには消える関係が無いので、連鎖はこの 1 回の判定で尽きる
 */
export function orphanNodes(
  edges: readonly Edge[],
  nodeIds: Iterable<string>,
  removedItemIds: Iterable<string>,
  removedEdgeIds: Iterable<string> = [],
): string[] {
  const removedItems = new Set(removedItemIds);
  const removedEdges = new Set(removedEdgeIds);
  const before = new Set<string>();
  const after = new Set<string>();
  for (const e of edges) {
    before.add(e.from);
    before.add(e.to);
    if (removedEdges.has(e.id) || removedItems.has(e.from) || removedItems.has(e.to)) continue;
    after.add(e.from);
    after.add(e.to);
  }
  const out: string[] = [];
  for (const id of nodeIds) if (!removedItems.has(id) && before.has(id) && !after.has(id)) out.push(id);
  return out;
}
