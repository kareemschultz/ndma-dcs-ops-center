# NDMA Import Templates

Use these CSV templates to mass import data into the NDMA portal.
They are aligned to the workbook source of truth found under `category-zips/`:

- `WorkUpdate_20240118_v01.xlsx`
- `TimeOffSickDays_20251010_v01.xlsx`
- `ListTraining_20240709_v01.xlsx`
- `ListTraining_20250101_v01.xlsx`
- `Certifications2024_20240706_v01.xlsx`
- `TrainingSchedule2026_2027.xlsx`
- `LatenessReportNOC&DC_2025_v01.xlsx`
- `APPRAISAL TRACKER DCS.xlsx`
- `Appraisal Template 2025.xlsx`
- `AppraisalTemplate_20250513_v01.xlsx`
- `AppraisalTracker_20241210_v01.xlsx`

Historical archive coverage and preservation rules are documented in:

- `docs/source-maps/historical-seed-coverage.md`

## Templates

- `operations-work-update-template.csv` - mirrors the WorkUpdate workbook structure
- `work-management-template.csv` - simplified work, routine, and temporary item import template
- `leave-management-template.csv` - leave requests, balances, and historical leave rows
- `scheduling-rosters-template.csv` - DCS on-call and NOC shifts
- `attendance-time-template.csv` - attendance logs and lateness summaries
- `appraisal-workflow-template.csv` - appraisal records, scores, notes, and promotions
- `contract-management-template.csv` - contract dates, renewals, and appraisal periods
- `training-development-template.csv` - courses, staff training records, and materials
- `hr-people-template.csv` - staff profile basics, phone numbers, and reporting lines
- `policy-forms-template.csv` - policies and internal forms
- `calendar-events-template.csv` - birthdays, training reminders, and manual/global events
- `promotions-template.csv` - career progression letters and promotion dates
- `exam-dates-template.csv` - staff certification exam dates
- `onboarding-tasks-template.csv` - onboarding checklist tasks

## Bulk import coverage

The import wizard now accepts the following bulk-upload sections:

- Staff profiles and self-service contact details
- Work update, routines, and temporary tracker rows
- DCS on-call roster and NOC shifts
- Leave, attendance, contracts, and training
- Appraisals, promotions, exam dates, onboarding tasks
- Company policies, internal forms, and calendar events
- Calendar events can leave `staff_email` blank when the reminder applies to everyone

Each card in the import UI can generate a CSV template with headers and example rows.
The operations workbook uses the `Operations Workbook` card and keeps the sheet-name, deadline, and overdue columns from the legacy Excel file.

## Notes

- Fill `year` and `period` wherever the source data is period-based.
- Use ISO dates: `YYYY-MM-DD`.
- Use `America/Guyana` local dates and times for operational records.
- Leave blank fields empty rather than inventing placeholder text.
- `staff_id` should reference the existing staff record whenever possible.
- The master seed validates the full historical archive set before importing, so older records remain the source of truth rather than being overwritten by current-only data.
