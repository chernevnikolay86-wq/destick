// Element fingerprinting + stable-selector logic for the picker (§Picker).
// Pure/DOM-only (no chrome APIs) so it is unit-testable in happy-dom.

import type { FP, Rule } from './types';

/* ----------------------------- SHA-1 (sync) ----------------------------- */
// Small, dependency-free SHA-1 over a UTF-8 string → 40 hex chars.
function sha1hex(input: string): string {
  const bytes = utf8Bytes(input);
  const ml = bytes.length * 8;
  // padding
  const withOne = bytes.length + 1;
  const total = withOne + ((56 - (withOne % 64) + 64) % 64) + 8;
  const msg = new Uint8Array(total);
  msg.set(bytes);
  msg[bytes.length] = 0x80;
  // 64-bit big-endian length (high 32 bits assumed 0 for our inputs)
  const dv = new DataView(msg.buffer);
  dv.setUint32(total - 4, ml >>> 0, false);
  dv.setUint32(total - 8, Math.floor(ml / 0x100000000), false);

  let h0 = 0x67452301, h1 = 0xefcdab89, h2 = 0x98badcfe, h3 = 0x10325476, h4 = 0xc3d2e1f0;
  const w = new Uint32Array(80);
  for (let i = 0; i < total; i += 64) {
    for (let j = 0; j < 16; j++) w[j] = dv.getUint32(i + j * 4, false);
    for (let j = 16; j < 80; j++) {
      const x = w[j - 3] ^ w[j - 8] ^ w[j - 14] ^ w[j - 16];
      w[j] = (x << 1) | (x >>> 31);
    }
    let a = h0, b = h1, c = h2, d = h3, e = h4;
    for (let j = 0; j < 80; j++) {
      let f: number, k: number;
      if (j < 20) { f = (b & c) | (~b & d); k = 0x5a827999; }
      else if (j < 40) { f = b ^ c ^ d; k = 0x6ed9eba1; }
      else if (j < 60) { f = (b & c) | (b & d) | (c & d); k = 0x8f1bbcdc; }
      else { f = b ^ c ^ d; k = 0xca62c1d6; }
      const t = (((a << 5) | (a >>> 27)) + f + e + k + w[j]) >>> 0;
      e = d; d = c; c = (b << 30) | (b >>> 2); b = a; a = t;
    }
    h0 = (h0 + a) >>> 0; h1 = (h1 + b) >>> 0; h2 = (h2 + c) >>> 0;
    h3 = (h3 + d) >>> 0; h4 = (h4 + e) >>> 0;
  }
  return [h0, h1, h2, h3, h4].map((n) => (n >>> 0).toString(16).padStart(8, '0')).join('');
}

function utf8Bytes(str: string): Uint8Array {
  if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(str);
  const out: number[] = [];
  for (let i = 0; i < str.length; i++) {
    let c = str.charCodeAt(i);
    if (c < 0x80) out.push(c);
    else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 0x3f));
    else out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 0x3f), 0x80 | (c & 0x3f));
  }
  return new Uint8Array(out);
}

/* --------------------------- fingerprint parts -------------------------- */

export function textHashOf(el: Element): string {
  const txt = (el.textContent ?? '').trim().replace(/\s+/g, ' ');
  if (txt === '') return '';
  return sha1hex(txt).slice(0, 16);
}

export function rectBucketOf(el: Element): string {
  const r = el.getBoundingClientRect();
  return `${Math.floor(r.width / 50)}x${Math.floor(r.height / 50)}`;
}

export function depthOf(el: Element): number {
  let d = 0;
  let cur: Element | null = el.parentElement;
  while (cur) {
    d++;
    cur = cur.parentElement;
  }
  return d;
}

export function fingerprint(el: Element): FP {
  return {
    tag: el.tagName.toLowerCase(),
    textHash: textHashOf(el),
    rectBucket: rectBucketOf(el),
    depth: depthOf(el),
  };
}

/* ----------------------------- CSS escaping ----------------------------- */
export function cssEscape(value: string): string {
  const g = globalThis as { CSS?: { escape?: (s: string) => string } };
  if (g.CSS && typeof g.CSS.escape === 'function') return g.CSS.escape(value);
  // minimal fallback
  return value.replace(/[^a-zA-Z0-9_-]/g, (ch) => '\\' + ch);
}

