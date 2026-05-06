# Phase 11 — Work register refactor

**Branch:** `phase/11-work-refactor`
**Based on:** c72f127 (Phase 9 WIP gate)
**Status:** 🔵 In Progress (started 2026-05-06)
**Master plan ref:** §5.1 Work management, §8 Phase 11

## Acceptance criteria

- [x] Add year/period/weekStartDate columns to work_items
- [x] Migration generated (0031_work_year_period.sql — hand-authored; drizzle-kit blocked by pre-existing duplicate-view warning)
- [x] Work router list procedure accepts year/period/weekStartDate filters
- [x] Work register UI has year + period filter pills
- [ ] Import pipeline populates year/period from CSV

## Schema changes

- Migration: `packages/db/src/migrations/0031_work_year_period.sql`
- New columns: `year` (integer), `period` (text), `week_start_date` (text)
- Indexes: `work_items_year_idx`, `work_items_period_idx`

## Router changes

`packages/api/src/routers/work.ts` — `ListWorkItemsInput` extended with three optional fields:
- `year: z.number().int().optional()`
- `period: z.string().optional()`
- `weekStartDate: z.string().optional()`

Handler adds `eq()` conditions for each when provided.

## UI changes

`apps/web/src/routes/_authenticated/work/index.tsx`:
- Added `yearFilter` (number, default 0 = All Years) and `periodFilter` (string) state
- Year dropdown: All Years / current year / previous year
- Period dropdown (visible only when year > 0): All Periods / Q1–Q4 for selected year
- Clear filters resets both new filters
- Query input passes `year` and `period` when set

## Notes

- `year` = calendar year of the work item
- `period` = quarter or week string e.g. "2026-Q2" or "2026-W18"
- `weekStartDate` = ISO date of the Monday of the work week (e.g. "2026-04-28")
- `weekStartDate` filter is wired in the router but not exposed in the UI (can be added when week-level filtering is needed)
- drizzle-kit `generate` fails with a pre-existing warning: "duplicated view name across public schema" (from `appraisal_tracker_view` in `appraisal-tracker-view.ts`). Migration was written by hand following the existing 0030 pattern.
