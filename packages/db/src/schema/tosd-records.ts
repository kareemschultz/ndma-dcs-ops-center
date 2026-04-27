import { date, index, numeric, pgTable, text, timestamp, unique } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { staffProfiles } from "./staff";

export const tosdTypeEnum = [
  "reported_sick",
  "medical",
  "absent",
  "time_off",
  "work_from_home",
  "lateness",
  "callout_legacy",
] as const;

export type TosdType = (typeof tosdTypeEnum)[number];

export const tosdRecords = pgTable(
  "tosd_records",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    staffId: text("staff_id")
      .notNull()
      .references(() => staffProfiles.id, { onDelete: "cascade" }),
    date: date("date").notNull(),
    type: text("type").$type<TosdType>().notNull(),
    reasonText: text("reason_text"),
    days: numeric("days", { precision: 4, scale: 2 }),
    hours: numeric("hours", { precision: 4, scale: 2 }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (t) => [
    index("tosd_staff_idx").on(t.staffId),
    index("tosd_date_idx").on(t.date),
    unique("tosd_unique").on(t.staffId, t.date, t.type),
  ],
);

export const tosdRecordsRelations = relations(tosdRecords, ({ one }) => ({
  staffProfile: one(staffProfiles, {
    fields: [tosdRecords.staffId],
    references: [staffProfiles.id],
  }),
}));
