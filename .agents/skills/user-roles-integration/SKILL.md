---
name: user-roles-integration
description: Complete plan for FusePhone CRM multi-user roles system. Use when implementing, extending, or debugging company user management, role-based access control, team invitations, or per-user billing features.
---

# User Roles Integration

Multi-user system allowing company owners to invite team members with specific roles. Gated behind the Elite subscription tier, with full management available only to admin (isAdmin) users.

## Roles

| Role | Description |
|------|-------------|
| **Owner** | Company account owner. Full admin access. Cannot be removed or role-changed. |
| **Office Manager** | Manages office operations, scheduling, documents, contacts. |
| **Project Manager** | Manages projects, proposals, crew assignments, job tracking. |
| **Sales Rep** | Access to leads, pipeline, proposals, follow-ups. |
| **Crew Lead** | Field supervisor — work orders, crew management, photos, daily logs. |
| **Laborer** | Field worker — assigned jobs, clock in/out, messaging. |

## Database Schema

### `companyUsers` table
- `id` (serial, PK)
- `ownerId` (varchar, references users.id — the company owner)
- `userId` (varchar, references users.id — the team member)
- `role` (text: 'office_manager' | 'project_manager' | 'sales_rep' | 'crew_lead' | 'laborer')
- `status` (text: 'active' | 'suspended')
- `capabilities` (jsonb, nullable — per-user capability overrides as `Record<string, boolean>`)
- `linkedTeamMemberId` (integer, nullable — links to team_members.id for crew assignment scoping)
- `invitedAt` (timestamp)
- `createdAt` (timestamp)

### `companyInvitations` table
- `id` (serial, PK)
- `ownerId` (varchar)
- `email` (text)
- `role` (text)
- `token` (text, unique)
- `status` (text: 'pending' | 'accepted' | 'expired')
- `linkedTeamMemberId` (integer, nullable — carries through to companyUsers on accept)
- `expiresAt` (timestamp)
- `createdAt` (timestamp)

### `companySettings` additions
- `roleCapabilityDefaults` (jsonb, nullable — `Record<string, Record<string, boolean>>` storing universal role defaults)
- `customRoles` (jsonb, nullable — `Array<{ value: string; label: string; description: string }>` up to 10 custom roles)

## Custom Roles

Admins can create up to 10 custom roles via the Role Settings tab. Custom roles:
- Are stored in `company_settings.custom_roles` as JSONB
- Have a `value` (slug auto-generated from label), `label`, and `description`
- Cannot overlap with built-in role values (`office_manager`, `project_manager`, `sales_rep`, `crew_lead`, `laborer`, `owner`)
- Get their capability defaults from `roleCapabilityDefaults[customRoleValue]`
- Appear in all role dropdowns (invite, edit role, role settings)
- Can be deleted (users with that role will need to be reassigned)
- Custom roles are NOT treated as field workers (they get the standard full navigation)
- API: `GET /api/company/custom-roles`, `PUT /api/company/custom-roles`

## Capability System

### Capability Keys
| Key | Label | Description |
|-----|-------|-------------|
| `viewTeamMessages` | View Team Messages | See internal team conversations |
| `viewCustomerMessages` | View Customer Messages | See customer SMS and email conversations |
| `sendMessages` | Send Messages | Send SMS and emails to customers |
| `viewContacts` | View Contacts | See contact list and details |
| `manageContacts` | Manage Contacts | Create, edit, and delete contacts |
| `viewProjects` | View Projects | See project pipeline and details |
| `manageProjects` | Manage Projects | Create and edit projects, update stages |
| `viewDocuments` | View Documents | See estimates, proposals, and invoices |
| `createDocuments` | Create Documents | Create and edit estimates, proposals, invoices |
| `viewFinancials` | View Financials | See revenue, expenses, and financial data |
| `manageCalendar` | Manage Calendar | Create and edit appointments and events |
| `manageCrew` | Manage Crew | Manage team members and time tracking |
| `makeCalls` | Make Calls | Place and receive phone calls |
| `viewAssignedJobs` | View Assigned Jobs | See jobs assigned to them |
| `viewWorkOrders` | View Work Orders | See full work order details and scope of work |
| `viewCrewCalendar` | View Crew Calendar | See calendar with assigned/scheduled jobs |
| `clockInOut` | Clock In/Out | Use crew clock time tracking |
| `manageCrewClock` | Manage Crew Clock | Clock in/out other team members |
| `uploadPhotos` | Upload Photos | Add job site photos to projects |
| `addDailyLogs` | Add Daily Logs | Add notes and updates to project timelines |

