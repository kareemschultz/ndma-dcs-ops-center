ALTER TABLE "calendar_events" ALTER COLUMN "staff_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "calendar_events" ADD COLUMN "notes" text;