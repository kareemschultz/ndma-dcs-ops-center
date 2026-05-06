import {
  date,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
} from "drizzle-orm/pg-core";
import { departments } from "./departments";
import { relations } from "drizzle-orm";

import { user } from "./auth";
import { staffProfiles } from "./staff";

export const workItemTypeEnum = pgEnum("work_item_type", [
  "routine",
  "project",
  "external_request",
  "ad_hoc",
]);

export const workItemStatusEnum = pgEnum("work_item_status", [
  "backlog",
  "todo",
  "in_progress",
  "blocked",
  "review",
  "done",
  "cancelled",
]);

export const workItemPriorityEnum = pgEnum("work_item_priority", [
  "low",
  "medium",
  "high",
  "critical",
]);

// ── Initiatives (major departmental goals that group work items) ──────────

export const workInitiatives = pgTable(
  "work_initiatives",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    title: text("title").notNull(),
    description: text("description"),
    status: text("status").notNull().default("active"), // active, completed, cancelled
    departmentId: text("department_id").references(() => departments.id, {
      onDelete: "set null",
    }),
    targetDate: date("target_date"),
    createdById: text("created_by_id").references(() => user.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("work_initiatives_status_idx").on(table.status),
    index("work_initiatives_departmentId_idx").on(table.departmentId),
  ],
);

export const workItems = pgTable(
  "work_items",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    title: text("title").notNull(),
    description: text("description"),
    type: workItemTypeEnum("type").notNull().default("routine"),
    status: workItemStatusEnum("status").notNull().default("todo"),
    priority: workItemPriorityEnum("priority").notNull().default("medium"),
    // Assignee + department
    assignedToId: text("assigned_to_id").references(() => staffProfiles.id, {
      onDelete: "set null",
    }),
    departmentId: text("department_id").references(() => departments.id, {
      onDelete: "set null",
    }),
    // For external_request type — who raised this
    requesterName: text("requester_name"),
    requesterEmail: text("requester_email"),
    // External tracking (e.g. ServiceNow, email thread reference)
    sourceSystem: text("source_system"),
    sourceReference: text("source_reference"),
    // Scheduling
    dueDate: date("due_date"),
    completedAt: timestamp("completed_at"),
    // Time tracking (sourced from work tracker spreadsheet "Estimated Time (Hour)")
    estimatedHours: text("estimated_hours"),
    // Follow-up date for external department work (OtherDept sheet)
    followUpDate: date("follow_up_date"),
    // Hierarchy — optional grouping under an initiative or parent task
    initiativeId: text("initiative_id"),
    parentId: text("parent_id"), // self-reference — bare text, constraint added by db:push
    // Milestone marker date
    milestoneDate: date("milestone_date"),
    // Time-period classification (Phase 11)
    year: integer("year"),
    period: text("period"), // e.g. "2026-Q2", "2026-W18"
    weekStartDate: text("week_start_date"), // ISO date e.g. "2026-04-28" (Monday of the work week)
    // Audit
    createdById: text("created_by_id").references(() => user.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("work_items_status_idx").on(table.status),
    index("work_items_assignedToId_idx").on(table.assignedToId),
    index("work_items_departmentId_idx").on(table.departmentId),
    index("work_items_dueDate_idx").on(table.dueDate),
    index("work_items_type_idx").on(table.type),
    index("work_items_year_idx").on(table.year),
    index("work_items_period_idx").on(table.period),
  ],
);

export const workItemComments = pgTable("work_item_comments", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  workItemId: text("work_item_id")
    .notNull()
    .references(() => workItems.id, { onDelete: "cascade" }),
  authorId: text("author_id").references(() => user.id, {
    onDelete: "set null",
  }),
  body: text("body").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
});

export const workItemWeeklyUpdates = pgTable(
  "work_item_weekly_updates",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    workItemId: text("work_item_id")
      .notNull()
      .references(() => workItems.id, { onDelete: "cascade" }),
    authorId: text("author_id").references(() => user.id, {
      onDelete: "set null",
    }),
    // ISO date of the Monday that starts this reporting week (YYYY-MM-DD)
    weekStart: date("week_start").notNull(),
    statusSummary: text("status_summary").notNull(),
    blockers: text("blockers"),
    nextSteps: text("next_steps"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    unique("work_item_weekly_updates_unique").on(
      table.workItemId,
      table.weekStart,
    ),
  ],
);

// ── Recurring task templates ───────────────────────────────────────────────

export const workItemTemplates = pgTable("work_item_templates", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  title: text("title").notNull(),
  description: text("description"),
  type: workItemTypeEnum("type").notNull().default("routine"),
  priority: workItemPriorityEnum("priority").notNull().default("medium"),
  departmentId: text("department_id").references(() => departments.id, {
    onDelete: "set null",
  }),
  estimatedHours: integer("estimated_hours"),
  // "weekly", "monthly", "annually", or a cron-like description
  recurrencePattern: text("recurrence_pattern").notNull(),
  createdById: text("created_by_id").references(() => user.id, {
    onDelete: "set null",
  }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
});

// ── Dependencies table ────────────────────────────────────────────────────

export const workItemDependencies = pgTable(
  "work_item_dependencies",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    workItemId: text("work_item_id")
      .notNull()
      .references(() => workItems.id, { onDelete: "cascade" }),
    dependsOnId: text("depends_on_id")
      .notNull()
      .references(() => workItems.id, { onDelete: "cascade" }),
    // "blocks" = workItemId is blocked by dependsOnId; "relates_to" = soft link
    dependencyType: text("dependency_type").notNull().default("blocks"),
  },
  (table) => [
    unique("work_item_deps_unique").on(table.workItemId, table.dependsOnId),
    index("work_item_deps_workItemId_idx").on(table.workItemId),
    index("work_item_deps_dependsOnId_idx").on(table.dependsOnId),
  ],
);

