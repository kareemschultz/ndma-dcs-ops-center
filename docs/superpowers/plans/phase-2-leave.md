# Phase 2 — Leave Refactor

> **[BACKFILL — created 2026-05-04 by State Audit]** Reconstructed from `AGENT_LOG.md` Phase 2 entry + `CHANGELOG.md` + master plan §5.6 / §6.2.

**Branch:** `phase/2-leave` (squash-merged via PR #23)
**Based on:** Phase 1 gate commit `2972287`
**Gate commit (main):** `a88f36b`
**Master plan ref:** §5.6 (leave types/policies), §6.2 (policy engine + override flow)

## Acceptance Criteria

### Schema + Engine + UI (shipped)
- [x] Migration 0021 extends `leave_requests` with `override_reason`, `overridden_by`, `violations` jsonb
- [x] `tosd_records` table created — 7 types: `reported_sick` / `medical` / `absent` / `time_off` / `work_from_home` / `lateness` / `callout_legacy`
- [x] `callout_legacy` type preserves Phase 0-deleted Callouts historical rows
- [x] Leave types verified: Annual, M.C., Emergency, No Pay, Special, Time Off, Work From Home (Compassionate removed per Ataybia)
- [x] `leave.validateRequest` policy engine returns `{ status, violations[] }` — warns on blocked months / insufficient balance, blocks on invalid date range
- [x] Override flow: warning submission stores `violations`; approval requires `override_reason`; audit log captures override
- [x] `leave.tosd.{list,create,update,delete}` router procedures
- [x] `/leave/tosd` register UI page (year + staff filter, Add Record dialog)

### Deferred to Phase 14 (historical seed)
- [ ] `tosd_records` seeded from `TimeOffSickDays_20251010_v01.xlsx` (5 yearly sheets + 2023-Callout legacy → ~2,000 rows)
- [ ] 2026 NOC leave_requests seeded from `AnnualLeaveRosterNOC.xlsx > 2026` (~50 rows)

### Deferred to Phase 10 (notifications)
- [ ] Reminder triggers tied to leave events

## What Shipped

### Migration
- **0021_leave_refactor.sql** — extends `leave_requests`, creates `tosd_records` with 7-value type enum

### Schemas
- `packages/db/src/schema/leave.ts` (extended)
- `packages/db/src/schema/leave-policies.ts` (existing; Phase 0 migration 0014 added `blocked_months[]` + `allow_rollover`)
- `packages/db/src/schema/tosd-records.ts` (new)

### Routers
- `packages/api/src/routers/leave.ts` — added `tosd.*` + `validateRequest`
- `packages/api/src/routers/leave-policies.ts`

### UI
- `apps/web/src/routes/_authenticated/leave/tosd.tsx`

## Notes

Calendar-day calculation rule (`days = end_date - start_date + 1`) per master plan §6.2 matches `AnnualLeaveRosterNOC.xlsx`. Validation against 20 historical samples is a master-plan acceptance criterion that should land during Phase 14 dry-run.

Compassionate leave type was REMOVED (Ataybia decision). Phase 0 migration 0010 was a no-op since prod had zero referencing rows; the row was not deleted from `leave_types` (still exists, harmless). To be cleaned up in a future maintenance pass.
