# Branded Document Template Header

## What & Why
Redesign the customer-facing document header (proposals, invoices, change orders) to look professional and branded — similar to the contractor's own website. Each contractor should be able to customize the header with their brand colors, logo, tagline, and trust badges. The default look uses Fuse Phone's navy palette so new users get a polished template out of the box.

## Done looks like
- Customer portal documents open with a branded header bar using the contractor's primary color as background and their accent/secondary color as a bottom border stripe
- Logo sits on the left side of the header; a tagline/motto sits on the right (e.g., "Painting & Renovation")
- Below the header bar, 3–4 trust badges display (e.g., "Fully Licensed & Insured", "10+ Years Experience") as compact pill/chip elements with checkmark icons
- A "Call" action button appears in the header so the customer can quickly phone the contractor
- Company info (name, address, license) displays in a clean card below the header
- Customer/client info and document details follow in the existing 3-column layout
- In Company Profile settings, contractors can configure: secondary/accent color, tagline text, and their trust badges (add/remove/reorder)
- Default colors (navy primary, lighter accent) are used when a contractor hasn't customized yet
- PDF generator reflects the same branded header layout
- All existing document types (proposal, estimate, invoice, change_order) use the new header

## Out of scope
- Per-document-type template variations (one template for all types for now)
- Custom fonts or typography beyond what exists
- Header background images or patterns
- Booking form or email template redesign

## Tasks
1. **Schema additions** — Add `secondaryColor` (accent/border color), `tagline` (motto text) fields to company_settings. The existing `trustBadges` jsonb field and `brandColor` field will be reused. Add a database migration for the new columns.

2. **Company Profile settings UI** — Add a "Document Branding" section to the Company Profile page where contractors can set their secondary/accent color (with color picker), enter a tagline, and manage trust badges (add/remove with text labels and optional icon selection). Show a mini live preview of the header.

3. **CustomerPortal header redesign** — Replace the current centered-logo-with-text header in CustomerPortal.tsx with the new branded layout: colored header bar (primary bg, accent border), logo left + tagline right, trust badge pills below, call button in header. Keep the 3-column client/job/document info grid below.

4. **PDF generator header update** — Update pdfGenerator.ts to render the same branded header layout in exported PDFs: colored header band, logo placement, tagline, trust badges, and company info card.

## Relevant files
- `shared/schema.ts:493-630`
- `client/src/pages/CustomerPortal.tsx:1274-1360`
- `client/src/pages/CompanyProfile.tsx`
- `client/src/lib/pdfGenerator.ts`
- `server/routes.ts`
