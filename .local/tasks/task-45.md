---
title: Lite Job P&L for Core tier (manual labor entry)
---
# Lite Job P&L for Core Tier

## What & Why
Core-tier users currently see the full Job P&L card on the project detail page, but it depends on time tracking, locked hourly rates, payroll burden, and overhead-per-hour — features they don't have on Core. The numbers come out wrong or empty. Build a simplified "Lite" P&L for Core that lets them get a real profit number with one manual labor input, while leaving the full Elite P&L untouched.

## Done looks like
- A Core user opens any of their projects and sees a P&L card with four numbers:
  - Revenue (auto from the accepted proposal / invoice — same source as today)
  - Materials & Receipts (auto-summed from receipts/expenses uploaded to that project)
  - Labor Cost (one editable field, the user types what they paid the crew on this job)
  - Net Profit + Margin (calculated automatically from the above)
- The labor input persists per project — close the page, reopen it, the number is still there.
- An Elite user sees exactly what they see today: revenue, materials, fully-loaded labor from time entries, overhead allocation, gross margin, net margin, snapshot lock badge — nothing changes for them.
- A Starter user still sees no P&L card (current behavior).
- The card never shows the time-tracking warning ("missing hourly rates"), overhead row, or "Set up overhead expenses" link to Core users.

## Out of scope
- Time tracking on Core (stays Elite-only).
- Crew Management on Core (stays Elite-only).
- Auto-pulling labor from anywhere (Core labor is purely manual).
- Allowing Core to override the auto Materials/Receipts total (they update it by adding/removing receipts on the project).
- Locking / snapshotting the Core P&L on completion.
- The unrelated Financials sidebar bug (currently `maxTier: "starter"`) — leave alone for now.

## Steps
1. **Schema** — Add a `manualLaborCostCents` integer column to the `projects` table for Core's manual labor entry. Default null. Run a safe schema push.
2. **Backend P&L endpoint** — Add a tier-aware Lite P&L computation that returns `{ revenue, materialsAndReceipts, manualLaborCostCents, netProfit, margin }` for Core users, sourcing materials from `project_expenses` (sum of approved receipts/expenses) and revenue from the same source the existing P&L uses. Elite users continue to hit the existing full job-costing endpoint — do not modify that path.
3. **Save labor endpoint** — Add a `PATCH` route that updates `manualLaborCostCents` on a project. Validate the user owns the project. Return the updated lite P&L payload.
4. **Frontend Lite P&L card** — On the project detail page, when the user's tier is Core, render a new compact card with the four numbers, an inline editable Labor Cost input (saves on blur with optimistic update via React Query), and a "Net Profit" total that turns red/green like the Elite card. Hide the Materials Summary block, missing-rates warning, overhead row, gross-margin row, and snapshot badge.
5. **Tier switching** — In the project detail view, branch on `userTier`: Starter → no card (today's behavior), Core → new Lite card, Elite → existing full P&L card unchanged. Make sure both query keys invalidate cleanly when switching projects so stale numbers never paint.

## Notes / constraints
- Do NOT bump `__BUILD_TIMESTAMP__` (per replit.md — wipes IndexedDB cache for every user).
- Reuse the existing receipts/expenses query so the materials number stays in sync when a Core user uploads a receipt — don't fetch separately.
- The Lite labor input should accept dollar input but store cents on the server (project pattern).
- Elite path must remain byte-identical for the user — no shared component refactors that change Elite layout.

## Relevant files
- `client/src/pages/ProjectDetail.tsx:6470-6660`
- `client/src/hooks/use-subscription.ts:41-83`
- `shared/schema.ts:1142-1399`
- `server/routes.ts:14425-14500`
- `server/routes.ts:24956-25000`
- `server/routes.ts:26898-27000`
- `server/routes.ts:36079-36300`