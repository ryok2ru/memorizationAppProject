import type { Edge, Folder, NodeItem, Word } from '../domain/types';
import { LIMITS } from '../domain/types';
import {
  groupRelations,
  labelSuggestions,
  linkEnds,
  orphanNodes,
  relationBlock,
  relationsOf,
  type LinkDirection,
  type RelationBlock,
  type RelationEntry,
  type Section,
} from '../domain/relations';
import {
  addEdge,
  getNodes,
  getWords,
  listAllWords,
  listEdges,
  listEdgesOf,
  listFolders,
  listNodes,
  listWordIdsInFolders,
  updateLink,
} from '../db/repo';

/** 関係の端になれる項目（カードかノード）を画面に出すための形 */
export interface ItemRef {
  id: string;
  kind: 'card' | 'node';
  /** カードは表、ノードは名前 */
  name: string;
  /** カードの裏。ノードは空 */
  back: string;
  /** カードの所属フォルダ。ノードは null */
  folderId: string | null;
  folderName: string;
}

export const cardRef = (w: Word, folders: Map<string, Folder>): ItemRef => ({
  id: w.id,
  kind: 'card',
  name: w.englishTerm,
  back: w.japaneseDefinition,
  folderId: w.folderId,
  folderName: folders.get(w.folderId)?.name ?? '',
});

export const nodeRef = (n: NodeItem): ItemRef => ({ id: n.id, kind: 'node', name: n.name, back: '', folderId: null, folderName: '' });

/**
 * 関係の行にフォルダ名を添えるか（7-12）。表示中の項目と別のフォルダのカードに添える。
 * 表示中の項目がノードなら、すべてのカードに添える
 */
export function showFolderName(self: ItemRef, other: ItemRef): boolean {
  if (other.kind !== 'card') return false;
  return self.kind === 'node' || self.folderId !== other.folderId;
}

/** 関係側の 1 行（7-12）。相手の項目が見つからない関係は出さない */
export interface RelationRow {
  entry: RelationEntry;
  item: ItemRef;
}

export interface RelationView {
  parents: RelationRow[];
  children: RelationRow[];
  links: RelationRow[];
  /** 関係の数（切り替えの「関係 N」） */
  count: number;
}

const folderMap = async () => new Map((await listFolders()).map((f) => [f.id, f] as const));

/** id の項目を ItemRef にまとめて引く（words と nodes の両方を見る） */
export async function loadItemRefs(ids: string[], folders?: Map<string, Folder>): Promise<Map<string, ItemRef>> {
  const fm = folders ?? (await folderMap());
  const [words, nodes] = await Promise.all([getWords(ids), getNodes(ids)]);
  const map = new Map<string, ItemRef>();
  for (const w of words.values()) map.set(w.id, cardRef(w, fm));
  for (const n of nodes.values()) map.set(n.id, nodeRef(n));
  return map;
}

/** 関係を区分ごとの行にする（7-12）。純粋関数 */
export function buildRelationView(id: string, edges: readonly Edge[], refs: Map<string, ItemRef>): RelationView {
  const entries = relationsOf(edges, id).filter((e) => refs.has(e.otherId));
  const g = groupRelations(entries, (other) => refs.get(other)!.name);
  const rows = (list: RelationEntry[]) => list.map((entry) => ({ entry, item: refs.get(entry.otherId)! }));
  return { parents: rows(g.parents), children: rows(g.children), links: rows(g.links), count: entries.length };
}

/** 項目の関係を読み込む（7-12、7-14） */
export async function loadRelationView(id: string): Promise<RelationView> {
  const edges = await listEdgesOf(id);
  const others = [...new Set(edges.map((e) => (e.from === id ? e.to : e.from)))];
  return buildRelationView(id, edges, await loadItemRefs(others));
}

// ---------- 関係の追加ダイアログ（7-12-2） ----------

/** 追加ダイアログの候補の 1 行 */
export interface Candidate {
  item: ItemRef;
  /** 押せない理由。自分自身・関係あり・循環 */
  block: RelationBlock | null;
}

