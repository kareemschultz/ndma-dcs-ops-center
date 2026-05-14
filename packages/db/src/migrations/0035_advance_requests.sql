-- 0035_advance_requests.sql
-- Advance Requests (NDMA cash-advance workflow) — post-Phase-16 feature work.
-- Tables: advance_requests + advance_expense_lines.
-- Enums:  advance_status (pending|partial|cleared)
--         advance_expense_kind (breakfast|lunch|dinner|out_of_pocket|miscellaneous)
-- See design handoff §12 (Advance Request — NDMA Format) for the source-of-truth shape.

DO $$ BEGIN
  CREATE TYPE "advance_status" AS ENUM ('pending', 'partial', 'cleared');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "advance_expense_kind" AS ENUM ('breakfast', 'lunch', 'dinner', 'out_of_pocket', 'miscellaneous');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS "advance_requests" (
  "id"                  text PRIMARY KEY NOT NULL,
  "ref_number"          text NOT NULL,
  "staff_profile_id"    text NOT NULL,
  "purpose"             text NOT NULL,
  "recipients"          jsonb NOT NULL DEFAULT '[]'::jsonb,
  "date_requested"      date NOT NULL,
  "expected_clearance"  date,
  "actual_clearance"    date,
  "total_amount"        numeric(14, 2) NOT NULL DEFAULT '0',
  "status"              "advance_status" NOT NULL DEFAULT 'pending',
  "signature_data_url"  text,
  "notes"               text,
  "created_at"          timestamp NOT NULL DEFAULT now(),
  "updated_at"          timestamp NOT NULL DEFAULT now(),
  CONSTRAINT advance_requests_ref_number_unique UNIQUE ("ref_number"),
  CONSTRAINT advance_requests_staff_profile_id_fkey
    FOREIGN KEY ("staff_profile_id") REFERENCES "staff_profiles"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS advance_requests_staff_idx ON "advance_requests"("staff_profile_id");
CREATE INDEX IF NOT EXISTS advance_requests_status_idx ON "advance_requests"("status");
CREATE INDEX IF NOT EXISTS advance_requests_date_requested_idx ON "advance_requests"("date_requested");

CREATE TABLE IF NOT EXISTS "advance_expense_lines" (
  "id"                    text PRIMARY KEY NOT NULL,
  "advance_request_id"    text NOT NULL,
  "kind"                  "advance_expense_kind" NOT NULL,
  "persons"               integer NOT NULL DEFAULT 0,
  "cost_per_unit"         numeric(12, 2) NOT NULL DEFAULT '0',
  "days"                  integer NOT NULL DEFAULT 0,
  "amount"                numeric(14, 2) NOT NULL DEFAULT '0',
  CONSTRAINT advance_expense_lines_request_fkey
    FOREIGN KEY ("advance_request_id") REFERENCES "advance_requests"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS advance_expense_lines_request_idx ON "advance_expense_lines"("advance_request_id");
