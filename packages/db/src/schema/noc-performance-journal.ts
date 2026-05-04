import { relations } from "drizzle-orm";
import {
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
} from "drizzle-orm/pg-core";

import { staffProfiles } from "./staff";

/**
 * NOC performance journal — monthly mistake-matrix tracker.
 *
 * Master plan §5.3 specified this entity under the name `performance_journal_entries`,
 * but that name was already taken by an unrelated table in `hr-docs.ts` (appraisal-period
 * feedback log). Resolved 2026-05-04 (`docs/plan-questions.md` Option B): renamed to
 * `noc_performance_journal` to avoid collision; the existing `performance_journal_entries`
 * stays as-is for the HR docs feedback flow.
 *
 * Source of truth: `NOC/appraisals/StaffPerformanceJournal_20230731_v01.xlsx`
 * — 12 per-staff sheets × 4 years × 12 months × 4 categories = ~2,304 rows.
 * Phase 14 seed step 10 ingests this XLSX into this table.
 *
 * Per-cell shape: count + optional narrative comment, scoped by (staff, year, month, category).
 */
export const nocPerfJournalCategoryEnum = pgEnum(
  "noc_perf_journal_category",
  ["tickets_itop", "alarms", "slack_whatsapp", "task_incomplete"],
);

export const nocPerformanceJournal = pgTable(
  "noc_performance_journal",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    staffProfileId: text("staff_profile_id")
      .notNull()
      .references(() => staffProfiles.id, { onDelete: "cascade" }),
    year: integer("year").notNull(),
    month: integer("month").notNull(), // 1-12 (CHECK enforced in migration)
    category: nocPerfJournalCategoryEnum("category").notNull(),
    count: integer("count").notNull().default(0),
    narrative: text("narrative"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    unique("noc_performance_journal_staff_year_month_category_unique").on(
      table.staffProfileId,
      table.year,
      table.month,
      table.category,
    ),
    index("noc_performance_journal_staffProfileId_idx").on(table.staffProfileId),
    index("noc_performance_journal_year_month_idx").on(table.year, table.month),
    index("noc_performance_journal_category_idx").on(table.category),
  ],
);

export const nocPerformanceJournalRelations = relations(
  nocPerformanceJournal,
  ({ one }) => ({
    staff: one(staffProfiles, {
      fields: [nocPerformanceJournal.staffProfileId],
      references: [staffProfiles.id],
    }),
  }),
);
