# Changelog

All notable changes to DCS Ops Center are documented here.

---

## [Phase 0] — 2026-04-23

### Removed
- Callouts Register (schema, router, routes, UI)
- Attendance Exceptions (schema, router, routes, UI)
- Compassionate leave type

### Fixed
- appraisalStatusEnum collapsed from 13 mixed-case to 7 canonical lowercase values
- staff_profiles.team_lead_id removed (superseded by reportsTo)
- departments.parent_id FK constraint added
- leave_policies table now exists in DB (was schema-only pre-Phase 0)
- e2e auth credentials corrected to match seed script
- CORS origin env var corrected for dev environment
- Appraisals page Button/Link nativeButton violation fixed

### Changed
- exam_dates replaced by exam_schedule (richer schema)
- operational_overlays renamed to routine_maintenance
- calendar_event_type enum extended from 3 to 12 values

### Technical notes
- For production DB: use DATABASE_URL=$PROD_DATABASE_URL bun run db:migrate
- Migrations 0008-0015 are in packages/db/src/migrations/

---

## [Unreleased]

### Security hardening + Phase 0 + Phase 1 start (2026-04-17)

**Reference:** `IMPLEMENTATION_PLAN.md` (root) and `/home/karetech/.claude/plans/paude-for-a-second-clever-salamander.md` (strategic plan, 7 phases).

