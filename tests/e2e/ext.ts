// E2E harness: launch Chromium with the unpacked extension, serve fixtures over
// http (content script matches http(s) only — not file://), and drive clean/undo
// through the REAL service-worker → content-script message path (AC-A8 S5: the
// same message the toolbar icon / shortcut send).
import { test as base, chromium, type BrowserContext, type Page, type Worker } from '@playwright/test';
import { createServer, type Server } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const distPath = join(here, '..', '..', 'dist');
const fixturesDir = join(here, '..', '..', 'src', 'fixtures');

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
};

function startFixtureServer(): Promise<{ server: Server; baseURL: string }> {
  return new Promise((resolve) => {
    const server = createServer(async (req, res) => {
      try {
        const urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
        const rel = normalize(urlPath).replace(/^(\.\.[/\\])+/, '');
        const file = join(fixturesDir, rel === '/' ? 'clean-page.html' : rel);
        const body = await readFile(file);
        res.setHeader('content-type', MIME[extname(file)] ?? 'application/octet-stream');
        res.end(body);
      } catch {
        res.statusCode = 404;
        res.end('not found');
      }
    });
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      const port = typeof addr === 'object' && addr ? addr.port : 0;
      resolve({ server, baseURL: `http://127.0.0.1:${port}` });
    });
  });
}

export const test = base.extend<{
  context: BrowserContext;
  sw: Worker;
  baseURL: string;
}>({
  // eslint-disable-next-line no-empty-pattern
  context: async ({}, use) => {
    const context = await chromium.launchPersistentContext('', {
      channel: 'chromium', // new headless shell supports MV3 extensions
      headless: true,
      args: [`--disable-extensions-except=${distPath}`, `--load-extension=${distPath}`],
    });
    await use(context);
    await context.close();
  },
  sw: async ({ context }, use) => {
    let [sw] = context.serviceWorkers();
    if (!sw) sw = await context.waitForEvent('serviceworker');
    await use(sw);
  },
  baseURL: async ({}, use) => {
    const { server, baseURL } = await startFixtureServer();
    await use(baseURL);
    await new Promise<void>((r) => server.close(() => r()));
  },
});

export const expect = test.expect;

export interface Status {
  supported: boolean;
  state: 'off' | 'cleaned';
  count: number;
  capped: boolean;
}

// The real product never matches tabs by URL (no `tabs` permission → tab.url is
// empty). It acts on the active tab (commands) or the clicked tab (action). The
// harness mirrors that: target the active tab, exactly like the shortcut route.
async function activeTabId(sw: Worker): Promise<number> {
  const id = (await sw.evaluate(async () => {
    const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    return tabs[0]?.id ?? null;
  })) as number | null;
  if (id == null) throw new Error('no active tab');
  return id;
}

/** Send the toggle message the icon/shortcut route send; resolves with status. */
export async function toggle(sw: Worker, page: Page): Promise<Status> {
  await page.bringToFront();
  const tabId = await activeTabId(sw);
  return (await sw.evaluate(async (id) => {
    return (await chrome.tabs.sendMessage(id, { ks: 'toggle' })) as Status;
  }, tabId)) as Status;
}

export async function sendPick(sw: Worker, page: Page): Promise<void> {
  await page.bringToFront();
  const tabId = await activeTabId(sw);
  await sw.evaluate(async (id) => {
    await chrome.tabs.sendMessage(id, { ks: 'pick' });
  }, tabId);
}

export async function getState(sw: Worker, page: Page): Promise<Status> {
  await page.bringToFront();
  const tabId = await activeTabId(sw);
  return (await sw.evaluate(async (id) => {
    return (await chrome.tabs.sendMessage(id, { ks: 'getState' })) as Status;
  }, tabId)) as Status;
}

/** Open a fixture and wait for the content script to be present. */
export async function openFixture(page: Page, baseURL: string, name: string): Promise<void> {
  await page.goto(`${baseURL}/${name}`);
  await page.waitForLoadState('domcontentloaded');
  await page.bringToFront();
}

