-- Migration 0031 — Phase 11: add year / period / weekStartDate to work_items
-- These columns support temporal filtering of work items by calendar year,
-- period label (e.g. "2026-Q2", "2026-W18"), and week-start ISO date.
-- The import pipeline (Phase 12) will populate these from CSV.

-- ============================================================================
-- 1. New columns on work_items
-- ============================================================================

ALTER TABLE "work_items"
  ADD COLUMN IF NOT EXISTS "year" integer,
  ADD COLUMN IF NOT EXISTS "period" text,
  ADD COLUMN IF NOT EXISTS "week_start_date" text;

-- ============================================================================
-- 2. Indexes for efficient filtering
-- ============================================================================

CREATE INDEX IF NOT EXISTS "work_items_year_idx"
  ON "work_items" ("year");

CREATE INDEX IF NOT EXISTS "work_items_period_idx"
  ON "work_items" ("period");
