import { ORPCError } from "@orpc/server";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";

import { db, latenessRecords } from "@ndma-dcs-staff-portal/db";

import { protectedProcedure, requireRole } from "../index";
import { logAudit } from "../lib/audit";
import { getCallerStaffProfile, getManagedStaffIds } from "../lib/scope";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
] as const;

const QUARTER_MONTHS: Record<number, string[]> = {
  1: ["January", "February", "March"],
  2: ["April", "May", "June"],
  3: ["July", "August", "September"],
  4: ["October", "November", "December"],
};

export const latenessRouter = {
  // List lateness records — optionally filtered by year / quarter / staff
  list: requireRole("compliance", "read")
    .input(
      z.object({
        year: z.number().int().optional(),
        quarter: z.number().int().min(1).max(4).optional(),
        staffId: z.string().optional(),
        limit: z.number().int().min(1).max(500).optional(),
        offset: z.number().int().min(0).optional(),
      }),
    )
    .handler(async ({ input, context }) => {
      const role = context.userRole ?? "";
      const conditions = [];

      if (input.year) {
        conditions.push(eq(latenessRecords.year, input.year));
      }
      if (input.quarter) {
        conditions.push(eq(latenessRecords.quarter, input.quarter));
      }
      if (input.staffId) {
        conditions.push(eq(latenessRecords.staffId, input.staffId));
      } else if (role !== "admin" && role !== "hrAdminOps" && role !== "manager") {
        // Non-admin: restrict to own + managed staff
        const managed = await getManagedStaffIds(context);
        const caller = await getCallerStaffProfile(context);
        const ids = new Set(managed);
        if (caller?.id) ids.add(caller.id);
        if (ids.size === 0) return [];
        conditions.push(inArray(latenessRecords.staffId, [...ids]));
      }

      const rows = await db.query.latenessRecords.findMany({
        where: conditions.length > 0 ? and(...conditions) : undefined,
        with: { staffProfile: { with: { user: true } } },
        orderBy: [desc(latenessRecords.year), asc(latenessRecords.month)],
        limit: input.limit ?? 200,
        offset: input.offset ?? 0,
      });

      return rows;
    }),

  // Quarterly grid: returns all staff with their lateness records for a given year+quarter
  quarterlyGrid: requireRole("compliance", "read")
    .input(
      z.object({
        year: z.number().int(),
        quarter: z.number().int().min(1).max(4),
      }),
    )
    .handler(async ({ input }) => {
      const months = QUARTER_MONTHS[input.quarter] ?? [];
      const conditions = [
        eq(latenessRecords.year, input.year),
        eq(latenessRecords.quarter, input.quarter),
      ];

      const records = await db.query.latenessRecords.findMany({
        where: and(...conditions),
        with: { staffProfile: { with: { user: true } } },
        orderBy: [asc(latenessRecords.staffId), asc(latenessRecords.month)],
      });

      // Group by staff
      const staffMap = new Map<string, {
        staffId: string;
        staffName: string;
        department: string | null;
        months: Record<string, {
          totalTimeLate: string;
          daysLate: number;
          daysMissingFromAttendance: number | null;
          daysOnSchedule: number | null;
          notes: string | null;
        }>;
      }>();

      for (const rec of records) {
        if (!staffMap.has(rec.staffId)) {
          staffMap.set(rec.staffId, {
            staffId: rec.staffId,
            staffName: rec.staffProfile?.user?.name ?? rec.staffId,
            department: rec.staffProfile?.departmentId ?? null,
            months: {},
          });
        }
        const entry = staffMap.get(rec.staffId)!;
        entry.months[rec.month] = {
          totalTimeLate: rec.totalTimeLate,
          daysLate: rec.daysLate,
          daysMissingFromAttendance: rec.daysMissingFromAttendance ?? null,
          daysOnSchedule: rec.daysOnSchedule ?? null,
          notes: rec.notes ?? null,
        };
      }

      return {
        year: input.year,
        quarter: input.quarter,
        months,
        rows: [...staffMap.values()].sort((a, b) => a.staffName.localeCompare(b.staffName)),
      };
    }),

  // Upsert a single lateness record (per staff × year × month)
  upsert: requireRole("compliance", "update")
    .input(
      z.object({
        staffId: z.string(),
        year: z.number().int(),
        month: z.string(), // "January", "February", etc.
        quarter: z.number().int().min(1).max(4).optional(),
        totalTimeLate: z.string(),
        daysLate: z.number().int().min(0),
        daysMissingFromAttendance: z.number().int().min(0).optional(),
        daysOnSchedule: z.number().int().min(0).optional(),
        notes: z.string().optional(),
      }),
    )
    .handler(async ({ input, context }) => {
      // Infer quarter from month if not supplied
      let quarter = input.quarter;
      if (!quarter) {
        const monthIndex = MONTHS.indexOf(input.month as (typeof MONTHS)[number]);
        if (monthIndex >= 0) {
          quarter = Math.ceil((monthIndex + 1) / 3);
        }
      }

      const existing = await db.query.latenessRecords.findFirst({
        where: and(
          eq(latenessRecords.staffId, input.staffId),
          eq(latenessRecords.year, input.year),
          eq(latenessRecords.month, input.month),
        ),
      });

      let row;
      if (existing) {
        const updated = await db
          .update(latenessRecords)
          .set({
            totalTimeLate: input.totalTimeLate,
            daysLate: input.daysLate,
            quarter: quarter ?? existing.quarter,
            daysMissingFromAttendance: input.daysMissingFromAttendance ?? existing.daysMissingFromAttendance,
            daysOnSchedule: input.daysOnSchedule ?? existing.daysOnSchedule,
            notes: input.notes ?? existing.notes,
          })
          .where(eq(latenessRecords.id, existing.id))
          .returning();
        row = updated[0];

        await logAudit({
          actorId: context.session.user.id,
          actorName: context.session.user.name,
          actorRole: context.userRole ?? undefined,
          action: "lateness_record.update",
          module: "compliance",
          resourceType: "lateness_record",
          resourceId: String(existing.id),
          beforeValue: existing as Record<string, unknown>,
          afterValue: row as Record<string, unknown>,
          ipAddress: context.ipAddress,
          userAgent: context.userAgent,
          correlationId: context.requestId,
        });
      } else {
        const inserted = await db
          .insert(latenessRecords)
          .values({
            staffId: input.staffId,
            year: input.year,
            month: input.month,
            quarter: quarter ?? null,
            totalTimeLate: input.totalTimeLate,
            daysLate: input.daysLate,
            daysMissingFromAttendance: input.daysMissingFromAttendance ?? null,
            daysOnSchedule: input.daysOnSchedule ?? null,
            notes: input.notes ?? null,
          })
          .returning();
        row = inserted[0];

        await logAudit({
          actorId: context.session.user.id,
          actorName: context.session.user.name,
          actorRole: context.userRole ?? undefined,
          action: "lateness_record.create",
          module: "compliance",
          resourceType: "lateness_record",
          resourceId: String(row?.id),
          afterValue: row as Record<string, unknown>,
          ipAddress: context.ipAddress,
          userAgent: context.userAgent,
          correlationId: context.requestId,
        });
      }

      if (!row) throw new ORPCError("INTERNAL_SERVER_ERROR");
      return row;
    }),

  // Delete a lateness record
  delete: requireRole("compliance", "update")
    .input(z.object({ id: z.number().int() }))
    .handler(async ({ input, context }) => {
      const before = await db.query.latenessRecords.findFirst({
        where: eq(latenessRecords.id, input.id),
      });
      if (!before) throw new ORPCError("NOT_FOUND");

      await db.delete(latenessRecords).where(eq(latenessRecords.id, input.id));

      await logAudit({
        actorId: context.session.user.id,
        actorName: context.session.user.name,
        actorRole: context.userRole ?? undefined,
        action: "lateness_record.delete",
        module: "compliance",
        resourceType: "lateness_record",
        resourceId: String(input.id),
        beforeValue: before as Record<string, unknown>,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
        correlationId: context.requestId,
      });

      return { success: true };
    }),

  // Summary stats for a year: total late minutes, most late staff
  stats: protectedProcedure
    .input(z.object({ year: z.number().int() }))
    .handler(async ({ input }) => {
      const rows = await db.query.latenessRecords.findMany({
        where: eq(latenessRecords.year, input.year),
        with: { staffProfile: { with: { user: true } } },
      });

      // Aggregate per staff
      const staffTotals = new Map<string, { name: string; totalDaysLate: number; }>();
      for (const r of rows) {
        if (!staffTotals.has(r.staffId)) {
          staffTotals.set(r.staffId, {
            name: r.staffProfile?.user?.name ?? r.staffId,
            totalDaysLate: 0,
          });
        }
        staffTotals.get(r.staffId)!.totalDaysLate += r.daysLate;
      }

      const sorted = [...staffTotals.entries()]
        .sort((a, b) => b[1].totalDaysLate - a[1].totalDaysLate)
        .slice(0, 10)
        .map(([staffId, val]) => ({ staffId, ...val }));

      return {
        year: input.year,
        totalRecords: rows.length,
        topLate: sorted,
      };
    }),
};
