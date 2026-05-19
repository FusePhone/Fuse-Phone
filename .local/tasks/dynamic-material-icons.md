# Dynamic Material Icons by Type

## What & Why
Currently, the material icon in the surface detail view (both web and PDF) is always a paintbrush, regardless of what the material actually is. This works for painting, but if the system is used for roofing, decking, concrete, or other trades, the icon should reflect the material type. The `materials` table already has a `type` field (currently `paint`, `primer`, `sundries`). We'll use this field to pick the appropriate icon, and also extend it to support future trade types.

## Done looks like
- Each material line in the surface detail (collapsed/expanded view) shows an icon appropriate to its type:
  - `paint` → Paintbrush icon (current behavior)
  - `primer` → Paintbrush icon (same as paint, it's still a coating)
  - `stain` → Paintbrush icon
  - `concrete` → Hammer/hard-hat style icon
  - `roofing` → Roof/home icon
  - `decking` → Wood/fence icon
  - `siding` → Layers icon
  - `sundries` → Package/box icon
  - Unknown/other → Generic circle-dot or palette icon
- The PDF uses the same mapping with small vector equivalents (text labels or simple shapes since jsPDF doesn't render Lucide icons directly — use a text character or small marker matching the type).
- The icon mapping is centralized in a single utility function so new types can be added in one place.
- The `estimateType` on the production rate block (e.g., "Residential Interior", "Residential Exterior", "Roofing") is passed through as context but the primary driver is the material `type` field.
- The material type data already flows into `areaResults` via `materialName` — we also need to pass through a `materialType` field so the display component knows which icon to show.

## Out of scope
- Adding new material types to the database (users can already set custom types)
- Changing how materials are created or managed
- Changing the primer material icon (stays paintbrush since primer is a coating)

## Tasks
1. Create a shared utility function `getMaterialIcon(type: string)` that maps material type strings to Lucide icon components (for React) and returns a fallback for unknown types. Place it in a shared display utils file.
2. Update the `addSurface` computation in `RoomBuilder.tsx` to include `materialType` (from the material's `type` field) and `primerMaterialType` in the surface calc results that get saved into `areaResults`.
3. Update the `SurfaceCalcResult` type interface to include optional `materialType` and `primerMaterialType` fields.
4. Update `CollapsibleSurfaceRow` in `ProductionRateBlockDisplay.tsx` to use `getMaterialIcon()` instead of the hardcoded `Paintbrush` for both paint material and primer material lines.
5. Update the PDF generator (`pdfGenerator.ts`) to use a text-based equivalent — e.g., a small Unicode symbol or just omit the icon in PDF since it was using the paintbrush emoji character, or use a type-appropriate label prefix.
6. Test with existing paint/primer materials to ensure no regression — paintbrush icon should still show for paint type materials.

## Relevant files
- `client/src/components/ProductionRateBlockDisplay.tsx:86-198`
- `client/src/components/RoomBuilder.tsx:2000-2080`
- `client/src/lib/pdfGenerator.ts:1129-1210`
- `shared/schema.ts:186-197,1385-1399`
