import { relations } from "drizzle-orm";
import { index, integer, pgTable, serial, text, unique, varchar } from "drizzle-orm/pg-core";

import { staffProfiles } from "./staff";

export const latenessRecords = pgTable(
  "lateness_records",
  {
    id: serial("id").primaryKey(),
    staffId: text("staff_id")
      .notNull()
      .references(() => staffProfiles.id, { onDelete: "cascade" }),
    year: integer("year").notNull(),
    month: varchar("month", { length: 32 }).notNull(),
    quarter: integer("quarter"),
    totalTimeLate: varchar("total_time_late", { length: 32 }).notNull(),
    daysLate: integer("days_late").notNull(),
    daysMissingFromAttendance: integer("days_missing_from_attendance"),
    daysOnSchedule: integer("days_on_schedule"),
    notes: text("notes"),
  },
  (table) => [
    unique("lateness_records_staff_year_month_uq").on(table.staffId, table.year, table.month),
    index("lateness_records_staffId_idx").on(table.staffId),
    index("lateness_records_year_idx").on(table.year),
    index("lateness_records_month_idx").on(table.month),
    index("lateness_records_quarter_idx").on(table.quarter),
  ],
);

export const latenessRecordsRelations = relations(latenessRecords, ({ one }) => ({
  staffProfile: one(staffProfiles, {
    fields: [latenessRecords.staffId],
    references: [staffProfiles.id],
  }),
}));
