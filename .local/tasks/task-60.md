---
title: Clean attached_assets and push to GitHub
---
# Clean attached_assets and push to GitHub

## What & Why
The push to GitHub fails because git history is ~1.6 GB. The cause is `attached_assets/` — 541 files (739 MB) accumulated from chat uploads. Only 11 of those files are actually referenced in the app code; the other 530 are unused screenshots, video recordings, mockups, and one-off images. User confirmed: delete every unused file from the working tree AND scrub the entire `attached_assets/` history, then push.

## Done looks like
- `attached_assets/` contains ONLY these 11 files (the ones referenced in code):
  - `fusephone-Dark-mode-transparent.png`
  - `fusephone-Lithg-mode_1770393097141.png`
  - `IMG_1718_1776431527489.png`
  - `IMG_1719_1776431527489.png`
  - `IMG_1720_1776431527489.png`
  - `IMG_1721_1776431527489.png`
  - `IMG_1722_1776431527489.png`
  - `IMG_1724_1776431527489.png`
  - `IMG_1727_1776431527489.jpeg`
  - `IMG_1729_1776431527489.jpeg`
  - `Jobs_List_20260408_111323_1775735129949.csv`
- Git history rewritten so old chat uploads no longer take up history space.
- `.git` shrinks from 2.6 GB to roughly 100 MB or less.
- Push to `https://github.com/FusePhone/Fuse-Phone.git` completes; remote `main` SHA matches local.
- App still runs cleanly (all retained assets verified present, no broken imports).

## Out of scope
- Touching `client/public/`, `attached_assets/screenshots/`, or any other folder. Only `attached_assets/` (top level).
- Editing any application source code.
- Removing the `gitsafe-backup` internal remote.

## Steps
1. Re-confirm the list of 11 referenced files by running ripgrep over `*.{ts,tsx,js,jsx,html,css,md,json}` for `@assets/...` and `attached_assets/...` patterns. Use `--no-filename` (not `-h`) so the search runs correctly. Stop if any new reference appears that wasn't in the keep-list.
2. Build a deletion list = (every file directly under `attached_assets/`) MINUS (the 11 referenced files). Delete them from the working tree with `rm`.
3. Commit the deletions on `main` so the working tree is clean.
4. Install `git-filter-repo` via `pip install --user git-filter-repo` (or `pip3`). Verify it's on PATH.
5. Use `git filter-repo` with `--invert-paths` and `--path` flags listing each of the 11 keep-files inside `attached_assets/`, combined with `--path attached_assets/screenshots/` if that folder should be preserved. Net effect: history now only knows about kept files inside `attached_assets/`, plus everything outside `attached_assets/` untouched. Use `--force` since this is intentional.
6. Run `git gc --prune=now --aggressive` and confirm `.git` is much smaller.
7. Re-add the GitHub remote if `git filter-repo` stripped it (it does this by default). Use the URL `https://github.com/FusePhone/Fuse-Phone.git` on a remote named `origin`.
8. Push with the user's `GITHUB_PAT` secret: `GIT_ASKPASS= GIT_TERMINAL_PROMPT=0 git -c credential.helper= push "https://x-access-token:$GITHUB_PAT@github.com/FusePhone/Fuse-Phone.git" main:refs/heads/main`.
9. Verify via GitHub API (`GET /repos/FusePhone/Fuse-Phone/branches/main`) that the remote SHA matches local `git rev-parse main`.
10. Restart the `Start application` workflow and confirm the app still serves and the kept logo/photos load.

## Relevant files
- `.git/config`
- `attached_assets/`