// Records the 8 Destick Shorts (9:16, 1080x1920) — one per "annoying website" scene
// from marketing/assets/VIDEO-SCRIPTS.md (S1–S8). Each scene is a self-contained,
// believable page generated here (so src/fixtures stays test-only) with ONE dominant
// annoyance, so "one click → gone" reads crisp. Playwright loads the real dist/ as an
// unpacked extension and fires the exact same messages the real icon/shortcut send
// ({ks:'toggle'} / {ks:'pick'}); a faux Chrome toolbar with the REAL icon + an animated
// cursor + captions is painted on top (all data-ks-ui, so the extension ignores it).
// Output: marketing/assets/shorts/raw/*.webm  +  marketing/assets/shorts/*.mp4
import { chromium } from '@playwright/test';
import { createServer } from 'node:http';
import { mkdir, rename, readdir } from 'node:fs/promises';
import { readFileSync, existsSync } from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const distPath = join(root, 'dist');
const outDir = join(root, 'marketing', 'assets', 'shorts');
const rawDir = join(outDir, 'raw');

const W = 1080, H = 1920; // vertical 9:16
const TOOLBAR = 64;

const iconUri = `data:image/png;base64,${readFileSync(join(distPath, 'icons', 'icon48.png')).toString('base64')}`;
const cursorUri =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    "<svg xmlns='http://www.w3.org/2000/svg' width='46' height='46' viewBox='0 0 28 28'><path d='M4 2 L4 24 L10.5 17.5 L14.5 26 L18 24.2 L14 16 L23 16 Z' fill='black' stroke='white' stroke-width='1.4' stroke-linejoin='round'/></svg>",
  );
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------- scene markup
const BODY_CSS = `
  * { box-sizing: border-box; }
  html, body { margin: 0; }
  body { font: 20px/1.72 Georgia, 'Times New Roman', serif; color: #15171c; background: #fff; padding-top: ${TOOLBAR}px; }
  body.locked { overflow: hidden; }
  .site { position: sticky; top: ${TOOLBAR}px; z-index: 60; background: #0b1220; color: #fff;
    padding: 18px 30px; display: flex; justify-content: space-between; align-items: center;
    font-family: system-ui, -apple-system, sans-serif; }
  .site .logo { font-weight: 800; letter-spacing: .4px; font-size: 24px; }
  .site nav span { margin-left: 20px; opacity: .8; font-size: 17px; }
  article { max-width: 860px; margin: 0 auto; padding: 44px 44px 220px; }
  h1 { font-size: 52px; line-height: 1.12; margin: 0 0 14px; letter-spacing: -.6px; }
  .byline { color: #6b7280; font-family: system-ui, sans-serif; font-size: 18px; margin-bottom: 34px; }
  p { margin: 0 0 28px; }
  .lead { font-size: 25px; color: #2b2e35; }
  .tall { height: 2200px; background: linear-gradient(#fff, #eef1f8); }
`;

const PARAS = [
  `You came here to read one thing. The words are in there somewhere, under the layers that load after them: the bar that follows you down, the box that wants your email, the little waving corner.`,
  `It wasn't always like this. A page used to be a page. Now the article is a thin column wrapped in three coats of interruption, each one "just one tap" to close — and none of them staying closed.`,
  `What if a single click could strip every bit of it away and hand the page back exactly as it should have arrived: calm, readable, yours — and hand the clutter back, too, the moment you change your mind?`,
  `Below the fold the writing keeps going, line after line, the way it was meant to. Keep scrolling. There is nothing standing in front of it now.`,
  `And still more text, because a real demo shows real reading, not a jump cut. The column glides. The header is gone. The bars are gone. The page simply works.`,
];
const article = (logo, nav, headline, byline, lead, extraTop = '', extraBody = '') => `
  <header class="site"><span class="logo">${logo}</span><nav>${nav.map((n) => `<span>${n}</span>`).join('')}</nav></header>
  ${extraTop}
  <article>
    <h1>${headline}</h1>
    <div class="byline">${byline}</div>
    <p class="lead">${lead}</p>
    ${extraBody}
    ${PARAS.map((p) => `<p>${p}</p>`).join('')}
    <div class="tall"></div>
  </article>`;

