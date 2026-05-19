---
title: Fix legacy customer portal links
---
# Fix legacy customer portal links

## What & Why
Customers are getting "Document not found" / "not yet shared" when they click their existing portal links — for example `https://app.fusephone.com/portal/document/vxpqC59M6Y3fQxV9g4HAEzSQ`. The user reports many of these.

Root cause: when we shipped the "snapshot the version the customer sees" feature, the portal API was changed to require a `publishedAt` timestamp on the document before it will serve the document to a customer. The check is in the portal GET endpoint: if the document is a proposal/estimate/change_order and has no `publishedAt`, it returns 404 with `{ notShared: true }`. That gate is fine for new documents (we set `publishedAt` whenever the contractor sends or shares), but every proposal / estimate / change order that existed **before** the feature shipped still has `publishedAt = NULL`, even though it has:

- a valid `publicToken` already in the customer's inbox / SMS / email,
- a real `content` and `totalAmount`,
- often a `firstViewedAt` (the customer opened it before),
- often a `signature` (the customer already signed it).

The customer reopens their old link and the API rejects it. The contractor sees the document fine internally (they're logged in, so the gate is bypassed). The CO #000256 / Alona Weiss case the user just hit is the classic shape: signed by the customer, viewable to the contractor, broken to the customer.

The user has confirmed this should be fixed for **every** existing proposal, estimate, and change order — not just the ones with a signature on file. Many were sent through SMS/email channels where `firstViewedAt` may never have fired (bot blocking, email previewers, etc.) but the customer still has the link.

## Done looks like
- Every existing portal link the user has previously sent — proposals, estimates, change orders — opens for the customer again. No more "not yet shared" 404s on legacy links.
- Documents the customer already viewed or signed before the snapshot feature shipped open showing the same content as before (the live `content`, frozen as the new snapshot at backfill time).
- Brand-new drafts the contractor creates *after* this fix continue to be hidden from anonymous visitors until the contractor actually sends/shares them — the draft gating still works as intended for net-new work.
- The portal endpoint never 404s a document that has clear evidence it was already shared with a customer (a signature on file, a `firstViewedAt`) — even if `publishedAt` somehow ends up null in the future for any reason.
- The contractor's "Unpublished changes" banner does NOT light up across every old document the morning after the fix. Backfilled snapshots use the document's own `updatedAt` as the published timestamp so nothing looks dirty by default.
- The contractor's own internal preview of every document is unchanged. They keep seeing the live working version while logged in.

## Out of scope
- Redesigning the publish/version-locking feature itself. Snapshots stay; we're only fixing backfill + the 404 gate.
- Touching the change-order render bug already covered by Task #29 (Show Room Builder rooms in Change Orders).
- Any other portal route — we only need to fix the document GET; the other portal sub-routes (change-orders list, payments, photos, etc.) load via the parent doc and inherit the fix.

## Steps
1. **Backfill every existing proposal / estimate / change order.** Write a one-shot script (run via `tsx`) that updates every row in `documents` where `type IN ('proposal','estimate','change_order')` AND `published_at IS NULL`, regardless of status or signature. For each row set `published_content = content`, `published_total_amount = total_amount`, and `published_at = COALESCE(updated_at, created_at)`. Using `updated_at` as the published timestamp matters: it keeps the contractor-side "Unpublished changes" banner quiet (the banner only fires when `updated_at > published_at + 2s`), so the morning after the backfill nothing looks dirty. The script must be idempotent — re-running it must not touch already-published rows. Print per-type counts (proposals / estimates / change_orders) before and after.
2. **Soften the portal gate as a permanent safety net.** Update the portal document GET endpoint so the "draft" 404 only fires for documents that genuinely look like a fresh draft: proposal/estimate/change_order with `publishedAt IS NULL` AND no signature AND no `firstViewedAt` AND status still `draft`. In every other case, serve the document. When `publishedAt` is set, keep using the published snapshot for customer view (existing behavior). When `publishedAt` is null but the doc has a signature or `firstViewedAt`, serve the live `content` / `totalAmount` (the customer is reopening something they already engaged with — show them what's actually there). This keeps net-new drafts hidden while making sure the bug never recurs.
3. **Mirror the same fallback for the change-orders sub-route.** The `/api/portal/document/:token/change-orders` route currently filters child COs by `internalCo || co.signature || co.publishedAt`. That's already permissive, but verify it stays correct after the gate change — a CO with a signature but no `publishedAt` should still show up on the customer's portal under the parent doc, and should render its live `content` (no snapshot) without crashing.
4. **Smoke test the fix.** With the backfill applied, open the user's broken link (`/portal/document/vxpqC59M6Y3fQxV9g4HAEzSQ`) as a logged-out customer and confirm the document loads, totals match, signature shows. Open one fully-fresh proposal/estimate/change-order link from each type and confirm they load. Then create a brand-new draft proposal in the contractor view (never sent, no signature, no views) and confirm an anonymous visit to its public link still 404s. Verify the contractor's internal view of all of the above is unchanged. Verify the "Unpublished changes" banner is not falsely flagged on any of the backfilled documents.

## Architectural notes
- Server-side `documents` schema fields involved: `publicToken`, `publishedAt`, `publishedContent`, `publishedTotalAmount`, `content`, `totalAmount`, `signature`, `firstViewedAt`, `status`, `type`.
- Portal endpoint to change: `GET /api/portal/document/:token` in `server/routes.ts`. Two blocks: the 404 gate (~line 1522) and the snapshot swap (~line 1568). The fallback for legacy docs should NOT swap to `publishedContent`/`publishedTotalAmount` when those columns are null — it should leave `content` / `totalAmount` as-is so the customer sees the only version that exists.
- Internal-preview detection (owner or company user) is already in place and must keep bypassing every gate.
- The backfill should run against the production database. Dev currently has zero affected rows (everything is already published in dev), so dev can be used to dry-run the script logic, but the actual recovery needs to happen in prod.
- Rationale for backfilling drafts too: drafts have a random 22-char public token that is only ever exposed if the contractor copied/sent the URL. If the contractor sent it (which is exactly the user's complaint), the customer needs to be able to open it. If the contractor never sent it, no one can guess the token, so backfilling it is harmless. The "Unpublished changes" banner stays quiet because we set `published_at = updated_at`.

## Relevant files
- `server/routes.ts:1500-1610`
- `server/routes.ts:2640-2790`
- `server/storage.ts:520-690`
- `shared/schema.ts:480-525`
- `client/src/pages/CustomerPortal.tsx:230-260`
- `client/src/pages/DocumentDetail.tsx:1000-1030,2655-2690`