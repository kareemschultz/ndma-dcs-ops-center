---
title: Master Remediation Plan — NDMA DCS Ops Center
status: AUTHORITATIVE
approved_by: Kareem Schultz
approved_date: 2026-04-23
supersedes:
  - docs/superpowers/plans/2026-04-12-phase3-operations-intelligence.md
  - docs/superpowers/plans/2026-04-12-rota-system.md
  - docs/superpowers/plans/2026-04-21-master-implementation-directive.md
---

# NDMA DCS Ops Center — Master Remediation & Enhancement Plan

> **This is the authoritative plan.** All prior planning documents are superseded.
>
> Sources of truth (in priority order):
> 1. `source-of-truth/10-handoff-docs/CLAUDE_CODE_PLANNING_HANDOFF.md` (793 lines — executive scope + firm decisions)
> 2. `source-of-truth/10-handoff-docs/DEEP_DIVE_ANALYSIS.md` (18,831 lines — cell-level XLSX/DOCX forensic audit)
> 3. `source-of-truth/` unpacked archive (200 XLSX + 29 DOCX + 17 TXT)
>
> Before working on this repo, read `IMPLEMENTATION_PLAN.md` at repo root first.

---

## 1. Executive Summary

### Problem
The NDMA DCS Ops Center codebase (37 oRPC routers, 43 DB schemas, 8 migrations, 68 authenticated routes) has diverged from the real operating patterns used by NDMA DCS and NOC teams. The divergence has three root causes:

- **Scope drift** — features were built (Callouts Register, Attendance Exceptions, Compassionate leave) that Ataybia Williams (PA / HR liaison for DCS+NOC) explicitly wants removed. Her sticky-note feedback on 2026-04-21 reshaped scope.
- **Missing core features** — forensic audit of 200+ historical XLSX/DOCX files surfaced entire feature areas that NDMA operates today but the codebase does not yet model (Employee of the Month, Performance Journal, Commendations, 13-service access matrix, biometric + physical door registry, NOC ticket activity log, routine maintenance quarterly grid, career progression plans, exam vouchers, training events, promotion letters).
- **Technical defects** — `appraisalStatusEnum` has PascalCase + lowercase duplicates; `staff` has both `teamLeadId` and `reportsTo`; `rota` + `roster` + `noc-shifts` routers overlap; `departments.parentId` has no FK; sidebar contains orphaned and duplicate entries.

### Solution
A 15-phase remediation running on `phase/{N}-{slug}` branches with per-phase gate commits. Phase 0 stabilises and deletes before any new feature work begins. The final phase (14) is a single idempotent `seed-historical.ts` that ingests every XLSX/DOCX from the source-of-truth archive into the clean schema.

### Timeline (rough order-of-magnitude)
| Phase group | Phases | Est. calendar time | Cumulative |
|---|---|---|---|
| Stabilise | 0 | 1 week | 1 week |
| Core data model | 1–2 | 2 weeks | 3 weeks |
| Scheduling + appraisals | 3–4 | 3 weeks | 6 weeks |
| NOC perf + contracts | 5–6 | 2 weeks | 8 weeks |
| Training + PPE/lateness | 7–8 | 2 weeks | 10 weeks |
| Self-service + notifications | 9–10 | 2 weeks | 12 weeks |
| Work refactor + import | 11–12 | 1 week | 13 weeks |
| Cleanup + seed + hardening | 13–15 | 2 weeks | 15 weeks |

### Non-negotiables (carried from §10 of planning handoff)
1. Phase 0 merges to main before Phase 1 branches (hard baseline)
2. Seed scripts use upsert-by-natural-key, never raw INSERT
3. Appraisal parser reads raw X-position (B-F columns), not formula result
4. Employee of the Month formulas ported verbatim + validated against 19 historical months
5. Leave policy rules are warnings-with-HR-override, not hard blocks
6. RBAC matrix test is a blocking CI gate, not a Phase 15 afterthought
7. Phase 0 migration split into 4 independently-revertable files (0008–0011)
8. `seed-historical.ts --dry-run` flag is mandatory before any staging run
9. Seed observability has three outputs: stdout JSONL, `docs/seed-report.md`, `docs/seed-report.json`

---

## 2. Source-of-Truth Confirmation

All files verified present and parsed via openpyxl/python-docx during the forensic audit (see `DEEP_DIVE_ANALYSIS.md` for per-cell detail). Totals: **200 XLSX + 29 DOCX + 17 TXT = 246 files**.

### 2.1 Top-level
- `AccountManagementMarch_20260312.xlsx` — 281-row employee registry + 30-column access matrix (13 services + Fortigate + Uportal + MikroTik VPN groups + biometrics)
- `LiliendaalStaffBiometricAccessControl_20250606_v01.xlsx` — physical door register (AllDoors + Main Door Only + server room ACL)
- `WorkUpdate_20240118_v01.xlsx` — 24 sheets: weekly work tabs (0301, 1001, 1804...) + Routine + TemporaryTracker + CurrentWork + Analytics + OtherDept
- `Data_Centre_Services-what_we_do.docx` — DCS mission + 2025-2030 goals (reference only)

### 2.2 DCS/
- `DCS/appraisals/Appraisal Template 2025.xlsx` — canonical form (8 fixed categories + 5 core responsibilities + achievements + goals + 5 signatures)
- `DCS/appraisals/{2021..2026}/` — ~60 filled historical appraisals
- `DCS/appraisals/QuestionsToAskStaff_20240618_v01.txt` — interview prompts (→ `staffFeedbackPrompts`)
- `DCS/appraisal-tracker/APPRAISAL TRACKER DCS.xlsx` — 63-row summary + FeedbackFromStaff tab (derive as DB VIEW)
- `DCS/contracts/ContractEndDates_DCS.xlsx` — 2022, Contract Renewal, Appraisal Period (EDATE formulas), Follow up (3-mo + 9-mo), removed
- `DCS/on-call/PlannedOnCallRoster_20230123 (1).xlsx` — 4 years (2023-2026); 2026 has 4-role columns: Lead Engineer | ASN Support | Enterprise Support | CORE Support + quarterly Cleaning Server Room + Routine Maintenance DCS
- `DCS/ppe/PPE&IndividualTools_20240726_v01.xlsx` — 17 PPE columns incl. MiFi asset tags, boot sizes

### 2.3 NOC/
- `NOC/appraisals/AppraisalTemplate_20250513_v01.xlsx` — same template as DCS
- `NOC/appraisals/Appraisals {2022..2026}/` — ~70 filled historical appraisals (incl. `WAS_NOT_SUBMITTED_*` edge case)
- `NOC/appraisals/AppraisalTracker_20241210_v01.xlsx` — 80-row tracker
- `NOC/appraisals/EmployeeOfTheMonth_20240923_v01.xlsx` — **critical** — 19 monthly sheets Aug2024→March2026 with 5 computed formulas (Percentage Mistakes, Percentage Contribution, Day Shift Ticket Rate, Adjusted for Day Shift, Overall % Adjusted) + 7 recognition labels
- `NOC/appraisals/IncidentProblem_CreatedandClose_20252905.xlsx` — 24 sheets (12 Incident + 12 Problem, Apr2025-Mar2026) ticket-level with per-tech attribution
- `NOC/appraisals/StaffPerformanceJournal_20230731_v01.xlsx` — 12 per-person sheets × 4 years × 12 months × 4 categories (Tickets/iTop, Alarms, Slack/WhatsApp, Task Incomplete)
- `NOC/appraisals/StaffCommendationJournal_20231216_v01.xlsx` — 2025 + 2026 positive counterpart
- `NOC/appraisals/Promotion Letter/` — 7 docx + 1 pdf historical letters
- `NOC/leave/AnnualLeaveRosterNOC.xlsx` — 2026 sheet + 12-month matrix; rules captured in IMPORTANT column
- `NOC/shift-schedule/{January..April}_2026*.xlsx` — monthly shift grids (D/S/N/sick/off)
- `NOC/contracts/ContractEndDates_NOC.xlsx` — Contract Renewal + Appraisal Period + Follow Up + Remove + **Plan** (career progression 2026-2029)
- `NOC/training/*` — NOCTrainingProgramSyllabus, TrainingLog, InternsTraining, DCS-NOC-GOALCiscoCourses, Huawei participants × 3 years, Assessments Questions (8 docx), Alarm Interpretation, Labs, 2022/2023/2024 archives

