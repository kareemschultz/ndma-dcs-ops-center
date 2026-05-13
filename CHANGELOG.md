# Changelog

All notable changes to DCS Ops Center are documented here.

---

## [Phase 16 — IA revamp + Phase 14+15 closeout] — 2026-05-13

### Added
- **Design-handoff completion audit** (`docs/audit/HANDOFF-COMPLETION-AUDIT-2026-05-12.md`): cross-checks every master-plan §8 acceptance criterion against shipped code with file:line evidence. Identifies 9 carry-forward items + 5 open decision questions.
- **Canonical source-of-truth extraction** (`scripts/extract-source-of-truth.ts` + `docs/source-of-truth/canonical-data.{md,json}`): one-time deterministic snapshot of all 246 source files (200 XLSX + 29 DOCX + 17 TXT). 10.46 MB JSON preserves hidden rows, formula+cached values, merged cells. 35-step seed_mapping committed. Run: `bun run sot:extract`.
- **Contract reminder ladder** (`packages/api/src/lib/contract-reminders.ts`): 6-tier 90/60/30/14/7/1-day reminders for contract expiry. Idempotent. Exposed as `contracts.fireReminderLadder` for daily cron at 09:00 GYT. (Closes Phase 6 AC.)
- **NOC shift enum extension** (migration 0032): adds `Split Shift` + `Maternity Leave` to `noc_shift_type` enum (Phase 3 spec alignment).
- **30 new import templates** (`apps/web/public/import-templates/`): 18 `.example.csv` variants for existing templates + 12 additional templates (`access_services`, `lateness`, `tosd`, `commendations`, `noc_performance`, `noc_performance_journal`, `service_access_registry`, `external_contacts`, `access_groups`, `temporary_changes`, `procurement`, `incidents`) with matching `.example.csv` companions. (Closes Phase 12 30+ commitment.) Regenerator: `scripts/generate-import-templates.ts`.
- **IA revamp** (Phase 16): replaced `sidebar-data.ts` with 12 flat nav groups (Claude Design handoff), deduplicated icons, surfaced orphaned `/analytics`, `/audit`, `/cycles` routes.
- **4 new tab-hub pages**: `/scheduling/maintenance`, `/compliance` (index), `/settings` (index), `/forms` (→ /policy redirect).

### Fixed
- **Hard Invariant #4 violation** (`packages/api/src/routers/policy.ts`): replaced `protectedProcedure` on `policies.create`, `forms.upload`, `forms.delete` with `requireRole("settings", "create"/"delete")`. Removed obsolete `assertDocumentAdmin` helper.

### Changed
- **13 legacy `/rota/*` + `/roster/*` routes** converted to `<Navigate replace>` redirects pointing at `/scheduling/dcs-oncall` / `/scheduling/noc-shifts`. Legacy routers still mounted pending Phase 3 cutover gate.
- **Smoke tests** (`apps/web/tests/e2e/smoke.spec.ts`): rewrite with PAGES array — 55 authenticated routes + 3 auth-flow tests = 58 total (was 25). All Phase 0-16 routes covered.
- **`PRODUCTION_READINESS_CHECKLIST.md`**: added top-level Quick Checklist section with standard markdown `[ ] / [x]` checkboxes (tool-parseable). All code-side Part A-D items marked complete; PROD-side items remain pending.

### Deferred (with @kareem decision recorded in `docs/plan-questions.md`)
- **iCal export** for `/scheduling/*` (Phase 3 AC) → defer to v1.1 (Option B)
- **eom-calculator.ts** file extraction → CLAUDE.md prose update only (inline implementation is fine)

---

## [Phase 15 — Hardening + Phase 14 Seed Script] — 2026-05-08

### Added
- `packages/db/src/seed-historical.ts` — Phase 14 historical seed script; 13 of 35 steps implemented; ingests NDMA source-of-truth XLSX files via ExcelJS; supports `--dry-run`, `--steps`, `--from` flags; outputs `docs/seed-report.md`.
- `PRODUCTION_READINESS_CHECKLIST.md` — 10-section deployment readiness tracker covering migrations, env vars, build, RBAC, e2e, performance, accessibility, seed, deployment, Phase 3 cutover.
- `"db:seed:historical"` npm script in root `package.json`.

