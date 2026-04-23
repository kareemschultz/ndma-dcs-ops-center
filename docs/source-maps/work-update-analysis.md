# NDMA Source-of-Truth Workbook Map

This document records the actual workbook files found under `category-zips/` and the source workbook that drives the Work Management module. The Excel files are the canonical layout and data reference for bulk import templates, historical migration scripts, and UI naming.

## Primary source workbook

- `C:\Users\admin\Documents\karetech\ndma-dcs-ops-center\WorkUpdate_20240118_v01.xlsx`
- Used as the source of truth for the Work Management module and operations-style task layout.

### WorkUpdate workbook sheet inventory

| Sheet | Rows | Cols | Purpose |
|---|---:|---:|---|
| `0301` | 94 | 7 | Monthly work register |
| `1001` | 134 | 7 | Monthly work register |
| `1701` | 115 | 8 | Monthly work register variant |
| `2401` | 128 | 14 | Monthly work register variant |
| `31012025` | 105 | 7 | Monthly work register |
| `070225` | 140 | 7 | Monthly work register |
| `1402` | 133 | 7 | Monthly work register |
| `2102` | 117 | 7 | Monthly work register |
| `2802` | 118 | 7 | Monthly work register |
| `0703` | 127 | 7 | Monthly work register |
| `1403` | 114 | 7 | Monthly work register |
| `2103` | 124 | 7 | Monthly work register |
| `2803` | 128 | 7 | Monthly work register |
| `0404` | 136 | 7 | Monthly work register |
| `1804` | 131 | 8 | Monthly work register variant |
| `1104` | 133 | 8 | Monthly work register variant |
| `2504` | 126 | 7 | Monthly work register |
| `0905` | 147 | 7 | Monthly work register |
| `0205` | 122 | 7 | Monthly work register |
| `Routine` | 38 | 8 | Recurring work / maintenance schedule |
| `TemporaryTracker` | 21 | 6 | Temporary changes / removals tracker |
| `CurrentWork` | 86 | 8 | Current work register with overdue/effort |
| `Analytics` | 11 | 8 | Summary dashboard by engineer |
| `OtherDept` | 54 | 8 | Cross-department / external intake |

### WorkUpdate canonical columns

Most monthly sheets share this structure:

- `Task Assigned`
- `Date Assigned`
- `Details`
- `Update (Completed/Not Completed & Why. Justify Deadline Extension)`
- `Deadline/Overdue`
- `Engineer`
- `iTop/Trello/Teams`

Variants add:

- `Priority`
- `Estimated Time (Hour)`
- `Weeks Overdue`

### WorkUpdate mapping rules

- Monthly sheets map to `work_items`.
- `Routine` maps to `work_item_templates`.
- `TemporaryTracker` maps to `temporary_changes`.
- `CurrentWork` maps to `work_items` plus current effort and overdue context.
- `Analytics` is a reporting sheet only and should not be imported as raw rows.
- `OtherDept` should be preserved as cross-department intake rather than forced into DCS-only work.

## Archive inventory from `category-zips`

### `Shared-leave.zip`

- `TimeOffSickDays_20251010_v01.xlsx`

Workbook sheet inventory:

- `2021`
- `2023-Callout`
- `2022-TOSD`
- `2023-TOSD`
- `2024-TOSD`
- `2025-TOSD`
- `2026- TOSD`

Source guidance:

- `2022-TOSD` through `2026- TOSD` are the leave history source.
- `2023-Callout` is a callout ledger and should be skipped for leave imports.
- Legacy `Compassionate` rows must map forward to `Special`.

### `Shared-training.zip`

Key files:

- `2024/ListTraining_20240709_v01.xlsx`
- `2025/ListTraining_20250101_v01.xlsx`
- `2026/Certifications2024_20240706_v01.xlsx`
- `2026/TrainingSchedule2026_2027.xlsx`
- `2026/TrainingDocumentationForm_2026 1.xlsx`
- `2026/DidYouKnowSeries_2026/clean desk policy.docx`
- `Exam Dates.xlsx`
- `Onboarding Checklist.xlsx`

Important workbook layouts:

- `ListTraining_20240709_v01.xlsx`
  - sheets: `2024`, `Cancel`
  - columns: `Name of Participant`, `Type of training/course`, `Facility`, `Date`
- `ListTraining_20250101_v01.xlsx`
  - sheets: `2025`, `Cancel`
  - columns: `Name of Participant`, `Type of training/course`, `Date`, `Facility`, `Details`
- `Certifications2024_20240706_v01.xlsx`
  - sheets: `Summary`, `2024 Budget`, `2025 Budget`, `2026 Budget`
  - budget sheet columns include `Certificate`, `Estimated Cost`, `Quota`, `Total`, `Target`, `Accept`, `Exam timeframe`, `Course Home`, `Procured, writing through`, `Update/will write`, `Completed`
- `TrainingSchedule2026_2027.xlsx`
  - sheets: `NOC`, `DCS`, `Certs`
  - columns are matrix-style staff/course layouts, not flat import tables
