-- DCS on-call weeks (simple per-role per-week assignment table)
CREATE TABLE IF NOT EXISTS "dcs_on_call_weeks" (
  "id" text PRIMARY KEY NOT NULL,
  "year" integer NOT NULL,
  "week_num" integer NOT NULL,
  "week_start_date" date NOT NULL,
  "week_end_date" date NOT NULL,
  "lead_engineer_id" text REFERENCES "staff_profiles"("id") ON DELETE SET NULL,
  "asn_support_id" text REFERENCES "staff_profiles"("id") ON DELETE SET NULL,
  "enterprise_support_id" text REFERENCES "staff_profiles"("id") ON DELETE SET NULL,
  "core_support_id" text REFERENCES "staff_profiles"("id") ON DELETE SET NULL,
  "notes" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "dcs_on_call_weeks_unique" UNIQUE ("year","week_num")
);

-- Quarterly routine maintenance tasks
DO $$ BEGIN
  CREATE TYPE "quarterly_maintenance_status" AS ENUM ('pending','in_progress','complete','deferred');
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE IF NOT EXISTS "quarterly_maintenance_tasks" (
  "id" text PRIMARY KEY NOT NULL,
  "year" integer NOT NULL,
  "quarter" integer NOT NULL,
  "task_name" text NOT NULL,
  "assigned_staff_ids" text[] DEFAULT '{}',
  "completion_status" "quarterly_maintenance_status" NOT NULL DEFAULT 'pending',
  "completion_date" date,
  "completion_notes" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "quarterly_maint_unique" UNIQUE ("year","quarter","task_name")
);

-- DCS on-call swaps (tied to dcs_on_call_weeks, separate from existing on_call_swaps in rota)
DO $$ BEGIN
  CREATE TYPE "dcs_swap_status" AS ENUM ('pending','approved','rejected','cancelled');
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE IF NOT EXISTS "dcs_oncall_swaps" (
  "id" text PRIMARY KEY NOT NULL,
  "requester_id" text NOT NULL REFERENCES "staff_profiles"("id") ON DELETE CASCADE,
  "original_week_id" text NOT NULL REFERENCES "dcs_on_call_weeks"("id") ON DELETE CASCADE,
  "role" text NOT NULL,
  "target_staff_id" text NOT NULL REFERENCES "staff_profiles"("id") ON DELETE CASCADE,
  "target_week_id" text NOT NULL REFERENCES "dcs_on_call_weeks"("id") ON DELETE CASCADE,
  "status" "dcs_swap_status" NOT NULL DEFAULT 'pending',
  "reason" text,
  "reviewed_by" text REFERENCES "staff_profiles"("id") ON DELETE SET NULL,
  "reviewed_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL
);
