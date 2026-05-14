import { relations } from "drizzle-orm";
import { date, index, pgEnum, pgTable, text, timestamp, unique } from "drizzle-orm/pg-core";

import { user } from "./auth";
import { staffProfiles } from "./staff";

// 10-category daily attendance per NDMA HR feature spec.
// This is SEPARATE from attendance_logs (which records clock-in/out times).
// daily_attendance is a per-day status register marked by a supervisor.
export const dailyAttendanceStatusEnum = pgEnum("daily_attendance_status", [
  "on_site",
  "wfh",
  "late",
  "half_day",
  "annual_leave",
  "sick",
  "compassionate",
  "maternity_paternity",
  "absent",
  "holiday",
]);

export const dailyAttendanceSourceEnum = pgEnum("daily_attendance_source", [
  "manual",
  "morning_auto",
  "leave_planner",
]);

export const dailyAttendance = pgTable(
  "daily_attendance",
  {
    id: text("id").primaryKey(),
    staffProfileId: text("staff_profile_id")
      .notNull()
      .references(() => staffProfiles.id, { onDelete: "cascade" }),
    date: date("date").notNull(),
    status: dailyAttendanceStatusEnum("status").notNull(),
    notes: text("notes"),
    markedBy: text("marked_by").references(() => user.id),
    autoSource: dailyAttendanceSourceEnum("auto_source").notNull().default("manual"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at")
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    unique("daily_attendance_staff_date_uq").on(t.staffProfileId, t.date),
    index("daily_attendance_date_idx").on(t.date),
    index("daily_attendance_staff_idx").on(t.staffProfileId),
    index("daily_attendance_status_idx").on(t.status),
  ],
);

export const dailyAttendanceRelations = relations(dailyAttendance, ({ one }) => ({
  staffProfile: one(staffProfiles, {
    fields: [dailyAttendance.staffProfileId],
    references: [staffProfiles.id],
  }),
  marker: one(user, {
    fields: [dailyAttendance.markedBy],
    references: [user.id],
  }),
}));
