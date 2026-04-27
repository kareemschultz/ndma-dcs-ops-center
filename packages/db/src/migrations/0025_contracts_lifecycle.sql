-- Phase 6: Contracts Lifecycle — extend contracts + career progression plans

-- Extend contracts table with lifecycle fields
ALTER TABLE "contracts"
  ADD COLUMN IF NOT EXISTS "renewal_letter_due_date" date,
  ADD COLUMN IF NOT EXISTS "appraisal_1_due_date" date,
  ADD COLUMN IF NOT EXISTS "appraisal_2_due_date" date,
  ADD COLUMN IF NOT EXISTS "submitted_to_hr_at" timestamp,
  ADD COLUMN IF NOT EXISTS "renewal_outcome" text
    CONSTRAINT "renewal_outcome_check" CHECK (
      "renewal_outcome" IS NULL OR
      "renewal_outcome" IN ('renewed','not_renewed','left','terminated')
    );

-- Career progression plans (per-staff multi-year plan)
CREATE TABLE IF NOT EXISTS "career_progression_plans" (
  "id"           text PRIMARY KEY NOT NULL,
  "staff_id"     text NOT NULL REFERENCES "staff_profiles"("id") ON DELETE CASCADE,
  "target_year"  integer NOT NULL,
  "planned_role" text NOT NULL,
  "conditions"   text,
  "status"       text NOT NULL DEFAULT 'pending'
    CONSTRAINT "career_prog_status_check" CHECK ("status" IN ('pending','achieved','missed')),
  "created_at"   timestamp DEFAULT now() NOT NULL,
  "updated_at"   timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "career_prog_unique" UNIQUE ("staff_id","target_year")
);

CREATE INDEX IF NOT EXISTS "career_prog_staff_idx" ON "career_progression_plans"("staff_id");