const ID_RE = /^[A-Za-z][\w-]*$/;

/**
 * Build a stable, unique selector for `el` within its own root, or null.
 * Prefers a safe id, then a unique [data-*]/[aria-label] attribute.
 */
export function stableSelector(el: Element): { selector: string; kind: 'id' | 'attr' } | null {
  const root = el.getRootNode() as Document | ShadowRoot;
  const id = el.getAttribute('id');
  if (id && ID_RE.test(id)) {
    const sel = `#${cssEscape(id)}`;
    if (uniqueIn(root, sel)) return { selector: sel, kind: 'id' };
  }
  const tag = el.tagName.toLowerCase();
  const attrs = el.attributes;
  for (let i = 0; i < attrs.length; i++) {
    const name = attrs[i].name;
    if (name.startsWith('data-ks-')) continue; // never pick our own marker as the selector
    if (name.startsWith('data-') || name === 'aria-label') {
      const val = attrs[i].value;
      const sel = `${tag}[${name}="${cssEscapeAttr(val)}"]`;
      if (uniqueIn(root, sel)) return { selector: sel, kind: 'attr' };
    }
  }
  return null;
}

function cssEscapeAttr(value: string): string {
  return value.replace(/["\\]/g, (ch) => '\\' + ch);
}

function uniqueIn(root: Document | ShadowRoot, selector: string): boolean {
  try {
    return root.querySelectorAll(selector).length === 1;
  } catch {
    return false;
  }
}

/* ---------------------------- rule build/replay ------------------------- */

/**
 * Build a durable rule for `el`, or null when no stable chain exists
 * (caller then falls back to a session-only hide).
 */
export function buildRule(el: Element): Rule | null {
  const self = stableSelector(el);
  if (!self) return null;
  const hostChain = buildHostChain(el);
  if (hostChain === null) return null;
  return { hostChain, selector: self.selector, kind: self.kind, fp: fingerprint(el) };
}

/** host selectors from document root to the element's containing open shadow root, or null. */
function buildHostChain(el: Element): string[] | null {
  const chain: string[] = [];
  let root = el.getRootNode();
  // Walk outward through shadow boundaries.
  while (isShadowRoot(root)) {
    const host = root.host;
    const sel = stableSelector(host);
    if (!sel) return null; // ambiguous/unstable host → cannot persist
    chain.unshift(sel.selector);
    root = host.getRootNode();
  }
  return chain;
}

function isShadowRoot(node: Node): node is ShadowRoot {
  return node instanceof ShadowRoot || (node as ShadowRoot).host !== undefined && (node as Node).nodeType === 11;
}

/**
 * Conservative replay: resolve the root via hostChain, require exactly one match
 * for `selector`, then validate the fingerprint. Returns the element or null (skip).
 */
export function replayRule(rule: Rule, doc: Document): Element | null {
  let root: Document | ShadowRoot = doc;
  for (const hostSel of rule.hostChain) {
    const hosts = safeQueryAll(root, hostSel);
    if (hosts.length !== 1) return null;
    const sr = (hosts[0] as Element).shadowRoot;
    if (!sr) return null; // closed or missing → skip
    root = sr;
  }
  const matches = safeQueryAll(root, rule.selector);
  if (matches.length !== 1) return null;
  const el = matches[0];
  if (!fingerprintMatches(el, rule.fp)) return null;
  return el;
}

export function fingerprintMatches(el: Element, fp: FP): boolean {
  if (el.tagName.toLowerCase() !== fp.tag) return false;
  if (fp.textHash !== '') {
    return textHashOf(el) === fp.textHash;
  }
  // empty-text identity: rectBucket + depth
  return rectBucketOf(el) === fp.rectBucket && depthOf(el) === fp.depth;
}

function safeQueryAll(root: Document | ShadowRoot, selector: string): Element[] {
  try {
    return Array.from(root.querySelectorAll(selector));
  } catch {
    return [];
  }
}

export const __test = { sha1hex };
