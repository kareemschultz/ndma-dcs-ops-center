-- Phase 0 · migration 0008 · DOWN (manual rollback — NOT applied by drizzle-kit migrate)
--
-- DATA FIDELITY NOTE: This DOWN restores the 13-value enum SHAPE only.
-- On rollback, collapsed values cannot be un-collapsed:
--   'approved' could have been Approved_By_Manager, Processed_By_PA, or approved
--   'draft'    could have been Draft, draft, Pending_Approval, or scheduled
--   'completed' could have been Completed or completed
-- Inverse mapping uses the lowercase canonical value for all (not PascalCase originals).
-- This imperfect data fidelity is accepted per phase-0-stabilise.md §8.
--
-- Apply with: psql $DATABASE_URL -f 0008_enum_fix.down.sql

CREATE TYPE "appraisal_status_v1" AS ENUM (
  'Draft',
  'Pending_Approval',
  'Approved_By_Manager',
  'Processed_By_PA',
  'Completed',
  'draft',
  'scheduled',
  'in_progress',
  'submitted',
  'approved',
  'rejected',
  'completed',
  'overdue'
);
ALTER TABLE "appraisals" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "appraisals"
  ALTER COLUMN "status" TYPE "appraisal_status_v1"
  USING "status"::text::"appraisal_status_v1";
ALTER TABLE "appraisals" ALTER COLUMN "status" SET DEFAULT 'scheduled';
DROP TYPE "appraisal_status";
ALTER TYPE "appraisal_status_v1" RENAME TO "appraisal_status";
