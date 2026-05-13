# Current Phase

**Active phase:** None — all phases complete ✅
**Status:** 🟢 All 16 phases merged to main (PR #41 merged 2026-05-13)
**Latest main commit:** `54d0b09` (merge commit — phases 14-16 + design sweep)
**Migration index:** 32 (latest: `0032_noc_shift_enum_extend.sql`)

## What is on main (Phases 0-16)

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
| 14 | #41 | 54d0b09 | Historical seed script (35 steps), source-of-truth extraction, canonical-data docs |
| 15 | #41 | 54d0b09 | RBAC static contract test (150 rows), bundle splitting, 59/59 e2e smoke, prod checklist |
| 16 | #41 | 54d0b09 | IA revamp, sidebar cleanup, green→blue design sweep, screenshot tour spec, Base UI nav fixes |

## Production deployment (next step)

All code is on main. To deploy:

1. Apply migrations 0008-0032: `bun run db:migrate` (requires PROD DATABASE_URL)
2. Run historical seed: `bun run db:seed:historical` (requires PROD data files + DATABASE_URL)
3. See `PRODUCTION_READINESS_CHECKLIST.md` for full checklist

## Known pending issues (post-merge)

- **Phase 14 seed steps 4, 6-10, 12-13, 15-16, 18-19, 25-33, 35** — stubs; require PROD data files
- **Phase 3 cutover gate** — legacy `rota.ts`/`roster.ts`/`noc-shifts.ts` still mounted; delete after 7-day zero-5xx window
- **Scheduling sub-pages empty in dev** — `noc_shifts` + `dcs_on_call_weeks` tables empty until seed runs
- **drizzle-kit generate blocked** — `appraisal_tracker_view` duplicate-name warning; hand-author future migrations
- **3 import handlers stub** — `platform_accounts`, `attendance`, `callouts` return success without writing rows
- **iCal export** — Phase 3 AC deferred to v1.1 per decision
