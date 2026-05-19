# Fix Material Groups, Room Copy, Display & Robustness

## What & Why
Several related improvements to the Room Builder and customer-facing views:

**1. Material Groups — allow same surface in multiple groups:**
Material groups currently prevent adding the same surface type (e.g., "Walls") to more than one group. If a user has 5 rooms with walls, they should be able to put 3 rooms' walls in Group 1 and the remaining 2 in Group 2 (each with a different paint). The surface chip disable logic only checks surface key, not per-room `areaIds`. The `isGroupedSurface` helper uses `find` (returns only the first match), so it can't handle the same surface key in multiple groups.

**2. Copy/Duplicate rooms (areas):**
Users need to duplicate an existing room with all its settings (dimensions, enabled surfaces, coats, materials, complexity, repair, descriptions) to save time when estimating similar rooms. A copy button on each room card in the builder. The copied room should get a name like "Bedroom (Copy)" and be added right after the original.

**3. Hide complexity from customer view — show primer & repair:**
Complexity hours should NOT appear on the customer-facing document view or PDF. They silently add to the surface's total labor — the customer just sees the final combined number. Complexity badges can remain visible on the contractor's builder view. The customer view and PDF must show: primer coats, primer material name, and repair (amount + description on its own row).

**4. Robustness pass:**
Ensure that removing surfaces, toggling rooms on/off, deleting rooms, and updating areas correctly recalculates all material costs, complexity, and repair values without errors.

## Done looks like
1. Same surface type can be in multiple material groups as long as rooms (areaIds) don't overlap.
2. Surface chips only disabled if that surface+room combination is fully claimed by another group.
3. `isGroupedSurface` checks ALL groups (not just the first) for surface+area overlap.
4. Each room card in the builder has a copy/duplicate button that creates a full clone with "(Copy)" appended to the name.
5. Customer view and PDF do NOT show complexity hours/badges. Complexity is invisible to the customer — it's baked into the surface total.
6. Customer view and PDF DO show: primer coats, primer material, repair amount, and repair description (on its own row).
7. Removing a surface or toggling a room off from a group properly updates totals, material costs, complexity, and repair.
8. No console errors or stale data when adding/removing surfaces, rooms, or groups.

## Key files
- `client/src/components/RoomBuilder.tsx` — Material group UI, room cards, calculation logic, copy feature
- `client/src/components/ProductionRateBlockDisplay.tsx` — Customer-facing surface display (hide complexity, verify primer/repair)
- `client/src/lib/pdfGenerator.ts` — PDF generation (hide complexity, verify primer/repair)
- `shared/schema.ts` — Interfaces (read-only, no changes expected)

## Implementation steps

### 1. Add room copy/duplicate feature
- Add a copy button to each room card header (next to existing delete/collapse buttons).
- On click, deep-clone the room config including: dimensions, all enabled surfaces, coatsOverride, materialOverride, primerOverride, complexityOverride, repairOverride, surfaceDescriptionOverride.
- Generate a new unique `id` for the cloned room.
- Set name to `"{originalName} (Copy)"`.
- Insert the copy right after the original room in the array.
- Copied room should NOT be auto-added to any material groups.

### 2. Hide complexity from customer view
- In `ProductionRateBlockDisplay.tsx`: Remove the complexity hours badge/line from the surface details. The `+Xh complexity` text should not render.
- In `pdfGenerator.ts`: Remove any complexity-related lines from the PDF output.
- Complexity stays visible ONLY in the RoomBuilder contractor view (the builder summary rows).

### 3. Verify primer & repair show on customer view and PDF
- Customer view (`ProductionRateBlockDisplay.tsx`): Confirm primer coats, primer material name, repair amount, and repair description all display correctly.
- PDF (`pdfGenerator.ts`): Confirm primer coats, primer material, repair amount line, and repair description line all render. Repair description should be on its own row below the repair amount line.

### 4. Fix surface chip disable logic (line ~786)
Current: `isInOtherGroup = materialGroups.some(g => g.id !== group.id && g.surfaceKeys.includes(key))`
Fix:
- If the other group has `areaIds` set and this group also has `areaIds` set, only disable if all rooms are already claimed.
- If the other group has NO `areaIds` (meaning all rooms), then truly disable.
- Show a partial indicator when some but not all rooms are claimed by other groups.

### 5. Fix `isGroupedSurface` helper (line ~1770)
Current: uses `find` → only checks the first group containing the surface key.
Fix: iterate all groups to check if ANY group claims that surface+area combination.

### 6. Fix `groupedSurfaceKeys` memo
Needs to account for areaIds so a surface key is only "grouped" for specific rooms, not globally.

### 7. Robustness: validate recalculations on changes
- Room removed from group's `areaIds` → `materialGroupResults` recalculates.
- Surface removed from group → per-area material costs re-include it.
- All surfaces/rooms removed from group → handled gracefully (no NaN/errors).
- Group deleted → all surfaces revert to per-area material calculations.
- Room copied → new room not in any group, gets fresh ID.
- Room deleted → groups referencing that room's ID auto-clean.