const page$ = (title, body, css = '') =>
  `<!doctype html><html lang="en"><head><meta charset="utf-8"/><title>${title}</title>` +
  `<style>${BODY_CSS}${css}</style></head><body>${body}</body></html>`;

// ------------------------------------------------------------------- 8 scenes
const SCENES = [
  {
    id: 'S1-cookie-wall',
    url: 'morningdispatch.com/the-quiet-web',
    action: 'toggle',
    hook: 'POV: you just want to read one thing 🍪',
    pain: 'A cookie wall sitting on top of the thing you came for.',
    html: page$(
      'The Morning Dispatch',
      article('THE MORNING DISPATCH', ['World', 'Tech', 'Culture', 'Subscribe'],
        'The quiet web is still out there', 'By A. Reader · 6 min read',
        'Somewhere under the consent banners and the partner lists, there is still a plain page waiting to be read.',
        '',
        `<div id="cookie"><span>We and <b>1,412 partners</b> store and access cookies on your device.</span><span class="btns"><button class="ghost">Manage</button><button class="go">Accept all</button></span></div>`),
      `#cookie{position:fixed;left:0;right:0;bottom:0;z-index:9999;background:#0f1115;color:#fff;
        padding:22px 30px;display:flex;justify-content:space-between;align-items:center;gap:20px;
        font-family:system-ui,sans-serif;font-size:19px}
       #cookie .btns{display:flex;gap:12px;flex:none}
       #cookie button{border:0;border-radius:9px;padding:14px 22px;font:inherit;font-weight:600;cursor:pointer}
       #cookie .ghost{background:#2a2d35;color:#fff}
       #cookie .go{background:#6d5ef3;color:#fff}`,
    ),
  },
  {
    id: 'S2-adblock-wall',
    url: 'pixelpost.io/why-the-web-feels-broken',
    action: 'toggle',
    hook: 'This wall. Every. Single. Time. 😤',
    pain: "The page is right there — behind a wall. And it won't scroll.",
    after: "I'm not removing ads — just the wall in front of the page.",
    html: page$(
      'Pixel Post',
      article('PIXEL POST', ['Home', 'Reviews', 'Guides', 'About'],
        'Why the web feels broken', 'By The Editors · 8 min read',
        'A short essay on the slow accumulation of walls, and the one click that takes them down.') +
        `<div id="wall"><div class="card"><div class="x">✕</div><h2>Please disable your ad blocker</h2><p>We noticed you're using an ad blocker. Turn it off to keep reading this article.</p><button>I've disabled it</button></div></div>`,
      `body{overflow:hidden}
       #wall{position:fixed;inset:0;z-index:10000;background:rgba(8,10,22,.93);
         display:flex;align-items:center;justify-content:center;font-family:system-ui,sans-serif}
       #wall .card{background:#fff;color:#15171c;width:560px;max-width:86vw;border-radius:18px;
         padding:44px 40px;text-align:center;box-shadow:0 40px 120px rgba(0,0,0,.5);position:relative}
       #wall .x{position:absolute;top:18px;right:22px;color:#b9bdc7;font-size:22px}
       #wall h2{margin:0 0 12px;font-size:30px}
       #wall p{margin:0 0 26px;color:#5b616e;font-size:19px}
       #wall button{background:#6d5ef3;color:#fff;border:0;border-radius:11px;padding:16px 30px;
         font:inherit;font-weight:700;font-size:19px;cursor:pointer}`,
    ),
  },
  {
    id: 'S3-newsletter',
    url: 'theledger.com/first-principles',
    action: 'toggle',
    hook: "Haven't read a word — and it already wants my email.",
    pain: 'A modal at second zero. Now hunt for the tiny ✕.',
    html: page$(
      'The Ledger',
      article('THE LEDGER', ['Markets', 'Ideas', 'Long reads', 'Join'],
        'First principles, plainly', 'By A. Reader · 5 min read',
        'Start from what is true and build up. But first, apparently, your email address.') +
        `<div id="backdrop"></div><div id="modal"><div class="x">✕</div><h2>Don't miss a thing</h2><p>Join 400,000 readers. One email a week. Unsubscribe anytime.</p><input placeholder="you@example.com"/><button>Subscribe now</button></div>`,
      `body{overflow:hidden}
       #backdrop{position:fixed;inset:0;z-index:1000;background:rgba(5,8,20,.72)}
       #modal{position:fixed;z-index:1001;top:50%;left:50%;transform:translate(-50%,-50%);
         width:520px;max-width:88vw;background:#fff;border-radius:16px;padding:40px;text-align:center;
         font-family:system-ui,sans-serif;box-shadow:0 36px 100px rgba(0,0,0,.5);position:fixed}
       #modal .x{position:absolute;top:16px;right:20px;color:#c3c7d0;font-size:20px}
       #modal h2{margin:0 0 10px;font-size:30px;color:#15171c}
       #modal p{margin:0 0 20px;color:#5b616e;font-size:19px}
       #modal input{width:100%;padding:16px;border:1px solid #dcdfe6;border-radius:10px;font:inherit;font-size:19px;margin-bottom:14px}
       #modal button{width:100%;background:#6d5ef3;color:#fff;border:0;border-radius:10px;padding:16px;font:inherit;font-weight:700;font-size:19px;cursor:pointer}`,
    ),
  },
  {
    id: 'S4-sticky-header',
    url: 'trendline.com/the-long-read',
    action: 'toggle',
    hook: 'Half my screen is a menu that follows me.',
    pain: 'Scroll down… and it just comes with you.',
    html: page$(
      'Trendline',
      article('TRENDLINE', [], 'The long read', 'By A. Reader · 9 min read',
        'An article that would be lovely to read, if you could see more than a sliver of it at a time.',
        `<header class="bighdr">
         <div class="promo">🔥 Black Friday — everything 50% off. Ends tonight. <b>Shop now →</b></div>
         <div class="nav"><span class="logo">TRENDLINE</span><span class="menu">Home · Style · Tech · Travel · Deals · Newsletter · Account</span></div>
         <div class="search">🔎 <input placeholder="Search 10,000 articles…"/> <button>Go</button></div>
       </header>`),
      `.site{display:none}
       .bighdr{position:sticky;top:${TOOLBAR}px;z-index:60;font-family:system-ui,sans-serif;box-shadow:0 14px 30px rgba(0,0,0,.14)}
       .bighdr .promo{background:#6d5ef3;color:#fff;padding:16px 24px;text-align:center;font-size:19px}
       .bighdr .nav{background:#0b1220;color:#fff;padding:22px 30px;display:flex;align-items:center;gap:26px}
       .bighdr .nav .logo{font-weight:800;font-size:26px}
       .bighdr .nav .menu{opacity:.85;font-size:18px}
       .bighdr .search{background:#fff;border-bottom:1px solid #e6e8ee;padding:20px 30px;display:flex;align-items:center;gap:12px;font-size:20px}
       .bighdr .search input{flex:1;padding:14px 16px;border:1px solid #dcdfe6;border-radius:10px;font:inherit;font-size:19px}
       .bighdr .search button{background:#15171c;color:#fff;border:0;border-radius:10px;padding:14px 22px;font:inherit;font-weight:600;cursor:pointer}`,
    ),
  },
  {
    id: 'S5-floating-junk',
    url: 'orbitweekly.com/the-corner-crowd',
    action: 'toggle',
    hook: 'Who invited all of this? 💬',
    pain: 'Chat bubble, share rail, "get the app", back-to-top…',
    html: page$(
      'Orbit Weekly',
      article('ORBIT WEEKLY', ['Space', 'Science', 'Future', 'Subscribe'],
        'The corner crowd', 'By A. Reader · 4 min read',
        'Every corner of the screen has filled up with something floating, blinking, or waving.') +
        `<div id="rail"><a>f</a><a>X</a><a>in</a><a>✉</a></div>
         <div id="chat">💬</div>
         <div id="totop">↑</div>
         <div id="getapp">📱 Get the Orbit app <button>Open</button></div>`,
      `#rail{position:fixed;left:16px;top:46%;transform:translateY(-50%);z-index:600;display:flex;flex-direction:column;gap:12px;font-family:system-ui,sans-serif}
       #rail a{width:52px;height:52px;border-radius:12px;background:#263142;color:#fff;display:flex;align-items:center;justify-content:center;font-size:18px;font-weight:700}
       #chat{position:fixed;right:26px;bottom:120px;z-index:2147482000;width:76px;height:76px;border-radius:50%;background:#0a7d55;color:#fff;display:flex;align-items:center;justify-content:center;font-size:32px;box-shadow:0 14px 34px rgba(0,0,0,.3)}
       #totop{position:fixed;right:30px;bottom:210px;z-index:600;width:60px;height:60px;border-radius:50%;background:#15171c;color:#fff;display:flex;align-items:center;justify-content:center;font-size:26px}
       #getapp{position:fixed;left:50%;bottom:30px;transform:translateX(-50%);z-index:700;background:#0b1220;color:#fff;font-family:system-ui,sans-serif;font-size:19px;padding:16px 22px;border-radius:14px;display:flex;align-items:center;gap:14px;box-shadow:0 16px 40px rgba(0,0,0,.35)}
       #getapp button{background:#6d5ef3;color:#fff;border:0;border-radius:9px;padding:12px 20px;font:inherit;font-weight:700;cursor:pointer}`,
    ),
  },
  {
    id: 'S6-reversible',
    url: 'thedailyscroll.com/have-it-back',
    action: 'reverse',
    hook: 'Most extensions hide the junk. This one GIVES IT BACK.',
    pain: 'Clean when you want it. Back when you want it.',
    html: page$(
      'The Daily Scroll',
      article('THE DAILY SCROLL', ['World', 'Tech', 'Opinion', 'Subscribe'],
        'Have it back', 'By A. Reader · 6 min read',
        'Hiding the clutter is easy. Giving it back — instantly, with no reload — is the part nobody does.') +
        `<div id="chat">💬</div>
         <div id="cookie"><span>We use cookies and 1,412 partners.</span><button class="go">Accept all</button></div>`,
      `#chat{position:fixed;right:26px;bottom:120px;z-index:2147482000;width:76px;height:76px;border-radius:50%;background:#0a7d55;color:#fff;display:flex;align-items:center;justify-content:center;font-size:32px;box-shadow:0 14px 34px rgba(0,0,0,.3)}
       #cookie{position:fixed;left:0;right:0;bottom:0;z-index:9999;background:#0f1115;color:#fff;padding:22px 30px;display:flex;justify-content:space-between;align-items:center;gap:20px;font-family:system-ui,sans-serif;font-size:19px}
       #cookie .go{background:#6d5ef3;color:#fff;border:0;border-radius:9px;padding:14px 22px;font:inherit;font-weight:600;cursor:pointer}`,
    ),
  },
  {
    id: 'S7-privacy',
    url: 'opencipher.dev/no-trackers-here',
    action: 'toggle',
    netmon: true,
    hook: 'A free extension that does NOT spy on you?',
    pain: 'Zero network. Storage-only. MIT. Open source.',
    after: "The code is right there — verify it yourself.",
    html: page$(
      'Open Cipher',
      article('OPEN CIPHER', ['Docs', 'Source', 'Security', 'Blog'],
        'No trackers here', 'By A. Reader · 5 min read',
        'Most "free" tools are free because you are the product. This one is just free.') +
        `<div id="chat">💬</div>
         <div id="cookie"><span>We use cookies and 1,412 partners.</span><button class="go">Accept all</button></div>`,
      `#chat{position:fixed;right:26px;bottom:120px;z-index:2147482000;width:76px;height:76px;border-radius:50%;background:#0a7d55;color:#fff;display:flex;align-items:center;justify-content:center;font-size:32px;box-shadow:0 14px 34px rgba(0,0,0,.3)}
       #cookie{position:fixed;left:0;right:0;bottom:0;z-index:9999;background:#0f1115;color:#fff;padding:22px 30px;display:flex;justify-content:space-between;align-items:center;gap:20px;font-family:system-ui,sans-serif;font-size:19px}
       #cookie .go{background:#6d5ef3;color:#fff;border:0;border-radius:9px;padding:14px 22px;font:inherit;font-weight:600;cursor:pointer}`,
    ),
  },
  {
    id: 'S8-element-picker',
    url: 'techtomorrow.com/stubborn-things',
    action: 'pick',
    pickSel: '#promo',
    hook: 'Stubborn element nothing else catches? Point at it.',
    pain: 'Not sticky, not a modal — just… parked in the article.',
    html: page$(
      'Tech Tomorrow',
      article('TECH TOMORROW', ['News', 'AI', 'Gadgets', 'Subscribe'],
        'Stubborn things', 'By A. Reader · 7 min read',
        'Some clutter is not a header or a modal. It is a block that just sits in the flow, and nothing automatic touches it.',
        '',
        `<div id="promo"><span class="tag">SPONSORED</span><div class="txt"><b>🔥 TechTomorrow Pro — 50% off today only</b><div>Unlimited articles, no limits. Upgrade in 2 taps.</div></div><button>Upgrade</button></div>`),
      `#promo{display:flex;align-items:center;gap:20px;margin:6px 0 30px;padding:22px 24px;border-radius:14px;
         background:linear-gradient(135deg,#fff4e6,#ffe3c7);border:1px solid #f3cfa0;font-family:system-ui,sans-serif}
       #promo .tag{flex:none;background:#ff8a3d;color:#fff;font-size:13px;font-weight:800;letter-spacing:.5px;padding:7px 11px;border-radius:7px}
       #promo .txt{flex:1;font-size:19px;color:#4a3214}
       #promo .txt div{font-size:16px;color:#7a5a30;margin-top:3px}
       #promo button{flex:none;background:#ff8a3d;color:#fff;border:0;border-radius:10px;padding:14px 24px;font:inherit;font-weight:700;cursor:pointer}`,
    ),
  },
];

