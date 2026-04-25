ALTER TABLE "staff_profiles"
  ADD COLUMN IF NOT EXISTS "cug_phone_number" text,
  ADD COLUMN IF NOT EXISTS "cug_sim_number" text,
  ADD COLUMN IF NOT EXISTS "mifi_asset_tag" text,
  ADD COLUMN IF NOT EXISTS "birthday" date,
  ADD COLUMN IF NOT EXISTS "employment_status" text DEFAULT 'Active',
  ADD COLUMN IF NOT EXISTS "hire_date" date,
  ADD COLUMN IF NOT EXISTS "contract_end_date" date,
  ADD COLUMN IF NOT EXISTS "current_appointment" text;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'staff_profiles_employment_status_check'
      AND conrelid = 'staff_profiles'::regclass
  ) THEN
    ALTER TABLE "staff_profiles"
      ADD CONSTRAINT "staff_profiles_employment_status_check"
      CHECK ("employment_status" IS NULL OR "employment_status" IN ('Active', 'Dormant', 'OnLeave', 'Left'));
  END IF;
END $$;

-- DOWN
-- ALTER TABLE "staff_profiles" DROP CONSTRAINT IF EXISTS "staff_profiles_employment_status_check";
-- ALTER TABLE "staff_profiles"
--   DROP COLUMN IF EXISTS "current_appointment",
--   DROP COLUMN IF EXISTS "contract_end_date",
--   DROP COLUMN IF EXISTS "hire_date",
--   DROP COLUMN IF EXISTS "employment_status",
--   DROP COLUMN IF EXISTS "birthday",
--   DROP COLUMN IF EXISTS "mifi_asset_tag",
--   DROP COLUMN IF EXISTS "cug_sim_number",
--   DROP COLUMN IF EXISTS "cug_phone_number";