### 2.4 Shared
- `Shared-leave/TimeOffSickDays_20251010_v01.xlsx` — TOSD register (5 yearly sheets + 2023-Callout legacy)
- `Shared-timesheets-{2021,2023,2024,2025,2026}/` — PDF timesheets (index only, don't parse) + `LatenessReportNOC&DC_2025_v01.xlsx` (quarterly grids)
- `Shared-training/Exam Dates.xlsx` — per-staff scheduled exams
- `Shared-training/Onboarding Checklist.xlsx` — 8-step onboarding template
- `Shared-training/2025/NDMA EXAM VOUCHER.xlsx` — voucher tracking
- `Shared-training/2026/TrainingSchedule2026_2027.xlsx` — per-team training plan + Certs sheet
- `Shared-training/2026/TrainingDocumentationForm_2026 1.xlsx` — per-event cost breakdown
- `Shared-training/{2020..2026}/` — yearly archives

### 2.5 Pre-flight verification (executed at Phase 0 Step 0)
```bash
test -d source-of-truth                                             || abort
test -r source-of-truth/10-handoff-docs/DEEP_DIVE_ANALYSIS.md       || abort
test -r source-of-truth/10-handoff-docs/CLAUDE_CODE_PLANNING_HANDOFF.md || abort
test $(find source-of-truth -name '*.xlsx' | wc -l) -ge 200         || abort
test $(find source-of-truth -name '*.docx' | wc -l) -ge 29          || abort
```
Any failure: write to `docs/plan-questions.md` with `@kareem [BLOCKER]` tag and halt.

---

## 3. Defect Register

### 3.1 Schema defects
| File | Line(s) | Defect | Fix in phase |
|---|---|---|---|
| `packages/db/src/schema/appraisals.ts` | 21-35 | `appraisalStatusEnum` contains both PascalCase and lowercase: `"Draft"`, `"Pending_Approval"`, `"Approved_By_Manager"`, `"Processed_By_PA"`, `"Completed"`, `"draft"`, `"scheduled"`, `"in_progress"`, `"submitted"`, `"approved"`, `"rejected"`, `"completed"`, `"overdue"`. | **Phase 0** — collapse to lowercase via migration 0008 |
| `packages/db/src/schema/staff.ts` | (teamLeadId + reportsTo fields) | Parallel `teamLeadId` (legacy) and `reportsTo` (added in migration 0005). | **Phase 0** — drop `teamLeadId`, keep `reportsTo` |
| `packages/db/src/schema/departments.ts` | (parentId field) | `parentId` is bare text — no `.references()`. Self-ref FK avoided due to Drizzle circular-FK limitation. | **Phase 0** — add FK via raw SQL migration 0011 |
| `packages/db/src/schema/callouts.ts` | whole file | Entire feature removed by Ataybia. | **Phase 0** — delete schema + router + route + legacy rows migrated to `tosd_records` |
| `packages/db/src/schema/attendance-exceptions.ts` | whole file | Same — replaced by simpler lateness + TOSD model. | **Phase 0** — delete |
| `packages/db/src/schema/leave.ts` | (leaveTypes seed rows) | `Compassionate` leave type exists — Ataybia removed. | **Phase 0** — covered by Emergency or Special Leave |

### 3.2 Sidebar / nav defects (`apps/web/src/components/layout/data/sidebar-data.ts`)
| Defect | Fix | Phase |
|---|---|---|
| `/rota/*` (DCS) and `/roster/*` (NOC) are separate trees | Merge into one **Scheduling** group: NOC Shifts / DCS On-Call / My Schedule / Maintenance | 3 |
| `/hr/ppe` AND `/compliance/ppe` both present | Keep `/compliance/ppe`, redirect `/hr/ppe` → `/compliance/ppe` | 0 |
| Training group: 3 items all pointing to `/training` | Replace with: Overview / My Training / Plan / Exams / Vouchers / Events | 7 |
| Policies group: 2 items all pointing to `/policy` | Replace with: Documents / Forms / My Profile | 9 |
| `hr/callouts.tsx` route exists (not linked in sidebar) | **Delete route file** | 0 |
| `hr/attendance.tsx` route exists (not linked) | **Delete route file** | 0 |

### 3.3 Router redundancy
| Router | Action | Phase |
|---|---|---|
| `packages/api/src/routers/callouts.ts` | **Delete** | 0 |
| `packages/api/src/routers/attendance-exceptions.ts` | **Delete** | 0 |
| `rota.ts` + `roster.ts` + `noc-shifts.ts` | Unify under `scheduling.ts` with subrouters `nocShifts`, `dcsOnCall`, `maintenance`, `swaps` | 3 |

### 3.4 Seed scripts
11 seed scripts with overlapping responsibilities (`seed-appraisals.ts`, `seed-attendance.ts`, `seed-current-data.ts`, `seed-dev-auth.ts`, `seed-e2e-workflow.ts`, `seed-hr-data.ts`, `seed-leave.ts`, `seed-noc-shifts.ts`, `seed-policies-budgets.ts`, `seed-tasks.ts`, `seed-training.ts`). Consolidate into:
- `seed.ts` — bootstrap admin + departments + roles + dev auth (keep existing)
- `seed-historical.ts` — new, 35-step idempotent ingest (Phase 14)

### 3.5 Extra schemas in worktree (not mentioned in handoff)
Reconciled in Phase 0 Step 1 (decisions below are defaults — all must be confirmed or overridden before Phase 0 completes):

| Schema | Default decision | Rationale |
|---|---|---|
| `exam-dates.ts` | Extend | Handoff §6.10 specifies `examSchedule` — reuse this table |
| `company-forms.ts` | Keep | Handoff §6.12 references companyForms catalogue |
| `company-policies.ts` | Keep | Handoff §6.12 references companyPolicies |
| `certification-budgets.ts` | Review | Not in handoff; may be pre-existing work unrelated to plan |
| `attendance-time.ts` | Review | Overlaps with §6.8 attendanceLogs |
| `leave-policies.ts` | Extend | Handoff §6.6 specifies leavePolicies table |
| `policy.ts` | Merge | Review against companyPolicies; may be duplicate |
| `calendar-events.ts` | Extend | Handoff §6.12 adds eventType enum |
| `staff-promotions.ts` | Extend | Handoff §6.5 references staffPromotions |
| `onboarding-tasks.ts` | Extend | Handoff §6.11 references onboardingTasks |
| `operational-overlays.ts` | Review | Not in handoff; preserve if feature is live |

---

## 4. Obsolete-Docs Cleanup Plan

### 4.1 Delete (root-level .md — 5 files, 1,224 lines)
Phase 13 action. Reason per file documented in `docs/cleanup-log.md` at execution time.

| File | Lines | Reason |
|---|---|---|
| `AUDIT_REPORT.md` | 295 | Defects migrate into this master plan §3 |
| `IMPLEMENTATION_PLAN.md` (OLD 508-line task-list) | 508 | Replaced by NEW navigational IMPLEMENTATION_PLAN.md created in this commit |
| `CLAUDE_FIX_TASKS.md` | 101 | Tasks migrate into phase backlogs |
| `REMEDIATION_BACKLOG.md` | 37 | Same |
| `GEMINI.md` | 283 | Unused (CLAUDE.md + AGENTS.md sufficient) |

**⚠️ CRITICAL — Phase 13 must distinguish OLD vs NEW IMPLEMENTATION_PLAN.md.** Verify the NEW file exists with a phase status table + hard invariants BEFORE deleting the OLD file. Sequence:
1. Read `IMPLEMENTATION_PLAN.md` — confirm it contains "Phase status" table and "Hard invariants" section
2. If confirmed, OLD file = the one being committed in Phase 13. Delete via `git rm` only after confirmation.
3. Never delete `IMPLEMENTATION_PLAN.md` by filename alone — always content-check first.

### 4.2 Supersede + archive (prior superpowers plans — 3 files, 197 KB)
Move to `docs/superpowers/plans/_archive/` with SUPERSEDED banner at top. Executed in this commit, not Phase 13.
- `2026-04-12-phase3-operations-intelligence.md` (91 KB)
- `2026-04-12-rota-system.md` (92 KB)
- `2026-04-21-master-implementation-directive.md` (14 KB)

### 4.3 Review / migrate (uncertain — decision needed)
- `docs/superpowers/plans/temp-tracker.md` — **open question #1 in `docs/plan-questions.md`**
- `docs/source-maps/work-update-analysis.md` — verify against actual XLSX in Phase 11; rewrite if stale
- `docs/source-maps/historical-seed-coverage.md` — rewrite in Phase 14 to match 35-step ingest
- `apps/docs/content/docs/*.mdx` (19 files) — audit in Phase 13; update or delete per new feature set

### 4.4 Keep
- `README.md`, `CLAUDE.md`, `AGENTS.md`, `CHANGELOG.md`, `PRODUCTION_READINESS_CHECKLIST.md`
- `docs/architecture/*.md`, `docs/decisions/ADR-*.md`
- `NEW` `IMPLEMENTATION_PLAN.md`, `CURRENT_PHASE.md`, `AGENT_LOG.md` (coordination files, created this commit)

### 4.5 Consolidate (Phase 14)
- 11 `scripts/seed-*.ts` → 2 scripts (`seed.ts` bootstrap, `seed-historical.ts` historical ingest)
- 3 deleted scheduling schemas (`rota.ts`, `roster.ts`, `noc-shifts.ts`) → 1 (`scheduling.ts` with sub-tables)

---

## 5. Data Model Changes (Per-Entity Specification)

Each entity below is specified at the column level. Drizzle schemas are NOT written in this plan — they will be authored in the phase that owns the entity. Column types use PostgreSQL conventions; enums are inlined.

### 5.1 People & org (Phase 1)

**`staff` (extend existing `staff_profiles`):**
```
+ phone_number           text
+ cug_phone_number       text
+ cug_sim_number         text
+ mifi_asset_tag         text
+ birthday               date
+ employment_status      enum('active','dormant','on_leave','left')  -- default 'active'
+ hire_date              date
+ contract_end_date      date
+ current_appointment    text  -- job title, e.g. "Assistant ICT Engineer III"
- team_lead_id           -- DROPPED Phase 0
```

**`staff_feedback_prompts` (new, Phase 1):**
```
id          serial PK
topic       text
prompt      text
source_file text  -- 'QuestionsToAskStaff_20240618_v01.txt'
seq         int
```

### 5.2 Access control (Phase 1)

**`service_access_registry` (new):**
```
id              serial PK
staff_id        int FK → staff.id
service_name    enum('ipam','zabbix','esight','ivsneteco','nce_fan','neteco','lte_grafana','generator_grafana','plum','kibana','radius','forticlient','mifi_vpn')
access          boolean  -- has access?
role            text      -- free text role / permission level
access_level    text      -- admin / user / readonly / etc.
notes           text
last_reviewed   timestamptz
unique(staff_id, service_name)
```

**`vpn_groups` (new):**
```
id          serial PK
staff_id    int FK
system      enum('fortigate','mikrotik')
group_name  text  -- e.g. NOCUsers1, CPUsers1, PME_Users1, Deny_VPN_Users
```

**`uportal_accounts` (new):**
```
id              serial PK
staff_id        int FK
account_number  text
dept            text
user_type       text
```

**`biometric_registration` (new):**
```
id               serial PK
staff_id         int FK
system_name      enum('data_centre_fingerprint','liliendaal_door','main_door_server_room')
registered       boolean
registered_at    timestamptz
comments         text
```

**`physical_access_register` (new):**
```
id                           serial PK
staff_id                     int FK
door                         enum('all_doors','main_door_only')
authorized_for_server_room   boolean
comments                     text
```

### 5.3 Appraisals (Phase 4)

**`appraisals` (extend existing):**
```
~ status              enum — collapsed to lowercase in Phase 0 migration 0008
+ submitted_at        timestamptz
+ total_score         int      -- sum of raw ratings (8 categories + 5 responsibilities, each 1-5)
+ max_score           int      -- always 65 (8*5 + 5*5)
+ percentage          numeric(5,2)  -- total_score / max_score * 100
+ increment_pct       int      -- tier 1-5 based on percentage bands
```

**`appraisal_ratings` (new):**
```
id              serial PK
appraisal_id    int FK
kind            enum('category','responsibility')
category        enum('organisational_skills','quality_of_work','dependability','communication','cooperation','initiative','problem_solving','overall_professionalism')  -- nullable if kind='responsibility'
responsibility_seq  int  -- 1-5 if kind='responsibility'
rating          int  -- 1-5
unique(appraisal_id, category) where kind='category'
unique(appraisal_id, responsibility_seq) where kind='responsibility'
```

**`appraisal_responsibilities` (new):**
```
id              serial PK
appraisal_id    int FK
seq             int  -- 1-5
title           text
description     text
unique(appraisal_id, seq)
```

**`appraisal_achievements` (new):**
```
id              serial PK
appraisal_id    int FK
seq             int
text            text
unique(appraisal_id, seq)
```
CHECK constraint: per appraisal, seq count ≥ 3 before `submit`.

**`appraisal_goals` (new):** same shape as `appraisal_achievements`.

**`appraisal_signatures` (new):**
```
id              serial PK
appraisal_id    int FK
role            enum('employee','manager_director','hr_manager','deputy_gm','gm')
signed_by       int FK → staff.id
signed_at       timestamptz
signature_svg   text   -- nullable; if null, rendered as wet-sign placeholder at print time
unique(appraisal_id, role)
```

**`appraisal_feedback` (new — FeedbackFromStaff tab):**
```
id        serial PK
staff_id  int FK
year      int
feedback  text
comment   text
```

**`performance_journal_entries` (new):**
```
id              serial PK
staff_id        int FK
year            int
month           int  -- 1-12
category        enum('tickets_itop','alarms','slack_whatsapp','task_incomplete')
count           int
narrative       text
unique(staff_id, year, month, category)
```

**`commendations` (new):**
```
id          serial PK
staff_id    int FK
year        int
month       int
narrative   text
unique(staff_id, year, month)
```

**`appraisal_tracker_view` (DB VIEW, NOT a table):**
```sql
CREATE VIEW appraisal_tracker_view AS
SELECT
  s.id AS staff_id,
  s.full_name AS name,
  a.percentage,
  concat(extract(year from a.period_start), ' ', ...) AS period,  -- 'Feb2025-Aug2025' etc.
  extract(year from a.period_end) AS year,
  a.status
FROM appraisals a
JOIN staff s ON s.id = a.staff_id
WHERE a.status = 'completed';
```

### 5.4 NOC performance (Phase 5)

**`noc_ticket_activity` (new):**
```
id             serial PK
ticket_id      text         -- 'I-014749', 'P-014734'
type           enum('incident','problem','work_order')
year           int
month          int
action         enum('created','closed')
actor_staff_id int FK
is_duplicate   boolean      default false
notes          text
unique(ticket_id, action)   -- natural key for seed upsert
```

**`noc_monthly_metrics` (new):**
```
id                 serial PK
staff_id           int FK
year               int
month              int
mt                 int   -- ticket non-compliance count
itt_incident       int
itt_problem        int
days_day_shift     int
days_swing_shift   int
days_night_shift   int
noccc              int   -- NOC work orders closed by tech
nct                int   -- total overall
ma                 int   -- alarm monitoring non-compliance
unique(staff_id, year, month)
```

**`employee_of_the_month` (new — COMPUTED, not hand-entered):**
```
id                              serial PK
year                            int
month                           int
overall_best_staff_id           int FK
second_best_staff_id            int FK
most_incident_tickets_staff_id  int FK
most_problem_tickets_staff_id   int FK
most_noc_tickets_closed_staff_id int FK
least_alarm_non_compliance_staff_id int FK
least_ticket_non_compliance_staff_id int FK
computed_at                     timestamptz default now()
unique(year, month)
```
Writes only from `packages/api/src/lib/eom-calculator.ts` (see §10 check 10.4 of the planning handoff and §11 of this plan).

### 5.5 Contracts & lifecycle (Phase 6)

**`contracts` (extend existing):**
```
+ renewal_letter_due_date   date  -- computed: end_date - 3 months
+ appraisal_1_due_date      date  -- computed: renewal_letter_due - 6 months
+ appraisal_2_due_date      date  -- computed: same as renewal_letter_due
+ submitted_to_hr_at        timestamptz
+ renewal_outcome           enum('renewed','not_renewed','left','terminated')
```

**`career_progression_plans` (new):**
```
id              serial PK
staff_id        int FK
target_year     int  -- 2026-2029
planned_role    text
conditions      text
status          enum('pending','achieved','missed')
unique(staff_id, target_year)
```

### 5.6 Leave (Phase 2)

**`leave_types` (modify existing):**
```
-- remove: Compassionate
-- ensure present:
  annual       -- deducts from 28-day allowance, calendar days, no pay impact
  medical      -- M.C. — doesn't deduct, no pay impact
  emergency    -- doesn't deduct, no pay impact
  no_pay       -- doesn't deduct, DEDUCTS pay
  special      -- doesn't deduct, no pay impact
  time_off     -- bank holiday compensation, separate tracker
  work_from_home  -- attendance variant, doesn't deduct
```

**`leave_policies` (extend existing):**
Encode NOC rules from `AnnualLeaveRosterNOC.xlsx`:
- max_concurrent_leavers_per_team: 3
- max_parts: 2  (without HR override)
- annual_allowance_days: 28  -- calendar days
- allow_rollover: false (without HR override)
- blocked_months: `['July','August','November']` (team-configurable)

**`leave_requests` (extend existing):**
```
+ override_reason   text nullable
+ overridden_by     int FK → staff.id nullable
+ violations        jsonb nullable  -- array of violation codes present at submission time
```

**`tosd_records` (new — Time Off / Sick Days register):**
```
id           serial PK
staff_id     int FK
date         date
type         enum('reported_sick','medical','absent','time_off','work_from_home','lateness','callout_legacy')
reason_text  text
days         numeric(4,2)
hours        numeric(4,2)
unique(staff_id, date, type)
```
The `callout_legacy` type preserves historical Callouts rows without reintroducing the deleted feature.

### 5.7 Scheduling (Phase 3 — unified)

**`noc_shifts` (new under `scheduling` module):**
```
id          serial PK
staff_id    int FK
date        date
shift_type  enum('D','S','N','sick','off','al','ml')  -- Day/Swing/Night/sick/off/Annual Leave/Medical Leave
unique(staff_id, date)
```

**`dcs_on_call_weeks` (new):**
```
id                  serial PK
year                int
week_num            int
week_start_date     date
week_end_date       date
lead_engineer_id    int FK → staff.id
asn_support_id      int FK nullable
enterprise_support_id int FK nullable
core_support_id     int FK nullable
notes               text
unique(year, week_num)
```

**`routine_maintenance` (new):**
```
id                 serial PK
year               int
quarter            int  -- 1-4
task_name          text  -- 'Cleaning Server Room', 'Routine Maintenance DCS', 'Test Fire Detection', 'Clean Dust Filters'
assigned_staff_ids int[] -- Postgres array of staff IDs
completion_status  enum('pending','in_progress','complete','deferred')
completion_date    date nullable
completion_notes   text
unique(year, quarter, task_name)
```

**`shift_swaps` (new — NOC):**
```
id               serial PK
requester_id     int FK
original_date    date
target_staff_id  int FK
target_date      date
status           enum('pending','approved','rejected','cancelled')
reason           text
reviewed_by      int FK nullable
reviewed_at      timestamptz nullable
```

**`on_call_swaps` (new — DCS):**
```
id                serial PK
requester_id      int FK
original_week_id  int FK → dcs_on_call_weeks.id
role              enum('lead_engineer','asn_support','enterprise_support','core_support')
target_staff_id   int FK
target_week_id    int FK
status            enum('pending','approved','rejected','cancelled')
reason            text
reviewed_by       int FK nullable
reviewed_at       timestamptz nullable
```

### 5.8 Attendance, lateness, timesheets (Phase 8)

**`attendance_logs` (keep existing)**

**`lateness_records` (extend existing):**
```
current: id, staff_id, year, month, total_time_late, days_late
+ days_missing_from_attendance  int
+ days_on_schedule              int
+ quarter                       int  -- 1-4
+ notes                         text
unique(staff_id, year, month)
```

**`timesheet_documents` (new — index-only, don't parse PDFs):**
```
id             serial PK
staff_id       int FK
year           int
month          int
office         enum('castellani','liliendaal')
filename       text
storage_path   text
uploaded_by    int FK
uploaded_at    timestamptz
unique(staff_id, year, month, office)
```

### 5.9 PPE (Phase 8)

**`ppe_items` (new reference table — 17 canonical items):**
```
id          serial PK
code        text unique
name        text
category    enum('footwear','apparel','electronics','accessories','office')
has_size    boolean default false  -- true for boots
has_asset_tag boolean default false -- true for MiFi, laptops
```
Seed rows: Long Boots, Overalls, Mousepad, Safety Boots, Bag, Screwdriver, DB9-RJ45, DB9-USB, Monitor, HDMI to Monitor, Laptop, MiFi, CUG Phone, CUG Sim, NDMA Shirts, USB To Ethernet, Umbrella.

**`ppe_issuances` (new):**
```
id             serial PK
staff_id       int FK
ppe_item_id    int FK → ppe_items.id
issued_date    date
status         enum('issued','not_issued','n_a','stolen','lost','damaged','returned')
asset_tag      text nullable   -- e.g. 'Yes-2300' for MiFi
size           text nullable   -- e.g. '11', '14' for boots
notes          text
unique(staff_id, ppe_item_id, issued_date)
```

### 5.10 Training (Phase 7)

**`training_plans` (new):**
```
id                    serial PK
year                  int
staff_id              int FK
planned_trainings     jsonb   -- [{trainingArea, targetQuarter, status}]
unique(staff_id, year)
```

**`certification_catalog` (new):**
```
id                serial PK
training_area     text
recommended_cert  text
vendor            text
level             text
```

**`exam_schedule` (new):**
```
id               serial PK
staff_id         int FK
certification    text
window_start     date
window_end       date
booked_date      date nullable
status           enum('pending','booked','complete_pass','complete_fail','missed','will_write','cancelled')
voucher_id       int FK → exam_vouchers.id nullable
```

**`exam_vouchers` (new):**
```
id                serial PK
voucher_number    text unique
product_name      text
must_be_used_by   date
date_booked       date nullable
assigned_staff_id int FK nullable
status            enum('unused','assigned','booked','complete_pass','complete_fail','missed','expired')
```

**`training_events` (new):**
```
id                  serial PK
institution         text
description         text
start_date          date
end_date            date
duration            text
location            text
travelling_cost     numeric(10,2)
course_cost         numeric(10,2)
meals_cost          numeric(10,2)
accommodation_cost  numeric(10,2)
total_cost          numeric(10,2)
justification       text
results             text
```

**`training_event_participants` (new):**
```
id                serial PK
training_event_id int FK
staff_id          int FK
gender            enum('M','F','other','prefer_not_to_say')
status            enum('attended','cancelled','missed','waitlisted')
unique(training_event_id, staff_id)
```

**`in_house_training_log` (new):**
```
id                     serial PK
staff_id               int FK
training_name          text
date                   date
assessment_completed   boolean default false
notes                  text
```

**`training_syllabi` (new):**
```
id               serial PK
syllabus_name    enum('noc_onboarding','intern_onboarding','dcs_onboarding')
week             int
day              text
activity         text
trainer          text
resources        text
outcomes         text
remarks          text
```

**`assessment_questions` (new):**
```
id           serial PK
topic        enum('about_ndma','administrative','backhaul','fibre','lte','monitoring_platform','troubleshooting','itop')
question     text
answer       text
source_file  text
```

### 5.11 Onboarding (Phase 7)

**`onboarding_task_templates` (new):**
```
id                  serial PK
task_name           text
responsible_dept    text  -- 'HR', 'Cloud', 'ASN', 'Admin', 'Help Desk', 'Ataybia'
seq                 int
```
Seed rows (8): Laptop request (HR), AD Login (Cloud), Email Creation (Cloud), DCS or NOC Platform login credentials (ASN), Badge (HR), PPE (Ataybia), Biometric Access (Admin), MiFi Request (Help Desk Thru DGM Ops).

**`onboarding_tasks` (extend existing):**
```
+ template_id  int FK → onboarding_task_templates.id nullable
```

### 5.12 Company / policy / calendar (Phase 9-10)

**`company_policies` (keep existing)**

**`company_forms` (new):**
```
id           serial PK
form_name    text
category     enum('leave','procurement','training','hr','other')
storage_path text
published_at timestamptz
published_by int FK
```

**`calendar_events` (extend existing):**
```
+ event_type  enum('birthday','public_holiday','training','exam','contract_renewal','appraisal_due','appraisal_followup','ppe_review','routine_maintenance','server_room_cleaning','custom')
```

### 5.13 Work register (Phase 11)

**`work_items` (extend existing):**
```
+ year              int NOT NULL
+ period            text NOT NULL  -- 'week_0301','week_1001','routine','temporary','current','other_dept'
+ week_start_date   date nullable
composite index on (year, period, assigned_engineer_id)
```

**`work_item_periods` (new reference table):**
```
id          serial PK
year        int
period      text
description text  -- human-friendly, e.g. 'Week of 2024-01-08 to 2024-01-14'
unique(year, period)
```

---

## 6. Feature Specifications (Expanded)

### 6.1 Work register period/year model (Phase 11)

Every workItem stores `(year, period)`. Migration steps:
1. Add nullable `year` + `period` + `week_start_date` to `work_items`
2. Backfill: existing rows default to `year=2024`, `period='current'` (best guess from `WorkUpdate_20240118_v01.xlsx`)
3. Make `year` + `period` NOT NULL
4. Add composite index `(year, period, assigned_engineer_id)`
5. Work router: extend `list({ year, period, engineerId, ... })` + new `listWeeks({ year })`

**UI (work page):**
- Top filter bar pills: `[Year: 2026 ▾] [Week 1801 | Week 2501 | Routine | Temporary | Current | Other Dept | All]`
- Engineer column has AutoFilter-style multi-select dropdown (parity with XLSX)
- Kanban view groups by period (columns) with engineer-colored cards
- Workload view aggregates `(engineerId, year, period)` into heatmap

### 6.2 Leave policies & calculations (Phase 2)

Calendar-day rule: `days = end_date - start_date + 1` (matches `AnnualLeaveRosterNOC.xlsx`). Weekends + public holidays count for Annual leave.

Leave type matrix:
| Type | Deducts 28-day allowance? | Deducts pay? | Requires doc? |
|---|---|---|---|
| Annual | YES | NO | NO |
| M.C. | NO | NO | YES (medical cert) |
| Emergency | NO | NO | NO |
| No Pay | NO | YES | NO |
| Special | NO | NO | Discretionary |
| Time Off | NO (separate) | NO | NO |
| Work From Home | NO | NO | NO |

Policy engine `validateLeaveRequest()` returns:
```typescript
{ status: 'ok' | 'warning' | 'blocked', violations: string[] }
```
- `warning` → staff can submit; approver sees red banner + must fill `override_reason` to approve
- `blocked` → hard error (start>end, unknown leave type, balance cap exceeded)
- Every approval-with-override creates an audit log entry: `action='leave.override'`, violations as `beforeValue`

Calendar view: team availability heatmap, concurrent-leavers counter, blocked-month shading.

### 6.3 Scheduling unification (Phase 3)

Two modes, one planner UI.

**NOC Shifts (24/7):**
- Monthly grid (Day × Staff) — cells: D/S/N/sick/off/AL/ML
- Click cell to edit; drag to fill; bulk-assign by role
- Swap workflow: requester picks their shift + target; system checks no-double-booking + no consecutive N→D
- Import: parse `{Month}_{year}*.xlsx` day columns 1-31
- "My Shifts" view filtered to caller

**DCS On-Call (weekly):**
- Weekly view with 4 columns: Week/Dates | Lead Engineer | ASN Support | Enterprise Support | CORE Support
- Edit per week (manager+ only)
- Fairness view: YTD weeks per engineer per role; flag imbalance (>2σ)
- "My On-Call" view
- Quarterly routine maintenance grid displayed above weekly grid

**Shared:**
- Team filter (NOC / DCS / All)
- iCal export per person (`.ics` download + subscribe URL)
- Leave overlay: if someone's on leave during on-call week, flag red

**Cutover gate (from §10.3 of this plan):** `scheduling.*` runs parallel to old `rota.*` + `roster.*` + `noc-shifts.*` for 7 days. Cutover = delete old routers + routes + schemas, gated on:
- Zero 5xx errors in `scheduling.*` for 7 consecutive days (metric from observability dashboard)
- Zero open bugs tagged `scheduling-regression`

### 6.4 Appraisal UI (Phase 4)

Mirror the XLSX section-for-section:

1. **Header:** Employee Name, Job Title, Supervisor, Department (Data Centre Services), Location (Liliendaal), Evaluation Period From/To, Type of Review
2. **Rating Scale reference:** Excellent(5), Good(4), Acceptable(3), Needs Improvement(2), Unsatisfactory(1) with definitions
3. **Section 1 – 8 Fixed Categories:** each rated 1-5 via radio group
4. **Section 2 – 5 Core Responsibilities:** custom per role, description + rating
5. **Achievements:** min 3, free text (enforced before submit)
6. **Goals:** min 3, free text (enforced before submit)
7. **Score box (auto-computed):** `Total / 65 → Percentage → Increment %` (tiers: ≤60→1%, 61-70→2%, 71-80→3%, 81-90→4%, 91-100→5%)
8. **Signatures:** Employee, Manager/Director (Sachin), HR Manager, Deputy GM (Orson), GM (Christopher Deen) — digital + wet-sign placeholder support

**Supporting views:**
- Team Scoring Dashboard: per sub-dept, avg score trend, overdue list, <70% list
- Per-staff History: all appraisals ever, sparkline, vs team avg
- Appraisal Tracker (auto-generated from `appraisal_tracker_view`): filter by year, dept, person
- Feedback from Staff tab: CRUD `appraisal_feedback`

### 6.5 Self-service scope (Phase 9)

Every staff member's profile page shows everything related to them (see handoff §11 for full list). RBAC rules:
- Staff → self only
- Team Lead → self + direct reports
- Sub-dept Manager (Gerard/Nicolai/etc.) → self + team + direct reports
- Sachin / Ataybia → all DCS + NOC staff
- HR / DGM / GM → scope via `scope.ts` helpers

All fields editable by self: personal email, phone, CUG phone, CUG SIM, MiFi asset tag, emergency contact. Each edit writes audit log.

### 6.6 Notifications & auto-reminders (Phase 10)

15 triggers (full list in handoff §12). Channels: in-app bell (exists), email, optional Slack/WhatsApp webhook (open question #5). Reminder engine fires as cron or DB-polling job; uses `createNotification()` (`packages/api/src/lib/notify.ts`).

---

## 7. CSV Import Template Specs (Phase 12)

30+ templates published at `apps/web/public/import-templates/`. Each has both `.csv` (headers only) and `.example.csv` (headers + 2-3 sample rows). Full column list in handoff §13. Key templates:

| Template | Column headers |
|---|---|
| `staff.csv` | `ser_no, name, department, sub_department, current_appointment, employment_status, username, email, phone_number, cug_phone_number, cug_sim_number, birthday, hire_date, contract_end_date, reports_to_name` |
| `access_services.csv` | 27 columns — 13 services × (access, role) + `staff_name` |
| `access_vpn_mikrotik.csv` | `staff_name, employment_status, username, mikrotik_vpn_groups` |
| `access_physical_doors.csv` | `staff_name, department, door_scope, authorized_for_server_room, comments` |
| `appraisals.csv` | `staff_name, period_start, period_end, percentage, status, submitted_at` |
| `appraisal_ratings.csv` | `staff_name, period_start, period_end, category_or_responsibility, kind, rating_1_to_5` |
| `noc_monthly_metrics.csv` | `staff_name, year, month, mt, itt_incident, itt_problem, days_day, days_swing, days_night, nccc, nct, ma` |
| `tosd_records.csv` | `staff_name, date, type, reason, days, hours` |
| `ppe_issuances.csv` | `staff_name, item_name, issued_date, status, asset_tag, notes` |
| `work_items.csv` | `year, period, task, priority, date_assigned, details, update, deadline_or_overdue, engineer_name, itop_or_trello_or_teams` |

Each importer:
- Validates headers (reject extra / missing)
- Validates values (enums, date formats, staff name lookup)
- Preview shows pass/fail per row
- Dry-run mode
- Logs to `imports` table on commit

Full 32-template list in handoff §13.

---

## 8. Phase Plan with Acceptance Criteria

### Phase 0 — Stabilise & delete
**Branch:** `phase/0-stabilise` → merge to `main`
**Acceptance criteria:**
- [ ] Pre-flight check (§2.5) passes
- [ ] Schema reconciliation decisions recorded for all 11 extra schemas (§3.5)
- [ ] Migrations 0008, 0009, 0010, 0011 applied cleanly in staging + prod
- [ ] `appraisalStatusEnum` contains only lowercase values; no existing rows lost
- [ ] `callouts` + `attendance_exceptions` tables dropped; legacy rows migrated to `tosd_records` with `type='callout_legacy'`
- [ ] `staff.team_lead_id` column dropped; `reports_to` is sole source of truth
- [ ] `departments.parent_id` has FK constraint (raw SQL in 0011)
- [ ] Sidebar: `/hr/callouts` + `/hr/attendance` + `/hr/ppe` dup removed; Scheduling group created (placeholder)
- [ ] `hr/callouts.tsx` + `hr/attendance.tsx` route files deleted
- [ ] `bun run check-types` passes; `cd apps/web && bun run test:e2e` passes
- [ ] Appraisal list UI still renders all existing rows post-migration

### Phase 1 — People & access registry
**Branch:** `phase/1-people-access`
**Acceptance:**
- [ ] `staff` has phone_number, cug_*, mifi_asset_tag, birthday, employment_status, hire_date, contract_end_date, current_appointment
- [ ] `service_access_registry` seeded with 281 staff × 13 services (from `AccountManagementMarch_20260312.xlsx`)
- [ ] `vpn_groups` has Fortigate + MikroTik group memberships
- [ ] `uportal_accounts` populated
- [ ] `biometric_registration` + `physical_access_register` populated
- [ ] Staff directory UI shows phone number
- [ ] Access page lists every staff × every service with filter
- [ ] RBAC matrix updated: access registry rows require `access:read`, mutations require `access:write`

### Phase 2 — Leave refactor
**Branch:** `phase/2-leave`
**Acceptance:**
- [ ] Leave types updated: Compassionate removed; Emergency, No Pay, Special added
- [ ] Calendar-day calculation (`end-start+1`) verified against 20 historical samples
- [ ] Policy engine returns `{status, violations}` with correct codes for: 3-concurrent, 1-or-2 parts, blocked-month, rollover
- [ ] Override flow: warning submission creates `violations` array; approval requires `override_reason`; audit log captures override
- [ ] Calendar view shows team availability + concurrent-leavers indicator + blocked-month shading

### Phase 3 — Scheduling unification
**Branch:** `phase/3-scheduling`
**Acceptance:**
- [ ] `scheduling.*` router + schema live in parallel to old routers
- [ ] NOC monthly grid: click-edit + drag-fill + swap workflow end-to-end
- [ ] DCS weekly grid: 4-role edit + fairness visualization + "My On-Call"
- [ ] Routine maintenance quarterly grid above weekly view
- [ ] iCal export verified (staff subscribes in Google Calendar, events appear)
- [ ] **Cutover gate:** 7 consecutive days zero 5xx + zero open regressions BEFORE old routers deleted
- [ ] Post-cutover: `rota.ts`, `roster.ts`, `noc-shifts.ts` schemas + routers + routes deleted

### Phase 4 — Appraisal system
**Branch:** `phase/4-appraisals`
**Acceptance:**
- [ ] Form mirrors XLSX section-for-section (visual diff test against rendered template)
- [ ] Score auto-computes correctly for 10 random historical appraisals
- [ ] Increment tier assigns correctly across boundary values (60, 61, 70, 71, 80, 81, 90, 91, 100)
- [ ] `appraisal_tracker_view` returns rows with correct shape (staff_name, percentage, period, year)
- [ ] Team dashboard renders; per-staff history sparkline renders
- [ ] Signature block saves digital SVG; wet-sign placeholder rendered when SVG null
- [ ] Completing appraisal (status → 'completed') makes row appear in `appraisal_tracker_view` within 1 query refresh
- [ ] Min 3 achievements + 3 goals enforced before submit
- [ ] `appraisal_feedback` tab CRUD working

### Phase 5 — NOC performance
**Branch:** `phase/5-noc-perf`
**Acceptance:**
- [ ] `noc_monthly_metrics` populated for 19 historical months (via seed step 12)
- [ ] `noc_ticket_activity` populated from ticket-level log
- [ ] `eom-calculator.ts` computes all 5 formulas; unit tests cover boundary cases
- [ ] **Validation gate:** all 19 historical months — computed `overall_best` matches recorded "Overall Best Technician" label in XLSX. 19/19 required.
- [ ] Performance journal per-person view displays correctly
- [ ] Commendations journal CRUD working
- [ ] RBAC: NOC staff can see own metrics; supervisors see team; Ataybia+Sachin see all

### Phase 6 — Contracts lifecycle
**Branch:** `phase/6-contracts`
**Acceptance:**
- [ ] Contract end date triggers auto-generate 6 scheduled reminders (90/60/30/14/7/1 day) + appraisal_1/_2 dates + follow-ups
- [ ] Promotion letter generator: fill docx template → PDF for HR (3 sample staff tested)
- [ ] `career_progression_plans` seeded from `ContractEndDates_NOC.xlsx > Plan`

### Phase 7 — Training
**Branch:** `phase/7-training`
**Acceptance:**
- [ ] Training plan matrix shows (team × staff × training areas) for 2026-2027
- [ ] In-house training log CRUD
- [ ] Exam voucher expiry fires "must-be-used-by" reminder at 30/14/7 days
- [ ] Training events form captures cost breakdown; total auto-sums
- [ ] New hire onboarding auto-creates 8 tasks from template
- [ ] Certification catalog visible to staff

### Phase 8 — PPE, lateness, timesheets, TOSD
**Branch:** `phase/8-ppe-lateness-tosd`
**Acceptance:**
- [ ] PPE matrix mirrors `PPE&IndividualTools_20240726_v01.xlsx` (17 items × staff + sizes + asset tags)
- [ ] Lateness quarterly grid matches `LatenessReportNOC&DC_2025_v01.xlsx` for Q1 2025
- [ ] TOSD register supports all 7 types; historical callout_legacy rows accessible
- [ ] Timesheet documents indexed (not parsed); filterable by (year, month, office)

### Phase 9 — Self-service + policies + forms
**Branch:** `phase/9-self-service`
**Acceptance:**
- [ ] "My Everything" page renders all 15 sections for caller's own data
- [ ] Team Lead view shows direct reports only
- [ ] Sachin / Ataybia see all DCS + NOC
- [ ] Profile editor (phone, CUG, emergency contact) writes audit log
- [ ] Policies > Documents (PDFs upload)
- [ ] Policies > Forms (download catalog)
- [ ] Policies > My Profile (self-service edit)

### Phase 10 — Notifications & calendar
**Branch:** `phase/10-notifications`
**Acceptance:**
- [ ] All 15 triggers firing correctly (tested with fixture data)
- [ ] Contract expiry 90/60/30/14/7/1 reminders: end-to-end verified
- [ ] Birthdays auto-populate calendar (from `staff.birthday`)
- [ ] Public holidays render on calendar
- [ ] (Optional) Slack/WhatsApp webhook — pending open question #5

### Phase 11 — Work register refactor
**Branch:** `phase/11-work-refactor`
**Acceptance:**
- [ ] `work_items.year` + `period` + `week_start_date` added (nullable), backfilled, made NOT NULL
- [ ] Composite index `(year, period, assigned_engineer_id)` present
- [ ] Filter pills work: Year / Week / Routine / Temporary / Current / Other Dept / All
- [ ] Engineer multi-select filter parity with XLSX AutoFilter
- [ ] Workload view aggregates by `(engineer, year, period)`
- [ ] `WorkUpdate_20240118_v01.xlsx` 24 sheets roundtrip cleanly (seed imports → UI reflects → CSV export matches)

### Phase 12 — Import module
**Branch:** `phase/12-import`
**Acceptance:**
- [ ] 30+ CSV templates in `apps/web/public/import-templates/`
- [ ] Each has both header-only + example-rows variants
- [ ] Per-entity importer: header validation + row-level preview + dry-run + commit
- [ ] Import history persisted in `imports` table
- [ ] Ataybia test: export from `AnnualLeaveRosterNOC.xlsx` → map to CSV → import → UI reflects 0 manual fixes

### Phase 13 — Obsolete-docs cleanup
**Branch:** `phase/13-cleanup`
**Acceptance:**
- [ ] Old files deleted per §4.1 (5 files)
- [ ] `IMPLEMENTATION_PLAN.md` content-check: contains "Phase status" + "Hard invariants" sections BEFORE OLD deleted
- [ ] 3 superseded plans already archived in this commit (no-op in Phase 13)
- [ ] `docs/cleanup-log.md` populated with deleted / archived / rewritten entries + git SHAs
- [ ] 19 Fumadocs MDX files audited; each either updated or marked for deletion

### Phase 14 — Final historical seed
**Branch:** `phase/14-seed`
**Acceptance:**
- [ ] `seed-historical.ts` implements all 35 ingest steps (§9 of this plan)
- [ ] Every step uses upsert-by-natural-key (no `INSERT` outside bootstrap)
- [ ] `--dry-run` flag: parses everything, writes nothing, completes <2 min
- [ ] Dry-run passes with zero errors + row-count estimates within expected ranges BEFORE staging run
- [ ] Staging run succeeds; `docs/seed-report.md` + `.json` generated
- [ ] 19-month EoM validation: 19/19 match recorded "Overall Best Technician" labels
- [ ] Spot-checks: 3 random appraisals match cell-for-cell against XLSX
- [ ] Production run; CI gate asserts `gateAssertions` pass

### Phase 15 — Hardening
**Branch:** `phase/15-hardening`
**Acceptance:**
- [ ] E2E tests cover every new feature end-to-end
- [ ] Perf audit: scheduling grid renders <200ms for 50 staff × 31 days; appraisal form <150ms
- [ ] RBAC matrix: 100% coverage (every (router, procedure) × every role has a cell)
- [ ] Accessibility: axe-core passes on all new pages; keyboard navigation verified
- [ ] `PRODUCTION_READINESS_CHECKLIST.md` green across the board

---

## 9. Final Seed Plan (`seed-historical.ts`)

35 idempotent ingest steps. Runs ONCE at end of build with `--dry-run` first. All steps use `ON CONFLICT DO UPDATE` against natural keys (see §10.2 of planning handoff for key table).

| Step | Entity | Natural key | Source file | Est. rows |
|---|---|---|---|---|
| 1 | departments + sub-departments | name | canonical list §1 of handoff | ~15 |
| 2 | staff | (name, hire_date) | `AccountManagementMarch_20260312.xlsx > Employee Data` | 281 |
| 3 | service_access_registry | (staff_id, service_name) | `AccountManagement > Services` | 281 × 13 = 3,653 |
| 4 | vpn_groups + uportal + biometric + physical | (staff_id, system) | `AccountManagement` sheets + `LiliendaalStaffBiometricAccessControl` | ~800 |
| 5 | contracts | (staff_id, end_date) | `ContractEndDates_DCS` + `_NOC` Contract Renewal | ~50 |
| 6 | appraisals (historical) | (staff_id, period_start, period_end) | `DCS/appraisals/{2021..2026}/` + `NOC/appraisals/Appraisals {2022..2026}/` | ~130 |
| 7 | appraisal_ratings | (appraisal_id, category) or (appraisal_id, responsibility_seq) | **Same files — raw X-position parser, NOT formula** | ~130 × 13 = 1,690 |
| 8 | appraisal_achievements / _goals | (appraisal_id, seq) | Same files | ~130 × 3 = 390 each |
| 9 | appraisal_feedback | (staff_id, year) + hash | `APPRAISAL TRACKER DCS > FeedbackFromStaff` | ~100 |
| 10 | performance_journal_entries | (staff_id, year, month, category) | `StaffPerformanceJournal_20230731_v01.xlsx` | ~12 × 4 × 12 × 4 = 2,304 |
| 11 | commendations | (staff_id, year, month) | `StaffCommendationJournal_20231216_v01.xlsx` | ~250 |
| 12 | staff_promotions | (staff_id, promoted_at) | `NOC/appraisals/Promotion Letter/` | ~7 |
| 13 | career_progression_plans | (staff_id, target_year) | `ContractEndDates_NOC > Plan` | ~40 |
| 14 | noc_monthly_metrics | (staff_id, year, month) | `EmployeeOfTheMonth_20240923_v01.xlsx` (19 sheets) | 19 × ~11 = 209 |
| 15 | noc_ticket_activity | (ticket_id, action) | `IncidentProblem_CreatedandClose_20252905.xlsx` (24 sheets) | ~5,000 |
| 16 | employee_of_the_month | (year, month) | **Computed by `eom-calculator.ts` — validate against XLSX labels** | 19 |
| 17 | noc_shifts | (staff_id, date) | `NOC/shift-schedule/{Jan..Apr}_2026*.xlsx` | 4 × ~11 × 31 = 1,364 |
| 18 | dcs_on_call_weeks | (year, week_num) | `PlannedOnCallRoster_20230123 (1).xlsx` (4 years) | 4 × 52 = 208 |
| 19 | routine_maintenance | (year, quarter, task_name) | 2026 sheet top quarterly table | 4 × ~4 = 16 |
| 20 | leave_requests (2026 NOC) | (staff_id, start_date, end_date) | `AnnualLeaveRosterNOC.xlsx > 2026` | ~50 |
| 21 | tosd_records | (staff_id, date, type) | `TimeOffSickDays_20251010_v01.xlsx` 5 yearly + 2023-Callout legacy | ~2,000 |
| 22 | lateness_records | (staff_id, year, month) | `LatenessReportNOC&DC_2025_v01.xlsx` (2025 + 2026) | ~24 × 11 = 264 |
| 23 | ppe_items | code | Seed reference — 17 canonical | 17 |
| 24 | ppe_issuances | (staff_id, ppe_item_id, issued_date) | `PPE&IndividualTools_20240726_v01.xlsx` | ~280 × 17 = subset actually issued |
| 25 | training_plans | (staff_id, year) | `TrainingSchedule2026_2027.xlsx` | ~30 |
| 26 | certification_catalog | (training_area, recommended_cert) | `TrainingSchedule2026_2027 > Certs` | ~20 |
| 27 | in_house_training_log | (staff_id, training_name, date) | `TrainingLog_20260211_v01.xlsx` | ~10 |
| 28 | exam_schedule | (staff_id, certification, window_start) | `Exam Dates.xlsx` | ~20 |
| 29 | exam_vouchers | voucher_number | `NDMA EXAM VOUCHER.xlsx` | ~15 |
| 30 | training_events | (institution, start_date, description) | `TrainingDocumentationForm_2026 1.xlsx` | ~5 |
| 31 | training_event_participants | (training_event_id, staff_id) | Same | ~50 |
| 32 | training_syllabi | (syllabus_name, week, day) | `NOCTrainingProgramSyllabus` + `InternsTraining` | ~50 |
| 33 | assessment_questions | hash(question) | `NOC/training/Assessments Questions/` (8 docx) | ~100 |
| 34 | onboarding_task_templates | task_name | `Onboarding Checklist.xlsx` | 8 |
| 35 | work_items | (year, period, engineer_id, task_hash) | `WorkUpdate_20240118_v01.xlsx` (24 sheets) | ~500 |

### Seed observability (three outputs)
1. **stdout JSON lines:** `{"step":5,"entity":"appraisals","upserted":127,"skipped":3,"errors":0,"warnings":[...],"durationMs":4821}`
2. **`docs/seed-report.md`:** human-readable table per step + aggregate
3. **`docs/seed-report.json`:** machine-readable with `gateAssertions` block for CI

### Phase 14 CI gate
```bash
cat docs/seed-report.json | jq -e '.gateAssertions["appraisalTrackerView.rowCount"] >= 130'
cat docs/seed-report.json | jq -e '.gateAssertions["employeeOfTheMonth.matchRate"] == "19/19"'
cat docs/seed-report.json | jq -e '.gateAssertions["staff.rowCount"] == 281'
cat docs/seed-report.json | jq -e '.gateAssertions["serviceAccessRegistry.rowCount"] >= 3000'
```

### Key parser notes

**Appraisal ratings (step 7 — CRITICAL):** For each of 8 categories + 5 responsibilities, scan cells B{row}..F{row} for a non-blank marker. Column index (B=5, C=4, D=3, E=2, F=1) IS the rating. **Do NOT read the computed column G** — openpyxl returns the formula string, not the value. If multiple columns contain markers, log warning and use highest. If none, log warning and skip row.

**EoM labels (step 16):** Compute via `eom-calculator.ts`, then compare computed `overall_best_staff_id` against the XLSX's recorded "Overall Best Technician" label string → resolve to staff_id via name match. All 19 must match; any mismatch blocks the seed.

**Legacy callouts (step 21):** From `TimeOffSickDays_20251010_v01.xlsx > 2023-Callout` sheet (different column shape from TOSD sheets). Map to `tosd_records` with `type='callout_legacy'`. This preserves historical rows even though live Callouts feature was deleted in Phase 0.

---

## 10. Risk Register

| # | Risk | Impact | Likelihood | Owner | Mitigation | Trigger |
|---|---|---|---|---|---|---|
| 1 | `appraisalStatusEnum` migration corrupts appraisal data | High | Low | Phase 0 lead | Pre-migration snapshot of `appraisals` table; `CASE WHEN` maps both casings; post-migration row count verification | Monitored during 0008 apply |
| 2 | 35-step seed too slow for 281 staff | Medium | Medium | Phase 14 lead | Batch in txns of 500; progress bar; resumable from last successful step | Step duration > 10 min |
| 3 | XLSX template variants across years break parser | Medium | High | Phase 14 lead | Version-detect by cell layout; maintain v1 + v2 parser branches | Warning count > 5 in dry-run |
| 4 | Deleting Callouts orphans historical data | Low | Low | Phase 0 lead | Step 21 migrates legacy callouts → `tosd_records` with `type='callout_legacy'` | Post-delete count check |
| 5 | Rota+roster+noc-shifts merge breaks production | High | Medium | Phase 3 lead | Shadow mode for 7 days; metric-gated cutover (zero 5xx + zero regression bugs) | Any 5xx spike resets 7-day counter |
| 6 | Kareem's spec drifts mid-execution | Medium | High | Every phase | Each phase starts with 15-min spec review; questions tracked in `docs/plan-questions.md`; escalation protocol in §11 of IMPLEMENTATION_PLAN.md | New requirement not in master plan |
| 7 | Leave policy rule conflicts with legitimate edge case | Medium | High | Phase 2 lead | Warnings-with-HR-override; audit log every override | HR override rate > 10% |
| 8 | Birthday data missing for many staff | Low | High | Phase 1 lead | Birthday is optional field; skip reminder if null | Null rate monitored |
| 9 | Signature drawing not supported on old browsers | Low | Medium | Phase 4 lead | Fallback: typed name + checkbox acknowledgement | Browser compatibility test |
| 10 | RBAC predicate missed on new router procedure | High | Medium | Every phase | RBAC matrix test blocks PR merge if procedure missing | CI red on every PR |
| 11 | Seed dry-run not run before staging | High | Low | Phase 14 lead | Hard gate in CI: staging run refuses to start if last dry-run report older than commit SHA | Gate enforced |
| 12 | Schema reconciliation deferred to execution (extra 11 schemas) | Medium | Medium | Phase 0 lead | Step 1 of Phase 0 is explicit per-schema decision; documented in `CURRENT_PHASE.md` | Phase 0 can't complete without |

---

## 11. Multi-Agent Coordination Protocol

Multiple agents (Claude Code sessions, Codex, human contributors) will work this repo across 15 phases. Coordination files at repo root prevent drift.

### 11.1 Files
- `IMPLEMENTATION_PLAN.md` — nav entry point + phase status table + hard invariants + protocols
- `CURRENT_PHASE.md` — one-screen "who's doing what right now"
- `AGENT_LOG.md` — per-phase append-only work log
- `CHANGELOG.md` — user-facing changes (append per phase)
- `docs/plan-questions.md` — open questions for Kareem
- `docs/superpowers/plans/phase-{N}-{slug}.md` — per-phase checklist (created at phase start)

### 11.2 Hard invariants
See `IMPLEMENTATION_PLAN.md` §"Hard invariants" for the 10 invariants.

### 11.3 Starting / ending / blocked / escalation protocols
See `IMPLEMENTATION_PLAN.md` §§ starting, ending, blocked, escalation.

---

## 12. Cleanup Log (populated during execution)

Empty at plan approval. Phase 13 populates with deleted / archived / rewritten entries + git SHAs.

See `docs/cleanup-log.md` (created by Phase 13).

---

*End of master plan. When in doubt, re-read the source of truth — never the summary.*
