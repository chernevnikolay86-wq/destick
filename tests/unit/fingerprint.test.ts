// Fingerprint + picker-replay unit coverage (feeds AC-A8 cases S2/S3/S4a/S4b, PK2/PK3/PK9).
import { describe, it, expect, beforeEach } from 'vitest';
import {
  __test,
  textHashOf,
  rectBucketOf,
  depthOf,
  stableSelector,
  buildRule,
  replayRule,
  fingerprintMatches,
} from '../../src/core/fingerprint';

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('fingerprint primitives', () => {
  it('SHA-1 known vector', () => {
    expect(__test.sha1hex('abc')).toBe('a9993e364706816aba3e25717850c26c9cd0d89d');
  });
  it('textHash is 16 hex of collapsed text; empty text → ""', () => {
    const d = document.createElement('div');
    d.textContent = '  Hello   world ';
    expect(textHashOf(d)).toHaveLength(16);
    const e = document.createElement('div');
    expect(textHashOf(e)).toBe('');
  });
  it('rectBucket + depth are stable', () => {
    document.body.innerHTML = '<section><div id="x">hi</div></section>';
    const x = document.getElementById('x')!;
    expect(rectBucketOf(x)).toMatch(/^\d+x\d+$/);
    expect(depthOf(x)).toBeGreaterThan(0);
  });
  it('stableSelector prefers a safe id', () => {
    document.body.innerHTML = '<div id="foo"></div>';
    const s = stableSelector(document.getElementById('foo')!);
    expect(s).toEqual({ selector: '#foo', kind: 'id' });
  });
  it('stableSelector uses a unique data-* attribute when no id', () => {
    document.body.innerHTML = '<div data-widget="chat"></div>';
    const s = stableSelector(document.querySelector('[data-widget]')!);
    expect(s?.kind).toBe('attr');
  });
});

describe('picker replay (conservative identity)', () => {
  it('S2 — exactly 1 match + fingerprint match → resolves', () => {
    document.body.innerHTML = '<div id="x">Hello</div>';
    const rule = buildRule(document.getElementById('x')!)!;
    expect(rule).toBeTruthy();
    expect(replayRule(rule, document)).toBe(document.getElementById('x'));
  });
  it('S3/PK2 — reused id with different text (textHash ≠) → skip', () => {
    document.body.innerHTML = '<div id="x">Hello</div>';
    const rule = buildRule(document.getElementById('x')!)!;
    // page now has a different element that reused the id:
    document.body.innerHTML = '<div id="x">Completely different</div>';
    expect(replayRule(rule, document)).toBeNull();
  });
  it('S4a — 0 matches → skip', () => {
    document.body.innerHTML = '<div id="x">Hello</div>';
    const rule = buildRule(document.getElementById('x')!)!;
    document.body.innerHTML = '<div id="y">Hello</div>';
    expect(replayRule(rule, document)).toBeNull();
  });
  it('S4b — ≥2 matches → skip', () => {
    document.body.innerHTML = '<div id="x">Hello</div>';
    const rule = buildRule(document.getElementById('x')!)!;
    document.body.innerHTML = '<div id="x">Hello</div><div id="x">Hello</div>';
    expect(replayRule(rule, document)).toBeNull();
  });
  it('PK3 — empty-text identity by rectBucket + tag + depth', () => {
    document.body.innerHTML = '<div id="y"></div>';
    const y = document.getElementById('y')!;
    const rule = buildRule(y)!;
    expect(rule.fp.textHash).toBe('');
    expect(fingerprintMatches(y, rule.fp)).toBe(true);
    expect(replayRule(rule, document)).toBe(y);
  });
  it('PK9 — element in a shadow root with an unstable host → session-only (buildRule null)', () => {
    document.body.innerHTML = '<div></div>'; // host has no id / data-* → unstable
    const host = document.querySelector('div')!;
    const root = host.attachShadow({ mode: 'open' });
    root.innerHTML = '<span id="inner">x</span>';
    const inner = root.getElementById('inner')!;
    expect(buildRule(inner)).toBeNull();
  });
});
