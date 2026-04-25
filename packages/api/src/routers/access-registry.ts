import { ORPCError } from "@orpc/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import {
  db,
  serviceAccessRegistry,
} from "@ndma-dcs-staff-portal/db";

import { requireRole } from "../index";
import { logAudit } from "../lib/audit";
import { getCallerStaffProfile, getDirectReports } from "../lib/scope";

const ACCOUNT_TYPE_VALUES = [
  "local",
  "ad_ldap",
  "saml",
  "oauth",
  "service_account",
  "shared",
  "unknown",
] as const;
const PRIVILEGE_LEVEL_VALUES = [
  "admin",
  "operator",
  "read_only",
  "auditor",
  "custom",
  "none",
] as const;

const registryCreateInput = z.object({
  staffId: z.string().min(1),
  platformId: z.string().min(1),
  accountUsername: z.string().nullable().optional(),
  accountType: z.enum(ACCOUNT_TYPE_VALUES).nullable().optional(),
  accountActive: z.boolean().optional(),
  privilegeLevel: z.enum(PRIVILEGE_LEVEL_VALUES).nullable().optional(),
  privilegeGroups: z.array(z.string()).optional(),
  privilegeCustomNotes: z.string().nullable().optional(),
});

const registryUpdateInput = registryCreateInput
  .partial()
  .extend({
    id: z.string().min(1),
    manualOverrideReason: z.string().min(1).optional(),
  });

function isManagerOrAdmin(role: string | null | undefined) {
  return role === "manager" || role === "admin";
}

async function loadRegistryRow(id: string) {
  return db.query.serviceAccessRegistry.findFirst({
    where: eq(serviceAccessRegistry.id, id),
    with: {
      staff: { with: { user: true, department: true } },
      platform: true,
      lastSyncAdapterRun: true,
      manualOverriddenByStaff: { with: { user: true } },
    },
  });
}

async function canViewStaffRegistry(context: Parameters<typeof getCallerStaffProfile>[0], staffId: string) {
  const caller = await getCallerStaffProfile(context);
  if (!caller) return false;

  const role = context.userRole ?? "";
  if (role === "admin" || role === "manager") return true;
  if (caller.id === staffId) return true;
  if (role !== "teamLead") return false;

  const directReports = await getDirectReports(context);
  return directReports.some((row) => row.id === staffId);
}

function requiresManualOverride(
  before: Awaited<ReturnType<typeof loadRegistryRow>>,
  input: z.infer<typeof registryUpdateInput>,
) {
  if (!before) return false;

  const tracked: Array<[keyof typeof input, keyof typeof before]> = [
    ["accountUsername", "accountUsername"],
    ["accountType", "accountType"],
    ["privilegeLevel", "privilegeLevel"],
    ["privilegeGroups", "privilegeGroups"],
  ];

  return tracked.some(([inputKey, beforeKey]) => {
    const nextValue = input[inputKey];
    if (nextValue === undefined) return false;

    const currentValue = before[beforeKey];
    const changed = Array.isArray(nextValue) || Array.isArray(currentValue)
      ? JSON.stringify(nextValue ?? null) !== JSON.stringify(currentValue ?? null)
      : nextValue !== currentValue;
    if (!changed) return false;

    const sourceKey =
      inputKey === "accountUsername"
        ? "usernameSource"
        : inputKey === "accountType"
          ? "accountTypeSource"
          : inputKey === "privilegeLevel"
            ? "privilegeSource"
            : "groupsSource";

    return (before as Record<string, unknown>)[sourceKey] !== "manual";
  });
}

