-- 0039_leave_type_carry_over.sql
-- Adds `allows_carry_over` to `leave_types`.
--
-- NDMA policy: leave must be used within the staff member's 1-year contract
-- (use-it-or-lose-it). It does NOT carry over to the next year. This flag lets
-- the product owner opt a specific leave type into carry-over per type.
--
-- DEFAULT false — carry-over is OFF unless explicitly enabled.
-- Idempotent — safe to re-run. NOT applied automatically.

ALTER TABLE leave_types
  ADD COLUMN IF NOT EXISTS allows_carry_over boolean NOT NULL DEFAULT false;
