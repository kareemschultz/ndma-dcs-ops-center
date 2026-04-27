# Current Phase

**Active phase:** None -- Phases 1-7 complete
**Status:** Done through Phase 7
**Last completed:** Phase 7 Training (commit a4c1a53, PR #29)
**Branch:** none active -- next work targets Phase 8 (PPE, lateness, timesheets, TOSD)
**Master plan reference:** docs/superpowers/plans/2026-04-23-master-remediation-plan.md

## What is on main (Phases 0-7)

| Phase | PR | Commit | What shipped |
|---|---|---|---|
| 0 | #16 | 3916721 | Migrations 0008-0015 -- stabilise and delete |
| 1 | #18-22 | 2972287 | Access registry schema + API + UI + RBAC tests + staff detail page |
| 2 | #23 | a88f36b | Leave refactor -- TOSD table, validateRequest, policy engine |
| 3 | #24 | b3cad77 | Scheduling -- noc_shifts, dcs_on_call_weeks, routine_maintenance, swap tables + router + UI |
| 4 | #25 | 82c109b | Appraisal sub-tables (ratings/responsibilities/achievements/goals/signatures) + scoring |
| 5 | #26 | 7916454 | NOC performance -- ticket activity, monthly metrics, EOM awards + computeEOM |
| 6 | #27 | 66fa5c9 | Contracts lifecycle -- lifecycle dates, outcome recording, career_progression_plans |
| 7 | #29 | a4c1a53 | Training -- plans, cert catalog, exam vouchers, events, in-house log, syllabi, onboarding templates |

## Next phase: Phase 8 -- PPE, lateness, timesheets, TOSD

Per master plan section 5.12, Phase 8 adds:
- PPE matrix (17 items x staff + sizes + asset tags)
- Lateness quarterly grid
- TOSD register all 7 types; historical callout_legacy rows accessible
- Timesheet indexing

## Notes for any agent picking up

- Migration index is at 27 -- next migration is 0028
- Existing schemas: ppe.ts, lateness-records.ts, timesheets.ts, tosd-records.ts all exist
- Check which procedures are wired into appRouter vs stub-only before starting
