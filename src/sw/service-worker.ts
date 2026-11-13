// Service worker — stateless router (§Permissions, §State model).
// No live state kept in globals; badge is reconstructed by asking the content
// script. Needs only tab IDs (no `tabs` permission) to route messages.
import type {
  ContentToSw,
  OptionsToSw,
  RegistryEntry,
  SwToContent,
  WhoamiResponse,
} from '../core/messages';
import type { EngineStatus } from '../core/types';

// ON/OFF visualization (§State model): the toolbar must show at a glance whether
// Destick is active for the current site. Driven entirely off the content script's
// {ks:'badge'} reports — the SW stays stateless.
const COLOR_ON = '#16a34a'; // green = cleaned / active
const COLOR_OFF = '#6b7280'; // slate grey = inactive (white text contrasts)
const COLOR_CAP = '#d97706'; // amber = paused (mutation cap tripped)
const ICON_ON: Record<number, string> = {
  16: 'icons/icon16.png',
  32: 'icons/icon32.png',
  48: 'icons/icon48.png',
  128: 'icons/icon128.png',
};
const ICON_OFF: Record<number, string> = {
  16: 'icons/icon16-off.png',
  32: 'icons/icon32-off.png',
  48: 'icons/icon48-off.png',
  128: 'icons/icon128-off.png',
};

chrome.runtime.onInstalled.addListener(() => {
  chrome.action.setBadgeBackgroundColor({ color: COLOR_ON });
});
// also set on startup (SW wake)
chrome.action.setBadgeBackgroundColor({ color: COLOR_ON });

/* ----------------------- toolbar + keyboard entry ----------------------- */
chrome.action.onClicked.addListener((tab) => {
  if (tab.id != null) sendToTab(tab.id, { ks: 'toggle' });
});

chrome.commands.onCommand.addListener(async (command) => {
  const tabId = await activeTabId();
  if (tabId == null) return;
  if (command === 'toggle-clean') sendToTab(tabId, { ks: 'toggle' });
  else if (command === 'pick-element') sendToTab(tabId, { ks: 'pick' });
});

/* ------------------------------ messaging ------------------------------ */
chrome.runtime.onMessage.addListener((raw: unknown, sender, sendResponse) => {
  const msg = raw as ContentToSw | OptionsToSw;

  // Options-page requests. options_ui.open_in_tab=true means the options page runs
  // in a TAB too, so it ALSO carries sender.tab — route these by message type, never
  // by the absence of sender.tab (that bug made the picker chooser a no-op).
  if (msg?.ks === 'getRegistry') {
    void buildRegistry().then((entries) => sendResponse(entries));
    return true;
  }
  if (msg?.ks === 'focusAndPick') {
    void focusAndPick(msg.tabId, msg.windowId).then((ok) => sendResponse({ ok }));
    return true;
  }

  // Content-script messages: badge updates (sender.tab is the reporting tab).
  // 'hello' is informational; the registry is rebuilt on demand (stateless SW).
  if (sender.tab?.id != null && msg?.ks === 'badge') {
    updateBadge(sender.tab.id, msg.status);
  }
  return false;
});

/* ------------------------------- helpers ------------------------------- */
function sendToTab(tabId: number, msg: SwToContent): void {
  chrome.tabs.sendMessage(tabId, msg).catch(() => {
    // No content script on this tab (opened before install / restricted / withheld
    // access). Surface the shared, generic fallback in the only no-permission surface
    // we have — badge + title — rather than silently doing nothing.
    chrome.action.setBadgeText({ tabId, text: '!' }).catch(() => {});
    chrome.action
      .setTitle({ tabId, title: 'Destick has no access on this page — reload it, then try again.' })
      .catch(() => {});
  });
}

async function activeTabId(): Promise<number | null> {
  try {
    const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    return tabs[0]?.id ?? null;
  } catch {
    return null;
  }
}

function updateBadge(tabId: number, status: EngineStatus): void {
  const on = status.state === 'cleaned';
  // nixa's choice: the badge must read the STATE word (ON/OFF), never the element count —
  // a bare number ("1" here, "2" there) didn't tell on/off apart. The count lives in the
  // tooltip only. "OFF" is shown explicitly (not an empty badge) so state is always visible.
  let text: string;
  let color: string;
  let title: string;
  if (status.capped) {
    // capped only ever happens while cleaned (the observer runs only when ON).
    text = '⏸';
    color = COLOR_CAP;
    title = 'Destick: ON (на пауза — твърде много промени по страницата). Клик = върни.';
  } else if (on) {
    text = 'ON';
    color = COLOR_ON;
    title = `Destick: ON — ${status.count} скрити. Клик = върни.`;
  } else {
    text = 'OFF';
    color = COLOR_OFF;
    title = 'Destick: OFF — клик = изчисти сайта.';
  }
  // Three mutually-reinforcing signals: the ON/OFF badge word+color, the dynamic tooltip
  // (which carries the count), and the colored "on" vs muted-grey "off" toolbar icon.
  chrome.action.setBadgeText({ tabId, text }).catch(() => {});
  chrome.action.setBadgeBackgroundColor({ tabId, color }).catch(() => {});
  chrome.action.setTitle({ tabId, title }).catch(() => {});
  chrome.action.setIcon({ tabId, path: on ? ICON_ON : ICON_OFF }).catch(() => {});
}

/** Discover http(s) tabs that have our content script, via tab IDs only. */
async function buildRegistry(): Promise<RegistryEntry[]> {
  const out: RegistryEntry[] = [];
  let tabs: chrome.tabs.Tab[];
  try {
    tabs = await chrome.tabs.query({});
  } catch {
    return out;
  }
  await Promise.all(
    tabs.map(async (t) => {
      if (t.id == null || t.windowId == null) return;
      try {
        const r = (await chrome.tabs.sendMessage(t.id, { ks: 'whoami' })) as WhoamiResponse;
        if (r?.supported) out.push({ tabId: t.id, windowId: t.windowId, origin: r.origin });
      } catch {
        /* restricted / no content script */
      }
    }),
  );
  return out;
}

async function focusAndPick(tabId: number, windowId: number): Promise<boolean> {
  try {
    await chrome.tabs.update(tabId, { active: true });
    await chrome.windows.update(windowId, { focused: true });
    await chrome.tabs.sendMessage(tabId, { ks: 'pick' } satisfies SwToContent);
    return true;
  } catch {
    return false;
  }
}
