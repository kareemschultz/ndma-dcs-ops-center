import { relations } from "drizzle-orm";
import { pgEnum, pgTable, serial, text, timestamp, varchar } from "drizzle-orm/pg-core";

export const companyFormCategoryEnum = pgEnum("company_form_category", [
  "HR & Leave",
  "Finance",
  "Operations",
  "IT",
  "General",
]);

export const companyForms = pgTable("company_forms", {
  id: serial("id").primaryKey(),
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description"),
  category: companyFormCategoryEnum("category").notNull(),
  fileUrl: varchar("file_url", { length: 500 }).notNull(),
  uploadedAt: timestamp("uploaded_at").defaultNow().notNull(),
});

export const companyFormsRelations = relations(companyForms, () => ({}));
