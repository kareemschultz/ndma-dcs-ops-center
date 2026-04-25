import { ORPCError } from "@orpc/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, platforms } from "@ndma-dcs-staff-portal/db";

import { requireRole } from "../index";
import { logAudit } from "../lib/audit";

const CATEGORY_VALUES = ["monitoring", "vpn", "portal", "identity", "access_control", "other"] as const;
const AUTH_TYPE_VALUES = ["local", "ad_ldap", "saml", "oauth", "hybrid", "unknown"] as const;
const SYNC_MODE_VALUES = ["manual_only", "api_full", "api_partial", "api_read_only"] as const;

const platformInput = z.object({
  name: z.string().min(1),
  category: z.enum(CATEGORY_VALUES).optional(),
  authType: z.enum(AUTH_TYPE_VALUES).optional(),
  syncMode: z.enum(SYNC_MODE_VALUES).optional(),
  syncAdapterId: z.string().nullable().optional(),
  apiCapabilities: z.record(z.string(), z.unknown()).nullable().optional(),
  notes: z.string().nullable().optional(),
});

function assertAdmin(role: string | null | undefined) {
  if (role !== "admin") {
    throw new ORPCError("FORBIDDEN", { message: "Admin access required." });
  }
}

export const platformsRouter = {
  list: requireRole("access", "read").handler(async () => {
    return db.query.platforms.findMany({
      where: eq(platforms.active, true),
      orderBy: (table, { asc }) => [asc(table.name)],
    });
  }),

  get: requireRole("access", "read")
    .input(z.object({ id: z.string() }))
    .handler(async ({ input }) => {
      const platform = await db.query.platforms.findFirst({
        where: eq(platforms.id, input.id),
      });
      if (!platform) throw new ORPCError("NOT_FOUND");
      return platform;
    }),

  create: requireRole("access", "create")
    .input(platformInput)
    .handler(async ({ input, context }) => {
      assertAdmin(context.userRole);

      const [created] = await db
        .insert(platforms)
        .values({
          name: input.name,
          category: input.category ?? null,
          authType: input.authType ?? null,
          syncMode: input.syncMode ?? "manual_only",
          syncAdapterId: input.syncAdapterId ?? null,
          apiCapabilities: input.apiCapabilities ?? null,
          notes: input.notes ?? null,
          active: true,
          createdBy: context.session.user.id,
          updatedBy: context.session.user.id,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .returning();

      if (!created) throw new ORPCError("INTERNAL_SERVER_ERROR");

      await logAudit({
        actorId: context.session.user.id,
        actorName: context.session.user.name,
        actorRole: context.userRole ?? undefined,
        action: "access.platform.create",
        module: "access",
        resourceType: "platform",
        resourceId: created.id,
        afterValue: created as Record<string, unknown>,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
        correlationId: context.requestId,
      });

      return created;
    }),

  update: requireRole("access", "update")
    .input(
      z.object({
        id: z.string(),
        ...platformInput.shape,
      }),
    )
    .handler(async ({ input, context }) => {
      assertAdmin(context.userRole);

      const before = await db.query.platforms.findFirst({ where: eq(platforms.id, input.id) });
      if (!before) throw new ORPCError("NOT_FOUND");

      const nextValues: Record<string, unknown> = {
        updatedBy: context.session.user.id,
        updatedAt: new Date(),
      };
      if (input.name !== undefined) nextValues.name = input.name;
      if (input.category !== undefined) nextValues.category = input.category;
      if (input.authType !== undefined) nextValues.authType = input.authType;
      if (input.syncMode !== undefined) nextValues.syncMode = input.syncMode;
      if (input.syncAdapterId !== undefined) nextValues.syncAdapterId = input.syncAdapterId;
      if (input.apiCapabilities !== undefined) nextValues.apiCapabilities = input.apiCapabilities;
      if (input.notes !== undefined) nextValues.notes = input.notes;

      const [updated] = await db
        .update(platforms)
        .set(nextValues)
        .where(eq(platforms.id, input.id))
        .returning();
      if (!updated) throw new ORPCError("INTERNAL_SERVER_ERROR");

      await logAudit({
        actorId: context.session.user.id,
        actorName: context.session.user.name,
        actorRole: context.userRole ?? undefined,
        action: "access.platform.update",
        module: "access",
        resourceType: "platform",
        resourceId: input.id,
        beforeValue: before as Record<string, unknown>,
        afterValue: updated as Record<string, unknown>,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
        correlationId: context.requestId,
      });

      return updated;
    }),

  disable: requireRole("access", "delete")
    .input(z.object({ id: z.string() }))
    .handler(async ({ input, context }) => {
      assertAdmin(context.userRole);

      const before = await db.query.platforms.findFirst({ where: eq(platforms.id, input.id) });
      if (!before) throw new ORPCError("NOT_FOUND");

      const [updated] = await db
        .update(platforms)
        .set({
          active: false,
          updatedBy: context.session.user.id,
          updatedAt: new Date(),
        })
        .where(eq(platforms.id, input.id))
        .returning();
      if (!updated) throw new ORPCError("INTERNAL_SERVER_ERROR");

      await logAudit({
        actorId: context.session.user.id,
        actorName: context.session.user.name,
        actorRole: context.userRole ?? undefined,
        action: "access.platform.disable",
        module: "access",
        resourceType: "platform",
        resourceId: input.id,
        beforeValue: before as Record<string, unknown>,
        afterValue: updated as Record<string, unknown>,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
        correlationId: context.requestId,
      });

      return updated;
    }),
};
