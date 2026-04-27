import { ORPCError } from "@orpc/server";
import { z } from "zod";
import { db, careerProgressionPlans } from "@ndma-dcs-staff-portal/db";
import { and, eq } from "drizzle-orm";

import { requireRole } from "../index";
import { logAudit } from "../lib/audit";

export const careerProgressionRouter = {
  /** List career progression plans. Optionally filter by staffId. */
  list: requireRole("contract", "read")
    .input(
      z.object({
        staffId: z.string().optional(),
      }),
    )
    .handler(async ({ input }) => {
      return db.query.careerProgressionPlans.findMany({
        where: input.staffId ? eq(careerProgressionPlans.staffId, input.staffId) : undefined,
        with: { staffProfile: { with: { user: true } } },
        orderBy: (t, { asc }) => [asc(t.staffId), asc(t.targetYear)],
      });
    }),

  /** Upsert a career progression plan entry for a staff member + year. */
  upsert: requireRole("contract", "update")
    .input(
      z.object({
        staffId: z.string(),
        targetYear: z.number().int().min(2024).max(2035),
        plannedRole: z.string().min(1),
        conditions: z.string().optional(),
        status: z.enum(["pending", "achieved", "missed"]).default("pending"),
      }),
    )
    .handler(async ({ input, context }) => {
      const { staffId, targetYear, plannedRole, conditions, status } = input;

      const existing = await db.query.careerProgressionPlans.findFirst({
        where: and(
          eq(careerProgressionPlans.staffId, staffId),
          eq(careerProgressionPlans.targetYear, targetYear),
        ),
      });

      if (existing) {
        const [updated] = await db
          .update(careerProgressionPlans)
          .set({ plannedRole, conditions: conditions ?? null, status })
          .where(eq(careerProgressionPlans.id, existing.id))
          .returning();
        if (!updated) throw new ORPCError("INTERNAL_SERVER_ERROR");

        await logAudit({
          actorId: context.session.user.id,
          actorName: context.session.user.name,
          actorRole: context.userRole ?? undefined,
          correlationId: context.requestId,
          action: "career_progression.update",
          module: "contracts",
          resourceType: "career_progression_plan",
          resourceId: existing.id,
          beforeValue: existing as Record<string, unknown>,
          afterValue: updated as Record<string, unknown>,
          ipAddress: context.ipAddress,
          userAgent: context.userAgent,
        });

        return updated;
      }

      const [created] = await db
        .insert(careerProgressionPlans)
        .values({ staffId, targetYear, plannedRole, conditions: conditions ?? null, status })
        .returning();
      if (!created) throw new ORPCError("INTERNAL_SERVER_ERROR");

      await logAudit({
        actorId: context.session.user.id,
        actorName: context.session.user.name,
        actorRole: context.userRole ?? undefined,
        correlationId: context.requestId,
        action: "career_progression.create",
        module: "contracts",
        resourceType: "career_progression_plan",
        resourceId: created.id,
        afterValue: created as Record<string, unknown>,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
      });

      return created;
    }),

  /** Delete a career progression plan entry. */
  delete: requireRole("contract", "update")
    .input(z.object({ id: z.string() }))
    .handler(async ({ input, context }) => {
      const existing = await db.query.careerProgressionPlans.findFirst({
        where: eq(careerProgressionPlans.id, input.id),
      });
      if (!existing) throw new ORPCError("NOT_FOUND");

      await db.delete(careerProgressionPlans).where(eq(careerProgressionPlans.id, input.id));

      await logAudit({
        actorId: context.session.user.id,
        actorName: context.session.user.name,
        actorRole: context.userRole ?? undefined,
        correlationId: context.requestId,
        action: "career_progression.delete",
        module: "contracts",
        resourceType: "career_progression_plan",
        resourceId: input.id,
        beforeValue: existing as Record<string, unknown>,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
      });

      return { success: true };
    }),
};
