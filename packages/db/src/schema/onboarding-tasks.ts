import { relations } from "drizzle-orm";
import { boolean, date, pgTable, serial, text, timestamp, varchar } from "drizzle-orm/pg-core";

import { staffProfiles } from "./staff";

export const onboardingTasks = pgTable("onboarding_tasks", {
  id: serial("id").primaryKey(),
  staffId: text("staff_id")
    .notNull()
    .references(() => staffProfiles.id, { onDelete: "cascade" }),
  taskName: varchar("task_name", { length: 255 }).notNull(),
  category: varchar("category", { length: 255 }).notNull(),
  isCompleted: boolean("is_completed").notNull().default(false),
  completedAt: timestamp("completed_at"),
  dueDate: date("due_date"),
});

export const onboardingTasksRelations = relations(onboardingTasks, ({ one }) => ({
  staffProfile: one(staffProfiles, {
    fields: [onboardingTasks.staffId],
    references: [staffProfiles.id],
  }),
}));
