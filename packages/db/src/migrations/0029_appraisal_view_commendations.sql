-- Migration 0029 — Phase 4-5 spec follow-ups
-- Adds two master plan §5.3 entities that were missed during Phase 4 + Phase 5:
--   1. `commendations` table — positive recognition narratives per (staff, year, month);
--      sourced from NOC/appraisals/StaffCommendationJournal_20231216_v01.xlsx
--   2. `appraisal_tracker_view` — read-only DB VIEW joining appraisals + staff_profiles + user;
--      mirrors APPRAISAL TRACKER DCS.xlsx + AppraisalTracker_20241210_v01.xlsx (NOC) shape
--      (Name | Percentage | Period). Required for Phase 14 acceptance gate
--      gateAssertions["appraisalTrackerView.rowCount"] >= 130.
-- Idempotent — safe to re-run.

-- ============================================================================
-- 1. commendations
-- ============================================================================

CREATE TABLE IF NOT EXISTS "commendations" (
  "id" text PRIMARY KEY,
  "staff_profile_id" text NOT NULL REFERENCES "staff_profiles"("id") ON DELETE CASCADE,
  "year" integer NOT NULL,
  "month" integer NOT NULL CHECK ("month" >= 1 AND "month" <= 12),
  "narrative" text NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "commendations_staff_year_month_unique"
    UNIQUE ("staff_profile_id", "year", "month")
);

CREATE INDEX IF NOT EXISTS "commendations_staffProfileId_idx"
  ON "commendations" ("staff_profile_id");

CREATE INDEX IF NOT EXISTS "commendations_year_month_idx"
  ON "commendations" ("year", "month");

-- ============================================================================
-- 2. appraisal_tracker_view
-- ============================================================================
-- Mirrors the 3-column XLSX shape (Name | Percentage | Period) plus extra
-- structured fields for filtering/sorting in the UI. Filters to status='completed'
-- per master plan §5.3 spec.

CREATE OR REPLACE VIEW "appraisal_tracker_view" AS
SELECT
  a."id"                                   AS appraisal_id,
  a."staff_profile_id"                     AS staff_profile_id,
  u."name"                                 AS staff_name,
  a."percentage_score"                     AS percentage,
  a."period"                               AS period,
  a."period_start"                         AS period_start,
  a."period_end"                           AS period_end,
  EXTRACT(YEAR FROM a."period_end")::int   AS year,
  a."status"                               AS status,
  a."completed_date"                       AS completed_date,
  a."submitted_at"                         AS submitted_at,
  a."approved_at"                          AS approved_at
FROM "appraisals" a
JOIN "staff_profiles" sp ON sp."id" = a."staff_profile_id"
JOIN "user"           u  ON u."id"  = sp."user_id"
WHERE a."status" = 'completed';
