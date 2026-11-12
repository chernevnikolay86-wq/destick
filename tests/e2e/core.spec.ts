// AC-A3 / AC-A4 core: clean hides junk, real wheel scroll works, hit-test & focus
// reach underlying content, Undo restores extension-owned changes. Case IDs in titles.
import { test, expect, toggle, openFixture } from './ext';

test('F2 cookie-bar — clean hides, wheel scrolls, hit-test & undo', async ({ page, sw, baseURL }) => {
  await openFixture(page, baseURL, 'cookie-bar.html');
  const cookie = page.locator('#cookie');
  await expect(cookie).toBeVisible();

  const s = await toggle(sw, page);
  expect(s.state).toBe('cleaned');
  expect(s.count).toBeGreaterThan(0);
  await expect(cookie).toBeHidden();

  // real mouse-wheel scroll works
  await page.mouse.wheel(0, 600);
  await page.waitForFunction(() => window.scrollY > 100);

  // hit-test: a click at the bottom strip reaches page content, not a hidden blocker
  const hit = await page.evaluate(() => {
    const el = document.elementFromPoint(window.innerWidth / 2, window.innerHeight - 10);
    return el?.id ?? el?.tagName ?? null;
  });
  expect(hit).not.toBe('cookie');

  // undo restores the cookie bar
  const s2 = await toggle(sw, page);
  expect(s2.state).toBe('off');
  await expect(cookie).toBeVisible();
});

test('F16 clean-page — negative control: clean changes nothing visible', async ({ page, sw, baseURL }) => {
  await openFixture(page, baseURL, 'clean-page.html');
  const before = await page.evaluate(() => {
    const m = getComputedStyle(document.querySelector('main')!);
    const b = getComputedStyle(document.body);
    return { mdisplay: m.display, bodyOverflow: b.overflowY, link: !!document.getElementById('target-link') };
  });
  const s = await toggle(sw, page);
  expect(s.state).toBe('cleaned');
  expect(s.count).toBe(0);
  const after = await page.evaluate(() => {
    const m = getComputedStyle(document.querySelector('main')!);
    const b = getComputedStyle(document.body);
    return { mdisplay: m.display, bodyOverflow: b.overflowY, link: !!document.getElementById('target-link') };
  });
  expect(after).toEqual(before);
  // scrolling still works
  await page.mouse.wheel(0, 400);
  await page.waitForFunction(() => window.scrollY > 100);
});

test('U1/F3 newsletter-modal — scroll lock removed, modal hidden, undo', async ({ page, sw, baseURL }) => {
  await openFixture(page, baseURL, 'newsletter-modal.html');
  // locked: body overflow hidden
  expect(await page.evaluate(() => getComputedStyle(document.body).overflowY)).toBe('hidden');

  await toggle(sw, page);
  await expect(page.locator('#modal')).toBeHidden();
  // now wheel scroll moves the page
  await page.mouse.wheel(0, 700);
  await page.waitForFunction(() => window.scrollY > 100);

  await toggle(sw, page);
  await expect(page.locator('#modal')).toBeVisible();
  expect(await page.evaluate(() => getComputedStyle(document.body).overflowY)).toBe('hidden');
});

test('U2a F8 body-negative-top — body never hidden; unlock + scroll restore; undo restores lock', async ({ page, sw, baseURL }) => {
  await openFixture(page, baseURL, 'body-negative-top.html');
  await toggle(sw, page);

  // body itself is never hidden
  expect(await page.evaluate(() => getComputedStyle(document.body).display)).not.toBe('none');
  // after clean, the "at-500" marker sits near the viewport top (lock position preserved)
  const topAfterClean = await page.evaluate(() => document.querySelector('[data-marker="at-500"]')!.getBoundingClientRect().top);
  expect(Math.abs(topAfterClean)).toBeLessThanOrEqual(3);

  // undo with no user scroll → negative-top lock restored → marker still ~top
  await toggle(sw, page);
  const topAfterUndo = await page.evaluate(() => document.querySelector('[data-marker="at-500"]')!.getBoundingClientRect().top);
  expect(Math.abs(topAfterUndo)).toBeLessThanOrEqual(3);
});

test('KF1 — keyboard focus does not land in a hidden element', async ({ page, sw, baseURL }) => {
  await openFixture(page, baseURL, 'cookie-bar.html');
  await toggle(sw, page);
  // Tab through; the Accept button inside #cookie must not be focusable (display:none)
  const focusInCookie = await page.evaluate(() => {
    const btn = document.querySelector('#cookie button') as HTMLElement | null;
    btn?.focus();
    return document.activeElement === btn;
  });
  expect(focusInCookie).toBe(false);
});

test('P1 precedence — inline !important junk is still hidden via inline-important fallback', async ({ page, sw, baseURL }) => {
  await openFixture(page, baseURL, 'precedence-inline.html');
  await expect(page.locator('#bar')).toBeVisible();
  await toggle(sw, page);
  const display = await page.evaluate(() => getComputedStyle(document.getElementById('bar')!).display);
  expect(display).toBe('none');
  await toggle(sw, page);
  const restored = await page.evaluate(() => getComputedStyle(document.getElementById('bar')!).display);
  expect(restored).toBe('block'); // original inline display:block!important restored
});
