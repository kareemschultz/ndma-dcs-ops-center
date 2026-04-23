-- Phase 0 · migration 0008 · collapse appraisalStatusEnum to 7 canonical lowercase values
--
-- Problem: appraisal_status enum accumulated 13 mixed-case values across two dev phases.
--          This migration collapses to 7 canonical lowercase values used by all new code.
--
-- Mapping (approved Kareem Schultz 2026-04-23, see phase-0-stabilise.md §4):
--   Draft, draft, Pending_Approval, scheduled  →  draft
--   in_progress                                →  in_progress
--   submitted                                  →  submitted
--   Approved_By_Manager, Processed_By_PA,
--   approved                                   →  approved
--   rejected                                   →  rejected
--   Completed, completed                       →  completed
--   overdue                                    →  overdue
--
-- BLOCKING (prod): Run before applying to prod:
--   SELECT status, COUNT(*) FROM appraisals GROUP BY status;
--   All values must be within the 13 known values above.
--   Row count before migration == row count after.
--
-- DOWN: see 0008_enum_fix.down.sql (manual rollback — imperfect data fidelity, see comments there)

CREATE TYPE "appraisal_status_v2" AS ENUM (
  'draft',
  'in_progress',
  'submitted',
  'approved',
  'rejected',
  'completed',
  'overdue'
);--> statement-breakpoint
ALTER TABLE "appraisals" ALTER COLUMN "status" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "appraisals" ALTER COLUMN "status" TYPE "appraisal_status_v2" USING (
  CASE "status"::text
    WHEN 'Draft'                THEN 'draft'
    WHEN 'draft'                THEN 'draft'
    WHEN 'Pending_Approval'     THEN 'draft'
    WHEN 'scheduled'            THEN 'draft'
    WHEN 'in_progress'          THEN 'in_progress'
    WHEN 'submitted'            THEN 'submitted'
    WHEN 'Approved_By_Manager'  THEN 'approved'
    WHEN 'Processed_By_PA'      THEN 'approved'
    WHEN 'approved'             THEN 'approved'
    WHEN 'rejected'             THEN 'rejected'
    WHEN 'Completed'            THEN 'completed'
    WHEN 'completed'            THEN 'completed'
    WHEN 'overdue'              THEN 'overdue'
    ELSE 'draft'
  END::"appraisal_status_v2"
);--> statement-breakpoint
ALTER TABLE "appraisals" ALTER COLUMN "status" SET DEFAULT 'draft';--> statement-breakpoint
DROP TYPE "appraisal_status";--> statement-breakpoint
ALTER TYPE "appraisal_status_v2" RENAME TO "appraisal_status";
