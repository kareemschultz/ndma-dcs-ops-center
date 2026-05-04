# Current Phase

**Active phase:** Phase 9 — Self-service + policies + forms (🔵 In Progress)
**Status:** WIP — server `staff.updateSelf` covers all 5 self-editable fields; UI form has CUG/MiFi inputs; remaining work is /profile page section expansion + RBAC scope verification + Policies "My Profile" tab decision
**Last completed:** 2026-05-04 spec follow-ups (migration 0029 commendations + appraisal_tracker_view; migration 0030 noc_performance_journal Option B)
**Branch:** `phase/9-self-service` (active WIP)
**Master plan reference:** `docs/superpowers/plans/2026-04-23-master-remediation-plan.md`
**Phase 9 checklist:** `docs/superpowers/plans/phase-9-self-service.md` (read this for current state + remaining work)
**Pre-Phase-9 audit:** `docs/audit/STATE-AUDIT-2026-05-04.md`

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

- Migration index is at **30** (0029 = commendations + appraisal_tracker_view; 0030 = noc_performance_journal mistake-matrix) — next migration is 0031
- Phase 8 branch: phase/8-ppe-lateness-tosd (squash-merged to main via merge --squash)
- 2026-05-04 spec follow-ups all resolved: commendations table + appraisal_tracker_view (migration 0029) + noc_performance_journal (migration 0030, Option B) — closes all 3 gaps surfaced by `docs/audit/STATE-AUDIT-2026-05-04.md`
- Phase 14 seed step 10 + 11 now have target tables ready
