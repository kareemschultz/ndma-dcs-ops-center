import { ORPCError } from "@orpc/server";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";

import {
  appraisalTrackerView,
  commendations,
  db,
  staffProfiles,
} from "@ndma-dcs-staff-portal/db";

import { protectedProcedure, requireRole } from "../index";
import { logAudit } from "../lib/audit";

/**
 * Commendations + Appraisal Tracker router (master plan §5.3 follow-ups).
 *
 * - `commendations.*` — CRUD over `commendations` table (positive recognition
 *   narratives per (staff, year, month)). Source: NOC StaffCommendationJournal_*.xlsx.
 * - `appraisalTracker.*` — read-only queries over the `appraisal_tracker_view` DB VIEW.
 *
 * RBAC uses `performance_journal` resource (full CRUD action set).
 */

const monthSchema = z.number().int().min(1).max(12);
const yearSchema = z.number().int().min(2020).max(2099);

export const commendationsRouter = {
  list: requireRole("performance_journal", "read")
    .input(
      z
        .object({
          staffProfileId: z.string().optional(),
          year: yearSchema.optional(),
        })
        .optional(),
    )
    .handler(async ({ input }) => {
      const filters = [];
      if (input?.staffProfileId) {
        filters.push(eq(commendations.staffProfileId, input.staffProfileId));
      }
      if (input?.year !== undefined) {
        filters.push(eq(commendations.year, input.year));
      }
      return db.query.commendations.findMany({
        where: filters.length ? and(...filters) : undefined,
        with: {
          staff: { with: { user: true, department: true } },
        },
        orderBy: [desc(commendations.year), desc(commendations.month)],
      });
    }),

  get: requireRole("performance_journal", "read")
    .input(z.object({ id: z.string() }))
    .handler(async ({ input }) => {
      const row = await db.query.commendations.findFirst({
        where: eq(commendations.id, input.id),
        with: { staff: { with: { user: true, department: true } } },
      });
      if (!row) {
        throw new ORPCError("NOT_FOUND");
      }
      return row;
    }),

  create: requireRole("performance_journal", "create")
    .input(
      z.object({
        staffProfileId: z.string(),
        year: yearSchema,
        month: monthSchema,
        narrative: z.string().min(1),
      }),
    )
    .handler(async ({ input, context }) => {
      const staff = await db.query.staffProfiles.findFirst({
        where: eq(staffProfiles.id, input.staffProfileId),
      });
      if (!staff) {
        throw new ORPCError("NOT_FOUND", { message: "Staff profile not found" });
      }

      const [row] = await db
        .insert(commendations)
        .values({
          staffProfileId: input.staffProfileId,
          year: input.year,
          month: input.month,
          narrative: input.narrative,
        })
        .returning();

      if (!row) {
        throw new ORPCError("INTERNAL_SERVER_ERROR", {
          message: "Failed to create commendation",
        });
      }

      await logAudit({
        actorId: context.session?.user?.id ?? "system",
        actorName: context.session?.user?.name ?? "system",
        actorRole: context.userRole ?? undefined,
        correlationId: context.requestId,
        action: "commendation.create",
        module: "performance",
        resourceType: "commendation",
        resourceId: row.id,
        afterValue: row,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
      });

      return row;
    }),

  update: requireRole("performance_journal", "update")
    .input(
      z.object({
        id: z.string(),
        narrative: z.string().min(1).optional(),
        year: yearSchema.optional(),
        month: monthSchema.optional(),
      }),
    )
    .handler(async ({ input, context }) => {
      const before = await db.query.commendations.findFirst({
        where: eq(commendations.id, input.id),
      });
      if (!before) {
        throw new ORPCError("NOT_FOUND");
      }

      const updateValues: Partial<typeof commendations.$inferInsert> = {};
      if (input.narrative !== undefined) updateValues.narrative = input.narrative;
      if (input.year !== undefined) updateValues.year = input.year;
      if (input.month !== undefined) updateValues.month = input.month;

      if (Object.keys(updateValues).length === 0) {
        return before;
      }

      const [row] = await db
        .update(commendations)
        .set(updateValues)
        .where(eq(commendations.id, input.id))
        .returning();

      if (!row) {
        throw new ORPCError("INTERNAL_SERVER_ERROR");
      }

      await logAudit({
        actorId: context.session?.user?.id ?? "system",
        actorName: context.session?.user?.name ?? "system",
        actorRole: context.userRole ?? undefined,
        correlationId: context.requestId,
        action: "commendation.update",
        module: "performance",
        resourceType: "commendation",
        resourceId: row.id,
        beforeValue: before,
        afterValue: row,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
      });

      return row;
    }),

  delete: requireRole("performance_journal", "delete")
    .input(z.object({ id: z.string() }))
    .handler(async ({ input, context }) => {
      const before = await db.query.commendations.findFirst({
        where: eq(commendations.id, input.id),
      });
      if (!before) {
        throw new ORPCError("NOT_FOUND");
      }
      await db.delete(commendations).where(eq(commendations.id, input.id));

      await logAudit({
        actorId: context.session?.user?.id ?? "system",
        actorName: context.session?.user?.name ?? "system",
        actorRole: context.userRole ?? undefined,
        correlationId: context.requestId,
        action: "commendation.delete",
        module: "performance",
        resourceType: "commendation",
        resourceId: before.id,
        beforeValue: before,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
      });

      return { success: true } as const;
    }),
};

/**
 * Appraisal tracker view router — read-only over the DB VIEW.
 * Mirrors APPRAISAL TRACKER DCS.xlsx + AppraisalTracker_20241210_v01.xlsx (NOC).
 */
export const appraisalTrackerRouter = {
  list: protectedProcedure
    .input(
      z
        .object({
          year: yearSchema.optional(),
          staffProfileId: z.string().optional(),
        })
        .optional(),
    )
    .handler(async ({ input }) => {
      const filters = [];
      if (input?.year !== undefined) {
        filters.push(eq(appraisalTrackerView.year, input.year));
      }
      if (input?.staffProfileId) {
        filters.push(eq(appraisalTrackerView.staffProfileId, input.staffProfileId));
      }
      return db
        .select()
        .from(appraisalTrackerView)
        .where(filters.length ? and(...filters) : undefined)
        .orderBy(desc(appraisalTrackerView.periodEnd));
    }),
};
