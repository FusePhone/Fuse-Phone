# Fuse Phone - Business CRM Application

## Overview
Fuse Phone is a full-stack CRM application designed to centralize lead, client, and document management for small businesses. Its primary purpose is to enhance operational efficiency and foster growth by streamlining business operations and effectively managing customer relationships. Key capabilities include an 8-stage project pipeline, AI-powered communication, integrated financial tools, and comprehensive customer relationship management. The project aims to provide a robust solution for businesses to manage their sales process, customer interactions, and financial transactions efficiently, with features like subscription tiers, advanced AI tools, and multi-tenancy support.

## User Preferences
Preferred communication style: Simple, everyday language.
Auth method: Google OAuth - cannot be automated with Playwright. Use email/password test accounts for automated testing.
Always use email/password for testing and development flows.

## System Architecture

### UI/UX Decisions
- **Framework & Libraries**: React 18 with TypeScript, shadcn/ui (Radix UI primitives), Tailwind CSS for styling, Wouter for routing, and React Hook Form with Zod for forms.
- **Document Workflow**: Features a full-screen line item editor, digital signatures, automatic locking, optional line items, and a consolidated header card with dynamic actions. Proposal Templates editor supports drag-and-drop reordering of mixed estimate blocks + line items; ordering persists via `entry_order` JSONB column.
- **RichTextEditor**: Supports various modes, including a fullscreen portal-based editing pattern.