// ── Multi-assignee tables ─────────────────────────────────────────────────────

/**
 * Named contributors on a work item (excluding the primary owner stored on
 * work_items.assigned_to_id). Supports cross-team collaboration tracking.
 */
export const workItemAssignees = pgTable(
  "work_item_assignees",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    workItemId: text("work_item_id")
      .notNull()
      .references(() => workItems.id, { onDelete: "cascade" }),
    staffProfileId: text("staff_profile_id")
      .notNull()
      .references(() => staffProfiles.id, { onDelete: "cascade" }),
    addedAt: timestamp("added_at").defaultNow().notNull(),
    addedById: text("added_by_id").references(() => user.id, {
      onDelete: "set null",
    }),
  },
  (t) => [
    unique("work_item_assignees_unique").on(t.workItemId, t.staffProfileId),
    index("work_item_assignees_work_item_idx").on(t.workItemId),
    index("work_item_assignees_staff_idx").on(t.staffProfileId),
  ],
);

/**
 * Optional sub-department headcount allocations for a work item.
 * e.g. "ASN ×2, Enterprise ×1" means 2 people from ASN and 1 from ENT are needed.
 */
export const workItemTeamAllocations = pgTable(
  "work_item_team_allocations",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    workItemId: text("work_item_id")
      .notNull()
      .references(() => workItems.id, { onDelete: "cascade" }),
    departmentId: text("department_id")
      .notNull()
      .references(() => departments.id, { onDelete: "cascade" }),
    requiredCount: integer("required_count").notNull().default(1),
    addedAt: timestamp("added_at").defaultNow().notNull(),
    addedById: text("added_by_id").references(() => user.id, {
      onDelete: "set null",
    }),
  },
  (t) => [
    unique("work_item_team_alloc_unique").on(t.workItemId, t.departmentId),
    index("work_item_team_alloc_work_item_idx").on(t.workItemId),
  ],
);

// ── Relations ─────────────────────────────────────────────────────────────────

export const workInitiativesRelations = relations(
  workInitiatives,
  ({ one, many }) => ({
    department: one(departments, {
      fields: [workInitiatives.departmentId],
      references: [departments.id],
    }),
    createdBy: one(user, {
      fields: [workInitiatives.createdById],
      references: [user.id],
    }),
    workItems: many(workItems),
  }),
);

export const workItemsRelations = relations(workItems, ({ one, many }) => ({
  assignedTo: one(staffProfiles, {
    fields: [workItems.assignedToId],
    references: [staffProfiles.id],
  }),
  department: one(departments, {
    fields: [workItems.departmentId],
    references: [departments.id],
  }),
  createdBy: one(user, {
    fields: [workItems.createdById],
    references: [user.id],
  }),
  initiative: one(workInitiatives, {
    fields: [workItems.initiativeId],
    references: [workInitiatives.id],
  }),
  comments: many(workItemComments),
  weeklyUpdates: many(workItemWeeklyUpdates),
  blockedBy: many(workItemDependencies, { relationName: "dependsOn" }),
  blocking: many(workItemDependencies, { relationName: "workItem" }),
  // Multi-assignee
  assignees: many(workItemAssignees),
  teamAllocations: many(workItemTeamAllocations),
}));

export const workItemCommentsRelations = relations(
  workItemComments,
  ({ one }) => ({
    workItem: one(workItems, {
      fields: [workItemComments.workItemId],
      references: [workItems.id],
    }),
    author: one(user, {
      fields: [workItemComments.authorId],
      references: [user.id],
    }),
  }),
);

export const workItemWeeklyUpdatesRelations = relations(
  workItemWeeklyUpdates,
  ({ one }) => ({
    workItem: one(workItems, {
      fields: [workItemWeeklyUpdates.workItemId],
      references: [workItems.id],
    }),
    author: one(user, {
      fields: [workItemWeeklyUpdates.authorId],
      references: [user.id],
    }),
  }),
);

export const workItemDependenciesRelations = relations(
  workItemDependencies,
  ({ one }) => ({
    workItem: one(workItems, {
      fields: [workItemDependencies.workItemId],
      references: [workItems.id],
      relationName: "workItem",
    }),
    dependsOn: one(workItems, {
      fields: [workItemDependencies.dependsOnId],
      references: [workItems.id],
      relationName: "dependsOn",
    }),
  }),
);

export const workItemTemplatesRelations = relations(
  workItemTemplates,
  ({ one }) => ({
    department: one(departments, {
      fields: [workItemTemplates.departmentId],
      references: [departments.id],
    }),
    createdBy: one(user, {
      fields: [workItemTemplates.createdById],
      references: [user.id],
    }),
  }),
);

export const workItemAssigneesRelations = relations(
  workItemAssignees,
  ({ one }) => ({
    workItem: one(workItems, {
      fields: [workItemAssignees.workItemId],
      references: [workItems.id],
    }),
    staffProfile: one(staffProfiles, {
      fields: [workItemAssignees.staffProfileId],
      references: [staffProfiles.id],
    }),
    addedBy: one(user, {
      fields: [workItemAssignees.addedById],
      references: [user.id],
    }),
  }),
);

export const workItemTeamAllocationsRelations = relations(
  workItemTeamAllocations,
  ({ one }) => ({
    workItem: one(workItems, {
      fields: [workItemTeamAllocations.workItemId],
      references: [workItems.id],
    }),
    department: one(departments, {
      fields: [workItemTeamAllocations.departmentId],
      references: [departments.id],
    }),
  }),
);
