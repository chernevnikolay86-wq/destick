// Engine — per-document orchestration of clean / undo (§State model, §Детекция,
// §Unlock, §Undo ledger, §Жизнен цикъл). Lives in the content script; holds the
// authoritative live clean-state. Service worker stays stateless.

import { classify, filterOutermost, type CandidateInput } from './detect';
import { classifyRootLock, hasLock } from './unlock';
import { Ledger } from './ledger';
import { Observer, type ObserverHost } from './observer';
import { buildRule, replayRule } from './fingerprint';
import type { CleanState, EngineStatus, Rule } from './types';

const UI_ATTR = 'data-ks-ui'; // our own picker UI nodes — never candidates

const perfNow = (): number =>
  typeof performance !== 'undefined' ? performance.now() : Date.now();

export interface EngineHooks {
  onStatus(status: EngineStatus): void;
}

export class Engine implements ObserverHost {
  private state: CleanState = 'off';
  private ledger = new Ledger();
  private observer: Observer;
  private styleByRoot = new Map<Document | ShadowRoot, HTMLStyleElement>();
  private shadowRoots = new Set<ShadowRoot>();
  private rules: Rule[] = [];

  // perf (§Performance baseline) — synchronous-pass timings, read via getTimings().
  private lastCleanMs = 0;
  private reconcileTimes: number[] = [];

  // scroll bookkeeping
  private scrollYAtClean = 0;
  private userScrolled = false;
  private negTopRoot: HTMLElement | null = null;
  private negTopValue = 0;
  private lastProgrammaticY = 0;
  private scrollListener?: () => void;
  private scrollHandler?: () => void;

  constructor(private hooks: EngineHooks) {
    this.observer = new Observer(this);
  }

  /* --------------------------- ObserverHost --------------------------- */
  roots(): (Document | ShadowRoot)[] {
    return [document, ...this.shadowRoots];
  }
  attributeFilter(): string[] {
    return ['style', 'class', 'hidden', this.ledger.hideMarker];
  }
  onCapped(capped: boolean): void {
    if (capped) this.emit();
  }

  /* ------------------------------ status ------------------------------ */
  status(): EngineStatus {
    return {
      supported: true,
      state: this.state,
      count: this.ledger.hiddenCount,
      capped: this.observer.isCapped,
    };
  }
  isCleaned(): boolean {
    return this.state === 'cleaned';
  }
  /** Synchronous-pass timings (§Performance baseline, AC-A9). */
  getTimings(): { lastCleanMs: number; reconcile: number[] } {
    return { lastCleanMs: this.lastCleanMs, reconcile: [...this.reconcileTimes] };
  }
  private lastEmittedCount = 0;
  private emit(): void {
    this.lastEmittedCount = this.ledger.hiddenCount;
    this.hooks.onStatus(this.status());
  }

  /* ------------------------------ toggle ------------------------------ */
  toggle(rules: Rule[]): EngineStatus {
    if (this.state === 'off') this.clean(rules);
    else this.undo();
    return this.status();
  }

  /* ------------------------------- clean ------------------------------ */
  clean(rules: Rule[]): number {
    if (this.state === 'cleaned') return this.ledger.hiddenCount;
    this.rules = rules;
    this.ledger = new Ledger();
    this.styleByRoot.clear();
    this.shadowRoots.clear();
    this.negTopRoot = null;

    const t0 = perfNow();
    // READ then WRITE to minimise layout thrash.
    const candidates = this.scanCandidates();
    for (const el of candidates) this.hideElement(el);
    this.applyUnlock(true);
    this.applyRules(this.rules);

    // scroll snapshot + branch-B clean-time visual
    this.scrollYAtClean = window.scrollY || window.pageYOffset || 0;
    this.userScrolled = false;
    this.lastProgrammaticY = this.scrollYAtClean;
    this.attachScrollWatch();
    if (this.negTopRoot) {
      this.lastProgrammaticY = this.negTopValue;
      window.scrollTo(0, this.negTopValue);
    }
    // Measured before observer.start() so it excludes later observer re-runs.
    this.lastCleanMs = perfNow() - t0;

    this.state = 'cleaned';
    this.observer.start();
    this.emit();
    return this.ledger.hiddenCount;
  }

