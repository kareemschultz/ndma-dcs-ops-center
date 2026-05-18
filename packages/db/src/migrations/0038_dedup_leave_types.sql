-- 0038_dedup_leave_types.sql
-- DATA INTEGRITY FIX — deduplicate the leave_types table.
--
-- Problem: leave_types had duplicate rows sharing the same display name. Each
-- pair had an older UUID-style id (seeded 2026-04-22) AND a clean seed-style
-- id (lt-*, seeded 2026-05-16). This caused duplicate filter pills on /leave,
-- split slices in analytics, and a React duplicate-key risk.
--
-- Resolution: keep the human-readable seed id (lt-*) as canonical for each
-- group; repoint all child FK rows (leave_requests, leave_balances,
-- leave_policies) from the UUID dupe -> the lt-* canonical row, then delete
-- the orphaned UUID rows.
--
-- Duplicate groups (dupe UUID id  ->  canonical lt-* id):
--   0cd3a366-6bcd-45ef-81b2-e54c81ba1bf3 "Annual Leave"     -> lt-annual
--   fd2863ad-9818-4a36-add4-e8288357284d "Sick Leave"       -> lt-sick
--   5dbcd54f-0463-4096-8db4-25dcf6d0afe9 "Study Leave"      -> lt-study
--   90978e54-245e-4322-bf93-4f361489dfd3 "Emergency"        -> lt-emergency
--
-- Idempotent-safe: the UPDATE/DELETE statements only act on the UUID dupe ids;
-- re-running after the dupes are gone is a no-op (0 rows matched). Each
-- statement is guarded so it runs only when both the dupe and canonical row
-- still exist.

BEGIN;

DO $$
DECLARE
  pair RECORD;
BEGIN
  FOR pair IN
    SELECT * FROM (VALUES
      ('0cd3a366-6bcd-45ef-81b2-e54c81ba1bf3', 'lt-annual'),
      ('fd2863ad-9818-4a36-add4-e8288357284d', 'lt-sick'),
      ('5dbcd54f-0463-4096-8db4-25dcf6d0afe9', 'lt-study'),
      ('90978e54-245e-4322-bf93-4f361489dfd3', 'lt-emergency')
    ) AS t(dupe_id, canonical_id)
  LOOP
    -- Only proceed when BOTH rows still exist (idempotent re-run safety).
    IF EXISTS (SELECT 1 FROM leave_types WHERE id = pair.dupe_id)
       AND EXISTS (SELECT 1 FROM leave_types WHERE id = pair.canonical_id) THEN

      -- Repoint child rows from the dupe to the canonical leave type.
      UPDATE leave_requests SET leave_type_id = pair.canonical_id
        WHERE leave_type_id = pair.dupe_id;

      -- leave_balances has a unique constraint on
      -- (staff_profile_id, leave_type_id, contract_year_start); verified there
      -- are no collisions for the current data set, so a straight UPDATE is safe.
      UPDATE leave_balances SET leave_type_id = pair.canonical_id
        WHERE leave_type_id = pair.dupe_id;

      UPDATE leave_policies SET leave_type_id = pair.canonical_id
        WHERE leave_type_id = pair.dupe_id;

      -- Remove the now-orphaned duplicate leave type.
      DELETE FROM leave_types WHERE id = pair.dupe_id;

      RAISE NOTICE 'Merged leave type % -> %', pair.dupe_id, pair.canonical_id;
    END IF;
  END LOOP;
END $$;

COMMIT;
