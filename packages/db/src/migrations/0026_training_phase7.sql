-- Phase 7 — Training: new tables + exam_schedule extension
-- migration 0026

-- ─── Enums ─────────────────────────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE "voucher_status" AS ENUM ('unused','assigned','booked','complete_pass','complete_fail','missed','expired');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "training_participant_status" AS ENUM ('attended','cancelled','missed','waitlisted');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "gender_type" AS ENUM ('M','F','other','prefer_not_to_say');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "syllabus_name" AS ENUM ('noc_onboarding','intern_onboarding','dcs_onboarding');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "assessment_topic" AS ENUM ('about_ndma','administrative','backhaul','fibre','lte','monitoring_platform','troubleshooting','itop');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── training_plans ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "training_plans" (
  "id"                 serial PRIMARY KEY,
  "staff_id"           text NOT NULL REFERENCES "staff_profiles"("id") ON DELETE CASCADE,
  "year"               integer NOT NULL,
  "planned_trainings"  jsonb NOT NULL DEFAULT '[]',
  "created_at"         timestamptz NOT NULL DEFAULT now(),
  "updated_at"         timestamptz NOT NULL DEFAULT now(),
  UNIQUE ("staff_id", "year")
);
CREATE INDEX IF NOT EXISTS "training_plans_staffId_idx" ON "training_plans" ("staff_id");
CREATE INDEX IF NOT EXISTS "training_plans_year_idx"    ON "training_plans" ("year");

-- ─── certification_catalog ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "certification_catalog" (
  "id"               serial PRIMARY KEY,
  "training_area"    text NOT NULL,
  "recommended_cert" text NOT NULL,
  "vendor"           text,
  "level"            text,
  "created_at"       timestamptz NOT NULL DEFAULT now(),
  "updated_at"       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "cert_catalog_area_idx"   ON "certification_catalog" ("training_area");
CREATE INDEX IF NOT EXISTS "cert_catalog_vendor_idx" ON "certification_catalog" ("vendor");

-- ─── exam_vouchers ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "exam_vouchers" (
  "id"                 serial PRIMARY KEY,
  "voucher_number"     varchar(255) NOT NULL UNIQUE,
  "product_name"       text NOT NULL,
  "must_be_used_by"    date NOT NULL,
  "date_booked"        date,
  "assigned_staff_id"  text REFERENCES "staff_profiles"("id") ON DELETE SET NULL,
  "status"             "voucher_status" NOT NULL DEFAULT 'unused',
  "created_at"         timestamptz NOT NULL DEFAULT now(),
  "updated_at"         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "exam_vouchers_status_idx"       ON "exam_vouchers" ("status");
CREATE INDEX IF NOT EXISTS "exam_vouchers_mustBeUsedBy_idx" ON "exam_vouchers" ("must_be_used_by");
CREATE INDEX IF NOT EXISTS "exam_vouchers_assignedStaff_idx" ON "exam_vouchers" ("assigned_staff_id");

-- ─── Extend exam_schedule with Phase 7 columns ───────────────────────────────
ALTER TABLE "exam_schedule"
  ADD COLUMN IF NOT EXISTS "window_start"    date,
  ADD COLUMN IF NOT EXISTS "window_end"      date,
  ADD COLUMN IF NOT EXISTS "exam_voucher_id" integer REFERENCES "exam_vouchers"("id") ON DELETE SET NULL;

-- ─── training_events ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "training_events" (
  "id"                  serial PRIMARY KEY,
  "institution"         text NOT NULL,
  "description"         text NOT NULL,
  "start_date"          date NOT NULL,
  "end_date"            date NOT NULL,
  "duration"            text,
  "location"            text,
  "travelling_cost"     numeric(10,2) DEFAULT 0,
  "course_cost"         numeric(10,2) DEFAULT 0,
  "meals_cost"          numeric(10,2) DEFAULT 0,
  "accommodation_cost"  numeric(10,2) DEFAULT 0,
  "total_cost"          numeric(10,2) DEFAULT 0,
  "justification"       text,
  "results"             text,
  "created_at"          timestamptz NOT NULL DEFAULT now(),
  "updated_at"          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "training_events_startDate_idx"    ON "training_events" ("start_date");
CREATE INDEX IF NOT EXISTS "training_events_institution_idx"  ON "training_events" ("institution");

-- ─── training_event_participants ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "training_event_participants" (
  "id"                serial PRIMARY KEY,
  "training_event_id" integer NOT NULL REFERENCES "training_events"("id") ON DELETE CASCADE,
  "staff_id"          text NOT NULL REFERENCES "staff_profiles"("id") ON DELETE CASCADE,
  "gender"            "gender_type",
  "status"            "training_participant_status" NOT NULL DEFAULT 'attended',
  "created_at"        timestamptz NOT NULL DEFAULT now(),
  UNIQUE ("training_event_id", "staff_id")
);
CREATE INDEX IF NOT EXISTS "training_event_participants_eventId_idx" ON "training_event_participants" ("training_event_id");
CREATE INDEX IF NOT EXISTS "training_event_participants_staffId_idx" ON "training_event_participants" ("staff_id");

-- ─── in_house_training_log ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "in_house_training_log" (
  "id"                   serial PRIMARY KEY,
  "staff_id"             text NOT NULL REFERENCES "staff_profiles"("id") ON DELETE CASCADE,
  "training_name"        text NOT NULL,
  "date"                 date NOT NULL,
  "assessment_completed" boolean NOT NULL DEFAULT false,
  "notes"                text,
  "created_at"           timestamptz NOT NULL DEFAULT now(),
  "updated_at"           timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "in_house_training_log_staffId_idx" ON "in_house_training_log" ("staff_id");
CREATE INDEX IF NOT EXISTS "in_house_training_log_date_idx"    ON "in_house_training_log" ("date");

-- ─── training_syllabi ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "training_syllabi" (
  "id"            serial PRIMARY KEY,
  "syllabus_name" "syllabus_name" NOT NULL,
  "week"          integer NOT NULL,
  "day"           text NOT NULL,
  "activity"      text NOT NULL,
  "trainer"       text,
  "resources"     text,
  "outcomes"      text,
  "remarks"       text,
  "created_at"    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "training_syllabi_name_week_idx" ON "training_syllabi" ("syllabus_name", "week");

-- ─── assessment_questions ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "assessment_questions" (
  "id"          serial PRIMARY KEY,
  "topic"       "assessment_topic" NOT NULL,
  "question"    text NOT NULL,
  "answer"      text,
  "source_file" text,
  "created_at"  timestamptz NOT NULL DEFAULT now(),
  "updated_at"  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "assessment_questions_topic_idx" ON "assessment_questions" ("topic");
