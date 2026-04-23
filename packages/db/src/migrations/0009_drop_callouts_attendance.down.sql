CREATE TYPE "callout_type" AS ENUM ('phone', 'sms', 'whatsapp', 'email', 'manual');
CREATE TYPE "callout_status" AS ENUM ('logged', 'reviewed', 'closed');
CREATE TYPE "attendance_exception_type" AS ENUM (
  'reported_sick', 'medical', 'absent', 'lateness', 'wfh', 'early_leave', 'other'
);
CREATE TYPE "attendance_exception_status" AS ENUM (
  'draft', 'submitted', 'approved', 'rejected', 'cancelled'
);

CREATE TABLE IF NOT EXISTS "callouts" (
  "id" text PRIMARY KEY,
  "staff_profile_id" text NOT NULL REFERENCES "staff_profiles"("id") ON DELETE CASCADE,
  "related_incident_id" text REFERENCES "incidents"("id") ON DELETE SET NULL,
  "callout_at" timestamp NOT NULL,
  "callout_type" "callout_type" NOT NULL DEFAULT 'manual',
  "reason" text NOT NULL,
  "outcome" text,
  "status" "callout_status" NOT NULL DEFAULT 'logged',
  "reviewed_by_id" text REFERENCES "user"("id") ON DELETE SET NULL,
  "reviewed_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "attendance_exceptions" (
  "id" text PRIMARY KEY,
  "staff_profile_id" text NOT NULL REFERENCES "staff_profiles"("id") ON DELETE CASCADE,
  "leave_request_id" text REFERENCES "leave_requests"("id") ON DELETE SET NULL,
  "exception_date" date NOT NULL,
  "exception_type" "attendance_exception_type" NOT NULL,
  "hours" text,
  "reason" text,
  "notes" text,
  "minutes_late" integer,
  "status" "attendance_exception_status" NOT NULL DEFAULT 'draft',
  "reviewed_by_id" text REFERENCES "user"("id") ON DELETE SET NULL,
  "reviewed_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
