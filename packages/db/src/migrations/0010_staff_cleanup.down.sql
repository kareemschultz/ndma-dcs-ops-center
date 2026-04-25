-- team_lead_id data is not recoverable; structural restore only
ALTER TABLE "staff_profiles" ADD COLUMN IF NOT EXISTS "team_lead_id" text;
