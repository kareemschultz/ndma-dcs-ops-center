import { relations } from "drizzle-orm";
import { date, index, integer, pgEnum, pgTable, text, timestamp } from "drizzle-orm/pg-core";

import { staffProfiles } from "./staff";

export const examScheduleStatusEnum = pgEnum("exam_schedule_status", [
  "scheduled",
  "passed",
  "failed",
  "cancelled",
  "rescheduled",
]);

export const examSchedule = pgTable(
  "exam_schedule",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    staffProfileId: text("staff_profile_id")
      .notNull()
      .references(() => staffProfiles.id, { onDelete: "cascade" }),
    examName: text("exam_name").notNull(),
    scheduledDate: date("scheduled_date").notNull(),
    examDate: date("exam_date"),
    vendor: text("vendor"),
    certificationId: text("certification_id"),
    voucherId: text("voucher_id"),
    score: integer("score"),
    passingScore: integer("passing_score"),
    notes: text("notes"),
    status: examScheduleStatusEnum("status").notNull().default("scheduled"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("exam_schedule_staffProfileId_idx").on(table.staffProfileId),
    index("exam_schedule_scheduledDate_idx").on(table.scheduledDate),
    index("exam_schedule_status_idx").on(table.status),
  ],
);

export const examScheduleRelations = relations(examSchedule, ({ one }) => ({
  staffProfile: one(staffProfiles, {
    fields: [examSchedule.staffProfileId],
    references: [staffProfiles.id],
  }),
}));
