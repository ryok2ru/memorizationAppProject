import { describe, expect, it } from 'vitest';
import { SWIPE_GUIDES, labelSide, swipeGrade, swipeVisual } from './Flashcard';

describe('swipeGrade', () => {
  it('maps down = Again, left = Hard, right = Good, up = Easy', () => {
    expect(swipeGrade('y', 50)).toBe(1);
    expect(swipeGrade('x', -50)).toBe(2);
    expect(swipeGrade('x', 50)).toBe(3);
    expect(swipeGrade('y', -50)).toBe(4);
  });
});

describe('swipeVisual', () => {
  it('raises the colour under the text from 0 to at most 0.85', () => {
    expect(swipeVisual(0)).toEqual({ fillOpacity: 0, whiteText: false });
    expect(swipeVisual(0.5).fillOpacity).toBeCloseTo(0.425);
    expect(swipeVisual(1)).toEqual({ fillOpacity: 0.85, whiteText: true });
    // 120px を超えても、負でも範囲内に丸める
    expect(swipeVisual(2).fillOpacity).toBe(0.85);
    expect(swipeVisual(-1).fillOpacity).toBe(0);
  });

  it('switches the text to white once progress exceeds 0.4', () => {
    expect(swipeVisual(0.39).whiteText).toBe(false);
    expect(swipeVisual(0.4).whiteText).toBe(false);
    expect(swipeVisual(0.41).whiteText).toBe(true);
  });
});

describe('labelSide', () => {
  it('shows Again above the card and the other grades below it', () => {
    expect(labelSide(1)).toBe('top');
    expect(labelSide(2)).toBe('bottom');
    expect(labelSide(3)).toBe('bottom');
    expect(labelSide(4)).toBe('bottom');
  });
});

describe('SWIPE_GUIDES', () => {
  it('names each side with its grade: up Easy, down Again, left Hard, right Good', () => {
    const bySide = Object.fromEntries(SWIPE_GUIDES.map((g) => [g.side, g]));
    expect(bySide.top).toMatchObject({ grade: 4, text: '↑ Easy' });
    expect(bySide.bottom).toMatchObject({ grade: 1, text: '↓ Again' });
    expect(bySide.left).toMatchObject({ grade: 2, text: '← Hard' });
    expect(bySide.right).toMatchObject({ grade: 3, text: '→ Good' });
    expect(SWIPE_GUIDES).toHaveLength(4);
  });
});
