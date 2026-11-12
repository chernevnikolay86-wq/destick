# GitHub repo setup — Destick (launch-ready)

Everything needed to make the public repo look professional. nixa runs the commands
(the agent doesn't push). Replace `OWNER` with your GitHub username/org.

## 1. About / description (Settings → paste in the "About" box)
> One click removes sticky headers, cookie bars, modals, chat bubbles & overlays — and restores scrolling. Reversible, per-site, 100% local. Open-source MV3 browser extension (MIT).

Website field: your Chrome Web Store URL once live.

## 2. Topics (Settings → Topics, or `gh repo edit --add-topic`)
```
chrome-extension, browser-extension, manifest-v3, typescript, productivity,
privacy, open-source, declutter, overlay-remover, cookie-banner, reading-mode,
sticky, mutation-observer, no-tracking
```

## 3. Replace the `OWNER` placeholder (badges + issue links)
From `projects/kill-sticky/`:
```bash
grep -rl 'chernevnikolay86-wq/destick' README.md .github | xargs sed -i '' 's#chernevnikolay86-wq/destick#<your-username>/destick#g'
```
(Linux: drop the `''` after `-i`.)

## 4. Create + push the repo
This folder is not a git repo yet; make it one and push. `.gitignore` already keeps
orchestrator-internal files (`tasks/`, `versions/`, `marketing/`, `PROJECT.md`,
`AGENTS.md`, `.trail/`, `.claude/`) out of the public repo — `src/`, `tests/`,
`docs/` (incl. `demo.gif` + `samples/`), `.github/`, and the community files go in.

```bash
cd "projects/kill-sticky"
git init -b main
git add .
git commit -m "Destick 0.1.0 — one-click sticky/overlay remover (MV3, MIT)"
gh repo create destick --public --source=. --remote=origin --push \
  --description "One click removes sticky headers, cookie bars, modals & overlays — and restores scrolling. Reversible, per-site, 100% local. MV3, MIT."
gh repo edit --add-topic chrome-extension,browser-extension,manifest-v3,typescript,productivity,privacy,open-source,declutter,overlay-remover,cookie-banner,reading-mode,sticky,mutation-observer,no-tracking
```
Verify the **CI badge** goes green (Actions tab) — the workflow runs build + typecheck
+ 50+ unit tests and the Chromium E2E on every push/PR.

## 5. Social preview image (Settings → Social preview, 1280×640)
Use a before/after frame. Quick one from the demo:
```bash
ffmpeg -y -ss 2.6 -i marketing/assets/demo/destick-demo-raw.webm -frames:v 1 before.png
ffmpeg -y -ss 7.0 -i marketing/assets/demo/destick-demo-raw.webm -frames:v 1 after.png
# then compose before|after side by side (1280×640):
ffmpeg -y -i before.png -i after.png -filter_complex \
  "[0:v]scale=640:640:force_original_aspect_ratio=increase,crop=640:640[l];\
   [1:v]scale=640:640:force_original_aspect_ratio=increase,crop=640:640[r];[l][r]hstack" social-preview.png
```

## 6. Nice-to-haves after push
- Enable **Discussions** (the issue-template config links to it).
- Add a **Release** `v0.1.0` (attach `unstick-dist.zip` / a fresh `dist.zip` so people
  can load it without building).
- Pin the repo on your profile.

## What's in the repo (meta added)
- `.github/ISSUE_TEMPLATE/` — site report · bug · feature (forms) + config.
- `.github/PULL_REQUEST_TEMPLATE.md`, `.github/workflows/ci.yml`, `.github/FUNDING.yml`.
- `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, `SECURITY.md`, `CHANGELOG.md`.
- `README.md` badges (CI · MIT · MV3 · 100% local · PRs welcome) + `docs/demo.gif`.
