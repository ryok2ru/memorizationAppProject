import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../db/db';
import {
  cardToNode,
  clearAll,
  createFolder,
  createWord,
  deleteEdge,
  deleteItems,
  getNode,
  getWord,
  getWordImage,
  listEdges,
  listNodes,
  listReviewLogsForWord,
  nodeToCard,
  RelationError,
  restoreEdge,
  saveRating,
} from '../db/repo';
import { rate } from '../domain/fsrs';
import type { Folder, NodeItem } from '../domain/types';
import {
  addRelation,
  buildRelationView,
  canCreateNode,
  defaultFolderForNode,
  edgeOrphanMessage,
  editLink,
  loadRelationView,
  loadSearchData,
  nodeRef,
  orphanCountIfFoldersDeleted,
  orphansIfEdgeDeleted,
  orphansIfItemsDeleted,
  searchCandidates,
  SEARCH_MAX,
  BROWSE_MAX,
  showFolderName,
  swipeDeletedMessage,
  withOrphanSuffix,
  type ItemRef,
} from './relations';

const now = new Date(2026, 9, 10, 10, 0, 0).getTime();

beforeEach(async () => {
  await clearAll();
});

async function setup() {
  const f = await createFolder('英語', now);
  const g = await createFolder('理科', now);
  const dog = await createWord({ folderId: f.id, englishTerm: 'dog', japaneseDefinition: '犬', memo: '' }, now);
  const cat = await createWord({ folderId: f.id, englishTerm: 'cat', japaneseDefinition: '猫', memo: '' }, now);
  const mammal = await createWord({ folderId: g.id, englishTerm: '哺乳類', japaneseDefinition: 'mammal', memo: '' }, now);
  return { f, g, dog, cat, mammal };
}

const nodeId = async (name: string) => (await listNodes()).find((n) => n.name === name)!.id;

describe('関係の追加・変更・削除（7-12）', () => {
  it('上位・下位・連結を追加し、関係側の区分と記号に出る', async () => {
    const { dog, cat, mammal } = await setup();
    await addRelation(dog.id, 'parents', { id: mammal.id }, undefined, now);
    await addRelation(mammal.id, 'children', { id: cat.id }, undefined, now + 1);
    await addRelation(dog.id, 'links', { id: cat.id }, { dir: 'out', label: ' 対義 ' }, now + 2);

    const v = await loadRelationView(dog.id);
    expect(v.count).toBe(2);
    expect(v.parents.map((r) => r.item.name)).toEqual(['哺乳類']);
    expect(v.links[0].entry.symbol).toBe('→');
    expect(v.links[0].entry.edge.label).toBe('対義');
    expect((await loadRelationView(cat.id)).links[0].entry.symbol).toBe('←');
    const m = await loadRelationView(mammal.id);
    expect(m.children.map((r) => r.item.name)).toEqual(['cat', 'dog']);
  });

  it('自分自身・すでに関係がある・循環になる関係は保存しない', async () => {
    const { dog, mammal } = await setup();
    await addRelation(dog.id, 'parents', { id: mammal.id }, undefined, now);
    await expect(addRelation(dog.id, 'links', { id: dog.id })).rejects.toBeInstanceOf(RelationError);
    await expect(addRelation(dog.id, 'links', { id: mammal.id })).rejects.toBeInstanceOf(RelationError);
    await expect(addRelation(dog.id, 'children', { id: mammal.id })).rejects.toBeInstanceOf(RelationError);
    expect(await listEdges()).toHaveLength(1);
  });

  it('ノードとして作成して同時に関係を足す。失敗したらノードも残らない', async () => {
    const { dog, mammal } = await setup();
    await addRelation(dog.id, 'parents', { newNodeName: ' 動物 ' }, undefined, now);
    const animal = await nodeId('動物');
    expect((await loadRelationView(dog.id)).parents[0].item).toMatchObject({ kind: 'node', name: '動物' });
    // 循環になる追加は、作ろうとしたノードごと取り消す
    await addRelation(mammal.id, 'children', { id: dog.id }, undefined, now);
    await expect(addRelation(mammal.id, 'parents', { id: dog.id })).rejects.toBeInstanceOf(RelationError);
    expect((await listNodes()).map((n) => n.id)).toEqual([animal]);
  });

  it('連結の向きとラベルを変える（7-12-3）', async () => {
    const { dog, cat } = await setup();
    await addRelation(dog.id, 'links', { id: cat.id }, { dir: 'none', label: '' }, now);
    const [edge] = await listEdges();
    await editLink(edge, cat.id, 'out', '仲間');
    const [after] = await listEdges();
    expect(after).toMatchObject({ from: cat.id, to: dog.id, directed: true, label: '仲間' });
    expect((await loadRelationView(dog.id)).links[0].entry.symbol).toBe('←');
  });

  it('関係を消し、元に戻すと同じ関係が戻る', async () => {
    const { dog, cat } = await setup();
    await addRelation(dog.id, 'links', { id: cat.id }, undefined, now);
    const [edge] = await listEdges();
    expect(await deleteEdge(edge.id)).toEqual([]);
    expect(await listEdges()).toEqual([]);
    await restoreEdge(edge);
    expect(await listEdges()).toEqual([edge]);
  });
});

