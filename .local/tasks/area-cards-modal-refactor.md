# Area Cards UI Refactor — Container + Modal Editor

## What & Why
The RoomBuilder currently renders area/room production rates as large inline-editing cards with all surfaces, dimensions, coats, materials, and pricing visible on the page at once. This creates a very long, cluttered scroll. The user wants two changes:

1. **Container card** — Wrap all area cards (Area 1, Area 2, Area 3, + Add Area) inside a styled card container similar to the Material Groups card, giving a clear visual boundary.

2. **Summary cards + modal editing** — Replace the current inline expanded editing with compact summary cards for each area. Each summary card shows key info at a glance (name, total price, labor hours, surface count, dimensions). Tapping a card opens a full modal editor containing all the current editing controls (dimensions, surfaces, coats, materials, primers, complexity, repairs, scope notes, photos, price override). The modal replaces the inline expand/collapse pattern.

This mirrors the Material Groups pattern: summary cards on the main page, detailed editing in modals.

## Done looks like
- All area cards are wrapped in a rounded card container with consistent styling
- Each area shows as a compact summary card with: area name, total price, labor hours, key surfaces enabled, dimensions (L×W×H), and material info
- Tapping a summary card opens a modal (similar z-index pattern as Material Groups: z-[10001])
- The modal contains ALL current area editing functionality: dimensions, scope notes, surface toggles with coats/material/primer/substrate/complexity/repair, wall selection, price override, photo management
- Add Area button stays at the bottom of the container
- Duplicate and remove area actions remain accessible (on the summary card or within the modal)
- Drag-to-reorder areas still works on summary cards
- The modal uses the same iOS keyboard-aware patterns (visualViewport listener, top-anchored positioning)
- All existing calculation logic is preserved — no changes to the `calculateRoom` function or data model

## Out of scope
- Changing the data model or calculation engine
- Modifying the Material Groups section
- Changing how the Materials Summary section works
- Any backend API changes

## Tasks
1. **Wrap area cards in a container card** — Add a styled card container around the area cards section with consistent border/padding matching the Material Groups and Settings cards above.

2. **Create AreaSummaryCard component** — A compact card showing area name, total price, labor hours, enabled surface count, dimensions, and key info. Include drag handle, duplicate button, remove button, and optional/required toggle on the card header.

3. **Create AreaEditorModal component** — Extract all current inline area editing into a modal dialog. This includes dimension inputs, scope notes textarea, all surface toggles with their expanded details (coats, material picker, primer toggle, substrate, complexity, repair), wall selection, price override, and photo management. The modal should use the same z-index and keyboard-awareness patterns as MaterialGroupEditorModal.

4. **Wire up summary cards to modal** — Replace the current inline expand/collapse logic with: tap summary card → open AreaEditorModal pre-filled with that area's data. Save in modal updates the room state. Ensure all existing state management (updateRoom, expandedSurfaces, etc.) works through the modal.

5. **Preserve drag-and-drop reordering** — Ensure the summary cards remain draggable for area reordering.

6. **Test mobile responsiveness** — Verify the modal works well on iOS with keyboard, scrolling, and all interactive elements within it.

## Relevant files
- `client/src/components/RoomBuilder.tsx:3546-4904`
- `client/src/components/RoomBuilder.tsx:983-1079`
- `client/src/components/RoomBuilder.tsx:273-470`
- `client/src/components/RoomBuilder.tsx:29-71`
- `client/src/components/RoomBuilder.tsx:499-519`
