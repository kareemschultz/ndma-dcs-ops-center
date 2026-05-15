import { ORPCError } from "@orpc/server";
import { and, asc, desc, eq, gte, inArray, lte } from "drizzle-orm";
import { z } from "zod";

import {
  attendanceLogs,
  calendarEvents,
  db,
  latenessRecords,
} from "@ndma-dcs-staff-portal/db";

import { requireRole } from "../index";
import { logAudit } from "../lib/audit";
import { getTeamStaffIds } from "../lib/team";
import { getCallerStaffProfile, getManagedStaffIds } from "../lib/scope";

const attendanceStatusSchema = z.enum(["Workday", "Restday", "Absent", "Leave", "Holiday"]);

/** Calculate work hours from HH:MM clock-in and clock-out strings. Returns null if invalid. */
function calcWorkHours(clockIn: string | null | undefined, clockOut: string | null | undefined): string | null {
  if (!clockIn || !clockOut) return null;
  const [ih, im] = clockIn.split(":").map(Number);
  const [oh, om] = clockOut.split(":").map(Number);
  if (ih == null || im == null || oh == null || om == null) return null;
  const inMins = ih * 60 + im;
  const outMins = oh * 60 + om;
  const diffMins = outMins - inMins;
  if (diffMins <= 0) return null;
  return (diffMins / 60).toFixed(2);
}

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

    create: requireRole("timesheet", "create")
      .input(
        z.object({
          staffProfileId: z.string(),
          date: z.string(),
          status: attendanceStatusSchema,
          clockIn: z.string().optional(),
          clockOut: z.string().optional(),
          workHours: z.string().optional(),
        }),
      )
      .handler(async ({ input, context }) => {
        const workHours =
          input.workHours ?? calcWorkHours(input.clockIn, input.clockOut) ?? undefined;

        const [row] = await db
          .insert(attendanceLogs)
          .values({
            staffId: input.staffProfileId,
            date: input.date,
            status: input.status,
            clockIn: input.clockIn ?? null,
            clockOut: input.clockOut ?? null,
            workHours: workHours ?? null,
          })
          .returning();
        if (!row) throw new ORPCError("INTERNAL_SERVER_ERROR");

        await logAudit({
          actorId: context.session.user.id,
          actorName: context.session.user.name,
          actorRole: context.userRole ?? undefined,
          action: "attendance_log.create",
          module: "operations",
          resourceType: "attendance_log",
          resourceId: String(row.id),
          afterValue: row as Record<string, unknown>,
          ipAddress: context.ipAddress,
          userAgent: context.userAgent,
          correlationId: context.requestId,
        });

        return row;
      }),

    bulkCreate: requireRole("timesheet", "create")
      .input(
        z.object({
          rows: z
            .array(
              z.object({
                staffProfileId: z.string(),
                date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
                status: attendanceStatusSchema,
                clockIn: z.string().optional(),
                clockOut: z.string().optional(),
                workHours: z.string().optional(),
              }),
            )
            .min(1)
            .max(2000),
        }),
      )
      .handler(async ({ input, context }) => {
        // Skip rows that already have a log for the same (staff, date) so the
        // import can be safely re-run without creating duplicates.
        const staffIds = [...new Set(input.rows.map((r) => r.staffProfileId))];
        const dates = [...new Set(input.rows.map((r) => r.date))];
        const existing = await db.query.attendanceLogs.findMany({
          where: and(
            inArray(attendanceLogs.staffId, staffIds),
            inArray(attendanceLogs.date, dates),
          ),
          columns: { staffId: true, date: true },
        });
        const existingKeys = new Set(existing.map((e) => `${e.staffId}|${e.date}`));

        const toInsert = input.rows
          .filter((r) => !existingKeys.has(`${r.staffProfileId}|${r.date}`))
          .map((r) => ({
            staffId: r.staffProfileId,
            date: r.date,
            status: r.status,
            clockIn: r.clockIn ?? null,
            clockOut: r.clockOut ?? null,
            workHours: (r.workHours ?? calcWorkHours(r.clockIn, r.clockOut)) ?? null,
          }));

        if (toInsert.length === 0) {
          return { inserted: 0, skipped: input.rows.length };
        }

        const created = await db.insert(attendanceLogs).values(toInsert).returning();

        await logAudit({
          actorId: context.session.user.id,
          actorName: context.session.user.name,
          actorRole: context.userRole ?? undefined,
          action: "attendance_log.bulk_create",
          module: "operations",
          resourceType: "attendance_log",
          resourceId: "bulk",
          afterValue: { inserted: created.length, dates } as Record<string, unknown>,
          ipAddress: context.ipAddress,
          userAgent: context.userAgent,
          correlationId: context.requestId,
        });

        return { inserted: created.length, skipped: input.rows.length - toInsert.length };
      }),

    update: requireRole("timesheet", "update")
      .input(
        z.object({
          id: z.number().int(),
          status: attendanceStatusSchema.optional(),
          clockIn: z.string().nullable().optional(),
          clockOut: z.string().nullable().optional(),
          workHours: z.string().nullable().optional(),
        }),
      )
      .handler(async ({ input, context }) => {
        const before = await db.query.attendanceLogs.findFirst({
          where: eq(attendanceLogs.id, input.id),
        });
        if (!before) throw new ORPCError("NOT_FOUND");

        const newClockIn = "clockIn" in input ? input.clockIn : before.clockIn;
        const newClockOut = "clockOut" in input ? input.clockOut : before.clockOut;
        const autoWorkHours = calcWorkHours(newClockIn, newClockOut);

        const [row] = await db
          .update(attendanceLogs)
          .set({
            status: input.status ?? before.status,
            clockIn: newClockIn ?? null,
            clockOut: newClockOut ?? null,
            workHours:
              "workHours" in input && input.workHours !== undefined
                ? input.workHours
                : (autoWorkHours ?? before.workHours),
          })
          .where(eq(attendanceLogs.id, input.id))
          .returning();

        await logAudit({
          actorId: context.session.user.id,
          actorName: context.session.user.name,
          actorRole: context.userRole ?? undefined,
          action: "attendance_log.update",
          module: "operations",
          resourceType: "attendance_log",
          resourceId: String(input.id),
          beforeValue: before as Record<string, unknown>,
          afterValue: row as Record<string, unknown>,
          ipAddress: context.ipAddress,
          userAgent: context.userAgent,
          correlationId: context.requestId,
        });

        return row;
      }),

    delete: requireRole("timesheet", "update")
      .input(z.object({ id: z.number().int() }))
      .handler(async ({ input, context }) => {
        const before = await db.query.attendanceLogs.findFirst({
          where: eq(attendanceLogs.id, input.id),
        });
        if (!before) throw new ORPCError("NOT_FOUND");

        await db.delete(attendanceLogs).where(eq(attendanceLogs.id, input.id));

        await logAudit({
          actorId: context.session.user.id,
          actorName: context.session.user.name,
          actorRole: context.userRole ?? undefined,
          action: "attendance_log.delete",
          module: "operations",
          resourceType: "attendance_log",
          resourceId: String(input.id),
          beforeValue: before as Record<string, unknown>,
          ipAddress: context.ipAddress,
          userAgent: context.userAgent,
          correlationId: context.requestId,
        });

        return { success: true };
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

  // ── Public holidays (managed via calendar_events with event_type='public_holiday') ──
  holidays: {
    list: requireRole("timesheet", "read")
      .input(
        z.object({
          year: z.number().int().min(2000).max(2100).optional(),
        }),
      )
      .handler(async ({ input }) => {
        const conditions = [eq(calendarEvents.eventType, "public_holiday")];
        if (input.year) {
          conditions.push(gte(calendarEvents.eventDate, `${input.year}-01-01`));
          conditions.push(lte(calendarEvents.eventDate, `${input.year}-12-31`));
        }
        return db.query.calendarEvents.findMany({
          where: and(...conditions),
          orderBy: [asc(calendarEvents.eventDate)],
        });
      }),

    create: requireRole("timesheet", "create")
      .input(
        z.object({
          date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD"),
          name: z.string().min(1).max(255),
          notes: z.string().optional(),
        }),
      )
      .handler(async ({ input, context }) => {
        const existing = await db.query.calendarEvents.findFirst({
          where: and(
            eq(calendarEvents.eventType, "public_holiday"),
            eq(calendarEvents.eventDate, input.date),
          ),
        });
        if (existing) {
          throw new ORPCError("CONFLICT", {
            message: `A public holiday is already configured for ${input.date}`,
          });
        }
        const rows = await db
          .insert(calendarEvents)
          .values({
            title: input.name,
            eventType: "public_holiday",
            eventDate: input.date,
            notes: input.notes,
          })
          .returning();
        const created = rows[0];
        if (!created) {
          throw new ORPCError("INTERNAL_SERVER_ERROR", {
            message: "Failed to create public holiday",
          });
        }
        await logAudit({
          actorId: context.session?.user.id ?? "",
          actorName: context.session?.user.name ?? "",
          actorRole: context.userRole ?? undefined,
          correlationId: context.requestId,
          action: "calendar_event.public_holiday.create",
          module: "attendance",
          resourceType: "calendar_event",
          resourceId: String(created.id),
          afterValue: created as Record<string, unknown>,
          ipAddress: context.ipAddress,
          userAgent: context.userAgent,
        });
        return created;
      }),

    bulkAdd: requireRole("timesheet", "create")
      .input(
        z.object({
          entries: z
            .array(
              z.object({
                date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
                name: z.string().min(1).max(255),
              }),
            )
            .min(1),
        }),
      )
      .handler(async ({ input, context }) => {
        const dates = input.entries.map((e) => e.date);
        const existing = await db.query.calendarEvents.findMany({
          where: and(
            eq(calendarEvents.eventType, "public_holiday"),
            inArray(calendarEvents.eventDate, dates),
          ),
        });
        const existingDates = new Set(existing.map((e) => e.eventDate));
        const toInsert = input.entries
          .filter((e) => !existingDates.has(e.date))
          .map((e) => ({
            title: e.name,
            eventType: "public_holiday" as const,
            eventDate: e.date,
          }));
        if (toInsert.length === 0) {
          return { inserted: 0, skipped: input.entries.length };
        }
        await db.insert(calendarEvents).values(toInsert);
        await logAudit({
          actorId: context.session?.user.id ?? "",
          actorName: context.session?.user.name ?? "",
          actorRole: context.userRole ?? undefined,
          correlationId: context.requestId,
          action: "calendar_event.public_holiday.bulk_create",
          module: "attendance",
          resourceType: "calendar_event",
          resourceId: "bulk",
          afterValue: { inserted: toInsert.length, dates: toInsert.map((e) => e.eventDate) } as Record<string, unknown>,
          ipAddress: context.ipAddress,
          userAgent: context.userAgent,
        });
        return { inserted: toInsert.length, skipped: existingDates.size };
      }),

    delete: requireRole("timesheet", "update")
      .input(z.object({ id: z.number().int() }))
      .handler(async ({ input, context }) => {
        const existing = await db.query.calendarEvents.findFirst({
          where: and(
            eq(calendarEvents.id, input.id),
            eq(calendarEvents.eventType, "public_holiday"),
          ),
        });
        if (!existing) {
          throw new ORPCError("NOT_FOUND", { message: "Public holiday not found" });
        }
        await db.delete(calendarEvents).where(eq(calendarEvents.id, input.id));
        await logAudit({
          actorId: context.session?.user.id ?? "",
          actorName: context.session?.user.name ?? "",
          actorRole: context.userRole ?? undefined,
          correlationId: context.requestId,
          action: "calendar_event.public_holiday.delete",
          module: "attendance",
          resourceType: "calendar_event",
          resourceId: String(input.id),
          beforeValue: existing as Record<string, unknown>,
          ipAddress: context.ipAddress,
          userAgent: context.userAgent,
        });
        return { success: true };
      }),
  },
};
