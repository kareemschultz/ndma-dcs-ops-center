# Current Phase

**Active phase:** None — Phases 9-13 complete as of 2026-05-06
**Status:** 🟢 Idle — next phases are 14 (historical seed) and 15 (hardening)
**Main HEAD:** `ff46c25`
**Migration index:** 31 (latest: `0031_work_year_period.sql`)

## What is on main (Phases 0-13)

| Phase | PR | Commit | What shipped |
|---|---|---|---|
| 0 | #16 | 3916721 | Migrations 0008-0015 — stabilise and delete |
| 1 | #18-22 | 2972287 | Access registry schema + API + UI + RBAC tests + staff detail page |
| 2 | #23 | a88f36b | Leave refactor — TOSD table, validateRequest, policy engine |
| 3 | #24 | b3cad77 | Scheduling — noc_shifts, dcs_on_call_weeks, routine_maintenance, swap tables + router + UI |
| 4 | #25 | 82c109b | Appraisal sub-tables (ratings/responsibilities/achievements/goals/signatures) + scoring |
| 5 | #26 | 7916454 | NOC performance — ticket activity, monthly metrics, EOM awards + computeEOM |
| 6 | #27 | 66fa5c9 | Contracts lifecycle — lifecycle dates, outcome recording, career_progression_plans |
| 7 | #29 | 2ced91b | Training — plans, cert catalog, exam vouchers, events, in-house log, syllabi, onboarding templates |
| 8 | rebased | fb46d00 | PPE matrix (17 items), lateness quarterly grid (Q1-Q4), timesheet documents index |
| 9 | #34+#39 | b84779a | Self-service profile — 11 sections, CUG/MiFi fields, onboarding.tasksList, RBAC fix |
| 10 | #36 | 39bbdb9 | Notifications — verified all triggers already wired; documented |
| 11 | #38 | a4a79e7 | Work refactor — year/period/weekStartDate columns + filter pills + migration 0031 |
| 12 | #37 | fa19785 | Import module — 18 CSV templates at /public/import-templates/ |
| 13 | #35 | ff46c25 | Docs cleanup — deleted 4 stale docs, updated 3 MDX files |

## Next phases

### Phase 14 — Final historical seed (⬜ Queued)
- 35-step seed script ingesting 200 XLSX + 29 DOCX from source-of-truth/
- Critical gates: EOM 19/19, appraisalTrackerView.rowCount >= 130
- Needs PROD DATABASE_URL + dry-run pass first
- See master plan §10 for seed step order

### Phase 15 — Hardening (⬜ Queued)
- e2e Playwright coverage (4 RBAC scope cases + smoke tests)
- Performance audit (Core Web Vitals, slow queries)
- RBAC matrix 100% (all procedures covered in rbac-matrix.test.ts)
- axe-core accessibility audit
- Production readiness

## Known pending issues

- **drizzle-kit generate blocked** — `appraisal_tracker_view` duplicate-name warning causes exit 1. Workaround: hand-author migrations. Should investigate pgView().existing() config.
- **3 import types lack execute handlers**: platform_accounts, attendance, callouts
- **Production migrations 0008-0031** not yet applied (requires PROD DATABASE_URL)
- **Phase 3 cutover gate**: legacy rota.ts/roster.ts/noc-shifts.ts still mounted; delete after 7-day zero-5xx window
