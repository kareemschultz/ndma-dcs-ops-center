DROP TABLE IF EXISTS "vpn_groups";
DROP TABLE IF EXISTS "uportal_accounts";
DROP TABLE IF EXISTS "biometric_registration";
DROP TABLE IF EXISTS "physical_access_register";
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "service_access_registry" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "staff_id" text NOT NULL REFERENCES "staff_profiles"("id"),
  "platform_id" text NOT NULL REFERENCES "platforms"("id"),
  "account_username" text,
  "account_type" text CHECK ("account_type" IN ('local', 'ad_ldap', 'saml', 'oauth', 'service_account', 'shared', 'unknown')),
  "account_active" boolean DEFAULT true,
  "privilege_level" text CHECK ("privilege_level" IN ('admin', 'operator', 'read_only', 'auditor', 'custom', 'none')),
  "privilege_groups" text[] DEFAULT '{}',
  "privilege_custom_notes" text,
  "username_source" text NOT NULL DEFAULT 'manual' CHECK ("username_source" IN ('manual', 'synced', 'hybrid_verified')),
  "account_type_source" text NOT NULL DEFAULT 'manual' CHECK ("account_type_source" IN ('manual', 'synced', 'hybrid_verified')),
  "privilege_source" text NOT NULL DEFAULT 'manual' CHECK ("privilege_source" IN ('manual', 'synced', 'hybrid_verified')),
  "groups_source" text NOT NULL DEFAULT 'manual' CHECK ("groups_source" IN ('manual', 'synced', 'hybrid_verified')),
  "last_synced_at" timestamptz,
  "last_sync_adapter_run_id" text REFERENCES "sync_adapter_runs"("id"),
  "manual_override_reason" text,
  "manual_overridden_at" timestamptz,
  "manual_overridden_by" text REFERENCES "staff_profiles"("id"),
  "created_at" timestamptz DEFAULT now(),
  "updated_at" timestamptz DEFAULT now(),
  "created_by" text,
  "updated_by" text,
  CONSTRAINT "service_access_registry_staff_platform_unique" UNIQUE ("staff_id", "platform_id")
);

-- DOWN
-- DROP TABLE IF EXISTS "service_access_registry";
