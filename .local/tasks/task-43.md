---
title: Show total square footage on proposals (per-area, per-block, and header)
---
# Show Total Square Footage Toggle

## What & Why
Customers reading proposals can see per-room dimensions (e.g., "Living Room — 180 sq ft") but have no way to know the total square footage of the job without manually adding rooms up. This is especially important for services priced by area like flooring, ceilings, decks, roofing, exterior siding, and cabinet refacing.

Add a single, generic, opt-in display toggle named "Show Total Square Footage" that, when enabled on a rate block, surfaces the area math at three coordinated levels: per area row (next to the existing area total price), at the top of the rate block (block-wide total), and rolled up in the document header (project total across all blocks where the toggle is on). Off by default everywhere so existing proposals are unchanged.

## Done looks like
- A new "Show Total Square Footage" checkbox sits in the same display-toggles panel where users today see "Show Surface Details" and "Show Surface Total". It is OFF by default.
- A tooltip on the checkbox reads: "Show the total square footage for this section. Useful for services priced by area like flooring, ceilings, decks, or roofing. Excluded rooms are not counted."
- When the toggle is ON for a rate block:
  - Each area/room row displays its sq ft alongside the existing area total price (e.g., `Living Room · 180 sq ft · $540`).
  - A summary line appears at the top of the rate block: `Total Square Footage: 385 sq ft`.
  - The document header shows a project-level summary. If only one block has the toggle on, it reads `Total Square Footage: 385 sq ft`. If multiple blocks have it on, totals are grouped by block name (e.g., `Living Room Flooring: 385 sq ft · Ceilings: 850 sq ft`).
- The behavior is identical across the internal document detail view, the customer portal view, and the generated PDF.
- Excluded / contractor-only rooms do NOT count toward customer-facing totals but DO count toward the internal-only view.
- Optional add-on rooms are shown separately so customers see both the base and "if added" math (e.g., `385 sq ft (+ 60 sq ft if Hallway is added)`).
- The toggle is per-block, so a single proposal can show flooring totals while keeping painting blocks clean.
- Existing proposals load with the toggle OFF and look identical to before.

## Out of scope
- Auto-enabling the toggle for any service type (the user must opt in per block).
- A separate "show total linear footage" toggle for trim/molding work — only square footage in this scope.
- A user-facing setting to change the default toggle value globally — defaults stay in code for now.
- Changes to the underlying sq ft calculation logic — totals reuse the existing per-room values from RoomBuilder.

## Steps
1. Add the `showProjectTotalSqft` boolean field to the `DisplayToggles` interface (and any related defaults / insert schemas), defaulting to false. Make sure existing documents without the field render as if it were false.
2. Expose a helper in RoomBuilder that returns the total enabled square footage for a single rate block, with separate breakdowns for: customer-facing (excludes excluded/contractor-only rooms), internal (includes everything), and optional add-on rooms (so the "if added" delta can be shown).
3. In the rate block display component, when the toggle is on: render the per-area sq ft beside each area's existing total price, and render the block-level "Total Square Footage" line at the top of the block.
4. Add the checkbox and tooltip to the display-toggles UI panel where the other show/hide toggles already live.
5. In the document detail page's internal header, add a project-total row that aggregates across all blocks where the toggle is on, grouped by block name when more than one block is involved. Hide the row entirely when no block has the toggle on.
6. Mirror the per-area, per-block, and header-level displays in the customer portal page so what the customer sees online matches the internal view (with excluded rooms removed from the customer-facing totals).
7. Mirror the same three displays in the PDF generator so the printable matches the on-screen views exactly.
8. Smoke-test by creating a proposal with one flooring block and one painting block: toggle ON for flooring only, confirm flooring totals appear in all three places and painting block stays untouched. Then toggle ON for both, confirm header groups them by block name. Then exclude a room and confirm the customer-facing total drops while the internal total holds steady.

## Relevant files
- `shared/schema.ts:233-320`
- `client/src/components/RoomBuilder.tsx:139-600,1280-1300`
- `client/src/components/ProductionRateBlockDisplay.tsx:30-220,400-420`
- `client/src/pages/DocumentDetail.tsx:78-182`
- `client/src/pages/CustomerPortal.tsx`
- `client/src/lib/pdfGenerator.ts`