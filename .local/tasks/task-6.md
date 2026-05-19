---
title: Fix outbound MMS image storage
---
# Fix Outbound MMS Image Storage

## What & Why
When a user sends a picture via MMS, the image is uploaded to the local `/uploads/` directory and stored in the database as a full URL including the current domain (e.g. `https://current-domain.replit.dev/uploads/abc123.jpg`). This has two problems:
1. Local `/uploads/` files are ephemeral and can be lost on server restart or deployment.
2. The stored full URL breaks if the domain changes (e.g. switching from Replit dev URL to a custom domain, or the domain gets cancelled).

The fix: upload outbound MMS images to permanent object storage, store domain-independent relative paths in the database, and ensure the source photos system (which links message images to projects) works correctly with the new paths.

Inbound MMS (from Twilio) is working fine and should NOT be changed.

## Done looks like
- When a user sends a picture in a message thread, the image is saved to permanent object storage (not local `/uploads/`).
- The URL stored in the database is a relative/domain-independent path (e.g. `/objects/uploads/...`) rather than a full domain URL.
- Sent images remain viewable in the message thread even after domain changes or server restarts.
- Sent images still appear in the project's source photos (the "From Text Message" section) since the source photos API queries communications with media.
- The `proxyUrl()` function in `MessageMediaCarousel.tsx` already handles `/objects/` paths — no frontend changes needed if we store `/objects/...` paths.
- The `handleFileUpload` in the message composer uses the object storage upload flow instead of `/api/upload`.

## Out of scope
- Changing inbound MMS handling (Twilio-proxied URLs are working fine).
- Migrating old data that may have been stored with full domain URLs.
- Changing the document photos system or any other upload flows outside of MMS.

## Tasks
1. **Update outbound MMS upload to use object storage** — Modify the upload flow so that when a user attaches a picture in the message composer, the file is uploaded to object storage instead of the local `/uploads/` directory. Store the resulting domain-independent object path (e.g. `/objects/uploads/uuid`) in the database.

2. **Ensure the media URL sent to Twilio is publicly accessible** — When sending the MMS via Twilio, Twilio needs to download the image from a public URL. Either generate a signed URL for the object or use a public object path so Twilio can fetch it. The full URL with the current domain should only be constructed at send time, not stored.

3. **Update the message composer frontend** — Change `handleFileUpload` in `Messages.tsx` to use the object storage upload endpoint. Store the relative `/objects/...` path in `mediaUrls` state instead of a full domain URL. The `proxyUrl()` function already handles `/objects/` paths so display should work automatically.

4. **Verify source photos linkage** — Confirm the source photos API endpoint still correctly picks up outbound MMS images from the communications table with the new object storage paths (the URL pattern matching for image extensions may need updating since object storage paths may not have file extensions).

## Relevant files
- `client/src/pages/Messages.tsx:1446-1489`
- `client/src/components/MessageMediaCarousel.tsx:10-21`
- `server/routes.ts:482-514`
- `server/routes.ts:6667-6766`
- `server/routes.ts:20350-20399`
- `server/replit_integrations/object_storage/objectStorage.ts`
- `server/replit_integrations/object_storage/routes.ts`
- `shared/schema.ts:480-494`