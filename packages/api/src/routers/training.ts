import { z } from "zod";

import { protectedProcedure, requireRole } from "../index";
import {
  listTrainingCourses,
  listTrainingMaterials,
  listTrainingRecords,
  refreshTrainingReminders,
  sendTrainingReminder,
} from "../lib/training";

export const trainingRouter = {
  records: {
    list: requireRole("compliance", "read")
      .input(
        z.object({
          staffProfileId: z.string().optional(),
          departmentId: z.string().optional(),
          team: z.enum(["DCS", "NOC"]).optional(),
          courseId: z.number().int().optional(),
          status: z.enum(["Enrolled", "In Progress", "Completed", "Failed"]).optional(),
          limit: z.number().min(1).max(500).default(200),
        }),
      )
      .handler(async ({ input, context }) => {
        return listTrainingRecords(context, input);
      }),

    sendReminder: requireRole("compliance", "update")
      .input(z.object({ recordId: z.number().int() }))
      .handler(async ({ input, context }) => {
        return sendTrainingReminder(context, input.recordId);
      }),
  },

  courses: {
    list: protectedProcedure.handler(async () => {
      return listTrainingCourses();
    }),
  },

  materials: {
    list: protectedProcedure
      .input(z.object({ courseId: z.number().int().optional() }))
      .handler(async ({ input }) => {
        return listTrainingMaterials({ courseId: input.courseId });
      }),
  },

  reminders: {
    refresh: requireRole("compliance", "update")
      .input(z.object({ withinDays: z.number().int().min(1).max(30).default(14) }))
      .handler(async ({ input, context }) => {
        return refreshTrainingReminders(context, input.withinDays);
      }),
  },
};
