import { relations } from "drizzle-orm";
import {
  boolean,
  date,
  index,
  jsonb,
  pgEnum,
  pgTable,
  varchar,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

import { user } from "./auth";
import { departments } from "./departments";

export const employmentTypeEnum = pgEnum("employment_type", [
  "full_time",
  "part_time",
  "contract",
  "temporary",
]);

export const staffStatusEnum = pgEnum("staff_status", [
  "active",
  "inactive",
  "on_leave",
  "terminated",
]);

export const staffRoleEnum = pgEnum("staff_role", [
  "Staff",
  "Team_Lead",
  "Manager",
  "PA",
  "Admin",
]);

export const staffProfiles = pgTable(
  "staff_profiles",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id")
      .notNull()
      .unique()
      .references(() => user.id, { onDelete: "cascade" }),
    employeeId: text("employee_id").notNull().unique(), // e.g. "DCS-001"
    departmentId: text("department_id")
      .notNull()
      .references(() => departments.id),
    role: staffRoleEnum("role").default("Staff").notNull(),
    phoneNumber: varchar("phone_number", { length: 32 }),
    // Phase 1 — extended profile fields (master plan §5.1) — added via migration 0016
    cugPhoneNumber: text("cug_phone_number"),
    cugSimNumber: text("cug_sim_number"),
    mifiAssetTag: text("mifi_asset_tag"),
    birthday: date("birthday"),
    employmentStatus: text("employment_status").default("Active"),
    hireDate: date("hire_date"),
    contractEndDate: date("contract_end_date"),
    currentAppointment: text("current_appointment"),
    jobTitle: text("job_title").notNull(),
    employmentType: employmentTypeEnum("employment_type")
      .default("full_time")
      .notNull(),
    status: staffStatusEnum("status").default("active").notNull(),
    // On-call eligibility
    isTeamLead: boolean("is_team_lead").default(false).notNull(),
    isLeadEngineerEligible: boolean("is_lead_engineer_eligible")
      .default(false)
      .notNull(),
    isOnCallEligible: boolean("is_on_call_eligible").default(true).notNull(),
    // Reporting relationship — team_lead_id dropped in migration 0010.
    reportsTo: text("reports_to"),
    emergencyContacts: jsonb("emergency_contacts")
      .$type<{ name: string; phone: string; relation?: string }[]>()
      .default([]),
    contractExpiresAt: timestamp("contract_expires_at"),
    startDate: timestamp("start_date").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("staff_profiles_userId_idx").on(table.userId),
    index("staff_profiles_departmentId_idx").on(table.departmentId),
    index("staff_profiles_role_idx").on(table.role),
    index("staff_profiles_reportsTo_idx").on(table.reportsTo),
  ],
);

export const staffProfileRelations = relations(staffProfiles, ({ one }) => ({
  user: one(user, {
    fields: [staffProfiles.userId],
    references: [user.id],
  }),
  department: one(departments, {
    fields: [staffProfiles.departmentId],
    references: [departments.id],
  }),
}));
