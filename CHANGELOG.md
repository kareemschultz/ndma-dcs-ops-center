# Changelog

All notable changes to DCS Ops Center are documented here.

---

## [Phase 1 — Schema + API] — shipped 2026-04-25 via #18 squash `c8fdd3e`

> Phase 1 split: schema/migrations/routers landed in this commit. UI (`/access/platforms`, `/access/registry`, staff profile access tab, directory phone-number column) deferred to a follow-up PR. RBAC matrix tests for new procedures also deferred.

### Added
- **3-layer hybrid access registry** (master plan §5.2):
  - `platforms` reference table (Layer 1) — categorises platforms by type/auth/sync_mode
  - `sync_adapters` table (Layer 2, empty in Phase 1) — schema-only; populated in Phase 15 stretch
  - `service_access_registry` (Layer 3) — per (staff, platform) row with per-field `_source` provenance + manual override tracking
  - `sync_adapter_runs` ledger (Layer 2b, empty) — every sync execution audit trail
- **Staff profile extended fields** (master plan §5.1, migration 0016): `cug_phone_number`, `cug_sim_number`, `mifi_asset_tag`, `birthday`, `employment_status` (default 'Active' with check constraint), `hire_date`, `contract_end_date`, `current_appointment`
- **oRPC routers** — `platforms.*` (list/create/update/disable) + `accessRegistry.*` (listByStaff/listByPlatform/create/update/bulkImport)

### Fixed
- **Sidebar** — removed duplicate `PPE & Tools` entry at `/hr/ppe`; kept `PPE Compliance` at `/compliance/ppe` per Ataybia sticky-note feedback

### Migrations applied
- `0016_extend_staff_profiles.sql`
- `0017_platforms_reference_table.sql`
- `0018_sync_adapters_table.sql`
- `0019_sync_adapter_runs_table.sql`
- `0020_service_access_registry_table.sql`

### Deferred to Phase 1 UI follow-up
- `/access/platforms` admin UI
- `/access/registry` matrix UI (staff × platform)
- `/access/registry/$staffId` per-staff detail
- Staff profile Access tab integration
- Staff directory phone-number column display
- RBAC matrix test rows for `platforms.*` + `accessRegistry.*`
- e2e smoke tests for the new pages

### Deferred to Phase 15 stretch (master plan §13.1)
- All sync adapter implementations (LDAP pilot + Fortigate/Zabbix/Grafana priority order)
- Conflict detection logic
- `/access/sync-conflicts` review UI
- Sync scheduling/cron

---

## [Phase 0] — 2026-04-23 (shipped 2026-04-25 via #16 squash `3916721`)

> **Note (course correction 2026-04-25):** This entry was written aspirationally when PR #14 merged (planning docs only). The actual migration SQL was committed to the branch afterward but never made it onto main until PR #16 merged on 2026-04-25 with the cherry-picked migrations rebased onto current main. See AGENT_LOG.md for the full course-correction details.

### Removed (via migration 0009)
- Callouts Register (schema, router, routes, UI) — incident-response feature, distinct from XLSX 2023-Callout sheet (Phase 14 seeds those into `tosd_records.type='callout_legacy'`)
- Attendance Exceptions (schema, router, routes, UI)

### Fixed (via migrations 0008/0010/0011)
- `appraisalStatusEnum` collapsed from 13 mixed-case to 7 canonical lowercase values (CASE WHEN mapping; Pending_Approval / scheduled → draft, Approved_By_Manager / Processed_By_PA → approved)
- `staff_profiles.team_lead_id` removed (superseded by `reportsTo` set up in migration 0005)
- `departments.parent_id` FK constraint added (raw SQL — Drizzle circular FK limitation)
- e2e auth credentials corrected to match seed script (`.env.example` added)

### Changed (via migrations 0012/0013/0014/0015)
- `exam_dates` replaced by `exam_schedule` (richer schema — adds vendor, certification_id, voucher_id, score, passing_score, expanded status enum)
- `operational_overlays_*` tables renamed to `routine_maintenance_*` (master plan §5.7 naming)
- `leave_policies` table extended with `blocked_months text[]` + `allow_rollover bool` columns (master plan §5.6 NOC rules support)
- `calendar_event_type` enum extended from 3 to 12 values (added `public_holiday`, `exam`, `contract_renewal`, `appraisal_due`, `appraisal_followup`, `ppe_review`, `routine_maintenance`, `server_room_cleaning`, `custom`)

### Deferred to later phases
- **Compassionate leave_type row** — migration 0010 was no-op since prod had 0 referencing `leave_requests`. The `leave_types` row itself was NOT deleted from DB (still exists, harmless). Will be cleaned up in Phase 2 (Leave refactor) alongside the broader leave-types reseeding.
- exam_schedule FK constraints (certification_id, voucher_id) → Phase 7 (target tables don't exist yet)
- onboarding-tasks.template_id FK → Phase 7
- certification-budgets integration → Phase 7

### Technical notes
- Migration files: `packages/db/src/migrations/0008_enum_fix.sql` through `0015_calendar_event_type_widen.sql`
- Each has a corresponding `.down.sql` file (manual rollback — drizzle-kit doesn't auto-apply DOWN)
- For production DB apply: `DATABASE_URL=$PROD_DATABASE_URL bun run db:migrate`
- Pre-checks before prod apply (per `docs/superpowers/plans/phase-0-stabilise.md` §8):
  - `SELECT status, COUNT(*) FROM appraisals GROUP BY status` — ensure all values are within the 13-known set
  - `SELECT COUNT(*) FROM leave_requests lr JOIN leave_types lt ON lr.leave_type_id = lt.id WHERE lt.name ILIKE '%compassionate%'` — if > 0, manual remap to `special_leave` required (migration 0010 will need updating)
  - `SELECT id, name, parent_id FROM departments WHERE parent_id IS NOT NULL AND parent_id NOT IN (SELECT id FROM departments)` — if > 0, NULL out orphans before applying 0011
  - `SELECT COUNT(*) FROM callouts` — if > 0, export to JSONL backup before applying 0009 (data loss otherwise)

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
