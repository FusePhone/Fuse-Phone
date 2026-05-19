---
title: Color Groups in Colors tab
---
# Color Groups in Colors Tab

  ## What & Why
  Today the contractor assigns colors per surface — Bedroom 1 walls, Bedroom 2 walls, Hall walls all need the same color but get picked separately. It's tedious, and the Paint Order panel has no way to know how many gallons each color actually needs because the data is fragmented per surface. Color Groups let the contractor pick a color once and apply it to many room/surface combos, mirroring how Material Groups work. As a side effect, the system can sum exact sqft per color and auto-calculate gallons in the Paint Order panel.

  ## UI Constraint (important)
  **Keep the Colors tab UI as close to current as possible.** No new top-level section, no layout reshuffle. Grouping is introduced as a lightweight overlay on the existing per-surface flow:
  - Add a small "Group with…" link/button next to each surface's color picker. Clicking it opens a popover to either pick an existing color group or create a new one in place.
  - Surfaces that belong to a group render with the same row layout as today, but the color picker area shows the group's color swatch + name and a tiny "in group: <name>" caption with a quick "Ungroup" action. No new cards, no new tab, no new big section.
  - Groups are managed inline through these per-surface affordances. There is no separate Groups list view.
  - The Paint Order panel keeps its current card layout exactly; just adds a one-line gallon estimate above each card and a footer total. The "Auto-fill from estimate" button is a small secondary button in the existing panel header.

  ## Done looks like
  - The Colors tab looks visually identical to today at a glance. The only new affordance is a small "Group with…" link next to each surface's color picker.
  - Clicking "Group with…" lets the contractor add the surface to an existing color group or create a new one (name + color + finish).
  - Surfaces in a group show the group's color in the same picker spot, with a small "in group: <name> · Ungroup" caption underneath.
  - Existing per-surface color picking still works exactly as before for any surface not in a group.
  - The Paint Order panel shows the same cards as today, with one card per color group (instead of one per ungrouped color) plus cards for any colors that aren't in a group. Each card gains a "≈ X gal needed · Buy Y gal" helper line.
  - An "Auto-fill from estimate" button in the Paint Order header pre-fills container quantities for empty cards using smart packaging (5-gal first, then 1-gal, then quart). Cards the contractor already touched are not overwritten.
  - Footer in the Paint Order panel reads "Estimate: X gal · Ordering: Y gal" with an amber warning if Ordering is below Estimate.
  - When a Material Group has a manual gallon override, the Paint Order honors it for surfaces in that material group.
  - The customer color review page collapses repeated questions: one wall color group covering 3 rooms generates one customer question instead of three. Approving applies the color to every surface in the group.

  ## Out of scope
  - No changes to Material Groups themselves.
  - No migration of existing per-surface selections — both modes coexist.
  - No new tabs, sections, or page-level UI in the Colors tab.
  - No changes to the paint library, color search, or color submission tokens/links.

  ## Steps
  1. **Schema and API for Color Groups** — Add a project_color_groups table (color + finish + surface-area list, scoped by user and project). Add CRUD endpoints. Extend the materials-summary endpoint (or add a sibling color-totals endpoint) to return per-color sqft and gallons by combining grouped surfaces and ungrouped per-surface selections, keyed by a stable color key.

  2. **Inline grouping affordance on each surface row** — In the existing surface rows of the Colors tab, add a small "Group with…" link next to the color picker. Selecting an existing group or creating a new one (lightweight popover with name + color + finish + multi-select of additional surfaces) writes to the new table. Surfaces in a group render the group's color in the same picker spot with a tiny "in group · Ungroup" caption. No new top-level section.

  3. **Paint Order auto-calculated gallons** — Update the Paint Order panel to render one card per color group plus one card per ungrouped color, using the same card layout as today. Add a "≈ X gal needed · Buy Y gal" helper line on each card, an "Auto-fill from estimate" header button with smart packaging, and a footer grand total comparing estimate vs. ordering. Honor any Material Group gallon overrides when computing per-color gallons.

  4. **Collapse customer color review by group** — When generating customer questions for the public color review page, group surfaces by their color group so the customer answers once per group. On submit, fan the chosen color out to every surface in the group when writing back to the per-surface color selections. Ungrouped surfaces continue to be one question per surface.

  ## Relevant files
  - `shared/schema.ts`
  - `server/storage.ts`
  - `server/routes.ts:27181-27280`
  - `client/src/pages/ProjectDetail.tsx:1097-2603`
  - `client/src/pages/ProjectDetail.tsx:2652-3170`
  - `client/src/pages/ProjectDetail.tsx:3174-3400`