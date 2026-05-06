-- Migration 0031 down — remove year / period / weekStartDate from work_items

DROP INDEX IF EXISTS "work_items_period_idx";
DROP INDEX IF EXISTS "work_items_year_idx";

ALTER TABLE "work_items"
  DROP COLUMN IF EXISTS "week_start_date",
  DROP COLUMN IF EXISTS "period",
  DROP COLUMN IF EXISTS "year";
