import { describe, expect, it } from 'vitest';
import { allSelected, toggleAll } from './selection';

describe('allSelected', () => {
  it('is true only when every shown id is selected', () => {
    expect(allSelected(new Set(['a', 'b', 'x']), ['a', 'b'])).toBe(true);
    expect(allSelected(new Set(['a']), ['a', 'b'])).toBe(false);
  });

  it('is false when nothing is shown', () => {
    expect(allSelected(new Set(['a']), [])).toBe(false);
  });
});

describe('toggleAll', () => {
  it('adds the shown ids and keeps selections outside them', () => {
    expect([...toggleAll(new Set(['x', 'a']), ['a', 'b'])].sort()).toEqual(['a', 'b', 'x']);
  });

  it('removes only the shown ids when they are all selected', () => {
    expect([...toggleAll(new Set(['x', 'a', 'b']), ['a', 'b'])]).toEqual(['x']);
  });

  it('does not change the input set', () => {
    const s = new Set(['a']);
    toggleAll(s, ['a', 'b']);
    expect([...s]).toEqual(['a']);
  });
});
