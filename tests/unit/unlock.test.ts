// Unlock classifiers (pure parts of AC-A3 / §Unlock).
import { describe, it, expect } from 'vitest';
import { classifyOverflowAxes, parseNegativeTop, classifyRootLock, hasLock } from '../../src/core/unlock';

describe('unlock classifiers', () => {
  it('overflow hidden/clip lock per axis', () => {
    expect(classifyOverflowAxes('visible', 'hidden')).toEqual(['y']);
    expect(classifyOverflowAxes('clip', 'auto')).toEqual(['x']);
    expect(classifyOverflowAxes('hidden', 'clip')).toEqual(['x', 'y']);
    expect(classifyOverflowAxes('auto', 'visible')).toEqual([]);
  });
  it('negative-top fixed/absolute lock', () => {
    expect(parseNegativeTop('fixed', '-500px')).toBe(500);
    expect(parseNegativeTop('absolute', '-42.5px')).toBeCloseTo(42.5);
    expect(parseNegativeTop('fixed', '0px')).toBeNull();
    expect(parseNegativeTop('fixed', '10px')).toBeNull();
    expect(parseNegativeTop('static', '-500px')).toBeNull();
  });
  it('classifyRootLock + hasLock', () => {
    const none = classifyRootLock({ overflowX: 'visible', overflowY: 'visible', position: 'static', top: 'auto' });
    expect(hasLock(none)).toBe(false);
    const lock = classifyRootLock({ overflowX: 'visible', overflowY: 'hidden', position: 'fixed', top: '-300px' });
    expect(lock.overflowAxes).toEqual(['y']);
    expect(lock.negativeTop).toBe(300);
    expect(hasLock(lock)).toBe(true);
  });
});
