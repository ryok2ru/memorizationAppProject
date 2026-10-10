import { describe, expect, it } from 'vitest';
import type { Edge } from './types';
import {
  areSiblings,
  groupRelations,
  hasRelation,
  labelSuggestions,
  linkEnds,
  linkSymbol,
  orphanNodes,
  parentsMap,
  relationBlock,
  relationsOf,
  wouldCycle,
} from './relations';

let seq = 0;
const h = (from: string, to: string, createdAt = ++seq): Edge => ({
  id: `h-${from}-${to}`,
  kind: 'hierarchy',
  from,
  to,
  directed: false,
  label: '',
  createdAt,
});
const l = (from: string, to: string, directed = false, label = '', createdAt = ++seq): Edge => ({
  id: `l-${from}-${to}`,
  kind: 'link',
  from,
  to,
  directed,
  label,
  createdAt,
});

describe('循環の判定（4-11）', () => {
  // 動物 → 哺乳類 → 犬、動物 → 鳥。犬はペットの下位でもある
  const edges = [h('animal', 'mammal'), h('mammal', 'dog'), h('animal', 'bird'), h('pet', 'dog')];

  it('自分自身を上位にはできない', () => {
    expect(wouldCycle(edges, 'dog', 'dog')).toBe(true);
    expect(relationBlock(edges, 'hierarchy', 'dog', 'dog')).toBe('self');
  });
  it('直接の下位を上位にはできない', () => {
    expect(wouldCycle(edges, 'mammal', 'animal')).toBe(true);
  });
  it('深い下位を上位にはできない', () => {
    expect(wouldCycle(edges, 'dog', 'animal')).toBe(true);
    expect(relationBlock(edges, 'hierarchy', 'dog', 'animal')).toBe('cycle');
  });
  it('上位が複数あっても、循環にならない組は追加できる', () => {
    expect(wouldCycle(edges, 'pet', 'bird')).toBe(false);
    expect(relationBlock(edges, 'hierarchy', 'pet', 'bird')).toBeNull();
    // 犬の上位（ペット）の上位に動物を置くのは循環ではない
    expect(wouldCycle(edges, 'animal', 'pet')).toBe(false);
  });
  it('連結は循環を見ない', () => {
    expect(relationBlock(edges, 'link', 'dog', 'bird')).toBeNull();
  });
});

describe('1 組 1 関係（4-11）', () => {
  const edges = [h('a', 'b'), l('c', 'd', true)];
  it('向きと種類を問わず、関係がある組を見分ける', () => {
    expect(hasRelation(edges, 'a', 'b')).toBe(true);
    expect(hasRelation(edges, 'b', 'a')).toBe(true);
    expect(hasRelation(edges, 'd', 'c')).toBe(true);
    expect(hasRelation(edges, 'a', 'c')).toBe(false);
    expect(relationBlock(edges, 'link', 'b', 'a')).toBe('exists');
    expect(relationBlock(edges, 'hierarchy', 'd', 'c')).toBe('exists');
  });
});

describe('兄弟（6-2）', () => {
  it('同じ上位を 1 つ以上共有するカード同士。上位がノードでもよい', () => {
    const parents = parentsMap([h('node1', 'x'), h('node1', 'y'), h('card', 'y'), h('card', 'z'), l('x', 'w')]);
    expect(areSiblings(parents, 'x', 'y')).toBe(true);
    expect(areSiblings(parents, 'y', 'z')).toBe(true);
    expect(areSiblings(parents, 'x', 'z')).toBe(false);
    // 連結は兄弟を作らない
    expect(areSiblings(parents, 'x', 'w')).toBe(false);
  });
});