export interface SearchData {
  words: Word[];
  nodes: NodeItem[];
  folders: Map<string, Folder>;
  edges: Edge[];
}

export async function loadSearchData(): Promise<SearchData> {
  const [words, nodes, folders, edges] = await Promise.all([listAllWords(), listNodes(), folderMap(), listEdges()]);
  return { words, nodes, folders, edges };
}

/** 区分と、表示中の項目・相手から、追加する関係の種類と from・to（階層は上位→下位）。連結は向きの初期値（方向なし） */
export function edgeShape(section: Section, self: string, other: string): Pick<Edge, 'kind' | 'from' | 'to'> {
  if (section === 'parents') return { kind: 'hierarchy', from: other, to: self };
  if (section === 'children') return { kind: 'hierarchy', from: self, to: other };
  return { kind: 'link', from: self, to: other };
}

/** 検索で出す最大件数（7-12-2） */
export const SEARCH_MAX = 50;
/** 検索欄が空のときに出す最大件数（7-12-2） */
export const BROWSE_MAX = 100;

/** 名前の文字順。localeCompare(…, 'ja') と同じ並びで、全件を並べても速いよう 1 つだけ作る */
const nameOrder = new Intl.Collator('ja');

/** 追加ダイアログの候補（7-12-2）。rest は上限を超えて出さなかった件数 */
export interface SearchResult {
  items: Candidate[];
  rest: number;
}

/**
 * 追加ダイアログの候補（7-12-2）。全フォルダのカード（表・裏の部分一致）とノード（名前の部分一致）。
 * 大文字小文字は区別しない。名前の文字順で、検索は最大 50 件、空欄なら全件のうち最大 100 件を返し、押せない理由を付ける
 */
export function searchCandidates(data: SearchData, query: string, self: string, section: Section): SearchResult {
  const q = query.trim().toLowerCase();
  const items: ItemRef[] = [
    ...data.words
      .filter((w) => !q || w.englishTerm.toLowerCase().includes(q) || w.japaneseDefinition.toLowerCase().includes(q))
      .map((w) => cardRef(w, data.folders)),
    ...data.nodes.filter((n) => !q || n.name.toLowerCase().includes(q)).map(nodeRef),
  ];
  const max = q ? SEARCH_MAX : BROWSE_MAX;
  const shown = items
    .sort((a, b) => nameOrder.compare(a.name, b.name))
    .slice(0, max)
    .map((item) => {
      const s = edgeShape(section, self, item.id);
      return { item, block: relationBlock(data.edges, s.kind, s.from, s.to) };
    });
  return { items: shown, rest: items.length - shown.length };
}

/**
 * 「ノードとして作成」を出すか（7-12-2）。入力が空でなく 200 文字以内で、
 * 名前（カードは表）が入力と完全に一致する項目が無いとき（trim し、大文字小文字は区別しない）
 */
export function canCreateNode(data: SearchData, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q || q.length > LIMITS.nodeName) return false;
  return !data.words.some((w) => w.englishTerm.trim().toLowerCase() === q) && !data.nodes.some((n) => n.name.trim().toLowerCase() === q);
}

export { labelSuggestions };

/** 追加する相手。既存の項目か、名前だけで作るノード */
export type RelationTarget = { id: string } | { newNodeName: string };

/**
 * 関係を追加する（7-12-2）。相手が新しいノードなら、ノードの作成と関係の追加を 1 トランザクションで行う。
 * 連結は dir と label を使う（階層では無視する）
 */
export async function addRelation(
  self: string,
  section: Section,
  target: RelationTarget,
  link: { dir: LinkDirection; label: string } = { dir: 'none', label: '' },
  now = Date.now(),
): Promise<void> {
  let node: NodeItem | undefined;
  let other: string;
  if ('id' in target) other = target.id;
  else {
    node = { id: crypto.randomUUID(), name: target.newNodeName.trim(), createdAt: now, updatedAt: now, saved: null };
    other = node.id;
  }
  const shape = edgeShape(section, self, other);
  const ends = shape.kind === 'link' ? linkEnds(self, other, link.dir) : { from: shape.from, to: shape.to, directed: false };
  const edge: Edge = {
    id: crypto.randomUUID(),
    kind: shape.kind,
    ...ends,
    label: shape.kind === 'link' ? link.label.trim().slice(0, LIMITS.edgeLabel) : '',
    createdAt: now,
  };
  await addEdge(edge, node);
}