### Default Role Capabilities
- **Office Manager**: viewTeamMessages, viewCustomerMessages, sendMessages, viewContacts, manageContacts, viewProjects, manageProjects, viewDocuments, createDocuments, viewFinancials, manageCalendar, manageCrew, makeCalls
- **Project Manager**: viewTeamMessages, viewCustomerMessages, sendMessages, viewContacts, viewProjects, manageProjects, viewDocuments, createDocuments, manageCalendar, manageCrew
- **Sales Rep**: viewTeamMessages, viewCustomerMessages, sendMessages, viewContacts, manageContacts, viewProjects, viewDocuments, createDocuments, manageCalendar, makeCalls
- **Crew Lead**: viewTeamMessages, viewProjects, manageCrew, viewAssignedJobs, viewWorkOrders, viewCrewCalendar, clockInOut, manageCrewClock, uploadPhotos, addDailyLogs (NO viewCustomerMessages)
- **Laborer**: viewTeamMessages, viewAssignedJobs, viewCrewCalendar, clockInOut, uploadPhotos (NO viewCustomerMessages)

### How Capabilities Resolve
1. Start with the role's default capabilities (from `companySettings.roleCapabilityDefaults` or hardcoded defaults)
2. Apply per-user overrides from `companyUsers.capabilities`
3. If a per-user override matches the role default, it's removed (stored as clean diff only)

### Server-Side Resolution
- `resolveUserCapabilities(userId)` — Returns `{ isOwner, role, capabilities, ownerId, linkedTeamMemberId, membership }`
- `requireCapability(capabilityKey)` — Express middleware; attaches resolved capabilities to `req.resolvedUser`; returns 403 if capability missing

## Storage Interface Methods

```
getCompanyUsers(ownerId)
getCompanyUser(ownerId, userId)
addCompanyUser(data)
updateCompanyUser(ownerId, id, data)  // supports { role, status, capabilities }
removeCompanyUser(ownerId, id)
createInvitation(data)
getInvitation(token)
getInvitations(ownerId)
acceptInvitation(token, userId)
deleteInvitation(ownerId, id)
```

## API Endpoints

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | `/api/company/users` | List company users | Admin only |
| POST | `/api/company/users/invite` | Send invitation (includes linkedTeamMemberId for field roles) | Admin only |
| DELETE | `/api/company/users/:id` | Remove user | Admin only |
| PATCH | `/api/company/users/:id` | Update role/status/capabilities | Admin only |
| GET | `/api/company/invitations` | List pending invitations | Admin only |
| DELETE | `/api/company/invitations/:id` | Cancel invitation | Admin only |
| POST | `/api/company/invitations/accept/:token` | Accept invitation | Authenticated |
| GET | `/api/company/role-defaults` | Get universal role capability defaults | Admin only |
| PUT | `/api/company/role-defaults` | Save universal role capability defaults | Admin only |
| GET | `/api/user/capabilities` | Get current user's resolved capabilities | Authenticated |
| GET | `/api/my-jobs` | List assigned jobs for field workers | viewAssignedJobs |
| GET | `/api/my-jobs/:projectId/work-order` | Get work order details | viewWorkOrders |
| POST | `/api/my-jobs/:projectId/daily-log` | Add daily log entry | addDailyLogs |
| GET | `/api/my-calendar` | Calendar events for assigned jobs | viewCrewCalendar |

All admin endpoints require `isAdmin`. Non-admin Elite users receive 403.

## Field Worker Data Scoping

- **Laborer**: Sees only projects where their `linkedTeamMemberId` appears in `project_crew_assignments`. Phone numbers hidden from contact data.
- **Crew Lead**: Sees all crew's assigned projects (all `project_crew_assignments` for the company). Can see phone numbers.
- `linkedTeamMemberId` on `company_users` connects the user's login to their `team_members` record for job assignment lookup.

## Invitation Flow

