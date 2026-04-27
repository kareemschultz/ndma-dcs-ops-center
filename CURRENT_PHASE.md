# Current Phase

**Active phase:** None — Phases 1-6 complete
**Status:** 🟢 Done through Phase 6
**Last completed:** Phase 6 Contracts Lifecycle (commit `66fa5c9`, PR #27)
**Branch:** none active — next work targets Phase 7 (Training)
**Master plan reference:** `docs/superpowers/plans/2026-04-23-master-remediation-plan.md`

## What's on main (Phases 0-6)

| Phase | PR | Commit | What shipped |
|---|---|---|---|
| 0 | #16 | `3916721` | Migrations 0008-0015 — stabilise & delete |
| 1 | #18-22 | `2972287` | Access registry schema + API + UI + RBAC tests + staff detail page |
| 2 | #23 | `a88f36b` | Leave refactor — TOSD table, validateRequest, policy engine |
| 3 | #24 | `b3cad77` | Scheduling — noc_shifts, dcs_on_call_weeks, routine_maintenance, swap tables + router + UI |
| 4 | #25 | `82c109b` | Appraisal sub-tables (ratings/responsibilities/achievements/goals/signatures) + scoring |
| 5 | #26 | `7916454` | NOC performance — ticket activity, monthly metrics, EOM awards + computeEOM |
| 6 | #27 | `66fa5c9` | Contracts lifecycle — lifecycle dates, outcome recording, career_progression_plans |

## Next phase: Phase 7 — Training

Per master plan §5.10, Phase 7 adds:
- `training_plans`, `certification_catalog`, `exam_schedule`, `exam_vouchers` tables
- `training_events` + `training_event_participants`, `in_house_training_log`
- `training_syllabi`, `assessment_questions`, onboarding extensions
- Training module router + UI (Training Overview / My Training / Plan / Exams / Vouchers / Events)
- Sidebar update: replace 3 stub Training items with 6 real ones

## Notes for any agent picking up

- **Trust the SHA, not the prose** — run `git log <SHA> --stat` to verify contents
- Latest 5 commits on main: `66fa5c9` (Phase 6), `7916454` (Phase 5), `82c109b` (Phase 4), `b3cad77` (Phase 3), `a88f36b` (Phase 2)
- Migration index is at 25 — next migration is 0026
