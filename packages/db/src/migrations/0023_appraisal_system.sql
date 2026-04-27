-- Extend appraisals table with score fields not yet present
ALTER TABLE "appraisals"
  ADD COLUMN IF NOT EXISTS "max_score" integer DEFAULT 65,
  ADD COLUMN IF NOT EXISTS "increment_pct" integer;

-- appraisal_ratings (per-category and per-responsibility ratings)
CREATE TABLE IF NOT EXISTS "appraisal_ratings" (
  "id" text PRIMARY KEY NOT NULL,
  "appraisal_id" text NOT NULL REFERENCES "appraisals"("id") ON DELETE CASCADE,
  "kind" text NOT NULL CHECK ("kind" IN ('category','responsibility')),
  "category" text,
  "responsibility_seq" integer,
  "rating" integer NOT NULL CHECK ("rating" BETWEEN 1 AND 5),
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "appraisal_ratings_category_unique" UNIQUE ("appraisal_id","category"),
  CONSTRAINT "appraisal_ratings_resp_unique" UNIQUE ("appraisal_id","responsibility_seq")
);

-- appraisal_responsibilities (job responsibilities listed on the form)
CREATE TABLE IF NOT EXISTS "appraisal_responsibilities" (
  "id" text PRIMARY KEY NOT NULL,
  "appraisal_id" text NOT NULL REFERENCES "appraisals"("id") ON DELETE CASCADE,
  "seq" integer NOT NULL,
  "title" text NOT NULL,
  "description" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "appraisal_resp_unique" UNIQUE ("appraisal_id","seq")
);

-- appraisal_achievements
CREATE TABLE IF NOT EXISTS "appraisal_achievements" (
  "id" text PRIMARY KEY NOT NULL,
  "appraisal_id" text NOT NULL REFERENCES "appraisals"("id") ON DELETE CASCADE,
  "seq" integer NOT NULL,
  "text" text NOT NULL,
  CONSTRAINT "appraisal_ach_unique" UNIQUE ("appraisal_id","seq")
);

-- appraisal_goals
CREATE TABLE IF NOT EXISTS "appraisal_goals" (
  "id" text PRIMARY KEY NOT NULL,
  "appraisal_id" text NOT NULL REFERENCES "appraisals"("id") ON DELETE CASCADE,
  "seq" integer NOT NULL,
  "text" text NOT NULL,
  CONSTRAINT "appraisal_goals_unique" UNIQUE ("appraisal_id","seq")
);

-- appraisal_signatures
DO $$ BEGIN
  CREATE TYPE "appraisal_signer_role" AS ENUM ('employee','manager_director','hr_manager','deputy_gm','gm');
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE IF NOT EXISTS "appraisal_signatures" (
  "id" text PRIMARY KEY NOT NULL,
  "appraisal_id" text NOT NULL REFERENCES "appraisals"("id") ON DELETE CASCADE,
  "role" "appraisal_signer_role" NOT NULL,
  "signed_by" text REFERENCES "staff_profiles"("id") ON DELETE SET NULL,
  "signed_at" timestamp,
  "signature_svg" text,
  CONSTRAINT "appraisal_sig_unique" UNIQUE ("appraisal_id","role")
);
