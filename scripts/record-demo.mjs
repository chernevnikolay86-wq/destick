// Records an INSTRUCTIONAL before→click→after demo of the loaded extension.
// Playwright headless renders only the page (not the real Chrome toolbar), so we
// paint a faithful faux toolbar with the REAL Destick icon + an animated cursor
// that clicks it + a live badge count — so viewers see HOW to use it, not just the
// effect. The toggle it fires is the exact same message the real icon/shortcut send.
// Output: raw .webm in marketing/assets/demo/ (convert to mp4/gif with ffmpeg).
import { chromium } from '@playwright/test';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { extname, join, normalize, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const distPath = join(root, 'dist');
const fixturesDir = join(root, 'src', 'fixtures');
const outDir = join(root, 'marketing', 'assets', 'demo');

const iconB64 = readFileSync(join(distPath, 'icons', 'icon48.png')).toString('base64');
const iconUri = `data:image/png;base64,${iconB64}`;
const cursorUri =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    "<svg xmlns='http://www.w3.org/2000/svg' width='30' height='30' viewBox='0 0 28 28'><path d='M4 2 L4 24 L10.5 17.5 L14.5 26 L18 24.2 L14 16 L23 16 Z' fill='black' stroke='white' stroke-width='1.6' stroke-linejoin='round'/></svg>",
  );

const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript' };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

function startServer() {
  return new Promise((resolve) => {
    const server = createServer(async (req, res) => {
      try {
        const p = decodeURIComponent((req.url || '/').split('?')[0]);
        const rel = normalize(p).replace(/^(\.\.[/\\])+/, '');
        const body = await readFile(join(fixturesDir, rel === '/' ? 'demo-combined.html' : rel));
        res.setHeader('content-type', MIME[extname(rel)] ?? 'application/octet-stream');
        res.end(body);
      } catch {
        res.statusCode = 404;
        res.end('nf');
      }
    });
    server.listen(0, '127.0.0.1', () => resolve({ server, base: `http://127.0.0.1:${server.address().port}` }));
  });
}

// Paint faux browser chrome + cursor. All nodes carry data-ks-ui so the extension ignores them.
async function paintChrome(page, iconUri, cursorUri) {
  await page.evaluate(
    ([icon, cursor]) => {
      const ui = (el) => {
        el.setAttribute('data-ks-ui', '1');
        return el;
      };
      const bar = ui(document.createElement('div'));
      bar.id = '__kschrome';
      bar.style.cssText =
        'position:fixed;top:0;left:0;right:0;height:46px;z-index:2147483646;background:#dee1e6;' +
        'border-bottom:1px solid #c4c7cc;display:flex;align-items:center;gap:10px;padding:0 12px;' +
        'font:13px system-ui,-apple-system,sans-serif;color:#3c4043;box-sizing:border-box';
      bar.innerHTML =
        "<span style='font-size:16px;color:#5f6368'>&#8592; &#8594; &#8635;</span>" +
        "<div style='flex:1;height:28px;background:#fff;border-radius:14px;display:flex;align-items:center;" +
        "padding:0 14px;color:#5f6368;font-size:13px'>&#128274; thedailyscroll.com/sticky-junk</div>" +
        "<span style='font-size:17px;color:#5f6368'>&#129513;</span>";
      const btn = ui(document.createElement('div'));
      btn.id = '__ksbtn';
      btn.style.cssText =
        'position:relative;width:34px;height:34px;border-radius:9px;background:#fff;border:1px solid #d2d5da;' +
        'display:flex;align-items:center;justify-content:center;transition:transform .12s,box-shadow .12s';
      btn.innerHTML =
        `<img src='${icon}' width='22' height='22' alt='Destick' style='display:block'/>` +
        "<span id='__ksbadge' style='position:absolute;bottom:-4px;right:-5px;min-width:15px;height:15px;" +
        "background:#6d5ef3;color:#fff;border-radius:8px;font:700 10px system-ui;display:none;" +
        "align-items:center;justify-content:center;padding:0 3px;border:1.5px solid #dee1e6'></span>";
      bar.appendChild(btn);
      document.documentElement.appendChild(bar);

      const cur = ui(document.createElement('div'));
      cur.id = '__kscursor';
      cur.style.cssText =
        `position:fixed;left:620px;top:440px;width:30px;height:30px;z-index:2147483647;` +
        `background:url("${cursor}") no-repeat;pointer-events:none;` +
        'transition:left .85s cubic-bezier(.3,.1,.2,1),top .85s cubic-bezier(.3,.1,.2,1),transform .12s';
      document.documentElement.appendChild(cur);
    },
    [iconUri, cursorUri],
  );
}

