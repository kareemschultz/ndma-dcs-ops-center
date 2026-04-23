import { relations } from "drizzle-orm";
import { date, index, numeric, pgEnum, pgTable, serial, text, time } from "drizzle-orm/pg-core";

import { staffProfiles } from "./staff";

export const attendanceStatusEnum = pgEnum("attendance_status", [
  "Workday",
  "Restday",
  "Absent",
  "Leave",
  "Holiday",
]);

export const attendanceLogs = pgTable(
  "attendance_logs",
  {
    id: serial("id").primaryKey(),
    staffId: text("staff_id")
      .notNull()
      .references(() => staffProfiles.id, { onDelete: "cascade" }),
    date: date("date").notNull(),
    clockIn: time("clock_in"),
    clockOut: time("clock_out"),
    workHours: numeric("work_hours", { precision: 8, scale: 2 }),
    status: attendanceStatusEnum("status").notNull(),
  },
  (table) => [
    index("attendance_logs_staffId_idx").on(table.staffId),
    index("attendance_logs_date_idx").on(table.date),
    index("attendance_logs_status_idx").on(table.status),
  ],
);

export const attendanceLogsRelations = relations(attendanceLogs, ({ one }) => ({
  staffProfile: one(staffProfiles, {
    fields: [attendanceLogs.staffId],
    references: [staffProfiles.id],
  }),
}));
