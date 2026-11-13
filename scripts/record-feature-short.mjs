// Records ONE vertical 9:16 Short for Destick's new superpower: "clean once → the
// WHOLE site stays clean" + the new ON/OFF toolbar state. Loads the real dist/ as an
// unpacked extension and fires the same {ks:'toggle'} the icon sends; the sticky
// persistence is REAL (autoClean per origin) — navigating to a 2nd/3rd article on the
// same local site loads already-clean because the extension remembers the origin.
// Faux Chrome toolbar + real icon + ON/OFF badge + animated cursor + captions are
// painted on top (all data-ks-ui so the engine ignores them).
// Output: marketing/assets/shorts/raw/S9-whole-site.webm + marketing/assets/shorts/destick-S9-whole-site.mp4
import { chromium } from '@playwright/test';
import { createServer } from 'node:http';
import { mkdir, rename, readdir } from 'node:fs/promises';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const distPath = join(root, 'dist');
const outDir = join(root, 'marketing', 'assets', 'shorts');
const rawDir = join(outDir, 'raw');
const W = 1080, H = 1920, TOOLBAR = 64;

const iconUri = `data:image/png;base64,${readFileSync(join(distPath, 'icons', 'icon48.png')).toString('base64')}`;
const cursorUri = 'data:image/svg+xml;utf8,' + encodeURIComponent(
  "<svg xmlns='http://www.w3.org/2000/svg' width='46' height='46' viewBox='0 0 28 28'><path d='M4 2 L4 24 L10.5 17.5 L14.5 26 L18 24.2 L14 16 L23 16 Z' fill='black' stroke='white' stroke-width='1.4' stroke-linejoin='round'/></svg>");
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// ---- three believable articles on ONE site, each with the SAME junk (so "stays clean" reads) ----
const CSS = `
  *{box-sizing:border-box} html,body{margin:0}
  body{font:20px/1.72 Georgia,'Times New Roman',serif;color:#15171c;background:#fff;padding-top:${TOOLBAR}px}
  .site{position:sticky;top:${TOOLBAR}px;z-index:60;background:#0b1220;color:#fff;padding:18px 30px;
    display:flex;justify-content:space-between;align-items:center;font-family:system-ui,sans-serif}
  .site .logo{font-weight:800;font-size:24px} .site nav span{margin-left:20px;opacity:.8;font-size:17px}
  article{max-width:860px;margin:0 auto;padding:40px 44px 220px}
  h1{font-size:50px;line-height:1.12;margin:0 0 14px;letter-spacing:-.6px}
  .byline{color:#6b7280;font-family:system-ui,sans-serif;font-size:18px;margin-bottom:30px}
  p{margin:0 0 26px} .lead{font-size:24px;color:#2b2e35} .tall{height:1600px;background:linear-gradient(#fff,#eef1f8)}
  #chat{position:fixed;right:26px;bottom:120px;z-index:2147482000;width:76px;height:76px;border-radius:50%;
    background:#0a7d55;color:#fff;display:flex;align-items:center;justify-content:center;font-size:32px;box-shadow:0 14px 34px rgba(0,0,0,.3)}
  #cookie{position:fixed;left:0;right:0;bottom:0;z-index:9999;background:#0f1115;color:#fff;padding:22px 30px;
    display:flex;justify-content:space-between;align-items:center;gap:20px;font-family:system-ui,sans-serif;font-size:19px}
  #cookie .go{background:#6d5ef3;color:#fff;border:0;border-radius:9px;padding:14px 22px;font:inherit;font-weight:600}
`;
const PARAS = [
  `You came here to read one thing. The words are in there somewhere, under the bar that follows you and the box in the corner.`,
  `A page used to be a page. Now the article is a thin column wrapped in coats of interruption — each "just one tap" to close.`,
  `Below the fold the writing keeps going, the way it was meant to. Keep scrolling. There is nothing standing in front of it now.`,
];
const art = (logo, head, byline, lead) =>
  `<header class="site"><span class="logo">${logo}</span><nav><span>World</span><span>Tech</span><span>Culture</span><span>Subscribe</span></nav></header>` +
  `<article><h1>${head}</h1><div class="byline">${byline}</div><p class="lead">${lead}</p>` +
  PARAS.map((p) => `<p>${p}</p>`).join('') + `<div class="tall"></div></article>` +
  `<div id="chat">💬</div><div id="cookie"><span>We and <b>1,412 partners</b> store cookies on your device.</span><button class="go">Accept all</button></div>`;
