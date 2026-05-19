# Push Replit code to GitHub remote

## What & Why
The user connected this Replit workspace to the GitHub repo `https://github.com/FusePhone/FusePhoneCRM` but pushes are being rejected with `PUSH_REJECTED` because the GitHub remote has at least one commit (very likely an auto-generated initial commit / README created when GitHub created the repo) that does not exist in this Replit workspace. The user has confirmed they have NOT done any work directly on GitHub — everything real lives here in Replit. The fix is to reconcile the two histories so the Replit workspace's code lands on GitHub.

## Done looks like
- `git push` to the `subrepl-tbftrsdo` / GitHub remote succeeds from this workspace.
- The GitHub repo `FusePhone/FusePhoneCRM` shows the latest commit `6df296ca Add App Store badges and improve checkout promo code functionality` and the full project tree (App Store badges, multi-user seats, billing, etc.) as it exists in this Replit workspace.
- No code or commits in this Replit workspace are lost.
- Future pushes from Replit work without rejection.

## Out of scope
- Changing the GitHub repo's branch protection rules, collaborators, or settings.
- Setting up GitHub Actions or any CI/CD.
- Any code changes — this is purely a git-history reconciliation.

## Steps
1. **Inspect divergence.** Run `git fetch` against the GitHub remote and see exactly what commits exist there that aren't in this workspace. Confirm they are throw-away (e.g. an "Initial commit" with a README/.gitignore from the GitHub web UI) and NOT real work.
2. **Attempt pull-with-rebase first (non-destructive).** Try `git pull --rebase` against the GitHub remote's `main` branch. If it succeeds with no real conflicts (just trivial merges of a README), push the result.
3. **Fallback: force-push.** If the rebase produces conflicts or pulls in unrelated history, the user has confirmed the GitHub side has nothing important. In that case, force-push this workspace's `main` over the GitHub `main` so GitHub mirrors Replit exactly.
4. **Verify.** After pushing, confirm `git status` shows the local branch is up to date with the remote, and that the latest commit on GitHub matches `6df296ca`. Print the final state.
5. **Leave a note** for the user explaining what happened so they know whether the GitHub side was merged or overwritten.

## Critical constraints
- Do not modify any source files. This is purely git history work.
- Do not delete or rewrite any commits that exist ONLY in this Replit workspace — those are the user's real work.
- If anything ambiguous comes up (e.g. the GitHub remote actually has real commits with meaningful code), stop and surface the situation rather than force-pushing.

## Relevant files
- `.git/config`