### Fixed
- **Import router** (`packages/api/src/routers/import.ts`): Added 3 missing execute handlers for `platform_accounts`, `attendance`, `callouts` import types. Column mapping: attendance uses `staffEmail,date,type,hours,notes`; callouts uses `staffEmail,date,incidentTitle,hoursWorked,notes`; platform_accounts uses `staffEmail,platformName,accountUsername,accountType,accountActive,privilegeLevel,notes`.
- **Bundle splitting** (`apps/web/vite.config.ts`): Function-form `manualChunks` splits recharts (379 kB), forms (264 kB), tanstack-query (41 kB), tanstack-router (93 kB), react (499 kB), lucide, date-fns into separate chunks. Avoids browser loading the full 2+ MB monolithic bundle.

### Changed
- **RBAC matrix** (`packages/api/tests/rbac-matrix.test.ts`): Added Phase 15 test block — 6 new tests covering `platform_accounts`, `attendance`, `callouts` import RBAC (staff/teamLead/manager → FORBIDDEN; admin → allowed).
- **Smoke tests** (`e2e/smoke.spec.ts`): Expanded from 24 to 40+ routes; all Phase 3-13 pages now covered (scheduling, TOSD, NOC performance, training, PPE, lateness, timesheets, import, policy, etc.).

---

## [Phase 13 — Obsolete docs cleanup] — 2026-05-06

### Removed
- `AUDIT_REPORT.md`, `REMEDIATION_BACKLOG.md`, `CLAUDE_FIX_TASKS.md`, `PRODUCTION_READINESS_CHECKLIST.md` — all pre-master-plan audit artifacts superseded by `IMPLEMENTATION_PLAN.md` + phase plan docs.

### Changed
- `apps/docs/content/docs/appraisals.mdx` — corrected status enum from 4 stale values to 7-value post-Phase-0-collapse set.
- `apps/docs/content/docs/compliance.mdx` — added pointer to dedicated PPE + Training modules.
- `apps/docs/content/docs/import.mdx` — expanded import types table from 2 to all 18 registered types.

### Added
- `docs/cleanup-log.md` — append-only Phase 13 audit trail.
- `docs/superpowers/plans/phase-13-cleanup.md` — phase plan doc.

---

## [Phase 12 — Import module] — 2026-05-06

### Added
- 18 downloadable CSV templates at `apps/web/public/import-templates/{type}.csv` for all supported import types with exact server-side column names and NDMA DCS sample rows.
- `.gitignore` exception to preserve public static CSV assets (global `*.csv` ignore carve-out).
- `docs/superpowers/plans/phase-12-import.md` with gap analysis (3 import types lack execute handlers: `platform_accounts`, `attendance`, `callouts`).

---

## [Phase 11 — Work register refactor] — 2026-05-06

### Added
- `year` (integer), `period` (text), `weekStartDate` (text) columns on `work_items` table.
- Migration `0031_work_year_period.sql` (hand-authored — `drizzle-kit generate` blocked by `appraisal_tracker_view` duplicate-name warning).
- `work.list` accepts `year`, `period`, `weekStartDate` as optional filters.
- Year + quarterly period filter pills in the work register UI (`/work`).
- `docs/superpowers/plans/phase-11-work-refactor.md`.

---

## [Phase 10 — Notifications & calendar] — 2026-05-06

### Verified (no code changes needed)
- `leave.requests.approve/reject` → `createNotification` to requester: already wired.
- `work.create/assign/assignees.add` → `createNotification` to assignee: already wired.
- `appraisals.submit/approve/reject` → `notifyRelatedPeople()` helper: already wired.

### Added
- `docs/superpowers/plans/phase-10-notifications.md` — catalogs all wired triggers; lists remaining work (cron reminders, calendar events, push notifications).

---

## [Phase 9 — Self-service + policies + forms] — 2026-05-04 → 2026-05-06

### Added (complete — 2026-05-06)
- **11 new self-service sections** in `/profile`: leave balances, TOSD records, lateness history, appraisals, commendations, NOC performance journal, training (in-house log + exam vouchers), PPE, system access registry, onboarding progress, career progression, NOC shifts.
- `onboarding.tasksList` procedure — per-staff onboarding task list with self-view RBAC enforcement.
- RBAC fix: `performance_journal: ["read"]` added to `staffRole` and `teamLeadRole`.
- `/profile` is now the full "My Everything" page per master plan §6.5 handoff §11.

### Added (WIP — 2026-05-04)
- Profile self-service editor (`/profile`) exposes 3 additional editable fields per master plan §6.5: **CUG phone number**, **CUG SIM number**, **MiFi asset tag**.
- `staff.updateSelf` accepts all 5 self-editable fields with audit log.
- `docs/superpowers/plans/phase-9-self-service.md` — phase checklist.

