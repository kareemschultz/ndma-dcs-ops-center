CREATE TYPE "public"."calendar_event_type" AS ENUM('Birthday', 'Training', 'Event');--> statement-breakpoint
CREATE TABLE "calendar_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" varchar(255) NOT NULL,
	"event_type" "calendar_event_type" NOT NULL,
	"event_date" date NOT NULL,
	"staff_id" varchar(255) NOT NULL
);
--> statement-breakpoint
ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_staff_id_staff_profiles_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."staff_profiles"("id") ON DELETE cascade ON UPDATE no action;