### Technical Implementations
- **Backend**: Node.js with Express, TypeScript (ESM), and a RESTful API.
- **State Management**: TanStack React Query with per-user IndexedDB persistence for key API endpoints.
- **Real-Time Communication**: Authenticated WebSockets for live updates.
- **ORM**: Drizzle ORM with shared table definitions and Zod schemas.
- **Authentication**: Custom email/password, Google Sign-In, and OTP email code login.
- **Multi-Tenancy**: All data entities are `userId`-linked and enforced.
- **Subscription & Access Control**: A 3-tier subscription system (Starter, Core, Elite) with feature gating, promo code support, and multi-user role-based access control for Elite tier. Supports split billing for web (Stripe), iOS (Apple StoreKit 2 via a custom Capacitor plugin + Apple App Store Server API + signed App Store Server Notifications V2), and Android (Google Play Billing v7 via a custom native Capacitor plugin `PlayBilling` + Google Play Developer API + signed Real-Time Developer Notifications over Pub/Sub). All three surfaces sell the same products: 3 base tiers + 3 add-ons (Make It Your Own / white-label, FuseAI, AI Virtual Assistant). On iOS, add-ons are separate auto-renewable subscriptions (`make_it_your_own_monthly`, `fuse_ai_monthly`, `ai_assistant_monthly`) tracked via per-add-on `apple_*_original_txn_id` columns on `users`. Android add-ons mirror the same product IDs and are tracked via `google_play_*` columns on `users`.
- **Project & Contact Management**: Manages a 9-stage lead pipeline with automated progression and visual tracking. Includes CRUD for contacts, lead source/status tracking, and an archiving system with auto-unarchive on inbound SMS.
- **Messages**: 1-on-1 thread architecture for inbound SMS (Twilio + OpenPhone webhooks) with push notification deep links. Outbound "send to multiple recipients" functionality directs replies to individual contact threads.
- **AI Features**: Includes FuseAI Project Assistant, on-demand AI Response generation, AI Scheduling Assistant, AI Reminders, AI Lead Suggestions, and an AI Virtual Assistant Add-on. (Smart Negotiation Guard and AI Floor Plan Analysis exist in the codebase but are intentionally hidden from all marketing/subscription surfaces while they remain unpolished.)
- **Payment & Financing**: Integrates with Stripe Connect and Square OAuth for payment processing, and supports customer financing options.
- **Communication Systems**: Twilio-based phone system (VoIP, logging, conferencing, IVR, voicemail transcription), automated customer notifications, professional email templates, and a bulk SMS/email campaigns module. In-app messaging is prioritized for Elite users with configured phone integrations.
- **Document Features**: Supports document photos with annotations, quick share options (QR codes), customizable booking forms, optional line items, document discount system, customer visibility settings for pricing, and multi-tax rate profiles.
- **Job Costing & Rates**: Includes material markup, multi-coat rates, complexity hours, repair fields, and a comprehensive job costing rate locking system for accurate P&L. Features individual wall selection and customizable quantity labels per surface.
- **Field Worker Features**: GPS-assisted appointment tracking, redesigned job detail tabs (Activity, Time Log, Photos, Receipts, Work Order), and crew receipt submissions with AI auto-scanning and owner approval workflows.
- **Team Management**: Crew groups, owner-to-crew notes/broadcasts with push notifications and acknowledgment, and a team communication hub with WebRTC voice calling and per-user read tracking.
- **Website Page Builder (GamePlan)**: AI-powered generation of conversion-focused website pages (Home, Service, Location) with brand color injection, company info auto-population, structured CSS design system, premium ZIP targeting, full-page iframe preview, and WordPress Pages publishing integration. Includes Location Page Builder with CMS fields. Features a centralized dashboard for managing WordPress pages.
- **Sales & Metrics**: Customizable date range metrics, actual vs. projected P&L, monthly sales goal tracking, and lead intelligence with source analysis and budget recommendations.
- **Productivity & Utilities**: CSV import/export for Materials and Surfaces, production calculators, Paint Color Library with seeded colors and project assignment, and a Help Center with FuseAI chat.
- **Performance & PWA**: Gzip compression, immutable cache headers, service worker precaching, lazy page prefetching, IDB query persistence, staggered reconnect invalidations, and role-aware prefetching, alongside PWA and native app support.
- **Color Selection System**: Redesigned Colors tab with inline room/surface listing, inline color search, two-way contractor+customer approval workflow with shareable customer review links, and color submission management. Includes a Paint Color Library with 5,774+ colors from Benjamin Moore, Sherwin-Williams, and Farrow & Ball. Features paint order system with container size and quantity.
- **Per-Proposal Ownership (May 2026)**: Each proposal/estimate document owns its own colors and work order. Schema: `documentId` column on `workOrders`, `projectColorSelections`, `projectColorGroups`, `colorSubmissions`. Migration backfills existing rows to the project's OLDEST proposal. Endpoints `GET/POST /api/documents/:docId/work-order` and storage helper `getWorkOrderByDocument`. Auto-creation: a work order is auto-created when a proposal/estimate is accepted (signed) — both contractor-side and customer-portal sign paths. **UI**: Project Detail now shows Proposal Cards in the Documents tab. Each card contains its child invoices/change orders plus inline access rows for Colors and Work Order (Work Order row is disabled until the proposal is accepted). Top-level "Colors" and "Work Order" tabs were removed; their viewers are unchanged and still reached via the proposal card click-through. A multi-proposal banner appears when a project has more than one proposal so the owner knows which one currently owns the colors/work order.
- **Work Order Public View (May 2026)**: `/api/work-order/view/:token` now returns `scopeSections` (interleaved production rate blocks + standalone line items, ordered by `content.itemOrder`) plus `changeOrders` (signed COs whose `sourceDocumentId` matches the bound proposal, each with their own `scopeSections`). Each block exposes its rooms with active surfaces (walls/ceiling/baseboard/casing/etc.), per-surface coats from `coatsOverride`, repair badges from `repairOverride`, room scope notes, and material group results. `WorkOrderViewer.tsx` renders an amber "X Change Order(s) added" banner at top that smooth-scrolls to a `#change-orders` section at the bottom. Optional items honored via `acceptedOptionalItems`.
- **Branding**: "Make It Your Own" add-on for branded portal subdomain and removal of Fuse Phone branding.
- **Multi-User / Team Seats (May 2026, Phase 1)**: Elite-only. Owner is always free. 3 free field-worker seats (Crew Lead, Field Employee). Office seats (Sales Rep, Project Manager, Office Manager, custom roles) are paid add-ons — Stripe checkout for paid seats arrives in Phase 2. Field-worker roles have a hard capability whitelist enforced on both client and server (`shared/teamRoles.ts` — `FIELD_WORKER_ALLOWED_CAPABILITIES`). Pricing: $19/mo per extra field worker, $49/mo per office seat. Admin accounts bypass all seat limits for testing. Invite endpoint returns HTTP 402 with `code: SEAT_LIMIT_FIELD_WORKER | SEAT_LIMIT_OFFICE` when the free allowance is exhausted. iOS shows no seat-purchase UI — owners on iOS can keep inviting only while free seats remain. **Subscription lapse handling**: if an owner's subscription becomes inactive, all team members hit a full-screen `TeamMemberLockedWall` ("Your company subscription is on hold. Ask {Company} to renew." + Sign Out). The owner is NOT blocked. After `TEAM_LOCKOUT_BANNER_THRESHOLD_DAYS` (30) days of lapse with locked-out team members, the owner sees an amber warning banner in `AppBanners`. No auto-delete of memberships. Endpoints: `GET /api/user/access-status`, `GET /api/company/locked-team-status`, `GET /api/company/seat-usage`. Existing `company_users` + `company_invitations` rows were wiped (no grandfather) before Phase 1 launch.

## External Dependencies

### Database
- **PostgreSQL**

### Authentication
- **Replit Auth**

### Third-Party Libraries
- **Radix UI**
- **Recharts**
- **react-signature-canvas**
- **date-fns**
- **Lucide React**
- **web-push**
- **Google Play Billing Library v7** (`com.android.billingclient:billing:7.1.1`) wrapped by an in-repo native Capacitor plugin `PlayBilling` (no Cordova)

### Integrations
- **Twilio** (SMS, voice)
- **Google APIs** (Gmail, Calendar, Maps)
- **OpenAI** (GPT-4o-mini for AI services)
- **CompanyCam** (Job site photo documentation)
- **Thumbtack** (Lead import)
- **Facebook Lead Ads** (OAuth-based lead capture, Conversions API)
- **Zapier** (Webhook integration)
- **Stripe** (Payment processing)
- **SendGrid** (Custom domain email)
- **Cloudflare** (Cloudflare for SaaS for custom hostname SSL)
- **WordPress** (for GamePlan page publishing)