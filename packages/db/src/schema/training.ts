import { relations } from "drizzle-orm";
import {
  date,
  index,
  integer,
  pgEnum,
  pgTable,
  serial,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/pg-core";

import { staffProfiles } from "./staff";

export const trainingCourseTypeEnum = pgEnum("training_course_type", [
  "Certification",
  "Syllabus",
  "Internship",
]);

export const staffTrainingStatusEnum = pgEnum("staff_training_status", [
  "Enrolled",
  "In Progress",
  "Completed",
  "Failed",
]);

export const trainingMaterialTypeEnum = pgEnum("training_material_type", [
  "Book",
  "Checklist",
  "Survey",
]);

export const trainingCourses = pgTable(
  "training_courses",
  {
    id: serial("id").primaryKey(),
    title: varchar("title", { length: 255 }).notNull(),
    vendor: varchar("vendor", { length: 255 }).notNull(),
    courseType: trainingCourseTypeEnum("course_type").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("training_courses_title_idx").on(table.title),
    index("training_courses_vendor_idx").on(table.vendor),
    index("training_courses_courseType_idx").on(table.courseType),
  ],
);

export const staffTrainingRecords = pgTable(
  "staff_training_records",
  {
    id: serial("id").primaryKey(),
    staffId: text("staff_id")
      .notNull()
      .references(() => staffProfiles.id, { onDelete: "cascade" }),
    courseId: integer("course_id")
      .notNull()
      .references(() => trainingCourses.id, { onDelete: "cascade" }),
    status: staffTrainingStatusEnum("status").notNull(),
    startDate: date("start_date"),
    completionDate: date("completion_date"),
    targetDate: date("target_date"),
    notes: text("notes"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("staff_training_records_staffId_idx").on(table.staffId),
    index("staff_training_records_courseId_idx").on(table.courseId),
    index("staff_training_records_status_idx").on(table.status),
    index("staff_training_records_targetDate_idx").on(table.targetDate),
  ],
);

export const trainingMaterials = pgTable(
  "training_materials",
  {
    id: serial("id").primaryKey(),
    courseId: integer("course_id")
      .notNull()
      .references(() => trainingCourses.id, { onDelete: "cascade" }),
    materialType: trainingMaterialTypeEnum("material_type").notNull(),
    title: varchar("title", { length: 255 }).notNull(),
    referenceLink: text("reference_link"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("training_materials_courseId_idx").on(table.courseId),
    index("training_materials_materialType_idx").on(table.materialType),
  ],
);

export const trainingCoursesRelations = relations(trainingCourses, ({ many }) => ({
  records: many(staffTrainingRecords),
  materials: many(trainingMaterials),
}));

export const staffTrainingRecordsRelations = relations(staffTrainingRecords, ({ one }) => ({
  staffProfile: one(staffProfiles, {
    fields: [staffTrainingRecords.staffId],
    references: [staffProfiles.id],
  }),
  course: one(trainingCourses, {
    fields: [staffTrainingRecords.courseId],
    references: [trainingCourses.id],
  }),
}));

export const trainingMaterialsRelations = relations(trainingMaterials, ({ one }) => ({
  course: one(trainingCourses, {
    fields: [trainingMaterials.courseId],
    references: [trainingCourses.id],
  }),
}));
