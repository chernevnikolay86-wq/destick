// Scroll-unlock layer (§Unlock). Separate from Undo: we only override the
// root(s) that show a recognised lock signature, and only on that axis.
// Pure classifiers here; the engine reads computed styles and applies via the ledger.

export const OVERFLOW_LOCK_VALUES = new Set(['hidden', 'clip']);

export type Axis = 'x' | 'y';

/** Which overflow axes are locked on this root (computed overflow-x / overflow-y). */
export function classifyOverflowAxes(overflowX: string, overflowY: string): Axis[] {
  const axes: Axis[] = [];
  if (OVERFLOW_LOCK_VALUES.has(overflowX)) axes.push('x');
  if (OVERFLOW_LOCK_VALUES.has(overflowY)) axes.push('y');
  return axes;
}

/**
 * Negative-top fixed/absolute lock: position ∈ {fixed, absolute} and a negative
 * computed `top`. Returns |top| in px, or null.
 */
export function parseNegativeTop(position: string, top: string): number | null {
  if (position !== 'fixed' && position !== 'absolute') return null;
  const m = /^(-?\d+(?:\.\d+)?)px$/.exec(top.trim());
  if (!m) return null;
  const v = parseFloat(m[1]);
  if (v >= 0) return null;
  return Math.abs(v);
}

export interface RootLock {
  /** overflow axes to override to `auto` */
  overflowAxes: Axis[];
  /** |top| if a negative-top lock is present */
  negativeTop: number | null;
}

/** Combine both signatures for one root from its computed values. */
export function classifyRootLock(computed: {
  overflowX: string;
  overflowY: string;
  position: string;
  top: string;
}): RootLock {
  return {
    overflowAxes: classifyOverflowAxes(computed.overflowX, computed.overflowY),
    negativeTop: parseNegativeTop(computed.position, computed.top),
  };
}

export function hasLock(lock: RootLock): boolean {
  return lock.overflowAxes.length > 0 || lock.negativeTop !== null;
}
