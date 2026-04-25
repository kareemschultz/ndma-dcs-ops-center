import { ORPCError } from "@orpc/server";
import { and, eq, inArray, ne } from "drizzle-orm";
import { z } from "zod";

import {
  db,
  departmentAssignments,
  departmentAssignmentHistory,
  departments,
  staffProfiles,
} from "@ndma-dcs-staff-portal/db";

import { requireRole } from "../index";
import { logAudit } from "../lib/audit";

const assignmentRoleSchema = z.enum([
  "manager",
  "pa",
  "team_lead",
  "supervisor",
]);

async function fetchAssignment(id: string) {
  return db.query.departmentAssignments.findFirst({
    where: eq(departmentAssignments.id, id),
    with: {
      staffProfile: {
        with: {
          user: true,
          department: true,
        },
      },
      department: true,
      assignedBy: true,
      endedBy: true,
      history: {
        orderBy: (table, { desc }) => [desc(table.createdAt)],
      },
    },
  });
}

async function appendHistory(params: {
  departmentAssignmentId: string;
  action: "created" | "updated" | "deactivated" | "reactivated";
  beforeValue?: Record<string, unknown> | null;
  afterValue?: Record<string, unknown> | null;
  changedById?: string | null;
  note?: string | null;
}) {
  await db.insert(departmentAssignmentHistory).values({
    departmentAssignmentId: params.departmentAssignmentId,
    action: params.action,
    beforeValue: params.beforeValue ? JSON.stringify(params.beforeValue) : null,
    afterValue: params.afterValue ? JSON.stringify(params.afterValue) : null,
    changedById: params.changedById ?? null,
    note: params.note ?? null,
  });
}

