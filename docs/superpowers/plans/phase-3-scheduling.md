# Phase 3 — Scheduling Unification

> **[BACKFILL — created 2026-05-04 by State Audit]** Reconstructed from `AGENT_LOG.md` Phases-1-6 sprint entry + `CHANGELOG.md` + master plan §5.7 / §6.3.

**Branch:** `phase/3-scheduling` (squash-merged via PR #24)
**Based on:** Phase 2 gate commit `a88f36b`
**Gate commit (main):** `b3cad77`
**Master plan ref:** §5.7 (unified scheduling tables), §6.3 (NOC + DCS planner UIs + cutover gate)

## Acceptance Criteria

### Schema + Routers + UI (shipped — running in parallel to legacy)
- [x] Migration 0022 creates: `noc_shifts`, `dcs_on_call_weeks` (4-role weekly: lead / asn / enterprise / core), `routine_maintenance` (quarterly), `shift_swaps`, `on_call_swaps` (DCS swaps)
- [x] `scheduling.*` router with sub-procedures: `nocShifts.{list,bulkSet,update}`, `dcsOnCall.{list,get,upsertWeek}`, `maintenance.{list,upsert}`, `swaps.noc.{request,review}`, `swaps.dcs.{request,review}`
- [x] `/scheduling/noc-shifts` — monthly grid UI (staff × day 31 columns, color-coded D/S/N badges, click-to-edit)
- [x] `/scheduling/dcs-oncall` — weekly grid (4-role columns, edit-row dialog)

### Cutover gate (NOT YET MET)
- [ ] **7 consecutive days zero 5xx in `scheduling.*` AND zero open `scheduling-regression` bugs** before deleting legacy `rota.ts` / `roster.ts` / `noc-shifts.ts` schemas / routers / routes
- [ ] Delete legacy on cutover: `packages/db/src/schema/rota.ts`, `roster.ts`; `packages/api/src/routers/rota.ts`, `roster.ts`, `noc-shifts.ts` (router); `apps/web/src/routes/_authenticated/rota/*`, `roster/*`

### Deferred to Phase 14 (historical seed)
- [ ] NOC shifts seeded from `NOC/shift-schedule/{Jan..Apr}_2026*.xlsx` (~1,364 day-rows)
- [ ] DCS on-call weeks seeded from `PlannedOnCallRoster_20230123 (1).xlsx` (4 years × 52 = ~208 weeks)
- [ ] Quarterly routine maintenance seeded (~16 rows from 2026 sheet)

### Deferred to Phase 10 / future
- [ ] iCal export per person (`.ics` download + subscribe URL)
- [ ] Leave overlay on shift / on-call grids (red flag if on-call during scheduled leave)
- [ ] Fairness analytics persistence (YTD weeks per role per engineer; outlier flag)

## What Shipped

### Migration
- **0022_scheduling_unification.sql** — 5 new tables + status enums

### Schemas
- `packages/db/src/schema/scheduling.ts` — DCS-side tables (dcs_on_call_weeks, quarterly_maintenance_tasks, dcs_oncall_swaps)
- `packages/db/src/schema/noc-shifts.ts` — NOC shift grid + shift_swaps

### Routers
- `packages/api/src/routers/scheduling.ts`
- `packages/api/src/routers/noc-shifts.ts` (separate from legacy `noc-shifts` schema being phased out)

### UI
- `apps/web/src/routes/_authenticated/scheduling/index.tsx`
- `apps/web/src/routes/_authenticated/scheduling/noc-shifts.tsx`
- `apps/web/src/routes/_authenticated/scheduling/dcs-oncall.tsx`

## Notes

**Phase 3 introduced a parallel-running architecture** per master plan §6.3 cutover gate. The legacy `rota.ts` (DCS) and `roster.ts` + `noc-shifts.ts` (NOC) routers + routes still exist and serve traffic. New code must be written against `scheduling.*` only. The cutover gate has not yet been confirmed met — no production observability dashboard tracking the 7-day zero-5xx criterion is documented. Recommended Phase 15 (Hardening) action: instrument the gate metric and execute the cleanup commit.

Schema naming nuance: master plan §5.7 specifies a `routine_maintenance` table; the actual implementation uses `quarterly_maintenance_tasks` inside `scheduling.ts`. The legacy `routine_maintenance_*` tables (renamed from `overlay_*` in Phase 0 migration 0013) live in `operational-overlays.ts`. Both coexist; reconcile during Phase 13 cleanup or Phase 15 hardening.
