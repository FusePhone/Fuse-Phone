# Objective
Multi-user / seat billing / lapse handling for FusePhone CRM.

# Decisions (locked)
- Tier: Elite-only. Owner free + 3 free field-worker seats (Crew Lead, Laborer).
- Extra field worker = $19/mo, extra office (Sales Rep, Project Manager, Office Manager, custom) = $49/mo.
- Web (Stripe) only — iOS lets you invite while seats remain, no upsell shown on iOS.
- No grandfather: wipe existing company_users + company_invitations.
- Field-worker roles have a HARD capability whitelist — UI + server block any toggle that would give them office capabilities.
- Owner-unpaid: full-screen wall for team members ("Your company subscription is on hold. Ask {Company Name} to renew."). Sign Out button. Owner NOT blocked (sees normal paywall).
- 30 days after owner lapses → warning banner on owner dashboard. NO auto-delete of memberships.

# Tasks

### T001: Phase 1 — non-Stripe foundation (THIS TURN)
- Blocked By: []
- Wipe company_users + company_invitations
- New shared module `shared/teamRoles.ts` with role classification + capability whitelist + free seat constants
- Server: enforce whitelist in PATCH /api/company/users/:id (capabilities) and PUT /api/company/role-defaults
- Server: gate invite endpoint on free-seat count; block paid invites with "Paid seats coming soon" until Phase 2
- Server: new endpoint GET /api/user/access-status returns lockout info
- Frontend: TeamMemberLockedWall component (full-screen)
- Frontend: hook into App.tsx to show wall for team members when owner unpaid
- Frontend: owner dashboard banner when team-locked >= 30 days
- Frontend: UserManagement.tsx — show free-seat usage, disable blocked capability toggles with tooltip
- Update replit.md

### T002: Phase 2 — Stripe paid seats + admin panel grouping (NEXT TURN)
- Blocked By: [T001]
- Stripe products/prices for $19 field worker + $49 office
- Quantity-based subscription items added to owner's Elite subscription
- Web invite flow: prompts to purchase a seat when free allowance exhausted
- iOS invite: unchanged behavior (still only free seats; "out of seats" message when full, no upsell)
- Superuser AdminUsers.tsx: group team members under owner rows (expandable)

# Done when
Phase 1 ships clean; user confirms; then Phase 2.
