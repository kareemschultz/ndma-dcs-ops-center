-- Down migration for 0029 — revert appraisal_tracker_view + commendations

DROP VIEW IF EXISTS "appraisal_tracker_view";

DROP INDEX IF EXISTS "commendations_year_month_idx";
DROP INDEX IF EXISTS "commendations_staffProfileId_idx";
DROP TABLE IF EXISTS "commendations";
