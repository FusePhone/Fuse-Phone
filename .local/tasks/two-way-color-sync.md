# Two-Way Color Sync Between Customer & Contractor

## What & Why
Customer color selections from the review page need to appear on the contractor's Colors tab in real-time, and contractor color changes need to reflect on the customer review page. Currently, customer picks save to `color_submissions.entries` but don't reliably sync back to the contractor's `project_color_selections` table that drives the room color display. The reverse (contractor → customer) also needs to work.

## Done looks like
- When a customer picks a color on the review page, the contractor's Colors tab shows that color immediately (via WebSocket)
- When the contractor assigns/changes a color on the Colors tab, the customer review page reflects it
- Reverting a color on either side clears it on the other
- App is running without crashes

## Out of scope
- Changing the approval workflow
- Notification changes (already handled)

## Tasks
1. **Fix app crash** — Resolve port conflict and restart the application.
2. **Customer → Contractor sync** — Ensure customer color picks from submit-colors route properly update `project_color_selections` table so contractor's room color list shows customer choices with color name, hex, and sheen.
3. **Contractor → Customer sync** — When contractor assigns or changes a color on the Colors tab, update the corresponding `color_submissions.entries` so the customer review page shows the contractor's latest choices.
4. **Verify real-time updates** — Confirm WebSocket events trigger proper query invalidation on both sides.

## Relevant files
- `server/routes.ts:31172-31296`
- `server/routes.ts:30500-30650`
- `server/routes.ts:30780-30890`
- `client/src/pages/ProjectDetail.tsx:928-960`
- `client/src/pages/ProjectDetail.tsx:1325-1400`
- `client/src/pages/ProjectDetail.tsx:1876-1960`
- `client/src/pages/ColorReview.tsx`
- `client/src/lib/realtime.ts:234-241`
- `shared/schema.ts:2128-2145`
