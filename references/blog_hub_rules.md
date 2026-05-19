# Blog Hub Page Rules & Content Strategy

## Overview
The blog hub (`preview-blog.html`, WP page ID 2560) positions Gama Interior Painting as a premium interior painting specialist serving Nassau County and Brooklyn. Always read this before making changes to the blog hub or creating new blog posts.

## Page Structure (Section Order)
1. **Header** — Logo + "Painting & Renovation" + sticky CTA buttons (Call Now / Get a Free Estimate)
2. **Trust Strip** — Google Guaranteed, EPA Lead-Safe, Licensed & Insured, 2-Year Warranty
3. **Hero** — Title: "Interior Painting Insights & Project Highlights"; premium intro copy; topic list
4. **Filter Bar** — Tabs: All Posts | Nassau County | Brooklyn | Tips & Advice
5. **Featured Article** — Single highlighted article with red left border
6. **Featured Nassau County Projects** — 6 project cards (Garden City, Glen Head, Old Westbury, Roslyn, Manhasset, Elmont) — ALWAYS above Brooklyn
7. **Homes We Work In** — Home types: Colonials, Luxury Homes, Co-ops & Condos, Brownstones, High-End Residential, Split-Levels, Historic Properties
8. **Brooklyn Painting Projects & Tips** — 6 blog post cards
9. **Nassau County Painting Guides** — 6 cards targeting premium areas (Garden City, Glen Head, Old Westbury, Roslyn, Manhasset, Lynbrook)
10. **Painting Advice & Hiring Tips** — 3 advice cards
11. **Areas We Serve** — Three groups: Premium Nassau / North Shore, Nassau County & LI, Brooklyn Neighborhoods
12. **CTA Block** — "Schedule Your Interior Painting Estimate"
13. **Footer**

## Geographic Priority Rule
Nassau County content ALWAYS appears above Brooklyn content. Brooklyn should not dominate the top of the page. The goal is to attract premium Nassau County homeowners from Garden City, Glen Head, Old Westbury, Roslyn, Manhasset, Brookville, and Sands Point.

## Premium Language Rules
### ALWAYS USE:
- detailed finishes
- precision work
- careful preparation
- clean job sites / clean results
- professional crews
- quality materials
- proper surface preparation

### NEVER USE:
- affordable
- cheap
- budget-friendly
- fast service
- we do everything
- discount

## Branding Rules
- Always use: **Gama Interior Painting**
- NEVER use: "Gama Interior Painting OF Brooklyn" or any "of [location]" variant
- Consistent naming across all titles, descriptions, and meta tags

## Blog Post Types (Priority Order)
### A. Project Posts (Highest Priority)
Real project walkthroughs with city, home type, rooms, services, and results.
Examples:
- Interior Painting in Garden City Colonial Home
- Brooklyn Apartment Repaint — Full Project Walkthrough
- Wallpaper Removal and Painting in New Hyde Park

### B. Local Advice Posts
Location-specific guidance with service relevance.
Examples:
- How to Choose an Interior Painter in Garden City
- What Brooklyn Apartments Need Before Interior Painting
- Common Wall Issues in Nassau County Homes

### C. General Expertise Posts
Broad homeowner education.
Examples:
- Drywall vs Plaster Crack Repair: What Homeowners Should Know
- Best Paint Finishes for Busy Homes
- When to Skim Coat Before Painting

## Blog Post Template Structure
1. H1
2. Intro
3. Problem / project context
4. Work performed
5. Materials / services used
6. Result / transformation
7. Local relevance
8. CTA (varied wording)
9. Related internal links

### Project Posts Must Include:
- City name
- Property/home type (colonial, brownstone, co-op, etc.)
- Rooms/areas worked on
- Services performed (painting, trim, skim coat, etc.)
- Result description

### Advice Posts Must Include:
- Local context where relevant
- Service relevance
- FAQ or mini guidance
- Links to service/location pages

## Internal Linking Rules
- Every blog post must link to at least 1 relevant location page
- Every blog post should link to at least 1 service page if applicable
- Anchor text must feel natural, not spammy
- On the blog hub, each card shows a "Related:" link under the excerpt
- Examples of natural anchor text:
  - "See our Garden City painting page"
  - "Explore our Brooklyn interior painting services"
  - "Get a free estimate from our team"

