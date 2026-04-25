CREATE TABLE IF NOT EXISTS "platforms" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "name" text NOT NULL UNIQUE,
  "category" text CHECK ("category" IN ('monitoring', 'vpn', 'portal', 'identity', 'access_control', 'other')),
  "auth_type" text CHECK ("auth_type" IN ('local', 'ad_ldap', 'saml', 'oauth', 'hybrid', 'unknown')),
  "sync_mode" text NOT NULL DEFAULT 'manual_only' CHECK ("sync_mode" IN ('manual_only', 'api_full', 'api_partial', 'api_read_only')),
  "sync_adapter_id" text,
  "api_capabilities" jsonb,
  "notes" text,
  "active" boolean DEFAULT true,
  "created_at" timestamptz DEFAULT now(),
  "updated_at" timestamptz DEFAULT now(),
  "created_by" text,
  "updated_by" text
);
--> statement-breakpoint
INSERT INTO "platforms" ("name", "category", "auth_type", "sync_mode") VALUES
  ('IPAM', 'monitoring', 'local', 'manual_only'),
  ('Zabbix', 'monitoring', 'ad_ldap', 'manual_only'),
  ('eSight', 'monitoring', 'local', 'manual_only'),
  ('IVSneteco', 'monitoring', 'local', 'manual_only'),
  ('NCE-FAN', 'monitoring', 'local', 'manual_only'),
  ('Neteco', 'monitoring', 'local', 'manual_only'),
  ('LTE Grafana', 'monitoring', 'local', 'manual_only'),
  ('Generator Grafana', 'monitoring', 'local', 'manual_only'),
  ('Plum', 'monitoring', 'local', 'manual_only'),
  ('Kibana', 'monitoring', 'local', 'manual_only'),
  ('Radius', 'identity', 'ad_ldap', 'manual_only'),
  ('Forticlient VPN', 'vpn', 'ad_ldap', 'manual_only'),
  ('MiFi VPN', 'vpn', 'local', 'manual_only'),
  ('Uportal', 'portal', 'local', 'manual_only'),
  ('MikroTik VPN', 'vpn', 'ad_ldap', 'manual_only'),
  ('Liliendaal Door Access', 'access_control', 'local', 'manual_only'),
  ('Server Room Access', 'access_control', 'local', 'manual_only'),
  ('DC Fingerprint', 'access_control', 'local', 'manual_only')
ON CONFLICT ("name") DO NOTHING;

-- DOWN
-- DROP TABLE IF EXISTS "platforms";
