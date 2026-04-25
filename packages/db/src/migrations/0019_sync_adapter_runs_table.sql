CREATE TABLE IF NOT EXISTS "sync_adapter_runs" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "sync_adapter_id" text REFERENCES "sync_adapters"("id"),
  "started_at" timestamptz DEFAULT now(),
  "finished_at" timestamptz,
  "status" text CHECK ("status" IN ('running', 'success', 'partial', 'failed', 'cancelled')),
  "records_processed" int DEFAULT 0,
  "records_added" int DEFAULT 0,
  "records_updated" int DEFAULT 0,
  "records_conflicted" int DEFAULT 0,
  "error_detail" text,
  "triggered_by" text CHECK ("triggered_by" IN ('schedule', 'manual', 'webhook')),
  "triggered_by_staff_id" text REFERENCES "staff_profiles"("id")
);

-- DOWN
-- DROP TABLE IF EXISTS "sync_adapter_runs";
