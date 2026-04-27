import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

import { user } from "./auth";
import { staffProfiles } from "./staff";

// ── Enums ─────────────────────────────────────────────────────────────────

export const leaveRequestStatusEnum = pgEnum("leave_request_status", [
  "pending",
  "approved",
  "rejected",
  "cancelled",
]);

// ── Leave Types (e.g. Annual, Sick, Maternity, Study) ─────────────────────

export const leaveTypes = pgTable("leave_types", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text("name").notNull(),
  code: text("code").notNull().unique(), // e.g. "AL", "SL", "ML", "STL"
  defaultAnnualAllowance: integer("default_annual_allowance").notNull().default(20),
  requiresApproval: boolean("requires_approval").default(true).notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
});

// ── Leave Balances (per staff per leave type per contract year) ───────────

export const leaveBalances = pgTable(
  "leave_balances",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    staffProfileId: text("staff_profile_id")
      .notNull()
      .references(() => staffProfiles.id, { onDelete: "cascade" }),
    leaveTypeId: text("leave_type_id")
      .notNull()
      .references(() => leaveTypes.id, { onDelete: "cascade" }),
    contractYearStart: date("contract_year_start").notNull(),
    contractYearEnd: date("contract_year_end").notNull(),
    entitlement: integer("entitlement").notNull(),
    used: integer("used").notNull().default(0),
    carriedOver: integer("carried_over").notNull().default(0),
    adjustment: integer("adjustment").notNull().default(0),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    unique("leave_balances_unique").on(
      table.staffProfileId,
      table.leaveTypeId,
      table.contractYearStart,
    ),
  ],
);

// ── Leave Requests ─────────────────────────────────────────────────────────

export const leaveRequests = pgTable(
  "leave_requests",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    staffProfileId: text("staff_profile_id")
      .notNull()
      .references(() => staffProfiles.id, { onDelete: "cascade" }),
    leaveTypeId: text("leave_type_id")
      .notNull()
      .references(() => leaveTypes.id, { onDelete: "restrict" }),
    startDate: date("start_date").notNull(),
    endDate: date("end_date").notNull(),
    totalDays: integer("total_days").notNull(),
    reason: text("reason"),
    status: leaveRequestStatusEnum("status").notNull().default("pending"),
    approvedById: text("approved_by_id").references(() => user.id, {
      onDelete: "set null",
    }),
    approvedAt: timestamp("approved_at"),
    rejectionReason: text("rejection_reason"),
    // Allows a manager to force-approve despite rota overlap
    overlapOverride: boolean("overlap_override").default(false).notNull(),
    // Override fields — set when a manager forces approval despite violations
    overrideReason: text("override_reason"),
    overriddenBy: text("overridden_by").references(() => staffProfiles.id, {
      onDelete: "set null",
    }),
    violations: jsonb("violations").$type<string[]>(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("leave_requests_staffProfileId_idx").on(table.staffProfileId),
    index("leave_requests_status_idx").on(table.status),
    index("leave_requests_dateRange_idx").on(table.startDate, table.endDate),
  ],
);

// ── Relations ─────────────────────────────────────────────────────────────────

export const leaveTypesRelations = relations(leaveTypes, ({ many }) => ({
  balances: many(leaveBalances),
  requests: many(leaveRequests),
}));

export const leaveBalancesRelations = relations(leaveBalances, ({ one }) => ({
  staffProfile: one(staffProfiles, {
    fields: [leaveBalances.staffProfileId],
    references: [staffProfiles.id],
  }),
  leaveType: one(leaveTypes, {
    fields: [leaveBalances.leaveTypeId],
    references: [leaveTypes.id],
  }),
}));

export const leaveRequestsRelations = relations(leaveRequests, ({ one }) => ({
  staffProfile: one(staffProfiles, {
    fields: [leaveRequests.staffProfileId],
    references: [staffProfiles.id],
  }),
  leaveType: one(leaveTypes, {
    fields: [leaveRequests.leaveTypeId],
    references: [leaveTypes.id],
  }),
  approvedBy: one(user, {
    fields: [leaveRequests.approvedById],
    references: [user.id],
  }),
  overriddenByStaff: one(staffProfiles, {
    fields: [leaveRequests.overriddenBy],
    references: [staffProfiles.id],
    relationName: "leaveRequestOverriddenBy",
  }),
}));
