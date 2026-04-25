CREATE TABLE IF NOT EXISTS "sync_adapters" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "platform_id" text REFERENCES "platforms"("id"),
  "adapter_type" text CHECK ("adapter_type" IN ('rest_api', 'ldap_bind', 'ssh_command', 'csv_export_scrape', 'custom')),
  "connection_config" jsonb,
  "sync_frequency" text NOT NULL DEFAULT 'manual_trigger_only' CHECK ("sync_frequency" IN ('hourly', 'daily', 'weekly', 'manual_trigger_only')),
  "enabled" boolean DEFAULT false,
  "last_successful_sync_at" timestamptz,
  "last_sync_error" text,
  "created_at" timestamptz DEFAULT now(),
  "updated_at" timestamptz DEFAULT now(),
  "created_by" text,
  "updated_by" text
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "sync_adapters_platform_id_enabled_idx" ON "sync_adapters" ("platform_id") WHERE "enabled" = true;

-- DOWN
-- DROP INDEX IF EXISTS "sync_adapters_platform_id_enabled_idx";
-- DROP TABLE IF EXISTS "sync_adapters";