---

## [Phase 5 follow-up — `noc_performance_journal`] — 2026-05-04

### Added
- **Migration 0030** (`0030_noc_performance_journal.sql`) — adds `noc_performance_journal` table + `noc_perf_journal_category` enum (`tickets_itop` / `alarms` / `slack_whatsapp` / `task_incomplete`). Per-(staff, year, month, category) count + narrative; unique constraint on the 4-tuple; month CHECK 1-12.
- **Schema** — `packages/db/src/schema/noc-performance-journal.ts` (table + enum + relations).
- **Router** — `packages/api/src/routers/noc-performance-journal.ts` (`list` / `upsert` / `delete`; RBAC `performance_journal` resource; mutations audit-logged).
- **RBAC matrix tests** — appended to `packages/api/tests/rbac-matrix.test.ts`.

### Decision context
Resolves the naming-alignment question opened earlier today in `docs/plan-questions.md`. Master plan §5.3 originally specified `performance_journal_entries` for this NOC mistake-matrix tracker, but that name was already taken by an unrelated entity in `hr-docs.ts` (appraisal-period feedback log). Selected **Option B** — distinct name `noc_performance_journal`; existing `performance_journal_entries` untouched. Phase 14 seed step 10 (~2,304 rows from `StaffPerformanceJournal_20230731_v01.xlsx`) now has a target table.

---

## [Phase 4-5 spec follow-up — `commendations` + `appraisal_tracker_view`] — 2026-05-04

### Added
- **Migration 0029** (`0029_appraisal_view_commendations.sql`):
  - `commendations` table — positive recognition narratives per (staff, year, month) with unique constraint on (staff_profile_id, year, month) and a CHECK on month range. Master plan §5.3. Sourced from `NOC/appraisals/StaffCommendationJournal_20231216_v01.xlsx` (~250 historical entries to be loaded via Phase 14 seed step 11).
  - `appraisal_tracker_view` — read-only DB VIEW joining `appraisals` + `staff_profiles` + `user`, filtered to status='completed'. Mirrors the `APPRAISAL TRACKER DCS.xlsx` (63 rows) + `AppraisalTracker_20241210_v01.xlsx` (NOC, 80 rows) shape (Name | Percentage | Period). Required by Phase 14 acceptance gate `gateAssertions["appraisalTrackerView.rowCount"] >= 130`.
- **Schema files** — `packages/db/src/schema/commendations.ts`, `packages/db/src/schema/appraisal-tracker-view.ts` (Drizzle `pgView().existing()` declaration over the VIEW).
- **`commendations` router** — `list / get / create / update / delete` (RBAC: `performance_journal` resource, full CRUD action set; mutations audit-logged with `action='commendation.{verb}'`).
- **`appraisalTracker` router** — `list` (protectedProcedure; reads from VIEW; filters by year and staffProfileId).
- **RBAC matrix tests** — appended Phase 4-5 follow-up describe block to `packages/api/tests/rbac-matrix.test.ts` covering commendations CRUD denial-for-staff + appraisalTracker.list.

### Decision context
DCS and NOC use the IDENTICAL appraisal template (`Appraisal Template 2025.xlsx` ≡ `AppraisalTemplate_20250513_v01.xlsx` — same 187-row form, same 16 formulas, same merged cell layout). Their tracker XLSX files also share the same 3-column shape. A single VIEW therefore serves both DCS + NOC trackers without splitting.

### Known gap surfaced (Phase 5 follow-up — see `docs/plan-questions.md`)
Master plan §5.3 specifies a `performance_journal_entries` table for the NOC mistake-matrix tracker (`StaffPerformanceJournal_20230731_v01.xlsx`) with shape `(staff_id, year, month, category enum['tickets_itop','alarms','slack_whatsapp','task_incomplete'], count, narrative)`. The existing `performance_journal_entries` table in `hr-docs.ts` is a DIFFERENT entity (appraisal-period feedback log keyed by `entryDate` + `entryType` + `body`). Naming alignment requires a separate Phase 5 follow-up decision (rename existing? add new under a different name? reshape existing?). This PR does not touch the existing table.

---

## [Maintenance — Documentation hygiene] — 2026-05-04

