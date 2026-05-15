import {
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  serial,
  text,
  timestamp,
  unique,
  varchar,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

import { appraisalCycles } from "./appraisal-cycles";
import { departments } from "./departments";
import { user } from "./auth";
import { staffProfiles } from "./staff";

export const appraisalStatusEnum = pgEnum("appraisal_status", [
  "draft",
  "in_progress",
  "submitted",
  "approved",
  "rejected",
  "completed",
  "overdue",
]);

export const evaluationTypeEnum = pgEnum("appraisal_evaluation_type", [
  "Standard",
  "Employee of the Month",
]);

export const appraisals = pgTable(
  "appraisals",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    cycleId: text("cycle_id").references(() => appraisalCycles.id, {
      onDelete: "set null",
    }),
    staffProfileId: text("staff_profile_id")
      .notNull()
      .references(() => staffProfiles.id, { onDelete: "cascade" }),
    // The reviewer / line manager conducting the appraisal
    reviewerId: text("reviewer_id").references(() => staffProfiles.id, {
      onDelete: "set null",
    }),
    year: integer("year"),
    period: varchar("period", { length: 255 }),
    totalScore: integer("total_score"),
    evaluationType: evaluationTypeEnum("evaluation_type").default("Standard").notNull(),
    teamLeadId: text("team_lead_id").references(() => staffProfiles.id, {
      onDelete: "set null",
    }),
    periodStart: date("period_start").notNull(),
    periodEnd: date("period_end").notNull(),
    scheduledDate: date("scheduled_date"),
    completedDate: date("completed_date"),
    status: appraisalStatusEnum("status").notNull().default("draft"),
    submittedAt: timestamp("submitted_at"),
    submittedById: text("submitted_by_id").references(() => user.id, {
      onDelete: "set null",
    }),
    approvedAt: timestamp("approved_at"),
    approvedById: text("approved_by_id").references(() => user.id, {
      onDelete: "set null",
    }),
    rejectedAt: timestamp("rejected_at"),
    rejectedById: text("rejected_by_id").references(() => user.id, {
      onDelete: "set null",
    }),
    rejectionReason: text("rejection_reason"),
    percentageScore: integer("percentage_score"),
    location: text("location"),
    typeOfReview: text("type_of_review"),
    achievements: jsonb("achievements").$type<string[]>(),
    goals: jsonb("goals").$type<string[]>(),
    staffFeedback: text("staff_feedback"),
    supervisorComments: text("supervisor_comments"),
    managerComments: text("manager_comments"),
    immutableFrom: timestamp("immutable_from"),
    // Score fields (phase 4)
    maxScore: integer("max_score").default(65),
    incrementPct: integer("increment_pct"),
    // 1–5 rating
    overallRating: integer("overall_rating"),
    summary: text("summary"),
    ratingMatrix: jsonb("rating_matrix").$type<Record<string, number>>(),
    objectives: jsonb("objectives").$type<
      { title: string; rating?: number; comments?: string }[]
    >(),
    // Official NDMA Performance Evaluation Form fields (migration 0037)
    categoryComments: jsonb("category_comments").$type<Record<string, string>>(),
    responsibilitiesComment: text("responsibilities_comment"),
    areasOfStrength: text("areas_of_strength"),
    improvementsMade: text("improvements_made"),
    areasForDevelopment: text("areas_for_development"),
    developmentActions: text("development_actions"),
    goalIndicators: jsonb("goal_indicators").$type<string[]>(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("appraisals_cycleId_idx").on(table.cycleId),
    index("appraisals_staffProfileId_idx").on(table.staffProfileId),
    index("appraisals_year_idx").on(table.year),
    index("appraisals_period_idx").on(table.period),
    index("appraisals_totalScore_idx").on(table.totalScore),
    index("appraisals_status_idx").on(table.status),
    index("appraisals_scheduledDate_idx").on(table.scheduledDate),
  ],
);

export const appraisalScores = pgTable(
  "appraisal_scores",
  {
    id: serial("id").primaryKey(),
    appraisalId: text("appraisal_id")
      .notNull()
      .references(() => appraisals.id, { onDelete: "cascade" }),
    category: varchar("category", { length: 255 }).notNull(),
    criteria: varchar("criteria", { length: 255 }).notNull(),
    score: integer("score").notNull(),
    comment: text("comment"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("appraisal_scores_appraisalId_idx").on(table.appraisalId),
    index("appraisal_scores_category_idx").on(table.category),
  ],
);

export const appraisalNotes = pgTable(
  "appraisal_notes",
  {
    id: serial("id").primaryKey(),
    appraisalId: text("appraisal_id")
      .notNull()
      .references(() => appraisals.id, { onDelete: "cascade" }),
    noteType: varchar("note_type", { length: 255 }).notNull(),
    content: text("content").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("appraisal_notes_appraisalId_idx").on(table.appraisalId),
    index("appraisal_notes_noteType_idx").on(table.noteType),
  ],
);

export const appraisalTracker = pgTable(
  "appraisal_tracker",
  {
    id: serial("id").primaryKey(),
    departmentId: text("department_id").references(() => departments.id, {
      onDelete: "cascade",
    }),
    year: integer("year").notNull(),
    period: varchar("period", { length: 255 }).notNull(),
    draftCount: integer("draft_count").notNull().default(0),
    scheduledCount: integer("scheduled_count").notNull().default(0),
    inProgressCount: integer("in_progress_count").notNull().default(0),
    submittedCount: integer("submitted_count").notNull().default(0),
    approvedCount: integer("approved_count").notNull().default(0),
    rejectedCount: integer("rejected_count").notNull().default(0),
    completedCount: integer("completed_count").notNull().default(0),
    overdueCount: integer("overdue_count").notNull().default(0),
    totalCount: integer("total_count").notNull().default(0),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    unique("appraisal_tracker_department_year_period_unique").on(
      table.departmentId,
      table.year,
      table.period,
    ),
    index("appraisal_tracker_departmentId_idx").on(table.departmentId),
    index("appraisal_tracker_year_idx").on(table.year),
    index("appraisal_tracker_period_idx").on(table.period),
  ],
);

export const appraisalsRelations = relations(appraisals, ({ one, many }) => ({
  cycle: one(appraisalCycles, {
    fields: [appraisals.cycleId],
    references: [appraisalCycles.id],
  }),
  staffProfile: one(staffProfiles, {
    fields: [appraisals.staffProfileId],
    references: [staffProfiles.id],
    relationName: "staffAppraisals",
  }),
  reviewer: one(staffProfiles, {
    fields: [appraisals.reviewerId],
    references: [staffProfiles.id],
    relationName: "reviewerAppraisals",
  }),
  teamLead: one(staffProfiles, {
    fields: [appraisals.teamLeadId],
    references: [staffProfiles.id],
    relationName: "teamLeadAppraisals",
  }),
  submittedBy: one(user, {
    fields: [appraisals.submittedById],
    references: [user.id],
    relationName: "appraisalSubmittedBy",
  }),
  approvedBy: one(user, {
    fields: [appraisals.approvedById],
    references: [user.id],
    relationName: "appraisalApprovedBy",
  }),
  rejectedBy: one(user, {
    fields: [appraisals.rejectedById],
    references: [user.id],
    relationName: "appraisalRejectedBy",
  }),
  scores: many(appraisalScores),
  notes: many(appraisalNotes),
}));

export const appraisalScoresRelations = relations(appraisalScores, ({ one }) => ({
  appraisal: one(appraisals, {
    fields: [appraisalScores.appraisalId],
    references: [appraisals.id],
  }),
}));

export const appraisalNotesRelations = relations(appraisalNotes, ({ one }) => ({
  appraisal: one(appraisals, {
    fields: [appraisalNotes.appraisalId],
    references: [appraisals.id],
  }),
}));

export const appraisalTrackerRelations = relations(appraisalTracker, ({ one }) => ({
  department: one(departments, {
    fields: [appraisalTracker.departmentId],
    references: [departments.id],
  }),
}));
