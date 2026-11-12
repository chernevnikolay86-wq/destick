# Destick — Kill Sticky

<!-- Replace OWNER with your GitHub username/org once the repo is pushed. -->
[![CI](https://github.com/chernevnikolay86-wq/destick/actions/workflows/ci.yml/badge.svg)](https://github.com/chernevnikolay86-wq/destick/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
![Manifest V3](https://img.shields.io/badge/Manifest-V3-6d5ef3)
![100% local](https://img.shields.io/badge/privacy-100%25%20local-0a7d55)
[![PRs welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)

**One click removes the sticky junk and gives you back the page.** Sticky headers,
cookie bars, newsletter modals, floating chat bubbles, social-share rails,
full-screen "please disable your ad blocker" overlays — gone. Scrolling comes
back. Click again to undo. 100% local, open source, MIT.

> The reliable, reversible, open-source one-click version of the well-known
> [Kill-Sticky bookmarklet](https://github.com/t-mart/kill-sticky) (~913★) —
> it remembers your choice per site and it does not spy on you.

![Destick before/after demo: one click removes sticky headers, cookie bars and modals and restores scrolling](docs/demo.gif)

## Why this one

| | Kill-Sticky bookmarklet | typical sticky-hider extensions | **Destick** |
|---|---|---|---|
| One click, toolbar + shortcut | re-paste on every page | ✓ | ✓ |
| Restores scrolling (unlocks `overflow`/scroll-lock) | partial | varies | ✓ |
| **Reversible undo without reload** | ✗ (one-shot) | often reload-only | ✓ (toggle) |
| Per-site memory + auto-clean on load | ✗ | some | ✓ |
| Element-pick for stubborn cases (no filter syntax) | ✗ | rare | ✓ |
| Catches junk injected *after* load (delayed modals, SPA) | ✗ | varies | ✓ (observer) |
| 100% local, no account, verifiable "no network" | n/a | "all-seeing" complaints | ✓ |

## Install (unpacked, while in review)

```bash
npm install
npm run build
```

Then in Chrome: `chrome://extensions` → enable **Developer mode** → **Load
unpacked** → select the `dist/` folder.

- **Toolbar icon** — click to clean; click again to undo. Badge shows how many
  things were hidden (or `⏸` if a page keeps fighting back and auto-clean paused).
- **Keyboard** — `Alt+Shift+X` clean/undo, `Alt+Shift+P` pick an element.
  Change them at `chrome://extensions/shortcuts`.
- **Settings** — right-click the icon → *Options*: per-site auto-clean, picked-rule
  list, reset-site, and the element picker's tab chooser.

## How it works

- A content script runs at `document_start` (top frame only). On a toggle it finds
  every `position: fixed`/`sticky` element and any high-stacking overlay covering
  ≥ 60% of the viewport, and hides them with an injected
  `[marker]{display:none!important}` rule (plus an inline-`!important` fallback for
  elements that fight it with their own inline `!important`).
- Scroll locks on `html`/`body` (`overflow:hidden/clip`, negative-top fixed locks)
  are overridden **only on the locked axis** — `html`/`body` are *never* hidden.
- Everything we change is recorded in an idempotent **ledger**, so **Undo** restores
  exactly our own changes on nodes the page hasn't since modified — it never
  "restores the whole page" over your interactions.
- A debounced, bounded `MutationObserver` re-hides junk inserted after load and
  re-applies unlocks, without ever touching page-world globals.

## Compatibility & limits (honest)

- **Supported:** top document, open shadow roots (per-root hiding), `<iframe>`
  *elements* as overlays.
- **Not in this MVP (documented limitations, not bugs):** cleaning *inside* iframes
  (same- or cross-origin), closed shadow roots (host-level only), native
  `<dialog>.showModal()` top-layer inertness (visual hide may work, background
  inertness may remain), SPA route changes with no DOM mutation, Firefox.
- Aggressive by design: a legitimate sticky nav may be hidden too — that's accepted.
  Undo, element-pick, or turning off per-site auto-clean are the corrections.
- Hiding an element stops it intercepting clicks/focus, but does **not** stop its
  scripts/network and does **not** record cookie consent for you.
- Padding/scrollbar-gutter is not compensated; a tiny layout shift when a scrollbar
  reappears is possible.

## Privacy

Destick initiates **no outbound request and transmits no data anywhere**. Your
per-site choices and picked elements live only on this device in `chrome.storage.local`
(never `.sync`, no account). The content script has broad page access because it
must run on load to hide junk before you see it — but it never sends anything out.
This is checked in CI (`AC-A5`): a bundle/manifest audit plus a runtime monitor with
a positive control that proves the monitor actually catches a request.

## Develop

```bash
npm run build          # unpacked MV3 bundle → dist/
npm run typecheck      # tsc --noEmit
npm test               # unit (Vitest + happy-dom): detection, ledger, picker, release-check
npm run test:e2e       # Chromium E2E (Playwright, real extension): clean/undo, unlock, dynamics, zero-network
npm run release:check  # publication gate over docs/site-matrix.json (see docs/RELEASE-CHECK.md)
```

## Contributing

Issues and PRs are welcome — bug reports, sites where it struggles, and new
fixtures especially. See [CONTRIBUTING.md](CONTRIBUTING.md) and the
[Code of Conduct](CODE_OF_CONDUCT.md). Please run `npm test` before opening a PR.

## Security & privacy

Found a privacy or security issue? See [SECURITY.md](SECURITY.md) for how to
report it. The "no network / 100% local" claim is enforced in CI (see `tests/e2e/network.spec.ts`).

## License

[MIT](LICENSE). See the [changelog](CHANGELOG.md) for release notes.