- `TrainingDocumentationForm_2026 1.xlsx`
  - sheet: `Training 2026`
  - structured event/training form with facilitator, description, cost, duration, dates, participants, location, beneficiaries, and justification

### `Shared-timesheets-2021.zip`

- Legacy PDF timesheets for 2021 and 2022 office staff.
- These are source records for attendance parsing and historical reconciliation.

### `Shared-timesheets-2023.zip`

- Monthly / semi-monthly PDF timesheets by staff member and period.
- Directory names such as `April 1-15` and `April 15-31` indicate pay/attendance windows.

### `Shared-timesheets-2024.zip`

- Monthly PDF timesheets by month folders.
- Source files are named per staff member, which makes staff resolution name-based.

### `Shared-timesheets-2025.zip`

- `NOCandDCS_AttendanceReport- ...` PDF attendance bundles
- `LatenessReportNOC&DC_2025_v01.xlsx`

Lateness workbook sheet inventory:

- `1st Quarter`
- `2nd Quarter`
- `3rd Quarter`
- `4th Quarter`

Workbook layout:

- Each quarter sheet contains repeated blocks by month.
- Columns include:
  - `Name`
  - `Month`
  - `Hours:Minutes:Seconds`
  - `# Days Late`
  - `# Days missing from attendance sheet`
  - `# Days on schedule`

### `Shared-timesheets-2026.zip`

- `DC & NOC Time Sheet - January 2026.pdf`
- `NOC and SOC Time Sheet February 2026.pdf`
- `LatenessReportNOC&DC_2025_v01.xlsx`

### `DCS.zip`

Key appraisals workbooks:

- `appraisal-tracker/APPRAISAL TRACKER DCS.xlsx`
- `appraisals/Appraisal Template 2025.xlsx`
- `appraisals/PerformanceEvaluationReport_20250226_v01.xlsx`

Observed appraisal layouts:

- `APPRAISAL TRACKER DCS.xlsx`
  - sheets: `Appraisal`, `FeedbackFromStaff`
  - columns: `Name`, `Percentage`, `Period 1`
  - feedback sheet columns: `Person`, `Feedback`, `Comment`, `Year`
- `Appraisal Template 2025.xlsx`
  - sheets: `Performance Evaluation`, `Notes`
  - used as the digital evaluation sheet mirror
  - notes sheet contains appraisal instructions and scoring rules

### `NOC.zip`

Key appraisals and career items:

- `appraisals/AppraisalTemplate_20250513_v01.xlsx`
- `appraisals/AppraisalTracker_20241210_v01.xlsx`
- `appraisals/EmployeeOfTheMonth_20240923_v01.xlsx`
- `appraisals/StaffCommendationJournal_20231216_v01.xlsx`
- `appraisals/StaffPerformanceJournal_20230731_v01.xlsx`

Observed layouts:

- `AppraisalTemplate_20250513_v01.xlsx`
  - sheets: `Performance Evaluation`, `Notes`
  - same digital appraisal form structure as DCS
- `AppraisalTracker_20241210_v01.xlsx`
  - sheet: `Appraisal`
  - columns: `Name`, `Percentage`, `Period`
- `EmployeeOfTheMonth_20240923_v01.xlsx`
  - monthly sheets from `Aug2024` through `March2026`
  - tabular score/metric layout with technician ranking logic
- `StaffCommendationJournal_20231216_v01.xlsx`
  - sheets: `2025`, `2026`
  - journal-style commendations by month
- `StaffPerformanceJournal_20230731_v01.xlsx`
  - sheets: `Summary` plus per-person tabs
  - detailed month-by-month performance notes

## Source-of-truth implementation rules

- Use the workbook sheet names and column names as the default import UI labels.
- Preserve `year` and `period` wherever a workbook is period-based.
- Preserve `source_file` in imported rows where the underlying dataset is archival.
- Do not infer a person link for global items when the workbook clearly allows a manual reminder or department-wide event.
- Keep DCS and NOC separated in imported scheduling, appraisals, and attendance data.
- Treat the workbook layout, not the earlier UI assumptions, as the canonical mapping source.
- Historical archive coverage and seed validation rules are tracked in `docs/source-maps/historical-seed-coverage.md`.

## Current import template mapping

- `operations-work-update-template.csv`
  - monthly work sheets, `Routine`, `TemporaryTracker`, `CurrentWork`, `OtherDept`
- `leave-management-template.csv`
  - leave history from `TimeOffSickDays_20251010_v01.xlsx`
- `scheduling-rosters-template.csv`
  - DCS on-call and NOC shift schedules
- `attendance-time-template.csv`
  - PDF attendance plus lateness rollups
- `appraisal-workflow-template.csv`
  - appraisal records, scores, notes, and workflow status
- `contract-management-template.csv`
  - contract end dates and renewal timeline
- `training-development-template.csv`
  - course imports, training logs, syllabus material, and reminder targets
- `hr-people-template.csv`
  - staff profile imports, phone numbers, reporting lines, and emergency contacts
- `policy-forms-template.csv`
  - company policies and internal forms
- `calendar-events-template.csv`
  - birthdays, training reminders, and manual/global events
