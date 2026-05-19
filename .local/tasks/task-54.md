---
title: iOS IAP upgrade fix + clean signup tier
---
# iOS IAP upgrade reliability + clean signup tier

## What & Why
Two related bugs surfaced from the live iOS diagnostics:

1. **Tier upgrades from Starter → Core/Elite silently fail.** Apple charges the card and the new product becomes `owned` on-device, but `cordova-plugin-purchase`'s `approved` event never fires for the new transaction in an already-replayed receipt, so `/api/iap/sync` is never called and the server tier stays put. The user only sees a generic timeout error.

2. **Stale add-on replays poison every error message.** On every app launch the plugin replays prior approved transactions, including any `ai_assistant_monthly` / `make_it_your_own_monthly` the user purchased while on Starter. The server correctly rejects those with HTTP 409 ("AI Virtual Assistant requires the Elite plan"), but our client stores that as `lastSyncError`. When a *different* purchase later times out, the timeout surfaces the stale 409 — making the upgrade look like it failed because of the AI Assistant gate.

3. **New accounts are created on `subscription_tier = 'starter'` even though Starter is a paid tier.** Email signup (`server/customAuth.ts`), Google signup (`server/nativeAuth.ts`), affiliate signup, and the user-row insert in `server/index.ts:236` all hard-code `'starter'` as the default. There is no "no plan / not yet paid" state, so a brand-new user appears entitled to Starter features without ever being charged, and the IAP paywall has nothing clean to upgrade *from*.

## Done looks like
- Tapping Core or Elite on the iOS paywall reliably switches the account on the server within a few seconds of the App Store sheet completing — no "timeout" message when Apple actually charged.
- After a successful upgrade, the previous tier's transaction is finished on-device and not replayed on the next app launch.
- Stale add-on 409s no longer appear as the error message of an unrelated tier purchase. If an add-on truly cannot activate (user is not Elite), the user sees a clear, dedicated message about the add-on, not the tier purchase.
- A brand-new signup lands on `subscription_tier = 'none'` (or equivalent) with `subscription_status = 'inactive'`. The app's gating treats this as "must choose a plan" and shows the paywall; after a successful first purchase the account flips to the chosen tier.
- The existing test account (`commercialp97@gmail.com` and any other accounts with mismatched starter+addon ownership) is reset so future tests start clean.
- Production logs continue to capture the full `[IAP-DIAG]` lifecycle so we can verify the fix end-to-end.

## Out of scope
- Android / Google Play billing (iOS only for now).
- Server-side App Store Connect Subscription Group reconfiguration (already correct — diagnostics confirmed all 3 tier products are returned with `valid` offers).
- Refactoring the Stripe (web) billing path — it is independent and working.
- Building a new "free trial" tier. This task only introduces a clean "no plan / inactive" state for brand-new accounts.

## Steps
1. **Receipt-driven sync on iOS.** Stop relying solely on `chain.approved`. After every `receipt.updated`, walk `store.localReceipts` / `verifiedReceipts`, dedupe by `transactionId`, and call `/api/iap/sync` for any transaction we have not already synced this session. Keep the existing `approved` handler as a fast path. Finish each transaction only after the server responds 2xx (or after a permanent rejection like the cross-user-ownership 409), so successful upgrades are not re-replayed indefinitely.

2. **Per-purchase error scoping.** Replace the single shared `lastSyncError` with a map keyed by `productId` (or by `tier` / `addon`). `purchaseTier` and `purchaseAddon` must only surface errors that came from a sync of *their own* product — never an unrelated add-on replay. Stale add-on errors should still be logged via `reportDiag` but must not bubble into a tier purchase's user-facing message.

3. **Client-side add-on gating.** Before calling `offer.order()` for an add-on, check the user's current server tier. If the add-on requires Elite and the user is not Elite, show a clear "Upgrade to Elite first to enable this add-on" message and do not start the StoreKit purchase. Also: when the IAP plugin auto-replays an add-on the user can't activate, do not POST to `/api/iap/sync` for it — just log the diagnostic and finish the transaction.

4. **Clean signup tier.** Introduce a "no plan" sentinel value (`subscription_tier = 'none'`, `subscription_status = 'inactive'`) and use it as the default on every signup path: email signup, Google signup, affiliate signup, and the bootstrap user-insert in `server/index.ts`. Update server-side feature gating that currently treats absence as Starter to treat the sentinel as "no entitlement → show paywall". Update the iOS paywall and the web upgrade modal to render correctly when the user is on `none`.

5. **Reset poisoned test accounts.** Write a one-shot admin endpoint (or extend the existing `/api/admin/delete-user`-style helper) that, given an email, clears `subscription_tier`, `subscription_status`, `apple_original_transaction_id`, and all `apple_*_original_txn_id` add-on columns back to the new "none / inactive" state without deleting the row. Run it for `commercialp97@gmail.com` and any other accounts that show the starter+addon mismatch.

6. **End-to-end verification on TestFlight.** Sign in fresh, confirm the account starts on `none / inactive`, purchase Core, confirm the server flips within ~5s, purchase the AI Assistant add-on, confirm activation, kill and relaunch the app, and confirm no stale 409 errors and no duplicate sync calls. Capture the `[IAP-DIAG]` log trail and attach it to the task completion.

## Critical constraints
- **Do not change the server `/api/iap/sync` contract.** The cross-user ownership check, the `appAccountToken` validation, the stale-transaction guard, and the Apple-reviewer skip must all remain exactly as they are. The fix is to call sync correctly from the client and to scope errors correctly, not to weaken server validation.
- **Do not auto-cancel Apple subscriptions from the server.** Apple does not allow this. The "reset test account" helper only clears our DB columns; the user must cancel the underlying Apple subscription themselves via Settings → Apple ID → Subscriptions.
- **Preserve the diagnostics.** Keep `reportDiag` calls; add new ones for the receipt-driven sync path (`receipt.sync.start`, `receipt.sync.skip_already_synced`, `receipt.sync.ok`, `receipt.sync.error`).

## Relevant files
- `client/src/lib/iap.ts:38-52,59-91,130-170,200-272,477-600,620-745,760-812`
- `client/src/components/IOSPaywall.tsx:260`
- `server/routes.ts:17242-17264,17269-17433,17435-17502,17600-17650`
- `server/customAuth.ts:425-430,870-880,1115-1125,1455-1462`
- `server/nativeAuth.ts:100-110`
- `server/index.ts:230-240,420-430`
- `server/referralRoutes.ts:605-615`
- `server/storage.ts:2424`
- `shared/models/auth.ts`