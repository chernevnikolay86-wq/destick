// Suite 6 — Compatibility (AC-A7). Declares each boundary: PASS for open shadow,
// explicit documented LIMITATIONS for closed shadow / iframe internals / native
// dialog inertness / late attachShadow / nested-scroll — never a crash.
import { test, expect, toggle, getState, openFixture } from './ext';

test('C1 — open shadow: per-root <style> hides the junk (PASS)', async ({ page, sw, baseURL }) => {
  await openFixture(page, baseURL, 'open-shadow.html');
  await expect(page.locator('#bubble')).toBeVisible(); // Playwright pierces open shadow
  const s = await toggle(sw, page);
  expect(s.state).toBe('cleaned');
  await expect(page.locator('#bubble')).toBeHidden();
  await toggle(sw, page);
  await expect(page.locator('#bubble')).toBeVisible();
});

test('C2 — closed shadow: internal stays, no crash (LIMITATION)', async ({ page, sw, baseURL }) => {
  await openFixture(page, baseURL, 'closed-shadow.html');
  const s = await toggle(sw, page);
  expect(s.state).toBe('cleaned'); // operates without throwing
  // the closed root is unreachable by design; the extension must not have crashed
  expect(await page.evaluate(() => document.getElementById('host')!.shadowRoot)).toBeNull();
  const after = await getState(sw, page);
  expect(after.supported).toBe(true);
});

test('C3 — iframe overlay: the iframe element is hidden; internals not cleaned (LIMITATION)', async ({ page, sw, baseURL }) => {
  await openFixture(page, baseURL, 'iframe-overlay.html');
  await expect(page.locator('#ad')).toBeVisible();
  await toggle(sw, page);
  await expect(page.locator('#ad')).toBeHidden(); // the <iframe> element itself is hidden
  await toggle(sw, page);
  await expect(page.locator('#ad')).toBeVisible();
});

test('C4 — native <dialog>.showModal() + ::backdrop: no crash (LIMITATION: inertness may remain)', async ({ page, sw, baseURL }) => {
  await openFixture(page, baseURL, 'native-dialog.html');
  const s = await toggle(sw, page);
  expect(s.state).toBe('cleaned'); // we do not require the top-layer dialog to be hidden
  const after = await getState(sw, page);
  expect(after.supported).toBe(true); // no crash
});

test('C5 — late attachShadow on an existing unchanged host is NOT detected (LIMITATION)', async ({ page, sw, baseURL }) => {
  await openFixture(page, baseURL, 'clean-page.html');
  await toggle(sw, page);
  await page.evaluate(() => {
    const host = document.querySelector('main')!;
    const sr = host.attachShadow({ mode: 'open' });
    sr.innerHTML =
      '<div id="late" style="position:fixed;top:0;left:0;right:0;height:50px;z-index:999;background:#f00"></div>';
  });
  await page.waitForTimeout(800);
  // attachShadow emits no observable mutation on the existing host → not detected (documented).
  const hidden = await page.evaluate(
    () => getComputedStyle(document.querySelector('main')!.shadowRoot!.getElementById('late')!).display === 'none',
  );
  expect(hidden).toBe(false);
});

// Regression (Codex BLOCKER): removing a shadow host after clean must not hang the
// reconcile style-repair loop (detached root re-ensure → infinite loop before the fix).
test('detached shadow host after clean does not hang reconcile', async ({ page, sw, baseURL }) => {
  await openFixture(page, baseURL, 'open-shadow.html');
  await toggle(sw, page); // clean → a <style> is injected into the shadow root
  await page.evaluate(() => document.getElementById('host')!.remove()); // root goes detached
  await page.evaluate(() => document.body.appendChild(document.createElement('span'))); // trigger a reconcile
  await page.waitForTimeout(600);
  const s = await getState(sw, page); // still responsive → no infinite loop
  expect(s.supported).toBe(true);
  expect(s.state).toBe('cleaned');
});

test('C6 — nested-scroll: document scroll unlocks; the nested container lock is NOT touched (LIMITATION)', async ({ page, sw, baseURL }) => {
  await openFixture(page, baseURL, 'nested-scroll.html');
  await toggle(sw, page);
  await expect(page.locator('#toolbar')).toBeHidden(); // the sticky toolbar is a candidate
  // document scroll works
  await page.mouse.wheel(0, 400);
  await page.waitForFunction(() => window.scrollY > 80);
  // the nested container keeps its own overflow:hidden (deferred)
  expect(await page.evaluate(() => getComputedStyle(document.getElementById('panel')!).overflowY)).toBe('hidden');
});
