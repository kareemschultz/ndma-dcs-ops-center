import { relations } from "drizzle-orm";
import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  serial,
  text,
  timestamp,
  unique,
  varchar,
} from "drizzle-orm/pg-core";

import { staffProfiles } from "./staff";

// ─── Enums ────────────────────────────────────────────────────────────────────

export const voucherStatusEnum = pgEnum("voucher_status", [
  "unused",
  "assigned",
  "booked",
  "complete_pass",
  "complete_fail",
  "missed",
  "expired",
]);

export const trainingParticipantStatusEnum = pgEnum("training_participant_status", [
  "attended",
  "cancelled",
  "missed",
  "waitlisted",
]);

export const genderEnum = pgEnum("gender_type", [
  "M",
  "F",
  "other",
  "prefer_not_to_say",
]);

export const syllabusNameEnum = pgEnum("syllabus_name", [
  "noc_onboarding",
  "intern_onboarding",
  "dcs_onboarding",
]);

export const assessmentTopicEnum = pgEnum("assessment_topic", [
  "about_ndma",
  "administrative",
  "backhaul",
  "fibre",
  "lte",
  "monitoring_platform",
  "troubleshooting",
  "itop",
]);

// ─── Training Plans ───────────────────────────────────────────────────────────

export const trainingPlans = pgTable(
  "training_plans",
  {
    id: serial("id").primaryKey(),
    staffId: text("staff_id")
      .notNull()
      .references(() => staffProfiles.id, { onDelete: "cascade" }),
    year: integer("year").notNull(),
    // [{trainingArea, targetQuarter, status}]
    plannedTrainings: jsonb("planned_trainings").notNull().default([]),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    unique("training_plans_staff_year_uq").on(table.staffId, table.year),
    index("training_plans_staffId_idx").on(table.staffId),
    index("training_plans_year_idx").on(table.year),
  ],
);

// ─── Certification Catalog ────────────────────────────────────────────────────