// ------------------------------------------------------------------ http serve
function startServer() {
  const byPath = new Map(SCENES.map((s) => [`/${s.id}.html`, s.html]));
  return new Promise((resolve) => {
    const server = createServer((req, res) => {
      const p = (req.url || '/').split('?')[0];
      const body = byPath.get(p);
      if (body == null) { res.statusCode = 404; res.end('nf'); return; }
      res.setHeader('content-type', 'text/html; charset=utf-8');
      res.end(body);
    });
    server.listen(0, '127.0.0.1', () => resolve({ server, base: `http://127.0.0.1:${server.address().port}` }));
  });
}

// --------------------------------------------------------- on-page UI painters
async function paintChrome(page, url) {
  await page.evaluate(
    ([icon, cursor, url, toolbar]) => {
      const ui = (el) => { el.setAttribute('data-ks-ui', '1'); return el; };
      const bar = ui(document.createElement('div'));
      bar.id = '__kschrome';
      bar.style.cssText =
        `position:fixed;top:0;left:0;right:0;height:${toolbar}px;z-index:2147483646;background:#dee1e6;` +
        'border-bottom:1px solid #bfc3c9;display:flex;align-items:center;gap:14px;padding:0 18px;' +
        'font:17px system-ui,-apple-system,sans-serif;color:#3c4043;box-sizing:border-box';
      bar.innerHTML =
        "<span style='font-size:22px;color:#5f6368'>&#8592; &#8594; &#8635;</span>" +
        `<div style='flex:1;height:40px;background:#fff;border-radius:20px;display:flex;align-items:center;padding:0 20px;color:#5f6368;font-size:18px'>&#128274; ${url}</div>`;
      const btn = ui(document.createElement('div'));
      btn.id = '__ksbtn';
      btn.style.cssText =
        'position:relative;width:46px;height:46px;border-radius:12px;background:#fff;border:1px solid #cfd2d8;' +
        'display:flex;align-items:center;justify-content:center;transition:transform .12s,box-shadow .12s;flex:none';
      btn.innerHTML =
        `<img src='${icon}' width='30' height='30' alt='Destick' style='display:block'/>` +
        "<span id='__ksbadge' style='position:absolute;bottom:-6px;right:-7px;min-width:20px;height:20px;" +
        "background:#6d5ef3;color:#fff;border-radius:10px;font:700 13px system-ui;display:none;" +
        "align-items:center;justify-content:center;padding:0 4px;border:2px solid #dee1e6'></span>";
      bar.appendChild(btn);
      document.documentElement.appendChild(bar);

      const cur = ui(document.createElement('div'));
      cur.id = '__kscursor';
      cur.style.cssText =
        `position:fixed;left:540px;top:900px;width:46px;height:46px;z-index:2147483647;` +
        `background:url("${cursor}") no-repeat;pointer-events:none;` +
        'transition:left .8s cubic-bezier(.3,.1,.2,1),top .8s cubic-bezier(.3,.1,.2,1),transform .12s';
      document.documentElement.appendChild(cur);
    },
    [iconUri, cursorUri, url, TOOLBAR],
  );
}

