// Idempotent mutation ledger (§Undo ledger).
// Owns exactly: (a) injected <style> nodes (by JS reference), (b) marker
// attributes data-ks-*-<token>, (c) inline properties we set. Undo restores each
// owned (node, property/marker) pair that is still connected and not relinquished.
// Relinquish is PER PAIR, never per whole node.

/** Anything with an inline CSSStyleDeclaration — HTMLElement OR SVGElement. */
export type StyledElement = Element & ElementCSSInlineStyle;

let nodeSeq = 0;
const nodeIds = new WeakMap<object, number>();
function nodeKey(node: object): string {
  let id = nodeIds.get(node);
  if (id === undefined) {
    id = ++nodeSeq;
    nodeIds.set(node, id);
  }
  return String(id);
}

interface PropEntry {
  key: string;
  node: StyledElement;
  prop: string;
  prevValue: string;
  prevPriority: string;
  existed: boolean;
  /** the !important value WE wrote (for overwrite detection by the observer / undo) */
  ourValue: string;
}
interface MarkerEntry {
  key: string;
  node: Element;
  attr: string;
  /** the attribute value that existed BEFORE we wrote ours (collision-restore). */
  prevValue: string;
  existed: boolean;
}

function randToken(): string {
  // collision-resistant random suffix; a page practically cannot carry this exact attr.
  const a = Math.random().toString(36).slice(2, 8);
  const b = Math.random().toString(36).slice(2, 6);
  return a + b;
}

export class Ledger {
  readonly token: string;
  readonly hideMarker: string;

  private styleNodes: Node[] = [];
  private props: PropEntry[] = [];
  private markers: MarkerEntry[] = [];
  private propIndex = new Map<string, PropEntry>();
  private markerIndex = new Map<string, MarkerEntry>();
  private relinquished = new Set<string>();

  constructor(token?: string) {
    this.token = token ?? randToken();
    this.hideMarker = `data-ks-hide-${this.token}`;
  }

  /** Set an inline property with !important, recording its previous inline state once. */
  setInlineImportant(node: StyledElement, prop: string, value: string): void {
    const key = `${nodeKey(node)}|${prop}`;
    // Page-wins: once a pair is relinquished we never re-assert it (HIGH: applyRules /
    // hideElement must not clobber a property the page has taken over).
    if (this.relinquished.has(key)) return;
    let entry = this.propIndex.get(key);
    if (!entry) {
      const prevValue = node.style.getPropertyValue(prop);
      const prevPriority = node.style.getPropertyPriority(prop);
      entry = {
        key,
        node,
        prop,
        prevValue,
        prevPriority,
        existed: prevValue !== '',
        ourValue: value,
      };
      this.propIndex.set(key, entry);
      this.props.push(entry);
    } else {
      entry.ourValue = value;
    }
    node.style.setProperty(prop, value, 'important');
  }

  /** Owned inline props on a node that are not yet relinquished. */
  ownedProps(node: StyledElement): { prop: string; ourValue: string }[] {
    const out: { prop: string; ourValue: string }[] = [];
    for (const e of this.props) {
      if (e.node === node && !this.relinquished.has(e.key)) {
        out.push({ prop: e.prop, ourValue: e.ourValue });
      }
    }
    return out;
  }

  /** Add our collision-resistant hide marker to a node (idempotent). */
  addHideMarker(node: Element): void {
    const key = `${nodeKey(node)}|@${this.hideMarker}`;
    if (this.relinquished.has(key)) return; // page-wins: don't re-assert a relinquished marker
    if (!this.markerIndex.has(key)) {
      const existed = node.hasAttribute(this.hideMarker);
      const prevValue = existed ? (node.getAttribute(this.hideMarker) ?? '') : '';
      const entry: MarkerEntry = { key, node, attr: this.hideMarker, prevValue, existed };
      this.markerIndex.set(key, entry);
      this.markers.push(entry);
    }
    node.setAttribute(this.hideMarker, '1');
  }