describe('孤立ノード（4-11、4-12）', () => {
  it('関係の ⊖ で関係が 0 になるノードを、確認用に数えて、削除と一緒に消す', async () => {
    const { dog } = await setup();
    await addRelation(dog.id, 'parents', { newNodeName: '動物' }, undefined, now);
    const [edge] = await listEdges();
    const orphans = await orphansIfEdgeDeleted(edge.id);
    expect(orphans.map((o) => o.name)).toEqual(['動物']);
    expect(edgeOrphanMessage(orphans)).toBe('関係がなくなるため、ノード「動物」も削除します。よろしいですか？');
    expect(await deleteEdge(edge.id)).toHaveLength(1);
    expect(await listNodes()).toEqual([]);
  });

  it('カードの削除でノードが連鎖して消える。関係の残るノードは残る', async () => {
    const { dog, cat } = await setup();
    // 動物（ノード）→ dog、生き物（ノード）→ 動物、ペット（ノード）→ dog と cat
    await addRelation(dog.id, 'parents', { newNodeName: '動物' }, undefined, now);
    const animal = await nodeId('動物');
    await addRelation(animal, 'parents', { newNodeName: '生き物' }, undefined, now);
    await addRelation(dog.id, 'parents', { newNodeName: 'ペット' }, undefined, now);
    const pet = await nodeId('ペット');
    await addRelation(pet, 'children', { id: cat.id }, undefined, now);

    // dog を消すと動物は生き物との関係が残る。ペットは cat との関係が残る
    expect(await orphansIfItemsDeleted([dog.id])).toEqual([]);
    // 動物ノードを消すと、生き物の関係が 0 になる
    expect(await orphansIfItemsDeleted([animal])).toHaveLength(1);
    const removed = await deleteItems([animal]);
    expect(removed).toHaveLength(1);
    expect((await listNodes()).map((n) => n.name)).toEqual(['ペット']);
    // dog と cat を両方消すとペットも消える
    await deleteItems([dog.id, cat.id]);
    expect(await listNodes()).toEqual([]);
    expect(await listEdges()).toEqual([]);
  });

  it('フォルダの削除で消えるノードを数える', async () => {
    const { f, dog, cat } = await setup();
    await addRelation(dog.id, 'parents', { newNodeName: '動物' }, undefined, now);
    await addRelation(cat.id, 'links', { newNodeName: '家' }, undefined, now);
    expect(await orphanCountIfFoldersDeleted([f.id])).toBe(2);
  });

  it('確認文に孤立ノードの文を添える', () => {
    expect(withOrphanSuffix('このカードと学習履歴を削除します。よろしいですか？', 0)).toBe('このカードと学習履歴を削除します。よろしいですか？');
    expect(withOrphanSuffix('このカードと学習履歴を削除します。よろしいですか？', 2)).toBe(
      'このカードと学習履歴を削除します。関係がなくなるノード 2件も削除します。よろしいですか？',
    );
    expect(edgeOrphanMessage([{ name: 'a' } as ItemRef, { name: 'b' } as ItemRef])).toBe('関係がなくなるため、ノード 2件も削除します。よろしいですか？');
    expect(swipeDeletedMessage(0)).toBe('削除しました');
    expect(swipeDeletedMessage(1)).toBe('削除しました（ノード 1件も削除）');
  });
});

