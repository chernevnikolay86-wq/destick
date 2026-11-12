// Suite 3 — Unlock (AC-A3), remaining cases. U1 + U2a live in core.spec.ts.
// U2b, U3, U4, U5, U6a, U6b here. Real mouse-wheel + geometry assertions in Chromium.
import { test, expect, toggle, openFixture } from './ext';

test('U2b — negative-top lock, user scrolls, undo → geometry puts the marker at ~top (±3px)', async ({ page, sw, baseURL }) => {
  await openFixture(page, baseURL, 'body-negative-top.html');
  await toggle(sw, page); // clean → unlock + scrollTo(0,500); marker sits ~top
  // user scrolls the now-unlocked page
  await page.mouse.wheel(0, 400);
  await page.waitForFunction(() => window.scrollY > 100);
  // undo → negative-top lock restored; the restored geometry (not userScroll) fixes the marker
  await toggle(sw, page);
  const top = await page.evaluate(() => document.querySelector('[data-marker="at-500"]')!.getBoundingClientRect().top);
  expect(Math.abs(top)).toBeLessThanOrEqual(3);
});

test('U3 — class-based lock: override unlocks; the class is NOT removed', async ({ page, sw, baseURL }) => {
  await openFixture(page, baseURL, 'scrolljack-overlay.html'); // body.locked{overflow:hidden}
  expect(await page.evaluate(() => document.body.classList.contains('locked'))).toBe(true);
  await toggle(sw, page);
  await expect(page.locator('#overlay')).toBeHidden();
  // real wheel scroll now works
  await page.mouse.wheel(0, 500);
  await page.waitForFunction(() => window.scrollY > 100);
  // the lock class is untouched — we override via inline, we don't strip page classes
  expect(await page.evaluate(() => document.body.classList.contains('locked'))).toBe(true);
});

test('U4 — inline overflow:hidden!important on body → inline setProperty override unlocks', async ({ page, sw, baseURL }) => {
  await openFixture(page, baseURL, 'inline-overflow-lock.html');
  expect(await page.evaluate(() => getComputedStyle(document.body).overflowY)).toBe('hidden');
  await toggle(sw, page);
  expect(await page.evaluate(() => getComputedStyle(document.body).overflowY)).not.toBe('hidden');
  await page.mouse.wheel(0, 500);
  await page.waitForFunction(() => window.scrollY > 100);
});

test('U5 — clean root without a lock signature → unlock layer touches nothing (negative)', async ({ page, sw, baseURL }) => {
  await openFixture(page, baseURL, 'clean-page.html');
  const s = await toggle(sw, page);
  expect(s.state).toBe('cleaned');
  expect(s.count).toBe(0);
  const inline = await page.evaluate(() => {
    const read = (el: HTMLElement) => ({
      ox: el.style.getPropertyValue('overflow-x'),
      oy: el.style.getPropertyValue('overflow-y'),
      pos: el.style.getPropertyValue('position'),
      top: el.style.getPropertyValue('top'),
    });
    return { html: read(document.documentElement), body: read(document.body) };
  });
  expect(inline).toEqual({
    html: { ox: '', oy: '', pos: '', top: '' },
    body: { ox: '', oy: '', pos: '', top: '' },
  });
});

test('U6a — ordinary overflow lock, no user scroll, undo → scrollY ≈ scrollY@clean (±2px)', async ({ page, sw, baseURL }) => {
  await openFixture(page, baseURL, 'newsletter-modal.html'); // body.locked{overflow:hidden}
  await toggle(sw, page); // clean (snapshot scrollY = 0, no user scroll)
  await toggle(sw, page); // undo → restores to the clean-time snapshot
  const y = await page.evaluate(() => window.scrollY);
  expect(y).toBeLessThanOrEqual(2);
});

test('U6b — ordinary overflow lock, user scrolls, undo → scrollY ≈ current position (not redirected)', async ({ page, sw, baseURL }) => {
  await openFixture(page, baseURL, 'newsletter-modal.html');
  await toggle(sw, page); // clean + unlock
  await page.mouse.wheel(0, 500);
  await page.waitForFunction(() => window.scrollY > 100);
  const before = await page.evaluate(() => window.scrollY);
  await toggle(sw, page); // undo — must NOT redirect to the clean-time snapshot (0)
  const after = await page.evaluate(() => window.scrollY);
  expect(Math.abs(after - before)).toBeLessThanOrEqual(3);
  expect(after).toBeGreaterThan(100);
});
