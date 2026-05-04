---
title: State-of-Project Audit — Doc Drift + Source-of-Truth Coverage
date: 2026-05-04
author: Claude Code (Opus 4.7) — pre-Phase-9 audit pass
status: SNAPSHOT (informational; not a remediation order)
---

# State-of-Project Audit — 2026-05-04

> **Purpose:** Inventory what's actually in the repo today, flag where docs disagree with reality, map source-of-truth coverage to shipped vs queued phases, and list the outstanding items that should be addressed before / during Phases 9-15.
>
> **NOT a substitute for the master remediation plan** at [`docs/superpowers/plans/2026-04-23-master-remediation-plan.md`](../superpowers/plans/2026-04-23-master-remediation-plan.md). This is a delta report.

---

## 0. TL;DR

- ✅ **Phases 0-8 verified shipped on `main`** (gate SHAs match `git log` content). Migrations 0008-0028 present + journal in sync.
- 🟠 **One open defect — production migration backlog**: migrations 0008-0028 (now 21 of them) NOT yet applied to production. Open since 2026-04-23 in `docs/plan-questions.md`.
- 🟡 **Doc drift, multiple files**: `AGENTS.md`, `GEMINI.md`, `README.md`, and `CLAUDE.md` schema/router tables list pre-Phase-1 reality. 5 root-level audit-era docs (`AUDIT_REPORT.md`, `REMEDIATION_BACKLOG.md`, `CLAUDE_FIX_TASKS.md`, `PRODUCTION_READINESS_CHECKLIST.md`, `GEMINI.md`) are slated for Phase 13 deletion but still present.
- 🟡 **Source-of-truth NOT seeded into DB yet.** Schemas/routers/UI for Phases 1-8 exist but contain no XLSX-derived rows. Master plan §9 designs `seed-historical.ts` (Phase 14) for that. 200 XLSX + 29 DOCX files sit unseeded at `<repo>/source-of-truth/` (gitignored).
- ⛔ **Phases 9-15 queued** (self-service, notifications/reminders, work-register refactor, import module, cleanup, historical seed, hardening). Each adds new schema/router/UI surface or completes hardening.
- 🟡 **Repo-root junk** (`1.zip`, `files.zip`, `WorkUpdate_20240118_v01.xlsx`, `dev-restart*.log`, `category-zips/`) — appears unintentional; see §4.5.

---

## 1. Verified current state

### 1.1 Phase status (verified by `git show <SHA> --stat` per Hard Invariant #1)

