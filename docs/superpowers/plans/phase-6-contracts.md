# Phase 6 — Contracts Lifecycle

> **[BACKFILL — created 2026-05-04 by State Audit]** Reconstructed from `AGENT_LOG.md` Phases-1-6 sprint entry + `CHANGELOG.md` + master plan §5.5.

**Branch:** `phase/6-contracts` (squash-merged via PR #27)
**Based on:** Phase 5 gate commit `7916454`
**Gate commit (main):** `66fa5c9`
**Master plan ref:** §5.5 (contracts extension + career_progression_plans)

## Acceptance Criteria

### Schema + Routers + UI (shipped)
- [x] Migration 0025 extends `contracts` with: `renewal_letter_due_date` (auto = end_date − 3mo), `appraisal_1_due_date` (renewal − 6mo), `appraisal_2_due_date` (= renewal due), `submitted_to_hr_at`, `renewal_outcome` enum (renewed / not_renewed / left / terminated)
- [x] Migration 0025 creates `career_progression_plans` (per-staff multi-year, status: pending / achieved / missed; unique on staff+target_year)
- [x] `contracts` router additions: `setLifecycleDates` (auto-computes from end_date), `submitToHR`, `setOutcome`, `getTimeline`
- [x] `careerProgression` router (list / upsert / delete)
- [x] `/contracts/$contractId` detail page — lifecycle timeline (Appraisal 1/2 Due, Renewal Letter Due, Submitted to HR), inline Submit-to-HR + Record-Outcome actions, career progression plan editor

### Deferred to Phase 14 (historical seed)
- [ ] Contracts seeded from `ContractEndDates_DCS.xlsx` + `ContractEndDates_NOC.xlsx` Contract Renewal sheets (~50 rows)
- [ ] `career_progression_plans` seeded from `ContractEndDates_NOC.xlsx > Plan` (~40 rows for 2026-2029)

### Deferred to Phase 10 (notifications)
- [ ] 6 scheduled reminders per contract end date: 90 / 60 / 30 / 14 / 7 / 1 days
- [ ] Appraisal 1 / Appraisal 2 due-date reminders
- [ ] Follow-up reminders (3-month + 9-month)

### Deferred (master plan §8 Phase 6)
- [ ] Promotion letter generator: fill docx template → PDF for HR (3 sample staff tested) — `promotion_letters` table exists in `hr-docs.ts`; doc generation pipeline TBD

## What Shipped

### Migration
- **0025_contracts_lifecycle.sql** — extends contracts + creates career_progression_plans

### Schemas
- `packages/db/src/schema/contracts.ts` (extended)
- `packages/db/src/schema/career-progression.ts` (new)

### Routers
- `packages/api/src/routers/contracts.ts` — added `setLifecycleDates`, `submitToHR`, `setOutcome`, `getTimeline`
- `packages/api/src/routers/career-progression.ts` (new)

### UI
- `apps/web/src/routes/_authenticated/contracts/$contractId.tsx`
- `apps/web/src/routes/_authenticated/career-progression/index.tsx`

## Notes

Lifecycle date math (per master plan §5.5):
- `renewal_letter_due_date = end_date - 3 months`
- `appraisal_1_due_date = renewal_letter_due - 6 months`
- `appraisal_2_due_date = renewal_letter_due` (same date)

`setLifecycleDates` should compute these atomically when an `end_date` is set / changed. Verify behavior when `end_date` is updated post-creation (recompute all dependent dates? lock once submitted to HR?). Decision: should be in `setLifecycleDates` implementation; revisit during Phase 9 (self-service HR docs) if user-facing edge cases surface.
