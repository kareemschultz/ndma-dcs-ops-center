-- Phase 7 — Onboarding: task templates + extend onboarding_tasks
-- migration 0027

-- ─── onboarding_task_templates ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "onboarding_task_templates" (
  "id"               serial PRIMARY KEY,
  "task_name"        text NOT NULL,
  "responsible_dept" text NOT NULL,
  "seq"              integer NOT NULL,
  "created_at"       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "onboarding_task_templates_seq_idx" ON "onboarding_task_templates" ("seq");

-- Seed the 8 standard onboarding tasks (upsert-by-seq to be idempotent)
INSERT INTO "onboarding_task_templates" ("task_name", "responsible_dept", "seq")
VALUES
  ('Laptop request',                       'HR',         1),
  ('AD Login',                             'Cloud',      2),
  ('Email Creation',                       'Cloud',      3),
  ('DCS or NOC Platform login credentials','ASN',        4),
  ('Badge',                                'HR',         5),
  ('PPE',                                  'Ataybia',    6),
  ('Biometric Access',                     'Admin',      7),
  ('MiFi Request',                         'Help Desk',  8)
ON CONFLICT DO NOTHING;

-- ─── Extend onboarding_tasks with template_id ─────────────────────────────────
ALTER TABLE "onboarding_tasks"
  ADD COLUMN IF NOT EXISTS "template_id" integer REFERENCES "onboarding_task_templates"("id") ON DELETE SET NULL;
