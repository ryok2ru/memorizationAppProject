import { describe, expect, it } from 'vitest';
import type { Edge } from '../domain/types';
import {
  ancestorPaths,
  childrenMap,
  LINK_GAP,
  layoutRelationGraph,
  limitLevel,
  outlineChildren,
  splitSide,
  treePrefix,
  type GraphBox,
  type GraphInput,
  type GraphItem,
} from './graph';

const item = (id: string, label?: string, directed?: boolean): GraphItem => ({ id, name: `名前${id}`, kind: 'card', label, directed });
const many = (prefix: string, n: number, label?: string) => Array.from({ length: n }, (_, i) => item(`${prefix}${i}`, label));

const overlaps = (a: GraphBox, b: GraphBox) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

function allBoxes(input: GraphInput, width: number): GraphBox[] {
  const l = layoutRelationGraph(input, width);
  return [...l.items, ...l.more];
}

describe('関係モードの配置（7-13）', () => {
  const full: GraphInput = {
    center: item('c'),
    top: many('p', 5),
    bottom: many('d', 4),
    left: many('l', 6, '対義'),
    right: many('r', 2, 'ラベル'),
  };

  it('各方向 3 件まで出し、残りを「+N」にまとめる', () => {
    expect(splitSide([1, 2, 3, 4, 5])).toEqual({ shown: [1, 2, 3], rest: 2 });
    expect(splitSide([1, 2])).toEqual({ shown: [1, 2], rest: 0 });
    const l = layoutRelationGraph(full, 390);
    const count = (side: string) => l.items.filter((p) => p.side === side).length;
    expect([count('top'), count('bottom'), count('left'), count('right'), count('center')]).toEqual([3, 3, 3, 2, 1]);
    expect(l.more.map((m) => [m.side, m.count])).toEqual([
      ['top', 2],
      ['left', 3],
      ['bottom', 1],
    ]);
  });

  it('上に上位、下に下位、左右に連結を置く', () => {
    const l = layoutRelationGraph(full, 390);
    const center = l.items.find((p) => p.side === 'center')!;
    for (const p of l.items) {
      if (p.side === 'top') expect(p.y + p.h).toBeLessThan(center.y);
      if (p.side === 'bottom') expect(p.y).toBeGreaterThan(center.y + center.h);
      if (p.side === 'left') expect(p.x + p.w).toBeLessThan(center.x);
      if (p.side === 'right') expect(p.x).toBeGreaterThan(center.x + center.w);
    }
  });

  it.each([288, 320, 358, 390, 448, 480])('幅 %ipx で連結の列と中心の間を LINK_GAP 以上空ける', (width) => {
    const l = layoutRelationGraph(full, width);
    const center = l.items.find((p) => p.side === 'center')!;
    for (const p of [...l.items, ...l.more]) {
      if (p.side === 'left') expect(center.x - (p.x + p.w)).toBeGreaterThanOrEqual(LINK_GAP - 1e-9);
      if (p.side === 'right') expect(p.x - (center.x + center.w)).toBeGreaterThanOrEqual(LINK_GAP - 1e-9);
    }
  });

  it.each([288, 320, 358, 390, 448, 480])('幅 %ipx で枠が重ならず、はみ出さない', (width) => {
    for (const input of [full, { center: item('c'), top: [], bottom: [], left: [], right: [] }, { ...full, top: many('p', 1), right: [] }]) {
      const boxes = allBoxes(input, width);
      for (let i = 0; i < boxes.length; i++) {
        expect(boxes[i].x).toBeGreaterThanOrEqual(0);
        expect(boxes[i].x + boxes[i].w).toBeLessThanOrEqual(width);
        for (let j = i + 1; j < boxes.length; j++) expect(overlaps(boxes[i], boxes[j])).toBe(false);
      }
    }
  });

  it('階層は実線の線、連結は単一方向にだけ矢印', () => {
    const l = layoutRelationGraph(
      { center: item('c'), top: [item('p')], bottom: [], left: [item('a'), item('b', undefined, true)], right: [item('r', undefined, true)] },
      390,
    );
    expect(l.lines.filter((x) => x.kind === 'hierarchy')).toHaveLength(1);
    expect(l.lines.filter((x) => x.kind === 'link').map((x) => x.arrow)).toEqual([false, true, true]);
  });
});

describe('アウトライン（7-13）', () => {
  const h = (from: string, to: string): Edge => ({ id: `${from}-${to}`, kind: 'hierarchy', from, to, directed: false, label: '', createdAt: 0 });
  const name = (id: string) => id;

  it('上位への経路を最上位から中心まで並べる。上位が複数なら経路も複数', () => {
    // 生物 → 動物 → 犬、ペット → 犬、生物 → ペット
    const edges = [h('生物', '動物'), h('動物', '犬'), h('ペット', '犬'), h('生物', 'ペット')];
    expect(ancestorPaths(edges, '犬', name)).toEqual({
      paths: [
        ['生物', 'ペット', '犬'],
        ['生物', '動物', '犬'],
      ],
      total: 2,
    });
    expect(ancestorPaths(edges, '生物', name)).toEqual({ paths: [], total: 0 });
  });

  it('経路は 10 本まで。総数は数える', () => {
    // 中心に上位が 4 つ、それぞれに上位が 3 つ → 12 本
    const edges: Edge[] = [];
    for (let i = 0; i < 4; i++) {
      edges.push(h(`p${i}`, 'c'));
      for (let j = 0; j < 3; j++) edges.push(h(`g${i}${j}`, `p${i}`));
    }
    const r = ancestorPaths(edges, 'c', name);
    expect(r.paths).toHaveLength(10);
    expect(r.total).toBe(12);
    expect(r.paths[0]).toEqual(['g00', 'p0', 'c']);
  });

  it('下位の木では、上位が複数ある項目が複数の場所に出る', () => {
    const edges = [h('root', 'a'), h('root', 'b'), h('a', 'x'), h('b', 'x')];
    const children = childrenMap(edges);
    expect(outlineChildren(children, 'root', name)).toEqual(['a', 'b']);
    expect(outlineChildren(children, 'a', name)).toEqual(['x']);
    expect(outlineChildren(children, 'b', name)).toEqual(['x']);
  });

  it('各段は 20 件まで。「ほか N件」で全件', () => {
    const list = Array.from({ length: 25 }, (_, i) => i);
    expect(limitLevel(list, false)).toEqual({ shown: list.slice(0, 20), rest: 5 });
    expect(limitLevel(list, true).shown).toHaveLength(25);
    expect(limitLevel([1, 2], false)).toEqual({ shown: [1, 2], rest: 0 });
  });

  it('木の線', () => {
    expect(treePrefix([], false)).toBe('├');
    expect(treePrefix([], true)).toBe('└');
    expect(treePrefix([false], true)).toBe('│└');
    expect(treePrefix([true, false], false)).toBe('　│├');
  });
});
