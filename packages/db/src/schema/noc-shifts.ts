import { relations } from "drizzle-orm";
import {
  date,
  index,
  pgEnum,
  pgTable,
  serial,
  text,
  timestamp,
  unique,
} from "drizzle-orm/pg-core";

import { staffProfiles } from "./staff";

export const nocShiftTypeEnum = pgEnum("noc_shift_type", [
  "12hr Day",
  "12hr Night",
  "Split Shift",
  "Off",
  "Annual Leave",
  "Sick Leave",
  "Maternity Leave",
  "Training",
  "Custom",
]);

export const nocShifts = pgTable(
  "noc_shifts",
  {
    id: serial("id").primaryKey(),
    staffId: text("staff_id")
      .notNull()
      .references(() => staffProfiles.id, { onDelete: "cascade" }),
    shiftDate: date("shift_date").notNull(),
    shiftType: nocShiftTypeEnum("shift_type").notNull(),
    notes: text("notes"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    unique("noc_shifts_staffId_shiftDate_unique").on(table.staffId, table.shiftDate),
    index("noc_shifts_staffId_idx").on(table.staffId),
    index("noc_shifts_shiftDate_idx").on(table.shiftDate),
    index("noc_shifts_shiftType_idx").on(table.shiftType),
  ],
);

export const nocShiftsRelations = relations(nocShifts, ({ one }) => ({
  staffProfile: one(staffProfiles, {
    fields: [nocShifts.staffId],
    references: [staffProfiles.id],
  }),
}));
