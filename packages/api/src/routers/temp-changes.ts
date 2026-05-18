import { ORPCError } from "@orpc/server";
import { z } from "zod";
import { db, temporaryChanges, tempChangeHistory, tempChangeLinks } from "@ndma-dcs-staff-portal/db";
import { and, desc, eq, gt, isNotNull, lt, sql } from "drizzle-orm";

import { requireRole } from "../index";
import { logAudit } from "../lib/audit";

const StatusSchema = z.enum([
  "planned",
  "implemented",
  "active",
  "overdue",
  "removed",
  "cancelled",
]);

// ── Risk derivation helper ─────────────────────────────────────────────────────

function deriveRiskLevel(data: {
  externalExposure?: boolean;
  publicIp?: string | null;
  environment?: string | null;
  ownerType?: string | null;
}): "low" | "medium" | "high" | "critical" {
  const hasPublicIp = !!(data.publicIp?.trim());
  const isExternal = !!data.externalExposure;
  const isProd = !data.environment || data.environment === "production";
  const hasOwner = data.ownerType !== "system";

  if (isExternal && hasPublicIp && isProd) return "critical";
  if (isExternal || hasPublicIp || (isProd && !hasOwner)) return "high";
  if (isProd) return "medium";
  return "low";
}

// ── Router ─────────────────────────────────────────────────────────────────────

