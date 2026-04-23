CREATE TYPE "exam_schedule_status" AS ENUM (
  'scheduled', 'passed', 'failed', 'cancelled', 'rescheduled'
);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "exam_schedule" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "staff_profile_id" text NOT NULL REFERENCES "staff_profiles"("id") ON DELETE CASCADE,
  "exam_name" text NOT NULL,
  "scheduled_date" date NOT NULL,
  "exam_date" date,
  "vendor" text,
  "certification_id" text,
  "voucher_id" text,
  "score" integer,
  "passing_score" integer,
  "notes" text,
  "status" "exam_schedule_status" NOT NULL DEFAULT 'scheduled',
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint
INSERT INTO "exam_schedule" (
  "id", "staff_profile_id", "exam_name", "scheduled_date", "status", "created_at", "updated_at"
)
SELECT
  gen_random_uuid()::text,
  "staff_id",
  "exam_name",
  "scheduled_date",
  CASE "status"::text
    WHEN 'Scheduled' THEN 'scheduled'
    WHEN 'Passed'    THEN 'passed'
    WHEN 'Failed'    THEN 'failed'
    ELSE 'scheduled'
  END::"exam_schedule_status",
  now(),
  now()
FROM "exam_dates";--> statement-breakpoint
DROP TABLE "exam_dates";--> statement-breakpoint
DROP TYPE "exam_date_status";
