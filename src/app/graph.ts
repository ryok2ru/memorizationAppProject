import { LIMITS, type Edge } from '../domain/types';
import { childrenMap, parentsMap } from '../domain/relations';

// ---------- 関係モード（7-13） ----------

/** 図に置く項目 */
export interface GraphItem {
  id: string;
  name: string;
  kind: 'card' | 'node';
  /** 連結のラベル。空なら出さない */
  label?: string;
  /** 単一方向の連結（左は ←、右は →）。矢印を付ける */
  directed?: boolean;
}

/** 中心から見た 4 方向。上 = 上位、下 = 下位、左 = 方向なしと ←、右 = → */
export type GraphSide = 'top' | 'bottom' | 'left' | 'right';

export interface GraphInput {
  center: GraphItem;
  top: GraphItem[];
  bottom: GraphItem[];
  left: GraphItem[];
  right: GraphItem[];
}

export interface GraphBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface PlacedItem extends GraphBox {
  item: GraphItem;
  side: GraphSide | 'center';
}

/** 「+N」。押すとその方向の一覧を出す */
export interface PlacedMore extends GraphBox {
  side: GraphSide;
  count: number;
}

export interface GraphLine {
  /** SVG の path の d */
  d: string;
  kind: 'hierarchy' | 'link';
  /** 単一方向の連結の矢印。end は線の終わり（項目側）に付ける */
  arrow: boolean;
}

export interface GraphLayout {
  width: number;
  height: number;
  items: PlacedItem[];
  more: PlacedMore[];
  lines: GraphLine[];
}

/** 枠の高さと、ラベルの 1 行（11px）の高さ */
export const BOX_H = 32;
const LABEL_H = 14;
const PAD = 4;
const GAP = 8;
/** 上下の並びと中心の行の間（階層の線を引く所） */
const ROW_GAP = 28;
/** 左右の連結の列と中心の列の間（連結の曲線を引く所）。狭いと点線がつぶれて見えない */
export const LINK_GAP = 32;

/** 方向ごとに 3 件まで出し、残りを「+N」にまとめる（7-13） */
export function splitSide<T>(list: readonly T[], max: number = LIMITS.graphSideMax): { shown: T[]; rest: number } {
  return { shown: list.slice(0, max), rest: Math.max(0, list.length - max) };
}

const itemH = (it: GraphItem) => BOX_H + (it.label ? LABEL_H : 0);

/**
 * 関係モードの配置（7-13）。幅 width（320〜480px を想定）の中に、上に上位、下に下位、
 * 左に方向なしと ←、右に → を並べ、各方向 3 件まで、超えた分は「+N」にまとめる。
 * 左右の列と中心の間は LINK_GAP 空け、連結の曲線を引く。座標は左上原点の px
 */