async function paintNetMon(page) {
  await page.evaluate(() => {
    const w = document.createElement('div');
    w.setAttribute('data-ks-ui', '1');
    w.style.cssText =
      'position:fixed;top:340px;right:34px;z-index:2147483645;background:#0b1220;color:#dfe4f2;' +
      'font:600 17px system-ui,sans-serif;padding:16px 20px;border-radius:14px;box-shadow:0 14px 34px rgba(0,0,0,.35);' +
      'border:1px solid #243049;line-height:1.5';
    w.innerHTML =
      "<div style='color:#8ef0c0'>● Network monitor</div>" +
      "<div>Requests: <b>0</b></div><div>Trackers: <b>0</b></div><div>Cookies set: <b>0</b></div>";
    document.documentElement.appendChild(w);
  });
}

async function moveFauxCursorTo(page, x, y) {
  await page.evaluate(({ x, y }) => {
    const c = document.getElementById('__kscursor');
    if (c) { c.style.left = x - 8 + 'px'; c.style.top = y - 4 + 'px'; }
  }, { x, y });
}
async function cursorToButton(page) {
  const t = await page.evaluate(() => {
    const r = document.getElementById('__ksbtn').getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  });
  await moveFauxCursorTo(page, t.x, t.y);
  await wait(850);
  return t;
}
async function clickPulse(page) {
  await page.evaluate(() => {
    const c = document.getElementById('__kscursor');
    const b = document.getElementById('__ksbtn');
    if (c) c.style.transform = 'scale(.82)';
    if (b) { b.style.transform = 'scale(1.16)'; b.style.boxShadow = '0 0 0 8px rgba(109,94,243,.35)'; }
    setTimeout(() => {
      if (c) c.style.transform = 'scale(1)';
      if (b) { b.style.transform = 'scale(1)'; b.style.boxShadow = 'none'; }
    }, 180);
  });
  await wait(230);
}
async function setBadge(page, text) {
  await page.evaluate((t) => {
    const el = document.getElementById('__ksbadge');
    if (!el) return;
    if (t == null) el.style.display = 'none';
    else { el.textContent = String(t); el.style.display = 'flex'; }
  }, text);
}
// Caption lives in the TOP third (Shorts hook zone) — never the bottom 15% where UI sits.
async function caption(page, text, kind = 'hook') {
  await page.evaluate(({ t, kind }) => {
    let c = document.getElementById('__kscap');
    if (!c) {
      c = document.createElement('div');
      c.id = '__kscap';
      c.setAttribute('data-ks-ui', '1');
      Object.assign(c.style, {
        position: 'fixed', left: '50%', top: '150px', transform: 'translateX(-50%)',
        zIndex: '2147483647', background: 'rgba(11,18,32,.96)', color: '#fff',
        font: '800 36px/1.25 system-ui, sans-serif', padding: '22px 30px', borderRadius: '22px',
        boxShadow: '0 18px 50px rgba(0,0,0,.5)', pointerEvents: 'none', width: '900px',
        maxWidth: '92vw', textAlign: 'center', letterSpacing: '-.3px',
      });
      document.documentElement.appendChild(c);
    }
    c.style.background = kind === 'cta' ? 'rgba(109,94,243,.97)' : 'rgba(11,18,32,.96)';
    c.style.fontWeight = kind === 'status' ? '700' : '800';
    c.textContent = t;
  }, { t: text, kind });
}

