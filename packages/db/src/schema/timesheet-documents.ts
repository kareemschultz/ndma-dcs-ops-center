import { relations } from "drizzle-orm";
import {
  index,
  integer,
  pgEnum,
  pgTable,
  serial,
  text,
  timestamp,
  unique,
} from "drizzle-orm/pg-core";

import { staffProfiles } from "./staff";
import { user } from "./auth";

export const timesheetOfficeEnum = pgEnum("timesheet_office", [
  "castellani",
  "liliendaal",
]);

export const timesheetDocuments = pgTable(
  "timesheet_documents",
  {
    id: serial("id").primaryKey(),
    staffId: text("staff_id")
      .notNull()
      .references(() => staffProfiles.id, { onDelete: "cascade" }),
    year: integer("year").notNull(),
    month: integer("month").notNull(),
    office: timesheetOfficeEnum("office").notNull(),
    filename: text("filename").notNull(),
    storagePath: text("storage_path"),
    uploadedBy: text("uploaded_by").references(() => user.id, {
      onDelete: "set null",
    }),
    uploadedAt: timestamp("uploaded_at").defaultNow().notNull(),
  },
  (table) => [
    unique("timesheet_documents_staff_year_month_office_uq").on(
      table.staffId,
      table.year,
      table.month,
      table.office,
    ),
    index("timesheet_documents_staffId_idx").on(table.staffId),
    index("timesheet_documents_year_month_idx").on(table.year, table.month),
    index("timesheet_documents_office_idx").on(table.office),
  ],
);

export const timesheetDocumentsRelations = relations(timesheetDocuments, ({ one }) => ({
  staffProfile: one(staffProfiles, {
    fields: [timesheetDocuments.staffId],
    references: [staffProfiles.id],
  }),
  uploader: one(user, {
    fields: [timesheetDocuments.uploadedBy],
    references: [user.id],
    relationName: "timesheetDocumentUploadedBy",
  }),
}));
