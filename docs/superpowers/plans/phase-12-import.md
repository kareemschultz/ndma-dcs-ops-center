# Phase 12 — Import module

**Branch:** `phase/12-import-templates`
**Based on:** c72f127 (Phase 9 WIP gate)
**Status:** In Progress (started 2026-05-06)
**Master plan ref:** §7 Import pipeline, §8 Phase 12

---

## Acceptance criteria

- [x] CSV templates created for all 18 import types
- [x] Templates aligned to server-side Zod schema column names
- [x] 2–3 realistic NDMA DCS sample rows per template
- [ ] Import UI links to static template files (currently uses dynamic generation — acceptable)
- [ ] Validation rules documented per template (see Column Specs section below)
- [ ] 30+ column spec per master plan §7 (see individual templates)

---

## Templates created

All files are in `apps/web/public/import-templates/`:

| File | Import type | Required columns | Notes |
|------|-------------|-----------------|-------|
| `staff.csv` | `staff` | name, email, department, employmentType | employmentType: full_time / part_time / contract / temporary |
| `training.csv` | `training` | staffEmail, courseTitle, status | courseType: Certification / Syllabus / Internship |
| `contracts.csv` | `contracts` | staffEmail, contractType, startDate | renewalStatus enum: 6 values |
| `work.csv` | `work` | recordKind, projectTitle, taskTitle, status, priority | recordKind: work_item / routine / temporary |
| `operations_work_update.csv` | `operations_work_update` | recordType, sheetName, taskAssigned, updateStatus, priority | Mirrors WorkUpdate workbook structure |
| `roster.csv` | `roster` | rosterType, staffEmail, shiftDate, shiftType | rosterType: dcs_on_call / noc_shifts |
| `platform_accounts.csv` | `platform_accounts` | staffEmail, platformName, accountUsername | NOTE: `platform_accounts` is in getHistory enum but NOT in execute enum — import not yet wired server-side |
| `leave.csv` | `leave` | staffEmail, leaveTypeCode, startDate, endDate, totalDays | Dates must be 2026-XX-XX ONLY; staff must pre-exist |
| `ppe.csv` | `ppe` | staffEmail, ppeItemCode, issuedDate | ppeItemCode must match codes in ppe_items table |
| `attendance.csv` | `attendance` | staffEmail, date, type | Routes through tosd_records (Phase 2) |
| `callouts.csv` | `callouts` | staffEmail, date, incidentTitle | Routes through tosd_records as callout_legacy |
| `appraisals.csv` | `appraisals` | staffEmail, year, period, periodStart, periodEnd, status | Rows may repeat for same appraisal to add scores/notes |
| `calendar_events.csv` | `calendar_events` | title, eventType, eventDate | eventType: Birthday / Training / Event |
| `promotions.csv` | `promotions` | staffEmail, promotionDate, toTitle | letterDate and letterUrl are optional |
| `exam_schedule.csv` | `exam_schedule` | staffEmail, examName, scheduledDate | status: scheduled / passed / failed / cancelled / rescheduled |
| `onboarding.csv` | `onboarding` | staffEmail, taskName, category | isCompleted: true / false; completedAt optional |
| `policy.csv` | `policy` | title, contentText, lastUpdated | documentUrl is optional |
| `forms.csv` | `forms` | title, category, fileUrl | category enum: HR & Leave / Finance / Operations / IT / General |

---

## Import type gap analysis

The `import_type` DB enum has 18 values. The `execute` procedure (import router) currently handles 15:

| Import type | execute handler | getHistory enum | Static template |
|-------------|----------------|-----------------|-----------------|
| staff | yes | yes | yes |
| training | yes | yes | yes |
| contracts | yes | yes | yes |
| work | yes | yes | yes |
| operations_work_update | yes | yes | yes |
| roster | yes | yes | yes |
| platform_accounts | **missing** | yes | yes (stub) |
| leave | yes | yes | yes |
| ppe | yes | yes | yes |
| attendance | **missing** | yes | yes (stub) |
| callouts | **missing** | yes | yes (stub) |
| appraisals | yes | yes | yes |
| calendar_events | yes | yes | yes |
| promotions | yes | yes | yes |
| exam_schedule | yes | yes | yes |
| onboarding | yes | yes | yes |
| policy | yes | yes | yes |
| forms | yes | yes | yes |

`platform_accounts`, `attendance`, and `callouts` have templates and are in the history enum but have no execute handler. Per CLAUDE.md: attendance and callouts "now route through `tosd_records` (Phase 2) — verify routing before relying on these import types."

---

## Column validation rules (condensed)

### Common rules across all templates
- All dates: `YYYY-MM-DD` (ISO 8601)
- All emails: must match an existing staff record (except `staff` import which creates new records)
- Blank optional fields: leave empty, do not put placeholder text

### Per-type highlights
- **leave**: `startDate` and `endDate` must be `2026-XX-XX` — server enforces this with regex
- **ppe**: `ppeItemCode` must match one of the 17 canonical codes in the `ppe_items` table
- **leave**: `leaveTypeCode` must match an active leave type code (AL, SL, ML, STL)
- **appraisals**: Multiple rows for the same `staffEmail + year + period + evaluationType` are valid; scores and notes are additive
- **roster**: `rosterType` must be exactly `dcs_on_call` or `noc_shifts`
- **forms**: `category` must be exactly one of: `HR & Leave`, `Finance`, `Operations`, `IT`, `General`

---

## UI integration note

The import page (`apps/web/src/routes/_authenticated/import/index.tsx`) already includes a "Download CSV Template" button on each import card. This button generates the CSV dynamically from `IMPORT_TARGETS` sample data. The static files in `public/import-templates/` serve as:
1. A canonical reference for data teams working outside the browser
2. A fallback direct-link option (`/import-templates/staff.csv`)
3. Documentation artefacts for the master plan §7 data pipeline

Phase 12 follow-up work can add an `<a href="/import-templates/{type}.csv">` static link alongside the dynamic download button to offer both options.