// --------------------------------------------------------------- SW messaging
const toggle = (sw) => sw.evaluate(async () => {
  const t = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  const id = t[0]?.id; if (id != null) await chrome.tabs.sendMessage(id, { ks: 'toggle' });
});
const sendPick = (sw) => sw.evaluate(async () => {
  const t = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  const id = t[0]?.id; if (id != null) await chrome.tabs.sendMessage(id, { ks: 'pick' });
});
const getState = (sw) => sw.evaluate(async () => {
  const t = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  const id = t[0]?.id; if (id == null) return { state: 'off', count: 0 };
  return (await chrome.tabs.sendMessage(id, { ks: 'getState' })) ?? { state: 'off', count: 0 };
});

const scrollDown = async (page, px) => { await page.evaluate((p) => window.scrollBy({ top: p, behavior: 'smooth' }), px); };
const scrollTop = async (page) => { await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'smooth' })); };

// ------------------------------------------------------------------- timelines
async function runScene(context, sw, base, scene) {
  const page = context.pages()[0] ?? (await context.newPage());
  const video = page.video();
  await page.goto(`${base}/${scene.id}.html`);
  await page.waitForLoadState('domcontentloaded');
  await paintChrome(page, scene.url);
  if (scene.netmon) await paintNetMon(page);
  await wait(400);

  // Defensive: if the page somehow loaded already-clean, toggle once to reveal the junk.
  if ((await getState(sw)).state === 'on') { await toggle(sw); await wait(500); }

  // Hook + pain (junk fully visible)
  await caption(page, scene.hook, 'hook');
  await wait(2300);
  await caption(page, scene.pain, 'status');
  await wait(1900);

  if (scene.action === 'pick') {
    await caption(page, 'Press  Alt + Shift + P  →  point at it', 'status');
    await sendPick(sw);
    await wait(700);
    // Aim at the box's own padding column (x just inside the left edge) so
    // elementFromPoint returns #promo itself — NOT an inner child — and the whole
    // box highlights + hides, not just its text.
    const r = await page.evaluate((sel) => {
      const el = document.querySelector(sel); const b = el.getBoundingClientRect();
      return { x: Math.round(b.left + 12), y: Math.round(b.top + b.height / 2) };
    }, scene.pickSel);
    await moveFauxCursorTo(page, r.x, r.y);
    await page.mouse.move(r.x - 60, r.y);
    await page.mouse.move(r.x, r.y); // real move → picker highlight paints the whole #promo
    await wait(1200);
    await page.mouse.click(r.x, r.y); // real click → picker selects + hides + saves rule
    await wait(650);
    await setBadge(page, 1); // exactly the one element the user pointed at
    await caption(page, 'Gone — and saved as a rule for this site.', 'status');
    await wait(1700);
    await scrollDown(page, 1200); await wait(1500);
  } else {
    // show the mechanic
    await caption(page, 'One click  (or  Alt + Shift + X )', 'status');
    await cursorToButton(page);
    await wait(300);
    await clickPulse(page);
    await toggle(sw);
    await wait(550);
    const { count } = await getState(sw);
    await setBadge(page, count);
    await moveFauxCursorTo(page, 760, 980); // move cursor off the icon so the badge shows
    await caption(page, `One click — ${count} bits of junk gone ✨`, 'status');
    await wait(1300);
    if (scene.after) { await caption(page, scene.after, 'status'); await wait(1600); }
    await caption(page, 'Scroll — nothing in the way now.', 'status');
    await scrollDown(page, 1150); await wait(1500);
    await scrollDown(page, 1150); await wait(1400);
    await scrollTop(page); await wait(1100);

    if (scene.action === 'reverse') {
      await caption(page, 'Click again…', 'status');
      await cursorToButton(page);
      await clickPulse(page);
      await toggle(sw);
      await setBadge(page, null);
      await wait(900);
      await caption(page, '…and it is all back. No reload.', 'status');
      await wait(1500);
      await caption(page, 'It even remembers your choice per site.', 'status');
      await wait(1600);
    }
  }

  await caption(page, 'Free · open source · 100% local — Destick', 'cta');
  await wait(2100);

  const raw = await video.path();
  await page.close(); // flush video
  return raw;
}

