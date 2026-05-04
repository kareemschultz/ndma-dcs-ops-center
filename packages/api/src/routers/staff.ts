import { ORPCError } from "@orpc/server";
import { z } from "zod";
import { db, staffProfiles, departments } from "@ndma-dcs-staff-portal/db";
import { and, desc, eq, inArray } from "drizzle-orm";

import { protectedProcedure, requireRole } from "../index";
import { logAudit } from "../lib/audit";
import { getTeamStaffIds } from "../lib/team";
import {
  canAccessStaffPrivate,
  getDirectReports,
  getCallerStaffProfile,
} from "../lib/scope";

export const staffRouter = {
  list: requireRole("staff", "read")
    .input(
      z.object({
        departmentId: z.string().optional(),
        team: z.enum(["DCS", "NOC"]).optional(),
        status: z
          .enum(["active", "inactive", "on_leave", "terminated"])
          .optional(),
        limit: z.number().min(1).max(200).default(100),
        offset: z.number().min(0).default(0),
      }),
    )
    .handler(async ({ input }) => {
      const conditions = [];
      if (input.status) conditions.push(eq(staffProfiles.status, input.status));
      if (input.departmentId)
        conditions.push(eq(staffProfiles.departmentId, input.departmentId));
      if (input.team) {
        const teamStaffIds = await getTeamStaffIds(input.team);
        if (teamStaffIds.length === 0) return [];
        conditions.push(inArray(staffProfiles.id, teamStaffIds));
      }

      return db.query.staffProfiles.findMany({
        where: conditions.length > 0 ? and(...conditions) : undefined,
        orderBy: desc(staffProfiles.createdAt),
        limit: input.limit,
        offset: input.offset,
        with: { user: true, department: true },
      });
    }),

  get: requireRole("staff", "read")
    .input(z.object({ id: z.string() }))
    .handler(async ({ input }) => {
      const profile = await db.query.staffProfiles.findFirst({
        where: eq(staffProfiles.id, input.id),
        with: { user: true, department: true },
      });
      if (!profile) throw new ORPCError("NOT_FOUND");
      return profile;
    }),

  create: requireRole("staff", "create")
    .input(
      z.object({
        userId: z.string(),
        employeeId: z.string().min(1),
        departmentId: z.string(),
        role: z.enum(["Staff", "Team_Lead", "Manager", "PA", "Admin"]).default("Staff"),
        jobTitle: z.string().min(1),
        employmentType: z
          .enum(["full_time", "part_time", "contract", "temporary"])
          .default("full_time"),
        startDate: z.string(), // ISO date string
        phoneNumber: z.string().optional(),
        reportsTo: z.string().optional(),
        emergencyContacts: z.array(
          z.object({
            name: z.string().min(1),
            phone: z.string().min(1),
            relation: z.string().optional(),
          }),
        ).optional(),
        isTeamLead: z.boolean().default(false),
        isLeadEngineerEligible: z.boolean().default(false),
        isOnCallEligible: z.boolean().default(true),
      }),
    )
    .handler(async ({ input, context }) => {
      const profileRows = await db
        .insert(staffProfiles)
        .values({
          ...input,
          startDate: new Date(input.startDate),
        })
        .returning();
      const profile = profileRows[0];
      if (!profile) throw new ORPCError("INTERNAL_SERVER_ERROR");

      await logAudit({
        actorId: context.session.user.id,
        actorName: context.session.user.name,
        action: "staff.create",
        module: "staff",
        resourceType: "staff_profile",
        resourceId: profile.id,
        afterValue: profile as Record<string, unknown>,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
        actorRole: context.userRole ?? undefined,
        correlationId: context.requestId,
      });

      return profile;
    }),

  update: requireRole("staff", "update")
    .input(
      z.object({
        id: z.string(),
        departmentId: z.string().optional(),
        role: z.enum(["Staff", "Team_Lead", "Manager", "PA", "Admin"]).optional(),
        jobTitle: z.string().min(1).optional(),
        employmentType: z
          .enum(["full_time", "part_time", "contract", "temporary"])
          .optional(),
        phoneNumber: z.string().optional(),
        reportsTo: z.string().nullable().optional(),
        emergencyContacts: z.array(
          z.object({
            name: z.string().min(1),
            phone: z.string().min(1),
            relation: z.string().optional(),
          }),
        ).optional(),
        status: z
          .enum(["active", "inactive", "on_leave", "terminated"])
          .optional(),
        isTeamLead: z.boolean().optional(),
        isLeadEngineerEligible: z.boolean().optional(),
        isOnCallEligible: z.boolean().optional(),
      }),
    )
    .handler(async ({ input, context }) => {
      const { id, ...updates } = input;
      const before = await db.query.staffProfiles.findFirst({
        where: eq(staffProfiles.id, id),
      });
      if (!before) throw new ORPCError("NOT_FOUND");

      const updatedRows = await db
        .update(staffProfiles)
        .set(updates)
        .where(eq(staffProfiles.id, id))
        .returning();
      const updated = updatedRows[0];

      await logAudit({
        actorId: context.session.user.id,
        actorName: context.session.user.name,
        action: "staff.update",
        module: "staff",
        resourceType: "staff_profile",
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

  deactivate: requireRole("staff", "delete")
    .input(z.object({ id: z.string() }))
    .handler(async ({ input, context }) => {
      const before = await db.query.staffProfiles.findFirst({
        where: eq(staffProfiles.id, input.id),
      });
      if (!before) throw new ORPCError("NOT_FOUND");

      const updatedRows = await db
        .update(staffProfiles)
        .set({ status: "terminated" })
        .where(eq(staffProfiles.id, input.id))
        .returning();
      const updated = updatedRows[0];

      await logAudit({
        actorId: context.session.user.id,
        actorName: context.session.user.name,
        action: "staff.deactivate",
        module: "staff",
        resourceType: "staff_profile",
        resourceId: input.id,
        beforeValue: { status: before.status },
        afterValue: { status: "terminated" },
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
        actorRole: context.userRole ?? undefined,
        correlationId: context.requestId,
      });

      return updated;
    }),

  setTeamLead: requireRole("staff", "update")
    .input(
      z.object({
        id: z.string(),
        teamLeadId: z.string().nullable(),
      }),
    )
    .handler(async ({ input, context }) => {
      if (
        !["manager", "hrAdminOps", "admin"].includes(
          context.userRole ?? "",
        )
      ) {
        throw new ORPCError("FORBIDDEN", {
          message: "Only managers and HR/admin can reassign team leads.",
        });
      }

      const before = await db.query.staffProfiles.findFirst({
        where: eq(staffProfiles.id, input.id),
      });
      if (!before) throw new ORPCError("NOT_FOUND");

      if (input.teamLeadId === before.id) {
        throw new ORPCError("CONFLICT", {
          message: "A staff member cannot report to themselves.",
        });
      }

      if (input.teamLeadId) {
        const lead = await db.query.staffProfiles.findFirst({
          where: eq(staffProfiles.id, input.teamLeadId),
        });
        if (!lead) {
          throw new ORPCError("NOT_FOUND", {
            message: "Team lead staff profile not found.",
          });
        }
      }

      const updatedRows = await db
        .update(staffProfiles)
        .set({
          reportsTo: input.teamLeadId,
          updatedAt: new Date(),
        })
        .where(eq(staffProfiles.id, input.id))
        .returning();
      const updated = updatedRows[0];

      if (!updated) {
        throw new ORPCError("INTERNAL_SERVER_ERROR");
      }

      await logAudit({
        actorId: context.session.user.id,
        actorName: context.session.user.name,
        action: "staff.team_lead.update",
        module: "staff",
        resourceType: "staff_profile",
        resourceId: input.id,
        beforeValue: before as Record<string, unknown>,
        afterValue: updated as Record<string, unknown>,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
        actorRole: context.userRole ?? undefined,
        correlationId: context.requestId,
      });

      return updated;
    }),

  canAccessPrivate: requireRole("staff", "read")
    .input(z.object({ staffProfileId: z.string().min(1) }))
    .handler(async ({ input, context }) => {
      return {
        allowed: await canAccessStaffPrivate(context, input.staffProfileId),
      };
    }),

  me: protectedProcedure.handler(async ({ context }) => {
    const profile = await getCallerStaffProfile(context);
    return profile ?? null;
  }),

  updateSelf: protectedProcedure
    .input(
      z.object({
        // Master plan §6.5 — staff can self-edit these contact fields
        phoneNumber: z.string().optional(),
        cugPhoneNumber: z.string().optional(),
        cugSimNumber: z.string().optional(),
        mifiAssetTag: z.string().optional(),
        emergencyContacts: z.array(
          z.object({
            name: z.string().min(1),
            phone: z.string().min(1),
            relation: z.string().optional(),
          }),
        ).optional(),
      }),
    )
    .handler(async ({ input, context }) => {
      const caller = await getCallerStaffProfile(context);
      if (!caller) throw new ORPCError("NOT_FOUND");

      const before = await db.query.staffProfiles.findFirst({
        where: eq(staffProfiles.id, caller.id),
      });
      if (!before) throw new ORPCError("NOT_FOUND");

      const [updated] = await db
        .update(staffProfiles)
        .set({
          phoneNumber: input.phoneNumber ?? before.phoneNumber,
          cugPhoneNumber: input.cugPhoneNumber ?? before.cugPhoneNumber,
          cugSimNumber: input.cugSimNumber ?? before.cugSimNumber,
          mifiAssetTag: input.mifiAssetTag ?? before.mifiAssetTag,
          emergencyContacts: input.emergencyContacts ?? before.emergencyContacts,
        })
        .where(eq(staffProfiles.id, caller.id))
        .returning();
      if (!updated) throw new ORPCError("INTERNAL_SERVER_ERROR");

      await logAudit({
        actorId: context.session.user.id,
        actorName: context.session.user.name,
        action: "staff.self_update",
        module: "staff",
        resourceType: "staff_profile",
        resourceId: caller.id,
        beforeValue: before as Record<string, unknown>,
        afterValue: updated as Record<string, unknown>,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
        actorRole: context.userRole ?? undefined,
        correlationId: context.requestId,
      });

      return updated;
    }),

  getMyDirectReports: requireRole("staff", "read").handler(async ({ context }) => {
    const caller = await getCallerStaffProfile(context);
    if (!caller) {
      return [];
    }

    return getDirectReports(context);
  }),

  getDepartments: protectedProcedure.handler(async () => {
    return db.query.departments.findMany({
      where: eq(departments.isActive, true),
    });
  }),
};
