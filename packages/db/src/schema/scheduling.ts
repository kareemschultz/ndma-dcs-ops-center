import { date, index, integer, pgEnum, pgTable, text, timestamp, unique } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { staffProfiles } from "./staff";

// ── DCS On-Call Weeks ─────────────────────────────────────────────────────
// Simple per-week assignment table mapping roles to staff members.
// Separate from the existing on_call_schedules (which has a different structure).

export const dcsOnCallWeeks = pgTable(
  "dcs_on_call_weeks",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    year: integer("year").notNull(),
    weekNum: integer("week_num").notNull(),
    weekStartDate: date("week_start_date").notNull(),
    weekEndDate: date("week_end_date").notNull(),
    leadEngineerId: text("lead_engineer_id").references(() => staffProfiles.id, {
      onDelete: "set null",
    }),
    asnSupportId: text("asn_support_id").references(() => staffProfiles.id, {
      onDelete: "set null",
    }),
    enterpriseSupportId: text("enterprise_support_id").references(() => staffProfiles.id, {
      onDelete: "set null",
    }),
    coreSupportId: text("core_support_id").references(() => staffProfiles.id, {
      onDelete: "set null",
    }),
    notes: text("notes"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (t) => [unique("dcs_on_call_weeks_unique").on(t.year, t.weekNum)],
);

export const dcsOnCallWeeksRelations = relations(dcsOnCallWeeks, ({ one, many }) => ({
  leadEngineer: one(staffProfiles, {
    fields: [dcsOnCallWeeks.leadEngineerId],
    references: [staffProfiles.id],
    relationName: "dcsWeekLeadEngineer",
  }),
  asnSupport: one(staffProfiles, {
    fields: [dcsOnCallWeeks.asnSupportId],
    references: [staffProfiles.id],
    relationName: "dcsWeekAsnSupport",
  }),
  enterpriseSupport: one(staffProfiles, {
    fields: [dcsOnCallWeeks.enterpriseSupportId],
    references: [staffProfiles.id],
    relationName: "dcsWeekEnterpriseSupport",
  }),
  coreSupport: one(staffProfiles, {
    fields: [dcsOnCallWeeks.coreSupportId],
    references: [staffProfiles.id],
    relationName: "dcsWeekCoreSupport",
  }),
  swaps: many(dcsOncallSwaps),
}));

// ── Quarterly Maintenance Tasks ───────────────────────────────────────────

export const quarterlyMaintenanceStatusEnum = pgEnum("quarterly_maintenance_status", [
  "pending",
  "in_progress",
  "complete",
  "deferred",
]);

export const quarterlyMaintenanceTasks = pgTable(
  "quarterly_maintenance_tasks",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    year: integer("year").notNull(),
    quarter: integer("quarter").notNull(),
    taskName: text("task_name").notNull(),
    assignedStaffIds: text("assigned_staff_ids").array().default([]),
    completionStatus: quarterlyMaintenanceStatusEnum("completion_status")
      .notNull()
      .default("pending"),
    completionDate: date("completion_date"),
    completionNotes: text("completion_notes"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (t) => [unique("quarterly_maint_unique").on(t.year, t.quarter, t.taskName)],
);

// ── DCS On-Call Swaps ─────────────────────────────────────────────────────
// Tied to dcs_on_call_weeks. Separate from existing on_call_swaps in rota.ts.

export const dcsSwapStatusEnum = pgEnum("dcs_swap_status", [
  "pending",
  "approved",
  "rejected",
  "cancelled",
]);

export type DcsOnCallRole = "lead_engineer" | "asn_support" | "enterprise_support" | "core_support";

export const dcsOncallSwaps = pgTable("dcs_oncall_swaps", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  requesterId: text("requester_id")
    .notNull()
    .references(() => staffProfiles.id, { onDelete: "cascade" }),
  originalWeekId: text("original_week_id")
    .notNull()
    .references(() => dcsOnCallWeeks.id, { onDelete: "cascade" }),
  role: text("role").$type<DcsOnCallRole>().notNull(),
  targetStaffId: text("target_staff_id")
    .notNull()
    .references(() => staffProfiles.id, { onDelete: "cascade" }),
  targetWeekId: text("target_week_id")
    .notNull()
    .references(() => dcsOnCallWeeks.id, { onDelete: "cascade" }),
  status: dcsSwapStatusEnum("status").notNull().default("pending"),
  reason: text("reason"),
  reviewedBy: text("reviewed_by").references(() => staffProfiles.id, { onDelete: "set null" }),
  reviewedAt: timestamp("reviewed_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const dcsOncallSwapsRelations = relations(dcsOncallSwaps, ({ one }) => ({
  requester: one(staffProfiles, {
    fields: [dcsOncallSwaps.requesterId],
    references: [staffProfiles.id],
    relationName: "dcsSwapRequester",
  }),
  originalWeek: one(dcsOnCallWeeks, {
    fields: [dcsOncallSwaps.originalWeekId],
    references: [dcsOnCallWeeks.id],
    relationName: "dcsSwapOriginalWeek",
  }),
  targetStaff: one(staffProfiles, {
    fields: [dcsOncallSwaps.targetStaffId],
    references: [staffProfiles.id],
    relationName: "dcsSwapTargetStaff",
  }),
  targetWeek: one(dcsOnCallWeeks, {
    fields: [dcsOncallSwaps.targetWeekId],
    references: [dcsOnCallWeeks.id],
    relationName: "dcsSwapTargetWeek",
  }),
  reviewer: one(staffProfiles, {
    fields: [dcsOncallSwaps.reviewedBy],
    references: [staffProfiles.id],
    relationName: "dcsSwapReviewer",
  }),
}));
