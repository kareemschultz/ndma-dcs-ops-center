CREATE TYPE "public"."noc_shift_type" AS ENUM('12hr Day', '12hr Night', 'Off', 'Annual Leave', 'Sick Leave');--> statement-breakpoint
CREATE TABLE "noc_shifts" (
	"id" serial PRIMARY KEY NOT NULL,
	"staff_id" text NOT NULL,
	"shift_date" date NOT NULL,
	"shift_type" "noc_shift_type" NOT NULL,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "noc_shifts_staffId_shiftDate_unique" UNIQUE("staff_id","shift_date")
);
--> statement-breakpoint
ALTER TABLE "contracts" ADD COLUMN "appraisal_period" varchar(255);--> statement-breakpoint
ALTER TABLE "staff_profiles" ADD COLUMN "phone_number" varchar(32);--> statement-breakpoint
ALTER TABLE "noc_shifts" ADD CONSTRAINT "noc_shifts_staff_id_staff_profiles_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."staff_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "noc_shifts_staffId_idx" ON "noc_shifts" USING btree ("staff_id");--> statement-breakpoint
CREATE INDEX "noc_shifts_shiftDate_idx" ON "noc_shifts" USING btree ("shift_date");--> statement-breakpoint
CREATE INDEX "noc_shifts_shiftType_idx" ON "noc_shifts" USING btree ("shift_type");