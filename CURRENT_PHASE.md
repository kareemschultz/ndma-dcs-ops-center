# Current Phase

**Active phase:** None — Phases 1-8 complete
**Status:** Done through Phase 8
**Last completed:** Phase 8 PPE/Lateness/Timesheets/TOSD (commit 20202ed)
**Branch:** none active — next work targets Phase 9 (Self-service, policies, forms)
**Master plan reference:** docs/superpowers/plans/2026-04-23-master-remediation-plan.md

## What is on main (Phases 0-8)

| Phase | PR | Commit | What shipped |
|---|---|---|---|
| 0 | #16 | 3916721 | Migrations 0008-0015 — stabilise and delete |
| 1 | #18-22 | 2972287 | Access registry schema + API + UI + RBAC tests + staff detail page |
| 2 | #23 | a88f36b | Leave refactor — TOSD table, validateRequest, policy engine |
| 3 | #24 | b3cad77 | Scheduling — noc_shifts, dcs_on_call_weeks, routine_maintenance, swap tables + router + UI |
| 4 | #25 | 82c109b | Appraisal sub-tables (ratings/responsibilities/achievements/goals/signatures) + scoring |
| 5 | #26 | 7916454 | NOC performance — ticket activity, monthly metrics, EOM awards + computeEOM |
| 6 | #27 | 66fa5c9 | Contracts lifecycle — lifecycle dates, outcome recording, career_progression_plans |
| 7 | #29 | a4c1a53 | Training — plans, cert catalog, exam vouchers, events, in-house log, syllabi, onboarding templates |
| 8 | — | 20202ed | PPE matrix (17 items), lateness quarterly grid (Q1-Q4), timesheet documents index |

## Next phase: Phase 9 — Self-service + policies + forms

Per master plan section 5.13, Phase 9 adds:
- Self-service leave requests portal
- Company policies management
- Employee-facing forms

## Notes for any agent picking up

- Migration index is at 28 — next migration is 0029
- Phase 8 branch: phase/8-ppe-lateness-tosd (squash-merged to main via merge --squash)
