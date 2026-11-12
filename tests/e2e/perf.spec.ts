// Suite 9 — Performance (AC-A9). Budgets are measured via the engine's own
// synchronous-pass timings (performance.now() around the clean pass / reconcile
// handler), read with the `timings` message — exactly the method §Performance
// baseline defines (median of 5 after 1 warmup; observer re-runs excluded).
import { test, expect, toggle, getTimings, openFixture } from './ext';

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}
function percentile(xs: number[], p: number): number {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(s.length * p))];
}

test('PF1 — large-dom (~10k nodes) clean ≤ 400ms (median of 5)', async ({ page, sw, baseURL }) => {
  await openFixture(page, baseURL, 'large-dom.html');
  const samples: number[] = [];
  for (let i = 0; i < 6; i++) {
    await toggle(sw, page); // clean
    const t = (await getTimings(sw, page)).lastCleanMs;
    await toggle(sw, page); // undo → reset for the next clean
    if (i > 0) samples.push(t); // drop the warmup
  }
  expect(median(samples)).toBeLessThanOrEqual(400);
});

test('PF3 — small page (≤2k nodes) clean ≤ 100ms (median of 5)', async ({ page, sw, baseURL }) => {
  await openFixture(page, baseURL, 'cookie-bar.html');
  const samples: number[] = [];
  for (let i = 0; i < 6; i++) {
    await toggle(sw, page);
    const t = (await getTimings(sw, page)).lastCleanMs;
    await toggle(sw, page);
    if (i > 0) samples.push(t);
  }
  expect(median(samples)).toBeLessThanOrEqual(100);
});

test('PF2 — observer handler ≤ 16ms p95 (≥20 reconcile triggers under load)', async ({ page, sw, baseURL }) => {
  test.setTimeout(45_000);
  await openFixture(page, baseURL, 'cookie-bar.html');
  // moderate load so a reconcile pass scans a non-trivial DOM
  await page.evaluate(() => {
    const f = document.createDocumentFragment();
    for (let i = 0; i < 200; i++) {
      const s = document.createElement('span');
      s.textContent = 'x';
      f.appendChild(s);
    }
    document.body.appendChild(f);
  });
  await toggle(sw, page); // clean → observer active
  // 22 benign (non-candidate) insertions, each its own debounced reconcile flush.
  for (let i = 0; i < 22; i++) {
    await page.evaluate((n) => {
      const d = document.createElement('span');
      d.id = `benign-${n}`;
      d.textContent = 'n';
      document.body.appendChild(d);
    }, i);
    await page.waitForTimeout(320); // > debounce (250ms) → separate flush each time
  }
  const times = (await getTimings(sw, page)).reconcile;
  expect(times.length).toBeGreaterThanOrEqual(15);
  expect(percentile(times, 0.95)).toBeLessThanOrEqual(16);
});