export const certificationCatalog = pgTable(
  "certification_catalog",
  {
    id: serial("id").primaryKey(),
    trainingArea: text("training_area").notNull(),
    recommendedCert: text("recommended_cert").notNull(),
    vendor: text("vendor"),
    level: text("level"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("cert_catalog_area_idx").on(table.trainingArea),
    index("cert_catalog_vendor_idx").on(table.vendor),
  ],
);

// ─── Exam Vouchers ────────────────────────────────────────────────────────────

export const examVouchers = pgTable(
  "exam_vouchers",
  {
    id: serial("id").primaryKey(),
    voucherNumber: varchar("voucher_number", { length: 255 }).notNull().unique(),
    productName: text("product_name").notNull(),
    mustBeUsedBy: date("must_be_used_by").notNull(),
    dateBooked: date("date_booked"),
    assignedStaffId: text("assigned_staff_id").references(() => staffProfiles.id, {
      onDelete: "set null",
    }),
    status: voucherStatusEnum("status").notNull().default("unused"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("exam_vouchers_status_idx").on(table.status),
    index("exam_vouchers_mustBeUsedBy_idx").on(table.mustBeUsedBy),
    index("exam_vouchers_assignedStaff_idx").on(table.assignedStaffId),
  ],
);

// Note: exam_schedule table already exists (exam-schedule.ts). Phase 7 extends it
// via migration 0026 (adds window_start, window_end, exam_voucher_id columns).

// ─── Training Events ──────────────────────────────────────────────────────────

export const trainingEvents = pgTable(
  "training_events",
  {
    id: serial("id").primaryKey(),
    institution: text("institution").notNull(),
    description: text("description").notNull(),
    startDate: date("start_date").notNull(),
    endDate: date("end_date").notNull(),
    duration: text("duration"),
    location: text("location"),
    travellingCost: numeric("travelling_cost", { precision: 10, scale: 2 }).default("0"),
    courseCost: numeric("course_cost", { precision: 10, scale: 2 }).default("0"),
    mealsCost: numeric("meals_cost", { precision: 10, scale: 2 }).default("0"),
    accommodationCost: numeric("accommodation_cost", { precision: 10, scale: 2 }).default("0"),
    totalCost: numeric("total_cost", { precision: 10, scale: 2 }).default("0"),
    justification: text("justification"),
    results: text("results"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("training_events_startDate_idx").on(table.startDate),
    index("training_events_institution_idx").on(table.institution),
  ],
);

// ─── Training Event Participants ──────────────────────────────────────────────

export const trainingEventParticipants = pgTable(
  "training_event_participants",
  {
    id: serial("id").primaryKey(),
    trainingEventId: integer("training_event_id")
      .notNull()
      .references(() => trainingEvents.id, { onDelete: "cascade" }),
    staffId: text("staff_id")
      .notNull()
      .references(() => staffProfiles.id, { onDelete: "cascade" }),
    gender: genderEnum("gender"),
    status: trainingParticipantStatusEnum("status").notNull().default("attended"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    unique("training_event_participants_uq").on(table.trainingEventId, table.staffId),
    index("training_event_participants_eventId_idx").on(table.trainingEventId),
    index("training_event_participants_staffId_idx").on(table.staffId),
  ],
);

// ─── In-House Training Log ────────────────────────────────────────────────────

export const inHouseTrainingLog = pgTable(
  "in_house_training_log",
  {
    id: serial("id").primaryKey(),
    staffId: text("staff_id")
      .notNull()
      .references(() => staffProfiles.id, { onDelete: "cascade" }),
    trainingName: text("training_name").notNull(),
    date: date("date").notNull(),
    assessmentCompleted: boolean("assessment_completed").notNull().default(false),
    notes: text("notes"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("in_house_training_log_staffId_idx").on(table.staffId),
    index("in_house_training_log_date_idx").on(table.date),
  ],
);

// ─── Training Syllabi ─────────────────────────────────────────────────────────

export const trainingSyllabi = pgTable(
  "training_syllabi",
  {
    id: serial("id").primaryKey(),
    syllabusName: syllabusNameEnum("syllabus_name").notNull(),
    week: integer("week").notNull(),
    day: text("day").notNull(),
    activity: text("activity").notNull(),
    trainer: text("trainer"),
    resources: text("resources"),
    outcomes: text("outcomes"),
    remarks: text("remarks"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("training_syllabi_name_week_idx").on(table.syllabusName, table.week),
  ],
);

// ─── Assessment Questions ─────────────────────────────────────────────────────

export const assessmentQuestions = pgTable(
  "assessment_questions",
  {
    id: serial("id").primaryKey(),
    topic: assessmentTopicEnum("topic").notNull(),
    question: text("question").notNull(),
    answer: text("answer"),
    sourceFile: text("source_file"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("assessment_questions_topic_idx").on(table.topic),
  ],
);

// ─── Onboarding Task Templates ────────────────────────────────────────────────

export const onboardingTaskTemplates = pgTable(
  "onboarding_task_templates",
  {
    id: serial("id").primaryKey(),
    taskName: text("task_name").notNull(),
    responsibleDept: text("responsible_dept").notNull(),
    seq: integer("seq").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("onboarding_task_templates_seq_idx").on(table.seq),
  ],
);

// ─── Relations ────────────────────────────────────────────────────────────────

export const trainingPlansRelations = relations(trainingPlans, ({ one }) => ({
  staffProfile: one(staffProfiles, {
    fields: [trainingPlans.staffId],
    references: [staffProfiles.id],
  }),
}));

export const examVouchersRelations = relations(examVouchers, ({ one }) => ({
  assignedStaff: one(staffProfiles, {
    fields: [examVouchers.assignedStaffId],
    references: [staffProfiles.id],
  }),
  // Note: exam_schedule back-relation not declared here to avoid circular import with exam-schedule.ts
}));

export const trainingEventsRelations = relations(trainingEvents, ({ many }) => ({
  participants: many(trainingEventParticipants),
}));

export const trainingEventParticipantsRelations = relations(
  trainingEventParticipants,
  ({ one }) => ({
    event: one(trainingEvents, {
      fields: [trainingEventParticipants.trainingEventId],
      references: [trainingEvents.id],
    }),
    staffProfile: one(staffProfiles, {
      fields: [trainingEventParticipants.staffId],
      references: [staffProfiles.id],
    }),
  }),
);

export const inHouseTrainingLogRelations = relations(inHouseTrainingLog, ({ one }) => ({
  staffProfile: one(staffProfiles, {
    fields: [inHouseTrainingLog.staffId],
    references: [staffProfiles.id],
  }),
}));
