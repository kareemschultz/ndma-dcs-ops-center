import {
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

import { user } from "./auth";

// ── Enums ─────────────────────────────────────────────────────────────────

export const importJobStatusEnum = pgEnum("import_job_status", [
  "pending",
  "running",
  "completed",
  "failed",
  "partial",
]);

export const importTypeEnum = pgEnum("import_type", [
  "staff",
  "training",
  "contracts",
  "work",
  "operations_work_update",
  "roster",
  "platform_accounts",
  "leave",
  "ppe",
  "attendance",
  "callouts",
  "appraisals",
  "calendar_events",
  "promotions",
  "exam_schedule",
  "onboarding",
  "policy",
  "forms",
]);

// ── Import Jobs ────────────────────────────────────────────────────────────
// One row per import run — tracks counts, errors, and actor for audit purposes.

export const importJobs = pgTable("import_jobs", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),

  importType: importTypeEnum("import_type").notNull(),
  status: importJobStatusEnum("status").notNull().default("pending"),

  // Original file name (from client)
  fileName: text("file_name"),

  // Row counts — updated during/after execution
  totalRows: integer("total_rows").default(0),
  successCount: integer("success_count").default(0),
  errorCount: integer("error_count").default(0),
  skippedCount: integer("skipped_count").default(0),

  // Array of { row: number, field?: string, message: string }
  errors: jsonb("errors").$type<{ row: number; field?: string; message: string }[]>(),

  createdByUserId: text("created_by_user_id").references(() => user.id, {
    onDelete: "set null",
  }),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ── Relations ─────────────────────────────────────────────────────────────

export const importJobsRelations = relations(importJobs, ({ one }) => ({
  createdBy: one(user, {
    fields: [importJobs.createdByUserId],
    references: [user.id],
  }),
}));
