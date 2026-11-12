# Destick — store listing & launch assets (draft)

Copy for the Chrome Web Store listing + GitHub, and the before/after demo plan.
Nothing here is published; it's ready for nixa to use when we ship.

---

## Name
**Destick** — Kill Sticky
(Checked free on Chrome Web Store, Firefox AMO, and npm, 2026-11-12. "Unstick" was
dropped — it collides with existing Firefox add-ons + an iPhone app.)

## Short description (Chrome Web Store, ≤ 132 chars)
> One click hides sticky headers, cookie bars, modals & overlays — and restores scrolling. Reversible, per-site, 100% local.

## Long description
Sticky headers, cookie bars, newsletter modals, floating chat bubbles, social-share
rails, full-screen "please disable your ad blocker" overlays — one click and they're
gone, and your scrolling comes back. Click again to undo. Nothing is permanent, nothing
leaves your device.

Destick is the reliable, reversible, open-source one-click version of the well-known
Kill-Sticky bookmarklet — but it remembers your choice per site, catches junk that
appears after the page loads, lets you pick stubborn elements by hand, and it does not
spy on you.

**Why Destick**
- One click from the toolbar or a keyboard shortcut — no re-pasting on every page.
- Restores scrolling by unlocking the page's scroll-lock, not just hiding the bar.
- Reversible: undo without reloading (it's a toggle).
- Per-site memory + optional auto-clean on load.
- Element picker for stubborn cases — no filter syntax to learn.
- Catches delayed modals and SPA-injected junk via an observer.
- 100% local: no account, no network, no tracking. Verifiably so.

**Honest about limits:** it's aggressive by design (a legitimate sticky nav may be
hidden too — undo or per-site off fixes that). It doesn't clean inside iframes or closed
shadow roots, doesn't neutralize a native modal dialog's background inertness, and
doesn't record cookie consent for you.

Free and open source (MIT).

## Permissions justification (for the store review)
- **storage** — to remember your per-site choices and picked elements on THIS device
  (`chrome.storage.local`, never `.sync`, no account).
- **Broad content-script match (`http://*/*`, `https://*/*`)** — the extension must run
  at `document_start` to hide junk before you see it; it has NO host permissions,
  NO `tabs`/`activeTab`/`scripting`, and initiates no network requests.

## Screenshots (1280×800, Web Store needs ≥ 1, up to 5)
1. A news article with a sticky header + cookie bar — BEFORE.
2. The same page after one click — junk gone, full content — AFTER.
3. The Options page (per-site auto-clean + picked-rule list).
4. The element picker highlighting a stubborn element.
5. The toolbar badge showing the hidden-count.

## Before/after demo GIF (docs/demo.gif) — storyboard
Record in your own Chrome with Destick loaded unpacked (the in-app browser can't load
unpacked extensions). ~6–8s loop, ≤ 3 MB, 1000–1280px wide.

1. Open a junk-heavy page (e.g. a news site with a sticky header + cookie bar + a
   newsletter modal). Wait for the junk to be visible. (~1.5s)
2. Try to scroll — show it's scroll-locked / the bar follows. (~1.5s)
3. Click the Destick toolbar icon (or press Alt+Shift+X). Junk vanishes, scroll frees.
   Scroll down smoothly to prove it. (~3s)
4. Click again → everything comes back (reversible). (~1.5s)

Tools: Chrome + a screen recorder (e.g. Kap / macOS screenshot ⇧⌘5 → convert to GIF),
or `ffmpeg -i rec.mov -vf "fps=15,scale=1100:-1:flags=lanczos" docs/demo.gif`.
Drop the file at `docs/demo.gif` — the README already references it.

## Launch posts (when live)
- **Show HN:** "Show HN: Destick – one-click, reversible, 100% local sticky/overlay
  remover (MIT)". Lead with the problem + the before/after GIF + the privacy angle.
- **r/chrome_extensions**, **r/firefox** (after the Firefox port): same framing, link the
  repo + store listing.
