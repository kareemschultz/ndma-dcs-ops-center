/**
 * Routine Maintenance — quarterly recurring duties (server room cleaning,
 * routine maintenance, etc.) that sit alongside but separate from on-call rota.
 * Tables renamed from overlay_* to routine_maintenance_* in migration 0013.
 */
import { relations } from "drizzle-orm";
import {
  date,
  index,
  pgEnum,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

import { user } from "./auth";
import { staffProfiles } from "./staff";

// ── Enums ──────────────────────────────────────────────────────────────────
export const overlayTaskStatusEnum = pgEnum("overlay_task_status", [
  "pending",
  "in_progress",
  "completed",
  "overdue",
]);

// ── routine_maintenance_types ──────────────────────────────────────────────
export const overlayTypes = pgTable("routine_maintenance_types", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text("name").notNull().unique(),
  description: text("description"),
  category: text("category"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
});

// ── routine_maintenance_schedules ──────────────────────────────────────────
export const overlaySchedules = pgTable(
  "routine_maintenance_schedules",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    overlayTypeId: text("overlay_type_id")
      .notNull()
      .references(() => overlayTypes.id),
    quarter: text("quarter").notNull(),
    year: text("year").notNull(),
    startDate: date("start_date").notNull(),
    endDate: date("end_date").notNull(),
    notes: text("notes"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("overlay_schedules_typeId_idx").on(table.overlayTypeId),
    index("overlay_schedules_quarter_year_idx").on(table.quarter, table.year),
  ],
);

// ── routine_maintenance_assignments ────────────────────────────────────────
export const overlayAssignments = pgTable(
  "routine_maintenance_assignments",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    overlayScheduleId: text("overlay_schedule_id")
      .notNull()
      .references(() => overlaySchedules.id, { onDelete: "cascade" }),
    staffProfileId: text("staff_profile_id").references(() => staffProfiles.id),
    externalLabel: text("external_label"),
    roleDescription: text("role_description"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("overlay_assignments_scheduleId_idx").on(table.overlayScheduleId),
    index("overlay_assignments_staffId_idx").on(table.staffProfileId),
  ],
);

// ── routine_maintenance_tasks ──────────────────────────────────────────────
export const overlayTasks = pgTable(
  "routine_maintenance_tasks",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    overlayScheduleId: text("overlay_schedule_id")
      .notNull()
      .references(() => overlaySchedules.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    dueDate: date("due_date"),
    assignedToId: text("assigned_to_id").references(() => staffProfiles.id),
    assignedToExternal: text("assigned_to_external"),
    status: overlayTaskStatusEnum("status").default("pending").notNull(),
    completedAt: timestamp("completed_at"),
    completedById: text("completed_by_id").references(() => user.id),
    notes: text("notes"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("overlay_tasks_scheduleId_idx").on(table.overlayScheduleId),
    index("overlay_tasks_status_idx").on(table.status),
    index("overlay_tasks_dueDate_idx").on(table.dueDate),
  ],
);

// ── Relations ──────────────────────────────────────────────────────────────
export const overlayTypeRelations = relations(overlayTypes, ({ many }) => ({
  schedules: many(overlaySchedules),
}));

export const overlayScheduleRelations = relations(
  overlaySchedules,
  ({ one, many }) => ({
    overlayType: one(overlayTypes, {
      fields: [overlaySchedules.overlayTypeId],
      references: [overlayTypes.id],
    }),
    assignments: many(overlayAssignments),
    tasks: many(overlayTasks),
  }),
);

export const overlayAssignmentRelations = relations(
  overlayAssignments,
  ({ one }) => ({
    overlaySchedule: one(overlaySchedules, {
      fields: [overlayAssignments.overlayScheduleId],
      references: [overlaySchedules.id],
    }),
    staffProfile: one(staffProfiles, {
      fields: [overlayAssignments.staffProfileId],
      references: [staffProfiles.id],
    }),
  }),
);

export const overlayTaskRelations = relations(overlayTasks, ({ one }) => ({
  overlaySchedule: one(overlaySchedules, {
    fields: [overlayTasks.overlayScheduleId],
    references: [overlaySchedules.id],
  }),
  assignedTo: one(staffProfiles, {
    fields: [overlayTasks.assignedToId],
    references: [staffProfiles.id],
  }),
  completedBy: one(user, {
    fields: [overlayTasks.completedById],
    references: [user.id],
  }),
}));
