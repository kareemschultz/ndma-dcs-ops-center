import {
  date,
  index,
  integer,
  pgEnum,
  pgTable,
  varchar,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

import { staffProfiles } from "./staff";

export const contractStatusEnum = pgEnum("contract_status", [
  "active",
  "expiring_soon",
  "expired",
  "renewed",
  "terminated",
]);

export const contracts = pgTable(
  "contracts",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    staffProfileId: text("staff_profile_id")
      .notNull()
      .references(() => staffProfiles.id, { onDelete: "cascade" }),
    // e.g. "permanent", "fixed_term", "contract", "secondment"
    contractType: text("contract_type").notNull(),
    startDate: date("start_date").notNull(),
    endDate: date("end_date"),
    appraisalPeriod: varchar("appraisal_period", { length: 255 }),
    // Days before endDate to trigger expiry reminder
    renewalReminderDays: integer("renewal_reminder_days").notNull().default(60),
    renewalStatus: text("renewal_status", {
      enum: ["not_due", "due_soon", "letter_drafted", "submitted_to_hr", "renewed", "not_renewing"],
    })
      .notNull()
      .default("not_due"),
    status: contractStatusEnum("status").notNull().default("active"),
    documentUrl: text("document_url"),
    notes: text("notes"),
    // Phase 6 — lifecycle dates (computed from endDate by handler or manually set)
    renewalLetterDueDate: date("renewal_letter_due_date"),
    appraisal1DueDate: date("appraisal_1_due_date"),
    appraisal2DueDate: date("appraisal_2_due_date"),
    submittedToHrAt: timestamp("submitted_to_hr_at"),
    renewalOutcome: text("renewal_outcome").$type<"renewed" | "not_renewed" | "left" | "terminated">(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("contracts_staffProfileId_idx").on(table.staffProfileId),
    index("contracts_status_idx").on(table.status),
    index("contracts_endDate_idx").on(table.endDate),
  ],
);

export const contractsRelations = relations(contracts, ({ one }) => ({
  staffProfile: one(staffProfiles, {
    fields: [contracts.staffProfileId],
    references: [staffProfiles.id],
  }),
}));
