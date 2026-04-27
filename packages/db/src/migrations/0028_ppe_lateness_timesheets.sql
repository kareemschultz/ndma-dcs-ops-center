-- Phase 8: PPE matrix, lateness quarterly grid, timesheet documents
-- Migration 0028

-- ─── PPE Items: add has_size, has_asset_tag columns ──────────────────────────

ALTER TABLE "ppe_items"
  ADD COLUMN IF NOT EXISTS "has_size" boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "has_asset_tag" boolean NOT NULL DEFAULT false;

-- ─── PPE Issuance Status Enum: add new values ────────────────────────────────
-- PostgreSQL allows ALTER TYPE ADD VALUE (idempotent with IF NOT EXISTS in PG12+)

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'not_issued'
      AND enumtypid = 'ppe_issuance_status'::regtype
  ) THEN
    ALTER TYPE "ppe_issuance_status" ADD VALUE 'not_issued';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'n_a'
      AND enumtypid = 'ppe_issuance_status'::regtype
  ) THEN
    ALTER TYPE "ppe_issuance_status" ADD VALUE 'n_a';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'stolen'
      AND enumtypid = 'ppe_issuance_status'::regtype
  ) THEN
    ALTER TYPE "ppe_issuance_status" ADD VALUE 'stolen';
  END IF;
END
$$;

-- ─── PPE Issuances: add asset_tag, update unique constraint ──────────────────

ALTER TABLE "ppe_issuances"
  ADD COLUMN IF NOT EXISTS "asset_tag" text;

-- Drop old unique constraint (staff × item only) and add (staff × item × issued_date)
ALTER TABLE "ppe_issuances"
  DROP CONSTRAINT IF EXISTS "ppe_issuances_staff_item_unique";

ALTER TABLE "ppe_issuances"
  ADD CONSTRAINT "ppe_issuances_staff_item_date_unique"
  UNIQUE ("staff_profile_id", "ppe_item_id", "issued_date");

-- ─── Seed 17 canonical PPE items ─────────────────────────────────────────────

INSERT INTO "ppe_items" ("code", "name", "category", "has_size", "has_asset_tag", "is_active")
VALUES
  ('LONG_BOOTS',       'Long Boots',          'footwear',    true,  false, true),
  ('OVERALLS',         'Overalls',            'apparel',     false, false, true),
  ('MOUSEPAD',         'Mousepad',            'accessories', false, false, true),
  ('SAFETY_BOOTS',     'Safety Boots',        'footwear',    true,  false, true),
  ('BAG',              'Bag',                 'accessories', false, false, true),
  ('SCREWDRIVER',      'Screwdriver',         'accessories', false, false, true),
  ('DB9_RJ45',         'DB9-RJ45 Adapter',    'accessories', false, false, true),
  ('DB9_USB',          'DB9-USB Adapter',     'accessories', false, false, true),
  ('MONITOR',          'Monitor',             'electronics', false, true,  true),
  ('HDMI_MONITOR',     'HDMI to Monitor',     'accessories', false, false, true),
  ('LAPTOP',           'Laptop',              'electronics', false, true,  true),
  ('MIFI',             'MiFi',                'electronics', false, true,  true),
  ('CUG_PHONE',        'CUG Phone',           'electronics', false, true,  true),
  ('CUG_SIM',          'CUG Sim',             'electronics', false, false, true),
  ('NDMA_SHIRTS',      'NDMA Shirts',         'apparel',     false, false, true),
  ('USB_ETHERNET',     'USB To Ethernet',     'accessories', false, false, true),
  ('UMBRELLA',         'Umbrella',            'accessories', false, false, true)
ON CONFLICT ("code") DO UPDATE SET
  "name"          = EXCLUDED."name",
  "category"      = EXCLUDED."category",
  "has_size"      = EXCLUDED."has_size",
  "has_asset_tag" = EXCLUDED."has_asset_tag";

-- ─── Lateness Records: add quarterly columns + unique constraint ──────────────

ALTER TABLE "lateness_records"
  ADD COLUMN IF NOT EXISTS "quarter" integer,
  ADD COLUMN IF NOT EXISTS "notes" text,
  ADD COLUMN IF NOT EXISTS "days_missing_from_attendance" integer,
  ADD COLUMN IF NOT EXISTS "days_on_schedule" integer;

-- Add unique constraint if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'lateness_records_staff_year_month_uq'
      AND conrelid = 'lateness_records'::regclass
  ) THEN
    ALTER TABLE "lateness_records"
      ADD CONSTRAINT "lateness_records_staff_year_month_uq"
      UNIQUE ("staff_id", "year", "month");
  END IF;
END
$$;

-- ─── Timesheet Documents: new index table ────────────────────────────────────

CREATE TYPE IF NOT EXISTS "timesheet_office" AS ENUM ('castellani', 'liliendaal');

CREATE TABLE IF NOT EXISTS "timesheet_documents" (
  "id"           serial PRIMARY KEY,
  "staff_id"     text NOT NULL REFERENCES "staff_profiles"("id") ON DELETE CASCADE,
  "year"         integer NOT NULL,
  "month"        integer NOT NULL,
  "office"       "timesheet_office" NOT NULL,
  "filename"     text NOT NULL,
  "storage_path" text,
  "uploaded_by"  text REFERENCES "user"("id") ON DELETE SET NULL,
  "uploaded_at"  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "timesheet_documents_staff_year_month_office_uq"
    UNIQUE ("staff_id", "year", "month", "office")
);

CREATE INDEX IF NOT EXISTS "timesheet_documents_staffId_idx" ON "timesheet_documents" ("staff_id");
CREATE INDEX IF NOT EXISTS "timesheet_documents_year_month_idx" ON "timesheet_documents" ("year", "month");
CREATE INDEX IF NOT EXISTS "timesheet_documents_office_idx" ON "timesheet_documents" ("office");
