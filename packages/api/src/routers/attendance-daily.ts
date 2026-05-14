import { ORPCError } from "@orpc/server";
import { and, asc, between, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";

import {
  dailyAttendance,
  db,
  leaveRequests,
  staffProfiles,
} from "@ndma-dcs-staff-portal/db";

import { requireRole } from "../index";
import { logAudit } from "../lib/audit";

// 10-category status enum — matches packages/db/src/schema/daily-attendance.ts
const STATUS_VALUES = [
  "on_site",
  "wfh",
  "late",
  "half_day",
  "annual_leave",
  "sick",
  "compassionate",
  "maternity_paternity",
  "absent",
  "holiday",
] as const;

const SOURCE_VALUES = ["manual", "morning_auto", "leave_planner"] as const;

type DailyStatus = (typeof STATUS_VALUES)[number];

function rid(prefix: string) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
}

// Map leave type label → daily attendance status for setDayRespectLeave.
function leaveTypeToStatus(leaveType: string): DailyStatus | null {
  const t = leaveType.toLowerCase();
  if (t.includes("annual")) return "annual_leave";
  if (t.includes("sick")) return "sick";
  if (t.includes("compassion") || t.includes("bereave")) return "compassionate";
  if (t.includes("matern") || t.includes("patern")) return "maternity_paternity";
  if (t.includes("half")) return "half_day";
  return "absent";
}