### Added
- **`docs/audit/STATE-AUDIT-2026-05-04.md`** — pre-Phase-9 state-of-project audit covering doc drift, source-of-truth coverage status, and outstanding cleanup items
- **`docs/superpowers/plans/phase-{1..6}-{slug}.md`** — retroactive backfill of phase checklist files (master plan §11.1 requires one per phase; only phase-0/7/8 existed prior). Each flags deferred items + open spec gaps:
  - phase-3: cutover gate "NOT YET MET" for legacy `rota.ts` / `roster.ts` / standalone `noc-shifts.ts` schemas
  - phase-4: `appraisal_tracker_view` (DB VIEW per master plan §5.3) confirmed absent — decision needed
  - phase-5: `commendations` table (master plan §5.3) confirmed absent — verification + decision needed

### Changed
- **`CLAUDE.md`** schema table refreshed to 49 files (was 22 listed; many missing or stale post-Phase 1-8). Router table refreshed to 41 routers (was 18 listed). `import_type` enum gotcha updated 9 → 18 values. "NOC vs DCS scheduling" gotcha rewritten to reflect Phase 3 unification + pending cutover gate. ⚠️ markers added to legacy schemas / routers (`rota.ts`, `roster.ts`, `operational-overlays.ts`, etc.). ⛔ markers added for Phase 0-deleted files (do not recreate).
- **`AGENTS.md`** slimmed from 314 → ~95 lines as a pointer file. CLAUDE.md is canonical for non-Claude agents (Codex / Copilot). 2026-04-25 course-correction rules + reading order preserved.
- **`README.md`** RBAC role count 5 → 7, resource count 13 → 22+, schema count 21 → 49, router count 18 → 41. Database schema overview table refreshed to reflect Phase 1-8 reality (3-layer access registry, scheduling unification, appraisal sub-tables, NOC performance, contracts lifecycle, PPE/lateness/timesheets/TOSD).
- **`CHANGELOG.md`** stale `[Unreleased]` heading promoted to `[Pre-master-plan history] — 2026-04-12 to 2026-04-17` with context note explaining the 2026-04-25 anti-pattern callout.
- **`.gitignore`** added `e2e-report/` (consistent with `playwright-report/` already present)

### Removed
- **`GEMINI.md`** deleted (master plan §4.1 cleanup disposition; AGENTS.md is the pointer for non-Claude agents). Eliminates stale-doc duplication risk.
- **`e2e-report/index.html`** untracked from git index (generated Playwright report; now gitignored).

### Notes
- Production migration backlog (0008-0028, 21 migrations) remains open per `docs/plan-questions.md` `[KNOWN DEFECT]` since 2026-04-23. Requires Kareem to apply manually with PROD `DATABASE_URL`.
- This is a documentation-only maintenance pass. No schema, router, or UI changes.

---

## [Phase 8 — PPE, Lateness, Timesheets, TOSD] — shipped 2026-04-27 (currently on main as `fb46d00` after 2026-05-04 PR #29 rebase; pre-rebase squash `2b4fbc6`)

### Added
- **Migration 0028** — extends `ppe_items` (add `has_size` bool, `has_asset_tag` bool), updates `ppe_issuances` status enum (adds `not_issued`, `n_a`, `stolen`; adds `asset_tag` column; replaces old unique(staff,item) with unique(staff,item,issued_date)), extends `lateness_records` (adds `quarter`, `notes`, `days_missing_from_attendance`, `days_on_schedule`; adds unique constraint), creates `timesheet_documents` (year/month/office index table with castellani/liliendaal enum)
- **17 canonical PPE items seeded**: Long Boots, Overalls, Mousepad, Safety Boots, Bag, Screwdriver, DB9-RJ45, DB9-USB, Monitor, HDMI to Monitor, Laptop, MiFi, CUG Phone, CUG Sim, NDMA Shirts, USB To Ethernet, Umbrella
- **`lateness` router** — `list`, `quarterlyGrid`, `upsert`, `delete`, `stats` — per-staff monthly records grouped by quarter
- **`timesheetDocuments` router** — `list`, `create`, `update`, `delete` — PDF timesheet index (metadata only, no parsing)
- **Extended PPE router** — `issuances.upsert` (upsert by staff+item+date), `issuances.matrix` (full staff × item grid with status/size/assetTag)
- **`/compliance/ppe`** rewritten as interactive PPE matrix — 17-column grid, click any cell to set status + size + asset tag
- **`/lateness`** — quarterly lateness grid (Q1-Q4 tabs, per-staff × per-month: time late, days late, days missing, days on schedule)
- **`/timesheets/documents`** — timesheet document index (year/month/office filters, register metadata dialog, delete)
- **TOSD verified** — all 7 types confirmed present (`reported_sick`, `medical`, `absent`, `time_off`, `work_from_home`, `lateness`, `callout_legacy`); no schema changes needed
- **Sidebar** — Attendance & Time section updated: "Lateness Report" → `/lateness`; "Timesheet Documents" → `/timesheets/documents`
- **Phase 8 RBAC tests** — coverage for `lateness.list/upsert/quarterlyGrid`, `timesheetDocuments.list/create`, `ppe.issuances.matrix/upsert`