/** 連結の向きとラベルを変える（7-12-3）。dir は self から見た向き */
export async function editLink(edge: Edge, self: string, dir: LinkDirection, label: string): Promise<void> {
  const other = edge.from === self ? edge.to : edge.from;
  await updateLink(edge.id, { ...linkEnds(self, other, dir), label: label.trim().slice(0, LIMITS.edgeLabel) });
}

// ---------- 孤立ノードの確認（4-12） ----------

/** 項目を削除したときに関係がなくなるノードの id */
export async function orphansIfItemsDeleted(itemIds: string[]): Promise<string[]> {
  if (itemIds.length === 0) return [];
  const [edges, nodes] = await Promise.all([listEdges(), listNodes()]);
  return orphanNodes(
    edges,
    nodes.map((n) => n.id),
    itemIds,
  );
}

/** フォルダを削除したときに関係がなくなるノードの数（7-2） */
export async function orphanCountIfFoldersDeleted(folderIds: string[]): Promise<number> {
  return (await orphansIfItemsDeleted(await listWordIdsInFolders(folderIds))).length;
}

/** 関係を 1 つ消したときに関係がなくなるノード（7-12 の ⊖）。名前付き */
export async function orphansIfEdgeDeleted(edgeId: string): Promise<ItemRef[]> {
  const [edges, nodes] = await Promise.all([listEdges(), listNodes()]);
  const ids = new Set(orphanNodes(edges, nodes.map((n) => n.id), [], [edgeId]));
  return nodes.filter((n) => ids.has(n.id)).map(nodeRef);
}

/** 既存の確認文の末尾に添える文（4-12）。0 件なら空 */
export const orphanSuffix = (n: number): string => (n > 0 ? `関係がなくなるノード ${n}件も削除します。` : '');

/** 確認文に孤立ノードの文を添える。「よろしいですか？」の前に入れる */
export function withOrphanSuffix(message: string, n: number): string {
  const suffix = orphanSuffix(n);
  if (!suffix) return message;
  const tail = 'よろしいですか？';
  return message.endsWith(tail) ? `${message.slice(0, -tail.length)}${suffix}${tail}` : `${message}${suffix}`;
}

/** 関係の ⊖ で孤立ノードが出るときの確認文（4-12） */
export function edgeOrphanMessage(orphans: ItemRef[]): string {
  const what = orphans.length === 1 ? `ノード「${orphans[0].name}」` : `ノード ${orphans.length}件`;
  return `関係がなくなるため、${what}も削除します。よろしいですか？`;
}

/** スワイプ削除のトースト（4-12、7-3） */
export const swipeDeletedMessage = (n: number): string => (n > 0 ? `削除しました（ノード ${n}件も削除）` : '削除しました');

// ---------- ノードをカードにする（7-12） ----------

/**
 * ノードをカードにするときのフォルダの初期値（7-12）。
 * saved のフォルダが今もあればそれ、なければ関係側の一覧で最初に出るカードのフォルダ、それもなければ並び順で最初のフォルダ。
 * フォルダが 1 つもなければ null
 */
export function defaultFolderForNode(node: NodeItem, folders: readonly Folder[], view: RelationView | null): string | null {
  const exists = (id: string | null | undefined) => id != null && folders.some((f) => f.id === id);
  if (exists(node.saved?.folderId)) return node.saved!.folderId;
  if (view) {
    for (const row of [...view.parents, ...view.children, ...view.links]) {
      if (row.item.kind === 'card' && exists(row.item.folderId)) return row.item.folderId;
    }
  }
  const sorted = [...folders].sort((a, b) => a.sortOrder - b.sortOrder);
  return sorted[0]?.id ?? null;
}
