-- 0036_daily_attendance.sql
-- Daily Roll-Call attendance register (10-category status per NDMA HR spec).
-- Separate from attendance_logs (clock-in/out) — this is a per-day supervisor mark.
--
-- Also adds 5 columns to staff_profiles per the Staff Profile Enhancements feature:
--   profile_photo_url, emergency_contact_name, emergency_contact_phone,
--   next_appraisal_date, notes.

-- ── Enums ──
DO $$ BEGIN
  CREATE TYPE "daily_attendance_status" AS ENUM (
    'on_site',
    'wfh',
    'late',
    'half_day',
    'annual_leave',
    'sick',
    'compassionate',
    'maternity_paternity',
    'absent',
    'holiday'
  );
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "daily_attendance_source" AS ENUM ('manual', 'morning_auto', 'leave_planner');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- ── Table ──
CREATE TABLE IF NOT EXISTS "daily_attendance" (
  "id"               text PRIMARY KEY NOT NULL,
  "staff_profile_id" text NOT NULL,
  "date"             date NOT NULL,
  "status"           "daily_attendance_status" NOT NULL,
  "notes"            text,
  "marked_by"        text,
  "auto_source"      "daily_attendance_source" NOT NULL DEFAULT 'manual',
  "created_at"       timestamp NOT NULL DEFAULT now(),
  "updated_at"       timestamp NOT NULL DEFAULT now(),
  CONSTRAINT daily_attendance_staff_date_uq UNIQUE ("staff_profile_id", "date"),
  CONSTRAINT daily_attendance_staff_fkey
    FOREIGN KEY ("staff_profile_id") REFERENCES "staff_profiles"("id") ON DELETE CASCADE,
  CONSTRAINT daily_attendance_marker_fkey
    FOREIGN KEY ("marked_by") REFERENCES "user"("id") ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS daily_attendance_date_idx ON "daily_attendance"("date");
CREATE INDEX IF NOT EXISTS daily_attendance_staff_idx ON "daily_attendance"("staff_profile_id");
CREATE INDEX IF NOT EXISTS daily_attendance_status_idx ON "daily_attendance"("status");

-- ── Staff Profile Enhancements columns ──
ALTER TABLE "staff_profiles"
  ADD COLUMN IF NOT EXISTS "profile_photo_url"       text,
  ADD COLUMN IF NOT EXISTS "emergency_contact_name"  text,
  ADD COLUMN IF NOT EXISTS "emergency_contact_phone" text,
  ADD COLUMN IF NOT EXISTS "next_appraisal_date"     date,
  ADD COLUMN IF NOT EXISTS "notes"                   text;
