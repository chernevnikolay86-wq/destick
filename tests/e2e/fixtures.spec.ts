// Suite 4 — per-fixture clean/undo + hit-test (AC-A4), remaining fixtures + P2/P3.
// F2, F3, F8, F16, KF1, P1 live in core.spec.ts. Each case: clean hides the
// candidate, real wheel scroll works, elementFromPoint at the junk's spot returns
// underlying content (not a hidden blocker), Undo restores the junk.
import { test, expect, toggle, openFixture } from './ext';

interface FixCase {
  id: string;
  file: string;
  junk: string; // Playwright selector (pierces open shadow)
  junkId: string; // id returned by elementFromPoint if it were still blocking
}

const FIXTURES: FixCase[] = [
  { id: 'F1', file: 'sticky-header.html', junk: '#nav', junkId: 'nav' },
  { id: 'F5', file: 'chat-bubble.html', junk: '#chat', junkId: 'chat' },
  { id: 'F6', file: 'social-rail.html', junk: '#rail', junkId: 'rail' },
  { id: 'F7', file: 'scrolljack-overlay.html', junk: '#overlay', junkId: 'overlay' },
  { id: 'F9', file: 'node-replace.html', junk: '#bar', junkId: 'bar' },
  { id: 'F10', file: 'open-shadow.html', junk: '#bubble', junkId: 'bubble' },
  { id: 'F15', file: 'good-sticky.html', junk: '#sidebar', junkId: 'sidebar' },
];

for (const cfg of FIXTURES) {
  test(`${cfg.id} ${cfg.file} — clean hides, scroll works, hit-test passes, undo restores`, async ({ page, sw, baseURL }) => {
    await openFixture(page, baseURL, cfg.file);
    const junk = page.locator(cfg.junk);
    await expect(junk).toBeVisible();
    const box = await junk.boundingBox();
    expect(box).toBeTruthy();
    const cx = Math.min(Math.max(box!.x + box!.width / 2, 2), 1270);
    const cy = Math.min(Math.max(box!.y + box!.height / 2, 2), 700);

    const s = await toggle(sw, page);
    expect(s.state).toBe('cleaned');
    expect(s.count).toBeGreaterThan(0);
    await expect(junk).toBeHidden();

    // hit-test: the point where the junk used to be returns underlying content.
    const hit = await page.evaluate(([x, y]) => {
      const el = document.elementFromPoint(x, y);
      return el ? el.id || el.tagName : null;
    }, [cx, cy] as [number, number]);
    expect(hit).not.toBe(cfg.junkId);

    // real wheel scroll works
    await page.mouse.wheel(0, 500);
    await page.waitForFunction(() => window.scrollY > 80);

    // Undo restores the junk.
    const s2 = await toggle(sw, page);
    expect(s2.state).toBe('off');
    await expect(junk).toBeVisible();

    if (cfg.id === 'F15') {
      // good sticky: aggressive hide is accepted, but Undo must restore it identically —
      // no leftover inline display, no leftover marker attribute.
      const leftovers = await page.evaluate(() => {
        const el = document.getElementById('sidebar')!;
        const marker = [...el.attributes].some((a) => a.name.startsWith('data-ks-'));
        return { display: el.style.getPropertyValue('display'), marker };
      });
      expect(leftovers).toEqual({ display: '', marker: false });
    }
  });
}

test('P2 precedence — higher-specificity !important page rule → inline-important fallback wins', async ({ page, sw, baseURL }) => {
  await openFixture(page, baseURL, 'precedence-specificity.html');
  await expect(page.locator('#bar')).toBeVisible();
  await toggle(sw, page);
  expect(await page.evaluate(() => getComputedStyle(document.getElementById('bar')!).display)).toBe('none');
  await toggle(sw, page);
  expect(await page.evaluate(() => getComputedStyle(document.getElementById('bar')!).display)).toBe('block');
});

test('P3 precedence — @layer-ed !important declaration → inline-important fallback wins', async ({ page, sw, baseURL }) => {
  await openFixture(page, baseURL, 'precedence-layer.html');
  await expect(page.locator('#bar')).toBeVisible();
  await toggle(sw, page);
  expect(await page.evaluate(() => getComputedStyle(document.getElementById('bar')!).display)).toBe('none');
  await toggle(sw, page);
  expect(await page.evaluate(() => getComputedStyle(document.getElementById('bar')!).display)).toBe('block');
});

// Regression (Codex HIGH5): the inline-important fallback must cover SVGElement.
test('SVG overlay with inline display:block!important is still hidden (SVGElement fallback)', async ({ page, sw, baseURL }) => {
  await openFixture(page, baseURL, 'svg-overlay.html');
  await expect(page.locator('#svg')).toBeVisible();
  await toggle(sw, page);
  expect(await page.evaluate(() => getComputedStyle(document.getElementById('svg')!).display)).toBe('none');
  await toggle(sw, page);
  expect(await page.evaluate(() => getComputedStyle(document.getElementById('svg')!).display)).toBe('block');
});