export const accessRegistryRouter = {
  listByStaff: requireRole("access", "read")
    .input(z.object({ staffId: z.string().min(1) }))
    .handler(async ({ input, context }) => {
      if (!(await canViewStaffRegistry(context, input.staffId))) {
        throw new ORPCError("FORBIDDEN");
      }

      return db.query.serviceAccessRegistry.findMany({
        where: eq(serviceAccessRegistry.staffId, input.staffId),
        orderBy: (table, { asc }) => [asc(table.platformId)],
        with: {
          staff: { with: { user: true, department: true } },
          platform: true,
          lastSyncAdapterRun: true,
          manualOverriddenByStaff: { with: { user: true } },
        },
      });
    }),

  listByPlatform: requireRole("access", "read")
    .input(z.object({ platformId: z.string().min(1) }))
    .handler(async ({ input, context }) => {
      if (!isManagerOrAdmin(context.userRole)) {
        throw new ORPCError("FORBIDDEN");
      }

      return db.query.serviceAccessRegistry.findMany({
        where: eq(serviceAccessRegistry.platformId, input.platformId),
        orderBy: (table, { asc }) => [asc(table.staffId)],
        with: {
          staff: { with: { user: true, department: true } },
          platform: true,
          lastSyncAdapterRun: true,
          manualOverriddenByStaff: { with: { user: true } },
        },
      });
    }),

  create: requireRole("access", "create")
    .input(registryCreateInput)
    .handler(async ({ input, context }) => {
      if (!isManagerOrAdmin(context.userRole)) {
        throw new ORPCError("FORBIDDEN");
      }

      const [created] = await db
        .insert(serviceAccessRegistry)
        .values({
          staffId: input.staffId,
          platformId: input.platformId,
          accountUsername: input.accountUsername ?? null,
          accountType: input.accountType ?? null,
          accountActive: input.accountActive ?? true,
          privilegeLevel: input.privilegeLevel ?? null,
          privilegeGroups: input.privilegeGroups ?? [],
          privilegeCustomNotes: input.privilegeCustomNotes ?? null,
          usernameSource: "manual",
          accountTypeSource: "manual",
          privilegeSource: "manual",
          groupsSource: "manual",
          createdBy: context.session.user.id,
          updatedBy: context.session.user.id,
        })
        .returning();

      if (!created) throw new ORPCError("INTERNAL_SERVER_ERROR");

      const hydrated = await loadRegistryRow(created.id);

      await logAudit({
        actorId: context.session.user.id,
        actorName: context.session.user.name,
        actorRole: context.userRole ?? undefined,
        action: "access.registry.create",
        module: "access",
        resourceType: "service_access_registry",
        resourceId: created.id,
        afterValue: created as Record<string, unknown>,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
        correlationId: context.requestId,
      });

      return hydrated ?? created;
    }),

  update: requireRole("access", "update")
    .input(registryUpdateInput)
    .handler(async ({ input, context }) => {
      if (!isManagerOrAdmin(context.userRole)) {
        throw new ORPCError("FORBIDDEN");
      }

      const before = await loadRegistryRow(input.id);
      if (!before) throw new ORPCError("NOT_FOUND");

      if (requiresManualOverride(before, input) && !input.manualOverrideReason) {
        throw new ORPCError("BAD_REQUEST", {
          message: "manualOverrideReason is required when changing synced fields.",
        });
      }

      const nextValues: Record<string, unknown> = {
        updatedBy: context.session.user.id,
        updatedAt: new Date(),
      };

      const overridesNeeded = requiresManualOverride(before, input);
      if (input.staffId !== undefined) nextValues.staffId = input.staffId;
      if (input.platformId !== undefined) nextValues.platformId = input.platformId;
      if (input.accountUsername !== undefined) nextValues.accountUsername = input.accountUsername;
      if (input.accountType !== undefined) nextValues.accountType = input.accountType;
      if (input.accountActive !== undefined) nextValues.accountActive = input.accountActive;
      if (input.privilegeLevel !== undefined) nextValues.privilegeLevel = input.privilegeLevel;
      if (input.privilegeGroups !== undefined) nextValues.privilegeGroups = input.privilegeGroups;
      if (input.privilegeCustomNotes !== undefined) nextValues.privilegeCustomNotes = input.privilegeCustomNotes;

      if (overridesNeeded) {
        nextValues.manualOverrideReason = input.manualOverrideReason ?? null;
        nextValues.manualOverriddenAt = new Date();
        nextValues.manualOverriddenBy = context.session.user.id;
        if (input.accountUsername !== undefined && before.usernameSource !== "manual") {
          nextValues.usernameSource = "hybrid_verified";
        }
        if (input.accountType !== undefined && before.accountTypeSource !== "manual") {
          nextValues.accountTypeSource = "hybrid_verified";
        }
        if (input.privilegeLevel !== undefined && before.privilegeSource !== "manual") {
          nextValues.privilegeSource = "hybrid_verified";
        }
        if (input.privilegeGroups !== undefined && before.groupsSource !== "manual") {
          nextValues.groupsSource = "hybrid_verified";
        }
      }

      const [updated] = await db
        .update(serviceAccessRegistry)
        .set(nextValues)
        .where(eq(serviceAccessRegistry.id, input.id))
        .returning();
      if (!updated) throw new ORPCError("INTERNAL_SERVER_ERROR");

      const hydrated = await loadRegistryRow(updated.id);

      await logAudit({
        actorId: context.session.user.id,
        actorName: context.session.user.name,
        actorRole: context.userRole ?? undefined,
        action: "access.registry.update",
        module: "access",
        resourceType: "service_access_registry",
        resourceId: input.id,
        beforeValue: before as Record<string, unknown>,
        afterValue: updated as Record<string, unknown>,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
        correlationId: context.requestId,
      });

      return hydrated ?? updated;
    }),

  delete: requireRole("access", "delete")
    .input(z.object({ id: z.string().min(1) }))
    .handler(async ({ input, context }) => {
      if (context.userRole !== "admin") {
        throw new ORPCError("FORBIDDEN");
      }

      const before = await loadRegistryRow(input.id);
      if (!before) throw new ORPCError("NOT_FOUND");

      await db.delete(serviceAccessRegistry).where(eq(serviceAccessRegistry.id, input.id));

      await logAudit({
        actorId: context.session.user.id,
        actorName: context.session.user.name,
        actorRole: context.userRole ?? undefined,
        action: "access.registry.delete",
        module: "access",
        resourceType: "service_access_registry",
        resourceId: input.id,
        beforeValue: before as Record<string, unknown>,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
        correlationId: context.requestId,
      });

      return before;
    }),
};
