// Suite 1 — Детекция (AC-A1) — задължителни: 10 (D1–D10)
import { describe, it, expect } from 'vitest';
import { classify, filterOutermost, coverage, type CandidateInput, type StyleInput } from '../../src/core/detect';

const VP = { width: 1000, height: 1000 };

const baseStyle: StyleInput = {
  position: 'static',
  zIndex: 'auto',
  opacity: '1',
  transform: 'none',
  filter: 'none',
  willChange: 'auto',
  isolation: 'auto',
  mixBlendMode: 'normal',
  display: 'block',
  visibility: 'visible',
  perspective: 'none',
  contain: 'none',
};

function input(over: Partial<StyleInput>, rect = { x: 0, y: 0, width: 100, height: 100 }, tag = 'div'): CandidateInput {
  return { tag, style: { ...baseStyle, ...over }, rect, viewport: VP };
}

describe('Suite 1 — detection (AC-A1)', () => {
  it('D1 — position:fixed → candidate (positioned)', () => {
    expect(classify(input({ position: 'fixed' }))).toBe('positioned');
  });
  it('D2 — position:sticky → candidate (positioned)', () => {
    expect(classify(input({ position: 'sticky' }))).toBe('positioned');
  });
  it('D3 — overlay coverage 0.60, z-index 10, stacking → candidate (overlay)', () => {
    const res = classify(input({ position: 'relative', zIndex: '10' }, { x: 0, y: 0, width: 1000, height: 600 }));
    expect(res).toBe('overlay');
  });
  it('D4 — overlay coverage 0.59 → NOT candidate (below threshold)', () => {
    const res = classify(input({ position: 'relative', zIndex: '10' }, { x: 0, y: 0, width: 1000, height: 590 }));
    expect(res).toBeNull();
  });
  it('D5 — coverage 0.80, z-index:auto, position:static → NOT candidate (branch 2 needs z≥1 + SC)', () => {
    const res = classify(input({ position: 'static', zIndex: 'auto' }, { x: 0, y: 0, width: 1000, height: 800 }));
    expect(res).toBeNull();
  });
  it('D6 — html element (overflow hidden) → NOT candidate (excluded)', () => {
    const res = classify(input({ position: 'fixed' }, { x: 0, y: 0, width: 1000, height: 1000 }, 'html'));
    expect(res).toBeNull();
  });
  it('D7 — body element (position:fixed) → NOT candidate (excluded)', () => {
    const res = classify(input({ position: 'fixed' }, { x: 0, y: 0, width: 1000, height: 1000 }, 'body'));
    expect(res).toBeNull();
  });
  it('D8 — nested candidates A⊃B → keep outermost A, no dup', () => {
    document.body.innerHTML = '<div id="a"><div id="b"></div></div>';
    const a = document.getElementById('a')!;
    const b = document.getElementById('b')!;
    expect(filterOutermost([a, b])).toEqual([a]);
    expect(filterOutermost([b, a])).toEqual([a]); // order independent
  });
  it('D9 — zero area (w=0) → NOT candidate', () => {
    const res = classify(input({ position: 'fixed' }, { x: 0, y: 0, width: 0, height: 100 }));
    expect(res).toBeNull();
  });
  it('D10 — display:none → NOT candidate', () => {
    const res = classify(input({ position: 'fixed', display: 'none' }));
    expect(res).toBeNull();
  });

  it('coverage is clipped to the viewport', () => {
    expect(coverage({ x: -500, y: 0, width: 1000, height: 1000 }, VP)).toBeCloseTo(0.5, 5);
    expect(coverage({ x: 0, y: 0, width: 2000, height: 2000 }, VP)).toBeCloseTo(1, 5);
  });
});
