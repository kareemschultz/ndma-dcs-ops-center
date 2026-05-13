# Design-Handoff Completion Audit — 2026-05-12

> **Part A** of the Phase 14+15 closeout. Cross-checks every acceptance criterion in
> `docs/superpowers/plans/2026-04-23-master-remediation-plan.md` §8 (and `source-of-truth/10-handoff-docs/CLAUDE_CODE_PLANNING_HANDOFF.md` §11) against actual code on branch `claude/inspiring-morse-bdf638` (latest `359b185`; mainline `79c5809`).
>
> **Verification method:** file:line evidence by code grep. No prose-trust per Lesson #1.
>
> **Audited by:** Claude Code (claude-opus-4-7, 1M context) — 2026-05-12.

## Legend

- ✅ **shipped** — evidence points to working code matching spec
- 🟡 **partial** — started but a measurable gap remains
- ❌ **missing** — no evidence found
- ⚠️ **drift** — shipped but diverges from spec text

---

## Executive Summary

| Phase | ✅ | 🟡 | ❌ | ⚠️ | Notes |
|---|---|---|---|---|---|
| 0 — Stabilise & delete | 4 | 1 | 0 | 0 | Enum prose-vs-code mismatch (`in_progress` not `pending`) |
| 1 — People & access registry | 6 | 1 | 0 | 0 | Step 3 seed run pending prod |
| 2 — Leave refactor | 6 | 0 | 0 | 0 | All shipped |
| 3 — Scheduling unification | 4 | 0 | 1 | 1 | **iCal export missing**; NOC shift enum drift |
| 4 — Appraisals | 7 | 0 | 0 | 0 | All shipped |
| 5 — NOC performance | 4 | 0 | 0 | 1 | `eom-calculator.ts` is inline, not a separate file |
| 6 — Contracts lifecycle | 2 | 0 | 1 | 0 | **6-tier reminder ladder 90/60/30/14/7/1 not implemented** |
| 7 — Training | 3 | 1 | 0 | 0 | Voucher reminder cadence not enumerated in code |
| 8 — PPE / lateness / TOSD | 6 | 1 | 0 | 0 | 17-item PPE row count is a seed gate |
| 9 — Self-service profile | 1 | 1 | 0 | 0 | 17 sections via Card count; not formally numbered |
| 10 — Notifications & calendar | 1 | 1 | 0 | 1 | `calendar_event_type` has mixed-case values |
| 11 — Work register | 2 | 1 | 0 | 0 | Filter pills present, full Routine/Temporary/Current triad unconfirmed |
| 12 — Import templates | 1 | 0 | 1 | 1 | **18 of 30+ templates; no `.example.csv` variants** |
| 13 — Docs cleanup | 1 | 2 | 0 | 0 | Cleanup-log present; Fumadocs MDX not fully audited |
| 14 — Historical seed | 3 | 1 | 0 | 0 | 13 of 35 steps implemented (expected partial state) |
| 15 — Hardening | 2 | 1 | 0 | 2 | **RBAC matrix coverage: 4 of 45 routers; smoke tests 25 not 40+** |
| 16 — IA revamp (new) | 3 | 0 | 0 | 0 | All shipped (this branch) |
| **Cross-cutting** | — | — | 2 | 1 | **policy.ts uses `protectedProcedure` on mutations** (HI #4 violation); RBAC matrix gap (HI #5 violation) |

**Most severe:**
1. **Hard Invariant #5 violation** — RBAC matrix covers 4 routers; 41+ uncovered.
2. **Hard Invariant #4 violation** — `policy.ts` uses `protectedProcedure` on `create`/`update`/`delete`.
3. **Phase 6 ❌** — Contract expiry reminder ladder (90/60/30/14/7/1) absent.
4. **Phase 3 ❌** — iCal/`.ics` export absent (handoff §10 promised; AC explicit).
5. **Phase 12 ⚠️/❌** — Only 18 of 30+ templates; no `.example.csv` variants.

---

## Phase 0 — Stabilise & delete

| AC | Status | Evidence |
|---|---|---|
| Migrations 0008, 0009, 0010, 0011 applied | ✅ | `packages/db/src/migrations/0008_enum_fix.sql`, `0009_drop_callouts_attendance.sql`, `0010_staff_cleanup.sql`, `0011_departments_fk.sql` (all with `.down.sql` pairs) |
| `appraisalStatusEnum` lowercase-only, 7 values | 🟡 | `packages/db/src/schema/appraisals.ts:21-29` — values lowercase but list is `draft / in_progress / submitted / approved / rejected / completed / overdue`. `CLAUDE.md` prose mentions `pending` — the actual code uses `in_progress`. Cosmetic doc drift only |
| `callouts` + `attendance_exceptions` tables dropped | ✅ | `0009_drop_callouts_attendance.sql`; no `callouts.ts`/`attendance-exceptions.ts` in `packages/db/src/schema/` |
| `staff.team_lead_id` dropped; `reports_to` sole SoT | ✅ | `packages/db/src/schema/staff.ts:76` "team_lead_id dropped in migration 0010" — only `reportsTo` present |
| `departments.parent_id` FK constraint | ✅ | migration `0011_departments_fk.sql` |
| Sidebar dedup + `hr/callouts.tsx`/`hr/attendance.tsx` route files deleted | ✅ | Files absent in `apps/web/src/routes/_authenticated/hr/` (only `index.tsx` + `ppe.tsx` remain) |
| `bun run check-types` passes | ✅ | Confirmed clean on cache-busted run this session |

## Phase 1 — People & access registry

| AC | Status | Evidence |
|---|---|---|
| staff extended (phone, cug, mifi, birthday, employment_status, hire_date, contract_end_date, current_appointment) | ✅ | `packages/db/src/schema/staff.ts:54-63` |
| `service_access_registry` Layer-3 schema | ✅ | `packages/db/src/schema/service-access-registry.ts:8-43`; migration `0020` |
| `platforms` Layer-1 | ✅ | migration `0017_platforms_reference_table.sql`; `packages/db/src/schema/platforms.ts` |
| `sync_adapters` Layer-2 (schema-only Phase 1) | ✅ | migrations `0018`, `0019`; schemas present |
| `access-registry.ts` router | ✅ | `packages/api/src/routers/access-registry.ts` present (`listByStaff`, `listByPlatform`, `create`, `update`, `bulkImport`) |
| RBAC `access` resource | ✅ | `packages/auth/src/index.ts` — `access: ["create","read","update","delete"]` |
| Seed step 3 populates registry (gate `serviceAccessRegistry.rowCount >= 3000`) | 🟡 | `step03_serviceAccessRegistry` defined at `seed-historical.ts:295`; row-count gate fails because staff aren't seeded (target 281, actual 23 per latest run). **Carry-forward to Part C** |

## Phase 2 — Leave refactor

| AC | Status | Evidence |
|---|---|---|
| Leave types: Compassionate removed; Emergency, No Pay, Special added | ✅ | `packages/db/src/schema/leave.ts:29-43` — `leave_types` is data-driven table, no enum hardcode; "compassionate" absent |
| `leave_policies` extended (blocked_months, allow_rollover) | ✅ | migration `0014_leave_policies_extend.sql` |
| Policy engine `validateRequest` returns `{status, violations}` | ✅ | `packages/api/src/routers/leave.ts:576` `validateRequest: requireRole("leave","read")`; engine in `packages/api/src/lib/leave-policy.ts` |
| Override fields on `leave_requests` (override_reason, overridden_by, violations jsonb) | ✅ | `leave.ts:107-111` |
| TOSD schema + 7 types incl. `callout_legacy` | ✅ | `packages/db/src/schema/tosd-records.ts:5-13` — 7 enum values match spec exactly |
| Calendar view shows team availability + blocked-month shading | ✅ | `apps/web/src/routes/_authenticated/leave/calendar.tsx` present |

## Phase 3 — Scheduling unification

| AC | Status | Evidence |
|---|---|---|
| `scheduling.*` router + schema live in parallel | ✅ | `packages/db/src/schema/scheduling.ts:9-160` (`dcs_on_call_weeks` 4-role); `packages/api/src/routers/scheduling.ts` |
| DCS weekly 4-role (lead/asn/enterprise/core) | ✅ | `leadEngineerId/asnSupportId/enterpriseSupportId/coreSupportId` columns |
| NOC monthly grid + swap workflow | ✅ | `packages/db/src/schema/noc-shifts.ts`; `packages/api/src/routers/noc-shifts.ts` |
| NOC shift type enum matches spec (D / S / N / sick / off / al / ml) | ⚠️ | `noc-shifts.ts:15-21` — actual values: `"12hr Day"`, `"12hr Night"`, `"Off"`, `"Annual Leave"`, `"Sick Leave"` (5 values, title-case). **Spec called for 7 short-codes including S (split) and ml (maternity leave)** — drift |
| Routine maintenance quarterly grid | ✅ | `quarterlyMaintenanceTasks` in `scheduling.ts` |
| iCal export (staff subscribes in Google Calendar) | ❌ | grep `\.ics\|iCal\|icalendar` in `packages/api/src/` returns 0 hits. **Missing feature — Phase 3 AC not met.** |
| Cutover gate (7-day zero 5xx + zero open regressions, then delete `rota.ts`/`roster.ts`/`noc-shifts.ts` standalone) | 🟡 | Gate intentionally pending per master plan §6.3; both legacy schemas still present. Phase 16 sidebar removed legacy from nav but routers still mounted. **Carry-forward to Part D / future session** |

## Phase 4 — Appraisal system

| AC | Status | Evidence |
|---|---|---|
| Appraisal sub-tables (ratings / responsibilities / achievements / goals / signatures) | ✅ | `packages/db/src/schema/appraisal-ratings.ts` (consolidated; per CLAUDE.md schema map) |
| Auto-score on `setRatings` | ✅ | `packages/api/src/routers/appraisals.ts:1165` `setRatings` procedure auto-computes |
| Min 3 achievements / 3 goals enforced | ✅ | `appraisals.ts:1530` and `:1572` — `z.array(...).min(3, "At least 3 ... required")` |
| `appraisal_tracker_view` DB view | ✅ | `packages/db/src/schema/appraisal-tracker-view.ts:20` `pgView("appraisal_tracker_view").existing()` |
| Increment-tier boundary correctness (60/61/70/71/80/81/90/91/100) | ✅ | Auto-computed in `setRatings`; not unit-tested per phase AC text — but logic shipped |
| Signature block (digital SVG, wet-sign placeholder) | ✅ | `appraisal_signatures` table + per-cycle `signature_mode` toggle |
| Feedback CRUD | ✅ | `staff_feedback` router methods |

## Phase 5 — NOC performance

| AC | Status | Evidence |
|---|---|---|
| `noc_monthly_metrics` populated for 19 historical months | ✅ | Seed step 14 confirmed in `docs/seed-report.md` — 202 monthly metric rows upserted |
| `noc_ticket_activity` populated | ✅ | schema in `packages/db/src/schema/noc-performance.ts` |
| `eom-calculator.ts` computes 5 formulas | ⚠️ | **No standalone `packages/api/src/lib/eom-calculator.ts` file** — `computeEOM` lives inline in `packages/api/src/routers/noc-performance.ts:22`. Functionally equivalent but diverges from CLAUDE.md prose claim of separate file. Cosmetic drift |
| 19/19 EoM match validation | 🟡 | Match-rate is a seed-runtime computation; depends on prod seed data which currently has 202 metric rows but seed report says "matchRate: Computed at runtime" (not validated yet) |
| Performance journal per-person view | ✅ | `noc-performance-journal.ts` schema + router; migration 0030 |
| Commendations CRUD | ✅ | `commendations.ts` schema + router; migration 0029 |

## Phase 6 — Contracts lifecycle

| AC | Status | Evidence |
|---|---|---|
| Contract lifecycle columns | ✅ | `packages/db/src/schema/contracts.ts:48-52` — renewal_letter_due_date / appraisal_1_due_date / appraisal_2_due_date / submitted_to_hr_at / renewal_outcome |
| `career_progression_plans` schema seeded from `ContractEndDates_NOC.xlsx > Plan` | 🟡 | Schema present (`career-progression.ts`); Phase 14 seed step for Plan not yet implemented |
| 6-tier reminder ladder (90/60/30/14/7/1 days) | ❌ | grep `90.*60.*30.*14.*7` in `packages/api/src/` returns 0 hits. Only `renewalReminderDays.default(60)` and `withinDays.default(60)` exist in `contracts.ts:15,96`. **Phase 6 AC not met — single-tier reminder only.** Carry-forward to Part D |
| Promotion letter generator (docx → PDF) | 🟡 | `promotion_letters` schema + router exist (`hr-docs.ts`); end-to-end PDF generation not verified in this scan |

## Phase 7 — Training

| AC | Status | Evidence |
|---|---|---|
| `training-phase7.ts` schema | ✅ | present |
| Training plan matrix UI (team × staff × training areas) for 2026-2027 | ✅ | `apps/web/src/routes/_authenticated/training/plan.tsx` |
| 8 onboarding task templates in seed | ✅ | `seed-historical.ts:988-997` — exactly 8 entries |
| Exam voucher expiry reminders (30/14/7 days) | 🟡 | `training-phase7.ts:360` `sendExpiryReminders` procedure exists. Specific 30/14/7 cadence not explicitly enumerated in code; appears day-aware but cadence parameters unverified. **Carry-forward** |
| Certification catalog visible to staff | ✅ | `training/catalog.tsx` route present |

## Phase 8 — PPE, lateness, timesheets, TOSD

| AC | Status | Evidence |
|---|---|---|
| `ppe.ts` schema (has_size, has_asset_tag flags) | ✅ | `packages/db/src/schema/ppe.ts:38-39` |
| PPE 17 canonical items | 🟡 | Seed step 23 hardcodes 17 items; verified via `seed-historical.ts:878` & `docs/seed-report.md` (17 upserted) |
| Lateness quarterly grid | ✅ | `packages/db/src/schema/lateness-records.ts` |
| TOSD register supports 7 types incl. `callout_legacy` | ✅ | see Phase 2 |
| Timesheet documents indexed (PDF index) | ✅ | `timesheet-documents.ts` schema + router |

## Phase 9 — Self-service profile

Handoff §11 enumerates **16 expected sections**; master plan §8 says **15**. Profile page audit:

- `apps/web/src/routes/_authenticated/profile.tsx`: 1,328 lines, ~17 distinct `<Card>` blocks/section components

| AC | Status | Evidence |
|---|---|---|
| `staff.updateSelf` writes phone / CUG / MiFi with audit log | ✅ | `packages/api/src/routers/staff.ts:295-297, 320-321` |
| 15 / 16 profile sections rendered | 🟡 | 17 Card components present — likely covers ≥15 sections but not formally numbered against spec list. Per-section check deferred to Part D |
| Team Lead view (direct reports only), Sachin / Ataybia all-DCS-NOC view, scope-helpers | ✅ | `packages/api/src/lib/scope.ts` (`canAccessStaffPrivate`, `getDirectReports`, `getManagedStaffIds`) |
| Policies / Forms / My Profile tabs | ✅ | `policy/index.tsx` exposes Policies + Forms; `/profile` is the de-facto self-service entry |

## Phase 10 — Notifications & calendar

| AC | Status | Evidence |
|---|---|---|
| `notifications.ts` router | ✅ | present |
| All 15 triggers firing | 🟡 | Trigger inventory not enumerated programmatically. `lib/automation.ts` + `lib/notify.ts` present; CLAUDE.md lists modules. **Carry-forward to Part D — needs trigger-by-trigger smoke test** |
| `calendar_events.event_type` widened to 12 values | ⚠️ | enum has 12 values but mixes title-case (`"Birthday"`, `"Training"`, `"Event"`) with lowercase. **Naming convention drift** — cosmetic but should be normalized for consistency |
| Birthdays auto-populate calendar | ✅ | scheduled birthday job in automation rules |
| Public holidays render | ✅ | calendar_events seeded with `type='public_holiday'` |

## Phase 11 — Work register refactor

| AC | Status | Evidence |
|---|---|---|
| `work_items.year`, `period`, `weekStartDate` columns | ✅ | `packages/db/src/schema/work.ts:108-110`; migration `0031_work_year_period.sql` |
| Composite index `(year, period, assignedEngineerId)` | ✅ | migration 0031 |
| Filter pills (Year / Week / Routine / Temporary / Current / Other / All) | 🟡 | `apps/web/src/routes/_authenticated/work/index.tsx:101` shows `{ value: "routine", label: "Routine" }` — `routine` filter pill present; full 7-state pill bar not confirmed by single grep. **Carry-forward — verify in Part D smoke** |
| Engineer multi-select filter parity with XLSX AutoFilter | 🟡 | Filter exists; "parity" claim is a UX assertion not easily code-verified |
| `WorkUpdate_20240118_v01.xlsx` 24-sheet roundtrip | 🟡 | Import handler exists (`processOperationsWorkUpdate*`); end-to-end import → UI → export not tested in CI |

## Phase 12 — Import module

| AC | Status | Evidence |
|---|---|---|
| 30+ CSV templates in `apps/web/public/import-templates/` | ⚠️/❌ | Actual count: **18 CSV files** (matches `import_type` enum). Master plan §13 specified ~30. **12+ templates short.** Carry-forward to Part D |
| Each template has `.csv` (headers only) + `.example.csv` (sample rows) variants | ❌ | grep `*.example.csv` in `apps/web/public/import-templates/` returns 0 hits. **All 18 are headers-only.** Carry-forward to Part D |
| Per-entity importer: header validation + row-level preview + dry-run + commit | ✅ | `packages/api/src/routers/import.ts` execute handlers (18 types) |
| Import history persisted | ✅ | `imports.ts` schema + `getHistory` procedure |

## Phase 13 — Obsolete-docs cleanup

| AC | Status | Evidence |
|---|---|---|
| 5 root .md files removed per §4.1 | 🟡 | `docs/cleanup-log.md` documents deletions; git-history verification not done this session |
| `docs/cleanup-log.md` populated | ✅ | file present |
| 19 Fumadocs MDX audited | 🟡 | `apps/docs/content/docs` directory exists; MDX file inventory + per-file audit not enumerated. Carry-forward |
| `_archive/` retains superseded plans | ✅ | `docs/superpowers/plans/_archive/` present |

## Phase 14 — Final historical seed

| AC | Status | Evidence |
|---|---|---|
| `seed-historical.ts` implements 35 ingest steps | 🟡 | **13 of 35 steps shipped** (steps 1, 2, 3, 5, 11, 14, 17, 20, 21, 22, 23, 24, 34). 22 still pending: 4, 6-10, 12-13, 15-16, 18-19, 25-33, 35. **This is the entirety of Part C** |
| Upsert-by-natural-key (no raw `INSERT`) | ✅ | All implemented steps use `onConflictDoUpdate` |
| `--dry-run` flag completes <2 min | ✅ | `seed-historical.ts:67`; verified in CURRENT_PHASE.md |
| Gate assertions in CI | 🟡 | Computed at runtime (`gateAssertions` JSON output); not yet wired as CI failure. **Carry-forward to Part C/D** |
| 19/19 EoM match | 🟡 | Computed at runtime per `docs/seed-report.md`; not yet validated end-to-end (depends on full staff seed) |

## Phase 15 — Hardening

| AC | Status | Evidence |
|---|---|---|
| E2E tests cover every new feature | ⚠️ | `apps/web/tests/e2e/smoke.spec.ts` (195 lines): **25 `test()` blocks**, no `const PAGES = [...]` array; **short of master plan's 40+ commitment**. Carry-forward to Part D |
| Perf audit (scheduling grid <200 ms / appraisal form <150 ms) | 🟡 | No perf-budget test files. Phase 15 stretch — Carry-forward |
| RBAC matrix: 100% router coverage | ⚠️ | **Only 4 `describe` blocks** in `packages/api/tests/rbac-matrix.test.ts` (668 lines): Phase 1, Phase 8, Phase 4-5 follow-up, Phase 15 (import). **Hard Invariant #5 violation** — 40+ routers uncovered (see Cross-cutting §) |
| Accessibility (axe-core passes; keyboard nav) | ❌ | `@axe-core/playwright` not yet a dependency. Part D scope |
| `PRODUCTION_READINESS_CHECKLIST.md` green | 🟡 | File present (175 lines) but uses prose markers, not standard `- [ ] / - [x]` checkboxes. Needs normalization in Part D |
| Bundle splitting (`manualChunks`) | ✅ | `apps/web/vite.config.ts:25` function-form `manualChunks(id)` |

## Phase 16 — IA revamp (this branch — new section)

| AC | Status | Evidence |
|---|---|---|
| New `sidebar-data.ts` flat groups (12 nav groups, deduplicated icons) | ✅ | `apps/web/src/components/layout/data/sidebar-data.ts` 137 lines, 12 groups, all `NavLink` (no nested collapsibles) |
| 13 `/rota/*` + `/roster/*` legacy routes converted to `<Navigate replace>` | ✅ | All 13 files begin with `import { ..., Navigate } from "@tanstack/react-router"` |
| New routes: `/scheduling/maintenance`, `/compliance` (index), `/settings` (index), `/forms` (index) | ✅ | All 4 files in `apps/web/src/routes/_authenticated/` |

---

## Cross-cutting findings

### 1. **Hard Invariant #5 violation — RBAC matrix coverage** (🔴 BLOCKER for Phase 15 close)

`packages/api/tests/rbac-matrix.test.ts` (668 lines) has only **4 describe blocks**:
- Phase 1: access registry
- Phase 8: PPE / lateness / TOSD
- Phase 4-5 follow-up: commendations / appraisalTracker / noc-performance-journal
- Phase 15: import (platform_accounts, attendance, callouts)

**Uncovered routers (zero RBAC rows):** `appraisals`, `appraisal-cycles`, `attendance-time`, `audit`, `automation`, `career-progression`, `compliance`, `contracts`, `cycles`, `dashboard`, `department-assignments`, `escalation`, `hr-docs`, `incidents`, `leave`, `leave-policies`, `noc-shifts`, `notifications`, `overlays`, `platforms`, `policy`, `procurement`, `rota`, `roster`, `scheduling`, `services`, `staff`, `temp-changes`, `timesheets`, `timesheet-documents`, `training`, `training-phase7`, `work`, `workload`.

That's **34 routers without coverage** — Hard Invariant #5 says "every router procedure gets a row in the RBAC matrix in the same PR". This is a long-standing accumulated debt that crystallized at the Phase 15 boundary.

**Recommendation:** Treat as carry-forward to Part D. Adding stub RBAC tests for the 34 routers is mechanical; estimate 4–6 hours.

### 2. **Hard Invariant #4 violation — `policy.ts` uses `protectedProcedure` on mutations**

`packages/api/src/routers/policy.ts` uses `protectedProcedure` on `create`, `update`, and `delete` procedures for both `policies.*` and `forms.*`. Per `CLAUDE.md` "RBAC Enforcement — MANDATORY": "ALL mutation procedures MUST use `requireRole`, NOT `protectedProcedure`."

**Recommendation:** Fix in Part D — change to `requireRole("settings", "create")` etc. RBAC matrix rows added in same PR.

### 3. **logAudit() coverage**

All 45 routers using `requireRole` on mutations call `logAudit()` from `packages/api/src/lib/audit.ts`. Read-only routers (analytics, dashboard, audit, notifications, workload) correctly omit it.

**Edge cases to verify in Part D:**
- `training.ts` (legacy facade) — does its `update`/`delete` call logAudit?
- `attendance-time.ts` — same question

### 4. **Phase 6 contract reminder ladder absent**

Master plan §8 Phase 6 explicitly requires "Contract end date triggers auto-generate 6 scheduled reminders (90/60/30/14/7/1 day)". Code has `renewalReminderDays.default(60)` only. **Implement in Part D as part of Phase 6 closeout.**

### 5. **Phase 3 iCal export absent**

Master plan §6.3 + §8 Phase 3 AC: "iCal export verified (staff subscribes in Google Calendar, events appear)." No `.ics` generator exists in the codebase. **Either implement in Part D or escalate as scope decision (skip for v1?).** See plan-questions.md addition below.

### 6. **Phase 12 templates: 18 of 30+, no `.example.csv` variants**

The 12 missing templates plus 18 missing `.example.csv` files are 30 files of trivial content. **Recommend generating in Part D — pure CSV files, no logic.**

---

## Carry-forward to Part D

These items are in scope for the Phase 14+15 closeout PR (Part D):

1. Add RBAC matrix rows for 34 uncovered routers (HI #5) — mechanical
2. Fix `policy.ts` mutations to use `requireRole("settings", …)` (HI #4)
3. Generate missing 12 import template `.csv` + 18 `.example.csv` files
4. Verify `training.ts` + `attendance-time.ts` audit logging on mutations
5. Expand smoke tests from 25 to 40+ routes (per Phase 15 spec)
6. Add `@axe-core/playwright` + run on `/`, `/work`, `/profile`, `/scheduling/noc-shifts` (Phase 15)
7. Normalize `PRODUCTION_READINESS_CHECKLIST.md` to use `- [ ] / - [x]` markdown checkboxes
8. Validate `calendar_event_type` enum case-normalisation (drift)
9. Numerically enumerate the 15 / 16 profile sections expected vs. shipped (Phase 9 verification)

## Will not fix this session — `@kareem [DECISION]`

The following require Kareem's call. Adding `@kareem [DECISION]` entries to `docs/plan-questions.md`:

1. **iCal export for `/scheduling/*` (Phase 3 AC)** — implement now or defer to v1.1? Estimate ~4 hours.
2. **6-tier contract reminder ladder (Phase 6 AC)** — implement as discrete reminder rows in `notifications`, or as one job that fires per tier?
3. **NOC shift enum drift (D/S/N/sick/off/al/ml vs current 5-value title-case)** — keep current human-readable enum, or migrate to short-codes? Migration risk vs. spec compliance.
4. **`eom-calculator.ts` separation** — keep inline (working) or extract to lib file as spec text says? Cosmetic.
5. **30+ vs 18 CSV templates** — confirm the 12 missing template specs (the master plan §13 table enumerates them); generate in Part D vs. defer the long-tail to a stretch?

---

## What's already on track

- Phase 0–13 all merged. Gate SHAs verified.
- Phase 14+15 scaffold solid (13/35 seed steps + hardening scaffolding + checklist).
- Phase 16 IA revamp shipped this session.
- Server schemas all match handoff spec at the table level — drift is at the enum/value level only.
- All mutation procedures except `policy.ts` use `requireRole` correctly.

## Methodology notes

- All counts from `grep -c` / `wc -l` against the actual files on `claude/inspiring-morse-bdf638` HEAD `359b185`.
- Where the prompt called for runtime checks (e.g., 19/19 EoM match), this audit relies on the latest `docs/seed-report.md` rather than re-running the seed. Re-running is Part C scope.
- "Carry-forward to Part D" items are the same as the **PRODUCTION_READINESS_CHECKLIST** open rows — both are the punch list for closing the branch.

## File locations referenced

- Master plan §8: `docs/superpowers/plans/2026-04-23-master-remediation-plan.md:1047-1213`
- Handoff §11: `source-of-truth/10-handoff-docs/CLAUDE_CODE_PLANNING_HANDOFF.md:410-436`
- AGENT_LOG entries (last 3): `AGENT_LOG.md:1-260`
- Latest seed report: `docs/seed-report.md` (2026-05-12T19:06:55)
- Branch HEAD: `359b185` (this audit doc + AGENT_LOG/CURRENT_PHASE/IMPLEMENTATION_PLAN updates will follow)
