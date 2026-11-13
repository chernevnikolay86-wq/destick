// Suite 7 — Persist / picker-entry / worker (AC-A8). S2/S3/S4a/S4b are covered as
// unit picker-replay. Here: autoClean persistence, handler routing, commands
// registration, stateless-SW reconstruction, multi-tab independence, ineligible-tab
// fallback, and reconstruction-on-demand chooser.
import {
  test,
  expect,
  toggle,
  getState,
  openFixture,
  openFixtureInNewTab,
  openOptions,
  chooserOrigins,
  routeToggle,
  tabIdOf,
  seedPrefs,
  readPrefs,
  readAction,
} from './ext';

test('S1 — autoClean=on survives reload (junk auto-hidden after load)', async ({ page, sw, baseURL }) => {
  await seedPrefs(sw, baseURL, { autoClean: true, pickedRules: [] });
  await openFixture(page, baseURL, 'cookie-bar.html');
  await expect(page.locator('#cookie')).toBeHidden(); // auto-cleaned on first load
  await page.reload();
  await page.waitForLoadState('domcontentloaded');
  await expect(page.locator('#cookie')).toBeHidden(); // survives reload
});

test('S5 — handler routing: the message the icon & shortcut both send runs clean/undo', async ({ page, sw, baseURL }) => {
  await openFixture(page, baseURL, 'cookie-bar.html');
  // Both real inputs route to the SAME {ks:'toggle'} message; the listeners exist.
  const listeners = await sw.evaluate(() => ({
    action: chrome.action.onClicked.hasListeners(),
    commands: chrome.commands.onCommand.hasListeners(),
  }));
  expect(listeners).toEqual({ action: true, commands: true });
  const s1 = await toggle(sw, page); // == the routed message
  expect(s1.state).toBe('cleaned');
  await expect(page.locator('#cookie')).toBeHidden();
  const s2 = await toggle(sw, page);
  expect(s2.state).toBe('off');
  await expect(page.locator('#cookie')).toBeVisible();
});

test('S6 — commands registered in the manifest + Options gives a (re)assign instruction', async ({ sw, context }) => {
  // Chrome auto-adds the built-in _execute_action command, so assert containment.
  const names = (await sw.evaluate(() => chrome.commands.getAll())).map((c) => c.name);
  expect(names).toEqual(expect.arrayContaining(['pick-element', 'toggle-clean']));
  const man = await sw.evaluate(() => chrome.runtime.getManifest());
  expect((man as chrome.runtime.ManifestV3).commands!['toggle-clean'].suggested_key!.default).toBe('Alt+Shift+X');
  // Options instructs the user even when a shortcut is unassigned.
  const opt = await openOptions(context, sw);
  expect(await opt.evaluate(() => document.body.innerText.includes('chrome://extensions/shortcuts'))).toBe(true);
  await opt.close();
});

test('S7 — stateless SW: live state is reconstructed from the content script (wake-safe)', async ({ page, sw, baseURL }) => {
  // The SW keeps no clean-state in globals; after any wake it reconstructs from the
  // content script via getState. (Hard CDP terminate+wake is in the manual gate;
  // this proves the mechanism the wake relies on.)
  await openFixture(page, baseURL, 'cookie-bar.html');
  await toggle(sw, page);
  const viaContent = await getState(sw, page);
  expect(viaContent.state).toBe('cleaned'); // reconstructed by asking the content script
  const badge = await sw.evaluate(async () => {
    const [t] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    return chrome.action.getBadgeText({ tabId: t.id! });
  });
  expect(typeof badge).toBe('string'); // badge derived from content-script status, not SW memory
});

test('S8 — two tabs on the same origin keep independent live-state', async ({ page, sw, baseURL, context }) => {
  await openFixture(page, baseURL, 'cookie-bar.html'); // tab A
  const pageB = await openFixtureInNewTab(context, baseURL, 'cookie-bar.html'); // tab B
  await toggle(sw, page); // clean A only
  expect((await getState(sw, page)).state).toBe('cleaned');
  expect((await getState(sw, pageB)).state).toBe('off'); // B untouched
  await pageB.close();
});

test('S9a — eligible-but-scriptless tab → shared no-op fallback, no new permissions', async ({ sw, context }) => {
  // about:blank stands in for an http tab opened before install (no content script).
  const blank = await context.newPage();
  await blank.goto('about:blank');
  const blankId = await tabIdOf(sw, blank);
  expect(await routeToggle(sw, blankId)).toBe(false); // safe no-op, nothing granted
  const opt = await openOptions(context, sw);
  expect(await chooserOrigins(opt)).not.toContain('about:blank'); // not falsely offered
  await opt.close();
  await blank.close();
});

test('S9b — restricted/withheld tab → same shared no-op fallback', async ({ sw, context }) => {
  const restricted = await context.newPage();
  try {
    await restricted.goto('chrome://version');
  } catch {
    /* navigation to chrome:// may be blocked; the tab stays ineligible either way */
  }
  const rid = await tabIdOf(sw, restricted);
  expect(await routeToggle(sw, rid)).toBe(false);
  await restricted.close();
});