describe('カードとノードの切り替え（4-12）', () => {
  it('カードをノードに戻すと words から消え、ReviewLog と画像は残る。関係が 0 なら戻せない', async () => {
    const { f, dog, cat } = await setup();
    await expect(cardToNode(dog.id, now)).rejects.toBeInstanceOf(RelationError);
    await addRelation(dog.id, 'links', { id: cat.id }, undefined, now);
    const rated = rate(dog, 3, now);
    await saveRating(rated.word, rated.log);
    await db.images.put({ wordId: dog.id, data: new ArrayBuffer(3), type: 'image/jpeg', side: 'front', updatedAt: now });
    await db.words.update(dog.id, { favorite: true });

    const node = await cardToNode(dog.id, now + 1);
    expect(await getWord(dog.id)).toBeUndefined();
    expect(node).toMatchObject({ id: dog.id, name: 'dog' });
    expect(node.saved).toMatchObject({ folderId: f.id, japaneseDefinition: '犬', favorite: true, state: rated.word.state, reps: 1 });
    expect(await listReviewLogsForWord(dog.id)).toHaveLength(1);
    expect(await getWordImage(dog.id)).toBeDefined();
    // 関係は id が同じなのでそのまま
    expect((await loadRelationView(cat.id)).links[0].item.kind).toBe('node');
  });

  it('saved のあるノードをカードにすると、学習の続きから再開する', async () => {
    const { f, dog, cat } = await setup();
    await addRelation(dog.id, 'links', { id: cat.id }, undefined, now);
    const rated = rate(dog, 3, now);
    await saveRating(rated.word, rated.log);
    await cardToNode(dog.id, now + 1);
    const word = await nodeToCard(dog.id, { folderId: f.id, englishTerm: 'doggy', japaneseDefinition: '犬', memo: '' }, now + 2);
    expect(await getNode(dog.id)).toBeUndefined();
    expect(word).toMatchObject({ id: dog.id, englishTerm: 'doggy', state: rated.word.state, due: rated.word.due, reps: 1, createdAt: now });
    expect(await listReviewLogsForWord(dog.id)).toHaveLength(1);
  });

  it('saved の無いノードをカードにすると、新しいカードになる', async () => {
    const { f, dog } = await setup();
    await addRelation(dog.id, 'parents', { newNodeName: '動物' }, undefined, now);
    const id = await nodeId('動物');
    const word = await nodeToCard(id, { folderId: f.id, englishTerm: '動物', japaneseDefinition: 'animal', memo: '' }, now + 5);
    expect(word).toMatchObject({ state: 0, reps: 0, favorite: false, createdAt: now + 5 });
    expect((await loadRelationView(dog.id)).parents[0].item.kind).toBe('card');
  });

  it('ノードに戻したカードを削除すると、残していた ReviewLog と画像も消える', async () => {
    const { dog, cat } = await setup();
    await addRelation(dog.id, 'links', { id: cat.id }, undefined, now);
    const rated = rate(dog, 3, now);
    await saveRating(rated.word, rated.log);
    await db.images.put({ wordId: dog.id, data: new ArrayBuffer(3), type: 'image/jpeg', side: 'back', updatedAt: now });
    await cardToNode(dog.id, now);
    await deleteItems([dog.id]);
    expect(await listReviewLogsForWord(dog.id)).toEqual([]);
    expect(await getWordImage(dog.id)).toBeUndefined();
  });
});

describe('関係側の表示（7-12）', () => {
  const card = (id: string, folderId: string): ItemRef => ({ id, kind: 'card', name: id, back: '', folderId, folderName: folderId });

  it('別のフォルダのカードにだけフォルダ名を添える。表示中がノードならすべてのカードに添える', () => {
    const self = card('me', 'f');
    expect(showFolderName(self, card('a', 'f'))).toBe(false);
    expect(showFolderName(self, card('b', 'g'))).toBe(true);
    const node = nodeRef({ id: 'n', name: 'n', createdAt: 0, updatedAt: 0, saved: null });
    expect(showFolderName(self, node)).toBe(false);
    expect(showFolderName(node, card('a', 'f'))).toBe(true);
  });

  it('相手が見つからない関係は行にしない', () => {
    const refs = new Map([['a', card('a', 'f')]]);
    const edges = [
      { id: '1', kind: 'link' as const, from: 'me', to: 'a', directed: false, label: '', createdAt: 0 },
      { id: '2', kind: 'link' as const, from: 'me', to: 'gone', directed: false, label: '', createdAt: 0 },
    ];
    expect(buildRelationView('me', edges, refs).count).toBe(1);
  });

  it('ノードをカードにするときのフォルダの初期値', () => {
    const folders: Folder[] = [
      { id: 'f2', name: 'B', frontLabel: '表', backLabel: '裏', createdAt: 0, sortOrder: 1 },
      { id: 'f1', name: 'A', frontLabel: '表', backLabel: '裏', createdAt: 0, sortOrder: 0 },
    ];
    const node = (folderId?: string): NodeItem => ({
      id: 'n',
      name: 'n',
      createdAt: 0,
      updatedAt: 0,
      saved: folderId ? ({ folderId } as NodeItem['saved']) : null,
    });
    const view = { parents: [], children: [{ entry: {} as never, item: card('c', 'f2') }], links: [], count: 1 };
    expect(defaultFolderForNode(node('f1'), folders, view)).toBe('f1');
    // saved のフォルダが消えていれば、関係側で最初のカードのフォルダ
    expect(defaultFolderForNode(node('gone'), folders, view)).toBe('f2');
    // それもなければ並び順で最初のフォルダ
    expect(defaultFolderForNode(node(), folders, null)).toBe('f1');
    expect(defaultFolderForNode(node(), [], null)).toBeNull();
  });
});