---

## [Phase 7 — Training] — shipped 2026-04-27 via PR #29 (currently on main as `2ced91b` after 2026-05-04 rebase; pre-rebase squash `a4c1a53`)

### Added
- **Migrations 0026-0027** — 9 new tables: `training_plans`, `certification_catalog`, `exam_vouchers`, `training_events`, `training_event_participants`, `in_house_training_log`, `training_syllabi`, `assessment_questions`, `onboarding_task_templates`; extends `exam_schedule` with window columns; extends `onboarding_tasks` with `template_id`
- **`trainingPlans` router** — `list`, `upsert` (per-staff per-year jsonb plan)
- **`certCatalog` router** — `list`, `create`, `update` (visible to all staff)
- **`examVouchers` router** — `list`, `create`, `assign`, `updateStatus`, `sendExpiryReminders` (fires in-app notifications at 30/14/7-day thresholds)
- **`trainingEvents` router** — `list`, `get`, `create`, `update` with auto-sum total cost; `addParticipant`, `removeParticipant`
- **`inHouseLog` router** — full CRUD (`list`, `create`, `update`, `delete`)
- **`syllabi` + `assessmentQuestions` routers** — read-only list (data model ready for historical seed)
- **`onboarding.createFromTemplates`** — auto-creates 8 standard onboarding tasks for new hires from seeded templates
- **`/training/`** — overview dashboard (expiring vouchers, recent events, in-house sessions, cert catalog preview)
- **`/training/plan`** — staff × training areas matrix (year filter, per-staff edit dialog)
- **`/training/exams`** — exam schedule view (training records + assigned vouchers)
- **`/training/vouchers`** — voucher registry with create/assign dialogs and expiry reminder button
- **`/training/events`** — training events with cost-breakdown form (total auto-sums)
- **`/training/in-house`** — in-house log CRUD (year + staff filter, assessment completed toggle)
- **`/training/catalog`** — certification catalog grouped by training area
- **Sidebar** — replaced 3 stub "Training" items with 7 real routes

---

## [Phase 6 — Contracts Lifecycle] — shipped 2026-04-27 via #27 squash `66fa5c9`

### Added
- **Migration 0025** — extends `contracts` with `renewal_letter_due_date`, `appraisal_1_due_date`, `appraisal_2_due_date`, `submitted_to_hr_at`, `renewal_outcome`; adds `career_progression_plans` table
- **Career progression plans** — per-staff multi-year progression plan (2026-2035 range); upsert by (staff, year); status: pending/achieved/missed
- **Contracts router** — new procedures: `setLifecycleDates` (auto-computes from endDate), `submitToHR`, `setOutcome` (records final outcome + updates status), `getTimeline`; new `careerProgression` router (list/upsert/delete)
- **`/contracts/$contractId` detail page** — lifecycle timeline (Appraisal 1/2 Due, Renewal Letter Due, Submitted to HR), inline Submit to HR + Record Outcome actions, career progression plan editor

---

## [Phase 5 — NOC Performance] — shipped 2026-04-27 via #26 squash `7916454`

### Added
- **Migration 0024** — `noc_ticket_activity`, `noc_monthly_metrics`, `employee_of_the_month` tables
- **`nocPerformance` router** — `metrics.list/upsert`, `tickets.list/create`, `eom.get/compute`; `computeEOM` calculates 7 recognition categories from monthly metrics
- **`/noc-performance`** — tabbed page: Monthly Metrics (staff × metrics grid + upsert dialog), EOM Awards (monthly winner cards + Compute Now), Ticket Activity (read-only table)

---

## [Phase 4 — Appraisal System] — shipped 2026-04-27 via #25 squash `82c109b`