#### Security / RBAC
- **Audit router** — `audit.list`, `audit.getByResource` gated to `requireRole("audit", "read")` (was `protectedProcedure` — any authenticated user could read the full audit trail).
- **Dashboard router** — `opsReadiness` gated to `requireRole("report", "read")`; `recentActivity` gated to `requireRole("audit", "read")`. `main` (aggregate counts) intentionally left open.
- **Analytics router** — `overview` gated to `requireRole("report", "read")`.
- **Procurement router** — `list`, `get`, `getPendingApprovals`, `stats` gated. Approve requires status `submitted|under_review`; reject requires `submitted|under_review|approved`; `markOrdered` requires `approved`; `markReceived` requires `ordered`.
- **Incidents router** — `list`, `get`, `getActive`, `stats` gated to `requireRole("work", "read")`. `update` enforces forward-only transitions through `detected → investigating → identified → mitigating → resolved → post_mortem → closed`. `createPIR` requires incident status in `resolved | post_mortem | closed` (was unconditional — a PIR could be written against an active incident).
- **Rota router** — `swap.request` verifies the requester's staff profile matches the assignment's `staffProfileId` (was missing — any user could request a swap on another user's assignment). `list`, `getEligibleStaff`, `getAssignmentCounts`, `history`, `listImportWarnings` gated.
- **Leave router** — `requests.list` scopes non-manager callers to their own profile via `staffProfiles.userId = session.user.id`. `balances.getByStaff` throws `FORBIDDEN` if a non-privileged caller requests another staff member's balances. `requests.create` enforces ownership (staff can only submit leave for themselves; manager/PA/admin can act on behalf of others). `getTeamCalendar` gated.
- **Appraisals router** — all 4 read endpoints (`list`, `get`, `getOverdue`, `getByStaff`) gated to `requireRole("appraisal", "read")`.
- **Contracts router** — `list`, `get`, `getExpiringSoon` gated.
- **Services router** — `list`, `get` gated.
- **Temp-changes router** — `list`, `get`, `getPublicIPs`, `getExpiringSoon`, `getHistory`, `stats`, `statsExtended`, `getOverdue` gated.
- **Access router** — 23 read endpoints across `accounts`, `externalContacts`, `groups`, `reviews`, `integrations`, `syncJobs`, `reconciliation`, `serviceOwners` gated to `requireRole("access", "read")`.
- **Staff router** — `list`, `get` gated; `getDepartments` intentionally left open (reference data).
- **Compliance router** — `training.list`, `ppe.list`, `policyAck.list`, `getExpiringItems` gated to `requireRole("compliance", "read")`.
- **Automation router** — `list`, `get`, `getLogs`, `stats` gated to `requireRole("settings", "read")`.
- **Escalation router** — `policies.list`, `policies.get` gated.

#### New functionality
- **Departments CRUD** (`packages/api/src/routers/departments.ts`) — full router with `list`, `get`, `create`, `update`, `deactivate`; every mutation audit-logged.
- **Departments admin UI** (`apps/web/src/routes/_authenticated/settings/departments.tsx`) — rewrote from read-only view to full CRUD with Add / Edit / Deactivate modals via `Dialog` component. Admin/hrAdminOps only.
- **Notification bell wired** (`apps/web/src/components/notification-bell.tsx`) — replaced hardcoded `unreadCount = 0` with live `useQuery(orpc.notifications.list.queryOptions({ input: { includeRead: false, limit: 1 } }))`.
- **Dashboard RBAC-aware** (`apps/web/src/routes/_authenticated/index.tsx`) — reads `authClient.useSession()` role and uses `enabled: canSeeOpsReadiness / canSeeAuditActivity` on privileged queries to prevent 403 toast noise for low-privilege users.

#### Phase 1 foundation (started)
- **Staff schema** (`packages/db/src/schema/staff.ts`) — added `teamLeadId` column (bare text, self-referential FK applied at DB level via `db:push` to work around Drizzle circular-ref limitation) + `staff_profiles_teamLeadId_idx` index + relations: `teamLead` (one) and `directReports` (many, both with `relationName: "teamLead"`).

#### Documentation
- **`IMPLEMENTATION_PLAN.md`** (new, project root) — actionable phase-by-phase tracker with session log, changelog, pending decisions, and conventions/gotchas. All future sessions and agents must append here.
- **`/home/karetech/.claude/plans/paude-for-a-second-clever-salamander.md`** (new, user-global) — strategic 7-phase plan covering NOC integration, appraisal workflow, PPE/attendance/callouts/timesheets, NOC shifts, leave policy engine, training + policy versioning + document vault + career ladders, scheduled jobs.

#### Outstanding (rolled into Phase 5)
- Wrap multi-step writes in `db.transaction(...)` (leave approve/cancel balance updates, rota publish, import per-row).
- Add missing FK constraints on `work_items.initiativeId`, `work_items.parentId`, temp-changes references.
- Playwright RBAC regression suite.

---

#### Access & Accounts v3 — Identity Governance + VPN (2026-04-12)
- **`external_contacts` table** — non-NDMA identities (contractors, consultants, vendors, external agencies) that hold platform accounts; optional FK to a staff profile for dual affiliation
- **`platform_accounts.staffProfileId` made nullable** — accounts can now belong to an `external_contact` OR a staff profile (exclusive FK pattern); unique constraint changed to `(platform, accountIdentifier)`
- **VPN fields on `platform_accounts`** — `vpnEnabled`, `vpnGroup`, `vpnProfile` columns; new `access.accounts.getVpnEnabled` API and VPN tab on the access page
- **`access_groups` table** — AD groups, VPN groups, platform roles, RADIUS groups; `access_group_type` enum (ad_group/vpn_group/platform_role/local_group/radius_group)
- **`account_group_memberships` table** — soft-delete via `removedAt`; tracks which platform accounts belong to which groups, with audit trail
- **`access_reviews` table** — periodic certification workflow; `access_review_status` enum (pending/approved/revoked/escalated); completing a review with `revoked` automatically disables the account
- **`user_affiliation` enum** — classifies identities as ndma_internal/external_agency/contractor/consultant/vendor/shared_service; stored on both `platform_accounts` and `external_contacts`
- **Extended `platform_integrations`** — `ownerStaffId`, `supportTeam`, `authModelsSupported` (jsonb), `runbookUrl`, `documentationUrl` columns; runbook link rendered in integrations tab
- **Extended reconciliation issue types** — `disabled_staff_active_account`, `expired_contractor`, `missing_internally`, `missing_externally`
- **New API procedures** — `access.externalContacts.{list,get,create,update}`, `access.groups.{list,get,create,update,delete,listMembers,addMember,removeMember}`, `access.reviews.{list,getPending,getOverdue,create,complete}`, `access.accounts.{get,disable,getStale,getVpnEnabled}`
- **Expanded Access frontend** — 7-tab UI: Accounts · VPN Access · Groups · External Contacts · Access Reviews · Integrations · Reconciliation; alert banners for expiring accounts + pending reviews + open issues
- **Account detail page** (`/access/$accountId`) — overview, group memberships, review history tabs; disable button; VPN card if VPN-enabled
- **Docker deployment** — multi-stage `Dockerfile` (oven/bun:1.3-slim, non-root user, health check); `docker-compose.prod.yml` with postgres + app containers and no exposed DB ports

#### Phase D — On-Call Expansion + Phase J — Dashboard (2026-04-12)
- **Escalation router** (`packages/api/src/routers/escalation.ts`) — full CRUD for escalation policies, timed steps, and on-call overrides; all mutations audit-logged
- **`rota.getEffectiveOnCall`** — resolves active overrides on top of base schedule assignments for a given date
- **Rota planner page** (`/rota/planner`) — create draft schedules, assign staff per role via eligible-staff dropdowns, publish when complete
- **Rota swaps page** (`/rota/swaps`) — pending and all swaps list with Approve/Reject buttons
- **Rota history page** (`/rota/history`) — full assignment history log with action badges
- **Sidebar updated** — On-Call Rota expanded to collapsible with 4 sub-links (Current, Planner, Swap Requests, History)
- **Escalation settings page** (`/settings/escalation`) — live CRUD replacing the placeholder; create policies, add/delete steps inline, delete policies
- **Dashboard wired** (`/`) — 8 KPI cards now pull live data from `orpc.dashboard.main`; ops readiness traffic-light indicator; recent activity audit feed (last 10 entries)
- **AGENTS.md** — AI agent context file for OpenAI Codex, GitHub Copilot Workspace, and other non-Claude agents
- **GEMINI.md** — Gemini CLI equivalent of AGENTS.md

#### Phase H — Access & Accounts v2 (2026-04-12)
- **Multi-source authentication tracking** — accounts now carry an `authSource` field distinguishing Local, AD/LDAP, RADIUS, SAML, OAuth/OIDC, Service Account, and API-only origins
- **Sync mode support** — accounts are classified as `manual`, `synced`, or `hybrid` so synced records can receive local annotations without being overwritten on the next sync
- **Platform integrations table** — connector metadata with `hasApi`, `syncEnabled`, `syncDirection`, `syncFrequencyMinutes`, `authoritativeSource`, `manualFallbackAllowed`, `apiBaseUrl`, `config` (JSONB), and live status
- **Sync jobs table** — per-run audit trail: records processed/created/updated/skipped, JSONB error log, timestamps
- **Reconciliation issues table** — orphaned accounts, unmatched externals, and policy violations flagged during sync with resolution workflow
- **New `ipam` and `radius` platform types** added to `platform_type` enum
- **Expanded `platform_accounts`** — added `displayName`, `authSource`, `privilegeLevel`, `syncMode`, `externalAccountId`, `syncSourceSystem`, `lastSyncedAt`, `lastVerifiedAt`, `createdByUserId`
- **`access.integrations.*` API** — list/get/create/update/triggerSync
- **`access.syncJobs.list` API** — paginated sync job history
- **`access.reconciliation.*` API** — list open issues + resolve
- **`access.accounts.getOrphaned` API** — accounts with no matching active staff profile
- **Access frontend v2** — 3-tab UI (Accounts · Integrations · Reconciliation) with auth-source color badges, sync-mode badges, "Sync now" button, issue resolver

#### All Module Pages — Complete (2026-04-12)
30+ route files implemented — every stub replaced with real UI:
- Work Register + new item form + detail page
- Incidents + new incident form + detail page with timeline
- Staff Directory + staff profile page (tabs)
- Leave Management (All/Pending) + new leave request form
- Procurement pipeline + new PR form with line items
- On-Call Rota (current week + upcoming + pending swaps)
- Temporary Changes + new change form
- Platform Accounts (3-tab: accounts/integrations/reconciliation)
- Contracts, Appraisals, Compliance Training/PPE/Items
- Ops Readiness traffic-light dashboard
- Reports and Import placeholders
- Settings: General, Departments, Leave Types, Escalation, Roles
- Audit Log with expandable JSON diff rows
- Notifications with mark-read / dismiss

#### Phases A–C Infrastructure (prior session)
- **Phase A:** `audit_logs` + `notifications` tables, `logAudit()` / `createNotification()` helpers, audit + notifications routers, rota mutations retrofitted with audit calls
- **Phase B:** `work_items`, `work_item_comments`, `work_item_weekly_updates`; full work router (list/get/create/update/assign/addComment/addWeeklyUpdate/getOverdue/stats)
- **Phase C:** `services`, `incidents`, responders, timeline, PIR; incidents + services routers

### Fixed
- **oRPC `queryOptions` flat-args bug** — all 21+ frontend files corrected to use `{ input: { ... } }` wrapper; flat args were a silent runtime bug where input was never sent to server
- **`work.get.key()` wrapper** — `orpc.work.get.key({ id })` corrected to `orpc.work.get.key({ input: { id } })`
- **`z.coerce.number()` zod v4** — replaced with `z.number()` + `{ valueAsNumber: true }` in RHF register calls; `coerce` option returns `unknown` in zod v4
- **`z.enum().default()` + zodResolver** — removed `.default()` from all form schemas; moved defaults to `useForm({ defaultValues })`; `.default()` makes the zod input type optional (`T | undefined`) causing type mismatch with API mutations
- **`DiffViewer` unknown type** — `before`/`after` fields made optional; `!= null` checks replace truthiness checks
- **`profile.user.role` TypeScript error** — Better Auth Admin plugin adds `role` to DB but not TS types; cast via `(user as Record<string, unknown>)?.role as string`
- **`leave.requests.getMyRequests`** — procedure did not exist; removed call, simplified "mine" tab to use `list` with status filter
- **PostgreSQL scram-sha-256 from host** — Docker container requires `ALTER USER postgres WITH PASSWORD 'password'` after init for non-localhost connections

### Changed
- **Access & Accounts schema** — expanded from basic account tracking to full hybrid sync architecture (non-breaking; new columns are nullable)
- **Sidebar navigation** — updated to include all new routes across Operations, People, Services, Compliance, and System groups

---

## [0.1.0] — 2026-04-10 (initial commits)

### Added
- Turborepo monorepo scaffold (Bun, React 19, Hono, Drizzle, oRPC, Better Auth)
- 34 shadcn/ui components in `packages/ui` (Base UI `render` prop pattern)
- shadcn-admin layout: sidebar, nav, command palette, theme switch
- Better Auth with 5-role RBAC (readOnly, staff, manager, hrAdminOps, admin) + 13 resources
- DB: `departments`, `staff_profiles`, `rota` (4 tables), auth tables
- Full rota oRPC router (14 endpoints)
- Seed: 11 real DCS staff, 4 departments, demo on-call schedule
