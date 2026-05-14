import { relations } from "drizzle-orm";
import {
  date,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

import { staffProfiles } from "./staff";

// Per design handoff §12 — NDMA advance request format.
// Status: pending → partial → cleared.
export const advanceStatusEnum = pgEnum("advance_status", [
  "pending",
  "partial",
  "cleared",
]);

// Expense breakdown rows in exact NDMA order. Amount formula:
//   breakfast/lunch/dinner/out_of_pocket → amount = persons * cost_per_unit * days
//   miscellaneous → lump sum (persons/cost/days unused)
export const advanceExpenseKindEnum = pgEnum("advance_expense_kind", [
  "breakfast",
  "lunch",
  "dinner",
  "out_of_pocket",
  "miscellaneous",
]);

export const advanceRequests = pgTable("advance_requests", {
  id: text("id").primaryKey(),
  refNumber: text("ref_number").notNull().unique(), // e.g. "ADV-2026-0001"
  staffProfileId: text("staff_profile_id")
    .notNull()
    .references(() => staffProfiles.id, { onDelete: "cascade" }),
  purpose: text("purpose").notNull(),
  recipients: jsonb("recipients").notNull().default([]), // string[]
  dateRequested: date("date_requested").notNull(),
  expectedClearance: date("expected_clearance"),
  actualClearance: date("actual_clearance"),
  totalAmount: numeric("total_amount", { precision: 14, scale: 2 })
    .notNull()
    .default("0"),
  status: advanceStatusEnum("status").notNull().default("pending"),
  signatureDataUrl: text("signature_data_url"),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at")
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const advanceExpenseLines = pgTable("advance_expense_lines", {
  id: text("id").primaryKey(),
  advanceRequestId: text("advance_request_id")
    .notNull()
    .references(() => advanceRequests.id, { onDelete: "cascade" }),
  kind: advanceExpenseKindEnum("kind").notNull(),
  persons: integer("persons").notNull().default(0),
  costPerUnit: numeric("cost_per_unit", { precision: 12, scale: 2 })
    .notNull()
    .default("0"),
  days: integer("days").notNull().default(0),
  amount: numeric("amount", { precision: 14, scale: 2 }).notNull().default("0"),
});

export const advanceRequestsRelations = relations(advanceRequests, ({ one, many }) => ({
  staffProfile: one(staffProfiles, {
    fields: [advanceRequests.staffProfileId],
    references: [staffProfiles.id],
  }),
  lines: many(advanceExpenseLines),
}));

export const advanceExpenseLinesRelations = relations(advanceExpenseLines, ({ one }) => ({
  request: one(advanceRequests, {
    fields: [advanceExpenseLines.advanceRequestId],
    references: [advanceRequests.id],
  }),
}));
