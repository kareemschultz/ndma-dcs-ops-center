import { ORPCError } from "@orpc/server";
import { z } from "zod";
import {
  db,
  workItems,
  workItemComments,
  workItemWeeklyUpdates,
  workInitiatives,
  workItemDependencies,
  workItemTemplates,
  workItemAssignees,
  workItemTeamAllocations,
  staffProfiles,
} from "@ndma-dcs-staff-portal/db";
import { and, desc, eq, lt, sql, isNotNull } from "drizzle-orm";

import { protectedProcedure, requireRole } from "../index";
import { logAudit } from "../lib/audit";
import { createNotification } from "../lib/notify";

// ── Input Schemas ──────────────────────────────────────────────────────────

const WorkItemTypeSchema = z.enum([
  "routine",
  "project",
  "external_request",
  "ad_hoc",
]);

const WorkItemStatusSchema = z.enum([
  "backlog",
  "todo",
  "in_progress",
  "blocked",
  "review",
  "done",
  "cancelled",
]);

const WorkItemPrioritySchema = z.enum(["low", "medium", "high", "critical"]);

const CreateWorkItemInput = z.object({
  title: z.string().min(1).max(200),
  description: z.string().optional(),
  type: WorkItemTypeSchema.default("routine"),
  priority: WorkItemPrioritySchema.default("medium"),
  assignedToId: z.string().optional(),
  contributorIds: z.array(z.string()).optional(),
  teamAllocations: z.array(z.object({
    departmentId: z.string(),
    requiredCount: z.number().int().positive(),
  })).optional(),
  departmentId: z.string().optional(),
  requesterName: z.string().optional(),
  requesterEmail: z.string().email().optional(),
  sourceSystem: z.string().optional(),
  sourceReference: z.string().optional(),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  estimatedHours: z.string().optional(),
});

const UpdateWorkItemInput = z.object({
  id: z.string(),
  title: z.string().min(1).max(200).optional(),
  description: z.string().optional(),
  type: WorkItemTypeSchema.optional(),
  status: WorkItemStatusSchema.optional(),
  priority: WorkItemPrioritySchema.optional(),
  departmentId: z.string().optional(),
  requesterName: z.string().optional(),
  requesterEmail: z.string().email().optional(),
  sourceSystem: z.string().optional(),
  sourceReference: z.string().optional(),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  estimatedHours: z.string().optional(),
});

const ListWorkItemsInput = z.object({
  status: WorkItemStatusSchema.optional(),
  type: WorkItemTypeSchema.optional(),
  priority: WorkItemPrioritySchema.optional(),
  assignedToId: z.string().optional(),
  departmentId: z.string().optional(),
  overdueOnly: z.boolean().optional(),
  year: z.number().int().optional(),
  period: z.string().optional(),
  weekStartDate: z.string().optional(),
  limit: z.number().min(1).max(200).default(50),
  offset: z.number().min(0).default(0),
});

const AddCommentInput = z.object({
  workItemId: z.string(),
  body: z.string().min(1),
});

const AddWeeklyUpdateInput = z.object({
  workItemId: z.string(),
  weekStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Must be YYYY-MM-DD"),
  statusSummary: z.string().min(1),
  blockers: z.string().optional(),
  nextSteps: z.string().optional(),
});

// ── Router ─────────────────────────────────────────────────────────────────

