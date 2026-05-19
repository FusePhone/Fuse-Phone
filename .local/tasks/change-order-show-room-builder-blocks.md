# Show Room Builder rooms in Change Orders

## What & Why
When a contractor builds a Change Order using a Room Builder estimate block (a "production rate block" with rooms, surfaces, walls/ceiling, etc.) instead of plain line items, the Change Order saves the totals correctly but its body shows up blank everywhere except the customer portal's main view of that one document.

In the screenshot the user shared (CO #000256, "Accepted", $1,179.97, signed by the customer), the contractor opens the change order from inside the parent proposal and sees:
- Header info (client, job address, CO #, "For: …")
- Empty space where the rooms/line items should be
- Total row with the correct $1,179.97
- Customer signature

The customer signed it because the public customer-portal page renders both line items AND production rate blocks (it merges them via `itemOrder`). But the contractor's in-app viewer, the "Show Details" view of accepted COs inside the parent doc, the customer-mode preview of attached COs, and the PDF generator all only iterate `content.items` — so any CO built from a Room Builder block looks empty in those views.

## Done looks like
- Opening a Change Order built from a Room Builder block (in the contractor's full-page CO popup) shows the rooms with surfaces, square footage, coats, and pricing — exactly the same content the customer saw when they signed.
- Mixed Change Orders (some Room Builder blocks + some manual line items) render in the saved entry order, with both block(s) and item(s) visible.
- Plain line-item Change Orders keep rendering exactly as they do today — no regression.
- The "Show Details" expanded section under the parent proposal/invoice (both contractor view and the customer-view mode of the parent doc) shows the same content, including blocks.
- The PDF export of a parent proposal/invoice that has signed Change Orders attached includes any Room Builder blocks from those COs (not just the line items).
- The customer portal's standalone view of the change order keeps working unchanged (it already does the right thing).

## Out of scope
- No changes to how Change Orders are *created* or *edited* — the editor already handles blocks correctly; this is purely a render/view bug.
- No data migrations — historical COs already have the correct data in `content.productionRateBlocks` and `content.itemOrder`; we just need to render it.
- No tax recalculation changes — the per-block tax bucketing already works in the customer portal renderer; reuse the same approach.

## Steps
1. **Audit the customer portal's CO rendering pattern.** It's the only view that already handles this correctly: it builds `orderedEntries` by walking `content.itemOrder` and merging `content.items` + `content.productionRateBlocks`, then renders blocks via `ProductionRateBlocksSection` and items via `LineItemRenderer`. Treat this as the reference pattern and extract a small shared helper or component so the four other render sites can reuse it without copy-pasting tax/optional/hidden-area logic.
2. **Fix the contractor's full-page Change Order popup.** Replace the `items?.map(...)` block with the shared renderer so it shows blocks + items in the saved order. This is the screenshot the user reported.
3. **Fix the "Show Details" sections inside the parent document.** Two spots: one rendered in internal/contractor mode, one rendered in customer-view mode of the parent doc. Both currently iterate items only. Switch them to the shared renderer.
4. **Fix the customer portal's "accepted change orders" sub-section inside the parent proposal/invoice.** The standalone CO view is fine, but when the parent doc lists its accepted COs inline (mobile + desktop layouts), it also only iterates items. Switch them to the shared renderer.
5. **Fix the PDF generator.** When attaching signed change orders to a parent-document PDF, the generator currently only walks `co.content.items`. After items, also walk `co.content.productionRateBlocks` (in `itemOrder` sequence) and emit a compact tabular representation of each room/surface using the same totals already in `block.roomBuilderData`. Page-break behavior must continue to work.
6. **Manual smoke test.** Verify with three scenarios: (a) a CO with only a Room Builder block — the screenshot case, body now shows the room; (b) a CO with mixed blocks + items in custom order — order is preserved; (c) a CO with only plain line items — unchanged. Verify the contractor full-page view, the "Show Details" inline section, the customer portal parent view, and the PDF export.

## Architectural notes
- `content.itemOrder` is an array of strings like `["block","item","item","block"]` that interleaves blocks and items in the order the contractor arranged them in the editor. The renderer must walk this array, popping from `productionRateBlocks` and `items` respectively. When `itemOrder` is missing (older COs), fall back to "all blocks first, then all items" — which is what the customer portal already does.
- `ProductionRateBlocksSection` is the existing component that renders one or more production rate blocks for both contractor and customer view modes. Reuse it; do not invent a new renderer.
- The bug is render-only; the data model is already correct. Do NOT touch the schema, the create/edit dialogs, or the storage layer.

## Relevant files
- `client/src/pages/DocumentDetail.tsx:6077-6265`
- `client/src/pages/DocumentDetail.tsx:4072-4170`
- `client/src/pages/DocumentDetail.tsx:3340-3450`
- `client/src/pages/CustomerPortal.tsx:1699-1808`
- `client/src/pages/CustomerPortal.tsx:2247-2320`
- `client/src/components/CreateChangeOrderDialog.tsx:147-200`
- `client/src/components/EditChangeOrderDialog.tsx:95-130`
- `client/src/components/LineItemRenderer.tsx`
- `client/src/lib/pdfGenerator.ts:2195-2280`
