-- Enum widening is irreversible in PostgreSQL without full type recreation.
-- Ensure no rows use the new values before attempting rollback.
-- Full recreation would require: CREATE new type, ALTER COLUMN USING CAST, DROP old, RENAME new.
SELECT 1 WHERE NOT EXISTS (
  SELECT 1 FROM "calendar_events"
  WHERE "event_type" IN ('public_holiday','exam','contract_renewal','appraisal_due',
    'appraisal_followup','ppe_review','routine_maintenance','server_room_cleaning','custom')
);