// --------------------------------------------------------------------- ffmpeg
function resolveFfmpeg() {
  if (spawnSync('ffmpeg', ['-version']).status === 0) return 'ffmpeg';
  const cache = join(homedir(), 'Library', 'Caches', 'ms-playwright');
  if (existsSync(cache)) {
    for (const d of require('node:fs').readdirSync(cache).filter((n) => n.startsWith('ffmpeg')).sort().reverse()) {
      for (const cand of ['ffmpeg', 'ffmpeg-mac']) {
        const p = join(cache, d, cand);
        if (existsSync(p)) return p;
      }
    }
  }
  return null;
}
function toMp4(ff, inFile, outFile) {
  return new Promise((resolve, reject) => {
    const args = ['-y', '-i', inFile, '-vf', `scale=${W}:${H}:force_original_aspect_ratio=decrease,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2:white,format=yuv420p`,
      '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-movflags', '+faststart', '-an', outFile];
    const p = spawn(ff, args, { stdio: 'ignore' });
    p.on('exit', (c) => (c === 0 ? resolve() : reject(new Error('ffmpeg exit ' + c))));
    p.on('error', reject);
  });
}

// --------------------------------------------------------------------- driver
const { server, base } = await startServer();
await mkdir(rawDir, { recursive: true });

const only = (process.env.SHORTS_ONLY || '').split(',').map((s) => s.trim()).filter(Boolean);
const todo = only.length ? SCENES.filter((s) => only.some((o) => s.id.startsWith(o))) : SCENES;