export function layoutRelationGraph(input: GraphInput, width: number): GraphLayout {
  const items: PlacedItem[] = [];
  const more: PlacedMore[] = [];
  const lines: GraphLine[] = [];
  // 中央の行（左の列・中心・右の列）。列の間は連結の曲線のために LINK_GAP 空ける
  const colW = (width - PAD * 2 - LINK_GAP * 2) / 3;
  const colX = [PAD, PAD + colW + LINK_GAP, PAD + (colW + LINK_GAP) * 2];
  // 上下の並びの枠の幅は、連結の間隔に左右されないよう、幅を 3 等分した値を上限にする
  const rowW = (width - PAD * 2 - GAP * 2) / 3;

  // 上下の横の並び。項目と「+N」を等分した枠に置き、中央にそろえる
  const row = (side: 'top' | 'bottom', list: GraphItem[], y: number): PlacedItem[] => {
    const { shown, rest } = splitSide(list);
    const slots = shown.length + (rest > 0 ? 1 : 0);
    const avail = width - PAD * 2;
    const slotW = slots > 0 ? Math.min(rowW, (avail - GAP * (slots - 1)) / slots) : 0;
    const total = slots * slotW + Math.max(0, slots - 1) * GAP;
    let x = width / 2 - total / 2;
    const placed: PlacedItem[] = [];
    for (const it of shown) {
      placed.push({ item: it, side, x, y, w: slotW, h: BOX_H });
      x += slotW + GAP;
    }
    if (rest > 0) more.push({ side, count: rest, x, y, w: slotW, h: BOX_H });
    items.push(...placed);
    return placed;
  };

  // 左右の縦の並び
  const column = (side: 'left' | 'right', list: GraphItem[], x: number, top: number): { placed: PlacedItem[]; bottom: number } => {
    const { shown, rest } = splitSide(list);
    let y = top;
    const placed: PlacedItem[] = [];
    for (const it of shown) {
      placed.push({ item: it, side, x, y, w: colW, h: itemH(it) });
      y += itemH(it) + GAP;
    }
    if (rest > 0) {
      more.push({ side, count: rest, x, y, w: colW, h: BOX_H });
      y += BOX_H + GAP;
    }
    items.push(...placed);
    return { placed, bottom: y - GAP };
  };

  const topY = PAD;
  const topRow = row('top', input.top, topY);
  const midTop = topY + BOX_H + ROW_GAP;
  const leftCol = column('left', input.left, colX[0], midTop);
  const rightCol = column('right', input.right, colX[2], midTop);
  const midBottom = Math.max(leftCol.bottom, rightCol.bottom, midTop + BOX_H);
  const center: PlacedItem = { item: input.center, side: 'center', x: colX[1], y: (midTop + midBottom) / 2 - BOX_H / 2, w: colW, h: BOX_H };
  items.push(center);
  const bottomY = midBottom + ROW_GAP;
  const bottomRow = row('bottom', input.bottom, bottomY);
  const height = bottomY + BOX_H + PAD;

  const cx = center.x + center.w / 2;
  // 階層の線（実線の直角）。中心から縦に伸ばし、横の線から各項目へ下ろす
  const elbow = (targets: GraphBox[], up: boolean) => {
    if (targets.length === 0) return;
    const fromY = up ? center.y : center.y + center.h;
    const busY = up ? targets[0].y + BOX_H + ROW_GAP / 2 : targets[0].y - ROW_GAP / 2;
    const xs = targets.map((t) => t.x + t.w / 2);
    const minX = Math.min(cx, ...xs);
    const maxX = Math.max(cx, ...xs);
    let d = `M${cx} ${fromY}V${busY}M${minX} ${busY}H${maxX}`;
    for (const t of targets) d += `M${t.x + t.w / 2} ${busY}V${up ? t.y + BOX_H : t.y}`;
    lines.push({ d, kind: 'hierarchy', arrow: false });
  };
  const moreOf = (side: GraphSide) => more.filter((m) => m.side === side);
  elbow([...topRow, ...moreOf('top')], true);
  elbow([...bottomRow, ...moreOf('bottom')], false);

  // 連結の線（点線の曲線）。中心の横から各項目の内側の辺へ
  const cy = center.y + center.h / 2;
  const curve = (t: PlacedItem, toLeft: boolean, arrow: boolean, reverse: boolean) => {
    const sx = toLeft ? center.x : center.x + center.w;
    const tx = toLeft ? t.x + t.w : t.x;
    const ty = t.y + BOX_H / 2;
    const mx = (sx + tx) / 2;
    // reverse なら項目から中心へ向けて引き、終わり（中心側）に矢印を付ける
    const d = reverse ? `M${tx} ${ty}C${mx} ${ty} ${mx} ${cy} ${sx} ${cy}` : `M${sx} ${cy}C${mx} ${cy} ${mx} ${ty} ${tx} ${ty}`;
    lines.push({ d, kind: 'link', arrow });
  };
  for (const t of leftCol.placed) curve(t, true, t.item.directed === true, true);
  for (const t of rightCol.placed) curve(t, false, t.item.directed === true, false);

  return { width, height, items, more, lines };
}

// ---------- 階層モード（アウトライン。7-13） ----------

