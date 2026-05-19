# CompanyCam: Link Only From Proposal, Show Photos Everywhere, Stop Wipe

## What & Why
The CompanyCam link on proposal #356 has been "showing briefly then disappearing" because the proposal editor (`EditDocumentDialog`) silently sends `companyCamProjectId: null` on every save, wiping any link picked elsewhere. On top of that, the link/unlink UI ended up on the project page, which is the wrong place per the product rule: **a CompanyCam project is linked to a proposal, not to a project.**

This task realigns the behavior to match the rule, fixes the wipe, and adds diagnostic logs so we can verify it stays fixed in production.

The product rule (per the user):
1. CompanyCam can be **linked / unlinked / changed only from the proposal contractor view**, in the photo card on that page.
2. There is **no link UI on the project page**. No proposal → no CC link possible.
3. CompanyCam photos must still be **viewable on the project page's photo card AND on the proposal photo card**, mixed in with the other photo sources (lead photos, area photos, doc photos, source photos).
4. The eye-toggle per CompanyCam photo (include / hide) must remain on both the project view and the proposal view, so the user controls which CC photos surface in proposals/PDFs.

## Done looks like
- On the **proposal contractor view**, the photo card shows a "Link CompanyCam Project" button (or the linked chip with Change / Unlink) at the top of the photo section. Picking a CC project saves it to the proposal and sticks across refresh, publish, update, and auto-save.
- On the **project page**, the photo card has **no** link / change / unlink button anywhere (this is what the user already wanted in commit 953c9d26 — confirm and keep).
- On **both** the project page and the proposal page, CompanyCam photos appear as part of the unified photo grid for any proposal on that project that has a CC link. Each CC photo has the same eye-toggle to include / hide that all other photo sources have today.
- Editing or publishing a proposal in the editor never wipes its CompanyCam link. Re-publishing proposal #356 with CC project 104204308 linked keeps `documents.company_cam_project_id = '104204308'` in the database afterward.
- Server logs print one line per document update under prefix `[CompanyCam][doc-update]` showing whether the CC fields were in the request body, what their values were, and what the saved values became after the write. The auto-create-on-create branch logs one line under `[CompanyCam][auto-create]` showing whether the gate passed and what the result was.
- The browser console prints clear `[CompanyCam]` lines when the picker is opened, when a project is selected, when the editor initializes its CC state, when the editor is about to save (showing what it is sending), and when discard-changes is about to revert.

## Out of scope
- Auto-create-on-publish (today the server only auto-creates a CC project on document CREATE; extending this to publish/update is a separate idea).
- Backfilling the lost link on doc #356 — once the fix is deployed, the user can re-link it in two clicks.
- Customer-portal CC photo behavior changes (already works through `includedCompanyCamPhotos`).
- Any change to the CompanyCam settings page or the auto-create toggle itself.

## Steps

1. **Restore the picker, but only on the proposal contractor view.**
   In `ProjectPhotosCard`, render `<CompanyCamProjectPicker>` again, gated on the card being rendered for a specific proposal (i.e. when a `documentId` prop is provided). When the card is rendered from the project page (no `documentId`), do not render the picker at all. The picker's `onSelect` should write the CC link to that specific proposal's document via the existing document-update mutation, scoped to `documentId` (not to "any doc on the project"). Keep the optimistic cache patch so the linked chip appears immediately.

2. **Keep CompanyCam photos visible on both the project page and the proposal page.**
   Today the photo card already aggregates CompanyCam photos into the unified grid via `companyCamPhotos` and `includedCompanyCamPhotos`. Confirm this still works on the project page even though the link can only be created from a proposal: the card should look at all proposals on the project, find any one with a CC link, and pull its photos in. The eye-toggle per CC photo continues to write `includedCompanyCamPhotos` on the appropriate document.

3. **Stop the proposal editor from wiping CC fields.**
   In `EditDocumentDialog.saveDocument`, do not include `companyCamProjectId` or `companyCamProjectName` in the PUT body. The editor has no UI to change these fields, so it should leave them alone. Apply the same change to the editor's "Discard Changes" branch so reverting a draft does not also clear a freshly-linked CC project. Remove the related state, snapshot fields, and the unused `CompanyCamProjectPicker` import from `EditDocumentDialog` and `CreateDocumentDialog` to prevent future confusion. (Document creation itself already only sends CC fields when explicitly set, so it stays as-is.)

4. **Add server-side logs for CC writes.**
   In the `PUT /api/documents/:id` handler, log under prefix `[CompanyCam][doc-update]`: the document id, whether each CC key was present in the request body, the incoming value (if present), the value before the write, and the value after the write returned by `storage.updateDocument`. In the `POST /api/documents` handler near the auto-create-on-create block, log under prefix `[CompanyCam][auto-create]`: whether the gate (proposal type, no existing CC link, settings has token + auto-create flag on) passed, the address payload sent to CompanyCam, and the response status / created project id (or the error text on failure).

5. **Add client-side logs in the editor and picker.**
   Use a consistent `[CompanyCam]` prefix in the browser console. Log: (a) inside `EditDocumentDialog`'s init effect, the doc id and the CC values being captured into state and snapshot; (b) inside `EditDocumentDialog.saveDocument` right before calling `updateDoc`, what fields the editor is sending (to confirm CC is no longer included after step 3); (c) inside the discard-changes branch right before the revert; (d) inside `CompanyCamProjectPicker.onSelect` and the picker's "Unlink" button, the picked id and name (or `null`).

6. **Manual verification on Mike Katz proposal #356 in dev.**
   With the dev server running, open proposal #356 contractor view. Confirm the photo card now shows a "Link CompanyCam Project" button. Click it, search for the Croton Dam Rd project, and pick CC project `104204308`. Confirm the linked chip appears, then open the proposal editor, change a small field (e.g., a price), and click "Publish/Update". Confirm: (a) network shows the PUT body has NO `companyCamProjectId` key, (b) server console prints `[CompanyCam][doc-update]` with `inBody: false` and the saved CC id unchanged, (c) the proposal page still shows the Croton Dam Rd CC chip and CC photos after a hard refresh, (d) the database `documents.company_cam_project_id` for id=356 still equals `104204308`. Then open the project page for Mike Katz #4216 and confirm: no link/change/unlink button anywhere on the photo card, but the CC photos from the linked proposal show up in the unified photo grid with their eye-toggles working.

## Relevant files
- `client/src/components/ProjectPhotosCard.tsx:185-260,440-470,530-680`
- `client/src/components/CompanyCamProjectPicker.tsx:80-260`
- `client/src/components/EditDocumentDialog.tsx:25,215-216,235,240-322,576-608,1462-1488`
- `client/src/components/CreateDocumentDialog.tsx:31,225-226,420-447`
- `client/src/pages/DocumentDetail.tsx:580-600,2380-2410,2780-2810`
- `client/src/pages/ProjectDetail.tsx:5500-5520,5700-5730`
- `client/src/pages/CustomerPortal.tsx:2500-2520`
- `client/src/components/DocumentPhotos.tsx:51-160,1130-1150`
- `client/src/hooks/use-documents.ts`
- `server/routes.ts:2690-2715,3774-3928,3930`
- `server/storage.ts:780-810`
- `shared/schema.ts:515-525,600-615`
