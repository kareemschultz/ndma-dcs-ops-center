# Phase 7 — Training

**Branch:** `phase/7-training`
**Based on:** Phase 6 gate commit `66fa5c9`
**Master plan ref:** §5.10–5.11

## Acceptance Criteria

- [x] Training plan matrix shows (team × staff × training areas) for 2026-2027 (`/training/plan`)
- [x] In-house training log CRUD (`/training/in-house`)
- [x] Exam voucher expiry fires "must-be-used-by" reminders at 30/14/7 days (`examVouchers.sendExpiryReminders`)
- [x] Training events form captures cost breakdown; total auto-sums (`/training/events`)
- [x] New hire onboarding auto-creates 8 tasks from template (`onboarding.createFromTemplates`)
- [x] Certification catalog visible to staff (`/training/catalog`)

## What Shipped

### Migrations
- **0026** — `training_plans`, `certification_catalog`, `exam_vouchers`, `training_events`, `training_event_participants`, `in_house_training_log`, `training_syllabi`, `assessment_questions` + extends `exam_schedule` with `window_start`, `window_end`, `exam_voucher_id`
- **0027** — `onboarding_task_templates` (with 8 seed rows), extends `onboarding_tasks` with `template_id`

### Schema
- `packages/db/src/schema/training-phase7.ts` — all 9 new Phase 7 tables + relations
- `packages/db/src/schema/exam-schedule.ts` — extended with Phase 7 columns
- `packages/db/src/schema/onboarding-tasks.ts` — added `templateId` FK

### API Routers (packages/api/src/routers/training-phase7.ts)
- `trainingPlans` — `list`, `upsert`
- `certCatalog` — `list`, `create`, `update`
- `examVouchers` — `list`, `create`, `assign`, `updateStatus`, `sendExpiryReminders`
- `trainingEvents` — `list`, `get`, `create`, `update`, `addParticipant`, `removeParticipant`
- `inHouseLog` — `list`, `create`, `update`, `delete`
- `syllabi` — `list`
- `assessmentQuestions` — `list`
- `onboarding` — `templates.list`, `createFromTemplates`
- Also wired existing `trainingRouter` into `appRouter` for the first time

### UI Routes
- `/training/` — Overview dashboard (quick-nav tiles + expiring vouchers + recent events + in-house + cert catalog preview)
- `/training/plan` — Staff × Training Areas matrix with per-staff edit dialog (year filter)
- `/training/exams` — Exam schedule (uses existing training records + assigned vouchers panel)
- `/training/vouchers` — Voucher registry with create/assign dialogs + 30-day expiry reminder button
- `/training/events` — Training events with cost-breakdown form (auto-sums total)
- `/training/in-house` — In-house log CRUD (year + staff filters, assessment toggle)
- `/training/catalog` — Certification catalog grouped by area

### Sidebar
- Replaced 3 stub Training items (all pointing to `/training`) with 7 real items:
  Overview, Training Plan, Exam Schedule, Vouchers, Events, In-House Log, Cert Catalog

## Deferred to Future Phases
- Exam schedule full CRUD (Phase 7 reuses existing `staff_training_records` for display; full Phase 7 spec window_start/window_end UI deferred to Phase 8+)
- Training syllabi editor UI (data model in place; read-only via `syllabi.list`)
- Assessment questions UI (data model in place; read-only via `assessmentQuestions.list`)
- Historical seed for training data (Phase 14)
