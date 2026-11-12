# Contributing to Destick

Thanks for helping! The most useful contributions are **bug reports**,
**sites where Destick misbehaves**, and **new test fixtures**.

## Ground rules (what keeps Destick, Destick)
- **Single purpose.** It removes sticky/fixed/overlay junk and restores scrolling.
  It is not an ad blocker or a general element-hiding filter list.
- **100% local.** No network requests, no account, no telemetry, no remote rules,
  no `chrome.storage.sync`. PRs that add any of these won't be merged.
- **Minimal permissions.** `storage` only. No host permissions, no
  `tabs`/`activeTab`/`scripting`, no `web_accessible_resources` carrying data.
- **Honest limits.** Documented limitations (iframe-internal cleaning, closed
  shadow roots, native-dialog inertness, SPA route changes) stay documented, not
  silently half-implemented.

## Dev setup
```bash
npm install
npm run build        # unpacked MV3 bundle → dist/
```
Load `dist/` at `chrome://extensions` (Developer mode → Load unpacked).

## Before you open a PR
```bash
npm run typecheck    # tsc --noEmit, must be clean
npm test             # unit (Vitest + happy-dom)
npm run test:e2e     # Chromium E2E (Playwright) — run if behavior-affecting
```
- Add or update a test. Detection/ledger/picker logic → a unit test; anything
  involving real layout/scroll/hit-testing → a Chromium E2E (happy-dom has no
  layout). The normative scenario list lives in [`tests/CASES.md`](tests/CASES.md).
- New junk pattern? Add a self-contained fixture in `src/fixtures/` with its
  declared expected outcome in `tests/CASES.md`.
- Keep commits focused; update `README.md` / `CHANGELOG.md` for user-facing changes.

## Architecture (where things live)
- `src/core/` — pure/DOM logic: `detect`, `ledger`, `unlock`, `observer`,
  `fingerprint`, `picker`, `engine`, `storage`, `messages`.
- `src/content/` — content script (authoritative live clean-state, startup contract).
- `src/sw/` — stateless service-worker router. `src/options/` — options page.
- `scripts/` — `build.mjs`, `gen-icons.mjs`, `release-check.mjs`, `record-demo.mjs`.

## Reporting a security/privacy issue
See [SECURITY.md](SECURITY.md) — please report privately, not in a public issue.

By contributing you agree your work is licensed under the [MIT License](LICENSE).
