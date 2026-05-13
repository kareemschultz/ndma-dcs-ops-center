import { ORPCError } from "@orpc/server";
import { and, eq, gte, lte } from "drizzle-orm";
import { z } from "zod";

import {
  type NocShiftType,
  db,
  dcsOncallSwaps,
  dcsOnCallWeeks,
  nocShifts,
  quarterlyMaintenanceTasks,
  staffProfiles,
} from "@ndma-dcs-staff-portal/db";

import { requireRole } from "../index";
import { logAudit } from "../lib/audit";

// ── Helpers ────────────────────────────────────────────────────────────────

const DCS_ROLES = ["lead_engineer", "asn_support", "enterprise_support", "core_support"] as const;

const NOC_SHIFT_TYPES = [
  "Day Shift",
  "Night Shift",
  "Swing Shift",
  "Off",
  "Annual Leave",
  "Sick Leave",
  "Maternity Leave",
  "Training",
  "Training Half Day",
  "Custom",
  "Outreach",
] as const satisfies readonly NocShiftType[];

// ── Scheduling router ──────────────────────────────────────────────────────

export const schedulingRouter = {
  // ── NOC Shifts (wraps existing nocShifts table) ─────────────────────────
  nocShifts: {
    list: requireRole("shift", "read")
      .input(
        z.object({
          month: z.number().int().min(1).max(12),
          year: z.number().int(),
        }),
      )
      .handler(async ({ input }) => {
        const monthStr = String(input.month).padStart(2, "0");
        const fromDate = `${input.year}-${monthStr}-01`;
        // last day of month
        const lastDay = new Date(input.year, input.month, 0).getDate();
        const toDate = `${input.year}-${monthStr}-${String(lastDay).padStart(2, "0")}`;

        return db.query.nocShifts.findMany({
          where: (t, { gte, lte, and }) => and(gte(t.shiftDate, fromDate), lte(t.shiftDate, toDate)),
          with: {
            staffProfile: { with: { user: true, department: true } },
          },
          orderBy: (t, { asc }) => [asc(t.shiftDate), asc(t.staffId)],
        });
      }),

    bulkSet: requireRole("shift", "create")
      .input(
        z.object({
          entries: z.array(
            z.object({
              staffId: z.string().min(1),
              shiftDate: z.string(),
              shiftType: z.enum(NOC_SHIFT_TYPES),
              notes: z.string().optional().nullable(),
            }),
          ),
        }),
      )
      .handler(async ({ input, context }) => {
        const results = [];
        for (const entry of input.entries) {
          const [upserted] = await db
            .insert(nocShifts)
            .values({
              staffId: entry.staffId,
              shiftDate: entry.shiftDate,
              shiftType: entry.shiftType,
              notes: entry.notes ?? null,
            })
            .onConflictDoUpdate({
              target: [nocShifts.staffId, nocShifts.shiftDate],
              set: {
                shiftType: entry.shiftType,
                notes: entry.notes ?? null,
                updatedAt: new Date(),
              },
            })
            .returning();
          if (upserted) results.push(upserted);
        }

        await logAudit({
          actorId: context.session.user.id,
          actorName: context.session.user.name,
          actorRole: context.userRole ?? undefined,
          action: "scheduling.nocShifts.bulkSet",
          module: "scheduling",
          resourceType: "noc_shift",
          resourceId: "bulk",
          afterValue: { count: results.length } as Record<string, unknown>,
          ipAddress: context.ipAddress,
          userAgent: context.userAgent,
          correlationId: context.requestId,
        });

        return results;
      }),

    update: requireRole("shift", "update")
      .input(
        z.object({
          id: z.number().int(),
          shiftType: z.enum(NOC_SHIFT_TYPES),
        }),
      )
      .handler(async ({ input, context }) => {
        const before = await db.query.nocShifts.findFirst({
          where: eq(nocShifts.id, input.id),
        });
        if (!before) throw new ORPCError("NOT_FOUND");

        const [updated] = await db
          .update(nocShifts)
          .set({ shiftType: input.shiftType, updatedAt: new Date() })
          .where(eq(nocShifts.id, input.id))
          .returning();
        if (!updated) throw new ORPCError("INTERNAL_SERVER_ERROR");

        await logAudit({
          actorId: context.session.user.id,
          actorName: context.session.user.name,
          actorRole: context.userRole ?? undefined,
          action: "scheduling.nocShifts.update",
          module: "scheduling",
          resourceType: "noc_shift",
          resourceId: String(input.id),
          beforeValue: before as Record<string, unknown>,
          afterValue: updated as Record<string, unknown>,
          ipAddress: context.ipAddress,
          userAgent: context.userAgent,
          correlationId: context.requestId,
        });

        return updated;
      }),

    importMonth: requireRole("shift", "create")
      .input(
        z.object({
          year: z.number().int(),
          month: z.number().int().min(1).max(12),
          rows: z.array(
            z.object({
              staffId: z.string(),
              day: z.number().int().min(1).max(31),
              shiftType: z.enum(NOC_SHIFT_TYPES),
              notes: z.string().optional(),
            }),
          ),
        }),
      )
      .handler(async ({ input, context }) => {
        const { year, month, rows } = input;
        // Delete existing shifts for this month for the staff in this batch
        const staffIds = [...new Set(rows.map((r) => r.staffId))];
        const monthStr = String(month).padStart(2, "0");
        const monthStart = `${year}-${monthStr}-01`;
        const lastDay = new Date(year, month, 0).getDate();
        const monthEnd = `${year}-${monthStr}-${String(lastDay).padStart(2, "0")}`;

        for (const sid of staffIds) {
          await db.delete(nocShifts).where(
            and(
              eq(nocShifts.staffId, sid),
              gte(nocShifts.shiftDate, monthStart),
              lte(nocShifts.shiftDate, monthEnd),
            ),
          );
        }

        // Insert new shifts
        const values = rows.map((r) => {
          const d = new Date(year, month - 1, r.day);
          return {
            staffId: r.staffId,
            shiftDate: d.toISOString().slice(0, 10),
            shiftType: r.shiftType as NocShiftType,
            notes: r.notes ?? null,
          };
        });

        if (values.length > 0) {
          await db.insert(nocShifts).values(values);
        }

        await logAudit({
          actorId: context.session.user.id,
          actorName: context.session.user.name,
          actorRole: context.userRole ?? undefined,
          correlationId: context.requestId,
          action: "scheduling.nocShifts.importMonth",
          module: "scheduling",
          resourceType: "noc_shift",
          resourceId: `${year}-${month}`,
          afterValue: { year, month, count: values.length },
          ipAddress: context.ipAddress,
          userAgent: context.userAgent,
        });

        return { imported: values.length };
      }),
  },

  // ── DCS On-Call Weeks ────────────────────────────────────────────────────
  dcsOnCall: {
    list: requireRole("rota", "read")
      .input(z.object({ year: z.number().int() }))
      .handler(async ({ input }) => {
        return db.query.dcsOnCallWeeks.findMany({
          where: eq(dcsOnCallWeeks.year, input.year),
          with: {
            leadEngineer: { with: { user: true } },
            asnSupport: { with: { user: true } },
            enterpriseSupport: { with: { user: true } },
            coreSupport: { with: { user: true } },
          },
          orderBy: (t, { asc }) => [asc(t.weekNum)],
        });
      }),

    get: requireRole("rota", "read")
      .input(z.object({ id: z.string().min(1) }))
      .handler(async ({ input }) => {
        const row = await db.query.dcsOnCallWeeks.findFirst({
          where: eq(dcsOnCallWeeks.id, input.id),
          with: {
            leadEngineer: { with: { user: true } },
            asnSupport: { with: { user: true } },
            enterpriseSupport: { with: { user: true } },
            coreSupport: { with: { user: true } },
            swaps: { with: { requester: { with: { user: true } }, targetStaff: { with: { user: true } } } },
          },
        });
        if (!row) throw new ORPCError("NOT_FOUND");
        return row;
      }),

    upsertWeek: requireRole("rota", "create")
      .input(
        z.object({
          year: z.number().int(),
          weekNum: z.number().int().min(1).max(53),
          weekStartDate: z.string(),
          weekEndDate: z.string(),
          leadEngineerId: z.string().nullable().optional(),
          asnSupportId: z.string().nullable().optional(),
          enterpriseSupportId: z.string().nullable().optional(),
          coreSupportId: z.string().nullable().optional(),
          notes: z.string().nullable().optional(),
        }),
      )
      .handler(async ({ input, context }) => {
        const [upserted] = await db
          .insert(dcsOnCallWeeks)
          .values({
            year: input.year,
            weekNum: input.weekNum,
            weekStartDate: input.weekStartDate,
            weekEndDate: input.weekEndDate,
            leadEngineerId: input.leadEngineerId ?? null,
            asnSupportId: input.asnSupportId ?? null,
            enterpriseSupportId: input.enterpriseSupportId ?? null,
            coreSupportId: input.coreSupportId ?? null,
            notes: input.notes ?? null,
          })
          .onConflictDoUpdate({
            target: [dcsOnCallWeeks.year, dcsOnCallWeeks.weekNum],
            set: {
              weekStartDate: input.weekStartDate,
              weekEndDate: input.weekEndDate,
              leadEngineerId: input.leadEngineerId ?? null,
              asnSupportId: input.asnSupportId ?? null,
              enterpriseSupportId: input.enterpriseSupportId ?? null,
              coreSupportId: input.coreSupportId ?? null,
              notes: input.notes ?? null,
              updatedAt: new Date(),
            },
          })
          .returning();

        if (!upserted) throw new ORPCError("INTERNAL_SERVER_ERROR");

        await logAudit({
          actorId: context.session.user.id,
          actorName: context.session.user.name,
          actorRole: context.userRole ?? undefined,
          action: "scheduling.dcsOnCall.upsertWeek",
          module: "scheduling",
          resourceType: "dcs_on_call_week",
          resourceId: upserted.id,
          afterValue: upserted as Record<string, unknown>,
          ipAddress: context.ipAddress,
          userAgent: context.userAgent,
          correlationId: context.requestId,
        });

        return upserted;
      }),
  },

  // ── Quarterly Maintenance Tasks ──────────────────────────────────────────
  maintenance: {
    list: requireRole("shift", "read")
      .input(z.object({ year: z.number().int() }))
      .handler(async ({ input }) => {
        return db.query.quarterlyMaintenanceTasks.findMany({
          where: eq(quarterlyMaintenanceTasks.year, input.year),
          orderBy: (t, { asc }) => [asc(t.quarter), asc(t.taskName)],
        });
      }),

    upsert: requireRole("shift", "create")
      .input(
        z.object({
          year: z.number().int(),
          quarter: z.number().int().min(1).max(4),
          taskName: z.string().min(1),
          assignedStaffIds: z.array(z.string()).optional(),
          completionStatus: z.enum(["pending", "in_progress", "complete", "deferred"]).optional(),
          completionDate: z.string().nullable().optional(),
          completionNotes: z.string().nullable().optional(),
        }),
      )
      .handler(async ({ input, context }) => {
        const [upserted] = await db
          .insert(quarterlyMaintenanceTasks)
          .values({
            year: input.year,
            quarter: input.quarter,
            taskName: input.taskName,
            assignedStaffIds: input.assignedStaffIds ?? [],
            completionStatus: input.completionStatus ?? "pending",
            completionDate: input.completionDate ?? null,
            completionNotes: input.completionNotes ?? null,
          })
          .onConflictDoUpdate({
            target: [
              quarterlyMaintenanceTasks.year,
              quarterlyMaintenanceTasks.quarter,
              quarterlyMaintenanceTasks.taskName,
            ],
            set: {
              assignedStaffIds: input.assignedStaffIds ?? [],
              completionStatus: input.completionStatus ?? "pending",
              completionDate: input.completionDate ?? null,
              completionNotes: input.completionNotes ?? null,
              updatedAt: new Date(),
            },
          })
          .returning();

        if (!upserted) throw new ORPCError("INTERNAL_SERVER_ERROR");

        await logAudit({
          actorId: context.session.user.id,
          actorName: context.session.user.name,
          actorRole: context.userRole ?? undefined,
          action: "scheduling.maintenance.upsert",
          module: "scheduling",
          resourceType: "quarterly_maintenance_task",
          resourceId: upserted.id,
          afterValue: upserted as Record<string, unknown>,
          ipAddress: context.ipAddress,
          userAgent: context.userAgent,
          correlationId: context.requestId,
        });

        return upserted;
      }),

    delete: requireRole("shift", "delete")
      .input(z.object({ id: z.string().min(1) }))
      .handler(async ({ input, context }) => {
        await db
          .delete(quarterlyMaintenanceTasks)
          .where(eq(quarterlyMaintenanceTasks.id, input.id));
        await logAudit({
          actorId: context.session.user.id,
          actorName: context.session.user.name,
          actorRole: context.userRole ?? undefined,
          action: "scheduling.maintenance.delete",
          module: "scheduling",
          resourceType: "quarterly_maintenance_task",
          resourceId: input.id,
          ipAddress: context.ipAddress,
          userAgent: context.userAgent,
          correlationId: context.requestId,
        });
      }),
  },

  // ── DCS On-Call Swaps ────────────────────────────────────────────────────
  swaps: {
    request: requireRole("rota", "create")
      .input(
        z.object({
          originalWeekId: z.string().min(1),
          role: z.enum(DCS_ROLES),
          targetStaffId: z.string().min(1),
          targetWeekId: z.string().min(1),
          reason: z.string().optional(),
        }),
      )
      .handler(async ({ input, context }) => {
        const callerProfile = await db.query.staffProfiles.findFirst({
          where: eq(staffProfiles.userId, context.session.user.id),
        });
        if (!callerProfile) throw new ORPCError("FORBIDDEN");

        const [created] = await db
          .insert(dcsOncallSwaps)
          .values({
            requesterId: callerProfile.id,
            originalWeekId: input.originalWeekId,
            role: input.role,
            targetStaffId: input.targetStaffId,
            targetWeekId: input.targetWeekId,
            reason: input.reason ?? null,
          })
          .returning();

        if (!created) throw new ORPCError("INTERNAL_SERVER_ERROR");

        await logAudit({
          actorId: context.session.user.id,
          actorName: context.session.user.name,
          actorRole: context.userRole ?? undefined,
          action: "scheduling.swaps.request",
          module: "scheduling",
          resourceType: "dcs_oncall_swap",
          resourceId: created.id,
          afterValue: created as Record<string, unknown>,
          ipAddress: context.ipAddress,
          userAgent: context.userAgent,
          correlationId: context.requestId,
        });

        return created;
      }),

    review: requireRole("rota", "update")
      .input(
        z.object({
          id: z.string().min(1),
          status: z.enum(["approved", "rejected", "cancelled"]),
          reviewNote: z.string().optional(),
        }),
      )
      .handler(async ({ input, context }) => {
        const before = await db.query.dcsOncallSwaps.findFirst({
          where: eq(dcsOncallSwaps.id, input.id),
        });
        if (!before) throw new ORPCError("NOT_FOUND");

        const callerProfile = await db.query.staffProfiles.findFirst({
          where: eq(staffProfiles.userId, context.session.user.id),
        });

        const [updated] = await db
          .update(dcsOncallSwaps)
          .set({
            status: input.status,
            reviewedBy: callerProfile?.id ?? null,
            reviewedAt: new Date(),
          })
          .where(eq(dcsOncallSwaps.id, input.id))
          .returning();

        if (!updated) throw new ORPCError("INTERNAL_SERVER_ERROR");

        await logAudit({
          actorId: context.session.user.id,
          actorName: context.session.user.name,
          actorRole: context.userRole ?? undefined,
          action: "scheduling.swaps.review",
          module: "scheduling",
          resourceType: "dcs_oncall_swap",
          resourceId: input.id,
          beforeValue: before as Record<string, unknown>,
          afterValue: updated as Record<string, unknown>,
          ipAddress: context.ipAddress,
          userAgent: context.userAgent,
          correlationId: context.requestId,
        });

        return updated;
      }),
  },
};
