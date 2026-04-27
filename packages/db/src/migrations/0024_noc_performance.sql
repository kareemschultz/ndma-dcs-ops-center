-- NOC ticket activity (incidents, problems, work orders created/closed)
CREATE TABLE IF NOT EXISTS "noc_ticket_activity" (
  "id" text PRIMARY KEY NOT NULL,
  "ticket_id" text NOT NULL,
  "type" text NOT NULL CHECK ("type" IN ('incident','problem','work_order')),
  "year" integer NOT NULL,
  "month" integer NOT NULL,
  "action" text NOT NULL CHECK ("action" IN ('created','closed')),
  "actor_staff_id" text REFERENCES "staff_profiles"("id") ON DELETE SET NULL,
  "is_duplicate" boolean NOT NULL DEFAULT false,
  "notes" text,
  CONSTRAINT "noc_ticket_unique" UNIQUE ("ticket_id","action")
);

-- NOC monthly performance metrics per staff member
CREATE TABLE IF NOT EXISTS "noc_monthly_metrics" (
  "id" text PRIMARY KEY NOT NULL,
  "staff_id" text NOT NULL REFERENCES "staff_profiles"("id") ON DELETE CASCADE,
  "year" integer NOT NULL,
  "month" integer NOT NULL,
  "mt" integer NOT NULL DEFAULT 0,
  "itt_incident" integer NOT NULL DEFAULT 0,
  "itt_problem" integer NOT NULL DEFAULT 0,
  "days_day_shift" integer NOT NULL DEFAULT 0,
  "days_swing_shift" integer NOT NULL DEFAULT 0,
  "days_night_shift" integer NOT NULL DEFAULT 0,
  "noccc" integer NOT NULL DEFAULT 0,
  "nct" integer NOT NULL DEFAULT 0,
  "ma" integer NOT NULL DEFAULT 0,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "noc_metrics_unique" UNIQUE ("staff_id","year","month")
);

-- Employee of the Month awards
CREATE TABLE IF NOT EXISTS "employee_of_the_month" (
  "id" text PRIMARY KEY NOT NULL,
  "year" integer NOT NULL,
  "month" integer NOT NULL,
  "overall_best_staff_id" text REFERENCES "staff_profiles"("id") ON DELETE SET NULL,
  "second_best_staff_id" text REFERENCES "staff_profiles"("id") ON DELETE SET NULL,
  "most_incident_tickets_staff_id" text REFERENCES "staff_profiles"("id") ON DELETE SET NULL,
  "most_problem_tickets_staff_id" text REFERENCES "staff_profiles"("id") ON DELETE SET NULL,
  "most_noc_tickets_closed_staff_id" text REFERENCES "staff_profiles"("id") ON DELETE SET NULL,
  "least_alarm_non_compliance_staff_id" text REFERENCES "staff_profiles"("id") ON DELETE SET NULL,
  "least_ticket_non_compliance_staff_id" text REFERENCES "staff_profiles"("id") ON DELETE SET NULL,
  "computed_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "eom_unique" UNIQUE ("year","month")
);
