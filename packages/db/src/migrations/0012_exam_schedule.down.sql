-- Data fidelity imperfect on rollback — structural restore only
CREATE TYPE "exam_date_status" AS ENUM ('Scheduled', 'Passed', 'Failed');
CREATE TABLE IF NOT EXISTS "exam_dates" (
  "id" serial PRIMARY KEY,
  "staff_id" text NOT NULL REFERENCES "staff_profiles"("id") ON DELETE CASCADE,
  "exam_name" varchar(255) NOT NULL,
  "scheduled_date" date NOT NULL,
  "status" "exam_date_status" NOT NULL DEFAULT 'Scheduled'
);
DROP TABLE "exam_schedule";
DROP TYPE "exam_schedule_status";
