import { ORPCError } from "@orpc/server";
import { and, desc, eq, gte, inArray, lte } from "drizzle-orm";
import { z } from "zod";

import {
  db,
  latenessRecords,
  staffProfiles,
  timesheetEntries,
  timesheets,
} from "@ndma-dcs-staff-portal/db";

import { requireRole } from "../index";
import { logAudit } from "../lib/audit";
import { getApprovedLeaveForRange } from "../lib/leave-overlay";

/** Full month name → 1-indexed month, for matching quarterly lateness rows. */
const MONTH_INDEX: Record<string, number> = {
  January: 1, February: 2, March: 3, April: 4, May: 5, June: 6,
  July: 7, August: 8, September: 9, October: 10, November: 11, December: 12,
};
import {
  canAccessStaffPrivate,
  getCallerStaffProfile,
  getManagedStaffIds,
} from "../lib/scope";
import { createNotification } from "../lib/notify";
import { getTeamStaffIds } from "../lib/team";

const timesheetStatusSchema = z.enum(["draft", "submitted", "approved", "rejected", "closed"]);

async function assertTimesheetAccess(context: Parameters<typeof canAccessStaffPrivate>[0], staffProfileId: string) {
  const role = context.userRole ?? "";
  if (role === "admin" || role === "hrAdminOps") {
    return;
  }
  const allowed = await canAccessStaffPrivate(context, staffProfileId);
  if (!allowed) {
    throw new ORPCError("FORBIDDEN");
  }
}

async function notifyStaff(staffProfileId: string, title: string, body: string, module: string, resourceId: string) {
  const staff = await db.query.staffProfiles.findFirst({
    where: eq(staffProfiles.id, staffProfileId),
    with: { user: true },
  });
  if (!staff?.user?.id) {
    return;
  }
  await createNotification({
    recipientId: staff.user.id,
    title,
    body,
    module,
    resourceType: "timesheet",
    resourceId,
  });
}

async function recalculateTimesheetTotal(timesheetId: string) {
  const rows = await db.query.timesheetEntries.findMany({
    where: eq(timesheetEntries.timesheetId, timesheetId),
  });
  const totalHours = rows.reduce((sum, row) => sum + Number(row.hours ?? 0), 0);
  return totalHours.toFixed(2);
}