### Added
- **Migration 0023** — `appraisal_ratings`, `appraisal_responsibilities`, `appraisal_achievements`, `appraisal_goals`, `appraisal_signatures` tables; extends `appraisals` with `total_score`, `max_score`, `percentage`, `increment_pct`, `submitted_at`
- **Appraisal router** — `setRatings` (upserts ratings + auto-computes score/percentage/increment), `setResponsibilities`, `setAchievements` (min 3 enforced), `setGoals` (min 3 enforced), `sign`, `getDetail`
- **Score tiers** — ≤60%→1%, 61-70%→2%, 71-80%→3%, 81-90%→4%, 91-100%→5% increment

---

## [Phase 3 — Scheduling Unification] — shipped 2026-04-27 via #24 squash `b3cad77`

### Added
- **Migration 0022** — `noc_shifts` (staff × date, shift_type D/S/N/sick/off/al/ml), `dcs_on_call_weeks` (4-role weekly), `routine_maintenance` (quarterly tasks), `shift_swaps` + `on_call_swaps`
- **`scheduling` router** — `nocShifts.list/bulkSet/update`, `dcsOnCall.list/get/upsertWeek`, `maintenance.list/upsert`, `swaps.noc.request/review`, `swaps.dcs.request/review`
- **`/scheduling/noc-shifts`** — monthly grid UI (staff × day 31 columns, color-coded shift badges, click-to-edit)
- **`/scheduling/dcs-oncall`** — weekly grid (4-role columns, edit-row dialog)

---

## [Phase 2 — Leave Refactor] — shipped 2026-04-27 via #23 squash `a88f36b`

### Added
- **Migration 0021** — extends `leave_requests` with `override_reason`, `overridden_by`, `violations`; adds `tosd_records` table (Time Off / Sick Days register, 7 types including `callout_legacy`)
- **Leave router** — `tosd.list/create/update/delete`, `validateRequest` (returns `{status, violations}` — warns on blocked months/insufficient balance, blocks on invalid date range)
- **`/leave/tosd`** — TOSD list page with staff + year filter, Add Record dialog

---

## [Phase 1 polish] — shipped 2026-04-27 via #22 squash `2972287`

### Added
- **`/access/registry/$staffId`** — per-staff access detail page listing all platform access records for one staff member
- **Staff profile Access tab** — 6th tab on `/staff/$staffId` showing read-only platform access (visible to self + leads + HR)
- **RBAC matrix tests** — `packages/api/tests/rbac-matrix.test.ts` covering `platforms.*` + `accessRegistry.*`

---

## [Phase 1 — UI screens] — shipped 2026-04-25 via #20 squash `fea4835`

### Added
- `/access/platforms` — admin CRUD page for the platforms reference table (Layer 1 of 3-layer model). Create/edit dialog with category, auth_type, sync_mode enums. Soft-delete via Disable button.
- `/access/registry` — staff × platform matrix view (Layer 3). Pick a platform, see all staff access records, filter by name/email/username. Renders privilege_level pill, account_type, privilege_groups (as chips), per-field source badge.
- Sidebar entries: "Access Registry" (`/access/registry`) + "Platforms" (`/access/platforms`) under Changes & Access.

### Fixed
- `/hr/ppe` — converted to a redirect to `/compliance/ppe` (was a 297-line duplicate page; sidebar duplicate fix per Ataybia feedback). Old bookmarks/links auto-redirect.

### Still deferred (Phase 1 follow-up — for future session)
- `/access/registry/$staffId` per-staff detail page
- Staff profile `Access` tab integration
- Inline edit on registry matrix (currently read-only viewer)
- RBAC matrix test rows for `platforms.*` + `accessRegistry.*` (CI gate per master plan §10.6)
- e2e smoke tests for the 3 new pages

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

## [Pre-master-plan history] — 2026-04-12 to 2026-04-17

> The work below shipped via the Phase 0 / Phase 1 commits above (3916721 / c8fdd3e / fea4835 / 2972287). The `[Unreleased]` heading was aspirational at the time it was written; the 2026-04-25 course correction (see CLAUDE.md "Lessons learned") flagged this anti-pattern. Kept as historical reference. The 7-phase strategic plan referenced here was superseded by `docs/superpowers/plans/2026-04-23-master-remediation-plan.md` (15 phases).

### Security hardening + Phase 0 + Phase 1 start (2026-04-17)

**Reference:** `IMPLEMENTATION_PLAN.md` (root) and `/home/karetech/.claude/plans/paude-for-a-second-clever-salamander.md` (strategic plan, 7 phases — superseded).

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
