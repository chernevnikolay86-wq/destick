// AC-A5 — bounded "the extension initiates no outbound request / data transfer".
// (1) manifest audit, (2) production-bundle string audit, (3) runtime monitor over
// a normal flow, (4) positive control proving the monitor actually catches a request.
import { test, expect, toggle, sendPick, openFixture, openOptions } from './ext';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const dist = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'dist');

test('N-static — manifest has no remote access / remote code', async () => {
  const m = JSON.parse(await readFile(join(dist, 'manifest.json'), 'utf8'));
  expect(m.permissions).toEqual(['storage']);
  expect(m.host_permissions).toBeUndefined();
  expect(m.web_accessible_resources).toBeUndefined();
  expect(JSON.stringify(m)).not.toMatch(/https?:\/\/(?!\*)/); // no concrete remote origin
});

test('N-bundle — production bundles contain no network primitives or remote URLs', async () => {
  for (const f of ['content.js', 'sw.js', 'options.js']) {
    const src = await readFile(join(dist, f), 'utf8');
    expect(src, `${f} fetch`).not.toMatch(/\bfetch\s*\(/);
    expect(src, `${f} XHR`).not.toMatch(/XMLHttpRequest/);
    expect(src, `${f} WebSocket`).not.toMatch(/WebSocket/);
    expect(src, `${f} sendBeacon`).not.toMatch(/sendBeacon/);
    expect(src, `${f} EventSource`).not.toMatch(/EventSource/);
    expect(src, `${f} importScripts`).not.toMatch(/importScripts\s*\(/);
    // No remote URL other than RFC-2606 reserved example domains (UI copy only).
    const urls = src.match(/https?:\/\/[a-z0-9.-]+/gi) ?? [];
    const nonExample = urls.filter((u) => !/example\.(com|org|net|invalid)/i.test(u));
    expect(nonExample, `${f} remote urls`).toEqual([]);
  }
});

test('N1 — a normal clean/pick/undo flow initiates zero external requests', async ({ page, sw, baseURL, context }) => {
  const external: string[] = [];
  const isExternal = (url: string) => !url.startsWith(baseURL) && !url.startsWith('chrome-extension://') && !url.startsWith('data:') && !url.startsWith('about:') && !url.startsWith('blob:');
  context.on('request', (r) => {
    if (isExternal(r.url())) external.push(r.url());
  });

  await openFixture(page, baseURL, 'newsletter-modal.html');
  await toggle(sw, page); // clean
  await sendPick(sw, page); // enter picker
  await page.keyboard.press('Escape'); // cancel picker
  await toggle(sw, page); // undo
  // post-action quiet window
  await page.waitForTimeout(1000);

  expect(external).toEqual([]);
});

test('N2 — positive control: a request from the SERVICE WORKER context is caught', async ({ sw, context }) => {
  const seen: string[] = [];
  const probe = 'http://example.invalid/ks-sw-probe';
  const grab = (url: string) => {
    if (url.includes('ks-sw-probe')) seen.push(url);
  };
  context.on('request', (r) => grab(r.url()));
  context.on('requestfailed', (r) => grab(r.url()));
  await sw.evaluate((u) => {
    void fetch(u).catch(() => {});
  }, probe);
  await new Promise((r) => setTimeout(r, 800));
  expect(seen.some((u) => u.includes('ks-sw-probe'))).toBe(true);
});

test('N3 — positive control: a request from the OPTIONS page is caught', async ({ sw, context }) => {
  const seen: string[] = [];
  const probe = 'http://example.invalid/ks-opt-probe';
  const grab = (url: string) => {
    if (url.includes('ks-opt-probe')) seen.push(url);
  };
  context.on('request', (r) => grab(r.url()));
  context.on('requestfailed', (r) => grab(r.url()));
  const opt = await openOptions(context, sw);
  await opt.evaluate((u) => {
    void fetch(u).catch(() => {});
  }, probe);
  await new Promise((r) => setTimeout(r, 800));
  expect(seen.some((u) => u.includes('ks-opt-probe'))).toBe(true);
  await opt.close();
});

test('N4 — positive control: the monitor actually catches an external request', async ({ page, baseURL, context }) => {
  const seen: string[] = [];
  const probe = 'http://example.invalid/ks-probe';
  const catchProbe = (url: string) => {
    if (url.includes('ks-probe')) seen.push(url);
  };
  context.on('request', (r) => catchProbe(r.url()));
  context.on('requestfailed', (r) => catchProbe(r.url()));

  await openFixture(page, baseURL, 'clean-page.html');
  await page.evaluate((u) => fetch(u).catch(() => {}), probe);
  await page.waitForTimeout(500);

  expect(seen.some((u) => u.includes('ks-probe'))).toBe(true);
});
