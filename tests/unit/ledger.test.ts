// Suite 2 — Mutation ledger (AC-A2) — задължителни: 7 (L1–L7)
import { describe, it, expect, beforeEach } from 'vitest';
import { Ledger } from '../../src/core/ledger';

function el(html = '<div></div>'): HTMLElement {
  const wrap = document.createElement('div');
  wrap.innerHTML = html;
  const node = wrap.firstElementChild as HTMLElement;
  document.body.appendChild(node);
  return node;
}

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('Suite 2 — ledger (AC-A2)', () => {
  it('L1 — clean→undo on an untouched page restores owned changes identically', () => {
    const l = new Ledger();
    const node = el();
    const style = document.createElement('style');
    document.head.appendChild(style);
    l.trackStyleNode(style);
    l.addHideMarker(node);
    l.setInlineImportant(node, 'display', 'none');

    expect(node.getAttribute(l.hideMarker)).toBe('1');
    expect(node.style.getPropertyValue('display')).toBe('none');

    l.undo();
    expect(node.getAttribute(l.hideMarker)).toBeNull();
    expect(node.style.getPropertyValue('display')).toBe(''); // did not exist before
    expect(style.isConnected).toBe(false);
  });

  it('L2 — repeated set without undo is idempotent (prev recorded once)', () => {
    const l = new Ledger();
    const node = el();
    node.style.display = 'block'; // pre-existing inline
    l.setInlineImportant(node, 'display', 'none');
    l.setInlineImportant(node, 'display', 'none'); // again → must NOT capture 'none' as prev
    l.undo();
    expect(node.style.getPropertyValue('display')).toBe('block');
  });

  it('L3 — undo after the page deleted a node does not reinject it', () => {
    const l = new Ledger();
    const node = el();
    l.addHideMarker(node);
    l.setInlineImportant(node, 'display', 'none');
    node.remove(); // page deletes it
    expect(() => l.undo()).not.toThrow();
    expect(node.isConnected).toBe(false);
    expect(document.body.contains(node)).toBe(false);
  });

  it('L4 — page overwrites an owned prop → relinquish only that pair; page wins', () => {
    const l = new Ledger();
    const node = el();
    l.setInlineImportant(node, 'overflow-y', 'auto');
    // page re-locks the same property:
    node.style.setProperty('overflow-y', 'hidden', 'important');
    l.relinquishProp(node, 'overflow-y');
    l.undo();
    expect(node.style.getPropertyValue('overflow-y')).toBe('hidden'); // not reverted
  });

  it('L5 — session-token marker cannot collide; undo removes exactly ours', () => {
    const l = new Ledger();
    expect(l.hideMarker).toMatch(/^data-ks-hide-[a-z0-9]+$/);
    const a = el();
    const b = el();
    l.addHideMarker(a);
    b.setAttribute('data-ks-hide-other', '1'); // a different, unrelated attr
    l.undo();
    expect(a.hasAttribute(l.hideMarker)).toBe(false);
    expect(b.getAttribute('data-ks-hide-other')).toBe('1');
  });

  it('L6 — previous inline value + priority restored exactly', () => {
    const l = new Ledger();
    const node = el();
    node.style.setProperty('display', 'flex', 'important');
    l.setInlineImportant(node, 'display', 'none');
    l.undo();
    expect(node.style.getPropertyValue('display')).toBe('flex');
    expect(node.style.getPropertyPriority('display')).toBe('important');
  });

  it('L7 — partial-root conflict: untouched owned axis restored, relinquished not', () => {
    const l = new Ledger();
    const node = el();
    l.setInlineImportant(node, 'overflow-x', 'auto');
    l.setInlineImportant(node, 'overflow-y', 'auto');
    node.style.setProperty('overflow-y', 'hidden', 'important'); // page overwrites Y
    l.relinquishProp(node, 'overflow-y');
    l.undo();
    expect(node.style.getPropertyValue('overflow-x')).toBe(''); // restored (did not exist before)
    expect(node.style.getPropertyValue('overflow-y')).toBe('hidden'); // page kept
  });

  // ---- regression tests for the Codex code-review findings ----

  it('L8 (HIGH1) — undo does NOT clobber a value the page overwrote before relinquish ran', () => {
    const l = new Ledger();
    const node = el();
    l.setInlineImportant(node, 'overflow-y', 'auto'); // ours
    node.style.setProperty('overflow-y', 'hidden', 'important'); // page overwrites; observer hasn't relinquished yet
    l.undo(); // raced the debounce — must still leave the page's value
    expect(node.style.getPropertyValue('overflow-y')).toBe('hidden');
  });

  it('L9 (MEDIUM6) — forced marker collision: the pre-existing value is restored on undo', () => {
    const l = new Ledger('tok');
    const node = el();
    node.setAttribute('data-ks-hide-tok', 'orig'); // a (astronomically unlikely) collision
    l.addHideMarker(node);
    expect(node.getAttribute('data-ks-hide-tok')).toBe('1');
    l.undo();
    expect(node.getAttribute('data-ks-hide-tok')).toBe('orig');
  });

  it('L10 (MEDIUM7) — hiddenCount counts only connected, still-marked nodes', () => {
    const l = new Ledger();
    const a = el();
    const b = el();
    l.addHideMarker(a);
    l.addHideMarker(b);
    expect(l.hiddenCount).toBe(2);
    b.remove(); // page deletes one
    expect(l.hiddenCount).toBe(1);
  });

  it('L11 (HIGH2) — relinquished prop/marker pairs are never re-asserted', () => {
    const l = new Ledger();
    const node = el();
    l.setInlineImportant(node, 'display', 'none');
    l.relinquishProp(node, 'display');
    node.style.setProperty('display', 'flex', 'important'); // page value
    l.setInlineImportant(node, 'display', 'none'); // must be a no-op (page-wins)
    expect(node.style.getPropertyValue('display')).toBe('flex');

    l.addHideMarker(node);
    l.relinquishMarker(node);
    node.setAttribute(l.hideMarker, 'page');
    l.addHideMarker(node); // must be a no-op
    expect(node.getAttribute(l.hideMarker)).toBe('page');
  });
});
