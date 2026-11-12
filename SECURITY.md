# Security & privacy policy

Destick's core promise is **100% local, no network**. If you find anything that
breaks that promise, or any other security issue, we want to hear about it.

## Reporting

Please report privately — **do not** open a public issue for a security/privacy bug:

- Preferred: open a private advisory at
  `https://github.com/chernevnikolay86-wq/destick/security/advisories/new`, or
- Email the maintainer (see the repo profile).

Include what you found, how to reproduce it, and the version (`chrome://extensions`).
We aim to acknowledge within a few days.

## Scope / what counts

- The extension initiating **any** outbound network request or transmitting data.
- Any data leaving the device (beyond `chrome.storage.local`, which is on-device).
- Escalation beyond the declared `storage` permission.
- A way for a visited page to make Destick exfiltrate data or run attacker code.

## Design guarantees (and how they're checked)

- Permissions: `storage` only. No host permissions, no `tabs`/`activeTab`/`scripting`,
  no remote code, no `web_accessible_resources` carrying data.
- No `fetch`/XHR/WebSocket/`sendBeacon`/`EventSource` in the shipped bundle.
- CI enforces this (`tests/e2e/network.spec.ts`): a manifest + production-bundle
  audit, a runtime monitor across all three extension contexts, and a positive
  control proving the monitor actually catches a request.

Verify it yourself: load `dist/` unpacked and watch the Network tab of the
service worker, the options page, and a content-script context.
