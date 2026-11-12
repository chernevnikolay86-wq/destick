// Detection layer — pure classification (§Детекция).
// Pure functions take serialized computed-style + rect + viewport so they are
// testable in happy-dom WITHOUT layout; real geometry is exercised in Chromium E2E.

export const COVERAGE_THRESHOLD = 0.6;

export interface StyleInput {
  position: string;
  zIndex: string;
  opacity: string;
  transform: string;
  filter: string;
  willChange: string;
  isolation: string;
  mixBlendMode: string;
  display: string;
  visibility: string;
  perspective?: string;
  contain?: string;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Viewport {
  width: number;
  height: number;
}

export interface CandidateInput {
  /** lowercase tag name */
  tag: string;
  style: StyleInput;
  rect: Rect;
  viewport: Viewport;
}

export type Branch = 'positioned' | 'overlay';

/** computed z-index → number; 'auto' is treated as 0. */
export function effectiveZIndex(zIndex: string): number {
  if (zIndex === 'auto' || zIndex === '') return 0;
  const n = parseInt(zIndex, 10);
  return Number.isNaN(n) ? 0 : n;
}

/** Does this element establish a stacking context (standard rules)? */
export function formsStackingContext(style: StyleInput): boolean {
  const pos = style.position;
  if (pos === 'fixed' || pos === 'sticky') return true;
  if ((pos === 'absolute' || pos === 'relative') && style.zIndex !== 'auto' && style.zIndex !== '') {
    return true;
  }
  if (style.opacity !== '' && parseFloat(style.opacity) < 1) return true;
  if (style.transform && style.transform !== 'none') return true;
  if (style.filter && style.filter !== 'none') return true;
  if (style.perspective && style.perspective !== 'none') return true;
  if (style.willChange && /\b(transform|opacity|filter|perspective)\b/.test(style.willChange)) return true;
  if (style.isolation === 'isolate') return true;
  if (style.mixBlendMode && style.mixBlendMode !== 'normal') return true;
  if (style.contain && /\b(layout|paint|strict|content)\b/.test(style.contain)) return true;
  return false;
}

/** Fraction of the viewport the element's rect covers (clipped to the viewport). */
export function coverage(rect: Rect, vp: Viewport): number {
  if (vp.width <= 0 || vp.height <= 0) return 0;
  const ix = Math.max(0, Math.min(rect.x + rect.width, vp.width) - Math.max(rect.x, 0));
  const iy = Math.max(0, Math.min(rect.y + rect.height, vp.height) - Math.max(rect.y, 0));
  return (ix * iy) / (vp.width * vp.height);
}

/**
 * Classify a single element. Returns the branch it matched, or null.
 * html/body are never candidates (handled by caller via tag, enforced here too).
 */
export function classify(input: CandidateInput): Branch | null {
  const { tag, style, rect, viewport } = input;

  // Hard exclusions.
  if (tag === 'html' || tag === 'body') return null;
  if (style.display === 'none') return null;
  if (style.visibility === 'hidden' || style.visibility === 'collapse') return null;
  if (rect.width <= 0 || rect.height <= 0) return null;

  // Branch 1 — positioned (z-index irrelevant).
  if (style.position === 'fixed' || style.position === 'sticky') return 'positioned';

  // Branch 2 — overlay.
  if (
    coverage(rect, viewport) >= COVERAGE_THRESHOLD &&
    formsStackingContext(style) &&
    effectiveZIndex(style.zIndex) >= 1
  ) {
    return 'overlay';
  }

  return null;
}

/**
 * Given candidate elements in document order, keep only the OUTERMOST of any
 * ancestor/descendant pair (dedup). html/body must already be excluded by the caller.
 */
export function filterOutermost<T extends { contains(other: T | null): boolean }>(nodes: T[]): T[] {
  const kept: T[] = [];
  for (const node of nodes) {
    const insideAnother = kept.some((k) => k !== node && k.contains(node));
    if (insideAnother) continue;
    // Drop any already-kept node that is a descendant of this one.
    for (let i = kept.length - 1; i >= 0; i--) {
      if (kept[i] !== node && node.contains(kept[i])) kept.splice(i, 1);
    }
    kept.push(node);
  }
  return kept;
}
