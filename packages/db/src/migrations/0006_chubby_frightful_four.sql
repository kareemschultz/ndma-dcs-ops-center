ALTER TYPE "public"."import_type" ADD VALUE 'operations_work_update' BEFORE 'platform_accounts';--> statement-breakpoint
ALTER TYPE "public"."import_type" ADD VALUE 'roster' BEFORE 'platform_accounts';--> statement-breakpoint
ALTER TYPE "public"."import_type" ADD VALUE 'appraisals';--> statement-breakpoint
ALTER TYPE "public"."import_type" ADD VALUE 'calendar_events';--> statement-breakpoint
ALTER TYPE "public"."import_type" ADD VALUE 'promotions';--> statement-breakpoint
ALTER TYPE "public"."import_type" ADD VALUE 'exam_dates';--> statement-breakpoint
ALTER TYPE "public"."import_type" ADD VALUE 'onboarding';--> statement-breakpoint
ALTER TYPE "public"."import_type" ADD VALUE 'policy';--> statement-breakpoint
ALTER TYPE "public"."import_type" ADD VALUE 'forms';--> statement-breakpoint
ALTER TABLE "staff_profiles" DROP CONSTRAINT "staff_profiles_reports_to_staff_profiles_id_fk";
