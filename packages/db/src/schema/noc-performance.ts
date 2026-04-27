import { boolean, integer, pgTable, text, timestamp, unique } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { staffProfiles } from "./staff";

// ── noc_ticket_activity ───────────────────────────────────────────────────

export const nocTicketActivity = pgTable(
  "noc_ticket_activity",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    ticketId: text("ticket_id").notNull(),
    type: text("type").$type<"incident" | "problem" | "work_order">().notNull(),
    year: integer("year").notNull(),
    month: integer("month").notNull(),
    action: text("action").$type<"created" | "closed">().notNull(),
    actorStaffId: text("actor_staff_id").references(() => staffProfiles.id, {
      onDelete: "set null",
    }),
    isDuplicate: boolean("is_duplicate").notNull().default(false),
    notes: text("notes"),
  },
  (t) => [unique("noc_ticket_unique").on(t.ticketId, t.action)],
);

export const nocTicketActivityRelations = relations(nocTicketActivity, ({ one }) => ({
  actorStaff: one(staffProfiles, {
    fields: [nocTicketActivity.actorStaffId],
    references: [staffProfiles.id],
  }),
}));

// ── noc_monthly_metrics ───────────────────────────────────────────────────
// Per-staff per-month performance counters.
// mt  = missed/ticket non-compliance
// itt = initial ticket time (incident/problem)
// noccc = NOC core compliance count
// nct = NOC ticket closures
// ma  = missed alarm non-compliance

export const nocMonthlyMetrics = pgTable(
  "noc_monthly_metrics",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    staffId: text("staff_id")
      .notNull()
      .references(() => staffProfiles.id, { onDelete: "cascade" }),
    year: integer("year").notNull(),
    month: integer("month").notNull(),
    mt: integer("mt").notNull().default(0),
    ittIncident: integer("itt_incident").notNull().default(0),
    ittProblem: integer("itt_problem").notNull().default(0),
    daysDayShift: integer("days_day_shift").notNull().default(0),
    daysSwingShift: integer("days_swing_shift").notNull().default(0),
    daysNightShift: integer("days_night_shift").notNull().default(0),
    noccc: integer("noccc").notNull().default(0),
    nct: integer("nct").notNull().default(0),
    ma: integer("ma").notNull().default(0),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (t) => [unique("noc_metrics_unique").on(t.staffId, t.year, t.month)],
);

export const nocMonthlyMetricsRelations = relations(nocMonthlyMetrics, ({ one }) => ({
  staffProfile: one(staffProfiles, {
    fields: [nocMonthlyMetrics.staffId],
    references: [staffProfiles.id],
  }),
}));

// ── employee_of_the_month ─────────────────────────────────────────────────

export const employeeOfTheMonth = pgTable(
  "employee_of_the_month",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    year: integer("year").notNull(),
    month: integer("month").notNull(),
    overallBestStaffId: text("overall_best_staff_id").references(() => staffProfiles.id, {
      onDelete: "set null",
    }),
    secondBestStaffId: text("second_best_staff_id").references(() => staffProfiles.id, {
      onDelete: "set null",
    }),
    mostIncidentTicketsStaffId: text("most_incident_tickets_staff_id").references(
      () => staffProfiles.id,
      { onDelete: "set null" },
    ),
    mostProblemTicketsStaffId: text("most_problem_tickets_staff_id").references(
      () => staffProfiles.id,
      { onDelete: "set null" },
    ),
    mostNocTicketsClosedStaffId: text("most_noc_tickets_closed_staff_id").references(
      () => staffProfiles.id,
      { onDelete: "set null" },
    ),
    leastAlarmNonComplianceStaffId: text("least_alarm_non_compliance_staff_id").references(
      () => staffProfiles.id,
      { onDelete: "set null" },
    ),
    leastTicketNonComplianceStaffId: text("least_ticket_non_compliance_staff_id").references(
      () => staffProfiles.id,
      { onDelete: "set null" },
    ),
    computedAt: timestamp("computed_at").defaultNow().notNull(),
  },
  (t) => [unique("eom_unique").on(t.year, t.month)],
);

export const employeeOfTheMonthRelations = relations(employeeOfTheMonth, ({ one }) => ({
  overallBestStaff: one(staffProfiles, {
    fields: [employeeOfTheMonth.overallBestStaffId],
    references: [staffProfiles.id],
    relationName: "eomOverallBest",
  }),
  secondBestStaff: one(staffProfiles, {
    fields: [employeeOfTheMonth.secondBestStaffId],
    references: [staffProfiles.id],
    relationName: "eomSecondBest",
  }),
  mostIncidentTicketsStaff: one(staffProfiles, {
    fields: [employeeOfTheMonth.mostIncidentTicketsStaffId],
    references: [staffProfiles.id],
    relationName: "eomMostIncident",
  }),
  mostProblemTicketsStaff: one(staffProfiles, {
    fields: [employeeOfTheMonth.mostProblemTicketsStaffId],
    references: [staffProfiles.id],
    relationName: "eomMostProblem",
  }),
  mostNocTicketsClosedStaff: one(staffProfiles, {
    fields: [employeeOfTheMonth.mostNocTicketsClosedStaffId],
    references: [staffProfiles.id],
    relationName: "eomMostNocClosed",
  }),
  leastAlarmNonComplianceStaff: one(staffProfiles, {
    fields: [employeeOfTheMonth.leastAlarmNonComplianceStaffId],
    references: [staffProfiles.id],
    relationName: "eomLeastAlarm",
  }),
  leastTicketNonComplianceStaff: one(staffProfiles, {
    fields: [employeeOfTheMonth.leastTicketNonComplianceStaffId],
    references: [staffProfiles.id],
    relationName: "eomLeastTicket",
  }),
}));