export interface AncestorPaths {
  /** 最上位から中心までの id の並び。最大 10 本 */
  paths: string[][];
  /** 経路の総数（「ほか N本」に使う） */
  total: number;
}

/**
 * 上位への経路（7-13）。中心から上位をたどった経路を、最上位から中心までの並びで返す。
 * 上位が複数あれば経路も複数。名前の文字順にたどり、max 本まで。上位がなければ空
 */
export function ancestorPaths(
  edges: readonly Edge[],
  center: string,
  nameOf: (id: string) => string,
  max: number = LIMITS.outlinePathsMax,
): AncestorPaths {
  const parents = parentsMap(edges);
  const sorted = (id: string) => [...(parents.get(id) ?? [])].sort((a, b) => nameOf(a).localeCompare(nameOf(b), 'ja'));
  // 経路の数は上位の数の積で増えるので、本数はメモして数え、並びは max 本まで作る
  const counts = new Map<string, number>();
  const count = (id: string): number => {
    const cached = counts.get(id);
    if (cached !== undefined) return cached;
    const ps = parents.get(id) ?? [];
    const n = ps.length === 0 ? 1 : ps.reduce((sum, p) => sum + count(p), 0);
    counts.set(id, n);
    return n;
  };
  if ((parents.get(center) ?? []).length === 0) return { paths: [], total: 0 };
  const paths: string[][] = [];
  const walk = (id: string, below: string[]) => {
    if (paths.length >= max) return;
    const ps = sorted(id);
    if (ps.length === 0) {
      paths.push([id, ...below]);
      return;
    }
    for (const p of ps) walk(p, [id, ...below]);
  };
  walk(center, []);
  return { paths, total: count(center) };
}

/** 上位の木の 1 項目。children はその項目の上位 */
export interface AncestorNode {
  id: string;
  children: AncestorNode[];
}

/**
 * 上位の木（7-13）。ancestorPaths の経路（最上位から中心）を中心の側からたどり、
 * 共通の部分をまとめる。返すのは中心のすぐ上の上位の並び。経路は名前順なので、入れた順がそのまま名前順になる
 */
export function ancestorTree(paths: readonly string[][]): AncestorNode[] {
  const roots: AncestorNode[] = [];
  for (const path of paths) {
    let level = roots;
    // 末尾は中心なので除き、中心に近い側から並べる
    for (let i = path.length - 2; i >= 0; i--) {
      let node = level.find((n) => n.id === path[i]);
      if (!node) {
        node = { id: path[i], children: [] };
        level.push(node);
      }
      level = node.children;
    }
  }
  return roots;
}

/** 下位の一覧（7-13 の木の 1 段）。名前の文字順 */
export function outlineChildren(children: Map<string, string[]>, id: string, nameOf: (id: string) => string): string[] {
  return [...(children.get(id) ?? [])].sort((a, b) => nameOf(a).localeCompare(nameOf(b), 'ja'));
}

/** 各段は 20 件まで出し、残りは「ほか N件」（押すと全件）にする（7-13） */
export function limitLevel<T>(list: readonly T[], showAll: boolean, max: number = LIMITS.outlineLevelMax): { shown: T[]; rest: number } {
  if (showAll || list.length <= max) return { shown: list.slice(), rest: 0 };
  return { shown: list.slice(0, max), rest: list.length - max };
}

/** 木の線の 1 段ぶん。line = │、blank = 空白、branch = ├、last = └ */
export type TreeGuide = 'line' | 'blank' | 'branch' | 'last';

/**
 * 木の線（7-13）。ancestorsLast は根に近い段から順に「その段で最後の行か」。
 * 最後でない段は「│」、最後の段は空白で続け、自分の段は最後なら「└」、それ以外は「├」
 */
export function treeGuides(ancestorsLast: readonly boolean[], isLast: boolean): TreeGuide[] {
  return [...ancestorsLast.map((last): TreeGuide => (last ? 'blank' : 'line')), isLast ? 'last' : 'branch'];
}

export { childrenMap };