const page$ = (title, body) =>
  `<!doctype html><html lang="en"><head><meta charset="utf-8"/><title>${title}</title><style>${CSS}</style></head><body>${body}</body></html>`;

const PAGES = {
  '/stays-1.html': page$('The Daily Orbit — one', art('THE DAILY ORBIT', 'The one-click web', 'By A. Reader · 6 min read', 'Somewhere under the banners there is still a plain page waiting to be read.')),
  '/stays-2.html': page$('The Daily Orbit — two', art('THE DAILY ORBIT', 'A calmer way to read', 'By A. Reader · 5 min read', 'The same site, a different story — and not a single wall in sight this time.')),
  '/stays-3.html': page$('The Daily Orbit — three', art('THE DAILY ORBIT', 'It just works now', 'By A. Reader · 4 min read', 'Three articles deep and the page still arrives exactly as it should: clean.')),
};

function startServer() {
  return new Promise((resolve) => {
    const server = createServer((req, res) => {
      const body = PAGES[(req.url || '/').split('?')[0]];
      if (body == null) { res.statusCode = 404; res.end('nf'); return; }
      res.setHeader('content-type', 'text/html; charset=utf-8'); res.end(body);
    });
    server.listen(0, '127.0.0.1', () => resolve({ server, base: `http://127.0.0.1:${server.address().port}` }));
  });
}

