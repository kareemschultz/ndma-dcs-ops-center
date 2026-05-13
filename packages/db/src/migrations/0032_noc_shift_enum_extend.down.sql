-- Down migration for 0032 — note: PostgreSQL does NOT support removing enum values directly.
-- This down migration is best-effort: it renames the enum + creates a fresh one without the
-- new values. Only safe if no rows reference the new values.

-- Step 1: Validate no rows use the new values
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM noc_shifts WHERE shift_type IN ('Split Shift', 'Maternity Leave')) THEN
    RAISE EXCEPTION 'Cannot down-migrate 0032: rows exist with Split Shift or Maternity Leave';
  END IF;
END $$;

-- Step 2: Create old enum, swap column, drop new enum
ALTER TYPE noc_shift_type RENAME TO noc_shift_type_v2;
CREATE TYPE noc_shift_type AS ENUM ('12hr Day', '12hr Night', 'Off', 'Annual Leave', 'Sick Leave');
ALTER TABLE noc_shifts ALTER COLUMN shift_type TYPE noc_shift_type USING shift_type::text::noc_shift_type;
DROP TYPE noc_shift_type_v2;
