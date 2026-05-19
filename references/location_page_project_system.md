# Location Page Project Update System

## Core Concept
Location pages are **living SEO assets**. Every completed project in a city strengthens that city's page over time. The location page is the main ranking asset — it keeps getting updated as jobs are completed.

## Main Rules
- If a location page already exists for a city: **do NOT create another competing page**
- **Do NOT replace** the existing page
- **Append** the new completed project into that page as a new project entry
- The location page remains the main SEO page for that city
- Do not overwrite the whole page every time
- Do not regenerate the entire page unless necessary
- This is an **append/update system** for existing location pages

## Data Model (Per Project)
- project_title
- project_city
- completion_date
- project_summary
- project_images[]
- before_after_images[] (if available)
- scope_of_work[]
- products_used[] (if available)
- project_timeline
- project_result
- testimonial / local review (if available)
- property_type
- rooms_or_areas

## Page Display Logic
- Show newest project first
- Allow 3–6 projects per location page
- If more than 6: paginate/collapse older ones or show top recent and archive older
- Section title: "Recent Painting Projects in {City}" or "Recent Interior Painting & Repair Projects in {City}"
- Each project card: headline, 2–6 images, short summary, bullet scope, result paragraph

## SEO Rules for Project Entries
Each project added should:
- Mention the city naturally
- Mention the type of home / room / property if known
- Mention services performed
- Mention prep / repairs / finishes if relevant
- Use descriptive image alt text
- Services to mention naturally: interior painting, cabinet painting, drywall repair, plaster crack repair, skim coating, wallpaper removal, trim/molding painting
- No keyword stuffing — keep it natural and project-based

## Project Update Flow
When a new project is completed:
1. Check if a location page already exists for that city
2. If yes: append the new project, place newest first, refresh related FAQ/review/local proof if needed
3. If no: create a new location page using the existing SEO engine, use the completed project as the featured project

## Blog Posts (Optional Support)
- Blog posts are **secondary** — they support the location page, not replace it
- Blog post should link to the main city/location page
- Use for: deeper story, more photos, before/after writeup, homeowner details, process details

## Internal Linking
- Keep internal links to nearby areas
- Optionally add related links to service pages and blog posts for that city
- Do not break the current internal linking system

## Admin Flow ("Add completed project")
Inputs: city, service types, project title, summary, images, scope bullets, timeline, result, review/testimonial
- If city page exists → append project there
- If city page does not exist → create new SEO location page from template
- Update image alt text automatically using city + room/service context
- Keep project order newest first

## Quality Rules
Each added project should:
- Feel unique
- Be based on real work
- Strengthen local proof
- Improve conversion
- Improve freshness of the location page