## CTA Rules
- Every blog post ends with a CTA linking to a location page, service page, or contact/estimate page
- Rotate CTA wording — do not repeat the same copy every time
- Include city/service naturally when relevant
- CTA variants:
  - "Schedule Your Interior Painting Estimate"
  - "Get a Free Estimate"
  - "See our work in [City]"
  - "Contact us about your project"

## Areas We Serve Rules
- Every visible city MUST be a clickable link if a page exists
- No mixing linked cities with plain-text cities in the same group
- If a city page does not exist, it may appear as plain text in the Premium group only (Old Westbury, Roslyn, Manhasset, Brookville, Sands Point are currently unlinked but displayed)
- Three area groups with distinct styling:
  1. **Premium Nassau County & North Shore** — purple badges (.zip-badge-premium): Garden City, Glen Head, Old Westbury, Roslyn, Manhasset, Brookville, Sands Point
  2. **Nassau County & Long Island** — default badges: Rockville Centre, Hempstead, Uniondale, Franklin Square, Elmont, Valley Stream, Lynbrook, New Hyde Park, Baldwin, Oceanside
  3. **Brooklyn Neighborhoods** — red badges (.zip-badge-brooklyn): Brooklyn, Brooklyn Heights, Park Slope

## Card Tag Colors
- `.tag-brooklyn` — red (#e4181d on #fef2f2)
- `.tag-nassau` — purple (#7c3aed on #faf5ff)
- `.tag-li` — green (#16a34a on #f0fdf4)
- `.tag-tips` — blue (#2563eb on #eff6ff)
- `.tag-project` — gold (#a16207 on #fef9c3)
- `.tag-featured` — white on red (#e4181d)

## Card Title Humanization Rules
Vary title patterns across cards. Avoid repeating the same structure.
- **Story style**: "From Tired Walls to Precision Finishes in Brooklyn"
- **Question style**: "Should You Repaint Before Selling Your Lynbrook Home?"
- **Process style**: "What Sets Our Brooklyn Painting Process Apart"
- **Guide style**: "Matte, Satin, or Semi-Gloss? A Guide for North Merrick"
- **How-to style**: "Wall Prep 101: Getting a Lasting Finish in Uniondale"
- **Before/after style**: "Interior Painting in a Garden City Colonial Home"
- **Local-guide style**: "Color Trends That Work for Historic Hempstead Homes"

## Project-to-Page Flow
When a completed project is added:
1. If city page exists → append project to that location page
2. Optionally generate a supporting blog post from the same project
3. Blog post MUST link back to the city page
4. City page remains the main ranking asset
5. Blog post is supporting content, not a replacement

## Image Style Rules
Only use images that:
- Show clean, finished interiors
- Have good lighting
- Highlight trim, walls, and detail work

Never use:
- Messy jobsite photos
- Dark or cluttered rooms
- Generic stock photos

## Services Covered in Blog Content
- Interior painting
- Cabinet refinishing
- Drywall repair
- Plaster crack repair
- Skim coating
- Wallpaper removal
- Trim & molding
- Color & finish selection

## WordPress Push Rules (CRITICAL)
- NEVER push changes to live WordPress without explicit user approval
- Only push `<style>` block + body sections
- Never include `<!DOCTYPE>`/`<html>`/`<head>`/`<body>` wrappers
- Always fetch existing page with `?context=edit` before updating
- Blog hub WP page ID: 2560

## Key URLs
- Preview: `/preview-blog.html` (local)
- Live blog hub: gamainteriorpainting.com (WP page ID 2560)
- Contact/estimate: gamainteriorpainting.com/contact-us/
- Phone: (888) 971-6033

## Live Location Pages for Linking
- Garden City: /painter-garden-city-ny/
- Glen Head: /painter-glen-head-ny/
- Elmont: /painter-elmont-ny/
- New Hyde Park: /painter-new-hyde-park-ny/
- Rockville Centre: /painter-rockville-centre-ny/
- Hempstead: /learn-about-hempstead/
- Uniondale: /uniondale-new-york/
- Franklin Square: /painter-franklin-square-ny/
- Valley Stream: /painter-valley-stream-ny/
- Lynbrook: /painter-lynbrook-ny/
- Baldwin: /painter-baldwin-ny/
- Oceanside: /painter-oceanside-ny/
- Brooklyn: /interior-painting-brooklyn-ny/
- Brooklyn Heights: /painter-brooklyn-heights-ny/
- Park Slope: /painter-park-slope-brooklyn-ny/

## Pages Not Yet Created (Premium Targets)
- Old Westbury (no page yet)
- Roslyn (no page yet)
- Manhasset (no page yet)
- Brookville (no page yet)
- Sands Point (no page yet)

---

# Single Blog Post Template Rules

## Overview
The single blog post template (`preview-blog-post.html`) positions each post as a premium project showcase. Always read this before creating or updating individual blog posts.

## Page Structure (Section Order)
1. **Header** — Same as blog hub (logo + sticky CTA buttons)
2. **Trust Strip** — Same 4 badges as blog hub
3. **Post Hero** — Badge ("High-End Interior Painting"), H1 title, location + project type subtitle
4. **Featured Image** — Full-width clean interior photo with rounded corners and shadow
5. **Back to Blog link** — Links to /blog/
6. **Project Overview Box** — 6-field summary grid (Location, Scope, Paint Used, Coats, Timeline, Home Type)
7. **Intro Paragraph** — Strong positioning paragraph, confident tone
8. **Preparation & Surface Work** — Detail on patching, sanding, caulking, priming
9. **Application & Materials** — Paint brands, finish types, coats, technique
10. **Final Results** — Clean summary of completed work
11. **Project Gallery** — 4-8 clean interior images in 2-column grid
12. **Local SEO Paragraph** — City + nearby areas + services offered
13. **Related Projects** — 3 cards linking to other project posts
14. **CTA Block** — Same as blog hub ("Schedule Your Interior Painting Estimate")
15. **Footer** — Same as blog hub

## Project Overview Box Fields
- Location (city, state)
- Scope (walls, trim, doors, ceilings, etc.)
- Paint Used (brand + product line for walls and trim)
- Coats (number for walls and trim)
- Timeline (estimated days)
- Home Type (colonial, brownstone, co-op, split-level, etc.)

## Content Tone & Specificity
- Confident, clean, professional — not salesy or aggressive
- Focus on craftsmanship and detail
- Premium language only (see hub rules)
- **CRITICAL: Each post must feel like a real project, not a reusable template**
- Include 2-3 specific details per post that are unique to that project, such as:
  - Plaster wall cracking / skim coating needed
  - Paint buildup on older trim profiles
  - Color transition between floors / rooms
  - Ceiling height or staging challenges
  - Protecting built-ins, bookshelves, or detailed molding
  - Specific BM color names and codes (e.g., Balboa Mist OC-27)
  - Home architectural features (crown molding, wainscoting, window returns)
- The intro should reference the home's actual condition before work started
- The results section should reference specific improvements visible in the finished home

## Image Rules
- Clean, bright, well-lit finished interiors
- Focus on walls, trim, molding details
- No messy jobsites, clutter, or dark rooms
- Optional before/after only if both photos are clean
- Gallery images: 4-8 per post, 2-column grid on desktop, 1-column on mobile

## Local SEO Paragraph Template
"We provide interior painting services throughout [City] and nearby areas in [County], including [nearby cities]. Our team works in [home types] with a focus on detailed finishes, careful preparation, and clean results."

## Related Projects Section
- Show 3 cards linking to other project posts
- Mix of Nassau County and Brooklyn projects
- Each card is a **fully separate, fully clickable block** wrapped in `.related-card-link`
- Each card contains: location tag (`.r-tag`), title (`h3`), short description (`.r-desc`), and "View Project" link (`.r-link` with top border separator)
- Cards must never visually merge — each has its own border, padding, and hover state
- Card descriptions should reference project-specific details, not generic language

## CSS Classes Reference
- `.post-hero` — Hero section with badge, H1, meta line
- `.post-badge` — Purple uppercase badge
- `.overview-box` — Project summary grid
- `.overview-grid` — 3-column grid (2-col on tablet, 1-col on mobile)
- `.gallery-section` / `.gallery-grid` — 2-column image grid
- `.local-seo` — Light background local SEO paragraph
- `.related-section` / `.related-grid` — 3-column related posts
- `.related-card-link` — Wrapping `<a>` for each card (fully clickable, block-level)
- `.related-card` — Inner card with border, padding, and hover lift
- `.r-desc` — Card description text (replaces generic `<p>`)
- `.r-link` — "View Project" link with top border separator
- `.back-link` — Red "Back to Blog" link
- `.red-accent` — Small red divider bar

---

# Standardized Trust Strip (Use on ALL Pages)

The trust strip must appear on EVERY page (homepage, blog hub, blog posts, location/service area pages). It goes directly below the sticky CTA buttons (gp-btns) and above the hero section. All pages must use the exact same HTML and CSS.

## CSS (add inside `<style>`)
```css
.trust-strip { background: #fafafa; border-bottom: 1px solid #eee; padding: 14px 24px; }
.trust-strip-inner { display: flex; flex-wrap: wrap; justify-content: center; align-items: center; gap: 20px; max-width: 900px; margin: 0 auto; }
.trust-item { display: flex; align-items: center; gap: 6px; font-size: 0.8em; font-weight: 600; color: #666; }
.trust-item svg { width: 18px; height: 18px; flex-shrink: 0; }
```

## HTML (place after gp-btns div, before hero)
```html
<div class="trust-strip">
  <div class="trust-strip-inner">
    <div class="trust-item">
      <svg viewBox="0 0 18 18"><circle cx="9" cy="9" r="8" fill="#16a34a"/><path d="M5.5 9l2.5 2.5 4.5-4.5" stroke="#fff" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>
      Google Guaranteed
    </div>
    <div class="trust-item">
      <svg viewBox="0 0 18 18"><path d="M9 1L3 4.5v4.5c0 4.2 2.6 8 6 9 3.4-1 6-4.8 6-9V4.5L9 1z" fill="#1e6b3a"/><text x="9" y="12" text-anchor="middle" font-size="5" font-weight="700" fill="#fff" font-family="Arial">EPA</text></svg>
      EPA Lead-Safe
    </div>
    <div class="trust-item">
      <svg viewBox="0 0 18 18"><path d="M9 1L3 4.5v4.5c0 4.2 2.6 8 6 9 3.4-1 6-4.8 6-9V4.5L9 1z" fill="#2563eb"/><path d="M5.5 9l2.5 2.5 4.5-4.5" stroke="#fff" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>
      Licensed &amp; Insured
    </div>
    <div class="trust-item">
      <svg viewBox="0 0 18 18"><path d="M9 1L3 4.5v4.5c0 4.2 2.6 8 6 9 3.4-1 6-4.8 6-9V4.5L9 1z" fill="#e4181d"/><text x="9" y="11" text-anchor="middle" font-size="5" font-weight="700" fill="#fff" font-family="Arial">2YR</text></svg>
      2-Year Warranty
    </div>
  </div>
</div>
```

## 4 Badges (in order)
1. **Google Guaranteed** — green circle with checkmark
2. **EPA Lead-Safe** — dark green shield with "EPA" text
3. **Licensed & Insured** — blue shield with checkmark
4. **2-Year Warranty** — red shield with "2YR" text

## Rules
- Icons are 18x18px SVG — never larger
- Layout is horizontal (side-by-side), wraps on mobile
- Background: #fafafa with bottom border
- Text: 0.8em, weight 600, color #666
- NEVER use the old `.trust-badges` / `.trust-badge-item` / `.badge-shield` classes
- NEVER use pill-shaped bordered badge items
- Always include both the CSS AND HTML — missing CSS causes oversized SVGs

## Pages Currently Using Trust Strip
- Homepage (WP page 4)
- Blog Hub (WP page 2560)
- Elmont Post (WP post 4764)
- Elmont Location (WP page 4664)
- New Hyde Park (WP page 4616)
- Garden City (WP page 3766)
- Glen Head (WP page 4689)
- Brooklyn (WP page 4567)
- Park Slope (WP page 4581)
- Brooklyn Heights (WP page 4582)