  /** Track an injected <style> node we own (by reference). */
  trackStyleNode(node: Node): void {
    if (!this.styleNodes.includes(node)) this.styleNodes.push(node);
  }

  hasMarker(node: Element): boolean {
    return this.markerIndex.has(`${nodeKey(node)}|@${this.hideMarker}`);
  }

  /** Page overwrote one of our owned inline props → release only that pair. */
  relinquishProp(node: StyledElement, prop: string): void {
    this.relinquished.add(`${nodeKey(node)}|${prop}`);
  }

  /** Page replaced one of our markers → release only that pair. */
  relinquishMarker(node: Element): void {
    this.relinquished.add(`${nodeKey(node)}|@${this.hideMarker}`);
  }

  isPropRelinquished(node: StyledElement, prop: string): boolean {
    return this.relinquished.has(`${nodeKey(node)}|${prop}`);
  }

  /** True iff we own this prop AND the live inline value is still exactly ours (!important). */
  ownsCurrentValue(node: StyledElement, prop: string): boolean {
    const entry = this.propIndex.get(`${nodeKey(node)}|${prop}`);
    if (!entry || this.relinquished.has(entry.key) || !node.isConnected) return false;
    return (
      node.style.getPropertyValue(prop) === entry.ourValue &&
      node.style.getPropertyPriority(prop) === 'important'
    );
  }

  isMarkerRelinquished(node: Element): boolean {
    return this.relinquished.has(`${nodeKey(node)}|@${this.hideMarker}`);
  }

  ownsStyleNode(node: Node): boolean {
    return this.styleNodes.includes(node);
  }

  /** Reverse every surviving, non-relinquished owned pair. Never reinjects page nodes. */
  undo(): void {
    // Our injected <style> nodes: remove (no-op if the page already removed them).
    for (const s of this.styleNodes) {
      (s as ChildNode).remove?.();
    }
    // Inline properties: restore previous inline value+priority, or remove — but only
    // if the current inline value is STILL exactly what we wrote. If the page overwrote
    // it (even if the observer had not yet relinquished it — e.g. Undo raced the
    // debounce), leave the page's value in place (page-wins).
    for (const e of this.props) {
      if (this.relinquished.has(e.key)) continue;
      if (!e.node.isConnected) continue;
      const cur = e.node.style.getPropertyValue(e.prop);
      const important = e.node.style.getPropertyPriority(e.prop) === 'important';
      if (!(cur === e.ourValue && important)) continue; // page changed it → don't clobber
      if (e.existed) e.node.style.setProperty(e.prop, e.prevValue, e.prevPriority);
      else e.node.style.removeProperty(e.prop);
    }
    // Marker attributes: only touch markers still holding OUR value ('1'); restore any
    // pre-existing value (collision) or remove. A page-replaced marker is left alone.
    for (const m of this.markers) {
      if (this.relinquished.has(m.key)) continue;
      if (!m.node.isConnected) continue;
      if (m.node.getAttribute(m.attr) !== '1') continue; // page replaced/removed → leave it
      if (m.existed) m.node.setAttribute(m.attr, m.prevValue);
      else m.node.removeAttribute(m.attr);
    }
    this.reset();
  }

  private reset(): void {
    this.styleNodes = [];
    this.props = [];
    this.markers = [];
    this.propIndex.clear();
    this.markerIndex.clear();
    this.relinquished.clear();
  }

  /** Count of currently-hidden nodes (connected, still-marked, not relinquished) — badge. */
  get hiddenCount(): number {
    let n = 0;
    for (const m of this.markers) {
      if (this.relinquished.has(m.key)) continue;
      if (m.node.isConnected && m.node.getAttribute(m.attr) !== null) n++;
    }
    return n;
  }

  /** Number of owned inline-property entries (for change detection). */
  get trackedPropCount(): number {
    return this.props.length;
  }
}
