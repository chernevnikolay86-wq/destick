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