| # | Phase | Status | Main SHA | Notes |
|---|---|---|---|---|
| 0 | Stabilise & delete | 🟢 Done | `3916721` | migrations 0008-0015 |
| 1 | People & access registry | 🟢 Done | `2972287` | migrations 0016-0020 |
| 2 | Leave refactor | 🟢 Done | `a88f36b` | migration 0021 |
| 3 | Scheduling unification | 🟢 Done | `b3cad77` | migration 0022 |
| 4 | Appraisal system | 🟢 Done | `82c109b` | migration 0023 |
| 5 | NOC performance | 🟢 Done | `7916454` | migration 0024 |
| 6 | Contracts lifecycle | 🟢 Done | `66fa5c9` | migration 0025 |
| 7 | Training | 🟢 Done | `2ced91b` (was `a4c1a53` pre-rebase) | migrations 0026-0027 |
| 8 | PPE / lateness / timesheets / TOSD | 🟢 Done | `fb46d00` (was `2b4fbc6` pre-rebase) | migration 0028 |
| 9 | Self-service + policies + forms | ⬜ Queued | — | Master plan §5.12, §6.5 |
| 10 | Notifications & calendar | ⬜ Queued | — | 15 reminder triggers; channel-adapter pattern (open Q #5 deferred to Phase 15 stretch) |
| 11 | Work register refactor | ⬜ Queued | — | year/period/week_start_date + filter pills |
| 12 | Import module | ⬜ Queued | — | 30+ CSV templates |
| 13 | Obsolete docs cleanup | ⬜ Queued | — | Delete 5 root .md files; archive plans |
| 14 | Final historical seed | ⬜ Queued | — | 35-step `seed-historical.ts` |
| 15 | Hardening | ⬜ Queued | — | E2E + perf + RBAC matrix + a11y |

### 1.2 Code surface (counts as of 2026-05-04)

| Layer | Count |
|---|---|
| DB schema files (`packages/db/src/schema/*.ts`) | 49 |
| Migrations (`packages/db/src/migrations/*.sql`, fwd) | 28 (+ 8 `.down.sql`) |
| oRPC routers (`packages/api/src/routers/*.ts`) | 41 |
| Web routes (`apps/web/src/routes/_authenticated/**.tsx`) | 78 |
| RBAC roles (`packages/auth/src/index.ts`) | 7 (admin, hrAdminOps, manager, teamLead, personalAssistant, staff, viewer) |
| RBAC resources (`packages/auth/src/index.ts`) | 22+ (staff, work, leave, rota, roster, compliance, contract, appraisal, report, audit, settings, procurement, notification, access, appraisal_cycle, promotion_letter, performance_journal, career_path, ppe, callout, timesheet, shift, feedback, leave_policy, attendance, department_assignment) |
| Seed scripts (`scripts/seed-*.ts`) | 11 (master plan §3.4 wants this consolidated to 2 in Phase 14) |
| `phase-{N}-{slug}.md` checklists | 3 (phase-0, phase-7, phase-8 only) |

### 1.3 Source-of-truth archive (read-only, gitignored at line 45 of `.gitignore`)

Located at `<repo-root>/source-of-truth/` (NOT in this worktree). Contents:

- 200 XLSX, 29 DOCX, 17 TXT files
- 11 numbered domain folders: `00-access-and-accounts`, `01-org-and-mission`, `02-dcs`, `03-noc`, `04-shared-leave`, `05-shared-timesheets`, `06-shared-training`, `07-work-register`, `08-feedback-notes`, `09-inspection-artifacts`, `10-handoff-docs`
- Two zip mirrors at repo root: `ndma-source-of-truth-full.zip`, `ndma-source-of-truth-lean.zip` (also gitignored at line 46)
- Authoritative spec docs: `10-handoff-docs/CLAUDE_CODE_PLANNING_HANDOFF.md` (793 lines) + `DEEP_DIVE_ANALYSIS.md` (18,831 lines)

---

## 2. Documentation drift

### 2.1 🟡 Root-level audit-era docs — slated for Phase 13 deletion, still present

Master plan §4.1 lists these as "delete" (defects migrate into the master plan §3 + per-phase backlogs). They're still at the repo root and risk being read by future agents as if current.

| File | Lines | Master plan disposition | Current state |
|---|---|---|---|
| `AUDIT_REPORT.md` | 295 | DELETE in Phase 13 | Still present. Talks about "Phase 1 critical" / "Phase 4 polish" using a *different* phase-numbering scheme that pre-dates the 2026-04-23 master plan. C1-C4 critical findings have largely been addressed by Phase 0 + the 2026-04-17 security hardening pass (see CHANGELOG `[Unreleased]`). |
| `REMEDIATION_BACKLOG.md` | 37 | DELETE in Phase 13 | Same content as AUDIT_REPORT in tabular form; same stale phase numbering. |
| `CLAUDE_FIX_TASKS.md` | 101 | DELETE in Phase 13 | Tasks 1-9; partially resolved per CHANGELOG. |
| `GEMINI.md` | 283 | DELETE in Phase 13 | Older copy of AGENTS.md content. |
| `PRODUCTION_READINESS_CHECKLIST.md` | 60 | KEEP per §4.4 | Stale checklist (status from before Phases 1-8). Master plan re-uses this for Phase 15 acceptance. |

> **Risk:** A new agent reading these without context will mis-prioritize work. They were written by a prior automated audit pass before the 2026-04-23 master plan superseded them.

### 2.2 🟡 `AGENTS.md` — significantly out of date

| Claim in `AGENTS.md` | Actual reality | Severity |
|---|---|---|
| "Adding oRPC procedures: use `protectedProcedure`" | CLAUDE.md Hard Invariant #4 mandates `requireRole(...)` for mutations | HIGH (an agent following AGENTS.md writes RBAC-bypassing code) |
| Schema table lists 17 files | 49 schema files exist | HIGH (drift drives wrong assumptions) |
| Lists `compliance.ts` covering training/ppe | Phase 7 added separate `training-phase7.ts`; Phase 8 added separate `ppe.ts` enhancements | MEDIUM |
| "13 RBAC resources" | 22+ resources (career_path, ppe, callout, timesheet, shift, feedback, leave_policy, attendance, etc. added in Phases 1-8) | HIGH |
| Routers table lists 14 routers | 41 routers exist | HIGH |
| Says auth tables `team_lead_id` valid on staff | Phase 0 migration 0010 dropped `team_lead_id` (replaced by `reportsTo`) | HIGH |
| Audit-logging rule lists no `actorRole`/`correlationId` requirements | CLAUDE.md mandates both | MEDIUM |
| References `attendance_exceptions`, `callouts` | Both deleted in Phase 0 migration 0009 | HIGH |
| Says "13 resources" in RBAC final section | 22+ | HIGH (final-section repeat) |

### 2.3 🟡 `GEMINI.md` — out of date AND scheduled for deletion

GEMINI.md is a verbatim copy of an older AGENTS.md with the same drift listed above. Master plan §4.1 says delete it entirely in Phase 13. **Recommendation:** delete it now and let Gemini CLI fall back to AGENTS.md / CLAUDE.md (matches deletion list).

### 2.4 🟡 `README.md` — out of date

| Claim | Reality | Notes |
|---|---|---|
| "5-role RBAC over 13 resources" | 7 roles, 22+ resources | Roles section table lists 5; should add `teamLead` and `personalAssistant`. |
| "21 schema files, one per domain" | 49 schema files | |
| "18 domain routers" | 41 | |
| Database schema overview table | Missing all Phase 1-8 additions: appraisal sub-tables, scheduling.*, training-phase7, NOC performance, contracts lifecycle, lateness, timesheets, TOSD, access registry layers (platforms, sync_adapters, service_access_registry) | Substantial; this is the customer/onboarding face. |
| "30 route files implemented" (in `[Unreleased]` section of CHANGELOG) | 78 authenticated routes | Reflects pre-Phase-1 state |
| Login route documented inconsistently | CLAUDE.md says route is `/login` (correct); README screenshots imply `/login` | OK |

### 2.5 🟡 `CLAUDE.md` schema/router tables — partially out of date

CLAUDE.md is the authoritative agent-facing doc and is mostly accurate on gotchas + invariants. But its schema and router tables drift:

**Missing schemas in CLAUDE.md table:**
- `appraisal-ratings.ts`, `appraisal-cycles.ts`, `appraisal-followups.ts` — present (Phase 4)
- `attendance-logs.ts` — present
- `calendar-events.ts`, `company-forms.ts`, `company-policies.ts` — present
- `career-progression.ts` — present (Phase 6)
- `certification-budgets.ts` — present
- `exam-schedule.ts` — present (Phase 0 migration 0012)
- `lateness-records.ts` — present (Phase 8)
- `leave-policies.ts` — present
- `noc-performance.ts`, `noc-shifts.ts` — present (Phases 3, 5)
- `onboarding-tasks.ts`, `staff-promotions.ts` — present
- `operational-overlays.ts` — present (renamed at table level to `routine_maintenance_*` in migration 0013, but the file itself + variable names still say "overlay" — see §4.6)
- `platforms.ts`, `service-access-registry.ts`, `sync-adapter-runs.ts`, `sync-adapters.ts` — present (Phase 1)
- `scheduling.ts` — present (Phase 3)
- `timesheet-documents.ts` — present (Phase 8)
- `tosd-records.ts` — present (Phase 2)
- `training-phase7.ts` — present (Phase 7)
- `hr-docs.ts` — present

**Stale entries in CLAUDE.md table:**
- Lists `attendance-exceptions.ts` and `callouts.ts` as if they exist — both DELETED in Phase 0 migration 0009.
- `compliance.ts` description mixes Phase 1 and Phase 7/8 features

**Missing routers** (CLAUDE.md table says ~18; actual is 41): `access-registry`, `appraisal-cycles`, `attendance-time`, `career-progression`, `lateness`, `leave-policies`, `noc-performance`, `noc-shifts`, `platforms`, `policy`, `scheduling`, `timesheet-documents`, `timesheets`, `training-phase7`.

### 2.6 🟢 `CURRENT_PHASE.md` — SHA mismatch (resolved 2026-05-04)

> **Original finding:** said Phase 8 "Last completed" SHA was `20202ed` (feature-branch tip) while IMPLEMENTATION_PLAN's status table said `2b4fbc6` (pre-rebase squash to main).
>
> **2026-05-04 update:** the 2026-05-04 PR #29 was rebase-merged (not squash-merged), changing Phase 7 + 8 SHAs on main:
> - Phase 7: `a4c1a53` → `2ced91b`
> - Phase 7 coord: `fce3f10` → `1aa728a`
> - Phase 8: `2b4fbc6` → `fb46d00`
> - Phase 8 coord: `fcdd442` → `750f938`
>
> Both `20202ed` (feature-branch tip — still reachable from `phase/8-ppe-lateness-tosd` branch) and the pre-rebase squashes are content-equivalent to the current main SHAs. CURRENT_PHASE.md, IMPLEMENTATION_PLAN.md, CHANGELOG.md, and AGENT_LOG.md (in the 2026-05-04 entry) have been updated to point at the canonical post-rebase SHAs. Older AGENT_LOG entries retain their original SHAs as historical records.

### 2.7 🟡 `CHANGELOG.md` — phase entries clean, "[Unreleased]" section stale

The bottom of CHANGELOG has an `[Unreleased]` section dated 2026-04-12 / 2026-04-17 describing security hardening + Phase 0 + Phase 1 start. That work shipped via Phase 0 (`3916721`) and Phase 1 (`c8fdd3e`/`fea4835`/`2972287`). The `[Unreleased]` section should either be promoted to a `[Pre-master-plan]` history block or trimmed. Currently it gives the impression that work is still pending when it has shipped.

### 2.8 🟢 `IMPLEMENTATION_PLAN.md` + `AGENT_LOG.md` + master plan — accurate

These are kept current per Hard Invariant #8. They are the canonical sources for "where we are."

---

## 3. Source-of-truth → implementation coverage

> Reading: ✅ schema + router + UI shipped, but **NOT YET SEEDED with historical XLSX data**. The actual XLSX-to-DB load is concentrated in Phase 14's `seed-historical.ts` (35 steps). Until then, every Phase 1-8 module renders empty unless dev users add rows manually or run one of the legacy `scripts/seed-*.ts` partial seeders.

| SoT folder | Canonical XLSX/DOCX | Phase | Schema/Router/UI shipped | Historical seed (Phase 14) |
|---|---|---|---|---|
| `00-access-and-accounts` | `AccountManagementMarch_20260312.xlsx` (281 staff × 13 services + VPN/biometric/uPortal); `LiliendaalStaffBiometricAccessControl_20250606_v01.xlsx` (physical doors) | 1 | ✅ platforms / sync_adapters / service_access_registry / sync_adapter_runs (Phase 1, migrations 0017-0020) | ⛔ NOT SEEDED — Phase 14 step 3-4 (~3,653 access rows + ~800 VPN/door rows) |
| `01-org-and-mission` | `Data_Centre_Services-what_we_do.docx` | — (reference only) | n/a | n/a |
| `02-dcs/appraisals/` | Appraisal Template 2025 + ~60 historical XLSX (2021-2026) + QuestionsToAskStaff txt | 4 | ✅ appraisals + 5 sub-tables, scoring, signatures (Phase 4, migration 0023) | ⛔ NOT SEEDED — Phase 14 steps 6-9 (~130 appraisals + ratings/achievements/goals/feedback) |
| `02-dcs/appraisal-tracker/` | `APPRAISAL TRACKER DCS.xlsx` (63 rows + FeedbackFromStaff) | 4 | ✅ `appraisal_tracker_view` shipped 2026-05-04 via migration 0029 (raw-SQL VIEW + Drizzle pgView declaration); FeedbackFromStaff sub-tab CRUD UI still deferred | ⛔ Phase 14 step 9 |
| `02-dcs/contracts/` | `ContractEndDates_DCS.xlsx` (renewal/appraisal periods, EDATE formulas) | 6 | ✅ contracts + lifecycle dates + renewal_outcome (Phase 6, migration 0025) | ⛔ Phase 14 step 5 (~50 contracts) |
| `02-dcs/on-call/` | `PlannedOnCallRoster_20230123 (1).xlsx` (4 years, 4-role weekly) + quarterly maintenance | 3 | ✅ dcs_on_call_weeks + routine_maintenance + on_call_swaps (Phase 3, migration 0022) | ⛔ Phase 14 steps 18-19 (~208 weeks + 16 quarterly tasks) |
| `02-dcs/ppe/` | `PPE&IndividualTools_20240726_v01.xlsx` (17 items × staff + sizes + asset tags) | 8 | ✅ ppe_items + ppe_issuances matrix UI (Phase 8, migration 0028) | ⛔ Phase 14 step 24 (subset of 280 × 17) |
| `03-noc/appraisals/` | NOC appraisal template + ~70 historical (2022-2026) | 4 | ✅ shared with DCS schema | ⛔ Phase 14 steps 6-9 (~130 incl. NOC) |
| `03-noc/employee-of-month/` | `EmployeeOfTheMonth_20240923_v01.xlsx` (19 monthly sheets, 5 computed formulas, 7 recognition labels) | 5 | ✅ noc_monthly_metrics + employee_of_the_month + computeEOM router (Phase 5, migration 0024) | ⛔ Phase 14 steps 14, 16 — **CRITICAL acceptance gate**: 19/19 historical months must match recorded "Overall Best Technician" labels. Not yet validated. |
| `03-noc/performance-journal/` | `StaffPerformanceJournal_20230731_v01.xlsx` (12 staff × 4 years × 12 months × 4 categories); `StaffCommendationJournal_20231216_v01.xlsx` | 5 | ✅ `commendations` table shipped 2026-05-04 via migration 0029. 🟡 mistake-matrix tracker still pending — see `docs/plan-questions.md` for the `performance_journal_entries` naming-alignment decision (existing `hr-docs.ts` table is a different entity). | ⛔ Phase 14 steps 10-11 (~250 commendations now, ~2,304 mistake-matrix once naming resolved) |
| `03-noc/contracts/` | `ContractEndDates_NOC.xlsx` includes **Plan** sheet (career progression 2026-2029) | 6 | ✅ career_progression_plans (Phase 6, migration 0025) | ⛔ Phase 14 step 13 (~40 plans) |
| `03-noc/leave/` | `AnnualLeaveRosterNOC.xlsx` (2026 sheet + 12-month matrix; rules in IMPORTANT column) | 2 | ✅ leave_policies extension + tosd_records (Phase 2, migration 0021) + validateRequest engine | ⛔ Phase 14 step 20 (~50 leave_requests) |
| `03-noc/shift-schedules/` | `{January..April}_2026*.xlsx` (D/S/N/sick/off grids) | 3 | ✅ noc_shifts table + monthly grid UI (Phase 3, migration 0022) | ⛔ Phase 14 step 17 (~1,364 shift days) |
| `03-noc/training/` | `NOCTrainingProgramSyllabus`, `TrainingLog`, `InternsTraining`, `DCS-NOC-GOALCiscoCourses`, Huawei × 3 yrs, Assessment Questions docx × 8 | 7 | ✅ training_plans, certification_catalog, exam_vouchers, training_events, in_house_training_log, training_syllabi, assessment_questions, onboarding_task_templates (Phase 7, migrations 0026-0027) | ⛔ Phase 14 steps 25-34 (~30+10+20+15+5+50+100+8) |
| `03-noc/appraisals/Promotion Letter/` | 7 docx + 1 pdf | 4/6 | 🟡 `promotion_letters` table exists (`hr-docs.ts`) — verify content. Master plan §5.3 says modeled. | ⛔ Phase 14 step 12 (~7) |
| `04-shared-leave/` | `TimeOffSickDays_20251010_v01.xlsx` (5 yearly + 2023-Callout legacy) | 2 | ✅ tosd_records w/ 7 types incl. `callout_legacy` (Phase 2) | ⛔ Phase 14 step 21 (~2,000 rows) |
| `05-shared-timesheets/` | PDFs index + `LatenessReportNOC&DC_2025_v01.xlsx` | 8 | ✅ timesheet_documents (index only, don't parse) + lateness_records quarterly grid (Phase 8) | ⛔ Phase 14 step 22 (~264 lateness rows). Timesheet PDFs index TBD. |
| `06-shared-training/` | Yearly archives 2020-2026 + `Exam Dates`, `Onboarding Checklist`, NDMA Exam Vouchers, `TrainingSchedule2026_2027`, `TrainingDocumentationForm_2026` | 7 | ✅ exam_schedule extended + onboarding templates seeded (8) (Phase 7) | ⛔ Phase 14 steps 25-34 |
| `07-work-register/` | `WorkUpdate_20240118_v01.xlsx` (24 sheets — weekly + Routine + TemporaryTracker + CurrentWork + Analytics) | 11 | ⛔ Schema does NOT yet have `year`, `period`, `week_start_date` columns (master plan §5.13). Filter pills NOT yet shipped. | ⛔ Phase 14 step 35 (~500 rows) |
| `08-feedback-notes/` | sticky-note-1/2/3.jpeg (Ataybia's 2026-04-21 sticky-note feedback) | 0 | ✅ feedback already incorporated into master plan defect register §3.1-§3.3 | n/a (qualitative input) |

### 3.1 Schemas/features specified in master plan but NOT yet shipped

| Spec ref | Entity | Phase | State |
|---|---|---|---|
| §5.3 | `commendations` table | Phase 5 | ✅ **RESOLVED 2026-05-04** — shipped via migration 0029 (`commendations` table with `unique(staff_profile_id, year, month)` + month CHECK constraint). Schema: `packages/db/src/schema/commendations.ts`. Router: `commendations.{list,get,create,update,delete}`. RBAC matrix tests added. |
| §5.3 | `appraisal_tracker_view` (DB VIEW) | Phase 4 | ✅ **RESOLVED 2026-05-04** — shipped via migration 0029 as raw-SQL `CREATE OR REPLACE VIEW`. Drizzle declaration: `packages/db/src/schema/appraisal-tracker-view.ts` (`pgView().existing()`). Router: `appraisalTracker.list`. Phase 14 gate `appraisalTrackerView.rowCount >= 130` requires this view. |
| §5.13 | `work_items.year`, `period`, `week_start_date` columns + composite index | Phase 11 | ⛔ Confirmed absent (`grep` found 0 matches in `work.ts`). |
| §5.13 | `work_item_periods` reference table | Phase 11 | ⛔ Schema not present. |
| §5.12 | `calendar_events.event_type` enum widening to 11 values | Phase 0 (extended) / 9-10 | ✅ migration 0015 widened from 3 → 12 values. |
| §6.5 | "My Everything" self-service page | Phase 9 | ⛔ `/profile.tsx` route exists but Phase 9 scope (15-section consolidated view) not yet built. |
| §6.6 | Reminder cron / DB-polling engine | Phase 10 | ⛔ `notifications.ts` router exists for in-app messages but no reminder engine / 15 trigger handlers. |
| §6.6 | Channel-adapter pattern (`NotificationChannel` interface) | Phase 10 | ⛔ Not yet built (was a 2026-04-23 architectural addendum from open Q #5). |
| §7 | 30+ CSV import templates | Phase 12 | ⛔ Only `apps/web/public/import-templates/README.md` exists — no actual `.csv` files. README claims 14 templates exist; they don't. |
| §9 | `seed-historical.ts` (35 steps) | Phase 14 | ⛔ NOT WRITTEN. 11 legacy seed scripts still in `scripts/`. |
| §9 | `docs/seed-report.md` + `.json` (seed observability) | Phase 14 | ⛔ Not yet generated. |

---

## 4. Open defects + outstanding actions

### 4.1 P0 — Production migration backlog (open since 2026-04-23)

`docs/plan-questions.md` records `[KNOWN DEFECT]`: production DB migrations 0008-0015 have not been applied. As of today the worktree's main is at migration 0028, so the production gap is **migrations 0008 through 0028 (21 migrations)**.

**Recommended action:** apply during a low-traffic window:
```bash
DATABASE_URL=$PROD_DATABASE_URL bun run db:migrate
```
With pre-checks per `phase-0-stabilise.md §8` (SELECT counts on appraisals, leave_requests, departments, callouts) before applying to safeguard against orphaned data.

### 4.2 P1 — Phase 1-6 phase checklists missing

Master plan §11.1 says each phase creates `docs/superpowers/plans/phase-{N}-{slug}.md` at start. Only `phase-0-stabilise.md`, `phase-7-training.md`, `phase-8-ppe-lateness-tosd.md` exist. Phases 1-6 shipped without per-phase checklist files (likely created in CURRENT_PHASE.md and not promoted). Cosmetic but breaks audit-trail completeness.

### 4.3 P1 — CI quality gates incomplete

`AUDIT_REPORT.md H5` flagged this and Phase 15 is supposed to address it. Today's CI runs typecheck + build only. Missing: lint, unit tests, RBAC matrix test, e2e Playwright run, docker smoke. RBAC matrix test exists at `packages/api/tests/rbac-matrix.test.ts` but is not in CI.

### 4.4 P2 — E2E baseline not verified

AGENT_LOG entries for Phases 7-8 both note "e2e: not run (no DB in worktree environment)". A clean e2e baseline run on main is recommended before launching Phase 9.

### 4.5 P2 — Repo-root junk files

These are present at repo root and likely unintentional:

| File | Probable origin | Action |
|---|---|---|
| `1.zip`, `files.zip` | Stray downloads | Add to `.gitignore`, delete locally |
| `WorkUpdate_20240118_v01.xlsx` | Source-of-truth file leaked outside `source-of-truth/` (which is gitignored) | Move into `source-of-truth/07-work-register/` (already exists at the SoT path); delete from root |
| `category-zips/` | Build artifact dir | Likely gitignored already; verify |
| `dev-restart*.log`, `dev-baseline.*.log` (~12 files) | Background bun dev server logs | Add to `.gitignore` |
| `e2e-report/` | Playwright HTML report | Confirm gitignored |
| `bts.jsonc` | Better-T-stack scaffold cache | Verify intentional |

### 4.6 P3 — `operational-overlays.ts` schema file naming

`packages/db/src/schema/operational-overlays.ts` was renamed at the **table** level (`overlay_*` → `routine_maintenance_*`) in migration 0013, but the **file name + exported variable names** still say "overlay" (`overlayTypes`, `overlayTaskStatusEnum`, etc.). Cosmetic, but confuses cross-references. Master plan §3.5 default decision was "Keep" for this file but the rename happened inside it and the name drift is now stale. Safe to rename in a chore commit.

### 4.7 P3 — `[Unreleased]` section in CHANGELOG.md

Stale entries from 2026-04-12 and 2026-04-17 describe shipped work. Should be: split into "[Pre-master-plan history]" block OR removed (the work is captured in the per-phase entries above).

### 4.8 P3 — `.env.example` audit not done

`AUDIT_REPORT.md M1` flagged `CORS_ORIGIN=http://localhost:5173` should be `:3001`. Verify whether resolved.

---

## 5. Recommended sequence (no commitment — for Kareem to direct)

### A. Hygiene pass before Phase 9 (1-2 sessions)

1. **Apply prod migrations 0008-0028** (P0).
2. **Update `CLAUDE.md` schema/router tables** to match reality. Remove dead entries (`attendance-exceptions.ts`, `callouts.ts`). Add Phase 1-8 additions.
3. **Update `AGENTS.md` similarly** OR delete it now (master plan §4.1 disposition: KEEP). Decision needed: refresh vs defer to Phase 13.
4. **Delete `GEMINI.md`** (Phase 13 disposition is delete; doing it early prevents agents reading it).
5. **Update `README.md`** role count, resource count, schema count, schema-overview table.
6. **Promote `[Unreleased]` CHANGELOG section** into a `[Pre-master-plan]` history block.
7. **Backfill `phase-{1..6}-{slug}.md` checklist files** retroactively (skeleton only — what shipped, gate SHA, deferred items). Reference: AGENT_LOG entries already have the data.
8. **Clean repo-root junk** (§4.5): gitignore + `git rm` zips, logs, stray xlsx.

### B. Verification pass (1 session)

9. **Verify Phase 4 `appraisal_tracker_view` exists** (master plan §5.3). If not, file a Phase 4 follow-up issue.
10. **Verify Phase 5 `commendations` table state** (master plan §5.3). If not present, decide: roll into Phase 5 follow-up or fold into Phase 9/14.
11. **Run e2e baseline** against fresh dev DB to establish Phase 9 starting point.
12. **Run RBAC matrix test** locally (`packages/api/tests/rbac-matrix.test.ts`) and verify it covers every router procedure shipped in Phases 1-8.

### C. Phase 9 launch (master plan §5.12 + §6.5)

13. **Write `docs/superpowers/plans/phase-9-self-service.md`** per protocol (acceptance criteria from master plan §8 Phase 9).
14. **Branch `phase/9-self-service` from main** at the Phase 8 gate SHA `fb46d00` (post-rebase canonical; pre-rebase was `2b4fbc6`).
15. **Update `CURRENT_PHASE.md`** to claim Phase 9.
16. **Build self-service "My Everything" page**, profile editor (audit-logged), policy/forms admin UI.

### D. Optional pre-Phase-14 enhancements

17. **CI quality gates** (lint + unit tests + RBAC matrix in CI) — could ship as Phase 8.5 chore vs deferring to Phase 15.
18. **Notification reminder engine + channel-adapter pattern** could be partially scaffolded in Phase 10 prep.

---

## 6. What this audit explicitly does NOT cover

- **Per-cell calculation parity** (e.g., EoM 19-month validation, leave-day arithmetic against historical samples, appraisal score recomputation against XLSX). Master plan §8 phase acceptance criteria own these — they're due during the relevant phase work, not in this snapshot.
- **Security/RBAC penetration audit.** `AUDIT_REPORT.md` (now stale) covered the major findings; the 2026-04-17 hardening commit addressed C1/C3 plus most of C2. A fresh security audit belongs in Phase 15.
- **Performance testing.** Phase 15 acceptance.
- **Accessibility audit.** Phase 15 acceptance.
- **Live source-of-truth file diffs.** This audit checks structure (folders + handoff doc + master plan); per-cell diffs are the seed-historical.ts dry-run's job (Phase 14).

---

*End of state audit. Next agent reading: cross-check against `IMPLEMENTATION_PLAN.md` for current phase status before acting on any §5 recommendation.*
