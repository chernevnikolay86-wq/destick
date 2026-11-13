// Content script — authoritative live clean-state lives here (§State model).
// Runs at document_start, top frame only.
import { Engine } from '../core/engine';
import { startPicker, type PickerController } from '../core/picker';
import { getPrefs, addRule, setCleanState } from '../core/storage';
import type { ContentToSw, SwToContent, WhoamiResponse } from '../core/messages';
import type { EngineStatus } from '../core/types';

if (window.top === window.self) main();

function main(): void {
  const origin = location.origin;
  let last: EngineStatus = { supported: true, state: 'off', count: 0, capped: false };
  let activePicker: PickerController | null = null;
  let pickGen = 0;
  let preHideStyle: HTMLStyleElement | null = null; // pre-paint guard for remembered junk (§flash)

  const engine = new Engine({
    onStatus: (s) => {
      last = s;
      send({ ks: 'badge', status: s });
    },
  });

  send({ ks: 'hello', origin });

  chrome.runtime.onMessage.addListener((raw: unknown, _sender, sendResponse) => {
    const msg = raw as SwToContent;
    switch (msg?.ks) {
      case 'toggle':
        void doToggle().then(() => sendResponse?.(last));
        return true;
      case 'pick':
        void doPick();
        sendResponse?.(last);
        return false;
      case 'getState':
        sendResponse?.(last);
        return false;
      case 'timings':
        sendResponse?.(engine.getTimings());
        return false;
      case 'whoami': {
        const r: WhoamiResponse = { supported: true, origin, state: last.state };
        sendResponse?.(r);
        return false;
      }
      default:
        return false;
    }
  });

  async function doToggle(): Promise<void> {
    if (activePicker) {
      activePicker.stop(); // a toggle cancels an in-progress pick
      activePicker = null;
    }
    const prefs = await getPrefs(origin);
    const status = engine.toggle(prefs.pickedRules);
    const cleaned = status.state === 'cleaned';
    if (!cleaned) dropPreHide(); // UNDO must reveal anything the pre-paint guard hid too
    // Make the one-click clean STICKY per site (§State model): persist the resulting
    // clean-state AND the pre-paint hint so the next page on this origin loads clean with
    // no flash. CLEAN → autoClean=true + selectors; UNDO → both cleared. Awaited so the
    // toggle response reflects a durable state (reload/navigation safe).
    try {
      await setCleanState(origin, cleaned, engine.getPreHideSelectors());
    } catch {
      /* storage write failed; the live clean already applied to this page */
    }
  }

  async function doPick(): Promise<void> {
    if (activePicker) {
      activePicker.stop(); // never leave two pickers (listeners + highlights) live at once
      activePicker = null;
    }
    const gen = ++pickGen; // guard the async gap: a newer pick must win
    const prefs = await getPrefs(origin);
    if (gen !== pickGen) return; // superseded while awaiting prefs → do not start a 2nd picker
    activePicker = startPicker(
      (el) => {
        activePicker = null;
        const { rule } = engine.pickHide(el, prefs.pickedRules);
        // Picking an element = "keep this site clean": persist the rule AND the sticky
        // clean-state + pre-hide hint (chained so the two read-modify-writes never clobber),
        // so the picked element — and the blanket clean pickHide applied — survive navigation.
        if (rule) {
          void addRule(origin, rule)
            .then(() => setCleanState(origin, true, engine.getPreHideSelectors()))
            .catch(() => {});
        }
      },
      () => {
        activePicker = null;
      },
    );
  }

  // §startup contract: scan#1 @document_start → observer (inside clean) →
  // reconciliation scan#2 @DOMContentLoaded + #3 @load.
  void (async () => {
    const prefs = await getPrefs(origin);
    if (!prefs.autoClean) {
      // Nothing to auto-clean here: still report the OFF status once so the toolbar
      // shows the explicit OFF state (grey icon + "OFF" title) on this eligible page,
      // not the ambiguous default. (emit() only fires on clean/undo/reconcile.)
      send({ ks: 'badge', status: last });
      return;
    }
    // Pre-paint guard FIRST: hide remembered junk by selector before it ever paints, so a
    // remembered site no longer flashes the overlay/cookie bar on navigation (§flash). The
    // engine then cleans as usual (its markers are the live source of truth); the guard is
    // removed on undo. JS-injected junk with no stable selector still flashes minimally.
    applyPreHide(prefs.preHideSelectors ?? []);
    engine.clean(prefs.pickedRules); // emits a 'cleaned' badge → toolbar shows ON
    onReady('DOMContentLoaded', () => engine.reconcile([]));
    onReady('load', () => engine.reconcile([]));
  })();

  // §flash: a <style> injected at document_start hides remembered junk pre-paint. We own
  // the node (markUi → detection skips it) and it is NOT ledger-tracked; undo removes it
  // explicitly. A stale selector only mis-hides until the user clicks undo (reversible).
  function applyPreHide(selectors: string[]): void {
    if (preHideStyle) return;
    const safe = selectors.filter(isSafeSelector);
    if (safe.length === 0) return;
    try {
      const style = document.createElement('style');
      Engine.markUi(style);
      style.setAttribute('id', 'ks-prehide');
      style.textContent = `${safe.join(',')}{display:none!important}`;
      (document.head ?? document.documentElement).appendChild(style);
      preHideStyle = style;
    } catch {
      /* documentElement not ready / CSP on inline <style> — engine still cleans live */
    }
  }
  function dropPreHide(): void {
    preHideStyle?.remove();
    preHideStyle = null;
  }
  function isSafeSelector(s: unknown): s is string {
    return typeof s === 'string' && s.length > 0 && s.length < 200 && !/[{}]/.test(s);
  }

  function onReady(evt: 'DOMContentLoaded' | 'load', fn: () => void): void {
    const ready =
      (evt === 'DOMContentLoaded' && document.readyState !== 'loading') ||
      (evt === 'load' && document.readyState === 'complete');
    if (ready) fn();
    else window.addEventListener(evt, fn, { once: true });
  }

  function send(m: ContentToSw): void {
    try {
      const p = chrome.runtime.sendMessage(m) as Promise<unknown> | undefined;
      p?.catch?.(() => {});
    } catch {
      /* SW asleep / no receiver */
    }
  }
}
