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
  debounce: number;
  maxWait: number;
  /** cap on effective re-clean executions (didWork) per window — the spec's "20 re-cleans". */
  cap: number;
  /** safety ceiling on TOTAL scans (incl. no-ops) per window — bounds CPU under churn. */
  scanCap: number;
  windowMs: number;
}

export const DEFAULT_BUDGET: ObserverBudget = {
  debounce: 250,
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
    if (this.timer) clearTimeout(this.timer);
    const waited = Date.now() - this.firstBufferedAt;
    const delay = Math.max(0, Math.min(this.budget.debounce, this.budget.maxWait - waited));
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
