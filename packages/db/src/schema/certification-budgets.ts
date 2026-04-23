import { relations } from "drizzle-orm";
import { integer, pgEnum, pgTable, serial, varchar } from "drizzle-orm/pg-core";

export const certificationBudgetStatusEnum = pgEnum("certification_budget_status", [
  "Planned",
  "Approved",
  "Spent",
]);

export const certificationBudgets = pgTable("certification_budgets", {
  id: serial("id").primaryKey(),
  certificationName: varchar("certification_name", { length: 255 }).notNull(),
  year: integer("year").notNull(),
  estimatedCost: integer("estimated_cost").notNull(),
  actualCost: integer("actual_cost").notNull().default(0),
  currency: varchar("currency", { length: 8 }).notNull().default("GYD"),
  status: certificationBudgetStatusEnum("status").notNull().default("Planned"),
});

export const certificationBudgetsRelations = relations(certificationBudgets, () => ({}));
