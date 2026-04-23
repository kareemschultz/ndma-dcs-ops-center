# Master Implementation Directive

Source of truth: `C:\Users\admin\Documents\karetech\ndma-dcs-ops-center\category-zips`

Primary repo targets:

- `packages/db/src/schema/`
- `packages/api/src/routers/`
- `apps/web/src/routes/_authenticated/`
- `apps/web/src/components/layout/`
- `scripts/`

This plan is ordered by dependency. Do not start later phases until the earlier ones are stable enough to support them.

## Non-negotiables

- Strict DCS vs NOC data isolation.
- All dates/times default to `America/Guyana`.
- Use the existing Better T Stack, Hono, Bun, Drizzle ORM, and oRPC patterns already in the repo.
- Keep the local email/password admin fallback enabled.
- Apply audit logging to every mutation.
- Preserve legacy data where possible; map it forward with explicit compatibility rules instead of dropping it silently.
- Prefer shared helpers over page-specific copies for department scoping, leave-type display, training reminders, and staff visibility.
- Use URL search params for the global team filter so the state survives navigation and compaction.

## Phase 1: Leave Management & Calendar Core

Goal: normalize leave types and calendar events first, because later modules depend on the shared calendar.

- Update leave types:
  - add `Emergency`
  - add `No Pay`
  - add `Special`
  - remove `Compassionate`
- Legacy handling:
  - map `Compassionate` to `Special`
  - append a legacy note to the reason/notes field
- Create or keep `calendar_events` as the shared calendar source for birthdays, training reminders, and generic events.
- Update the Leave page pills and request form dropdowns to match the new visible types.
- Create `scripts/seed-leave.ts`.
  - Source: `category-zips/Shared-leave.zip`
  - Parse TOSD sheets only.
  - Skip callout/exception files.
  - Ignore `Callout` / `Attendance Exceptions` content entirely.
  - Target the historical leave CSV/XLSX rows that belong to `TimeOffSickDays`.
- Leave API:
  - `GET` / `POST` leave request paths must expose the updated enum names.
  - read routes should surface the new values to the UI.

Acceptance:
- Leave API returns the updated types.
- The Leave UI shows no Compassionate pill anywhere.
- Historical leave seed can be re-run safely.
- `calendar_events` remains the central shared calendar source.

## Phase 2: Scheduling Consolidation

Goal: unify the schedule navigation and add the cross-department filter before building more department-scoped pages.

- Sidebar cleanup:
  - remove Attendance Exceptions
  - remove Callout Register
  - consolidate DCS On-Call Roster and NOC Shift Schedule into `Scheduling & Rosters`
- Create a horizontal tabbed Scheduling view:
  - `DCS On-Call`
  - `NOC Shifts`
  - `Maintenance Planner`
- Add a global Department Filter in the authenticated header:
  - values: `All`, `DCS`, `NOC`
  - persist in URL search params as `team`
- Update Staff, Leave, Training, Appraisals, and future attendance views to read the filter.
- Add roster UX enhancements:
  - `Edit Roster` primary button
  - `My On-Call` / `My Shifts` quick filter
- Keep DCS `on_call_roster` separate from NOC `noc_shifts`.
- Ensure DCS staff never appear in NOC shift views and NOC staff never appear in DCS on-call views.
- Keep the roster edit surface within the scheduling tabs rather than introducing a duplicate sidebar entry.

Acceptance:
- Each scheduling page respects the same global `team` filter.
- DCS and NOC datasets remain separate in the UI.
- The Scheduling & Rosters tab set is the single entry point for roster scheduling.

## Phase 3: Appraisals, Exams, and Workflow

Goal: finish appraisal workflow and the exam tracking path.

- Drizzle:
  - ensure appraisal workflow statuses support `Draft -> Pending_Approval -> Approved_By_Manager -> Processed_By_PA -> Completed`
  - add `exam_dates`
- Next.js:
  - appraisal approval pipeline
  - Team Leads: show `Submit for Approval`
  - Manager (Sachin): show `Approve`
  - PA (Ataybia): show `Export & Send to HR`
  - Staff: read-only visibility only when appraisal is `Completed` or `Processed_By_PA`
  - team filter on the main Appraisals page
  - consolidated staff appraisal detail view
- Hono:
  - workflow endpoints for submit/approve/process
  - department-scoped reads
- Ingestion:
  - parse appraisal source workbooks from DCS and NOC archives
  - seed exam dates from `category-zips/Exam Dates.xlsx`
- Digital sheet rendering must mirror the legacy physical appraisal format closely enough for operational use.
- Retain historical periods and show them in the staff detail view.
- Consolidate scores for a single person into one detail experience.

