import { relations } from "drizzle-orm";
import { date, pgTable, serial, text, varchar } from "drizzle-orm/pg-core";

export const companyPolicies = pgTable("company_policies", {
  id: serial("id").primaryKey(),
  title: varchar("title", { length: 255 }).notNull(),
  contentText: text("content_text").notNull(),
  documentUrl: varchar("document_url", { length: 500 }),
  lastUpdated: date("last_updated").notNull(),
});

export const companyPoliciesRelations = relations(companyPolicies, () => ({}));
