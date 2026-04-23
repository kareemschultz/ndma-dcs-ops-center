import { relations } from "drizzle-orm";
import { index, integer, pgTable, serial, text, varchar } from "drizzle-orm/pg-core";

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
    totalTimeLate: varchar("total_time_late", { length: 32 }).notNull(),
    daysLate: integer("days_late").notNull(),
  },
  (table) => [
    index("lateness_records_staffId_idx").on(table.staffId),
    index("lateness_records_year_idx").on(table.year),
    index("lateness_records_month_idx").on(table.month),
  ],
);

export const latenessRecordsRelations = relations(latenessRecords, ({ one }) => ({
  staffProfile: one(staffProfiles, {
    fields: [latenessRecords.staffId],
    references: [staffProfiles.id],
  }),
}));
