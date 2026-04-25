import {
  boolean,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  unique,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

import { departments } from "./departments";
import { leaveTypes } from "./leave";

export const leavePolicies = pgTable(
  "leave_policies",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    name: text("name").notNull(),
    code: text("code").notNull(),
    departmentId: text("department_id").references(() => departments.id, {
      onDelete: "cascade",
    }),
    leaveTypeId: text("leave_type_id").references(() => leaveTypes.id, {
      onDelete: "cascade",
    }),
    maxConcurrentAbsences: integer("max_concurrent_absences").notNull().default(2),
    maxRequestsPerYear: integer("max_requests_per_year"),
    requiresHrOverrideForSplit: boolean("requires_hr_override_for_split")
      .notNull()
      .default(false),
    allowCarryOver: boolean("allow_carry_over").notNull().default(false),
    allowRollover: boolean("allow_rollover").notNull().default(false),
    blockedMonths: text("blocked_months").array().default([]),
    isActive: boolean("is_active").notNull().default(true),
    notes: text("notes"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    unique("leave_policies_code_unique").on(table.code),
    index("leave_policies_departmentId_idx").on(table.departmentId),
    index("leave_policies_leaveTypeId_idx").on(table.leaveTypeId),
  ],
);

export const leavePoliciesRelations = relations(leavePolicies, ({ one }) => ({
  department: one(departments, {
    fields: [leavePolicies.departmentId],
    references: [departments.id],
  }),
  leaveType: one(leaveTypes, {
    fields: [leavePolicies.leaveTypeId],
    references: [leaveTypes.id],
  }),
}));
