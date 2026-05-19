---
title: Fix pencil save & optional item pencil
---
# Fix Pencil Save and Optional Pencil

## What & Why
Two bugs in the recently shipped inline pencil edit shortcuts on documents:

1. **Production rate price doesn't persist after saving via pencil.** When the user clicks the pencil on a production rate block/area, edits the price in the section editor, and clicks Save, the toast reports the new total correctly and the dialog closes — but when the user lands back on the originating view, the header still shows the old price. The edit is only visible after a full reload, meaning the data isn't reaching the server.

2. **Pencil disappears for optional line items.** In the customer-view preview, regular line items correctly show the pencil edit shortcut, but as soon as the user toggles an item to "Optional", the pencil vanishes. The pencil must stay visible whether the item is optional or not.

## Root causes

1. In the save flow from focus mode (pencil → section editor → Save), `onSaveRoomData` runs the non-autosave branch, which updates local entries and calls `markDirty()`. `markDirty` schedules a 3-second debounced autosave, and then `closeIfFocused()` closes the dialog, which triggers the unmount cleanup that clears the pending autosave timer. The server write never happens.

2. In the customer-view preview, optional items are rendered from `optionalItems.map(...)` where `srcIdx = (item as any)._srcIdx`. The `_srcIdx` property is only ever set inside the edit dialog — never on items read straight from `doc.content.items`. So it's always `undefined`, and the `onEdit={... srcIdx !== undefined ? ... : undefined}` condition always passes `undefined`, removing the pencil.

## Done looks like
- Clicking the pencil on a production rate block or area, editing a price, and clicking Save leaves the user back on the originating view with the new price visible immediately (no reload needed).
- Optional line items in the customer-view preview show the same pencil shortcut that regular items do, and clicking it opens the line item editor focused on that item.
- Pencil is hidden on the public customer portal (unchanged behavior).

## Out of scope
- Any changes to pencil visibility or behavior outside the already-shipped feature.
- Restructuring `_srcIdx` — just compute the correct index inline for optional items.

## Tasks
1. **Persist block save in focus mode.** In the production-rate block save path, when the dialog was opened via a pencil shortcut, save the updated entries synchronously to the server before closing instead of relying on the debounced autosave that gets cancelled.

2. **Restore pencil on optional items.** In the customer-view preview, compute the source index for optional items the same way regular items compute it (via their position in the full items array) so the pencil edit shortcut renders for both.

3. **Restart the workflow** once both fixes are in so changes take effect (current workflow is in a failed state from a prior port collision).

## Relevant files
- `client/src/components/EditDocumentDialog.tsx:303-322,343-357,950-1003`
- `client/src/pages/DocumentDetail.tsx:2987-3118`