  /* -------------------------------- undo ------------------------------ */
  undo(): void {
    if (this.state === 'off') return;
    // Decide scroll plan BEFORE ledger.undo resets relinquish state.
    // Only take the "restore the lock geometry" branch when we still actually own the
    // lock props (page may have overwritten them even before the observer relinquished).
    const negRestored =
      !!this.negTopRoot &&
      this.negTopRoot.isConnected &&
      this.ledger.ownsCurrentValue(this.negTopRoot, 'position') &&
      this.ledger.ownsCurrentValue(this.negTopRoot, 'top');
    const targetY = this.scrollYAtClean;
    const userScrolled = this.userScrolled;

    this.observer.stop();
    this.detachScrollWatch();
    this.ledger.undo();
    this.styleByRoot.clear();
    this.shadowRoots.clear();

    if (negRestored) {
      // restored lock geometry determines the visual position — no scrollTo.
    } else if (!userScrolled) {
      window.scrollTo(0, targetY);
    }

    this.negTopRoot = null;
    this.state = 'off';
    this.emit();
  }

  /* ----------------------------- detection ---------------------------- */
  private scanCandidates(): Element[] {
    const all = this.allElements();
    const hits: Element[] = [];
    for (const el of all) {
      if (el.hasAttribute(UI_ATTR)) continue;
      const input = this.toInput(el);
      if (!input) continue;
      if (classify(input)) hits.push(el);
    }
    return filterOutermost(hits);
  }

  private allElements(): Element[] {
    const out: Element[] = [];
    const visit = (root: Document | ShadowRoot) => {
      const els = root.querySelectorAll('*');
      for (const el of els) {
        out.push(el);
        const sr = (el as Element).shadowRoot;
        if (sr) {
          this.shadowRoots.add(sr);
          visit(sr);
        }
      }
    };
    visit(document);
    return out;
  }

  private toInput(el: Element): CandidateInput | null {
    const tag = el.tagName.toLowerCase();
    if (tag === 'html' || tag === 'body') return null;
    let cs: CSSStyleDeclaration;
    try {
      cs = getComputedStyle(el);
    } catch {
      return null;
    }
    const r = el.getBoundingClientRect();
    return {
      tag,
      style: {
        position: cs.position,
        zIndex: cs.zIndex,
        opacity: cs.opacity,
        transform: cs.transform,
        filter: cs.filter,
        willChange: cs.willChange,
        isolation: cs.isolation,
        mixBlendMode: cs.mixBlendMode,
        display: cs.display,
        visibility: cs.visibility,
        perspective: cs.perspective,
        contain: cs.contain,
      },
      rect: { x: r.x, y: r.y, width: r.width, height: r.height },
      viewport: { width: window.innerWidth, height: window.innerHeight },
    };
  }

  /* ------------------------------- hide ------------------------------- */
  private hideElement(el: Element): void {
    if (el.tagName.toLowerCase() === 'html' || el.tagName.toLowerCase() === 'body') return;
    const root = el.getRootNode() as Document | ShadowRoot;
    this.ensureStyle(root);
    this.ledger.addHideMarker(el);
    // Guaranteed-hide fallback against inline-important / higher specificity / @layer.
    // Covers SVGElement too (an inline-important <svg> overlay would beat the stylesheet).
    if (el instanceof HTMLElement || el instanceof SVGElement) {
      let display = '';
      try {
        display = getComputedStyle(el).display;
      } catch {
        /* ignore */
      }
      if (display !== 'none') this.ledger.setInlineImportant(el, 'display', 'none');
    }
  }

  private ensureStyle(root: Document | ShadowRoot): void {
    if (this.styleByRoot.has(root)) {
      const existing = this.styleByRoot.get(root)!;
      if (existing.isConnected) return;
    }
    const style = document.createElement('style');
    style.setAttribute(UI_ATTR, '1');
    style.textContent = `[${this.ledger.hideMarker}]{display:none!important}`;
    const host: Node =
      root instanceof Document ? root.head ?? root.documentElement ?? root : root;
    host.appendChild(style);
    this.styleByRoot.set(root, style);
    this.ledger.trackStyleNode(style);
  }

