// Content script — authoritative live clean-state lives here (§State model).
// Runs at document_start, top frame only.
import { Engine } from '../core/engine';
import { startPicker, type PickerController } from '../core/picker';
import { getPrefs, addRule } from '../core/storage';
import type { ContentToSw, SwToContent, WhoamiResponse } from '../core/messages';
import type { EngineStatus } from '../core/types';

if (window.top === window.self) main();

function main(): void {
  const origin = location.origin;
  let last: EngineStatus = { supported: true, state: 'off', count: 0, capped: false };
  let activePicker: PickerController | null = null;
  let pickGen = 0;

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
    engine.toggle(prefs.pickedRules);
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
        if (rule) void addRule(origin, rule).catch(() => {});
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
    if (!prefs.autoClean) return;
    engine.clean(prefs.pickedRules);
    onReady('DOMContentLoaded', () => engine.reconcile([]));
    onReady('load', () => engine.reconcile([]));
  })();

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
