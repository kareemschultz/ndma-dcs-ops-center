# Current Phase

**Active phase:** Phase 7 - Training
**Status:** In Progress
**Agent:** Claude Code
**Branch:** phase/7-training
**Started:** 2026-04-27

## What is being built

Phase 7 adds the full Training and Onboarding module per master plan section 5.10-5.11.

New tables: training_plans, certification_catalog, exam_schedule, exam_vouchers,
training_events, training_event_participants, in_house_training_log, training_syllabi,
assessment_questions, onboarding_task_templates, extend onboarding_tasks.

Training router extended with all new procedures.
6 training UI routes replacing 3 stub sidebar items.

## Acceptance criteria
- Training plan matrix (team x staff x training areas) for 2026-2027
- In-house training log CRUD
- Exam voucher expiry reminders at 30/14/7 days
- Training events form with cost breakdown auto-sum
- New hire onboarding auto-creates 8 tasks from template
- Certification catalog visible to staff

## Notes
- Phase 6 gate commit: 66fa5c9
- Next migration index: 0026
