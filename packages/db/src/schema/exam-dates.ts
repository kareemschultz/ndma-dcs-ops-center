import { relations } from "drizzle-orm";
import { date, pgEnum, pgTable, serial, text, varchar } from "drizzle-orm/pg-core";

import { staffProfiles } from "./staff";

export const examDateStatusEnum = pgEnum("exam_date_status", [
  "Scheduled",
  "Passed",
  "Failed",
]);

export const examDates = pgTable("exam_dates", {
  id: serial("id").primaryKey(),
  staffId: text("staff_id")
    .notNull()
    .references(() => staffProfiles.id, { onDelete: "cascade" }),
  examName: varchar("exam_name", { length: 255 }).notNull(),
  scheduledDate: date("scheduled_date").notNull(),
  status: examDateStatusEnum("status").notNull().default("Scheduled"),
});

export const examDatesRelations = relations(examDates, ({ one }) => ({
  staffProfile: one(staffProfiles, {
    fields: [examDates.staffId],
    references: [staffProfiles.id],
  }),
}));