export const departmentAssignmentsRouter = {
  list: requireRole("department_assignment", "read").handler(async () => {
    return db.query.departmentAssignments.findMany({
      with: {
        staffProfile: {
          with: {
            user: true,
            department: true,
          },
        },
        department: true,
        assignedBy: true,
        endedBy: true,
      },
      orderBy: (table, { desc }) => [desc(table.createdAt)],
    });
  }),

  get: requireRole("department_assignment", "read")
    .input(z.object({ id: z.string().min(1) }))
    .handler(async ({ input }) => {
      const assignment = await fetchAssignment(input.id);
      if (!assignment) {
        throw new ORPCError("NOT_FOUND");
      }

      return assignment;
    }),

  history: requireRole("department_assignment", "read")
    .input(
      z.object({
        assignmentId: z.string().optional(),
        staffProfileId: z.string().optional(),
      }),
    )
    .handler(async ({ input }) => {
      const filters = [];
      if (input.assignmentId) {
        filters.push(
          eq(departmentAssignmentHistory.departmentAssignmentId, input.assignmentId),
        );
      }
      if (input.staffProfileId) {
        const assignmentIds = await db
          .select({ id: departmentAssignments.id })
          .from(departmentAssignments)
          .where(eq(departmentAssignments.staffProfileId, input.staffProfileId));

        if (assignmentIds.length === 0) {
          return [];
        }

        filters.push(
          inArray(
            departmentAssignmentHistory.departmentAssignmentId,
            assignmentIds.map((row) => row.id),
          ),
        );
      }

      return db.query.departmentAssignmentHistory.findMany({
        where: filters.length > 0 ? and(...filters) : undefined,
        with: {
          departmentAssignment: {
            with: {
              staffProfile: {
                with: {
                  user: true,
                  department: true,
                },
              },
              department: true,
            },
          },
          changedBy: true,
        },
        orderBy: (table, { desc }) => [desc(table.createdAt)],
      });
    }),

  create: requireRole("department_assignment", "create")
    .input(
      z.object({
        staffProfileId: z.string().min(1),
        departmentId: z.string().min(1),
        role: assignmentRoleSchema,
        note: z.string().optional(),
        isActive: z.boolean().default(true),
      }),
    )
    .handler(async ({ input, context }) => {
      const staffProfile = await db.query.staffProfiles.findFirst({
        where: eq(staffProfiles.id, input.staffProfileId),
      });
      if (!staffProfile) {
        throw new ORPCError("NOT_FOUND", { message: "Staff profile not found." });
      }

      const department = await db.query.departments.findFirst({
        where: eq(departments.id, input.departmentId),
      });
      if (!department) {
        throw new ORPCError("NOT_FOUND", { message: "Department not found." });
      }

      const existing = await db.query.departmentAssignments.findFirst({
        where: and(
          eq(departmentAssignments.staffProfileId, input.staffProfileId),
          eq(departmentAssignments.departmentId, input.departmentId),
          eq(departmentAssignments.role, input.role),
        ),
      });
      if (existing) {
        throw new ORPCError("CONFLICT", {
          message: "Department assignment already exists for this staff/department/role.",
        });
      }

      const [created] = await db
        .insert(departmentAssignments)
        .values({
          staffProfileId: input.staffProfileId,
          departmentId: input.departmentId,
          role: input.role,
          isActive: input.isActive,
          assignedAt: new Date(),
          assignedById: context.session.user.id,
          note: input.note ?? null,
        })
        .returning();

      if (!created) {
        throw new ORPCError("INTERNAL_SERVER_ERROR");
      }

      await appendHistory({
        departmentAssignmentId: created.id,
        action: "created",
        afterValue: created as Record<string, unknown>,
        changedById: context.session.user.id,
        note: input.note ?? null,
      });

      await logAudit({
        actorId: context.session.user.id,
        actorName: context.session.user.name,
        actorRole: context.userRole ?? undefined,
        action: "department_assignment.create",
        module: "staff",
        resourceType: "department_assignment",
        resourceId: created.id,
        afterValue: created as Record<string, unknown>,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
        correlationId: context.requestId,
      });

      return fetchAssignment(created.id);
    }),

  update: requireRole("department_assignment", "update")
    .input(
      z.object({
        id: z.string().min(1),
        staffProfileId: z.string().optional(),
        departmentId: z.string().optional(),
        role: assignmentRoleSchema.optional(),
        isActive: z.boolean().optional(),
        note: z.string().optional(),
      }),
    )
    .handler(async ({ input, context }) => {
      const before = await db.query.departmentAssignments.findFirst({
        where: eq(departmentAssignments.id, input.id),
      });
      if (!before) {
        throw new ORPCError("NOT_FOUND");
      }

      const nextStaffProfileId = input.staffProfileId ?? before.staffProfileId;
      const nextDepartmentId = input.departmentId ?? before.departmentId;
      const nextRole = input.role ?? before.role;

      if (nextStaffProfileId !== before.staffProfileId || nextDepartmentId !== before.departmentId || nextRole !== before.role) {
        const conflicting = await db.query.departmentAssignments.findFirst({
          where: and(
            ne(departmentAssignments.id, before.id),
            eq(departmentAssignments.staffProfileId, nextStaffProfileId),
            eq(departmentAssignments.departmentId, nextDepartmentId),
            eq(departmentAssignments.role, nextRole),
          ),
        });
        if (conflicting) {
          throw new ORPCError("CONFLICT", {
            message: "Another assignment already exists for this staff/department/role combination.",
          });
        }
      }

      const isActive = input.isActive ?? before.isActive;
      const [updated] = await db
        .update(departmentAssignments)
        .set({
          staffProfileId: nextStaffProfileId,
          departmentId: nextDepartmentId,
          role: nextRole,
          isActive,
          endedAt: isActive ? null : before.endedAt ?? new Date(),
          endedById: isActive ? null : context.session.user.id,
          note: input.note ?? before.note,
          updatedAt: new Date(),
        })
        .where(eq(departmentAssignments.id, before.id))
        .returning();

      if (!updated) {
        throw new ORPCError("INTERNAL_SERVER_ERROR");
      }

      await appendHistory({
        departmentAssignmentId: updated.id,
        action: isActive && !before.isActive ? "reactivated" : "updated",
        beforeValue: before as Record<string, unknown>,
        afterValue: updated as Record<string, unknown>,
        changedById: context.session.user.id,
        note: input.note ?? null,
      });

      await logAudit({
        actorId: context.session.user.id,
        actorName: context.session.user.name,
        actorRole: context.userRole ?? undefined,
        action: "department_assignment.update",
        module: "staff",
        resourceType: "department_assignment",
        resourceId: updated.id,
        beforeValue: before as Record<string, unknown>,
        afterValue: updated as Record<string, unknown>,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
        correlationId: context.requestId,
      });

      return fetchAssignment(updated.id);
    }),

  deactivate: requireRole("department_assignment", "delete")
    .input(z.object({ id: z.string().min(1), note: z.string().optional() }))
    .handler(async ({ input, context }) => {
      const before = await db.query.departmentAssignments.findFirst({
        where: eq(departmentAssignments.id, input.id),
      });
      if (!before) {
        throw new ORPCError("NOT_FOUND");
      }

      const [updated] = await db
        .update(departmentAssignments)
        .set({
          isActive: false,
          endedAt: before.endedAt ?? new Date(),
          endedById: context.session.user.id,
          note: input.note ?? before.note,
          updatedAt: new Date(),
        })
        .where(eq(departmentAssignments.id, before.id))
        .returning();

      if (!updated) {
        throw new ORPCError("INTERNAL_SERVER_ERROR");
      }

      await appendHistory({
        departmentAssignmentId: updated.id,
        action: "deactivated",
        beforeValue: before as Record<string, unknown>,
        afterValue: updated as Record<string, unknown>,
        changedById: context.session.user.id,
        note: input.note ?? null,
      });

      await logAudit({
        actorId: context.session.user.id,
        actorName: context.session.user.name,
        actorRole: context.userRole ?? undefined,
        action: "department_assignment.deactivate",
        module: "staff",
        resourceType: "department_assignment",
        resourceId: updated.id,
        beforeValue: before as Record<string, unknown>,
        afterValue: updated as Record<string, unknown>,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
        correlationId: context.requestId,
      });

      return fetchAssignment(updated.id);
    }),
};