export const attendanceDailyRouter = {
  // List all attendance rows for a date — optionally filtered by department.
  list: requireRole("attendance", "read")
    .input(
      z.object({
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD"),
        departmentId: z.string().optional(),
      }),
    )
    .handler(async ({ input }) => {
      const rows = await db.query.dailyAttendance.findMany({
        where: eq(dailyAttendance.date, input.date),
        with: {
          staffProfile: {
            with: { user: true, department: true },
          },
          marker: true,
        },
        orderBy: [asc(dailyAttendance.staffProfileId)],
      });
      if (!input.departmentId) return rows;
      return rows.filter((r) => r.staffProfile?.departmentId === input.departmentId);
    }),

  // Get attendance for a date range (used by monthly grid + card).
  listRange: requireRole("attendance", "read")
    .input(
      z.object({
        from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        staffProfileId: z.string().optional(),
        departmentId: z.string().optional(),
      }),
    )
    .handler(async ({ input }) => {
      const conditions = [between(dailyAttendance.date, input.from, input.to)];
      if (input.staffProfileId) {
        conditions.push(eq(dailyAttendance.staffProfileId, input.staffProfileId));
      }
      const rows = await db.query.dailyAttendance.findMany({
        where: and(...conditions),
        with: {
          staffProfile: {
            with: { user: true, department: true },
          },
        },
        orderBy: [asc(dailyAttendance.date), asc(dailyAttendance.staffProfileId)],
      });
      if (!input.departmentId) return rows;
      return rows.filter((r) => r.staffProfile?.departmentId === input.departmentId);
    }),

  // Upsert a single staff member's status for a date.
  upsert: requireRole("attendance", "update")
    .input(
      z.object({
        staffProfileId: z.string(),
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        status: z.enum(STATUS_VALUES),
        notes: z.string().optional(),
        autoSource: z.enum(SOURCE_VALUES).optional().default("manual"),
      }),
    )
    .handler(async ({ input, context }) => {
      const existing = await db.query.dailyAttendance.findFirst({
        where: and(
          eq(dailyAttendance.staffProfileId, input.staffProfileId),
          eq(dailyAttendance.date, input.date),
        ),
      });

      const userId = context.session?.user.id ?? null;

      if (existing) {
        await db
          .update(dailyAttendance)
          .set({
            status: input.status,
            notes: input.notes,
            autoSource: input.autoSource,
            markedBy: userId,
          })
          .where(eq(dailyAttendance.id, existing.id));
        await logAudit({
          actorId: userId ?? "",
          actorName: context.session?.user.name ?? "",
          actorRole: context.userRole ?? undefined,
          correlationId: context.requestId,
          action: "daily_attendance.update",
          module: "attendance",
          resourceType: "daily_attendance",
          resourceId: existing.id,
          beforeValue: existing as Record<string, unknown>,
          afterValue: { status: input.status, notes: input.notes },
          ipAddress: context.ipAddress,
          userAgent: context.userAgent,
        });
        return { id: existing.id, updated: true };
      }

      const id = rid("att");
      await db.insert(dailyAttendance).values({
        id,
        staffProfileId: input.staffProfileId,
        date: input.date,
        status: input.status,
        notes: input.notes,
        autoSource: input.autoSource,
        markedBy: userId,
      });
      await logAudit({
        actorId: userId ?? "",
        actorName: context.session?.user.name ?? "",
        actorRole: context.userRole ?? undefined,
        correlationId: context.requestId,
        action: "daily_attendance.create",
        module: "attendance",
        resourceType: "daily_attendance",
        resourceId: id,
        afterValue: { staffProfileId: input.staffProfileId, date: input.date, status: input.status },
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
      });
      return { id, created: true };
    }),

  // Bulk mark — apply a single status to many staff for a date.
  bulkMark: requireRole("attendance", "update")
    .input(
      z.object({
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        staffIds: z.array(z.string()).min(1),
        status: z.enum(STATUS_VALUES),
        autoSource: z.enum(SOURCE_VALUES).optional().default("manual"),
      }),
    )
    .handler(async ({ input, context }) => {
      const userId = context.session?.user.id ?? null;
      const existing = await db.query.dailyAttendance.findMany({
        where: and(
          eq(dailyAttendance.date, input.date),
          inArray(dailyAttendance.staffProfileId, input.staffIds),
        ),
      });
      const existingByStaff = new Map(existing.map((e) => [e.staffProfileId, e]));

      const toInsert: typeof dailyAttendance.$inferInsert[] = [];
      const toUpdate: string[] = [];

      for (const staffId of input.staffIds) {
        const ex = existingByStaff.get(staffId);
        if (ex) {
          toUpdate.push(ex.id);
        } else {
          toInsert.push({
            id: rid("att"),
            staffProfileId: staffId,
            date: input.date,
            status: input.status,
            autoSource: input.autoSource,
            markedBy: userId,
          });
        }
      }

      if (toUpdate.length > 0) {
        await db
          .update(dailyAttendance)
          .set({ status: input.status, markedBy: userId, autoSource: input.autoSource })
          .where(inArray(dailyAttendance.id, toUpdate));
      }
      if (toInsert.length > 0) {
        await db.insert(dailyAttendance).values(toInsert);
      }

      await logAudit({
        actorId: userId ?? "",
        actorName: context.session?.user.name ?? "",
        actorRole: context.userRole ?? undefined,
        correlationId: context.requestId,
        action: "daily_attendance.bulk_mark",
        module: "attendance",
        resourceType: "daily_attendance",
        resourceId: "bulk",
        afterValue: {
          date: input.date,
          status: input.status,
          inserted: toInsert.length,
          updated: toUpdate.length,
        } as Record<string, unknown>,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
      });

      return { inserted: toInsert.length, updated: toUpdate.length };
    }),

  // Set Day (Respect Leave) — for each staff with an approved leave covering `date`,
  // upsert their attendance as that leave type.
  setDayRespectLeave: requireRole("attendance", "update")
    .input(z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }))
    .handler(async ({ input, context }) => {
      const userId = context.session?.user.id ?? null;
      // Find approved leave requests that cover the date.
      const leaves = await db.query.leaveRequests.findMany({
        where: and(
          eq(leaveRequests.status, "approved"),
          sql`${leaveRequests.startDate} <= ${input.date}`,
          sql`${leaveRequests.endDate} >= ${input.date}`,
        ),
        with: { leaveType: true },
      });

      if (leaves.length === 0) return { matched: 0, upserted: 0 };

      let upserted = 0;
      for (const lv of leaves) {
        const status = leaveTypeToStatus(lv.leaveType?.name ?? "");
        if (!status) continue;
        const existing = await db.query.dailyAttendance.findFirst({
          where: and(
            eq(dailyAttendance.staffProfileId, lv.staffProfileId),
            eq(dailyAttendance.date, input.date),
          ),
        });
        if (existing) {
          await db
            .update(dailyAttendance)
            .set({
              status,
              autoSource: "leave_planner",
              markedBy: userId,
            })
            .where(eq(dailyAttendance.id, existing.id));
        } else {
          await db.insert(dailyAttendance).values({
            id: rid("att"),
            staffProfileId: lv.staffProfileId,
            date: input.date,
            status,
            autoSource: "leave_planner",
            markedBy: userId,
          });
        }
        upserted += 1;
      }

      await logAudit({
        actorId: userId ?? "",
        actorName: context.session?.user.name ?? "",
        actorRole: context.userRole ?? undefined,
        correlationId: context.requestId,
        action: "daily_attendance.set_day_respect_leave",
        module: "attendance",
        resourceType: "daily_attendance",
        resourceId: "respect_leave",
        afterValue: { date: input.date, matched: leaves.length, upserted } as Record<string, unknown>,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
      });
      return { matched: leaves.length, upserted };
    }),

  // Counts by status for a date.
  getStats: requireRole("attendance", "read")
    .input(z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }))
    .handler(async ({ input }) => {
      const rows = await db.query.dailyAttendance.findMany({
        where: eq(dailyAttendance.date, input.date),
        columns: { status: true },
      });
      const counts: Record<DailyStatus | "total", number> = {
        on_site: 0,
        wfh: 0,
        late: 0,
        half_day: 0,
        annual_leave: 0,
        sick: 0,
        compassionate: 0,
        maternity_paternity: 0,
        absent: 0,
        holiday: 0,
        total: rows.length,
      };
      for (const r of rows) counts[r.status as DailyStatus] += 1;
      return counts;
    }),

  // Full-year card for one staff member.
  getCard: requireRole("attendance", "read")
    .input(
      z.object({
        staffProfileId: z.string(),
        year: z.number().int().min(2000).max(2100),
      }),
    )
    .handler(async ({ input }) => {
      const from = `${input.year}-01-01`;
      const to = `${input.year}-12-31`;
      return db.query.dailyAttendance.findMany({
        where: and(
          eq(dailyAttendance.staffProfileId, input.staffProfileId),
          between(dailyAttendance.date, from, to),
        ),
        orderBy: [asc(dailyAttendance.date)],
      });
    }),

  // Aggregated monthly breakdown for a staff member.
  getMonthlyBreakdown: requireRole("attendance", "read")
    .input(
      z.object({
        staffProfileId: z.string(),
        year: z.number().int().min(2000).max(2100),
      }),
    )
    .handler(async ({ input }) => {
      const from = `${input.year}-01-01`;
      const to = `${input.year}-12-31`;
      const rows = await db.query.dailyAttendance.findMany({
        where: and(
          eq(dailyAttendance.staffProfileId, input.staffProfileId),
          between(dailyAttendance.date, from, to),
        ),
        columns: { date: true, status: true },
      });

      const months: Array<Record<string, number | string>> = [];
      for (let m = 0; m < 12; m++) {
        const monthKey = String(m + 1).padStart(2, "0");
        const monthRows = rows.filter((r) => r.date.startsWith(`${input.year}-${monthKey}-`));
        const counts: Record<DailyStatus, number> = {
          on_site: 0,
          wfh: 0,
          late: 0,
          half_day: 0,
          annual_leave: 0,
          sick: 0,
          compassionate: 0,
          maternity_paternity: 0,
          absent: 0,
          holiday: 0,
        };
        for (const r of monthRows) counts[r.status as DailyStatus] += 1;
        months.push({
          month: m + 1,
          monthLabel: new Date(input.year, m, 1).toLocaleString("en-GB", { month: "long" }),
          ...counts,
          present: counts.on_site + counts.wfh + counts.late + counts.half_day,
          working: monthRows.length,
        });
      }
      if (!staffProfiles) {
        throw new ORPCError("INTERNAL_SERVER_ERROR", { message: "staffProfiles missing" });
      }
      return months;
    }),

  // Delete one row (admin tool).
  delete: requireRole("attendance", "delete")
    .input(z.object({ id: z.string() }))
    .handler(async ({ input, context }) => {
      const existing = await db.query.dailyAttendance.findFirst({
        where: eq(dailyAttendance.id, input.id),
      });
      if (!existing) throw new ORPCError("NOT_FOUND");
      await db.delete(dailyAttendance).where(eq(dailyAttendance.id, input.id));
      await logAudit({
        actorId: context.session?.user.id ?? "",
        actorName: context.session?.user.name ?? "",
        actorRole: context.userRole ?? undefined,
        correlationId: context.requestId,
        action: "daily_attendance.delete",
        module: "attendance",
        resourceType: "daily_attendance",
        resourceId: input.id,
        beforeValue: existing as Record<string, unknown>,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
      });
      return { success: true };
    }),
};
