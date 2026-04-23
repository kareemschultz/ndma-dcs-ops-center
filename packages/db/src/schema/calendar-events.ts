import { relations } from "drizzle-orm";
import { date, pgEnum, pgTable, serial, text, varchar } from "drizzle-orm/pg-core";

import { staffProfiles } from "./staff";

export const calendarEventTypeEnum = pgEnum("calendar_event_type", [
  "Birthday",
  "Training",
  "Event",
]);

export const calendarEvents = pgTable("calendar_events", {
  id: serial("id").primaryKey(),
  title: varchar("title", { length: 255 }).notNull(),
  eventType: calendarEventTypeEnum("event_type").notNull(),
  eventDate: date("event_date").notNull(),
  staffId: varchar("staff_id", { length: 255 }).references(() => staffProfiles.id, {
    onDelete: "cascade",
  }),
  notes: text("notes"),
});

export const calendarEventsRelations = relations(calendarEvents, ({ one }) => ({
  staffProfile: one(staffProfiles, {
    fields: [calendarEvents.staffId],
    references: [staffProfiles.id],
  }),
}));