export const workRouter = {
  list: protectedProcedure
    .input(ListWorkItemsInput)
    .handler(async ({ input }) => {
      const conditions = [];
      const today = new Date().toISOString().slice(0, 10);

      if (input.status) conditions.push(eq(workItems.status, input.status));
      if (input.type) conditions.push(eq(workItems.type, input.type));
      if (input.priority) conditions.push(eq(workItems.priority, input.priority));
      if (input.assignedToId)
        conditions.push(eq(workItems.assignedToId, input.assignedToId));
      if (input.departmentId)
        conditions.push(eq(workItems.departmentId, input.departmentId));
      if (input.overdueOnly) {
        conditions.push(
          and(
            isNotNull(workItems.dueDate),
            lt(workItems.dueDate, today),
            sql`${workItems.status} NOT IN ('done', 'cancelled')`,
          )!,
        );
      }
      if (input.year) conditions.push(eq(workItems.year, input.year));
      if (input.period) conditions.push(eq(workItems.period, input.period));
      if (input.weekStartDate) conditions.push(eq(workItems.weekStartDate, input.weekStartDate));

      return db.query.workItems.findMany({
        where: conditions.length > 0 ? and(...conditions) : undefined,
        orderBy: [desc(workItems.updatedAt)],
        limit: input.limit,
        offset: input.offset,
        with: {
          assignedTo: { with: { user: true } },
          assignees: { with: { staffProfile: { with: { user: true, department: true } } } },
          teamAllocations: { with: { department: true } },
          department: true,
          createdBy: true,
        },
      });
    }),

  get: protectedProcedure
    .input(z.object({ id: z.string() }))
    .handler(async ({ input }) => {
      const item = await db.query.workItems.findFirst({
        where: eq(workItems.id, input.id),
        with: {
          assignedTo: { with: { user: true } },
          assignees: { with: { staffProfile: { with: { user: true, department: true } } } },
          teamAllocations: { with: { department: true } },
          department: true,
          createdBy: true,
          comments: {
            with: { author: true },
            orderBy: desc(workItemComments.createdAt),
          },
          weeklyUpdates: {
            with: { author: true },
            orderBy: desc(workItemWeeklyUpdates.weekStart),
          },
        },
      });
      if (!item) throw new ORPCError("NOT_FOUND", { message: "Work item not found" });
      return item;
    }),

  create: requireRole("work", "create")
    .input(CreateWorkItemInput)
    .handler(async ({ input, context }) => {
      const { contributorIds, teamAllocations: allocInput, ...itemFields } = input;

      const [item] = await db
        .insert(workItems)
        .values({
          ...itemFields,
          dueDate: input.dueDate ?? null,
          createdById: context.session.user.id,
        })
        .returning();

      if (!item) throw new ORPCError("INTERNAL_SERVER_ERROR");

      // Insert contributors (many-to-many assignees)
      if (contributorIds && contributorIds.length > 0) {
        await db.insert(workItemAssignees).values(
          contributorIds.map((staffProfileId) => ({
            workItemId: item.id,
            staffProfileId,
            addedById: context.session.user.id,
          })),
        ).onConflictDoNothing();
      }

      // Insert team allocations
      if (allocInput && allocInput.length > 0) {
        await db.insert(workItemTeamAllocations).values(
          allocInput.map((a) => ({
            workItemId: item.id,
            departmentId: a.departmentId,
            requiredCount: a.requiredCount,
            addedById: context.session.user.id,
          })),
        ).onConflictDoNothing();
      }

      await logAudit({
        actorId: context.session.user.id,
        actorName: context.session.user.name,
        action: "work_item.create",
        module: "work",
        resourceType: "work_item",
        resourceId: item.id,
        afterValue: item as Record<string, unknown>,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
        actorRole: context.userRole ?? undefined,
        correlationId: context.requestId,
      });

      // Notify primary assignee if set
      if (item.assignedToId) {
        const profile = await db.query.staffProfiles.findFirst({
          where: eq(staffProfiles.id, item.assignedToId),
        });
        if (profile) {
          await createNotification({
            recipientId: profile.userId,
            title: "Work item assigned to you",
            body: item.title,
            module: "work",
            resourceType: "work_item",
            resourceId: item.id,
            linkUrl: `/work/${item.id}`,
          });
        }
      }

      return item;
    }),

  update: requireRole("work", "update")
    .input(UpdateWorkItemInput)
    .handler(async ({ input, context }) => {
      const { id, ...updates } = input;

      const before = await db.query.workItems.findFirst({
        where: eq(workItems.id, id),
      });
      if (!before) throw new ORPCError("NOT_FOUND");

      // Auto-manage completedAt based on status transitions
      const completedAtPatch: { completedAt?: Date | null } = {};
      if (updates.status === "done" && before.status !== "done") {
        completedAtPatch.completedAt = new Date();
      } else if (updates.status && updates.status !== "done" && before.status === "done") {
        completedAtPatch.completedAt = null; // Clear when reopening a completed item
      }

      const [updated] = await db
        .update(workItems)
        .set({ ...updates, ...completedAtPatch })
        .where(eq(workItems.id, id))
        .returning();

      await logAudit({
        actorId: context.session.user.id,
        actorName: context.session.user.name,
        action: "work_item.update",
        module: "work",
        resourceType: "work_item",
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

  // Soft-archive: cancel a non-draft work item (audit-preserving).
  archive: requireRole("work", "update")
    .input(z.object({ id: z.string() }))
    .handler(async ({ input, context }) => {
      const before = await db.query.workItems.findFirst({
        where: eq(workItems.id, input.id),
      });
      if (!before) throw new ORPCError("NOT_FOUND");
      if (before.status === "cancelled")
        throw new ORPCError("CONFLICT", { message: "Work item is already cancelled" });

      const [updated] = await db
        .update(workItems)
        .set({ status: "cancelled" })
        .where(eq(workItems.id, input.id))
        .returning();

      await logAudit({
        actorId: context.session.user.id,
        actorName: context.session.user.name,
        action: "work_item.archive",
        module: "work",
        resourceType: "work_item",
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

  // Hard delete: only permitted for transient draft/backlog items.
  delete: requireRole("work", "update")
    .input(z.object({ id: z.string() }))
    .handler(async ({ input, context }) => {
      const before = await db.query.workItems.findFirst({
        where: eq(workItems.id, input.id),
      });
      if (!before) throw new ORPCError("NOT_FOUND");
      if (before.status !== "backlog" && before.status !== "todo") {
        throw new ORPCError("CONFLICT", {
          message:
            "Only backlog or to-do work items can be deleted. Archive (cancel) items that are already in progress.",
        });
      }

      await db.delete(workItems).where(eq(workItems.id, input.id));

      await logAudit({
        actorId: context.session.user.id,
        actorName: context.session.user.name,
        action: "work_item.delete",
        module: "work",
        resourceType: "work_item",
        resourceId: input.id,
        beforeValue: before as Record<string, unknown>,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
        actorRole: context.userRole ?? undefined,
        correlationId: context.requestId,
      });

      return { success: true };
    }),

  assign: requireRole("work", "assign")
    .input(z.object({ id: z.string(), staffProfileId: z.string() }))
    .handler(async ({ input, context }) => {
      const before = await db.query.workItems.findFirst({
        where: eq(workItems.id, input.id),
      });
      if (!before) throw new ORPCError("NOT_FOUND");

      const [updated] = await db
        .update(workItems)
        .set({ assignedToId: input.staffProfileId })
        .where(eq(workItems.id, input.id))
        .returning();

      if (!updated) throw new ORPCError("INTERNAL_SERVER_ERROR");

      await logAudit({
        actorId: context.session.user.id,
        actorName: context.session.user.name,
        action: "work_item.assign",
        module: "work",
        resourceType: "work_item",
        resourceId: input.id,
        beforeValue: { assignedToId: before.assignedToId },
        afterValue: { assignedToId: input.staffProfileId },
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
        actorRole: context.userRole ?? undefined,
        correlationId: context.requestId,
      });

      // Notify the new assignee
      const profile = await db.query.staffProfiles.findFirst({
        where: eq(staffProfiles.id, input.staffProfileId),
      });
      if (profile) {
        await createNotification({
          recipientId: profile.userId,
          title: "Work item assigned to you",
          body: updated.title,
          module: "work",
          resourceType: "work_item",
          resourceId: input.id,
          linkUrl: `/work/${input.id}`,
        });
      }

      return updated;
    }),

  addComment: requireRole("work", "update")
    .input(AddCommentInput)
    .handler(async ({ input, context }) => {
      const exists = await db.query.workItems.findFirst({
        where: eq(workItems.id, input.workItemId),
      });
      if (!exists) throw new ORPCError("NOT_FOUND");

      const [comment] = await db
        .insert(workItemComments)
        .values({
          workItemId: input.workItemId,
          authorId: context.session.user.id,
          body: input.body,
        })
        .returning();

      return comment;
    }),

  addWeeklyUpdate: requireRole("work", "update")
    .input(AddWeeklyUpdateInput)
    .handler(async ({ input, context }) => {
      const exists = await db.query.workItems.findFirst({
        where: eq(workItems.id, input.workItemId),
      });
      if (!exists) throw new ORPCError("NOT_FOUND");

      // Upsert — one update per work item per week
      const [update] = await db
        .insert(workItemWeeklyUpdates)
        .values({
          workItemId: input.workItemId,
          authorId: context.session.user.id,
          weekStart: input.weekStart,
          statusSummary: input.statusSummary,
          blockers: input.blockers ?? null,
          nextSteps: input.nextSteps ?? null,
        })
        .onConflictDoUpdate({
          target: [
            workItemWeeklyUpdates.workItemId,
            workItemWeeklyUpdates.weekStart,
          ],
          set: {
            statusSummary: input.statusSummary,
            blockers: input.blockers ?? null,
            nextSteps: input.nextSteps ?? null,
            authorId: context.session.user.id,
          },
        })
        .returning();

      return update;
    }),

  getOverdue: protectedProcedure.handler(async () => {
    const today = new Date().toISOString().slice(0, 10);
    return db.query.workItems.findMany({
      where: and(
        isNotNull(workItems.dueDate),
        lt(workItems.dueDate, today),
        sql`${workItems.status} NOT IN ('done', 'cancelled')`,
      ),
      orderBy: [workItems.dueDate],
      with: {
        assignedTo: { with: { user: true } },
        department: true,
      },
    });
  }),

  getWeeklyReport: protectedProcedure
    .input(z.object({ weekStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }))
    .handler(async ({ input }) => {
      // All weekly updates for the given week, with their parent work item
      const updates = await db.query.workItemWeeklyUpdates.findMany({
        where: eq(workItemWeeklyUpdates.weekStart, input.weekStart),
        orderBy: desc(workItemWeeklyUpdates.createdAt),
        with: {
          workItem: {
            with: {
              assignedTo: { with: { user: true } },
              department: true,
            },
          },
          author: true,
        },
      });
      return updates;
    }),

  stats: protectedProcedure.handler(async () => {
    const today = new Date().toISOString().slice(0, 10);

    const all = await db.query.workItems.findMany({
      columns: { id: true, status: true, type: true, dueDate: true },
    });

    const byStatus: Record<string, number> = {};
    const byType: Record<string, number> = {};
    let overdue = 0;

    for (const item of all) {
      byStatus[item.status] = (byStatus[item.status] ?? 0) + 1;
      byType[item.type] = (byType[item.type] ?? 0) + 1;
      if (
        item.dueDate &&
        item.dueDate < today &&
        item.status !== "done" &&
        item.status !== "cancelled"
      ) {
        overdue++;
      }
    }

    return { total: all.length, byStatus, byType, overdue };
  }),

  // ── Assignees (contributors) ───────────────────────────────────────────────

  assignees: {
    list: protectedProcedure
      .input(z.object({ workItemId: z.string() }))
      .handler(async ({ input }) => {
        return db.query.workItemAssignees.findMany({
          where: eq(workItemAssignees.workItemId, input.workItemId),
          with: {
            staffProfile: { with: { user: true, department: true } },
          },
        });
      }),

    add: requireRole("work", "assign")
      .input(z.object({ workItemId: z.string(), staffProfileId: z.string() }))
      .handler(async ({ input, context }) => {
        const item = await db.query.workItems.findFirst({
          where: eq(workItems.id, input.workItemId),
        });
        if (!item) throw new ORPCError("NOT_FOUND", { message: "Work item not found" });

        const [assignee] = await db
          .insert(workItemAssignees)
          .values({
            workItemId: input.workItemId,
            staffProfileId: input.staffProfileId,
            addedById: context.session.user.id,
          })
          .onConflictDoNothing()
          .returning();

        // Notify the contributor
        const profile = await db.query.staffProfiles.findFirst({
          where: eq(staffProfiles.id, input.staffProfileId),
        });
        if (profile) {
          await createNotification({
            recipientId: profile.userId,
            title: "You've been added to a work item",
            body: item.title,
            module: "work",
            resourceType: "work_item",
            resourceId: input.workItemId,
            linkUrl: `/work/${input.workItemId}`,
          });
        }

        await logAudit({
          actorId: context.session.user.id,
          actorName: context.session.user.name,
          action: "work_item.assignee.add",
          module: "work",
          resourceType: "work_item",
          resourceId: input.workItemId,
          afterValue: { staffProfileId: input.staffProfileId },
          ipAddress: context.ipAddress,
          userAgent: context.userAgent,
          actorRole: context.userRole ?? undefined,
          correlationId: context.requestId,
        });

        return assignee ?? null;
      }),

    remove: requireRole("work", "assign")
      .input(z.object({ workItemId: z.string(), staffProfileId: z.string() }))
      .handler(async ({ input, context }) => {
        await db
          .delete(workItemAssignees)
          .where(
            and(
              eq(workItemAssignees.workItemId, input.workItemId),
              eq(workItemAssignees.staffProfileId, input.staffProfileId),
            ),
          );

        await logAudit({
          actorId: context.session.user.id,
          actorName: context.session.user.name,
          action: "work_item.assignee.remove",
          module: "work",
          resourceType: "work_item",
          resourceId: input.workItemId,
          afterValue: { removedStaffProfileId: input.staffProfileId },
          ipAddress: context.ipAddress,
          userAgent: context.userAgent,
          actorRole: context.userRole ?? undefined,
          correlationId: context.requestId,
        });

        return { success: true };
      }),
  },

  // ── Team Allocations ───────────────────────────────────────────────────────

  teamAllocations: {
    list: protectedProcedure
      .input(z.object({ workItemId: z.string() }))
      .handler(async ({ input }) => {
        return db.query.workItemTeamAllocations.findMany({
          where: eq(workItemTeamAllocations.workItemId, input.workItemId),
          with: { department: true },
        });
      }),

    set: requireRole("work", "assign")
      .input(
        z.object({
          workItemId: z.string(),
          allocations: z.array(
            z.object({
              departmentId: z.string(),
              requiredCount: z.number().int().min(1),
            }),
          ),
        }),
      )
      .handler(async ({ input, context }) => {
        const item = await db.query.workItems.findFirst({
          where: eq(workItems.id, input.workItemId),
        });
        if (!item) throw new ORPCError("NOT_FOUND");

        // Replace all existing allocations atomically
        await db
          .delete(workItemTeamAllocations)
          .where(eq(workItemTeamAllocations.workItemId, input.workItemId));

        const inserted = input.allocations.length > 0
          ? await db.insert(workItemTeamAllocations).values(
              input.allocations.map((a) => ({
                workItemId: input.workItemId,
                departmentId: a.departmentId,
                requiredCount: a.requiredCount,
                addedById: context.session.user.id,
              })),
            ).returning()
          : [];

        await logAudit({
          actorId: context.session.user.id,
          actorName: context.session.user.name,
          action: "work_item.team_allocations.set",
          module: "work",
          resourceType: "work_item",
          resourceId: input.workItemId,
          afterValue: { allocations: input.allocations },
          ipAddress: context.ipAddress,
          userAgent: context.userAgent,
          actorRole: context.userRole ?? undefined,
          correlationId: context.requestId,
        });

        return inserted;
      }),

    remove: requireRole("work", "assign")
      .input(z.object({ workItemId: z.string(), departmentId: z.string() }))
      .handler(async ({ input, context }) => {
        await db
          .delete(workItemTeamAllocations)
          .where(
            and(
              eq(workItemTeamAllocations.workItemId, input.workItemId),
              eq(workItemTeamAllocations.departmentId, input.departmentId),
            ),
          );

        await logAudit({
          actorId: context.session.user.id,
          actorName: context.session.user.name,
          action: "work_item.team_allocation.remove",
          module: "work",
          resourceType: "work_item",
          resourceId: input.workItemId,
          afterValue: { removedDepartmentId: input.departmentId },
          ipAddress: context.ipAddress,
          userAgent: context.userAgent,
          actorRole: context.userRole ?? undefined,
          correlationId: context.requestId,
        });

        return { success: true };
      }),
  },

  // ── Initiatives ────────────────────────────────────────────────────────────

  initiatives: {
    list: protectedProcedure
      .input(
        z.object({
          departmentId: z.string().optional(),
          status: z.enum(["active", "completed", "cancelled"]).optional(),
        }),
      )
      .handler(async ({ input }) => {
        const conditions = [];
        if (input.departmentId)
          conditions.push(eq(workInitiatives.departmentId, input.departmentId));
        if (input.status)
          conditions.push(eq(workInitiatives.status, input.status));

        return db.query.workInitiatives.findMany({
          where: conditions.length > 0 ? and(...conditions) : undefined,
          orderBy: [desc(workInitiatives.createdAt)],
          with: { department: true, createdBy: true },
        });
      }),

    get: protectedProcedure
      .input(z.object({ id: z.string() }))
      .handler(async ({ input }) => {
        const initiative = await db.query.workInitiatives.findFirst({
          where: eq(workInitiatives.id, input.id),
          with: {
            department: true,
            createdBy: true,
            workItems: {
              with: {
                assignedTo: { with: { user: true } },
                department: true,
              },
            },
          },
        });
        if (!initiative) throw new ORPCError("NOT_FOUND");
        return initiative;
      }),

    create: requireRole("work", "create")
      .input(
        z.object({
          title: z.string().min(1).max(200),
          description: z.string().optional(),
          departmentId: z.string().optional(),
          targetDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        }),
      )
      .handler(async ({ input, context }) => {
        const [initiative] = await db
          .insert(workInitiatives)
          .values({
            ...input,
            description: input.description ?? null,
            departmentId: input.departmentId ?? null,
            targetDate: input.targetDate ?? null,
            createdById: context.session.user.id,
          })
          .returning();

        if (!initiative) throw new ORPCError("INTERNAL_SERVER_ERROR");

        await logAudit({
          actorId: context.session.user.id,
          actorName: context.session.user.name,
          action: "work.initiative.create",
          module: "work",
          resourceType: "initiative",
          resourceId: initiative.id,
          afterValue: initiative as Record<string, unknown>,
          ipAddress: context.ipAddress,
          userAgent: context.userAgent,
          actorRole: context.userRole ?? undefined,
          correlationId: context.requestId,
        });

        return initiative;
      }),

    update: requireRole("work", "update")
      .input(
        z.object({
          id: z.string(),
          title: z.string().min(1).max(200).optional(),
          description: z.string().optional(),
          status: z.enum(["active", "completed", "cancelled"]).optional(),
          departmentId: z.string().optional(),
          targetDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        }),
      )
      .handler(async ({ input, context }) => {
        const { id, ...updates } = input;

        const before = await db.query.workInitiatives.findFirst({
          where: eq(workInitiatives.id, id),
        });
        if (!before) throw new ORPCError("NOT_FOUND");

        const [updated] = await db
          .update(workInitiatives)
          .set(updates)
          .where(eq(workInitiatives.id, id))
          .returning();

        await logAudit({
          actorId: context.session.user.id,
          actorName: context.session.user.name,
          action: "work.initiative.update",
          module: "work",
          resourceType: "initiative",
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
  },

  // ── Dependencies ───────────────────────────────────────────────────────────

  dependencies: {
    listForItem: protectedProcedure
      .input(z.object({ workItemId: z.string() }))
      .handler(async ({ input }) => {
        return db.query.workItemDependencies.findMany({
          where: eq(workItemDependencies.workItemId, input.workItemId),
          with: {
            dependsOn: {
              with: { assignedTo: { with: { user: true } } },
            },
          },
        });
      }),

    add: requireRole("work", "update")
      .input(
        z.object({
          workItemId: z.string(),
          dependsOnId: z.string(),
          dependencyType: z.enum(["blocks", "relates_to"]).default("blocks"),
        }),
      )
      .handler(async ({ input, context }) => {
        if (input.workItemId === input.dependsOnId) {
          throw new ORPCError("BAD_REQUEST", {
            message: "A work item cannot depend on itself",
          });
        }

        const [dep] = await db
          .insert(workItemDependencies)
          .values({
            workItemId: input.workItemId,
            dependsOnId: input.dependsOnId,
            dependencyType: input.dependencyType,
          })
          .onConflictDoNothing()
          .returning();

        await logAudit({
          actorId: context.session.user.id,
          actorName: context.session.user.name,
          action: "work.dependency.add",
          module: "work",
          resourceType: "work_item",
          resourceId: input.workItemId,
          afterValue: { dependsOnId: input.dependsOnId, dependencyType: input.dependencyType },
          ipAddress: context.ipAddress,
          userAgent: context.userAgent,
          actorRole: context.userRole ?? undefined,
          correlationId: context.requestId,
        });

        return dep ?? null;
      }),

    remove: requireRole("work", "update")
      .input(
        z.object({ workItemId: z.string(), dependsOnId: z.string() }),
      )
      .handler(async ({ input, context }) => {
        await db
          .delete(workItemDependencies)
          .where(
            and(
              eq(workItemDependencies.workItemId, input.workItemId),
              eq(workItemDependencies.dependsOnId, input.dependsOnId),
            ),
          );

        await logAudit({
          actorId: context.session.user.id,
          actorName: context.session.user.name,
          action: "work.dependency.remove",
          module: "work",
          resourceType: "work_item",
          resourceId: input.workItemId,
          afterValue: { removedDependsOnId: input.dependsOnId },
          ipAddress: context.ipAddress,
          userAgent: context.userAgent,
          actorRole: context.userRole ?? undefined,
          correlationId: context.requestId,
        });

        return { success: true };
      }),
  },

  // ── Recurring task templates ─────────────────────────────────────────────

  templates: {
    list: protectedProcedure
      .input(
        z.object({
          departmentId: z.string().optional(),
          limit: z.number().min(1).max(100).default(50),
          offset: z.number().min(0).default(0),
        }),
      )
      .handler(async ({ input }) => {
        const conditions = [];
        if (input.departmentId)
          conditions.push(eq(workItemTemplates.departmentId, input.departmentId));

        return db.query.workItemTemplates.findMany({
          where: conditions.length > 0 ? and(...conditions) : undefined,
          orderBy: workItemTemplates.title,
          limit: input.limit,
          offset: input.offset,
          with: { department: true, createdBy: true },
        });
      }),

    create: requireRole("work", "create")
      .input(
        z.object({
          title: z.string().min(1).max(200),
          description: z.string().optional(),
          type: z.enum(["routine", "project", "external_request", "ad_hoc"]),
          priority: z.enum(["low", "medium", "high", "critical"]),
          departmentId: z.string().optional(),
          estimatedHours: z.number().int().positive().optional(),
          recurrencePattern: z.string().min(1),
        }),
      )
      .handler(async ({ input, context }) => {
        const [template] = await db
          .insert(workItemTemplates)
          .values({
            title: input.title,
            description: input.description ?? null,
            type: input.type,
            priority: input.priority,
            departmentId: input.departmentId ?? null,
            estimatedHours: input.estimatedHours ?? null,
            recurrencePattern: input.recurrencePattern,
            createdById: context.session.user.id,
          })
          .returning();
        if (!template) throw new ORPCError("INTERNAL_SERVER_ERROR");

        await logAudit({
          actorId: context.session.user.id,
          actorName: context.session.user.name,
          actorRole: context.userRole ?? undefined,
          correlationId: context.requestId,
          action: "work.template.create",
          module: "work",
          resourceType: "work_item_template",
          resourceId: template.id,
          afterValue: template as Record<string, unknown>,
          ipAddress: context.ipAddress,
          userAgent: context.userAgent,
        });

        return template;
      }),

    generate: requireRole("work", "create")
      .input(
        z.object({
          templateId: z.string(),
          dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
          assignedToId: z.string().optional(),
        }),
      )
      .handler(async ({ input, context }) => {
        const template = await db.query.workItemTemplates.findFirst({
          where: eq(workItemTemplates.id, input.templateId),
        });
        if (!template) throw new ORPCError("NOT_FOUND", { message: "Template not found" });

        const [item] = await db
          .insert(workItems)
          .values({
            title: template.title,
            description: template.description ?? null,
            type: template.type,
            priority: template.priority,
            departmentId: template.departmentId ?? null,
            dueDate: input.dueDate,
            assignedToId: input.assignedToId ?? null,
            createdById: context.session.user.id,
          })
          .returning();
        if (!item) throw new ORPCError("INTERNAL_SERVER_ERROR");

        await logAudit({
          actorId: context.session.user.id,
          actorName: context.session.user.name,
          actorRole: context.userRole ?? undefined,
          correlationId: context.requestId,
          action: "work_item.create",
          module: "work",
          resourceType: "work_item",
          resourceId: item.id,
          afterValue: { ...item, fromTemplateId: template.id } as Record<string, unknown>,
          ipAddress: context.ipAddress,
          userAgent: context.userAgent,
        });

        return item;
      }),
  },
};
