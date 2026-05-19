---
title: Make production-block room photos linkable across blocks
---
# Make Production-Block Room Photos Linkable Across Blocks

## What & Why
Today, when you upload a photo to a room inside a production rate block, the photo is stored **inside** that block's data (as a blob in the document's JSON). It doesn't exist as a real project photo, so:
- It doesn't show up in the picker when you add a second production rate block to the same project (e.g. Flooring Installation can't reuse the photos you uploaded to Interior Painting's rooms).
- It can't be re-attached or moved between blocks without re-uploading.
- It's invisible to anything else that reads project photos.

The proper fix is to flip the storage model: every photo lives once in the project's main photo pool. Production rate block rooms just hold a **link** (by photo ID) to the photo. Adding a photo to a room creates a link; unlinking it removes only the link — the photo itself stays in the project pool and can be re-linked from any block at any time. Actually deleting a photo from the project happens elsewhere (in the project photo pool), not from inside a production rate block.

## Done looks like
- Uploading a photo to a room inside a production rate block stores the file once in the project's main photo pool. The block/room holds a reference to it (by ID), not the file itself.
- The photo picker for any production rate block room shows every project photo — including photos linked to other blocks, document photos, lead photos, and source/text/form photos — and lets the user attach any of them. The "already added" overlay still applies only to the room currently being edited.
- A production rate block room exposes only two photo actions: **Add** (upload a new one or pick from the project pool, both create a link) and **Unlink** (remove the link from this room only). The button currently labeled "Delete" / "Remove" inside the production rate block is renamed to **Unlink** to reflect what it actually does.
- Unlinking a photo from a room never deletes the file. The photo stays in the project pool and remains available to relink from any other block/room. Permanent deletion of the photo from the project happens only from the project photo pool, not from inside a production rate block.
- Existing projects with area photos already saved inside production rate block JSON continue to display correctly. Their photos are migrated into the project pool with the same links recreated, so nothing visibly changes for the user.
- All downstream views that show production-block room photos (customer portal, PDFs, photo sharing, ProjectPhotosCard, etc.) keep working with no visual regression.

## Out of scope
- Any change to CompanyCam photo handling.
- Any change to non-area photos (document photos, lead photos, source photos).
- Any UI redesign of the picker beyond the new behavior described above.
- Any change to photo annotations, sort order, or per-photo metadata other than what's needed to preserve them through the migration.
- Any change to how photos are permanently deleted from the project pool.

## Steps
1. **Data model** — Introduce a first-class linkage between project photos and (production rate block, room) so a single photo can be linked to many block/room slots, and unlinking from one slot leaves the photo intact in the project pool. Run a safe schema sync.
2. **Migration** — One-time backfill that walks every existing project document's production rate blocks, moves each embedded area photo into the project photo pool, and recreates the equivalent block/room link rows so nothing visibly changes for existing projects. Keep a fallback read path so any unmigrated JSON photos still render until they're migrated.
3. **Server** — Add/extend endpoints for linking and unlinking a photo to a block/room, and update the production-block read path so each room's photos are resolved through the new link instead of inline JSON. The project photos endpoint that the picker uses must surface every linked photo so the picker can offer them.
4. **RoomBuilder & picker** — Update upload, add-from-picker, and remove flows so they create/delete links instead of mutating inline photo arrays. Rename the in-room remove action to **Unlink** so the wording matches the behavior. Picker shows the full project photo pool grouped by source (document, lead, text, form, and "from other production blocks" with the source block name) and keeps the current "Added" overlay for photos already in the room being edited.
5. **Verify end-to-end** — In a project with two production rate blocks sharing the same room, confirm that (a) photos uploaded to Block A's room appear in the picker when adding photos to Block B's room, (b) attaching from the picker links the same photo to both blocks without duplicating it, (c) unlinking from Block B leaves it intact on Block A and still available in the picker, and (d) existing projects with legacy area photos render the same as before after migration.

## Relevant files
- `shared/schema.ts:761`
- `server/routes.ts:24385-24420`
- `server/storage.ts`
- `client/src/components/RoomBuilder.tsx:2665,6437-6444,6696-6713`
- `client/src/components/ProjectPhotoPicker.tsx`
- `client/src/components/ProjectPhotosCard.tsx`
- `client/src/components/DocumentPhotos.tsx`
- `client/src/pages/ProjectDetail.tsx:5556-5570`