export const timesheetsRouter = {
  list: requireRole("timesheet", "read")
    .input(
      z.object({
        staffProfileId: z.string().optional(),
        team: z.enum(["DCS", "NOC"]).optional(),
        status: timesheetStatusSchema.optional(),
      }),
    )
    .handler(async ({ input, context }) => {
      const role = context.userRole ?? "";
      const conditions = [];

      if (input.staffProfileId) {
        await assertTimesheetAccess(context, input.staffProfileId);
        conditions.push(eq(timesheets.staffProfileId, input.staffProfileId));
      } else if (input.team) {
        const teamStaffIds = await getTeamStaffIds(input.team);
        if (teamStaffIds.length === 0) {
          return [];
        }
        conditions.push(inArray(timesheets.staffProfileId, teamStaffIds));
      } else if (role !== "admin" && role !== "hrAdminOps") {
        const managed = await getManagedStaffIds(context);
        const caller = await getCallerStaffProfile(context);
        const accessible = new Set(managed);
        if (caller?.id) {
          accessible.add(caller.id);
        }
        if (accessible.size === 0) {
          return [];
        }
        conditions.push(inArray(timesheets.staffProfileId, [...accessible]));
      }

      if (input.status) {
        conditions.push(eq(timesheets.status, input.status));
      }

      return db.query.timesheets.findMany({
        where: conditions.length > 0 ? and(...conditions) : undefined,
        with: {
          staffProfile: { with: { user: true, department: true } },
          reviewedBy: true,
          createdBy: true,
          entries: true,
        },
        orderBy: [desc(timesheets.periodStart), desc(timesheets.createdAt)],
      });
    }),

  get: requireRole("timesheet", "read")
    .input(z.object({ id: z.string() }))
    .handler(async ({ input, context }) => {
      const row = await db.query.timesheets.findFirst({
        where: eq(timesheets.id, input.id),
        with: {
          staffProfile: { with: { user: true, department: true } },
          reviewedBy: true,
          createdBy: true,
          entries: true,
        },
      });
      if (!row) {
        throw new ORPCError("NOT_FOUND");
      }

      await assertTimesheetAccess(context, row.staffProfileId);
      return row;
    }),

  // ── Period overlay (STAGE 3 — data linking) ────────────────────────────────
  // Read-only join: approved leave days + lateness records that overlap a
  // timesheet's [periodStart, periodEnd]. Lets the timesheet detail surface
  // context entered in other modules (Leave, Lateness) without duplicating it.
  periodOverlay: requireRole("timesheet", "read")
    .input(z.object({ id: z.string() }))
    .handler(async ({ input, context }) => {
      const sheet = await db.query.timesheets.findFirst({
        where: eq(timesheets.id, input.id),
      });
      if (!sheet) throw new ORPCError("NOT_FOUND");
      await assertTimesheetAccess(context, sheet.staffProfileId);

      // Approved leave overlapping the period → flat list of leave days.
      const overlay = await getApprovedLeaveForRange(
        sheet.periodStart,
        sheet.periodEnd,
        [sheet.staffProfileId],
      );
      const leaveDays = Object.entries(overlay[sheet.staffProfileId] ?? {})
        .map(([date, day]) => ({ date, leaveType: day.leaveType, requestId: day.requestId }))
        .sort((a, b) => a.date.localeCompare(b.date));

      // Lateness records whose (year, month) falls inside the period.
      const startYear = Number(sheet.periodStart.slice(0, 4));
      const endYear = Number(sheet.periodEnd.slice(0, 4));
      const latenessRows = await db.query.latenessRecords.findMany({
        where: and(
          eq(latenessRecords.staffId, sheet.staffProfileId),
          gte(latenessRecords.year, startYear),
          lte(latenessRecords.year, endYear),
        ),
      });
      const lateness = latenessRows
        .filter((r) => {
          const monthIdx = MONTH_INDEX[r.month];
          if (!monthIdx) return false;
          // First day of that month — is it within the timesheet period?
          const monthStart = `${r.year}-${String(monthIdx).padStart(2, "0")}-01`;
          return monthStart >= sheet.periodStart.slice(0, 7) + "-01"
            && monthStart <= sheet.periodEnd;
        })
        .map((r) => ({
          year: r.year,
          month: r.month,
          totalTimeLate: r.totalTimeLate,
          daysLate: r.daysLate,
        }));

      return { leaveDays, lateness };
    }),

  mine: requireRole("timesheet", "read").handler(async ({ context }) => {
    const caller = await getCallerStaffProfile(context);
    if (!caller) {
      return [];
    }
    return db.query.timesheets.findMany({
      where: eq(timesheets.staffProfileId, caller.id),
      with: {
        staffProfile: { with: { user: true, department: true } },
        reviewedBy: true,
        createdBy: true,
        entries: true,
      },
      orderBy: [desc(timesheets.periodStart), desc(timesheets.createdAt)],
    });
  }),

  create: requireRole("timesheet", "create")
    .input(
      z.object({
        staffProfileId: z.string(),
        title: z.string().min(1),
        periodStart: z.string(),
        periodEnd: z.string(),
      }),
    )
    .handler(async ({ input, context }) => {
      await assertTimesheetAccess(context, input.staffProfileId);

      const [row] = await db
        .insert(timesheets)
        .values({
          staffProfileId: input.staffProfileId,
          title: input.title,
          periodStart: input.periodStart,
          periodEnd: input.periodEnd,
          totalHours: "0",
          status: "draft",
          createdById: context.session.user.id,
        })
        .returning();
      if (!row) {
        throw new ORPCError("INTERNAL_SERVER_ERROR");
      }

      await logAudit({
        actorId: context.session.user.id,
        actorName: context.session.user.name,
        actorRole: context.userRole ?? undefined,
        action: "timesheet.create",
        module: "operations",
        resourceType: "timesheet",
        resourceId: row.id,
        afterValue: row as Record<string, unknown>,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
        correlationId: context.requestId,
      });

      return row;
    }),

  update: requireRole("timesheet", "update")
    .input(
      z.object({
        id: z.string(),
        title: z.string().optional(),
        periodStart: z.string().optional(),
        periodEnd: z.string().optional(),
      }),
    )
    .handler(async ({ input, context }) => {
      const before = await db.query.timesheets.findFirst({
        where: eq(timesheets.id, input.id),
      });
      if (!before) throw new ORPCError("NOT_FOUND");

      await assertTimesheetAccess(context, before.staffProfileId);
      if (before.status !== "draft") {
        throw new ORPCError("CONFLICT", {
          message: "Only draft timesheets can be edited.",
        });
      }

      const [row] = await db
        .update(timesheets)
        .set({
          title: input.title ?? before.title,
          periodStart: input.periodStart ?? before.periodStart,
          periodEnd: input.periodEnd ?? before.periodEnd,
          updatedAt: new Date(),
        })
        .where(eq(timesheets.id, input.id))
        .returning();

      await logAudit({
        actorId: context.session.user.id,
        actorName: context.session.user.name,
        actorRole: context.userRole ?? undefined,
        action: "timesheet.update",
        module: "operations",
        resourceType: "timesheet",
        resourceId: input.id,
        beforeValue: before as Record<string, unknown>,
        afterValue: row as Record<string, unknown>,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
        correlationId: context.requestId,
      });

      return row;
    }),

  addEntry: requireRole("timesheet", "update")
    .input(
      z.object({
        timesheetId: z.string(),
        workDate: z.string(),
        hours: z.number().min(0.25),
        category: z.string().min(1),
        description: z.string().optional(),
        relatedIncidentId: z.string().optional(),
      }),
    )
    .handler(async ({ input, context }) => {
      const timesheet = await db.query.timesheets.findFirst({
        where: eq(timesheets.id, input.timesheetId),
      });
      if (!timesheet) throw new ORPCError("NOT_FOUND");

      await assertTimesheetAccess(context, timesheet.staffProfileId);
      if (timesheet.status !== "draft") {
        throw new ORPCError("CONFLICT", {
          message: "Only draft timesheets can be edited.",
        });
      }

      const [entry] = await db
        .insert(timesheetEntries)
        .values({
          timesheetId: input.timesheetId,
          workDate: input.workDate,
          hours: input.hours.toFixed(2),
          category: input.category,
          description: input.description ?? null,
          relatedIncidentId: input.relatedIncidentId ?? null,
        })
        .returning();
      if (!entry) {
        throw new ORPCError("INTERNAL_SERVER_ERROR");
      }

      const totalHours = await recalculateTimesheetTotal(input.timesheetId);
      await db
        .update(timesheets)
        .set({ totalHours, updatedAt: new Date() })
        .where(eq(timesheets.id, input.timesheetId));

      await logAudit({
        actorId: context.session.user.id,
        actorName: context.session.user.name,
        actorRole: context.userRole ?? undefined,
        action: "timesheet_entry.create",
        module: "operations",
        resourceType: "timesheet_entry",
        resourceId: entry.id,
        afterValue: entry as Record<string, unknown>,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
        correlationId: context.requestId,
      });

      return entry;
    }),

  removeEntry: requireRole("timesheet", "update")
    .input(z.object({ id: z.string() }))
    .handler(async ({ input, context }) => {
      const before = await db.query.timesheetEntries.findFirst({
        where: eq(timesheetEntries.id, input.id),
      });
      if (!before) throw new ORPCError("NOT_FOUND");

      const timesheet = await db.query.timesheets.findFirst({
        where: eq(timesheets.id, before.timesheetId),
      });
      if (!timesheet) throw new ORPCError("NOT_FOUND");

      await assertTimesheetAccess(context, timesheet.staffProfileId);
      if (timesheet.status !== "draft") {
        throw new ORPCError("CONFLICT", {
          message: "Only draft timesheets can be edited.",
        });
      }

      await db.delete(timesheetEntries).where(eq(timesheetEntries.id, input.id));
      const totalHours = await recalculateTimesheetTotal(before.timesheetId);
      await db
        .update(timesheets)
        .set({ totalHours, updatedAt: new Date() })
        .where(eq(timesheets.id, before.timesheetId));

      await logAudit({
        actorId: context.session.user.id,
        actorName: context.session.user.name,
        actorRole: context.userRole ?? undefined,
        action: "timesheet_entry.delete",
        module: "operations",
        resourceType: "timesheet_entry",
        resourceId: input.id,
        beforeValue: before as Record<string, unknown>,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
        correlationId: context.requestId,
      });

      return { success: true };
    }),

  submit: requireRole("timesheet", "submit")
    .input(z.object({ id: z.string() }))
    .handler(async ({ input, context }) => {
      const before = await db.query.timesheets.findFirst({
        where: eq(timesheets.id, input.id),
      });
      if (!before) throw new ORPCError("NOT_FOUND");

      await assertTimesheetAccess(context, before.staffProfileId);
      if (before.status !== "draft") {
        throw new ORPCError("CONFLICT", {
          message: "Only draft timesheets can be submitted.",
        });
      }

      const [row] = await db
        .update(timesheets)
        .set({
          status: "submitted",
          submittedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(timesheets.id, input.id))
        .returning();

      await notifyStaff(
        before.staffProfileId,
        "Timesheet submitted",
        "A timesheet has been submitted for review.",
        "operations",
        before.id,
      );

      await logAudit({
        actorId: context.session.user.id,
        actorName: context.session.user.name,
        actorRole: context.userRole ?? undefined,
        action: "timesheet.submit",
        module: "operations",
        resourceType: "timesheet",
        resourceId: input.id,
        beforeValue: before as Record<string, unknown>,
        afterValue: row as Record<string, unknown>,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
        correlationId: context.requestId,
      });

      return row;
    }),

  approve: requireRole("timesheet", "approve")
    .input(z.object({ id: z.string(), reviewNotes: z.string().optional() }))
    .handler(async ({ input, context }) => {
      const before = await db.query.timesheets.findFirst({
        where: eq(timesheets.id, input.id),
      });
      if (!before) throw new ORPCError("NOT_FOUND");
      if (before.status !== "submitted") {
        throw new ORPCError("CONFLICT", {
          message: "Only submitted timesheets can be approved.",
        });
      }

      const [row] = await db
        .update(timesheets)
        .set({
          status: "approved",
          approvedAt: new Date(),
          reviewedById: context.session.user.id,
          reviewNotes: input.reviewNotes ?? before.reviewNotes,
          updatedAt: new Date(),
        })
        .where(eq(timesheets.id, input.id))
        .returning();

      await notifyStaff(
        before.staffProfileId,
        "Timesheet approved",
        "A timesheet has been approved.",
        "operations",
        before.id,
      );

      await logAudit({
        actorId: context.session.user.id,
        actorName: context.session.user.name,
        actorRole: context.userRole ?? undefined,
        action: "timesheet.approve",
        module: "operations",
        resourceType: "timesheet",
        resourceId: input.id,
        beforeValue: before as Record<string, unknown>,
        afterValue: row as Record<string, unknown>,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
        correlationId: context.requestId,
      });

      return row;
    }),

  reject: requireRole("timesheet", "reject")
    .input(z.object({ id: z.string(), reason: z.string().min(1) }))
    .handler(async ({ input, context }) => {
      const before = await db.query.timesheets.findFirst({
        where: eq(timesheets.id, input.id),
      });
      if (!before) throw new ORPCError("NOT_FOUND");
      if (before.status !== "submitted") {
        throw new ORPCError("CONFLICT", {
          message: "Only submitted timesheets can be rejected.",
        });
      }

      const [row] = await db
        .update(timesheets)
        .set({
          status: "rejected",
          reviewedById: context.session.user.id,
          reviewNotes: input.reason,
          updatedAt: new Date(),
        })
        .where(eq(timesheets.id, input.id))
        .returning();

      await logAudit({
        actorId: context.session.user.id,
        actorName: context.session.user.name,
        actorRole: context.userRole ?? undefined,
        action: "timesheet.reject",
        module: "operations",
        resourceType: "timesheet",
        resourceId: input.id,
        beforeValue: before as Record<string, unknown>,
        afterValue: row as Record<string, unknown>,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
        correlationId: context.requestId,
      });

      return row;
    }),
};
