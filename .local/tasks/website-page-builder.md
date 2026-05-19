# Website Page Builder & Preview

## What & Why
Enhance the Game Plan module with a professional Website Page Builder that generates conversion-focused, visually powerful service and location pages for painting contractors. Currently, the Game Plan generates basic SEO city pages with plain HTML. This upgrade introduces page type templates (Home, Service, Location), a live in-app preview, top-ZIP targeting for Nassau and Brooklyn, and polished HTML/CSS output that publishes beautifully to WordPress.

The design will be original and bold — built around the user's own brand identity (red #e4181d, gold/yellow accent, black) pulled from their company settings. No copying competitors. The generated pages will feel premium, authoritative, and conversion-driven.

## Brand Identity
- **Primary Red**: #e4181d (from company_settings.brand_color)
- **Accent Gold/Yellow**: Warm gold for CTAs, highlights, and badges
- **Black**: Headers, text, strong contrast
- **White**: Clean backgrounds
- The user's company logo (from company_settings.logo) will be placed in the generated pages
- Company name, phone, email, and address pulled from company_settings automatically

## Done looks like
- A new **page type selector** in the Game Plan Generator tab: **Home Page**, **Service Page** (e.g., Exterior Painting, Interior Painting, Cabinet Refinishing), or **Location Page** (city/neighborhood).
- Each page type generates a unique, conversion-optimized HTML page with self-contained CSS, styled in the user's brand colors. Sections include:
  - **Hero banner** — bold headline, subheadline, and a prominent gold CTA button on a dark/red background
  - **Services overview** — card-style layout with service descriptions
  - **"Why Choose Us"** — trust signals (years of experience, warranty, licensed/insured, satisfaction guarantee)
  - **Our Process** — step-by-step visual flow (consultation → prep → paint → inspection)
  - **FAQ section** — 6–8 locally relevant questions with expandable answers
  - **Testimonials placeholder** — styled area where user can embed their reviews widget
  - **Before/After gallery placeholder** — image grid ready for project photos
  - **Service area section** — cities and ZIP codes served
  - **Contact / CTA footer** — phone, email, "Schedule Your Free Estimate" button
  - **Multiple CTA buttons** scattered throughout for maximum conversion
- A **full-page live preview** inside FusePhone — renders the generated HTML in an iframe with mobile/desktop viewport toggle so users see exactly what visitors will see.
- **Top ZIP code targeting** — pre-seeded high-value ZIP codes for Nassau County and Brooklyn, with a "Premium" badge in the Cities tab so users can prioritize affluent neighborhoods.
- The generated HTML+CSS is self-contained and renders well in WordPress without depending on the WP theme.
- Existing WordPress publishing flow (queue → review → publish) continues to work unchanged.

## Out of scope
- Drag-and-drop page editing or WYSIWYG block editor
- Custom CSS theme editor
- Direct domain hosting (still publishes to user's WordPress site)
- Live Google reviews API integration (placeholder section; user embeds their own widget)
- Multi-language support

## Tasks
1. **Page type system and template architecture** — Add a page type selector (Home, Service Page, Location Page) to the Generator tab. Create server-side template definitions that map each type to its required sections, AI prompt structure, and default content blocks. Store the page type on queue items. Pull brand color and company info from company_settings to inject into the AI prompts and templates.

2. **Conversion-focused AI prompts with branded CSS** — Write new OpenAI generation prompts for each page type that produce structured, section-based HTML with embedded CSS using the user's brand colors (red, gold, black). The output should be a complete, self-contained styled page — hero, services, why-choose-us, process, FAQ, testimonials, gallery, service areas, and contact — all production-ready for WordPress.

3. **Top ZIP code seeding for Nassau and Brooklyn** — Add a curated list of high-value ZIP codes for Nassau County (Great Neck, Manhasset, Roslyn, Garden City, Old Westbury, Oyster Bay, Brookville, etc.) and Brooklyn (Brooklyn Heights, Park Slope, DUMBO, Cobble Hill, Carroll Gardens, Williamsburg, Bay Ridge, etc.). Add a "Premium" filter or badge in the Cities tab to help prioritize wealthy neighborhoods.

4. **In-app page preview** — Build a full-width preview dialog that renders generated HTML in an isolated iframe. Include a mobile/desktop viewport toggle so users can check how pages look on both screen sizes before publishing.

5. **UI integration in Game Plan** — Wire the page type selector into the Generator tab, upgrade the Queue preview to use the new full-page preview, and connect to the existing WordPress publish flow. Show page type counts on the Dashboard tab.

## Relevant files
- `client/src/pages/GamePlan.tsx`
- `server/routes.ts:23426-23530`
- `shared/schema.ts:1587-1712`
- `server/storage.ts`
