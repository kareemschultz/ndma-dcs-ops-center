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

### Spec'd in master plan §5.3 but NOT YET shipped
- [ ] **`commendations` table** — confirmed absent in schema search 2026-05-04. Master plan §5.3 specifies a `commendations` table for the StaffCommendationJournal data. May be folded into `performance_journal_entries` (`hr-docs.ts`) — **verification + decision needed**.

### Deferred to Phase 14 (historical seed) — **CRITICAL acceptance gate**
- [ ] `noc_monthly_metrics` populated for 19 historical months (Aug2024 → Mar2026) from `EmployeeOfTheMonth_20240923_v01.xlsx` (~209 rows)
- [ ] `noc_ticket_activity` populated from `IncidentProblem_CreatedandClose_20252905.xlsx` (24 sheets, ~5,000 ticket-rows)
- [ ] **EoM 19/19 validation gate**: `eom-calculator.ts` computed `overall_best_staff_id` MUST match the recorded "Overall Best Technician" label string in each of the 19 historical months. Any mismatch blocks the seed (Hard Invariant #4).
- [ ] `performance_journal_entries` populated from `StaffPerformanceJournal_20230731_v01.xlsx` (12 staff × 4 years × 12 months × 4 categories = ~2,304 rows)
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