export const tempChangesRouter = {
  list: requireRole("work", "read")
    .input(
      z.object({
        status: StatusSchema.optional(),
        ownerId: z.string().optional(),
        serviceId: z.string().optional(),
        limit: z.number().min(1).max(200).default(50),
        offset: z.number().min(0).default(0),
      }),
    )
    .handler(async ({ input }) => {
      const conditions = [];
      if (input.status) conditions.push(eq(temporaryChanges.status, input.status));
      if (input.ownerId) conditions.push(eq(temporaryChanges.ownerId, input.ownerId));
      if (input.serviceId) conditions.push(eq(temporaryChanges.serviceId, input.serviceId));

      return db.query.temporaryChanges.findMany({
        where: conditions.length > 0 ? and(...conditions) : undefined,
        orderBy: desc(temporaryChanges.createdAt),
        limit: input.limit,
        offset: input.offset,
        with: {
          owner: { with: { user: true } },
          service: true,
          createdBy: true,
          approvedBy: true,
        },
      });
    }),

  get: requireRole("work", "read")
    .input(z.object({ id: z.string() }))
    .handler(async ({ input }) => {
      const change = await db.query.temporaryChanges.findFirst({
        where: eq(temporaryChanges.id, input.id),
        with: {
          owner: { with: { user: true } },
          service: true,
          createdBy: true,
          approvedBy: true,
        },
      });
      if (!change) throw new ORPCError("NOT_FOUND");
      return change;
    }),

  create: requireRole("work", "create")
    .input(
      z.object({
        title: z.string().min(1).max(200),
        description: z.string().optional(),
        justification: z.string().optional(),
        ownerId: z.string().optional(),
        serviceId: z.string().optional(),
        implementationDate: z.string().optional(),
        removeByDate: z.string().optional(),
        followUpDate: z.string().optional(),
        linkedWorkItemId: z.string().optional(),
        rollbackPlan: z.string().optional(),
        // Extended categorization
        category: z.enum(["public_ip_exposure", "temporary_service", "temporary_access", "temporary_change", "other"]).optional(),
        environment: z.string().optional(),
        systemName: z.string().optional(),
        // Network/IP exposure details
        publicIp: z.string().optional(),
        internalIp: z.string().optional(),
        port: z.string().optional(),
        protocol: z.enum(["tcp", "udp", "both"]).optional(),
        externalExposure: z.boolean().optional(),
        // Owner model
        ownerType: z.enum(["internal_staff", "external_contact", "department", "system"]).optional(),
        externalAgencyName: z.string().optional(),
        externalAgencyType: z.string().optional(),
        // Requester info
        requestedByType: z.string().optional(),
        requestedByExternal: z.string().optional(),
        requestedById: z.string().optional(),
        // Department linkage
        departmentId: z.string().optional(),
      }),
    )
    .handler(async ({ input, context }) => {
      const riskLevel = deriveRiskLevel({
        externalExposure: input.externalExposure,
        publicIp: input.publicIp,
        environment: input.environment,
        ownerType: input.ownerType,
      });

      const [change] = await db
        .insert(temporaryChanges)
        .values({
          title: input.title,
          description: input.description ?? null,
          justification: input.justification ?? null,
          ownerId: input.ownerId ?? null,
          serviceId: input.serviceId ?? null,
          implementationDate: input.implementationDate ?? null,
          removeByDate: input.removeByDate ?? null,
          followUpDate: input.followUpDate ?? null,
          linkedWorkItemId: input.linkedWorkItemId ?? null,
          rollbackPlan: input.rollbackPlan ?? null,
          createdById: context.session.user.id,
          // Extended fields
          category: input.category ?? "temporary_change",
          environment: input.environment ?? "production",
          systemName: input.systemName ?? null,
          publicIp: input.publicIp ?? null,
          internalIp: input.internalIp ?? null,
          port: input.port ?? null,
          protocol: input.protocol ?? null,
          externalExposure: input.externalExposure ?? false,
          ownerType: input.ownerType ?? "internal_staff",
          externalAgencyName: input.externalAgencyName ?? null,
          externalAgencyType: input.externalAgencyType ?? null,
          requestedByType: input.requestedByType ?? null,
          requestedByExternal: input.requestedByExternal ?? null,
          requestedById: input.requestedById ?? null,
          departmentId: input.departmentId ?? null,
          riskLevel,
        })
        .returning();
      if (!change) throw new ORPCError("INTERNAL_SERVER_ERROR");

      await logAudit({
        actorId: context.session.user.id,
        actorName: context.session.user.name,
        action: "temp_change.create",
        module: "changes",
        resourceType: "temporary_change",
        resourceId: change.id,
        afterValue: change as Record<string, unknown>,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
        actorRole: context.userRole ?? undefined,
        correlationId: context.requestId,
      });

      return change;
    }),

  update: requireRole("work", "update")
    .input(
      z.object({
        id: z.string(),
        title: z.string().min(1).max(200).optional(),
        description: z.string().optional(),
        justification: z.string().optional(),
        ownerId: z.string().optional(),
        serviceId: z.string().optional(),
        implementationDate: z.string().optional(),
        removeByDate: z.string().optional(),
        status: StatusSchema.optional(),
        rollbackPlan: z.string().optional(),
        followUpNotes: z.string().optional(),
        followUpDate: z.string().optional(),
        linkedWorkItemId: z.string().optional(),
        approvedById: z.string().optional(),
        // Extended categorization + network/exposure details — kept in sync
        // with `create` so the edit form can persist every field it collects.
        category: z.enum(["public_ip_exposure", "temporary_service", "temporary_access", "temporary_change", "other"]).optional(),
        environment: z.string().optional(),
        systemName: z.string().optional(),
        publicIp: z.string().optional(),
        internalIp: z.string().optional(),
        port: z.string().optional(),
        protocol: z.enum(["tcp", "udp", "both"]).optional(),
        externalExposure: z.boolean().optional(),
        ownerType: z.enum(["internal_staff", "external_contact", "department", "system"]).optional(),
        externalAgencyName: z.string().optional(),
      }),
    )
    .handler(async ({ input, context }) => {
      const { id, ...updates } = input;
      const before = await db.query.temporaryChanges.findFirst({
        where: eq(temporaryChanges.id, id),
      });
      if (!before) throw new ORPCError("NOT_FOUND");

      // Re-derive the risk level when any exposure-related field changed.
      const exposureTouched =
        updates.externalExposure !== undefined ||
        updates.publicIp !== undefined ||
        updates.environment !== undefined ||
        updates.ownerType !== undefined;
      const riskLevel = exposureTouched
        ? deriveRiskLevel({
            externalExposure: updates.externalExposure ?? before.externalExposure ?? undefined,
            publicIp: updates.publicIp ?? before.publicIp ?? undefined,
            environment: updates.environment ?? before.environment ?? undefined,
            ownerType: updates.ownerType ?? before.ownerType ?? undefined,
          })
        : undefined;

      const [updated] = await db
        .update(temporaryChanges)
        .set(riskLevel ? { ...updates, riskLevel } : updates)
        .where(eq(temporaryChanges.id, id))
        .returning();

      await logAudit({
        actorId: context.session.user.id,
        actorName: context.session.user.name,
        action: "temp_change.update",
        module: "changes",
        resourceType: "temporary_change",
        resourceId: id,
        beforeValue: before as Record<string, unknown>,
        afterValue: updated as Record<string, unknown>,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
        actorRole: context.userRole ?? undefined,
        correlationId: context.requestId,
      });

      return updated;
    }),

  markRemoved: requireRole("work", "update")
    .input(z.object({ id: z.string(), followUpNotes: z.string().optional() }))
    .handler(async ({ input, context }) => {
      const today = new Date().toISOString().slice(0, 10);
      const [updated] = await db
        .update(temporaryChanges)
        .set({
          status: "removed",
          actualRemovalDate: today,
          followUpNotes: input.followUpNotes ?? null,
        })
        .where(eq(temporaryChanges.id, input.id))
        .returning();

      await logAudit({
        actorId: context.session.user.id,
        actorName: context.session.user.name,
        action: "temp_change.mark_removed",
        module: "changes",
        resourceType: "temporary_change",
        resourceId: input.id,
        afterValue: { status: "removed", actualRemovalDate: today },
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
        actorRole: context.userRole ?? undefined,
        correlationId: context.requestId,
      });

      return updated;
    }),

  // Soft-cancel: mark a temp change cancelled (audit-preserving).
  cancel: requireRole("work", "update")
    .input(z.object({ id: z.string(), reason: z.string().optional() }))
    .handler(async ({ input, context }) => {
      const before = await db.query.temporaryChanges.findFirst({
        where: eq(temporaryChanges.id, input.id),
      });
      if (!before) throw new ORPCError("NOT_FOUND");
      if (before.status === "cancelled" || before.status === "removed")
        throw new ORPCError("CONFLICT", {
          message: "This change is already removed or cancelled",
        });

      const [updated] = await db
        .update(temporaryChanges)
        .set({
          status: "cancelled",
          followUpNotes: input.reason ?? before.followUpNotes ?? null,
        })
        .where(eq(temporaryChanges.id, input.id))
        .returning();

      await logAudit({
        actorId: context.session.user.id,
        actorName: context.session.user.name,
        action: "temp_change.cancel",
        module: "changes",
        resourceType: "temporary_change",
        resourceId: input.id,
        beforeValue: { status: before.status },
        afterValue: { status: "cancelled" },
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
        actorRole: context.userRole ?? undefined,
        correlationId: context.requestId,
      });

      return updated;
    }),

  // Hard delete: only permitted for transient planned (draft) changes.
  delete: requireRole("work", "update")
    .input(z.object({ id: z.string() }))
    .handler(async ({ input, context }) => {
      const before = await db.query.temporaryChanges.findFirst({
        where: eq(temporaryChanges.id, input.id),
      });
      if (!before) throw new ORPCError("NOT_FOUND");
      if (before.status !== "planned") {
        throw new ORPCError("CONFLICT", {
          message:
            "Only planned (draft) changes can be deleted. Cancel changes that have been implemented.",
        });
      }

      await db.delete(temporaryChanges).where(eq(temporaryChanges.id, input.id));

      await logAudit({
        actorId: context.session.user.id,
        actorName: context.session.user.name,
        action: "temp_change.delete",
        module: "changes",
        resourceType: "temporary_change",
        resourceId: input.id,
        beforeValue: before as Record<string, unknown>,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
        actorRole: context.userRole ?? undefined,
        correlationId: context.requestId,
      });

      return { success: true };
    }),

  getOverdue: requireRole("work", "read").handler(async () => {
    const today = new Date().toISOString().slice(0, 10);

    // Auto-flag items that are past their removeByDate but not yet marked overdue
    await db
      .update(temporaryChanges)
      .set({ status: "overdue" })
      .where(
        and(
          sql`${temporaryChanges.status} IN ('active', 'implemented', 'planned')`,
          sql`${temporaryChanges.removeByDate} IS NOT NULL`,
          lt(temporaryChanges.removeByDate, today),
        ),
      );

    return db.query.temporaryChanges.findMany({
      where: and(
        sql`${temporaryChanges.removeByDate} IS NOT NULL`,
        lt(temporaryChanges.removeByDate, today),
        sql`${temporaryChanges.status} NOT IN ('removed', 'cancelled')`,
      ),
      with: {
        owner: { with: { user: true } },
        service: true,
      },
    });
  }),

  stats: requireRole("work", "read").handler(async () => {
    const all = await db.query.temporaryChanges.findMany({
      columns: { id: true, status: true, removeByDate: true },
    });
    const today = new Date().toISOString().slice(0, 10);
    const byStatus: Record<string, number> = {};
    let overdue = 0;

    for (const c of all) {
      byStatus[c.status] = (byStatus[c.status] ?? 0) + 1;
      if (
        c.removeByDate &&
        c.removeByDate < today &&
        !["removed", "cancelled"].includes(c.status)
      ) {
        overdue++;
      }
    }

    return { total: all.length, byStatus, overdue };
  }),

  statsExtended: requireRole("work", "read").handler(async () => {
    const all = await db.query.temporaryChanges.findMany({
      columns: {
        id: true,
        status: true,
        removeByDate: true,
        publicIp: true,
        externalExposure: true,
        category: true,
        riskLevel: true,
      },
    });
    const today = new Date().toISOString().slice(0, 10);
    const sevenDaysOut = new Date(Date.now() + 7 * 86400000)
      .toISOString()
      .slice(0, 10);
    const byStatus: Record<string, number> = {};
    const byCategory: Record<string, number> = {};
    const byRisk: Record<string, number> = {};
    let overdue = 0;
    let expiringSoon = 0;
    let publicIpCount = 0;
    let active = 0;

    for (const c of all) {
      byStatus[c.status] = (byStatus[c.status] ?? 0) + 1;
      if (c.category) byCategory[c.category] = (byCategory[c.category] ?? 0) + 1;
      if (c.riskLevel) byRisk[c.riskLevel] = (byRisk[c.riskLevel] ?? 0) + 1;

      const isActive = !["removed", "cancelled"].includes(c.status);
      if (isActive && c.status === "active") active++;
      if (
        isActive &&
        c.removeByDate &&
        c.removeByDate < today
      ) {
        overdue++;
      }
      if (
        isActive &&
        c.removeByDate &&
        c.removeByDate >= today &&
        c.removeByDate <= sevenDaysOut
      ) {
        expiringSoon++;
      }
      if (isActive && c.publicIp) publicIpCount++;
    }

    return {
      total: all.length,
      active,
      overdue,
      expiringSoon,
      publicIpCount,
      byStatus,
      byCategory,
      byRisk,
    };
  }),

  getPublicIPs: requireRole("work", "read")
    .input(z.object({}).optional())
    .handler(async () => {
      return db.query.temporaryChanges.findMany({
        where: and(
          isNotNull(temporaryChanges.publicIp),
          sql`${temporaryChanges.status} NOT IN ('removed', 'cancelled')`,
        ),
        orderBy: desc(temporaryChanges.createdAt),
        with: {
          owner: { with: { user: true } },
          service: true,
        },
      });
    }),

  getExpiringSoon: requireRole("work", "read")
    .input(z.object({ days: z.number().min(1).max(90).default(7) }))
    .handler(async ({ input }) => {
      const today = new Date().toISOString().slice(0, 10);
      const cutoff = new Date(Date.now() + input.days * 86400000)
        .toISOString()
        .slice(0, 10);

      return db.query.temporaryChanges.findMany({
        where: and(
          isNotNull(temporaryChanges.removeByDate),
          gt(temporaryChanges.removeByDate, today),
          lt(temporaryChanges.removeByDate, cutoff),
          sql`${temporaryChanges.status} NOT IN ('removed', 'cancelled')`,
        ),
        orderBy: temporaryChanges.removeByDate,
        with: {
          owner: { with: { user: true } },
          service: true,
        },
      });
    }),

  /** Get history for a specific temp change record */
  getHistory: requireRole("work", "read")
    .input(z.object({ tempChangeId: z.string() }))
    .handler(async ({ input }) => {
      return db.query.tempChangeHistory.findMany({
        where: eq(tempChangeHistory.tempChangeId, input.tempChangeId),
        orderBy: (t, { desc }) => [desc(t.createdAt)],
      });
    }),

  /** Add a link between a temp change and another entity (work item, incident, or service) */
  addLink: requireRole("work", "create")
    .input(z.object({
      tempChangeId: z.string(),
      workItemId: z.string().optional(),
      incidentId: z.string().optional(),
      serviceId: z.string().optional(),
      linkType: z.enum(["related", "caused_by", "resolves"]).default("related"),
    }))
    .handler(async ({ input, context }) => {
      const [link] = await db.insert(tempChangeLinks).values({
        tempChangeId: input.tempChangeId,
        workItemId: input.workItemId ?? null,
        incidentId: input.incidentId ?? null,
        serviceId: input.serviceId ?? null,
        linkType: input.linkType,
      }).returning();

      await logAudit({
        actorId: context.session.user.id,
        actorName: context.session.user.name,
        actorRole: context.userRole ?? undefined,
        correlationId: context.requestId,
        action: "temp_change.link.add",
        module: "changes",
        resourceType: "temp_change_link",
        resourceId: input.tempChangeId,
        afterValue: input as Record<string, unknown>,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
      });

      return link;
    }),
};
