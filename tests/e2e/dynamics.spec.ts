// Suite 5 — Dynamics (AC-A6): delayed insert, node replacement, style/marker
// repair, owned-prop + marker relinquish, self-mutation, cap, pre-DCL insert.
import { test, expect, toggle, getState, openFixture, seedPrefs, readPrefs } from './ext';

test('DY1 — delayed modal (1.5s) is caught by the observer', async ({ page, sw, baseURL }) => {
  await openFixture(page, baseURL, 'newsletter-delayed.html');
  const s = await toggle(sw, page); // clean while nothing is there yet
  expect(s.state).toBe('cleaned');
  await expect(page.locator('#modal')).toBeHidden({ timeout: 6000 });
  await page.mouse.wheel(0, 500);
  await page.waitForFunction(() => window.scrollY > 50);
});

test('DY2 — junk replaced with a fresh node is re-hidden; no self-loop', async ({ page, sw, baseURL }) => {
  await openFixture(page, baseURL, 'node-replace.html');
  const s = await toggle(sw, page);
  expect(s.state).toBe('cleaned');
  await expect(page.locator('#bar')).toBeHidden();
  await page.evaluate(() => (document.getElementById('swap') as HTMLElement).click());
  await expect(page.locator('#bar')).toBeHidden({ timeout: 4000 });
});

test('DY3a — page removes our injected <style> → observer re-asserts it', async ({ page, sw, baseURL }) => {
  await openFixture(page, baseURL, 'cookie-bar.html');
  await toggle(sw, page);
  expect(await page.evaluate(() => document.querySelectorAll('style[data-ks-ui]').length)).toBeGreaterThan(0);
  await page.evaluate(() => document.querySelectorAll('style[data-ks-ui]').forEach((s) => s.remove()));
  await expect
    .poll(() => page.evaluate(() => document.querySelectorAll('style[data-ks-ui]').length), { timeout: 4000 })
    .toBeGreaterThan(0);
});

test('DY3b — page removes our marker attribute → observer repairs it', async ({ page, sw, baseURL }) => {
  await openFixture(page, baseURL, 'cookie-bar.html');
  await toggle(sw, page);
  const marker = await page.evaluate(() => {
    const el = document.getElementById('cookie')!;
    return [...el.attributes].map((a) => a.name).find((n) => n.startsWith('data-ks-hide-')) ?? null;
  });
  expect(marker).toBeTruthy();
  await page.evaluate((m) => document.getElementById('cookie')!.removeAttribute(m), marker!);
  await expect
    .poll(() => page.evaluate((m) => document.getElementById('cookie')!.hasAttribute(m), marker!), { timeout: 4000 })
    .toBe(true);
});

test('DY3c — page overwrites an owned inline prop → relinquish; page wins', async ({ page, sw, baseURL }) => {
  await openFixture(page, baseURL, 'newsletter-modal.html');
  await toggle(sw, page); // unlock sets body overflow-y:auto!important (owned)
  expect(await page.evaluate(() => getComputedStyle(document.body).overflowY)).not.toBe('hidden');
  await page.evaluate(() => document.body.style.setProperty('overflow-y', 'hidden', 'important'));
  await expect
    .poll(() => page.evaluate(() => getComputedStyle(document.body).overflowY), { timeout: 4000 })
    .toBe('hidden'); // we relinquished this pair; we do not re-assert
});

