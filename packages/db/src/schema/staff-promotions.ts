import { relations } from "drizzle-orm";
import { date, index, pgTable, serial, text, varchar } from "drizzle-orm/pg-core";

import { staffProfiles } from "./staff";

export const staffPromotions = pgTable(
  "staff_promotions",
  {
    id: serial("id").primaryKey(),
    staffId: text("staff_id")
      .notNull()
      .references(() => staffProfiles.id, { onDelete: "cascade" }),
    promotionDate: date("promotion_date").notNull(),
    letterDate: date("letter_date"),
    fromTitle: varchar("from_title", { length: 255 }),
    toTitle: varchar("to_title", { length: 255 }).notNull(),
    letterUrl: text("letter_url"),
    notes: text("notes"),
  },
  (table) => [
    index("staff_promotions_staffId_idx").on(table.staffId),
    index("staff_promotions_promotionDate_idx").on(table.promotionDate),
  ],
);

export const staffPromotionsRelations = relations(staffPromotions, ({ one }) => ({
  staffProfile: one(staffProfiles, {
    fields: [staffPromotions.staffId],
    references: [staffProfiles.id],
  }),
}));
