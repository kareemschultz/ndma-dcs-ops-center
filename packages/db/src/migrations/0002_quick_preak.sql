CREATE TABLE "appraisal_notes" (
	"id" serial PRIMARY KEY NOT NULL,
	"appraisal_id" text NOT NULL,
	"note_type" varchar(255) NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "appraisal_scores" (
	"id" serial PRIMARY KEY NOT NULL,
	"appraisal_id" text NOT NULL,
	"category" varchar(255) NOT NULL,
	"criteria" varchar(255) NOT NULL,
	"score" integer NOT NULL,
	"comment" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "appraisal_tracker" (
	"id" serial PRIMARY KEY NOT NULL,
	"department_id" text,
	"year" integer NOT NULL,
	"period" varchar(255) NOT NULL,
	"draft_count" integer DEFAULT 0 NOT NULL,
	"scheduled_count" integer DEFAULT 0 NOT NULL,
	"in_progress_count" integer DEFAULT 0 NOT NULL,
	"submitted_count" integer DEFAULT 0 NOT NULL,
	"approved_count" integer DEFAULT 0 NOT NULL,
	"rejected_count" integer DEFAULT 0 NOT NULL,
	"completed_count" integer DEFAULT 0 NOT NULL,
	"overdue_count" integer DEFAULT 0 NOT NULL,
	"total_count" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "appraisal_tracker_department_year_period_unique" UNIQUE("department_id","year","period")
);
--> statement-breakpoint
ALTER TABLE "appraisals" ADD COLUMN "year" integer;--> statement-breakpoint
ALTER TABLE "appraisals" ADD COLUMN "period" varchar(255);--> statement-breakpoint
ALTER TABLE "appraisals" ADD COLUMN "total_score" integer;--> statement-breakpoint
ALTER TABLE "appraisal_notes" ADD CONSTRAINT "appraisal_notes_appraisal_id_appraisals_id_fk" FOREIGN KEY ("appraisal_id") REFERENCES "public"."appraisals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appraisal_scores" ADD CONSTRAINT "appraisal_scores_appraisal_id_appraisals_id_fk" FOREIGN KEY ("appraisal_id") REFERENCES "public"."appraisals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appraisal_tracker" ADD CONSTRAINT "appraisal_tracker_department_id_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "appraisal_notes_appraisalId_idx" ON "appraisal_notes" USING btree ("appraisal_id");--> statement-breakpoint
CREATE INDEX "appraisal_notes_noteType_idx" ON "appraisal_notes" USING btree ("note_type");--> statement-breakpoint
CREATE INDEX "appraisal_scores_appraisalId_idx" ON "appraisal_scores" USING btree ("appraisal_id");--> statement-breakpoint
CREATE INDEX "appraisal_scores_category_idx" ON "appraisal_scores" USING btree ("category");--> statement-breakpoint
CREATE INDEX "appraisal_tracker_departmentId_idx" ON "appraisal_tracker" USING btree ("department_id");--> statement-breakpoint
CREATE INDEX "appraisal_tracker_year_idx" ON "appraisal_tracker" USING btree ("year");--> statement-breakpoint
CREATE INDEX "appraisal_tracker_period_idx" ON "appraisal_tracker" USING btree ("period");--> statement-breakpoint
CREATE INDEX "appraisals_year_idx" ON "appraisals" USING btree ("year");--> statement-breakpoint
CREATE INDEX "appraisals_period_idx" ON "appraisals" USING btree ("period");--> statement-breakpoint
CREATE INDEX "appraisals_totalScore_idx" ON "appraisals" USING btree ("total_score");