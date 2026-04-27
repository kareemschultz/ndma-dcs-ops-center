-- Extend leave_requests: add override_reason, overridden_by, violations
ALTER TABLE "leave_requests"
  ADD COLUMN IF NOT EXISTS "override_reason" text,
  ADD COLUMN IF NOT EXISTS "overridden_by" text REFERENCES "staff_profiles"("id") ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS "violations" jsonb;

-- New TOSD records table
CREATE TABLE IF NOT EXISTS "tosd_records" (
  "id" text PRIMARY KEY NOT NULL,
  "staff_id" text NOT NULL REFERENCES "staff_profiles"("id") ON DELETE CASCADE,
  "date" date NOT NULL,
  "type" text NOT NULL,
  "reason_text" text,
  "days" numeric(4,2),
  "hours" numeric(4,2),
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "tosd_type_check" CHECK ("type" IN ('reported_sick','medical','absent','time_off','work_from_home','lateness','callout_legacy')),
  CONSTRAINT "tosd_unique" UNIQUE ("staff_id","date","type")
);
CREATE INDEX IF NOT EXISTS "tosd_staff_idx" ON "tosd_records"("staff_id");
CREATE INDEX IF NOT EXISTS "tosd_date_idx" ON "tosd_records"("date");