/** Open a fixture in a brand-new tab (for multi-tab cases). */
export async function openFixtureInNewTab(
  context: BrowserContext,
  baseURL: string,
  name: string,
): Promise<Page> {
  const p = await context.newPage();
  await openFixture(p, baseURL, name);
  return p;
}

/** The loaded extension's id, parsed from the service-worker URL. */
export function extId(sw: Worker): string {
  const m = /^chrome-extension:\/\/([a-p]+)\//.exec(sw.url());
  if (!m) throw new Error(`cannot parse extension id from ${sw.url()}`);
  return m[1];
}

/** Seed durable per-origin prefs BEFORE navigating (storage-only; no `.sync`). */
export async function seedPrefs(
  sw: Worker,
  origin: string,
  prefs: { autoClean: boolean; pickedRules: unknown[]; preHideSelectors?: string[] },
): Promise<void> {
  await sw.evaluate(
    async ({ origin, prefs }) => {
      await chrome.storage.local.set({ [`site:${origin}`]: prefs });
    },
    { origin, prefs },
  );
}

/**
 * Route a toggle to a specific tab exactly as the service worker's sendToTab does
 * (fire-and-forget, swallow the "no receiver" rejection). Returns whether a content
 * script actually received it — false for an ineligible / script-less tab.
 */
export async function routeToggle(sw: Worker, tabId: number): Promise<boolean> {
  return (await sw.evaluate(async (id) => {
    try {
      await chrome.tabs.sendMessage(id, { ks: 'toggle' });
      return true;
    } catch {
      return false;
    }
  }, tabId)) as boolean;
}

/** Synchronous-pass timings from the active tab's engine (AC-A9). */
export async function getTimings(
  sw: Worker,
  page: Page,
): Promise<{ lastCleanMs: number; reconcile: number[] }> {
  await page.bringToFront();
  const tabId = await activeTabId(sw);
  return (await sw.evaluate(async (id) => {
    return (await chrome.tabs.sendMessage(id, { ks: 'timings' })) as {
      lastCleanMs: number;
      reconcile: number[];
    };
  }, tabId)) as { lastCleanMs: number; reconcile: number[] };
}

/** tabId of the active tab (for routeToggle on a specific page). */
export async function tabIdOf(sw: Worker, page: Page): Promise<number> {
  await page.bringToFront();
  return activeTabId(sw);
}

/** Read durable per-origin prefs straight from chrome.storage.local (what a toggle persists). */
export async function readPrefs(
  sw: Worker,
  origin: string,
): Promise<{ autoClean: boolean; pickedRules: unknown[] } | undefined> {
  return (await sw.evaluate(async (o) => {
    const got = await chrome.storage.local.get(`site:${o}`);
    return got[`site:${o}`];
  }, origin)) as { autoClean: boolean; pickedRules: unknown[] } | undefined;
}

/** Read the toolbar action's per-tab visualization (badge text/color + dynamic title). */
export async function readAction(
  sw: Worker,
  tabId: number,
): Promise<{ text: string; title: string; color: number[] }> {
  return (await sw.evaluate(async (id) => ({
    text: await chrome.action.getBadgeText({ tabId: id }),
    title: await chrome.action.getTitle({ tabId: id }),
    color: (await chrome.action.getBadgeBackgroundColor({ tabId: id })) as unknown as number[],
  }), tabId)) as { text: string; title: string; color: number[] };
}

/** Open the REAL Options page and wait for its picker chooser to populate. */
export async function openOptions(context: BrowserContext, sw: Worker): Promise<Page> {
  const opt = await context.newPage();
  await opt.goto(`chrome-extension://${extId(sw)}/options.html`);
  await opt.waitForLoadState('domcontentloaded');
  await opt.bringToFront();
  return opt;
}

/** Origins listed in the Options picker chooser (reconstruction-on-demand result). */
export async function chooserOrigins(opt: Page): Promise<string[]> {
  return opt.evaluate(() => {
    const sel = document.getElementById('pickTab') as HTMLSelectElement | null;
    if (!sel) return [];
    return [...sel.options].map((o) => o.value).filter(Boolean).map((v) => {
      const o = [...sel.options].find((x) => x.value === v)!;
      return o.textContent ?? '';
    });
  });
}
