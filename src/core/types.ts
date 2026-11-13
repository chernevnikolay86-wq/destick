// Shared types for Destick (Kill-Sticky).

/** Lightweight element fingerprint used to make picker rules self-validating on replay. */
export interface FP {
  tag: string;
  /** SHA-1 (first 16 hex) of trimmed+collapsed textContent; '' when the element had no text. */
  textHash: string;
  /** floor(w/50)x floor(h/50) bucket of the bounding rect. */
  rectBucket: string;
  /** number of ancestors up to the (shadow or document) root. */
  depth: number;
}

/** A durable element-pick rule. */
export interface Rule {
  /** host selectors from document root to the containing open shadow root; [] = top light DOM. */
  hostChain: string[];
  selector: string;
  kind: 'id' | 'attr';
  fp: FP;
}

/** Per-origin durable preferences (chrome.storage.local). */
export interface SitePrefs {
  autoClean: boolean;
  pickedRules: Rule[];
  /**
   * Document-scope selectors of the junk hidden on the last clean, replayed as a
   * pre-paint `<style>` on the next load so remembered junk never flashes (§flash).
   * Best-effort hint only; the engine stays the live source of truth.
   */
  preHideSelectors?: string[];
}

export const DEFAULT_PREFS: SitePrefs = { autoClean: false, pickedRules: [], preHideSelectors: [] };

export type CleanState = 'off' | 'cleaned';

export interface EngineStatus {
  supported: boolean;
  state: CleanState;
  count: number;
  capped: boolean;
}
