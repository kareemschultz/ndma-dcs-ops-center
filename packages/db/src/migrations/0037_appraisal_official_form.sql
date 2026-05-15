-- 0037_appraisal_official_form.sql
-- Adds columns to `appraisals` so the system can capture the full official
-- NDMA Performance Evaluation Form (Appraisal_*.xlsx) layout:
--   * per-category reviewer comments (8 rating categories)
--   * the 4 development-summary free-text sections
--   * the comment block on the Core Responsibilities section
--   * goals stored as Goal + Performance Indicator pairs
--
-- All idempotent — safe to re-run. NOT applied automatically.

ALTER TABLE "appraisals"
  ADD COLUMN IF NOT EXISTS "category_comments" jsonb,
  ADD COLUMN IF NOT EXISTS "responsibilities_comment" text,
  ADD COLUMN IF NOT EXISTS "areas_of_strength" text,
  ADD COLUMN IF NOT EXISTS "improvements_made" text,
  ADD COLUMN IF NOT EXISTS "areas_for_development" text,
  ADD COLUMN IF NOT EXISTS "development_actions" text,
  ADD COLUMN IF NOT EXISTS "goal_indicators" jsonb;

COMMENT ON COLUMN "appraisals"."category_comments" IS 'Per-category reviewer comments keyed by rating-matrix key (organisational_skills, quality_of_work, ...).';
COMMENT ON COLUMN "appraisals"."goal_indicators" IS 'Performance indicator string for each goal, parallel-indexed to the goals jsonb array.';
