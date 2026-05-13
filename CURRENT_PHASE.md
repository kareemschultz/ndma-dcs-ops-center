# Current Phase

**Active phase:** Phase 14 + 15 + 16 (co-shipped on same branch) — CODE COMPLETE
**Status:** 🟢 Code complete — Parts A, B, C, D shipped per closeout prompt. PROD-side (migration + seed run) remains.
**Branch:** `claude/inspiring-morse-bdf638` (PR #41 — open)
**Latest commit:** `cbad534` (feat(phase-c-d): 22 seed steps + static RBAC contract + rota HI #4)
**Migration index:** 32 (latest: `0032_noc_shift_enum_extend.sql`)

## What is on main (Phases 0-13)

| Phase | PR | Commit | What shipped |
|---|---|---|---|
| 0 | #16 | 3916721 | Migrations 0008-0015 — stabilise and delete |
| 1 | #18-22 | 2972287 | Access registry schema + API + UI + RBAC tests + staff detail page |
| 2 | #23 | a88f36b | Leave refactor — TOSD table, validateRequest, policy engine |
| 3 | #24 | b3cad77 | Scheduling — noc_shifts, dcs_on_call_weeks, routine_maintenance, swap tables + router + UI |
| 4 | #25 | 82c109b | Appraisal sub-tables (ratings/responsibilities/achievements/goals/signatures) + scoring |
| 5 | #26 | 7916454 | NOC performance — ticket activity, monthly metrics, EOM awards + computeEOM |
| 6 | #27 | 66fa5c9 | Contracts lifecycle — lifecycle dates, outcome recording, career_progression_plans |
| 7 | #29 | 2ced91b | Training — plans, cert catalog, exam vouchers, events, in-house log, syllabi, onboarding templates |
| 8 | rebased | fb46d00 | PPE matrix (17 items), lateness quarterly grid (Q1-Q4), timesheet documents index |
| 9 | #34+#39 | b84779a | Self-service profile — 11 sections, CUG/MiFi fields, onboarding.tasksList, RBAC fix |
| 10 | #36 | 39bbdb9 | Notifications — verified all triggers already wired; documented |
| 11 | #38 | a4a79e7 | Work refactor — year/period/weekStartDate columns + filter pills + migration 0031 |
| 12 | #37 | fa19785 | Import module — 18 CSV templates at /public/import-templates/ |
| 13 | #35 | ff46c25 | Docs cleanup — deleted 4 stale docs, updated 3 MDX files |

## Phase 14 — Final historical seed (🔵 In Progress)

Seed script written: `packages/db/src/seed-historical.ts`

Steps implemented (13 of 35):
- Step 1: departments (7 canonical)
- Step 2: staff profile updates from AccountManagementMarch_20260312.xlsx
- Step 3: service_access_registry (Layer 3) from same file
- Step 5: contracts from ContractEndDates_DCS/NOC xlsx
- Step 11: commendations from StaffCommendationJournal xlsx
- Step 14: noc_monthly_metrics from EmployeeOfTheMonth xlsx
- Step 17: noc_shifts from shift-schedule xlsx
- Step 20: leave_requests (2026) from AnnualLeaveRosterNOC xlsx
- Step 21: tosd_records from TimeOffSickDays xlsx
- Step 22: lateness_records from LatenessReport xlsx
- Step 23: ppe_items (17 canonical, hardcoded)
- Step 24: ppe_issuances from PPE&IndividualTools xlsx
- Step 34: onboarding_task_templates (8 hardcoded)

Steps NOT yet implemented: 4, 6-10, 12-13, 15-16, 18-19, 25-33, 35

**To run:** `bun run db:seed:historical` (add `--dry-run` first)
**Gates:** staff.rowCount==281, serviceAccessRegistry.rowCount>=3000, appraisalTrackerView.rowCount>=130, employeeOfTheMonth.matchRate==19/19

## Phase 15 — Hardening (🔵 In Progress)

Fixes applied in this session:
- **Import router**: Added 3 missing execute handlers (platform_accounts, attendance, callouts) with correct CSV column mappings
- **Bundle splitting**: Vite manualChunks (function form) splits vendor-react, vendor-tanstack-router, vendor-tanstack-query, vendor-recharts, vendor-forms, vendor-dates, vendor-lucide
- **RBAC matrix**: Added Phase 15 describe block covering platform_accounts/attendance/callouts import RBAC
- **Smoke tests**: Expanded from 24 to 40+ pages (all Phase 3-13 pages now covered)
- **PRODUCTION_READINESS_CHECKLIST.md**: Created comprehensive 10-section deployment checklist

## Phase 16 — IA Revamp + Part A-D closeout (🟢 Code complete, head `cbad534`)

**Part A** (commit `d922e55`):
- ✅ `docs/audit/HANDOFF-COMPLETION-AUDIT-2026-05-12.md` — every AC verified with file:line
- ✅ 5 open decisions tagged @kareem in `docs/plan-questions.md`

**Part B** (commit `e023cc6`):
- ✅ `scripts/extract-source-of-truth.ts` + `docs/source-of-truth/canonical-data.{md,json}` — 246 files, 10.46 MB JSON

**Part C** (commit `cbad534`):
- ✅ 22 of 35 seed steps added (15 real + 7 stubs) → 35/35 total
- ✅ All compile + bundle cleanly

**Part D** (commits `bd34598` + `cbad534`):
- ✅ HI #4 fix: `policy.ts` mutations + `rota.ts:793 acknowledge` → `requireRole`
- ✅ HI #5: new `rbac-static-contract.test.ts` (132 tests pass)
- ✅ Phase 6 AC: `lib/contract-reminders.ts` (90/60/30/14/7/1 ladder)
- ✅ Phase 3 spec: NOC shift enum +Split Shift +Maternity Leave (migration 0032)
- ✅ Phase 12 30+ templates: 42 new CSV files
- ✅ Phase 15 smoke: 25 → 58 tests via PAGES array
- ✅ PRODUCTION_READINESS_CHECKLIST: standard markdown checkboxes
- ✅ Sidebar (Phase 16): 12 flat groups + 13 legacy routes → Navigate redirects
- ⏳ Phase 3 cutover gate (delete legacy schedulers after 7-day zero-5xx)
- ⏳ iCal export (Phase 3 AC) — deferred to v1.1 per decision

## Known pending issues

- **drizzle-kit generate blocked** — `appraisal_tracker_view` duplicate-name warning causes exit 1. Workaround: hand-author migrations.
- **Phase 14 remaining steps** (22 of 35) — need PROD data files + DATABASE_URL to validate
- **Production migrations 0008-0031** not yet applied (requires PROD DATABASE_URL)
- **Phase 3 cutover gate**: legacy rota.ts/roster.ts/noc-shifts.ts still mounted; delete after 7-day zero-5xx window
- **vite bundle**: main app chunk still ~1GB — further code splitting (dynamic imports per route) is a follow-up
