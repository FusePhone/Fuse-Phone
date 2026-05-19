---
title: Production Rate Photo Picker — Bond Existing Project Photos to Areas
---
# Production Rate Photo Picker

## What & Why
When building a proposal with production rate blocks (Room Builder), users can currently take new photos or select from the device gallery for each area/room. This feature adds a third option: pick from photos that already exist in the project. Photos from any source (uploaded, MMS, booking forms, other documents) can be "bonded" to a production rate area without duplicating the image — only a reference to the existing `storageKey` is stored in the room's `photos` array.

## Done looks like
- In the Room Builder's photo section for each area/room, a new "Project Photos" button appears alongside the existing camera and gallery options
- Tapping "Project Photos" opens a picker sheet/modal showing all existing project photos (from uploads, messages, other documents, etc.) organized chronologically
- User can select one or multiple photos to attach to that area
- Selected photos appear in the area's photo list just like camera/device photos
- No duplicate files are created in storage — only the existing `storageKey` URL is referenced
- Photos bonded this way show up in the area photos on the proposal and in the ProjectPhotosCard gallery (they already do via area photo extraction)
- If the same photo is already attached to the area, it cannot be added again (deduplication by storageKey)

## Out of scope
- Changing how photos are stored in the `document_photos` table
- Changing how ProjectPhotosCard aggregates/displays area photos
- Any changes to the customer-facing portal photo display

## Tasks
1. **Project photo picker component** — Build a reusable modal/sheet component that fetches all project photos (from `/api/projects/:id/photos` and `/api/projects/:id/source-photos`), displays them in a selectable grid, and returns the selected photo URLs on confirm.

2. **Integrate picker into Room Builder** — Add a "Project Photos" button to the room/area photo section in the Room Builder. Wire it to open the picker, and on selection, append chosen photos to the area's `photos` array using the existing `{ url, timestamp, showOnProposal }` shape. Deduplicate by `url`/`storageKey` so the same photo can't be attached twice.

3. **Pass projectId to Room Builder** — Ensure the Room Builder receives the current `projectId` (from the document's project or from the URL context) so the picker can fetch the correct project's photos. Thread it through CreateDocumentDialog and EditDocumentDialog.

## Relevant files
- `shared/schema.ts:140-170`
- `client/src/components/ProjectPhotosCard.tsx`
- `client/src/components/CreateDocumentDialog.tsx`
- `client/src/components/EditDocumentDialog.tsx`
- `client/src/components/LineItemEditorModal.tsx`