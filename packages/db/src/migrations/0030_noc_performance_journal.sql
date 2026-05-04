-- Migration 0030 — Phase 5 follow-up: noc_performance_journal
-- Resolves the naming-alignment question opened in docs/plan-questions.md (2026-05-04).
-- Master plan §5.3 specified `performance_journal_entries` for the NOC mistake-matrix
-- tracker, but that name was already taken by an unrelated entity in `hr-docs.ts`
-- (appraisal-period feedback log). Decision recorded: Option B — add the new table
-- under a distinct name `noc_performance_journal` and update master plan reference.
--
-- Source of truth: `NOC/appraisals/StaffPerformanceJournal_20230731_v01.xlsx`
-- (12 per-staff sheets × 4 years × 12 months × 4 categories = ~2,304 rows).
-- Phase 14 seed step 10 ingests into this table.

-- ============================================================================
-- 1. category enum
-- ============================================================================

DO $$ BEGIN
  CREATE TYPE "noc_perf_journal_category" AS ENUM (
    'tickets_itop',
    'alarms',
    'slack_whatsapp',
    'task_incomplete'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================================
-- 2. noc_performance_journal table
-- ============================================================================

CREATE TABLE IF NOT EXISTS "noc_performance_journal" (
  "id" text PRIMARY KEY,
  "staff_profile_id" text NOT NULL
    REFERENCES "staff_profiles"("id") ON DELETE CASCADE,
  "year" integer NOT NULL,
  "month" integer NOT NULL CHECK ("month" >= 1 AND "month" <= 12),
  "category" "noc_perf_journal_category" NOT NULL,
  "count" integer NOT NULL DEFAULT 0,
  "narrative" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "noc_performance_journal_staff_year_month_category_unique"
    UNIQUE ("staff_profile_id", "year", "month", "category")
);

CREATE INDEX IF NOT EXISTS "noc_performance_journal_staffProfileId_idx"
  ON "noc_performance_journal" ("staff_profile_id");

CREATE INDEX IF NOT EXISTS "noc_performance_journal_year_month_idx"
  ON "noc_performance_journal" ("year", "month");

CREATE INDEX IF NOT EXISTS "noc_performance_journal_category_idx"
  ON "noc_performance_journal" ("category");
