// Debounced, bounded MutationObserver lifecycle (§Жизнен цикъл, §Числови бюджети).
// Isolated-world only: we never touch page-world history/globals.

export interface ObserverHost {
  /** roots to observe (top document + open shadow roots) */
  roots(): (Document | ShadowRoot)[];
  /** attribute names to watch, incl. our session marker */
  attributeFilter(): string[];
  /** apply repairs/rescan for buffered records; returns true if it changed anything */
  reconcile(records: MutationRecord[]): boolean;
  /** notified when the cap trips / resets */
  onCapped(capped: boolean): void;
}

export interface ObserverBudget {
  /** trailing delay used while the page is actively churning (coalesces bursts). */
  debounce: number;
  /**
   * leading delay for the FIRST flush after a quiet gap — ~1 frame — so a freshly injected
   * overlay (e.g. a late cookie/consent wall) is removed almost immediately instead of
   * flashing for a full `debounce` (§flash).
   */
  leading: number;
  /** a mutation arriving this long after our last reconcile counts as "after quiet" → leading. */
  quietGap: number;
  maxWait: number;
  /** cap on effective re-clean executions (didWork) per window — the spec's "20 re-cleans". */
  cap: number;
  /** safety ceiling on TOTAL scans (incl. no-ops) per window — bounds CPU under churn. */
  scanCap: number;
  windowMs: number;
}

export const DEFAULT_BUDGET: ObserverBudget = {
  debounce: 250,
  leading: 16,
  quietGap: 400,
  maxWait: 1000,
  cap: 20,
  scanCap: 60,
  windowMs: 10_000,
};

export class Observer {
  private mo: MutationObserver;
  private buffer: MutationRecord[] = [];
  private timer: ReturnType<typeof setTimeout> | undefined;
  private firstBufferedAt = 0;
  private lastFlushAt = 0;
  private execTimes: number[] = [];
  private scanTimes: number[] = [];
  private capped = false;
  private active = false;

  constructor(
    private host: ObserverHost,
    private budget: ObserverBudget = DEFAULT_BUDGET,
  ) {
    this.mo = new MutationObserver((recs) => this.enqueue(recs));
  }

  start(): void {
    this.active = true;
    this.capped = false;
    this.execTimes = [];
    this.scanTimes = [];
    this.lastFlushAt = 0; // first junk after clean counts as "after quiet" → leading flush
    this.observeAll();
  }

  stop(): void {
    this.active = false;
    this.mo.disconnect();
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
    this.buffer = [];
  }

  get isCapped(): boolean {
    return this.capped;
  }

  /** Disconnect around our own writes so we never observe self-mutations. */
  pause(): void {
    this.mo.disconnect();
  }

  resume(): void {
    if (!this.active || this.capped) return;
    this.mo.takeRecords(); // discard records produced by our own writes
    this.observeAll();
  }

  private observeAll(): void {
    this.mo.disconnect();
    const config: MutationObserverInit = {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: this.host.attributeFilter(),
    };
    for (const root of this.host.roots()) {
      try {
        this.mo.observe(root as Node, config);
      } catch {
        /* a detached root can throw; ignore */
      }
    }
  }

  private enqueue(recs: MutationRecord[]): void {
    if (!this.active || this.capped) return;
    if (this.buffer.length === 0) this.firstBufferedAt = Date.now();
    for (const r of recs) this.buffer.push(r);
    this.schedule();
  }

  private schedule(): void {
    // Fixed cadence, NOT reset-on-mutation: a pending flush is never pushed back by newer
    // records, so a burst that starts after quiet still fires ~1 frame in (no 250ms flash).
    if (this.timer) return;
    const now = Date.now();
    const waited = now - this.firstBufferedAt;
    // After a quiet gap (page settled since our last reconcile) run the FIRST flush on the
    // leading edge; under sustained churn fall back to the debounce so bursts coalesce and
    // the cap still bounds CPU. maxWait caps the longest a record can wait.
    const quiet = now - this.lastFlushAt > this.budget.quietGap;
    const base = quiet ? this.budget.leading : this.budget.debounce;
    const delay = Math.max(0, Math.min(base, Math.max(0, this.budget.maxWait - waited)));
    this.timer = setTimeout(() => this.flush(), delay);
  }

  private flush(): void {
    this.timer = undefined;
    if (!this.active || this.capped) {
      this.buffer = [];
      return;
    }
    const recs = this.buffer;
    this.buffer = [];
    this.lastFlushAt = Date.now();
    const didWork = this.host.reconcile(recs);
    this.countExecution(didWork);
  }

  private countExecution(didWork: boolean): void {
    const now = Date.now();
    const fresh = (t: number) => now - t < this.budget.windowMs;
    // Every scan (even a no-op) counts toward the scan ceiling; only effective re-cleans
    // count toward the re-clean cap (spec defines the cap as "re-clean executions").
    this.scanTimes = this.scanTimes.filter(fresh);
    this.scanTimes.push(now);
    if (didWork) {
      this.execTimes = this.execTimes.filter(fresh);
      this.execTimes.push(now);
    }
    if (this.execTimes.length >= this.budget.cap || this.scanTimes.length >= this.budget.scanCap) {
      this.capped = true;
      this.mo.disconnect();
      if (this.timer) clearTimeout(this.timer);
      this.timer = undefined;
      this.host.onCapped(true);
    }
  }
}