async function paintChrome(page, url) {
  await page.evaluate(([icon, cursor, url, toolbar]) => {
    const ui = (el) => { el.setAttribute('data-ks-ui', '1'); return el; };
    const bar = ui(document.createElement('div')); bar.id = '__kschrome';
    bar.style.cssText = `position:fixed;top:0;left:0;right:0;height:${toolbar}px;z-index:2147483646;background:#dee1e6;border-bottom:1px solid #bfc3c9;display:flex;align-items:center;gap:14px;padding:0 18px;font:17px system-ui,sans-serif;color:#3c4043;box-sizing:border-box`;
    bar.innerHTML = "<span style='font-size:22px;color:#5f6368'>&#8592; &#8594; &#8635;</span>" +
      `<div style='flex:1;height:40px;background:#fff;border-radius:20px;display:flex;align-items:center;padding:0 20px;color:#5f6368;font-size:18px'>&#128274; ${url}</div>`;
    const btn = ui(document.createElement('div')); btn.id = '__ksbtn';
    btn.style.cssText = 'position:relative;width:46px;height:46px;border-radius:12px;background:#fff;border:1px solid #cfd2d8;display:flex;align-items:center;justify-content:center;transition:transform .12s,box-shadow .12s;flex:none';
    btn.innerHTML = `<img src='${icon}' width='30' height='30' alt='Destick' style='display:block'/>` +
      "<span id='__ksbadge' style='position:absolute;bottom:-7px;right:-9px;height:21px;min-width:21px;background:#6b7280;color:#fff;border-radius:7px;font:800 12px system-ui;display:none;align-items:center;justify-content:center;padding:0 5px;border:2px solid #dee1e6;letter-spacing:.3px'></span>";
    bar.appendChild(btn); document.documentElement.appendChild(bar);
    const cur = ui(document.createElement('div')); cur.id = '__kscursor';
    cur.style.cssText = `position:fixed;left:540px;top:900px;width:46px;height:46px;z-index:2147483647;background:url("${cursor}") no-repeat;pointer-events:none;transition:left .8s cubic-bezier(.3,.1,.2,1),top .8s cubic-bezier(.3,.1,.2,1),transform .12s`;
    document.documentElement.appendChild(cur);
  }, [iconUri, cursorUri, url, TOOLBAR]);
}
async function moveCursor(page, x, y) {
  await page.evaluate(({ x, y }) => { const c = document.getElementById('__kscursor'); if (c) { c.style.left = x - 8 + 'px'; c.style.top = y - 4 + 'px'; } }, { x, y });
}
async function cursorToButton(page) {
  const t = await page.evaluate(() => { const r = document.getElementById('__ksbtn').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
  await moveCursor(page, t.x, t.y); await wait(850);
}
async function clickPulse(page) {
  await page.evaluate(() => {
    const c = document.getElementById('__kscursor'), b = document.getElementById('__ksbtn');
    if (c) c.style.transform = 'scale(.82)';
    if (b) { b.style.transform = 'scale(1.16)'; b.style.boxShadow = '0 0 0 8px rgba(109,94,243,.35)'; }
    setTimeout(() => { if (c) c.style.transform = 'scale(1)'; if (b) { b.style.transform = 'scale(1)'; b.style.boxShadow = 'none'; } }, 180);
  });
  await wait(230);
}
// New: badge shows the STATE WORD with the real new colors (green ON / grey OFF).
async function setBadgeState(page, state) {
  await page.evaluate((s) => {
    const el = document.getElementById('__ksbadge'); if (!el) return;
    if (s == null) { el.style.display = 'none'; return; }
    el.textContent = s === 'on' ? 'ON' : 'OFF';
    el.style.background = s === 'on' ? '#16a34a' : '#6b7280';
    el.style.display = 'flex';
  }, state);
}
async function caption(page, text, kind = 'status') {
  await page.evaluate(({ t, kind }) => {
    let c = document.getElementById('__kscap');
    if (!c) {
      c = document.createElement('div'); c.id = '__kscap'; c.setAttribute('data-ks-ui', '1');
      Object.assign(c.style, { position: 'fixed', left: '50%', top: '150px', transform: 'translateX(-50%)', zIndex: '2147483647', background: 'rgba(11,18,32,.96)', color: '#fff', font: '800 36px/1.25 system-ui, sans-serif', padding: '22px 30px', borderRadius: '22px', boxShadow: '0 18px 50px rgba(0,0,0,.5)', pointerEvents: 'none', width: '900px', maxWidth: '92vw', textAlign: 'center', letterSpacing: '-.3px' });
      document.documentElement.appendChild(c);
    }
    c.style.background = kind === 'cta' ? 'rgba(22,163,74,.97)' : 'rgba(11,18,32,.96)';
    c.textContent = t;
  }, { t: text, kind });
}
const toggle = (sw) => sw.evaluate(async () => { const t = await chrome.tabs.query({ active: true, lastFocusedWindow: true }); const id = t[0]?.id; if (id != null) await chrome.tabs.sendMessage(id, { ks: 'toggle' }); });
const getState = (sw) => sw.evaluate(async () => { const t = await chrome.tabs.query({ active: true, lastFocusedWindow: true }); const id = t[0]?.id; if (id == null) return { state: 'off', count: 0 }; return (await chrome.tabs.sendMessage(id, { ks: 'getState' })) ?? { state: 'off', count: 0 }; });
const scrollDown = (page, px) => page.evaluate((p) => window.scrollBy({ top: p, behavior: 'smooth' }), px);

async function freshPaint(page, url, badge, cap, capKind) {
  await page.waitForLoadState('domcontentloaded');
  await paintChrome(page, url);
  await setBadgeState(page, badge);
  if (cap) await caption(page, cap, capKind);
}

async function run(context, sw, base) {
  const page = context.pages()[0] ?? (await context.newPage());
  const video = page.video();

  // ---- Page 1: junk visible, badge OFF ----
  await page.goto(`${base}/stays-1.html`);
  await freshPaint(page, 'dailyorbit.com/the-one-click-web', 'off', null);
  await wait(400);
  if ((await getState(sw)).state === 'on') { await toggle(sw); await wait(500); await setBadgeState(page, 'off'); }
  await caption(page, 'Clean one page… 🧹', 'hook'); await wait(2300);
  await caption(page, 'One click — junk gone, badge turns ON.', 'status'); await wait(1500);

  // ---- The click ----
  await cursorToButton(page); await clickPulse(page); await toggle(sw); await wait(600);
  await setBadgeState(page, 'on'); await moveCursor(page, 760, 980);
  await caption(page, 'Clean. And watch the WHOLE site…', 'status'); await wait(2000);

  // ---- Page 2: same site, no click → auto-clean (sticky per site) ----
  await page.goto(`${base}/stays-2.html`);
  await freshPaint(page, 'dailyorbit.com/a-calmer-way-to-read', 'on', 'New article — already clean. Zero clicks.', 'status');
  await wait(2500);
  await scrollDown(page, 1100); await wait(1500);

  // ---- Page 3: still clean ----
  await page.goto(`${base}/stays-3.html`);
  await freshPaint(page, 'dailyorbit.com/it-just-works-now', 'on', 'And the next one. It remembers the site.', 'status');
  await wait(2500);

  // ---- Turn it OFF to show the toggle/state is honest ----
  await caption(page, 'Click again → everything’s back. Badge OFF.', 'status');
  await cursorToButton(page); await clickPulse(page); await toggle(sw); await wait(600);
  await setBadgeState(page, 'off'); await moveCursor(page, 760, 980); await wait(1800);

  // ---- CTA ----
  await caption(page, 'Clean once. Stays clean. — Destick', 'cta'); await wait(2200);

  const raw = await video.path();
  await page.close();
  return raw;
}

function resolveFfmpeg() {
  if (spawnSync('ffmpeg', ['-version']).status === 0) return 'ffmpeg';
  const cache = join(homedir(), 'Library', 'Caches', 'ms-playwright');
  if (existsSync(cache)) for (const d of readdirSync(cache).filter((n) => n.startsWith('ffmpeg')).sort().reverse())
    for (const cand of ['ffmpeg', 'ffmpeg-mac']) { const p = join(cache, d, cand); if (existsSync(p)) return p; }
  return null;
}
function toMp4(ff, inFile, outFile) {
  return new Promise((resolve, reject) => {
    const p = spawn(ff, ['-y', '-i', inFile, '-vf', `scale=${W}:${H}:force_original_aspect_ratio=decrease,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2:white,format=yuv420p`, '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-movflags', '+faststart', '-an', outFile], { stdio: 'ignore' });
    p.on('exit', (c) => (c === 0 ? resolve() : reject(new Error('ffmpeg exit ' + c)))); p.on('error', reject);
  });
}

// ---- driver ----
const { server, base } = await startServer();
await mkdir(rawDir, { recursive: true });
const context = await chromium.launchPersistentContext('', {
  channel: 'chromium', headless: true, viewport: { width: W, height: H },
  recordVideo: { dir: rawDir, size: { width: W, height: H } },
  args: [`--disable-extensions-except=${distPath}`, `--load-extension=${distPath}`],
});
let [sw] = context.serviceWorkers(); if (!sw) sw = await context.waitForEvent('serviceworker');
let raw; try { raw = await run(context, sw, base); } finally { await context.close(); }
const webm = join(rawDir, 'S9-whole-site.webm'); await rename(raw, webm);
await server.close();

const ff = resolveFfmpeg();
if (!ff) { console.log('NO_FFMPEG — raw webm at', webm); }
else { const mp4 = join(outDir, 'destick-S9-whole-site.mp4'); await toMp4(ff, webm, mp4); console.log('mp4 →', mp4); }
console.log('DONE');