describe('関係の追加ダイアログの検索（7-12-2）', () => {
  it('全フォルダのカードとノードから探し、押せない理由を付ける', async () => {
    const { dog, cat, mammal } = await setup();
    await addRelation(mammal.id, 'children', { id: dog.id }, undefined, now);
    await addRelation(dog.id, 'links', { newNodeName: 'Animal lover' }, undefined, now);
    const data = await loadSearchData();

    // 裏の部分一致・大文字小文字を無視
    expect(searchCandidates(data, 'MAMMAL', dog.id, 'links').items.map((c) => c.item.name)).toEqual(['哺乳類']);
    const forDog = searchCandidates(data, 'a', dog.id, 'children').items;
    const byName = (name: string) => forDog.find((c) => c.item.name === name)!;
    expect(byName('cat').block).toBeNull();
    expect(byName('Animal lover').block).toBe('exists');
    expect(byName('Animal lover').item.kind).toBe('node');
    // 哺乳類（dog の上位）を dog の下位にすると循環
    expect(searchCandidates(data, '哺乳', dog.id, 'children').items[0].block).toBe('exists');
    expect(searchCandidates(data, '哺乳', cat.id, 'children').items[0].block).toBeNull();
    expect(searchCandidates(data, 'dog', dog.id, 'links').items[0].block).toBe('self');
    // 空欄なら全項目を名前順に出す
    const all = searchCandidates(data, '  ', dog.id, 'links');
    expect(all.items.map((c) => c.item.name)).toEqual(['Animal lover', 'cat', 'dog', '哺乳類']);
    expect(all.rest).toBe(0);
  });

  it('空欄は 100 件、検索は 50 件までに抑え、残りの件数を返す', async () => {
    const { f, dog } = await setup();
    for (let i = 0; i < 120; i++) {
      await createWord({ folderId: f.id, englishTerm: `w${String(i).padStart(3, '0')}`, japaneseDefinition: '語', memo: '' }, now);
    }
    const data = await loadSearchData();
    const all = searchCandidates(data, '', dog.id, 'links');
    expect(all.items).toHaveLength(BROWSE_MAX);
    expect(all.rest).toBe(123 - BROWSE_MAX);
    const found = searchCandidates(data, 'w', dog.id, 'links');
    expect(found.items).toHaveLength(SEARCH_MAX);
    expect(found.items[0].item.name).toBe('w000');
    expect(found.rest).toBe(120 - SEARCH_MAX);
  });

  it('循環になる項目を見分ける', async () => {
    const { dog, cat, mammal } = await setup();
    await addRelation(mammal.id, 'children', { id: dog.id }, undefined, now);
    await addRelation(dog.id, 'children', { id: cat.id }, undefined, now);
    const data = await loadSearchData();
    // cat の下位に哺乳類を置くと循環（哺乳類 → dog → cat → 哺乳類）
    expect(searchCandidates(data, '哺乳', cat.id, 'children').items[0].block).toBe('cycle');
  });

  it('名前が完全に一致する項目が無いときだけ「ノードとして作成」を出す', async () => {
    await setup();
    const data = await loadSearchData();
    expect(canCreateNode(data, ' DOG ')).toBe(false);
    expect(canCreateNode(data, 'do')).toBe(true);
    expect(canCreateNode(data, '  ')).toBe(false);
    expect(canCreateNode(data, 'x'.repeat(201))).toBe(false);
  });
});
