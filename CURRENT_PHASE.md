# Current Phase

**Active phase:** None — Phases 0-8 complete; queued: Phase 9
**Status:** Done through Phase 8 + 2026-05-04 documentation hygiene pass
**Last completed:** Phase 8 PPE/Lateness/Timesheets/TOSD (main commit `fb46d00` after 2026-05-04 rebase-merge of PR #29; pre-rebase squash was `2b4fbc6` and feature-branch tip was `20202ed` — same content)
**Branch:** none active — next work targets Phase 9 (Self-service, policies, forms)
**Master plan reference:** `docs/superpowers/plans/2026-04-23-master-remediation-plan.md`
**Pre-Phase-9 audit + hygiene:** `docs/audit/STATE-AUDIT-2026-05-04.md` (read this before Phase 9)

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
| 7 | #29 (orig) | 2ced91b | Training — plans, cert catalog, exam vouchers, events, in-house log, syllabi, onboarding templates |
| 8 | rebased | fb46d00 | PPE matrix (17 items), lateness quarterly grid (Q1-Q4), timesheet documents index |

## Next phase: Phase 9 — Self-service + policies + forms

Per master plan section 5.13, Phase 9 adds:
- Self-service leave requests portal
- Company policies management
- Employee-facing forms

## Notes for any agent picking up

- Migration index is at **29** (0029 ships commendations + appraisal_tracker_view per master plan §5.3) — next migration is 0030
- Phase 8 branch: phase/8-ppe-lateness-tosd (squash-merged to main via merge --squash)
- 2026-05-04 spec follow-up: commendations table + appraisal_tracker_view shipped (closes 2 of 2 gaps surfaced by `docs/audit/STATE-AUDIT-2026-05-04.md`)
- Open Phase 5 follow-up question: `performance_journal_entries` naming gap — see `docs/plan-questions.md`