describe('区分と記号への振り分け（7-12）', () => {
  const edges = [h('p', 'me'), h('me', 'c'), l('me', 'out', true), l('in', 'me', true), l('me', 'n1'), l('n2', 'me')];

  it('上位・下位・連結に分け、連結の記号は — → ←', () => {
    const entries = relationsOf(edges, 'me');
    const by = (id: string) => entries.find((e) => e.otherId === id)!;
    expect(by('p').section).toBe('parents');
    expect(by('c').section).toBe('children');
    expect(by('out').symbol).toBe('→');
    expect(by('in').symbol).toBe('←');
    expect(by('n1').symbol).toBe('—');
    // 方向なしは from と to のどちらから見ても —
    expect(by('n2').symbol).toBe('—');
    expect(linkSymbol(l('in', 'me', true), 'in')).toBe('→');
  });

  it('上位・下位は名前の文字順、連結は記号ごとにまとめて文字順', () => {
    const names: Record<string, string> = { a: 'りんご', b: 'あんず', c: 'みかん', x: 'い', y: 'う', z: 'あ', w: 'え' };
    const es = [h('a', 'me'), h('b', 'me'), h('me', 'c'), l('me', 'x', true), l('y', 'me'), l('z', 'me', true), l('me', 'w')];
    const g = groupRelations(relationsOf(es, 'me'), (id) => names[id]);
    expect(g.parents.map((e) => e.otherId)).toEqual(['b', 'a']);
    expect(g.children.map((e) => e.otherId)).toEqual(['c']);
    // — (う, え) → (い) ← (あ)
    expect(g.links.map((e) => e.otherId)).toEqual(['y', 'w', 'x', 'z']);
  });

  it('向きの保存（7-12-2）', () => {
    expect(linkEnds('me', 'o', 'out')).toEqual({ from: 'me', to: 'o', directed: true });
    expect(linkEnds('me', 'o', 'in')).toEqual({ from: 'o', to: 'me', directed: true });
    expect(linkEnds('me', 'o', 'none')).toEqual({ from: 'me', to: 'o', directed: false });
  });
});

describe('ラベルの候補（4-11）', () => {
  it('空を除き、重複を除き、新しい順に 8 件まで', () => {
    const edges = [
      l('a', 'b', false, '対義', 1),
      l('a', 'c', false, '', 2),
      l('a', 'd', false, '類義', 3),
      l('a', 'e', false, '対義', 4),
      h('a', 'f', 5),
      ...Array.from({ length: 10 }, (_, i) => l('x', `y${i}`, false, `L${i}`, 10 + i)),
    ];
    const s = labelSuggestions(edges);
    expect(s).toHaveLength(8);
    expect(s[0]).toBe('L9');
    expect(labelSuggestions(edges.slice(0, 5))).toEqual(['対義', '類義']);
  });
});

describe('孤立ノード（4-11、4-12）', () => {
  it('関係を消して関係が 0 になるノードを返す', () => {
    const edges = [h('n1', 'card'), l('n2', 'card'), l('n2', 'other')];
    expect(orphanNodes(edges, ['n1', 'n2'], [], ['h-n1-card'])).toEqual(['n1']);
  });
  it('項目の削除では、その項目の関係が全部消える。削除する項目自身は返さない', () => {
    const edges = [h('n1', 'card'), l('n2', 'card'), l('n2', 'other'), h('n3', 'n1')];
    // card を消すと n1 は n3 との関係が残り、n2 も other との関係が残る
    expect(orphanNodes(edges, ['n1', 'n2', 'n3'], ['card'])).toEqual([]);
    // n1 を消すと n3 は関係が 0 になる
    expect(orphanNodes(edges, ['n1', 'n2', 'n3'], ['n1'])).toEqual(['n3']);
    // 複数の項目をまとめて消す
    expect(orphanNodes(edges, ['n1', 'n2', 'n3'], ['card', 'other']).sort()).toEqual(['n2']);
  });
  it('もともと関係の無いノードは数えない', () => {
    expect(orphanNodes([h('a', 'b')], ['lonely'], ['a'])).toEqual([]);
  });
});