async function moveCursorToButton(page) {
  const target = await page.evaluate(() => {
    const r = document.getElementById('__ksbtn').getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  });
  await page.evaluate(({ x, y }) => {
    const c = document.getElementById('__kscursor');
    c.style.left = x - 6 + 'px';
    c.style.top = y - 4 + 'px';
  }, target);
  await wait(900);
}

async function clickPulse(page) {
  await page.evaluate(() => {
    const c = document.getElementById('__kscursor');
    const b = document.getElementById('__ksbtn');
    c.style.transform = 'scale(.8)';
    b.style.transform = 'scale(1.14)';
    b.style.boxShadow = '0 0 0 6px rgba(109,94,243,.35)';
    setTimeout(() => {
      c.style.transform = 'scale(1)';
      b.style.transform = 'scale(1)';
      b.style.boxShadow = 'none';
    }, 180);
  });
  await wait(220);
}

async function setBadge(page, text) {
  await page.evaluate((t) => {
    const el = document.getElementById('__ksbadge');
    if (!el) return;
    if (t == null) {
      el.style.display = 'none';
    } else {
      el.textContent = String(t);
      el.style.display = 'flex';
    }
  }, text);
}

async function caption(page, text) {
  await page.evaluate((t) => {
    let c = document.getElementById('__kscap');
    if (!c) {
      c = document.createElement('div');
      c.id = '__kscap';
      c.setAttribute('data-ks-ui', '1');
      Object.assign(c.style, {
        position: 'fixed', left: '50%', bottom: '32px', transform: 'translateX(-50%)',
        zIndex: '2147483647', background: 'rgba(11,18,32,.96)', color: '#fff',
        font: '600 19px system-ui, sans-serif', padding: '13px 22px', borderRadius: '999px',
        boxShadow: '0 12px 34px rgba(0,0,0,.45)', pointerEvents: 'none', maxWidth: '92vw', textAlign: 'center',
      });
      document.documentElement.appendChild(c);
    }
    c.textContent = t;
  }, text);
}

async function toggle(sw) {
  await sw.evaluate(async () => {
    const t = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    const id = t[0]?.id;
    if (id != null) await chrome.tabs.sendMessage(id, { ks: 'toggle' });
  });
}
async function getCount(sw) {
  return sw.evaluate(async () => {
    const t = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    const id = t[0]?.id;
    if (id == null) return 0;
    const s = await chrome.tabs.sendMessage(id, { ks: 'getState' });
    return s?.count ?? 0;
  });
}

const { server, base } = await startServer();
await mkdir(outDir, { recursive: true });

const context = await chromium.launchPersistentContext('', {
  channel: 'chromium',
  headless: true,
  viewport: { width: 1280, height: 800 },
  recordVideo: { dir: outDir, size: { width: 1280, height: 800 } },
  args: [`--disable-extensions-except=${distPath}`, `--load-extension=${distPath}`],
});

let [sw] = context.serviceWorkers();
if (!sw) sw = await context.waitForEvent('serviceworker');

const page = context.pages()[0] ?? (await context.newPage());
const video = page.video();

await page.goto(`${base}/demo-combined.html`);
await page.waitForLoadState('domcontentloaded');
await paintChrome(page, iconUri, cursorUri);
await wait(500);

// 1) the problem
await caption(page, 'A page buried in sticky junk — and the scroll is locked 🔒');
await wait(2000);

// 2) show the mechanic: move to the Destick icon
await caption(page, 'Click the Destick icon in your toolbar ↑  (or Alt+Shift+X)');
await moveCursorToButton(page);
await wait(500);

// 3) click → clean, badge shows how many were hidden
await clickPulse(page);
await toggle(sw);
await wait(500);
const count = await getCount(sw);
await setBadge(page, count);
// move the cursor off the icon so the badge count is visible
await page.evaluate(() => {
  const c = document.getElementById('__kscursor');
  c.style.left = '900px';
  c.style.top = '300px';
});
await caption(page, `One click — ${count} bits of junk gone ✨`);
await wait(1200);

// 4) scroll freely
await caption(page, 'And scrolling works again.');
await page.evaluate(() => window.scrollBy({ top: 900, behavior: 'smooth' }));
await wait(1500);
await page.evaluate(() => window.scrollBy({ top: 900, behavior: 'smooth' }));
await wait(1500);
await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
await wait(1200);

// 5) click again → undo (reversible)
await caption(page, 'Click again → everything’s back. Nothing is permanent.');
await moveCursorToButton(page);
await clickPulse(page);
await toggle(sw);
await setBadge(page, null);
await wait(1800);

// 6) close
await caption(page, 'Destick — free · open source · 100% local');
await wait(1800);

const videoPath = await video.path();
await context.close();
await server.close();
console.log('RAW_VIDEO=' + videoPath);
