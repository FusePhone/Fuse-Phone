---
title: Camera capture UX improvements
---
# Camera Capture UX Improvements

## What & Why
The CameraCapture component has several UX issues: the shutter button isn't centered, the Done button is hard to see or hidden behind the safe zone, the app's top navigation bar shows through, and it's missing native camera features like flash toggle and zoom controls. These improvements make the in-app camera feel closer to the native phone camera experience.

## Done looks like
- Camera opens truly full-screen — the app's top navigation bar is hidden (use a React portal to render at document body level, same approach as the image viewer)
- Shutter button is always perfectly centered horizontally, whether or not the photo count badge is visible
- Done button is clearly visible, properly positioned within the safe area, and shows the photo count
- Flash toggle button (on/off/auto) is available in the top controls
- Zoom level controls (0.5x, 1x, 2x) appear above the shutter area, similar to native camera
- Camera flip button remains available
- All changes are scoped to `CameraCapture.tsx` only — do NOT modify how the camera works in text messaging or anywhere else that uses CameraCapture

## Out of scope
- Video recording
- Photo preview/review after capture
- Filters or editing within the camera
- Changing how other components invoke CameraCapture (props stay the same)

## Tasks
1. **Portal rendering** — Wrap the CameraCapture overlay in a React portal (document.body) so it renders above the app shell and top nav bar, similar to how PhotoGalleryViewer works.

2. **Center the shutter button** — Restructure the bottom control bar to always center the shutter button using a three-column layout (count badge left, shutter center, empty spacer right), so it stays centered regardless of whether the count badge is visible.

3. **Fix Done button positioning** — Ensure the Done button with photo count is clearly visible within the safe area inset at the top, with adequate size, contrast, and padding so it doesn't get clipped or hidden behind the device status bar.

4. **Add flash toggle** — Add a flash on/off button in the top controls area. Use the camera track's torch capability to toggle the flashlight. Show a flash icon that indicates the current state.

5. **Add zoom controls** — Add 0.5x / 1x / 2x zoom level buttons above the shutter bar area. Apply zoom via the video track's zoom constraint where supported, with a fallback that hides zoom controls on unsupported devices.

## Relevant files
- `client/src/components/CameraCapture.tsx`
- `client/src/components/PhotoGalleryViewer.tsx`