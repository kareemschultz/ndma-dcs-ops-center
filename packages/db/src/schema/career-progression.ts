import { index, integer, pgTable, text, timestamp, unique } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

import { staffProfiles } from "./staff";

export type CareerProgressionStatus = "pending" | "achieved" | "missed";

export const careerProgressionPlans = pgTable(
  "career_progression_plans",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    staffId: text("staff_id")
      .notNull()
      .references(() => staffProfiles.id, { onDelete: "cascade" }),
    targetYear: integer("target_year").notNull(),
    plannedRole: text("planned_role").notNull(),
    conditions: text("conditions"),
    status: text("status")
      .$type<CareerProgressionStatus>()
      .notNull()
      .default("pending"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (t) => [
    unique("career_prog_unique").on(t.staffId, t.targetYear),
    index("career_prog_staff_idx").on(t.staffId),
  ],
);

export const careerProgressionPlansRelations = relations(careerProgressionPlans, ({ one }) => ({
  staffProfile: one(staffProfiles, {
    fields: [careerProgressionPlans.staffId],
    references: [staffProfiles.id],
  }),
}));
