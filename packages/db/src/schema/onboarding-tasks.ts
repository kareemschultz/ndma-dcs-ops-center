import { relations } from "drizzle-orm";
import { boolean, date, integer, pgTable, serial, text, timestamp, varchar } from "drizzle-orm/pg-core";

import { staffProfiles } from "./staff";
// Phase 7 — onboarding_task_templates imported from training-phase7
import { onboardingTaskTemplates } from "./training-phase7";

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
  // Phase 7 — link to onboarding task template
  templateId: integer("template_id").references(() => onboardingTaskTemplates.id, {
    onDelete: "set null",
  }),
});

export const onboardingTasksRelations = relations(onboardingTasks, ({ one }) => ({
  staffProfile: one(staffProfiles, {
    fields: [onboardingTasks.staffId],
    references: [staffProfiles.id],
  }),
  template: one(onboardingTaskTemplates, {
    fields: [onboardingTasks.templateId],
    references: [onboardingTaskTemplates.id],
  }),
}));
