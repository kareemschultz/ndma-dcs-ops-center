import { relations } from "drizzle-orm";
import {
  index,
  integer,
  pgTable,
  text,
  timestamp,
  unique,
} from "drizzle-orm/pg-core";

import { staffProfiles } from "./staff";

/**
 * Commendations — positive recognition narratives per (staff, year, month).
 * Master plan §5.3.
 *
 * Source of truth: `NOC/appraisals/StaffCommendationJournal_20231216_v01.xlsx`
 * (2 sheets — 2025, 2026; rows = staff names, columns = months, cells = narratives).
 *
 * Distinct from `performance_journal_entries` (in `hr-docs.ts`) which is an
 * appraisal-period feedback log keyed by `entryDate` + `entryType` + `body`.
 * The naming alignment between the existing `performance_journal_entries`
 * table and master plan §5.3's spec for a monthly-mistake-matrix tracker
 * is a separate Phase 5 follow-up — see `docs/plan-questions.md`.
 */
export const commendations = pgTable(
  "commendations",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    staffProfileId: text("staff_profile_id")
      .notNull()
      .references(() => staffProfiles.id, { onDelete: "cascade" }),
    year: integer("year").notNull(),
    month: integer("month").notNull(), // 1-12 (CHECK constraint enforced in migration)
    narrative: text("narrative").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    unique("commendations_staff_year_month_unique").on(
      table.staffProfileId,
      table.year,
      table.month,
    ),
    index("commendations_staffProfileId_idx").on(table.staffProfileId),
    index("commendations_year_month_idx").on(table.year, table.month),
  ],
);

export const commendationsRelations = relations(commendations, ({ one }) => ({
  staff: one(staffProfiles, {
    fields: [commendations.staffProfileId],
    references: [staffProfiles.id],
  }),
}));
