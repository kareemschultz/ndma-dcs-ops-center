# Phase 8 — PPE, Lateness, Timesheets, TOSD

**Branch:** `phase/8-ppe-lateness-tosd`
**Base commit:** `2ced91b` (Phase 7 gate; rebased from `a4c1a53` during 2026-05-04 PR #29 merge)
**Gate commit on main:** `fb46d00` (rebased from squash `2b4fbc6`)
**Status:** 🟢 Done — shipped 2026-04-27

## Acceptance Criteria (from master plan §8)

- [ ] PPE matrix mirrors `PPE&IndividualTools_20240726_v01.xlsx` (17 items × staff + sizes + asset tags)
- [ ] Lateness quarterly grid matches `LatenessReportNOC&DC_2025_v01.xlsx` for Q1 2025
- [ ] TOSD register supports all 7 types; historical callout_legacy rows accessible
- [ ] Timesheet documents indexed (not parsed); filterable by (year, month, office)

## Checklist

### DB / Schema

- [ ] Migration 0028: extend `ppe_items` (add `has_size` bool, `has_asset_tag` bool, `category_v2` mapped from category text); migrate category text to enum; seed 17 canonical items via ON CONFLICT DO NOTHING
- [ ] Migration 0028: update `ppe_issuances` status enum (add `not_issued`, `n_a`, `stolen` values; rename `replaced`→dropped); add `asset_tag` column; drop old unique(staff,item) + add unique(staff,item,issued_date)
- [ ] Migration 0028: extend `lateness_records` (add `quarter int`, `notes text`, `days_missing_from_attendance int`, `days_on_schedule int`); add unique(staff_id, year, month)
- [ ] Migration 0028: new `timesheet_documents` table (id serial PK, staff_id FK, year int, month int, office enum, filename text, storage_path text, uploaded_by FK → user.id, uploaded_at timestamptz, unique(staff_id, year, month, office))
- [ ] Update `packages/db/src/schema/ppe.ts` to match new columns
- [ ] Update `packages/db/src/schema/lateness-records.ts` to match new columns
- [ ] New `packages/db/src/schema/timesheet-documents.ts`
- [ ] Export from `packages/db/src/schema/index.ts`

### API / Routers

- [ ] `packages/api/src/routers/ppe.ts` — extend existing: `issuances.upsert` handles new statuses; `items.list` returns 17 canonical items
- [ ] `packages/api/src/routers/lateness.ts` (new or extend) — list (year+quarter filters), upsert (per staff × month), quarterlyGrid
- [ ] `packages/api/src/routers/timesheet-documents.ts` (new) — list (year+month+office filter), upload metadata, delete
- [ ] Wire new routers into `packages/api/src/routers/index.ts`
- [ ] Add RBAC matrix entries for new procedures

### UI / Routes

- [ ] `/ppe` — PPE matrix page: 17-item columns × staff rows, size/asset-tag fields inline
- [ ] `/lateness` — Lateness quarterly grid: Q1-Q4 tabs, staff rows, daysLate/totalTimeLate/daysMissing/daysOnSchedule columns
- [ ] `/timesheets/documents` — Timesheet documents index: year+month+office filters, upload metadata form
- [ ] Update sidebar to point to real routes (not stubs)

### Protocol

- [ ] `CURRENT_PHASE.md` claimed at phase start ✅
- [ ] Phase checklist created ✅
- [ ] Gate commit on `phase/8-ppe-lateness-tosd`
- [ ] Squash-merge to main
- [ ] `IMPLEMENTATION_PLAN.md` updated (🟢 Done, SHA, date)
- [ ] `AGENT_LOG.md` entry appended
- [ ] `CHANGELOG.md` bullets appended
- [ ] `CURRENT_PHASE.md` cleared
