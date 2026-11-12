# Changelog

All notable changes to **Destick**.

## [0.1.0] — unreleased (first MVP)

One-click removal of sticky/fixed/overlay junk with scroll-unlock, reversible via a
toggle, per-site memory, an element picker, and a 100% local (storage-only, no network)
contract. Chrome MV3 first; Firefox-portable later.

### Added
- **Detection** — `position: fixed`/`sticky` elements + high-stacking overlays covering
  ≥ 60% of the viewport (`html`/`body` are never candidates).
- **Scroll unlock** — overrides `overflow:hidden/clip` and negative-top fixed scroll
  locks on the locked axis only.
- **Reversible undo** — an idempotent ledger restores exactly our own changes and yields
  to the page on any property/marker the page has since changed ("page wins").
- **Dynamics** — a debounced, bounded `MutationObserver` re-hides junk injected after
  load (delayed modals, node swaps) without touching page-world globals.
- **Element picker** — pick a stubborn element (incl. inside open shadow roots) with a
  conservative fingerprint; persisted as a per-site rule, with auto-clean on load.
- **Guaranteed hide** — injected `[marker]{display:none!important}` plus an inline-
  `!important` fallback (covers `HTMLElement` and `SVGElement`).
- **Privacy** — bounded zero-network, verified in CI with per-context positive controls.

### Verification
- `build` + `tsc` clean · **52 unit + 66 Chromium E2E** covering the full 99-case
  normative inventory (`tests/CASES.md`) · enforceable `release-check` publication gate.
- Hardened against a 2-round cross-model code review (23 findings fixed; a 3rd
  confirming pass is pending the reviewer's quota reset).
