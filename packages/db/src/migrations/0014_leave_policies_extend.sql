CREATE TABLE IF NOT EXISTS "leave_policies" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "name" text NOT NULL,
  "code" text NOT NULL,
  "department_id" text REFERENCES "departments"("id") ON DELETE CASCADE,
  "leave_type_id" text REFERENCES "leave_types"("id") ON DELETE CASCADE,
  "max_concurrent_absences" integer NOT NULL DEFAULT 2,
  "max_requests_per_year" integer,
  "requires_hr_override_for_split" boolean NOT NULL DEFAULT false,
  "allow_carry_over" boolean NOT NULL DEFAULT false,
  "allow_rollover" boolean NOT NULL DEFAULT false,
  "blocked_months" text[] DEFAULT '{}',
  "is_active" boolean NOT NULL DEFAULT true,
  "notes" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint
ALTER TABLE "leave_policies" ADD CONSTRAINT "leave_policies_code_unique" UNIQUE ("code");--> statement-breakpoint
CREATE INDEX "leave_policies_departmentId_idx" ON "leave_policies" ("department_id");--> statement-breakpoint
CREATE INDEX "leave_policies_leaveTypeId_idx" ON "leave_policies" ("leave_type_id");
