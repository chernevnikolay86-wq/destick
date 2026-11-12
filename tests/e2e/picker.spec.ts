// Suite 8 — Picker operation (AC-A8). PK2/PK3/PK9 are unit (fingerprint identity).
// Here the real picker UI + replay through the extension: reorder identity, Escape
// teardown, link default suppression, Options-driven chooser/focus, stale/renavigated
// targets, and nested-shadow hostChain replay.
import {
  test,
  expect,
  toggle,
  getState,
  sendPick,
  openFixture,
  openOptions,
  seedPrefs,
} from './ext';
import { __test } from '../../src/core/fingerprint';

async function waitPickerUp(page: import('@playwright/test').Page): Promise<void> {
  await expect
    .poll(() => page.evaluate(() => !!document.querySelector('div[data-ks-ui]')), { timeout: 4000 })
    .toBe(true);
}

test('PK1 — picked element keeps identity across sibling reordering', async ({ page, sw, baseURL }) => {
  await openFixture(page, baseURL, 'picker-siblings.html');
  await sendPick(sw, page);
  await waitPickerUp(page);
  const box = (await page.locator('#b2').boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await expect(page.locator('#b2')).toBeHidden();
  await page.waitForTimeout(400); // let addRule() persist

  await page.locator('#reorder').click(); // DOM order changes; #b2 keeps id + text
  await toggle(sw, page); // undo → everything visible
  await expect(page.locator('#b2')).toBeVisible();
  await toggle(sw, page); // clean → replay the saved rule against the reordered DOM
  await expect(page.locator('#b2')).toBeHidden();
  await expect(page.locator('#b1')).toBeVisible();
  await expect(page.locator('#b3')).toBeVisible();
});

test('PK4 — Escape during picking exits without selection; listeners/highlights removed', async ({ page, sw, baseURL }) => {
  await openFixture(page, baseURL, 'cookie-bar.html');
  await sendPick(sw, page);
  await waitPickerUp(page);
  await page.keyboard.press('Escape');
  await expect
    .poll(() => page.evaluate(() => !!document.querySelector('div[data-ks-ui]')), { timeout: 4000 })
    .toBe(false); // highlight + listeners torn down
  expect((await getState(sw, page)).state).toBe('off'); // nothing was selected/hidden
});

test('PK5 — picking a link suppresses its default action and hides it via the ledger', async ({ page, sw, baseURL }) => {
  await openFixture(page, baseURL, 'sticky-header.html');
  await sendPick(sw, page);
  await waitPickerUp(page);
  const box = (await page.locator('#target-link').boundingBox())!;
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.click(x, y);
  expect(await page.evaluate(() => location.hash)).not.toBe('#end'); // navigation suppressed
  await expect(page.locator('#target-link')).toBeHidden(); // hidden through the ledger
});

test('PK6 — Options "Pick element" targets an eligible tab, focuses it, not Options', async ({ page, sw, baseURL, context }) => {
  await openFixture(page, baseURL, 'cookie-bar.html'); // eligible tab A
  const opt = await openOptions(context, sw);
  await expect
    .poll(() => opt.evaluate(() => [...(document.getElementById('pickTab') as HTMLSelectElement).options].filter((o) => o.value).length), { timeout: 4000 })
    .toBeGreaterThan(0);
  const origins = await opt.evaluate(() => [...(document.getElementById('pickTab') as HTMLSelectElement).options].map((o) => o.textContent));
  expect(origins).toContain(baseURL);
  await opt.evaluate(() => ((document.getElementById('pickTab') as HTMLSelectElement).selectedIndex = 0));
  await opt.locator('#pickBtn').click();
  // picker starts on tab A, not on the Options page
  await waitPickerUp(page);
  expect(await opt.evaluate(() => !!document.querySelector('div[data-ks-ui]'))).toBe(false);
  await opt.close();
});

test('PK7a — stale target (tab closed) → failure notice, no crash', async ({ page, sw, baseURL, context }) => {
  await openFixture(page, baseURL, 'cookie-bar.html');
  const opt = await openOptions(context, sw);
  await expect
    .poll(() => opt.evaluate(() => [...(document.getElementById('pickTab') as HTMLSelectElement).options].filter((o) => o.value).length), { timeout: 4000 })
    .toBeGreaterThan(0);
  await opt.evaluate(() => ((document.getElementById('pickTab') as HTMLSelectElement).selectedIndex = 0));
  await page.close(); // target tab disappears
  await opt.locator('#pickBtn').click();
  await expect
    .poll(() => opt.evaluate(() => document.getElementById('toast')?.textContent ?? ''), { timeout: 4000 })
    .toContain('no longer available');
  await opt.close();
});

test('PK7b — target renavigated to another eligible doc → picker starts on the current doc', async ({ page, sw, baseURL, context }) => {
  await openFixture(page, baseURL, 'cookie-bar.html'); // tab A @ cookie-bar
  const opt = await openOptions(context, sw);
  await expect
    .poll(() => opt.evaluate(() => [...(document.getElementById('pickTab') as HTMLSelectElement).options].filter((o) => o.value).length), { timeout: 4000 })
    .toBeGreaterThan(0);
  await opt.evaluate(() => ((document.getElementById('pickTab') as HTMLSelectElement).selectedIndex = 0));
  await openFixture(page, baseURL, 'sticky-header.html'); // same tab A, new eligible doc
  await opt.locator('#pickBtn').click();
  await waitPickerUp(page); // picker started on the CURRENT doc (routed by live tab id)
  expect(await page.evaluate(() => !!document.getElementById('nav'))).toBe(true); // sticky-header doc
  await opt.close();
});

// Regression (Codex HIGH4): the picker must pierce open shadow roots and build a hostChain.
test('shadow-pierce — picking inside an open shadow root targets the inner element, not the host', async ({ page, sw, baseURL }) => {
  await openFixture(page, baseURL, 'open-shadow.html');
  await sendPick(sw, page);
  await waitPickerUp(page);
  const box = (await page.locator('#bubble').boundingBox())!; // Playwright pierces open shadow
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await page.waitForTimeout(400); // persist
  const rule = await sw.evaluate(async (key) => {
    const g = await chrome.storage.local.get(key);
    return (g[key] as { pickedRules?: { selector: string; hostChain: string[] }[] } | undefined)?.pickedRules?.[0] ?? null;
  }, `site:${baseURL}`);
  expect(rule).toBeTruthy(); // a durable rule was built (picker reached the inner element)
  expect(rule!.selector).toBe('#bubble');
  expect(rule!.hostChain).toEqual(['#host']); // resolved THROUGH the host, not AT it
  // the host itself is not hidden
  expect(await page.evaluate(() => getComputedStyle(document.getElementById('host')!).display)).not.toBe('none');
});

// Regression (Codex round-2 MEDIUM6): a freshly picked rule enters the LIVE rule set, so
// reconcile re-hides an identical replacement node within the same session (no reload).
test('picked rule re-hides an identical replacement node within the session', async ({ page, sw, baseURL }) => {
  await openFixture(page, baseURL, 'picker-siblings.html');
  await sendPick(sw, page);
  await waitPickerUp(page);
  const box = (await page.locator('#b2').boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await expect(page.locator('#b2')).toBeHidden();
  // page swaps #b2 for a FRESH identical node (no marker/inline from us)
  await page.evaluate(() => {
    document.getElementById('b2')!.remove();
    const n = document.createElement('div');
    n.className = 'item';
    n.id = 'b2';
    n.textContent = 'Banner two';
    document.getElementById('list')!.appendChild(n);
  });
  await expect(page.locator('#b2')).toBeHidden({ timeout: 4000 }); // replayed from the live rule
});

// Regression (Codex MEDIUM2): a second Pick tears down the first; no orphaned highlights/listeners.
test('double Pick leaves only one live picker (highlight)', async ({ page, sw, baseURL }) => {
  await openFixture(page, baseURL, 'cookie-bar.html');
  await sendPick(sw, page);
  await waitPickerUp(page);
  await sendPick(sw, page); // must stop the first picker
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => document.querySelectorAll('div[data-ks-ui]').length)).toBe(1);
});

test('PK8 — nested open-shadow replay resolves through the hostChain', async ({ page, sw, baseURL }) => {
  const rule = {
    hostChain: ['#outer', '#inner'],
    selector: '#deep',
    kind: 'id',
    fp: { tag: 'div', textHash: __test.sha1hex('DEEP').slice(0, 16), rectBucket: '0x0', depth: 0 },
  };
  await seedPrefs(sw, baseURL, { autoClean: true, pickedRules: [rule] });
  await openFixture(page, baseURL, 'nested-shadow.html');
  const hidden = await page.evaluate(() => {
    const inner = document.getElementById('outer')!.shadowRoot!.getElementById('inner')!.shadowRoot!;
    return getComputedStyle(inner.getElementById('deep')!).display === 'none';
  });
  expect(hidden).toBe(true);
});
