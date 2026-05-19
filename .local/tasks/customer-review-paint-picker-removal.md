# Remove Paint Picker From Customer Review

## What & Why
On the contractor's customer-review preview of a document, tapping a paint chip opens a picker that lets them swap the paint product (Eco Spec → Aura, etc.) on a single surface. This was never meant to live there and the underlying logic is broken in two ways:

- The `surface-material` change endpoint always recomputes the block total as `data.totalLaborCost + (sum of every surface's material cost)`. It never excludes overridden rooms from the material recompute, and never re-applies the room-level `priceOverride`. So a $7,400 override gets the new material cost stacked on top, producing the "crazy numbers" the user saw.
- The picker only writes the new product onto `surface.materialId` / `surface.materialName`. It does NOT touch `roomBuilderData.materialGroups[].materialId` or any room-level default. When the contractor later opens the main RoomBuilder editor, that editor reads from the group/room defaults (still Eco) and on save overwrites the per-surface change back to Eco — exactly the "everything goes back" behavior the user described.

The user wants this feature removed completely, with no leftover code. Audit confirmed the picker, its server endpoint, its types, and its prop chain are fully self-contained — nothing else in the app calls them, so a clean deletion is safe.

## Done looks like
- On the customer-review preview, paint chips are still visible (informational) but no longer clickable, and there is no popup to change the product.
- No file in the project still imports `SurfaceMaterialPicker`, `MaterialChangeInfo`, or the `onChangeMaterial` / `onMaterialClick` / `onPrimerMaterialClick` prop chain.
- The `PATCH /api/documents/:id/surface-material` server route no longer exists.
- The internal/company view is unchanged. Color submissions on the public customer portal are unchanged.
- Existing documents on disk are untouched. Anyone wanting to clean up a previously-corrupted total can open the main editor and resave; nothing is auto-rewritten.
- App still builds, runs, and the customer-review page renders without errors.

## Out of scope
- Building a different "change paint product" affordance anywhere else.
- Letting customers change paint products from the public portal — color-name submissions stay as-is.
- Auto-healing already-corrupted document totals.
- Touching the main RoomBuilder editor's material handling.

## Steps
1. **Delete the picker component.** Remove `client/src/components/SurfaceMaterialPicker.tsx` entirely.
2. **Delete the server endpoint.** Remove the `PATCH /api/documents/:id/surface-material` route handler in `server/routes.ts` (lines 1808-2006). It has no other callers.
3. **Strip the prop chain in `ProductionRateBlockDisplay.tsx`.** Remove the `MaterialChangeInfo` interface, the `onChangeMaterial` prop on `ProductionRateBlocksSection`, `ProductionRateBlockDisplay`, and `AreaSection`, plus the `onMaterialClick` / `onPrimerMaterialClick` props on `CollapsibleSurfaceRow`. Render the paint chips as plain non-interactive elements in both spots (line 396 area and line 422 area), keeping the same visual styling.
4. **Strip the wiring in `DocumentDetail.tsx`.** Remove the `SurfaceMaterialPicker` import (line 32), the `MaterialChangeInfo` type import (line 31), the `materialPickerInfo` state (line 402), the `handleChangeMaterial` and `handleMaterialChanged` callbacks (lines 552-558), the `onChangeMaterial` prop pass on the customer-review render (line 3206), and the `<SurfaceMaterialPicker ... />` mount near line 6672.
5. **Verify.** Run a typecheck / build, restart the app, and load a document's customer-review page to confirm the page renders, paint chips show up but don't react to taps, and totals stay stable. Confirm `rg -n "SurfaceMaterialPicker|MaterialChangeInfo|onChangeMaterial|onMaterialClick|onPrimerMaterialClick|surface-material" -tts -tjs` returns no hits.

## Relevant files
- `client/src/components/SurfaceMaterialPicker.tsx`
- `client/src/components/ProductionRateBlockDisplay.tsx:14-30,293-300,396-430,875-885,1040-1070,1190-1320,1357-1390`
- `client/src/pages/DocumentDetail.tsx:31-32,402,552-558,3200-3210,6670-6683`
- `server/routes.ts:1808-2006`
