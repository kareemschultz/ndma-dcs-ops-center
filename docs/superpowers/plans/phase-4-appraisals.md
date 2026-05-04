# Phase 4 — Appraisal System

> **[BACKFILL — created 2026-05-04 by State Audit]** Reconstructed from `AGENT_LOG.md` Phases-1-6 sprint entry + `CHANGELOG.md` + master plan §5.3 / §6.4.

**Branch:** `phase/4-appraisals` (squash-merged via PR #25)
**Based on:** Phase 3 gate commit `b3cad77`
**Gate commit (main):** `82c109b`
**Master plan ref:** §5.3 (sub-tables + signatures + tracker view), §6.4 (XLSX-mirroring UI form)

## Acceptance Criteria

### Schema + Routers (shipped)
- [x] Migration 0023 creates: `appraisal_ratings`, `appraisal_responsibilities`, `appraisal_achievements`, `appraisal_goals`, `appraisal_signatures`
- [x] `appraisals` extended: `total_score`, `max_score`, `percentage`, `increment_pct`, `submitted_at`
- [x] `setRatings` upserts ratings + auto-computes score / percentage / increment using tier table
- [x] Score tier mapping: ≤60% → 1%, 61-70 → 2%, 71-80 → 3%, 81-90 → 4%, 91-100 → 5%
- [x] `setResponsibilities`, `setAchievements` (min 3 enforced), `setGoals` (min 3 enforced), `sign`, `getDetail`
- [x] Min 3 achievements + 3 goals enforced before submit

### UI (shipped)
- [x] `/appraisals/$appraisalId` form mirrors XLSX section-for-section (8 fixed categories + 5 core responsibilities + achievements + goals + signature block)
- [x] `/appraisals/staff/$staffProfileId` per-staff history
- [x] `/appraisals/inbox` for review queue

### Spec'd in master plan §5.3 but NOT YET shipped
- [ ] **`appraisal_tracker_view` (DB VIEW)** — confirmed absent in schema search 2026-05-04. Master plan §5.3 specifies a SQL VIEW joining `appraisals` + `staff` for the tracker page. Either add as raw-SQL migration, or replace with a materialized query in the appraisals router. **Decision needed.**
- [ ] Signature block save digital SVG / wet-sign placeholder render — verify implementation
- [ ] `appraisal_feedback` tab CRUD (FeedbackFromStaff sheet from `APPRAISAL TRACKER DCS.xlsx`)

### Deferred to Phase 14 (historical seed)
- [ ] ~130 historical appraisals from `DCS/appraisals/{2021..2026}/` + `NOC/appraisals/Appraisals {2022..2026}/`
- [ ] Appraisal ratings (~1,690 rows) — **CRITICAL**: parser MUST read raw X-position in B-F columns, NOT formula result (Hard Invariant #3)
- [ ] Achievements / goals (~390 rows each)
- [ ] FeedbackFromStaff (~100 rows)

## What Shipped

### Migration
- **0023_appraisal_system.sql** — 5 sub-tables + appraisals extensions

### Schemas
- `packages/db/src/schema/appraisals.ts` (extended)
- `packages/db/src/schema/appraisal-ratings.ts` (new — 5 sub-tables)
- `packages/db/src/schema/appraisal-cycles.ts` (existing pre-Phase-4)
- `packages/db/src/schema/appraisal-followups.ts` (existing pre-Phase-4)

### Router
- `packages/api/src/routers/appraisals.ts` — added `setRatings`, `setResponsibilities`, `setAchievements`, `setGoals`, `sign`, `getDetail`

### UI
- `apps/web/src/routes/_authenticated/appraisals/$appraisalId.tsx` (full form)
- `apps/web/src/routes/_authenticated/appraisals/inbox.tsx`
- `apps/web/src/routes/_authenticated/appraisals/staff/$staffProfileId.tsx`

## Notes

**Per-cycle signature mode toggle** (digital vs wet-sign placeholder) is configured at the `appraisal_cycles.signature_mode` column per [docs/plan-questions.md ANSWERED — Appraisal signature model](../../plan-questions.md). Verify implementation correctness during Phase 4 follow-up or Phase 15 hardening.

**Hard Invariant #3 reminder:** when Phase 14 historical seed runs, the rating parser must read column position (B=5, C=4, D=3, E=2, F=1) from raw cells — openpyxl returns formula strings, not values, for column G.
