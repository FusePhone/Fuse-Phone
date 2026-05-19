# Always Calculate Gallons Correctly

## What & Why
The material calculation has a correctness gap: when a room has a fixed-price override, that room is **dropped entirely** from the gallon math. The result: gallon counts come out short, and the existing per-block display toggles (`showMaterialQty`, `showMaterialPrice`, etc.) have nothing accurate to fall back on.

This task is about **calculation correctness**, not display. The display layer keeps its existing toggles untouched — they decide what the customer sees. We're fixing the underlying numbers so that whenever those toggles are turned on, the values they render are right.

The rule for the calculation:
- Gallon counts are **always calculated** on every surface/group, regardless of price override or "Customer providing materials".
- Material **dollar cost** is added to the proposal total only when the contractor is supplying the paint AND the room is not under a price override (since the override price already covers it).
- Rounding stays exactly `Math.ceil(exactQtyNeeded)` — to the next whole gallon, no buffer. 400.0 sqft against 400-sqft coverage = 1 gal. 400.1 sqft = 2 gal.

## Done looks like
- A room with a fixed-price override **contributes its sqft** to per-surface and per-group gallon aggregates. Its share of the dollar cost is excluded from the material total (proportional to its sqft) so the customer is never billed twice.
- Material groups that span overridden + non-overridden rooms compute total gallons against the **full sqft pool**. So 5 rooms × 0.6 gal of the same paint = 3 gal even if one of those rooms has an override.
- "Customer providing materials" continues to work as today: gallon math runs in full, but `totalMaterialCost` is **not** added to the grand total and the "Materials" line item is suppressed.
- Override + Customer-providing combinations behave correctly: gallon numbers are accurate, no double charging anywhere.
- Rounding: per-surface and per-group totals both use `Math.ceil(exactQtyNeeded)` with no padding.
- Display toggles (`showMaterialQty`, `showMaterialPrice`, `showSurfaceTotal`, `showOverrideTotal`, `showMaterials`, `showLaborHrs`, `showLaborPrice`, etc.) continue to work exactly as before — what they render is now correct in every scenario.
- The contractor's RoomBuilder summary, the saved proposal "Materials" line item, the customer-facing block view, and the PDF all use the same corrected numbers.

## Out of scope
- **No changes to display toggles** — `showMaterialQty`, `showMaterialPrice`, `showSurfaceTotal`, `showLaborHrs`, `showLaborPrice`, `showSurfaceDetails`, `showOverrideTotal`, `showCostBreakdown`, `showMaterials` all keep their current behavior. This task only fixes the numbers they consume.
- No changes to the markup formula or where markup is configured.
- No changes to the waste percentage formula or default.
- No "headroom" or buffer added to rounding (explicitly rejected by the user).
- No restructuring of how Material Groups are created/edited.
- No changes to per-material settings (`coverageSqftPerGallon`, `wastePercentage`, `markupPercentage`, `costPerUnit`).
- No changes to the override editor UX itself.

## Steps

1. **Stop early-skipping overridden rooms in the calculation loops.** The four `if (room?.priceOverride != null) continue;` early-returns in `RoomBuilder.tsx` (per-area material costs, material groups, primer groups, ungrouped flat list) currently drop overridden rooms entirely. Replace each with logic that still includes the room's sqft in the gallon aggregate, then marks that sqft as "excluded for cost purposes" — analogous to the existing `excludeMaterialCost` per-surface flag. The result: gallons reflect the full job, and `excludedCost = totalCost × (overriddenSqft / totalSqft)` is subtracted from the material dollar total so the customer isn't billed twice.

2. **Re-compute the "Materials" line item description with the corrected numbers.** The list under the Materials line item (when it's rendered — controlled by existing toggles) should reflect the full gallon counts including overridden rooms. The dollar total at the line-item level already nets out the excluded cost from step 1.

3. **Verify "Customer providing materials" still suppresses cost only.** Trace the `customerProvidingMaterials` flag through `RoomBuilder.tsx`, `ProductionRateBlockDisplay.tsx`, and `pdfGenerator.ts`. Calculations must run in full; only the dollar values get hidden and the material total gets removed from the grand total. Confirm no path adds material cost back into the grand total when this flag is on.

4. **Confirm rounding stays at `Math.ceil` with no buffer.** Audit `computeMaterialCosts`, `materialGroupResults`, and `primerGroupResults` — each must use `Math.ceil(exactQtyNeeded)` exactly. No threshold, no padding. Add a brief inline comment so the intent is clear.

5. **Mirror the calculation fix in `pdfGenerator.ts` and `ProductionRateBlockDisplay.tsx`.** Both files have their own override-handling and material aggregation blocks. Make sure they (a) include overridden rooms in the gallon math, (b) don't double-add overridden material cost into displayed totals, and (c) produce the same numbers the editor produces. Display toggles in these files keep their current logic — only the underlying values they consume change.

6. **Smoke-test these scenarios manually:** (a) one room with override + non-overridden room sharing the same paint group → group gallons should reflect both rooms; (b) all rooms overridden → gallons still listed, no material cost added to grand total; (c) customer-providing toggle on with mixed override → gallons correct, no material cost in total; (d) edge: 400-sqft coverage paint applied to exactly 400 sqft (= 1 gal) and 401 sqft (= 2 gal). Confirm the editor, the saved proposal "Materials" line item (when toggles render it), the customer-facing block view, and the PDF all agree.

## Relevant files
- `client/src/components/RoomBuilder.tsx:1947-2023`
- `client/src/components/RoomBuilder.tsx:3141-3361`
- `client/src/components/RoomBuilder.tsx:3475-3513`
- `client/src/components/RoomBuilder.tsx:3544-3602`
- `client/src/components/ProductionRateBlockDisplay.tsx:48-132`
- `client/src/components/ProductionRateBlockDisplay.tsx:707-905`
- `client/src/lib/pdfGenerator.ts:1038-1453`
- `shared/schema.ts:95-145`
- `shared/schema.ts:233-244`
- `shared/schema.ts:362-408`
