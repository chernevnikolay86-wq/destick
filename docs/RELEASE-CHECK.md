# Release check (publication gate)

`npm run release:check` is a **hard prerequisite before any packaging / Chrome Web
Store submission** (AC-B). It reads `docs/site-matrix.json` and **exits non-zero**
unless the manual publication evidence is real and complete.

It fails when any of these is true:

- fewer than **10** matrix rows with **distinct** URLs (duplicates don't count);
- fewer than **3 distinct** persistence sites;
- fewer than **2 distinct** picker sites;
- any `functional` is `PENDING` or `fail`;
- any URL is a placeholder (empty, or containing `example` / `конкретна` / `<`);
- any `evidence` path is `PENDING` or does not exist on disk
  (resolved relative to this `docs/` folder);
- any success boolean is `false`
  (`survivesReload`, `hidesAndRemembers`, `deleteResetWorks`,
  `chromeUiInputs.toolbarClick`, `chromeUiInputs.osShortcut`);
- the `chromeUiInputs` (AC-B4) section is missing/incomplete.

Negative controls (`negativeControl: true`) are scored separately but must still
have a recorded (non-`PENDING`) result.

## How nixa fills it

1. Replace each matrix `url` with the real page you tested (the suggested set is
   in `SPEC.md` §Тест-сет: CNN, NYT, Forbes, Medium, a fixed Substack post, Stack
   Overflow, an Amazon product, a fixed Shopify store, an MDN docs page as a
   "good sticky" negative control, and a Wikipedia article as a clean control).
2. For each row: fill `browser`, `viewport`, `consent`, `steps`, set
   `functional:"pass"`, and point `evidence` at a screenshot/recording that exists
   (e.g. `evidence/cnn.png`).
3. Fill `persistence` (≥3), `picker` (≥2), and `chromeUiInputs` (AC-B4: a real
   toolbar click and the real OS keyboard shortcut — these are **not** Playwright
   automatable, so they live here, not in the auto gate).
4. Run `npm run release:check` until it prints *"publication gate clear."*

The schema and a passing example live in `docs/samples/valid-matrix.json`
(used by the Suite 11 self-test).
