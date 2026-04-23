import { and, asc, desc, eq, gte, inArray, lte } from "drizzle-orm";
import { z } from "zod";

import {
  attendanceLogs,
  db,
  latenessRecords,
} from "@ndma-dcs-staff-portal/db";

import { requireRole } from "../index";
import { getTeamStaffIds } from "../lib/team";
import { getCallerStaffProfile, getManagedStaffIds } from "../lib/scope";

export const attendanceTimeRouter = {
  logs: {
    list: requireRole("timesheet", "read")
      .input(
        z.object({
          staffProfileId: z.string().optional(),
          team: z.enum(["DCS", "NOC"]).optional(),
          from: z.string().optional(),
          to: z.string().optional(),
          status: z.enum(["Workday", "Restday", "Absent", "Leave", "Holiday"]).optional(),
          limit: z.number().min(1).max(500).default(200),
        }),
      )
      .handler(async ({ input, context }) => {
        const role = context.userRole ?? "";
        const isPrivileged = role === "admin" || role === "hrAdminOps";
        const conditions = [];

        if (input.staffProfileId) {
          conditions.push(eq(attendanceLogs.staffId, input.staffProfileId));
        } else if (input.team) {
          const teamStaffIds = await getTeamStaffIds(input.team);
          if (teamStaffIds.length === 0) return [];
          conditions.push(inArray(attendanceLogs.staffId, teamStaffIds));
        } else if (!isPrivileged) {
          const caller = await getCallerStaffProfile(context);
          const managed = new Set(await getManagedStaffIds(context));
          if (caller?.id) managed.add(caller.id);
          if (managed.size === 0) return [];
          conditions.push(inArray(attendanceLogs.staffId, [...managed]));
        }

        if (input.from) conditions.push(gte(attendanceLogs.date, input.from));
        if (input.to) conditions.push(lte(attendanceLogs.date, input.to));
        if (input.status) conditions.push(eq(attendanceLogs.status, input.status));

        return db.query.attendanceLogs.findMany({
          where: conditions.length > 0 ? and(...conditions) : undefined,
          with: { staffProfile: { with: { user: true, department: true } } },
          orderBy: [desc(attendanceLogs.date), asc(attendanceLogs.staffId)],
          limit: input.limit,
        });
      }),
  },

  lateness: {
    list: requireRole("timesheet", "read")
      .input(
        z.object({
          year: z.number().int().optional(),
          team: z.enum(["DCS", "NOC"]).optional(),
        }),
      )
      .handler(async ({ input, context }) => {
        const conditions = [];
        if (input.year) conditions.push(eq(latenessRecords.year, input.year));
        if (input.team) {
          const teamStaffIds = await getTeamStaffIds(input.team);
          if (teamStaffIds.length === 0) return [];
          conditions.push(inArray(latenessRecords.staffId, teamStaffIds));
        } else {
          const role = context.userRole ?? "";
          if (role !== "admin" && role !== "hrAdminOps") {
            const caller = await getCallerStaffProfile(context);
            const managed = new Set(await getManagedStaffIds(context));
            if (caller?.id) managed.add(caller.id);
            if (managed.size === 0) return [];
            conditions.push(inArray(latenessRecords.staffId, [...managed]));
          }
        }

        return db.query.latenessRecords.findMany({
          where: conditions.length > 0 ? and(...conditions) : undefined,
          with: { staffProfile: { with: { user: true, department: true } } },
          orderBy: [desc(latenessRecords.daysLate), desc(latenessRecords.totalTimeLate)],
        });
      }),
  },
};