test('DY3d — page replaces our marker with its own value (document + open shadow) → relinquish, no repair, Undo keeps page value', async ({ page, sw, baseURL }) => {
  await openFixture(page, baseURL, 'marker-both.html');
  await toggle(sw, page);
  const marker = await page.evaluate(() => {
    const el = document.getElementById('docjunk')!;
    return [...el.attributes].map((a) => a.name).find((n) => n.startsWith('data-ks-hide-')) ?? null;
  });
  expect(marker).toBeTruthy();
  // page REPLACES our marker with its own value in both contexts
  await page.evaluate((m) => {
    document.getElementById('docjunk')!.setAttribute(m, '2');
    document.getElementById('host')!.shadowRoot!.getElementById('bubble')!.setAttribute(m, '2');
  }, marker!);
  await page.waitForTimeout(1200); // let reconcile run: it must relinquish, not repair
  const afterReconcile = await page.evaluate((m) => ({
    doc: document.getElementById('docjunk')!.getAttribute(m),
    bubble: document.getElementById('host')!.shadowRoot!.getElementById('bubble')!.getAttribute(m),
  }), marker!);
  expect(afterReconcile).toEqual({ doc: '2', bubble: '2' });
  // Undo must NOT overwrite the page's marker value
  await toggle(sw, page);
  const afterUndo = await page.evaluate((m) => ({
    doc: document.getElementById('docjunk')!.getAttribute(m),
    bubble: document.getElementById('host')!.shadowRoot!.getElementById('bubble')!.getAttribute(m),
  }), marker!);
  expect(afterUndo).toEqual({ doc: '2', bubble: '2' });
});

test('DY4 — self-mutation (our own writes) does not loop the observer', async ({ page, sw, baseURL }) => {
  await openFixture(page, baseURL, 'cookie-bar.html');
  const s = await toggle(sw, page);
  expect(s.capped).toBe(false);
  const count0 = s.count;
  await page.waitForTimeout(1200); // our clean writes must not re-trigger reconcile
  const s2 = await getState(sw, page);
  expect(s2.capped).toBe(false);
  expect(s2.state).toBe('cleaned');
  expect(s2.count).toBe(count0);
});

test('DY5 — continuous mutation storm trips the cap (badge ⏸)', async ({ page, sw, baseURL }) => {
  test.setTimeout(45_000);
  await openFixture(page, baseURL, 'cap-storm.html');
  await toggle(sw, page);
  let capped = false;
  for (let i = 0; i < 40 && !capped; i++) {
    await page.waitForTimeout(500);
    capped = (await getState(sw, page)).capped;
  }
  expect(capped).toBe(true);
  // undo stops the observer
  const off = await toggle(sw, page);
  expect(off.state).toBe('off');
  await page.evaluate(() => clearInterval((window as unknown as { __storm: number }).__storm));
});

// Regression (Codex round-2 MEDIUM4): the badge must refresh after a hidden node is
// removed, even when the reconcile does no other work.
test('badge count drops after a hidden node is removed', async ({ page, sw, baseURL }) => {
  await openFixture(page, baseURL, 'cookie-bar.html');
  const s = await toggle(sw, page);
  expect(s.count).toBeGreaterThan(0);
  await page.evaluate(() => document.getElementById('cookie')!.remove());
  await expect.poll(async () => (await getState(sw, page)).count, { timeout: 4000 }).toBe(0);
});

test('DY6 — candidate present before DOMContentLoaded (auto-clean) is covered', async ({ page, sw, baseURL }) => {
  // autoClean makes the content script clean from the startup contract; the modal is
  // parsed between scan#1 (@document_start) and DOMContentLoaded and must end hidden.
  await seedPrefs(sw, baseURL, { autoClean: true, pickedRules: [] });
  await openFixture(page, baseURL, 'newsletter-modal.html');
  await expect(page.locator('#modal')).toBeHidden({ timeout: 5000 });
});

// NEW behavior (sticky-state): a plain toggle persists autoClean, so a reloaded page not
// only loads clean but RE-ARMS the observer — a modal injected 1.5s AFTER the reload (no
// click) must still be caught. Proves the sticky clean is live, not a one-shot static hide.
test('DY7 — sticky clean survives reload AND re-arms the observer for later dynamic junk', async ({ page, sw, baseURL }) => {
  await openFixture(page, baseURL, 'newsletter-delayed.html');
  const s = await toggle(sw, page); // one click → autoClean persisted true
  expect(s.state).toBe('cleaned');
  expect((await readPrefs(sw, baseURL))?.autoClean).toBe(true);

  await page.reload(); // "open another article" — no click this time
  await page.waitForLoadState('domcontentloaded');
  expect((await getState(sw, page)).state).toBe('cleaned'); // auto-cleaned on load
  await expect(page.locator('#modal')).toBeHidden({ timeout: 6000 }); // delayed modal still caught
});
