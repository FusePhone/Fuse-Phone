# Force push Replit to GitHub

## What & Why
The Replit codebase needs to be pushed to the GitHub repo `FusePhone/FusePhoneCRM`, but normal push fails with PUSH_REJECTED because GitHub auto-created a README on the empty repo, causing divergence. The user confirmed nothing important lives on GitHub yet, so it is safe to overwrite the remote with Replit's history.

## Done looks like
- The `main` branch on `github.com/FusePhone/FusePhoneCRM` exactly matches the current Replit `main` branch (HEAD `6df296c` or newer).
- The user can see all current files (AuthPage with App Store badges, server/routes.ts with allow_promotion_codes, all multi-user seats work, etc.) on github.com.
- No local files are modified and the Replit app keeps working.

## Out of scope
- Setting up GitHub Actions, branch protection, or any CI.
- Editing any application code.
- Touching the internal `gitsafe-backup` remote.

## Steps
1. Confirm the GitHub remote URL on the `subrepl-tbftrsdo` remote points at `FusePhone/FusePhoneCRM` and that the Replit GitHub token is connected (re-prompt the user to reconnect if auth is still broken).
2. Fetch from the remote to see what's there (expect a single auto-created README commit on `main`).
3. Force-push the local `main` branch to the GitHub remote's `main`, overwriting the auto-README commit. Use `git push --force-with-lease` if possible; fall back to `--force` only if the remote ref is unknown.
4. Verify by fetching again and confirming the remote `main` SHA matches the local `main` SHA.
5. Report back to the user with the resulting commit SHA on GitHub so they can confirm in the browser.

## Relevant files
- `.git/config`