1. Admin invites user via email + role selection (field roles also allow selecting team member to link)
2. System generates unique token, sends branded email with link `/invite/{TOKEN}`
3. Recipient lands on dedicated invite acceptance page showing company logo, name, and role
4. Recipient signs up (Google or email/password) or signs in if they already have an account
5. For email/password signup via invite: email verification is skipped (invitation itself serves as verification)
6. For Google OAuth via invite: invite token is encoded in OAuth state, auto-accepted on callback
7. Backend creates `companyUsers` record (including `linkedTeamMemberId` from invitation), marks invitation as accepted
8. User is redirected to the app dashboard
9. Old `/auth?invite=TOKEN` links auto-redirect to `/invite/TOKEN`
10. If a pending/expired invitation already exists for the same email, resending replaces it with a fresh one
11. If the invitation was already accepted, admin is told the user is already a member
12. Users with existing company accounts (owners) can accept invitations to join other companies

## UI: User Management Page

- **Route**: `/settings/users`
- **Sidebar**: Under Settings as "Users" with Users icon, `minTier: "elite"`
- **Non-admin Elite**: Shows "Coming Soon" state with badge
- **Admin**: Full management interface with two tabs:
  - **Users Tab**: Active users list, per-user capability toggles (expandable), pending invitations
  - **Role Settings Tab**: Universal role capability defaults with toggle switches per role

### Users Tab Features
- Active users list (name, email, role, status)
- Owner row first, non-removable, non-editable role
- Per-user actions: change role, suspend/activate, remove
- Expandable "Capabilities" section per user showing toggles with "custom" badges for overrides
- Invite button with email + role selector dialog (field roles show team member link dropdown)
- Pending invitations section with cancel option

### Role Settings Tab Features
- Role selector buttons (Office Manager, Project Manager, Sales Rep, Crew Lead, Laborer)
- Toggle switches for each capability
- Save button appears only when changes are made
- Saved to `companySettings.roleCapabilityDefaults`

## Sidebar Navigation — Role-Aware

Field workers (Laborer, Crew Lead) see a simplified sidebar with:
- **My Work**: My Jobs, My Calendar, Messages, Crew Clock (filtered by capabilities)
- **Overview**: Projects (if viewProjects capability enabled, Crew Lead only)
- **Account**: Support

The `DesktopSidebar` and `MobileMenuContent` components query `/api/user/capabilities` and render `fieldWorkerNavigation` items when `isFieldWorkerRole(role)` is true.

## Frontend Pages — Field Workers

- `/my-jobs` — `MyJobs.tsx` — List of assigned jobs with address, schedule, stage, crew, directions
- `/my-jobs/:id` — Work order detail view with scope, line items, crew, photos, daily log, upload
- `/my-calendar` — `MyCalendar.tsx` — Month/week calendar view of scheduled assigned jobs
- `/crew-clock` — Existing crew clock page for time tracking

## Messages/Communications Access

The Messages page (`/messages`) is accessible at `minTier: "starter"` so all team members can see communications. When phone integration (Twilio/OpenPhone) is not configured, the page shows:
- Info banner explaining phone integration is needed
- Setup button linking to Settings > Integrations
- Empty state card indicating messages will appear once connected

## Future Phases

### Phase 3: Attributed Communication
- Track which team member sent each message/email
- Calls attributed to the user who made them
- Activity log per team member
- Customer sees company name, internal team sees individual attribution

### Phase 4: Per-User Billing
- Billing per seat/user added to the company
- Stripe subscription quantity updates when users added/removed
- Grace period for removed users
- Usage analytics per team member

## Key Files

- `shared/schema.ts` — companyUsers, companyInvitations tables + types; companySettings.roleCapabilityDefaults
- `server/storage.ts` — IStorage interface + DatabaseStorage implementation
- `server/routes.ts` — API endpoints for user management + role defaults + my-jobs/my-calendar + resolveUserCapabilities + requireCapability middleware
- `server/customAuth.ts` — Google OAuth and email/password auth with invite token support
- `client/src/pages/AcceptInvitePage.tsx` — Dedicated invite acceptance page at `/invite/:token`
- `client/src/pages/UserManagement.tsx` — Settings > Users page with tabs (Users, Role Settings)
- `client/src/pages/MyJobs.tsx` — My Jobs page + Work Order Detail view for field workers
- `client/src/pages/MyCalendar.tsx` — Calendar view for field workers
- `client/src/pages/AuthPage.tsx` — Main auth page; redirects `/auth?invite=TOKEN` to `/invite/TOKEN`
- `client/src/pages/Messages.tsx` — Communications page accessible without Twilio
- `client/src/components/layout/Sidebar.tsx` — Role-aware sidebar nav (field worker vs owner/manager)
- `client/src/App.tsx` — Route registration for all pages