const results = [];
for (const scene of todo) {
  console.log('→ recording', scene.id);
  const context = await chromium.launchPersistentContext('', {
    channel: 'chromium',
    headless: true,
    viewport: { width: W, height: H },
    recordVideo: { dir: rawDir, size: { width: W, height: H } },
    args: [`--disable-extensions-except=${distPath}`, `--load-extension=${distPath}`],
  });
  let [sw] = context.serviceWorkers();
  if (!sw) sw = await context.waitForEvent('serviceworker');
  let raw;
  try {
    raw = await runScene(context, sw, base, scene);
  } finally {
    await context.close(); // finalizes the webm
  }
  const webm = join(rawDir, `${scene.id}.webm`);
  await rename(raw, webm);
  results.push({ scene, webm });
  console.log('   raw →', webm);
}
await server.close();

const ff = resolveFfmpeg();
if (!ff) {
  console.log('NO_FFMPEG — raw .webm files are in', rawDir);
} else {
  for (const { scene, webm } of results) {
    const mp4 = join(outDir, `destick-${scene.id}.mp4`);
    console.log('→ mp4', scene.id);
    await toMp4(ff, webm, mp4);
    console.log('   mp4 →', mp4);
  }
}
console.log('DONE', results.length, 'shorts →', outDir);
for (const f of (await readdir(outDir)).filter((n) => n.endsWith('.mp4')).sort()) console.log('  •', f);