Acceptance:
- Team Leads can submit.
- Manager can approve.
- PA can process/export.
- Staff only see their own completed/processed records.
- Historical appraisal periods remain visible in the UI.
- Exam tracking is seeded from the shared workbook.

## Phase 4: Training, Policies, and Budgets

Goal: turn training into a first-class module with reminders and forecasting.

- Drizzle:
  - `training_courses`
  - `staff_training_records`
  - `training_materials`
  - `company_policies`
  - `certification_budgets`
- Backend:
  - training reminders endpoint or cron-style routine
  - inject upcoming training reminders into `calendar_events`
  - manual send-reminder endpoint
- UI:
  - Training Records page with:
    - Staff Training Logs
    - Curriculum & Syllabus
    - Budget & Forecasting
  - `/policy` viewer with self-service policy access
- Ingestion:
  - `scripts/seed-training.ts`
  - `scripts/seed-policies-budgets.ts`
  - parse shared and NOC training workbooks
  - parse policy DOCX text
  - parse certification budget tabs for 2024 to 2026
- Source files:
  - `NOC.zip/training/TrainingLog_20260211_v01.xlsx`
  - `NOC.zip/training/DCS-NOC-GOALCiscoCourses_20230817_v01.xlsx`
  - `NOC.zip/training/HuaweiCertificate2023Participants_20231120_v01.xlsx`
  - `NOC.zip/training/NOCTrainingProgramSyllabus_20250209_v01.xlsx`
  - `Shared-training.zip/2026/TrainingSchedule2026_2027.xlsx`
  - `Shared-training.zip/2026/TrainingDocumentationForm_2026 1.xlsx`
  - `Shared-training.zip/2024/ListTraining_20240709_v01.xlsx`
  - `Shared-training.zip/2025/ListTraining_20250101_v01.xlsx`
  - `Shared-training.zip/2026/Certifications2024_20240706_v01.xlsx`
  - `Shared-training.zip/2026/clean desk policy.docx`
- Reminder logic:
  - scan non-completed training records with near-term target dates
  - push reminder rows into `calendar_events` with `event_type = 'Training'`
  - support a manual send-reminder trigger for staff notifications
- Budget forecasting:
  - aggregate certification budgets by year across 2024, 2025, and 2026
  - default currency is GYD

Acceptance:
- Training reminders appear in the calendar.
- Budget forecasting aggregates by year.
- Policy page shows the Clean Desk Policy and future documents.
- Training materials and course entries can be regenerated from the source workbooks.

## Phase 5: Timesheets and Lateness

Goal: add attendance history and manager-ready lateness summaries.

- Drizzle:
  - `attendance_logs`
  - `lateness_records`
- UI:
  - Attendance & Time page
  - Lateness Dashboard
  - Individual Timesheet view
- Ingestion:
  - `scripts/seed-attendance.ts`
  - parse FingerTec PDFs
  - parse quarterly lateness workbook sheets
  - document remaining historical Shared-timesheets parsing rules
- Source files:
  - `category-zips/Shared-timesheets-2021.zip`
  - `category-zips/Shared-timesheets-2023.zip`
  - `category-zips/Shared-timesheets-2024.zip`
  - `category-zips/Shared-timesheets-2025.zip`
  - `category-zips/Shared-timesheets-2026.zip`
- PDF parsing must extract:
  - user name
  - date
  - in
  - out
  - work hours
- Time normalization must respect `America/Guyana`.
- Lateness dashboard should support sorting by total time late and days late.

Acceptance:
- Managers can sort lateness by total time late or days late.
- Attendance views respect the global department filter.
- Remaining shared-timesheet parsing rules are documented in the repo.

## Phase 6: HR Self-Service, Contracts, PPE, and RBAC

Goal: finish self-service and enforce strict role-based access across all read/write paths.

- Drizzle:
  - `staff.phone_number`
  - `staff.reports_to`
  - staff role enum values: `Staff`, `Team_Lead`, `Manager`, `PA`, `Admin`
  - contracts tracking fields
  - `ppe_tools`
- RBAC:
  - create reusable middleware/helpers under `middleware/auth.ts`
  - staff queries limited to self
  - team leads limited to direct reports
  - managers and PAs can read within their scope for approvals
- Isolation rules:
  - staff GET routes must filter by current user
  - team leads can read records where `reports_to = current_user_id`
  - managers and PAs can read across their departments for approvals
- UI:
  - self-service profile editing for phone and emergency contacts only
  - staff directory phone column
- Ingestion:
  - `scripts/seed-hr-data.ts`
  - parse roster-related contracts and PPE source files
- Policy page:
  - dedicated `/policy` route
  - self-service viewer, but only the authenticated user can edit their own phone and emergency contacts
- Contracts:
  - track start/end/renewal/appraisal period fields
- PPE tools:
  - item name, issue date, condition, staff link

