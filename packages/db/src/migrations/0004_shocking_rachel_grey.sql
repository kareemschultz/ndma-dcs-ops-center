CREATE TYPE "public"."appraisal_evaluation_type" AS ENUM('Standard', 'Employee of the Month');--> statement-breakpoint
CREATE TYPE "public"."attendance_status" AS ENUM('Workday', 'Restday', 'Absent', 'Leave', 'Holiday');--> statement-breakpoint
CREATE TYPE "public"."certification_budget_status" AS ENUM('Planned', 'Approved', 'Spent');--> statement-breakpoint
CREATE TYPE "public"."company_form_category" AS ENUM('HR & Leave', 'Finance', 'Operations', 'IT', 'General');--> statement-breakpoint
CREATE TYPE "public"."exam_date_status" AS ENUM('Scheduled', 'Passed', 'Failed');--> statement-breakpoint
CREATE TYPE "public"."staff_training_status" AS ENUM('Enrolled', 'In Progress', 'Completed', 'Failed');--> statement-breakpoint
CREATE TYPE "public"."training_course_type" AS ENUM('Certification', 'Syllabus', 'Internship');--> statement-breakpoint
CREATE TYPE "public"."training_material_type" AS ENUM('Book', 'Checklist', 'Survey');--> statement-breakpoint
CREATE TYPE "public"."staff_role" AS ENUM('Staff', 'Team_Lead', 'Manager', 'PA', 'Admin');--> statement-breakpoint
ALTER TYPE "public"."appraisal_status" ADD VALUE 'Draft' BEFORE 'draft';--> statement-breakpoint
ALTER TYPE "public"."appraisal_status" ADD VALUE 'Pending_Approval' BEFORE 'draft';--> statement-breakpoint
ALTER TYPE "public"."appraisal_status" ADD VALUE 'Approved_By_Manager' BEFORE 'draft';--> statement-breakpoint
ALTER TYPE "public"."appraisal_status" ADD VALUE 'Processed_By_PA' BEFORE 'draft';--> statement-breakpoint
ALTER TYPE "public"."appraisal_status" ADD VALUE 'Completed' BEFORE 'draft';--> statement-breakpoint
CREATE TABLE "attendance_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"staff_id" text NOT NULL,
	"date" date NOT NULL,
	"clock_in" time,
	"clock_out" time,
	"work_hours" numeric(8, 2),
	"status" "attendance_status" NOT NULL
);
--> statement-breakpoint
CREATE TABLE "certification_budgets" (
	"id" serial PRIMARY KEY NOT NULL,
	"certification_name" varchar(255) NOT NULL,
	"year" integer NOT NULL,
	"estimated_cost" integer NOT NULL,
	"actual_cost" integer DEFAULT 0 NOT NULL,
	"currency" varchar(8) DEFAULT 'GYD' NOT NULL,
	"status" "certification_budget_status" DEFAULT 'Planned' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "company_forms" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" varchar(255) NOT NULL,
	"description" text,
	"category" "company_form_category" NOT NULL,
	"file_url" varchar(500) NOT NULL,
	"uploaded_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "company_policies" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" varchar(255) NOT NULL,
	"content_text" text NOT NULL,
	"document_url" varchar(500),
	"last_updated" date NOT NULL
);
--> statement-breakpoint
CREATE TABLE "exam_dates" (
	"id" serial PRIMARY KEY NOT NULL,
	"staff_id" text NOT NULL,
	"exam_name" varchar(255) NOT NULL,
	"scheduled_date" date NOT NULL,
	"status" "exam_date_status" DEFAULT 'Scheduled' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "staff_training_records" (
	"id" serial PRIMARY KEY NOT NULL,
	"staff_id" text NOT NULL,
	"course_id" integer NOT NULL,
	"status" "staff_training_status" NOT NULL,
	"start_date" date,
	"completion_date" date,
	"target_date" date,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "training_courses" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" varchar(255) NOT NULL,
	"vendor" varchar(255) NOT NULL,
	"course_type" "training_course_type" NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "training_materials" (
	"id" serial PRIMARY KEY NOT NULL,
	"course_id" integer NOT NULL,
	"material_type" "training_material_type" NOT NULL,
	"title" varchar(255) NOT NULL,
	"reference_link" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "onboarding_tasks" (
	"id" serial PRIMARY KEY NOT NULL,
	"staff_id" text NOT NULL,
	"task_name" varchar(255) NOT NULL,
	"category" varchar(255) NOT NULL,
	"is_completed" boolean DEFAULT false NOT NULL,
	"completed_at" timestamp,
	"due_date" date
);
--> statement-breakpoint
CREATE TABLE "staff_promotions" (
	"id" serial PRIMARY KEY NOT NULL,
	"staff_id" text NOT NULL,
	"promotion_date" date NOT NULL,
	"letter_date" date,
	"from_title" varchar(255),
	"to_title" varchar(255) NOT NULL,
	"letter_url" text,
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "lateness_records" (
	"id" serial PRIMARY KEY NOT NULL,
	"staff_id" text NOT NULL,
	"year" integer NOT NULL,
	"month" varchar(32) NOT NULL,
	"total_time_late" varchar(32) NOT NULL,
	"days_late" integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE "appraisals" ADD COLUMN "evaluation_type" "appraisal_evaluation_type" DEFAULT 'Standard' NOT NULL;--> statement-breakpoint
ALTER TABLE "staff_profiles" ADD COLUMN "role" "staff_role" DEFAULT 'Staff' NOT NULL;--> statement-breakpoint
ALTER TABLE "staff_profiles" ADD COLUMN "reports_to" text;--> statement-breakpoint
ALTER TABLE "staff_profiles" ADD COLUMN "emergency_contacts" jsonb DEFAULT '[]'::jsonb;--> statement-breakpoint
ALTER TABLE "attendance_logs" ADD CONSTRAINT "attendance_logs_staff_id_staff_profiles_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."staff_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exam_dates" ADD CONSTRAINT "exam_dates_staff_id_staff_profiles_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."staff_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_training_records" ADD CONSTRAINT "staff_training_records_staff_id_staff_profiles_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."staff_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_training_records" ADD CONSTRAINT "staff_training_records_course_id_training_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."training_courses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_materials" ADD CONSTRAINT "training_materials_course_id_training_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."training_courses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "onboarding_tasks" ADD CONSTRAINT "onboarding_tasks_staff_id_staff_profiles_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."staff_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_promotions" ADD CONSTRAINT "staff_promotions_staff_id_staff_profiles_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."staff_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lateness_records" ADD CONSTRAINT "lateness_records_staff_id_staff_profiles_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."staff_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "attendance_logs_staffId_idx" ON "attendance_logs" USING btree ("staff_id");--> statement-breakpoint
CREATE INDEX "attendance_logs_date_idx" ON "attendance_logs" USING btree ("date");--> statement-breakpoint
CREATE INDEX "attendance_logs_status_idx" ON "attendance_logs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "staff_training_records_staffId_idx" ON "staff_training_records" USING btree ("staff_id");--> statement-breakpoint
CREATE INDEX "staff_training_records_courseId_idx" ON "staff_training_records" USING btree ("course_id");--> statement-breakpoint
CREATE INDEX "staff_training_records_status_idx" ON "staff_training_records" USING btree ("status");--> statement-breakpoint
CREATE INDEX "staff_training_records_targetDate_idx" ON "staff_training_records" USING btree ("target_date");--> statement-breakpoint
CREATE INDEX "training_courses_title_idx" ON "training_courses" USING btree ("title");--> statement-breakpoint
CREATE INDEX "training_courses_vendor_idx" ON "training_courses" USING btree ("vendor");--> statement-breakpoint
CREATE INDEX "training_courses_courseType_idx" ON "training_courses" USING btree ("course_type");--> statement-breakpoint
CREATE INDEX "training_materials_courseId_idx" ON "training_materials" USING btree ("course_id");--> statement-breakpoint
CREATE INDEX "training_materials_materialType_idx" ON "training_materials" USING btree ("material_type");--> statement-breakpoint
CREATE INDEX "staff_promotions_staffId_idx" ON "staff_promotions" USING btree ("staff_id");--> statement-breakpoint
CREATE INDEX "staff_promotions_promotionDate_idx" ON "staff_promotions" USING btree ("promotion_date");--> statement-breakpoint
CREATE INDEX "lateness_records_staffId_idx" ON "lateness_records" USING btree ("staff_id");--> statement-breakpoint
CREATE INDEX "lateness_records_year_idx" ON "lateness_records" USING btree ("year");--> statement-breakpoint
CREATE INDEX "lateness_records_month_idx" ON "lateness_records" USING btree ("month");--> statement-breakpoint
CREATE INDEX "staff_profiles_role_idx" ON "staff_profiles" USING btree ("role");--> statement-breakpoint
CREATE INDEX "staff_profiles_reportsTo_idx" ON "staff_profiles" USING btree ("reports_to");