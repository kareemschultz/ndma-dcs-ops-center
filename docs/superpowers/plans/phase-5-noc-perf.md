# Phase 5 — NOC Performance

> **[BACKFILL — created 2026-05-04 by State Audit]** Reconstructed from `AGENT_LOG.md` Phases-1-6 sprint entry + `CHANGELOG.md` + master plan §5.4.

**Branch:** `phase/5-noc-perf` (squash-merged via PR #26)
**Based on:** Phase 4 gate commit `82c109b`
**Gate commit (main):** `7916454`
**Master plan ref:** §5.4 (ticket activity + monthly metrics + EoM computed table)

## Acceptance Criteria

### Schema + Computation + UI (shipped)
- [x] Migration 0024 creates: `noc_ticket_activity`, `noc_monthly_metrics`, `employee_of_the_month`
- [x] `nocPerformance.metrics.{list,upsert}` — staff × year × month metrics grid
- [x] `nocPerformance.tickets.{list,create}` — ticket-level read API
- [x] `nocPerformance.eom.{get,compute}` — EoM router with `computeEOM` algorithm (7 recognition categories)
- [x] `/noc-performance` tabbed page (Monthly Metrics / EOM Awards / Ticket Activity)

### Spec'd in master plan §5.3 (resolved 2026-05-04 + open Phase 5 follow-up)
- [x] **`commendations` table** — shipped 2026-05-04 via migration 0029. Master plan §5.3 spec verbatim. Source: `NOC/appraisals/StaffCommendationJournal_20231216_v01.xlsx` (2 sheets: 2025, 2026; per-staff per-month positive recognition narrative). Schema: `packages/db/src/schema/commendations.ts`. Router: `commendations.{list,get,create,update,delete}` (RBAC: `performance_journal` resource).
- [x] **`performance_journal_entries` naming alignment** — RESOLVED 2026-05-04 via migration 0030 (Option B). Added new table `noc_performance_journal` with the master plan §5.3 mistake-matrix shape (count + narrative per (staff, year, month, category) where category ∈ `tickets_itop / alarms / slack_whatsapp / task_incomplete`); existing `performance_journal_entries` in `hr-docs.ts` left as-is for the appraisal-period feedback log flow. Schema: `packages/db/src/schema/noc-performance-journal.ts`. Router: `nocPerformanceJournal.{list,upsert,delete}` (RBAC `performance_journal` resource). Phase 14 seed step 10 unblocked.

### Deferred to Phase 14 (historical seed) — **CRITICAL acceptance gate**
- [ ] `noc_monthly_metrics` populated for 19 historical months (Aug2024 → Mar2026) from `EmployeeOfTheMonth_20240923_v01.xlsx` (~209 rows)
- [ ] `noc_ticket_activity` populated from `IncidentProblem_CreatedandClose_20252905.xlsx` (24 sheets, ~5,000 ticket-rows)
- [ ] **EoM 19/19 validation gate**: `eom-calculator.ts` computed `overall_best_staff_id` MUST match the recorded "Overall Best Technician" label string in each of the 19 historical months. Any mismatch blocks the seed (Hard Invariant #4).
- [ ] `noc_performance_journal` populated from `StaffPerformanceJournal_20230731_v01.xlsx` (12 staff × 4 years × 12 months × 4 categories = ~2,304 rows) — Phase 14 seed step 10. Renamed from `performance_journal_entries` per Option B resolution 2026-05-04.
- [ ] `commendations` (or equivalent) populated from `StaffCommendationJournal_20231216_v01.xlsx` (~250 rows)

### Deferred (RBAC scoping verification)
- [ ] NOC staff can see own metrics only
- [ ] Supervisors see team metrics
- [ ] Ataybia + Sachin see all

## What Shipped

### Migration
- **0024_noc_performance.sql** — 3 new tables

### Schema
- `packages/db/src/schema/noc-performance.ts`

### Router
- `packages/api/src/routers/noc-performance.ts` — metrics, tickets, eom sub-routers

### Router helper
- `packages/api/src/lib/eom-calculator.ts` — should exist; verify file presence + unit tests + boundary cases (master plan §10 check 10.4)

### UI
- `apps/web/src/routes/_authenticated/noc-performance/index.tsx`

## Notes

**EoM is computed-only** — the `employee_of_the_month` table is written exclusively by `eom-calculator.ts`. Master plan §10 check 10.4 forbids hand-editing rows. Phase 14 dry-run must re-compute all 19 historical months and validate against XLSX-recorded labels before any production write.

**Recognition categories** per master plan §5.4: `overall_best_staff_id`, `second_best_staff_id`, `most_incident_tickets_staff_id`, `most_problem_tickets_staff_id`, `most_noc_tickets_closed_staff_id`, `least_alarm_non_compliance_staff_id`, `least_ticket_non_compliance_staff_id` — 7 distinct staff references per (year, month).