  /* ------------------------------ unlock ------------------------------ */
  private applyUnlock(firstPass: boolean): boolean {
    const before = this.ledger.trackedPropCount;
    const roots: HTMLElement[] = [];
    if (document.documentElement) roots.push(document.documentElement);
    if (document.body) roots.push(document.body);
    for (const el of roots) {
      let cs: CSSStyleDeclaration;
      try {
        cs = getComputedStyle(el);
      } catch {
        continue;
      }
      const lock = classifyRootLock({
        overflowX: cs.overflowX,
        overflowY: cs.overflowY,
        position: cs.position,
        top: cs.top,
      });
      if (!hasLock(lock)) continue;
      for (const axis of lock.overflowAxes) {
        this.claimProp(el, axis === 'x' ? 'overflow-x' : 'overflow-y', 'auto');
      }
      if (lock.negativeTop !== null) {
        const okPos = this.claimProp(el, 'position', 'static');
        const okTop = this.claimProp(el, 'top', 'auto');
        if (okPos && okTop && (firstPass || !this.negTopRoot)) {
          this.negTopRoot = el;
          this.negTopValue = lock.negativeTop;
        }
      }
    }
    return this.ledger.trackedPropCount !== before;
  }

  /**
   * (Re)assert `prop:value !important` on a root we unlock — unless the page has
   * overwritten the value we previously owned, in which case we relinquish that pair
   * (page-wins). This closes the startup-reconcile race where the page sets its own
   * overflow lock before our observer processed the overwrite. Returns true if asserted.
   */
  private claimProp(el: HTMLElement, prop: string, value: string): boolean {
    if (this.ledger.isPropRelinquished(el, prop)) return false;
    const alreadyOwned = this.ledger.ownedProps(el).some((o) => o.prop === prop);
    if (alreadyOwned && !this.ledger.ownsCurrentValue(el, prop)) {
      this.ledger.relinquishProp(el, prop); // page overwrote our value since → page wins
      return false;
    }
    this.ledger.setInlineImportant(el, prop, value);
    return true;
  }

  /* --------------------------- picker rules --------------------------- */
  private applyRules(rules: Rule[]): void {
    for (const rule of rules) {
      const el = replayRule(rule, document);
      if (el) this.hideElement(el);
    }
  }