Acceptance:
- Staff cannot edit anyone else’s personal data.
- Direct-report access works.
- Directory shows phone numbers.
- Self-service only updates the authenticated user’s own record fields.

## Phase 7: Final Polish and Regression Safety

Goal: lock in stability after the data model and access model are complete.

- Typecheck and build the web app.
- Generate and review migrations.
- Run targeted smoke checks for the new routes.
- Add or refresh seeds only after schema and route changes settle.
- Keep the implementation plan updated with each completed batch.

## Phase 8: Work & Project Management Module

Goal: replace the legacy Excel work tracker with a relational work register, task board, and analytics surface.

- Drizzle:
  - reuse the existing work item model as the source of truth for tasks and comments
  - preserve recurring templates for routine work
  - preserve the temporary tracker for expiring changes and loaned assets
  - keep external source and reference tracking on every imported item
- UI:
  - `/work` route with Table, Board/Kanban, Grid, Calendar, and Analytics views
  - sidebar entry for Work Register and Workload
  - task detail view with comments and status updates
  - worker-facing board cards for fast triage
- Ingestion:
  - `scripts/seed-tasks.ts`
  - parse `WorkUpdate_20240118_v01.xlsx`
  - map monthly sheets and `CurrentWork` into tasks
  - map `Routine` into recurring templates
  - map `TemporaryTracker` into expiring change records
  - map `OtherDept` into cross-department follow-up tasks
- Source notes:
  - workbook tabs are the layout source of truth for the operations UI
  - preserve sheet and row provenance in comments/reference fields where possible

Acceptance:
- The work tracker is no longer spreadsheet-only.
- Importing the workbook creates a visible work register with comments/history.
- Routine and temporary items remain distinguishable in the UI.
- Work pages respect the department filter and the DCS/NOC scoping model.

## Dataset Map

Archive layout:

- `DCS.zip`
  - appraisals
  - contracts
  - on-call
  - PPE
- `NOC.zip`
  - appraisals
  - training
  - shift-schedule
  - contracts
  - leave
- `Shared-leave.zip`
  - leave history workbook
- `Shared-training.zip`
  - shared training workbooks and policy/budget sources
- `Shared-timesheets-2021.zip` through `Shared-timesheets-2026.zip`
  - attendance, lateness, and timesheet history
- `category-zips/folder_structure.txt`
  - top-level archive inventory

## Training Source Notes

- `NOC.zip/training/NOCTrainingProgramSyllabus_20250209_v01.xlsx`
  - sheets: `Program`, `RecommendedBooks`, `Checklist`, `OtherTraining`
  - use `Program` for curriculum rows
  - use `RecommendedBooks` and `Checklist` for materials
- `NOC.zip/training/TrainingLog_20260211_v01.xlsx`
  - sheet: `Sheet1`
  - columns: Technician, training name, date, assessment completed
- `NOC.zip/training/DCS-NOC-GOALCiscoCourses_20230817_v01.xlsx`
  - mixed training list for DCS and NOC staff
- `NOC.zip/training/HuaweiCertificate2023Participants_20231120_v01.xlsx`
  - participant lists by group
- `Shared-training.zip/2024/ListTraining_20240709_v01.xlsx`
- `Shared-training.zip/2025/ListTraining_20250101_v01.xlsx`
  - annual participant/course lists
- `Shared-training.zip/2026/TrainingSchedule2026_2027.xlsx`
  - DCS and NOC sheets for future scheduled courses
- `Shared-training.zip/2026/TrainingDocumentationForm_2026 1.xlsx`
  - future training documentation and participant lists
- `Shared-training.zip/2026/Certifications2024_20240706_v01.xlsx`
  - budget tabs: `2024 Budget`, `2025 Budget`, `2026 Budget`

## Policy / Budget Source Notes

- `Shared-training.zip/2026/clean desk policy.docx`
  - parse to seed `company_policies`
- `Shared-training.zip/2026/Certifications2024_20240706_v01.xlsx`
  - seed `certification_budgets`

## Attendance Source Notes

- `Shared-timesheets-*.zip`
  - archive family for historical attendance and lateness
- `category-zips/Exam Dates.xlsx`
  - seed `exam_dates`

## Working Rule

Implement in order:

1. Leave and calendar core
2. Scheduling consolidation and global team filter
3. Appraisals and exams
4. Training, policies, and budgets
5. Attendance and lateness
6. Self-service, contracts, PPE, and RBAC
7. Polish and regression safety

If a later task depends on data or schema not yet landed, stop and backfill the missing prerequisite rather than forcing the feature in front-end only.

## Execution Notes

- Keep the plan updated as each module lands.
- Prefer shared backend helpers for scoping/filtering over ad hoc route logic.
- Add seed scripts only after the schema they target exists.
- Regenerate migrations after schema changes.
