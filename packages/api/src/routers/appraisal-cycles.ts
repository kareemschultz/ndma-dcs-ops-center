import { ORPCError } from "@orpc/server";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";

import {
  appraisalCycles,
  appraisals,
  db,
  staffProfiles,
} from "@ndma-dcs-staff-portal/db";

import { requireRole } from "../index";
import { logAudit } from "../lib/audit";

const cycleHalfSchema = z.enum(["h1", "h2"]);

export const appraisalCyclesRouter = {
  list: requireRole("appraisal", "read").handler(async () => {
    return db.query.appraisalCycles.findMany({
      with: {
        department: true,
        openedBy: true,
        closedBy: true,
      },
      orderBy: [desc(appraisalCycles.year), desc(appraisalCycles.half)],
    });
  }),

  get: requireRole("appraisal", "read")
    .input(z.object({ id: z.string() }))
    .handler(async ({ input }) => {
      const cycle = await db.query.appraisalCycles.findFirst({
        where: eq(appraisalCycles.id, input.id),
        with: {
          department: true,
          openedBy: true,
          closedBy: true,
        },
      });
      if (!cycle) {
        throw new ORPCError("NOT_FOUND");
      }
      return cycle;
    }),

  create: requireRole("appraisal", "create")
    .input(
      z.object({
        departmentId: z.string().optional(),
        year: z.number().int().min(2020).max(2100),
        half: cycleHalfSchema,
        title: z.string().min(1),
        startDate: z.string(),
        endDate: z.string(),
        notes: z.string().optional(),
      }),
    )
    .handler(async ({ input, context }) => {
      const [cycle] = await db
        .insert(appraisalCycles)
        .values({
          departmentId: input.departmentId ?? null,
          year: input.year,
          half: input.half,
          title: input.title,
          startDate: input.startDate,
          endDate: input.endDate,
          notes: input.notes ?? null,
        })
        .returning();
      if (!cycle) {
        throw new ORPCError("INTERNAL_SERVER_ERROR");
      }

      await logAudit({
        actorId: context.session.user.id,
        actorName: context.session.user.name,
        actorRole: context.userRole ?? undefined,
        action: "appraisal_cycle.create",
        module: "staff",
        resourceType: "appraisal_cycle",
        resourceId: cycle.id,
        afterValue: cycle as Record<string, unknown>,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
        correlationId: context.requestId,
      });

      return cycle;
    }),

  open: requireRole("appraisal", "update")
    .input(z.object({ id: z.string() }))
    .handler(async ({ input, context }) => {
      const before = await db.query.appraisalCycles.findFirst({
        where: eq(appraisalCycles.id, input.id),
      });
      if (!before) throw new ORPCError("NOT_FOUND");

      const [cycle] = await db
        .update(appraisalCycles)
        .set({
          status: "open",
          openedAt: new Date(),
          openedById: context.session.user.id,
          updatedAt: new Date(),
        })
        .where(eq(appraisalCycles.id, input.id))
        .returning();

      await logAudit({
        actorId: context.session.user.id,
        actorName: context.session.user.name,
        actorRole: context.userRole ?? undefined,
        action: "appraisal_cycle.open",
        module: "staff",
        resourceType: "appraisal_cycle",
        resourceId: input.id,
        beforeValue: before as Record<string, unknown>,
        afterValue: cycle as Record<string, unknown>,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
        correlationId: context.requestId,
      });

      return cycle;
    }),

  close: requireRole("appraisal", "update")
    .input(z.object({ id: z.string() }))
    .handler(async ({ input, context }) => {
      const before = await db.query.appraisalCycles.findFirst({
        where: eq(appraisalCycles.id, input.id),
      });
      if (!before) throw new ORPCError("NOT_FOUND");

      const [cycle] = await db
        .update(appraisalCycles)
        .set({
          status: "closed",
          closedAt: new Date(),
          closedById: context.session.user.id,
          updatedAt: new Date(),
        })
        .where(eq(appraisalCycles.id, input.id))
        .returning();

      await logAudit({
        actorId: context.session.user.id,
        actorName: context.session.user.name,
        actorRole: context.userRole ?? undefined,
        action: "appraisal_cycle.close",
        module: "staff",
        resourceType: "appraisal_cycle",
        resourceId: input.id,
        beforeValue: before as Record<string, unknown>,
        afterValue: cycle as Record<string, unknown>,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
        correlationId: context.requestId,
      });

      return cycle;
    }),

  batchCreateForCycle: requireRole("appraisal", "create")
    .input(
      z.object({
        cycleId: z.string(),
        departmentId: z.string().optional(),
        scheduledDate: z.string().optional(),
      }),
    )
    .handler(async ({ input, context }) => {
      const cycle = await db.query.appraisalCycles.findFirst({
        where: eq(appraisalCycles.id, input.cycleId),
      });
      if (!cycle) throw new ORPCError("NOT_FOUND");

      const staff = await db.query.staffProfiles.findMany({
        where: input.departmentId
          ? eq(staffProfiles.departmentId, input.departmentId)
          : undefined,
      });

      const created = [];
      for (const profile of staff) {
        const existing = await db.query.appraisals.findFirst({
          where: and(
            eq(appraisals.cycleId, cycle.id),
            eq(appraisals.staffProfileId, profile.id),
          ),
        });
        if (existing) {
          continue;
        }

        const [row] = await db
          .insert(appraisals)
          .values({
            cycleId: cycle.id,
            staffProfileId: profile.id,
            teamLeadId: null,
            periodStart: cycle.startDate,
            periodEnd: cycle.endDate,
            scheduledDate: input.scheduledDate ?? cycle.startDate,
            status: "draft",
          })
          .returning();
        if (row) {
          created.push(row.id);
        }
      }

      await logAudit({
        actorId: context.session.user.id,
        actorName: context.session.user.name,
        actorRole: context.userRole ?? undefined,
        action: "appraisal_cycle.batch_create",
        module: "staff",
        resourceType: "appraisal_cycle",
        resourceId: cycle.id,
        afterValue: {
          createdAppraisalIds: created,
          departmentId: input.departmentId ?? null,
        } as Record<string, unknown>,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
        correlationId: context.requestId,
      });

      return { createdCount: created.length, createdAppraisalIds: created };
    }),
};