  /* --------------------------- reconcile ------------------------------ */
  reconcile(records: MutationRecord[]): boolean {
    if (this.state !== 'cleaned') return false;
    const t0 = perfNow();
    let didWork = false;
    this.observer.pause();
    try {
      // 0. prune shadow roots whose host was removed, so roots() stops handing the
      //    observer detached trees (which would keep firing full-document reconciles).
      for (const sr of Array.from(this.shadowRoots)) {
        if (!sr.host || !sr.host.isConnected) this.shadowRoots.delete(sr);
      }
      // 1. repair our removed injected <style> nodes — only for still-live roots, and
      //    over a SNAPSHOT so re-ensuring never revisits a detached root forever (a
      //    removed shadow host would otherwise loop, re-appending styles and hanging).
      for (const [root, style] of Array.from(this.styleByRoot)) {
        if (style.isConnected) continue;
        this.styleByRoot.delete(root);
        const live = root instanceof Document || (root as ShadowRoot).host?.isConnected === true;
        if (live) {
          this.ensureStyle(root);
          didWork = true;
        }
      }
      // 2. attribute records: marker removal → repair; owned-prop overwrite → relinquish.
      for (const rec of records) {
        if (rec.type !== 'attributes') continue;
        const t = rec.target as Element;
        if (rec.attributeName === this.ledger.hideMarker) {
          if (this.ledger.hasMarker(t) && !this.ledger.isMarkerRelinquished(t)) {
            if (!t.hasAttribute(this.ledger.hideMarker)) {
              t.setAttribute(this.ledger.hideMarker, '1'); // DY3b: removal → repair
              didWork = true;
            } else if (t.getAttribute(this.ledger.hideMarker) !== '1') {
              // DY3d: page REPLACED our marker with its own value → relinquish this
              // pair (no repair; Undo must not overwrite the page's marker value).
              this.ledger.relinquishMarker(t);
              didWork = true;
            }
          }
        } else if (
          rec.attributeName === 'style' &&
          (t instanceof HTMLElement || t instanceof SVGElement)
        ) {
          for (const { prop, ourValue } of this.ledger.ownedProps(t)) {
            const cur = t.style.getPropertyValue(prop);
            const important = t.style.getPropertyPriority(prop) === 'important';
            if (!(cur === ourValue && important)) {
              this.ledger.relinquishProp(t, prop); // DY3c page wins
              didWork = true;
            }
          }
        }
      }
      // 3. rescan for new candidates + new lock signatures.
      const beforeHidden = this.ledger.hiddenCount;
      const newCandidates = this.scanCandidates();
      for (const el of newCandidates) {
        if (!(this.ledger.hasMarker(el))) this.hideElement(el);
      }
      if (this.ledger.hiddenCount !== beforeHidden) didWork = true;
      const hadNeg = !!this.negTopRoot;
      if (this.applyUnlock(false)) didWork = true;
      // A negative-top lock discovered dynamically (after the initial clean) still needs
      // its clean-time visual scroll, which only clean() applied before.
      if (!hadNeg && this.negTopRoot) {
        this.lastProgrammaticY = this.negTopValue;
        window.scrollTo(0, this.negTopValue);
      }
      // re-apply picker rules for freshly inserted matches
      this.applyRules(this.rules);
    } finally {
      this.observer.resume();
    }
    // The badge must refresh whenever the hidden count changed since the last emit —
    // including deletion-only reconciles where no new work was done this pass.
    if (this.ledger.hiddenCount !== this.lastEmittedCount) didWork = true;
    const dt = perfNow() - t0;
    this.reconcileTimes.push(dt);
    if (this.reconcileTimes.length > 60) this.reconcileTimes.shift();
    if (didWork) this.emit();
    return didWork;
  }

  /* ------------------------------ scroll ------------------------------ */
  private attachScrollWatch(): void {
    this.detachScrollWatch();
    const mark = () => {
      this.userScrolled = true;
    };
    // Scrollbar dragging fires only 'scroll' (no wheel/key/touch). A scroll that
    // diverges from our last programmatic position is a user scroll; our own scrollTo
    // updates lastProgrammaticY first, so it never trips this.
    const onScroll = () => {
      if (Math.abs((window.scrollY || 0) - this.lastProgrammaticY) > 2) this.userScrolled = true;
    };
    this.scrollListener = mark;
    this.scrollHandler = onScroll;
    window.addEventListener('wheel', mark, { passive: true });
    window.addEventListener('keydown', mark, { passive: true });
    window.addEventListener('touchmove', mark, { passive: true });
    window.addEventListener('scroll', onScroll, { passive: true });
  }
  private detachScrollWatch(): void {
    if (this.scrollListener) {
      window.removeEventListener('wheel', this.scrollListener);
      window.removeEventListener('keydown', this.scrollListener);
      window.removeEventListener('touchmove', this.scrollListener);
      this.scrollListener = undefined;
    }
    if (this.scrollHandler) {
      window.removeEventListener('scroll', this.scrollHandler);
      this.scrollHandler = undefined;
    }
  }

  /* ------------------------------ picker ------------------------------ */
  /** Hide a user-picked element through the ledger; build a durable rule if possible. */
  pickHide(el: Element, rules: Rule[]): { rule: Rule | null } {
    // Build the rule while the element is still VISIBLE and before our marker exists,
    // so the rect bucket is real (empty-text identity) and the marker can't be chosen
    // as the "stable" selector.
    const rule = buildRule(el);
    if (this.state === 'off') this.clean(rules); // full clean so Undo covers everything
    this.observer.pause();
    try {
      this.hideElement(el);
    } finally {
      this.observer.resume();
    }
    // Add the new rule to the LIVE set so reconcile re-applies it if the page later
    // replaces the picked element with an identical node.
    if (rule) this.rules = [...this.rules, rule];
    this.emit();
    return { rule };
  }

  /** mark/unmark UI nodes so detection ignores them */
  static markUi(el: Element): void {
    el.setAttribute(UI_ATTR, '1');
  }
}