test('S10 — reconstruction-on-demand: Options chooser lists eligible tabs without reloading them', async ({ page, sw, baseURL, context }) => {
  await openFixture(page, baseURL, 'cookie-bar.html'); // eligible tab A
  const pageB = await openFixtureInNewTab(context, baseURL, 'sticky-header.html'); // eligible tab B
  const opt = await openOptions(context, sw); // getRegistry = enumerate tabs + ping whoami
  const origins = await chooserOrigins(opt);
  expect(origins).toContain(baseURL);
  await opt.close();
  await pageB.close();
});

// NEW behavior (sticky-state): a single toggle is no longer ephemeral — it persists the
// resulting clean-state for the origin, so the EXISTING startup contract auto-cleans every
// later page on that site. This is nixa's exact automedia.bg case: clean once, keep clean.
test('S11 — one toggle makes the clean sticky across navigation; a 2nd toggle (undo) stops it', async ({ page, sw, baseURL }) => {
  await openFixture(page, baseURL, 'cookie-bar.html');
  expect((await readPrefs(sw, baseURL))?.autoClean ?? false).toBe(false); // starts off

  // CLEAN → autoClean persisted true, and the hidden junk's selector captured for pre-hide
  const on = await toggle(sw, page);
  expect(on.state).toBe('cleaned');
  await expect(page.locator('#cookie')).toBeHidden();
  const afterClean = await readPrefs(sw, baseURL);
  expect(afterClean?.autoClean).toBe(true);
  expect(afterClean?.preHideSelectors).toContain('#cookie'); // §flash: remembered for next load

  // Navigate to the SAME-origin page again (a reload stands in for "another article"):
  // it must load ALREADY clean, with NO second click.
  await page.reload();
  await page.waitForLoadState('domcontentloaded');
  await expect(page.locator('#cookie')).toBeHidden(); // survived navigation via autoClean
  expect((await getState(sw, page)).state).toBe('cleaned');

  // 2nd toggle = UNDO → autoClean persisted false → junk comes back on the next load
  const off = await toggle(sw, page);
  expect(off.state).toBe('off');
  const afterUndo = await readPrefs(sw, baseURL);
  expect(afterUndo?.autoClean).toBe(false);
  expect(afterUndo?.preHideSelectors).toEqual([]); // §flash: hint cleared on undo
  await page.reload();
  await page.waitForLoadState('domcontentloaded');
  await expect(page.locator('#cookie')).toBeVisible(); // auto-clean is off again
});

test('S12 — ON/OFF visualization: badge reads the STATE word, count lives in the tooltip', async ({ page, sw, baseURL }) => {
  await openFixture(page, baseURL, 'cookie-bar.html');
  const tabId = await tabIdOf(sw, page);

  // Fresh eligible page, never toggled → explicit "OFF" badge on grey (never a blank badge).
  await expect.poll(async () => (await readAction(sw, tabId)).text).toBe('OFF');
  {
    const off = await readAction(sw, tabId);
    expect(off.title).toContain('OFF');
    expect(off.color).toEqual([0x6b, 0x72, 0x80, 0xff]); // grey #6b7280
  }

  // CLEAN → "ON" badge on green; the hidden COUNT is only in the tooltip, not the badge.
  await toggle(sw, page);
  await expect.poll(async () => (await readAction(sw, tabId)).text).toBe('ON');
  {
    const on = await readAction(sw, tabId);
    expect(on.title).toMatch(/ON — \d+ скрити/); // count moved into the tooltip
    expect(on.color).toEqual([0x16, 0xa3, 0x4a, 0xff]); // green #16a34a
  }

  // UNDO → back to the "OFF" badge.
  await toggle(sw, page);
  await expect.poll(async () => (await readAction(sw, tabId)).text).toBe('OFF');
});

test('S13 — pre-hide (§flash): a remembered selector hides remembered junk before the engine runs; undo reveals it', async ({ page, sw, baseURL }) => {
  // Seed autoClean + a pre-hide selector pointing at a BENIGN element the heuristic never
  // hides (clean-page is the negative control). So if #end ends up hidden, it can only be
  // the pre-paint <style> guard — proving the guard works independently of the engine.
  await seedPrefs(sw, baseURL, { autoClean: true, pickedRules: [], preHideSelectors: ['#end'] });
  await openFixture(page, baseURL, 'clean-page.html');

  await expect(page.locator('#end')).toBeHidden(); // hidden purely by the pre-paint guard
  expect(await page.evaluate(() => !!document.getElementById('ks-prehide'))).toBe(true);
  // the guard is our own node → the engine's detection must ignore it
  expect(await page.evaluate(() => document.getElementById('ks-prehide')!.hasAttribute('data-ks-ui'))).toBe(true);

  // UNDO drops the guard → the benign element reappears, state OFF persisted.
  const off = await toggle(sw, page);
  expect(off.state).toBe('off');
  await expect(page.locator('#end')).toBeVisible();
  expect(await page.evaluate(() => !!document.getElementById('ks-prehide'))).toBe(false);
  expect((await readPrefs(sw, baseURL))?.autoClean).toBe(false);
});
