import { ORPCError } from "@orpc/server";
import { z } from "zod";
import { db } from "@ndma-dcs-staff-portal/db";
import {
  onCallSchedules,
  onCallAssignments,
  onCallSwaps,
  onCallOverrides,
  assignmentHistory,
  staffProfiles,
  departments,
  leaveRequests,
  contracts,
  rotaImportWarnings,
} from "@ndma-dcs-staff-portal/db";
import { eq, desc, asc, and, gte, lte, or, isNull } from "drizzle-orm";
import { protectedProcedure, requireRole } from "../index";
import { logAudit } from "../lib/audit";

// ── Input Schemas ──────────────────────────────────────────────────────────
const OnCallRoleSchema = z.enum([
  "lead_engineer",
  "asn_support",
  "core_support",
  "enterprise_support",
]);

const CreateScheduleInput = z.object({
  weekStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Must be YYYY-MM-DD"),
  notes: z.string().optional(),
});

const AssignStaffInput = z.object({
  scheduleId: z.string(),
  staffProfileId: z.string(),
  role: OnCallRoleSchema,
});

const RemoveAssignmentInput = z.object({
  assignmentId: z.string(),
});

const PublishScheduleInput = z.object({
  scheduleId: z.string(),
});

const ReopenScheduleInput = z.object({
  scheduleId: z.string(),
});

const RequestSwapInput = z.object({
  assignmentId: z.string(),
  targetStaffProfileId: z.string(),
  reason: z.string().optional(),
});

const ReviewSwapInput = z.object({
  swapId: z.string(),
  action: z.enum(["approve", "reject"]),
  notes: z.string().optional(),
});

const HistoryFilterInput = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
  staffProfileId: z.string().optional(),
  limit: z.number().min(1).max(100).default(50),
});

// ── Helper: compute ISO week Sunday from Monday ────────────────────────────
function getWeekEnd(weekStart: string): string {
  const d = new Date(weekStart);
  d.setDate(d.getDate() + 6);
  return d.toISOString().slice(0, 10);
}

// ── Helper: log history event ──────────────────────────────────────────────
async function logHistory(params: {
  scheduleId: string;
  assignmentId?: string;
  staffProfileId?: string;
  role?: string;
  action: string;
  performedById: string;
  metadata?: Record<string, unknown>;
}) {
  await db.insert(assignmentHistory).values({
    scheduleId: params.scheduleId,
    assignmentId: params.assignmentId,
    staffProfileId: params.staffProfileId,
    role: params.role as
      | "lead_engineer"
      | "asn_support"
      | "core_support"
      | "enterprise_support"
      | undefined,
    action: params.action,
    performedById: params.performedById,
    metadata: params.metadata ?? {},
  });
}

// ── Router ─────────────────────────────────────────────────────────────────
export const rotaRouter = {
  // Get the currently published (active) schedule
  getCurrent: protectedProcedure.handler(async () => {
    const today = new Date().toISOString().slice(0, 10);
    const schedule = await db.query.onCallSchedules.findFirst({
      where: and(
        eq(onCallSchedules.status, "published"),
        lte(onCallSchedules.weekStart, today),
        gte(onCallSchedules.weekEnd, today),
      ),
      with: {
        assignments: {
          with: {
            staffProfile: { with: { user: true, department: true } },
          },
        },
      },
    });
    return schedule ?? null;
  }),

  // Get upcoming published schedules (next 4 weeks)
  getUpcoming: protectedProcedure.handler(async () => {
    const today = new Date().toISOString().slice(0, 10);
    return db.query.onCallSchedules.findMany({
      where: and(
        eq(onCallSchedules.status, "published"),
        gte(onCallSchedules.weekStart, today),
      ),
      orderBy: asc(onCallSchedules.weekStart),
      limit: 4,
      with: {
        assignments: {
          with: {
            staffProfile: { with: { user: true, department: true } },
          },
        },
      },
    });
  }),

  // Get all schedules (drafts + published) for the planner view
  list: requireRole("rota", "read").handler(async () => {
    return db.query.onCallSchedules.findMany({
      orderBy: desc(onCallSchedules.weekStart),
      limit: 12,
      with: {
        assignments: {
          with: {
            staffProfile: { with: { user: true, department: true } },
          },
        },
      },
    });
  }),

  // Create a new draft schedule for a given week
  create: requireRole("rota", "create")
    .input(CreateScheduleInput)
    .handler(async ({ input, context }) => {
      const weekEnd = getWeekEnd(input.weekStart);

      const existing = await db.query.onCallSchedules.findFirst({
        where: eq(onCallSchedules.weekStart, input.weekStart),
      });
      if (existing) {
        throw new ORPCError("CONFLICT", {
          message: "Schedule already exists for this week",
        });
      }

      const [schedule] = await db
        .insert(onCallSchedules)
        .values({ weekStart: input.weekStart, weekEnd, notes: input.notes, status: "draft" })
        .returning();
      if (!schedule) throw new ORPCError("INTERNAL_SERVER_ERROR");

      await logHistory({
        scheduleId: schedule.id,
        action: "created",
        performedById: context.session.user.id,
      });

      await logAudit({
        actorId: context.session.user.id,
        actorName: context.session.user.name,
        action: "rota.schedule.create",
        module: "rota",
        resourceType: "on_call_schedule",
        resourceId: schedule.id,
        afterValue: schedule as Record<string, unknown>,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
        actorRole: context.userRole ?? undefined,
        correlationId: context.requestId,
      });

      return schedule;
    }),

  // Assign a staff member to a role in a draft schedule
  assign: requireRole("rota", "update")
    .input(AssignStaffInput)
    .handler(async ({ input, context }) => {
      const schedule = await db.query.onCallSchedules.findFirst({
        where: eq(onCallSchedules.id, input.scheduleId),
      });
      if (!schedule) throw new ORPCError("NOT_FOUND", { message: "Schedule not found" });
      if (schedule.status !== "draft") {
        throw new ORPCError("FORBIDDEN", {
          message: "Cannot modify a published or archived schedule",
        });
      }

      // Prevent double-booking: same staff member in multiple roles this week
      const existingForStaff = await db.query.onCallAssignments.findFirst({
        where: and(
          eq(onCallAssignments.scheduleId, input.scheduleId),
          eq(onCallAssignments.staffProfileId, input.staffProfileId),
        ),
      });

      if (existingForStaff && existingForStaff.role !== input.role) {
        throw new ORPCError("CONFLICT", {
          message: `Staff member already assigned as ${existingForStaff.role} in this schedule`,
        });
      }

      // Block assignment if staff has approved leave overlapping this schedule week
      const leaveConflict = await db.query.leaveRequests.findFirst({
        where: and(
          eq(leaveRequests.staffProfileId, input.staffProfileId),
          eq(leaveRequests.status, "approved"),
          lte(leaveRequests.startDate, schedule.weekEnd),
          gte(leaveRequests.endDate, schedule.weekStart),
        ),
      });

      if (leaveConflict) {
        throw new ORPCError("CONFLICT", {
          message: `Staff member has approved leave overlapping this schedule (${leaveConflict.startDate} to ${leaveConflict.endDate})`,
        });
      }

      // Replace any existing assignment for this role
      await db.delete(onCallAssignments).where(
        and(
          eq(onCallAssignments.scheduleId, input.scheduleId),
          eq(onCallAssignments.role, input.role),
        ),
      );

      const [assignment] = await db
        .insert(onCallAssignments)
        .values({
          scheduleId: input.scheduleId,
          staffProfileId: input.staffProfileId,
          role: input.role,
        })
        .returning();
      if (!assignment) throw new ORPCError("INTERNAL_SERVER_ERROR");

      await logHistory({
        scheduleId: input.scheduleId,
        assignmentId: assignment.id,
        staffProfileId: input.staffProfileId,
        role: input.role,
        action: "assigned",
        performedById: context.session.user.id,
      });

      await logAudit({
        actorId: context.session.user.id,
        actorName: context.session.user.name,
        action: "rota.assignment.assign",
        module: "rota",
        resourceType: "on_call_assignment",
        resourceId: assignment.id,
        afterValue: { scheduleId: input.scheduleId, staffProfileId: input.staffProfileId, role: input.role },
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
        actorRole: context.userRole ?? undefined,
        correlationId: context.requestId,
      });

      return assignment;
    }),

  // Remove an assignment from a draft schedule
  removeAssignment: requireRole("rota", "update")
    .input(RemoveAssignmentInput)
    .handler(async ({ input, context }) => {
      const existing = await db.query.onCallAssignments.findFirst({
        where: eq(onCallAssignments.id, input.assignmentId),
        with: { schedule: true },
      });
      if (!existing) throw new ORPCError("NOT_FOUND");
      if (existing.schedule.status !== "draft") {
        throw new ORPCError("FORBIDDEN", {
          message: "Cannot modify a published schedule",
        });
      }

      await db
        .delete(onCallAssignments)
        .where(eq(onCallAssignments.id, input.assignmentId));

      await logHistory({
        scheduleId: existing.scheduleId,
        staffProfileId: existing.staffProfileId,
        role: existing.role,
        action: "removed",
        performedById: context.session.user.id,
      });

      await logAudit({
        actorId: context.session.user.id,
        actorName: context.session.user.name,
        action: "rota.assignment.remove",
        module: "rota",
        resourceType: "on_call_assignment",
        resourceId: input.assignmentId,
        beforeValue: { scheduleId: existing.scheduleId, staffProfileId: existing.staffProfileId, role: existing.role },
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
        actorRole: context.userRole ?? undefined,
        correlationId: context.requestId,
      });

      return { success: true };
    }),

  // Publish a schedule — validates all 4 roles are filled and runs constraint sweep
  publish: requireRole("rota", "update")
    .input(PublishScheduleInput)
    .handler(async ({ input, context }) => {
      const schedule = await db.query.onCallSchedules.findFirst({
        where: eq(onCallSchedules.id, input.scheduleId),
        with: {
          assignments: {
            with: {
              staffProfile: { with: { user: true } },
            },
          },
        },
      });
      if (!schedule) throw new ORPCError("NOT_FOUND");
      if (schedule.status !== "draft") {
        throw new ORPCError("CONFLICT", { message: "Schedule is not in draft status" });
      }

      const roles = schedule.assignments.map((a) => a.role);
      const requiredRoles = [
        "lead_engineer",
        "asn_support",
        "core_support",
        "enterprise_support",
      ] as const;
      const missingRoles = requiredRoles.filter((r) => !roles.includes(r));
      if (missingRoles.length > 0) {
        throw new ORPCError("UNPROCESSABLE_CONTENT", {
          message: `Missing roles: ${missingRoles.join(", ")}`,
        });
      }

      // ── Pre-publish constraint sweep ──────────────────────────────────────
      // For each assignment: check approved leave and active contract status.
      // Write results to conflictFlags; block publish on any "blocker" severity.
      type ConflictFlag = { type: string; message: string; severity: "warning" | "blocker" };
      const allBlockers: string[] = [];

      for (const a of schedule.assignments) {
        const flags: ConflictFlag[] = [];
        const staffName = a.staffProfile.user?.name ?? a.staffProfileId;

        // Check 1: approved leave overlapping the schedule week
        const leaveConflict = await db.query.leaveRequests.findFirst({
          where: and(
            eq(leaveRequests.staffProfileId, a.staffProfileId),
            eq(leaveRequests.status, "approved"),
            lte(leaveRequests.startDate, schedule.weekEnd),
            gte(leaveRequests.endDate, schedule.weekStart),
          ),
        });
        if (leaveConflict) {
          flags.push({
            type: "approved_leave",
            message: `On approved leave ${leaveConflict.startDate}–${leaveConflict.endDate}`,
            severity: "blocker",
          });
        }

        // Check 2: must have an active/non-expired contract
        const activeContract = await db.query.contracts.findFirst({
          where: and(
            eq(contracts.staffProfileId, a.staffProfileId),
            or(
              isNull(contracts.endDate),
              gte(contracts.endDate, schedule.weekStart),
            ),
          ),
        });
        if (!activeContract) {
          flags.push({
            type: "contract_expired",
            message: "No active contract covering this week",
            severity: "blocker",
          });
        }

        // Persist conflict flags on the assignment
        await db
          .update(onCallAssignments)
          .set({ conflictFlags: flags })
          .where(eq(onCallAssignments.id, a.id));

        const blockers = flags.filter((f) => f.severity === "blocker");
        if (blockers.length > 0) {
          allBlockers.push(
            `${a.role} (${staffName}): ${blockers.map((b) => b.message).join("; ")}`,
          );
        }
      }

      if (allBlockers.length > 0) {
        await db
          .update(onCallSchedules)
          .set({ hasConflicts: true })
          .where(eq(onCallSchedules.id, input.scheduleId));
        throw new ORPCError("UNPROCESSABLE_CONTENT", {
          message: `Cannot publish — blocking conflicts found: ${allBlockers.join(" | ")}`,
        });
      }

      const [published] = await db
        .update(onCallSchedules)
        .set({
          status: "published",
          publishedAt: new Date(),
          publishedById: context.session.user.id,
        })
        .where(eq(onCallSchedules.id, input.scheduleId))
        .returning();
      if (!published) throw new ORPCError("INTERNAL_SERVER_ERROR");

      await logHistory({
        scheduleId: input.scheduleId,
        action: "published",
        performedById: context.session.user.id,
      });

      await logAudit({
        actorId: context.session.user.id,
        actorName: context.session.user.name,
        action: "rota.schedule.publish",
        module: "rota",
        resourceType: "on_call_schedule",
        resourceId: input.scheduleId,
        afterValue: { status: "published", publishedAt: published.publishedAt },
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
        actorRole: context.userRole ?? undefined,
        correlationId: context.requestId,
      });

      return published;
    }),

  reopen: requireRole("rota", "update")
    .input(ReopenScheduleInput)
    .handler(async ({ input, context }) => {
      const before = await db.query.onCallSchedules.findFirst({
        where: eq(onCallSchedules.id, input.scheduleId),
        with: {
          assignments: {
            with: {
              staffProfile: { with: { user: true } },
            },
          },
        },
      });
      if (!before) throw new ORPCError("NOT_FOUND");
      if (before.status !== "published") {
        throw new ORPCError("CONFLICT", { message: "Only published schedules can be reopened." });
      }

      const [updated] = await db
        .update(onCallSchedules)
        .set({
          status: "draft",
          updatedAt: new Date(),
        })
        .where(eq(onCallSchedules.id, input.scheduleId))
        .returning();
      if (!updated) throw new ORPCError("INTERNAL_SERVER_ERROR");

      await logHistory({
        scheduleId: input.scheduleId,
        action: "reopened",
        performedById: context.session.user.id,
        metadata: {
          fromStatus: before.status,
          toStatus: updated.status,
        },
      });

      await logAudit({
        actorId: context.session.user.id,
        actorName: context.session.user.name,
        action: "rota.schedule.reopen",
        module: "rota",
        resourceType: "on_call_schedule",
        resourceId: updated.id,
        beforeValue: before as Record<string, unknown>,
        afterValue: updated as Record<string, unknown>,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
        actorRole: context.userRole ?? undefined,
        correlationId: context.requestId,
      });

      return updated;
    }),

  // Get eligible staff for a role (used by assign modal + rotation engine)
  getEligibleStaff: requireRole("rota", "update")
    .input(z.object({ role: OnCallRoleSchema }))
    .handler(async ({ input }) => {
      const departmentCodeMap: Record<string, string> = {
        asn_support: "ASN",
        core_support: "CORE",
        enterprise_support: "ENT",
      };

      if (input.role === "lead_engineer") {
        return db.query.staffProfiles.findMany({
          where: and(
            eq(staffProfiles.isLeadEngineerEligible, true),
            eq(staffProfiles.isOnCallEligible, true),
            eq(staffProfiles.status, "active"),
          ),
          with: { user: true, department: true },
        });
      }

      const deptCode = departmentCodeMap[input.role]!;
      return db
        .select()
        .from(staffProfiles)
        .innerJoin(departments, eq(staffProfiles.departmentId, departments.id))
        .where(
          and(
            eq(departments.code, deptCode),
            eq(staffProfiles.isOnCallEligible, true),
            eq(staffProfiles.status, "active"),
          ),
        );
    }),

  // Assignment counts per person — used by workload cards + rotation engine
  getAssignmentCounts: requireRole("rota", "read").handler(async () => {
    const all = await db.query.onCallAssignments.findMany({
      with: { staffProfile: { with: { user: true } } },
    });
    const counts: Record<
      string,
      { name: string; total: number; byRole: Record<string, number> }
    > = {};
    for (const a of all) {
      const id = a.staffProfileId;
      if (!counts[id]) {
        counts[id] = { name: a.staffProfile.user.name, total: 0, byRole: {} };
      }
      counts[id].total++;
      counts[id].byRole[a.role] = (counts[id].byRole[a.role] ?? 0) + 1;
    }
    return Object.entries(counts).map(([id, data]) => ({
      staffProfileId: id,
      ...data,
    }));
  }),

  // ── Swap sub-router ────────────────────────────────────────────────────
  swap: {
    request: requireRole("rota", "swap")
      .input(RequestSwapInput)
      .handler(async ({ input, context }) => {
        const assignment = await db.query.onCallAssignments.findFirst({
          where: eq(onCallAssignments.id, input.assignmentId),
          with: { schedule: true },
        });
        if (!assignment) throw new ORPCError("NOT_FOUND");
        if (assignment.schedule.status !== "published") {
          throw new ORPCError("FORBIDDEN", {
            message: "Can only swap published assignments",
          });
        }

        const requesterProfile = await db.query.staffProfiles.findFirst({
          where: eq(staffProfiles.userId, context.session.user.id),
        });
        if (!requesterProfile) {
          throw new ORPCError("NOT_FOUND", { message: "Staff profile not found" });
        }

        // Verify the requester owns the assignment they are trying to swap
        if (assignment.staffProfileId !== requesterProfile.id) {
          throw new ORPCError("FORBIDDEN", {
            message: "You can only request a swap for your own assignment.",
          });
        }

        const [swap] = await db
          .insert(onCallSwaps)
          .values({
            assignmentId: input.assignmentId,
            requesterId: requesterProfile.id,
            targetId: input.targetStaffProfileId,
            reason: input.reason,
          })
          .returning();
        if (!swap) throw new ORPCError("INTERNAL_SERVER_ERROR");

        await logAudit({
          actorId: context.session.user.id,
          actorName: context.session.user.name,
          action: "rota.swap.request",
          module: "rota",
          resourceType: "on_call_swap",
          resourceId: swap.id,
          afterValue: { assignmentId: input.assignmentId, targetStaffProfileId: input.targetStaffProfileId },
          ipAddress: context.ipAddress,
          userAgent: context.userAgent,
          actorRole: context.userRole ?? undefined,
          correlationId: context.requestId,
        });

        return swap;
      }),

    review: requireRole("rota", "update")
      .input(ReviewSwapInput)
      .handler(async ({ input, context }) => {
        const swap = await db.query.onCallSwaps.findFirst({
          where: eq(onCallSwaps.id, input.swapId),
          with: { assignment: { with: { schedule: true } } },
        });
        if (!swap) throw new ORPCError("NOT_FOUND");
        if (swap.status !== "pending") {
          throw new ORPCError("CONFLICT", { message: "Swap is no longer pending" });
        }

        if (input.action === "approve") {
          await db
            .update(onCallAssignments)
            .set({ staffProfileId: swap.targetId, updatedAt: new Date() })
            .where(eq(onCallAssignments.id, swap.assignmentId));

          await logHistory({
            scheduleId: swap.assignment.scheduleId,
            assignmentId: swap.assignmentId,
            staffProfileId: swap.targetId,
            role: swap.assignment.role,
            action: "swapped",
            performedById: context.session.user.id,
            metadata: { swapId: swap.id, fromStaff: swap.requesterId },
          });
        }

        const [updated] = await db
          .update(onCallSwaps)
          .set({
            status: input.action === "approve" ? "approved" : "rejected",
            reviewedById: context.session.user.id,
            reviewedAt: new Date(),
            reviewNotes: input.notes,
          })
          .where(eq(onCallSwaps.id, input.swapId))
          .returning();
        if (!updated) throw new ORPCError("INTERNAL_SERVER_ERROR");

        await logAudit({
          actorId: context.session.user.id,
          actorName: context.session.user.name,
          action: `rota.swap.${input.action}`,
          module: "rota",
          resourceType: "on_call_swap",
          resourceId: input.swapId,
          afterValue: { status: updated.status, reviewNotes: input.notes },
          ipAddress: context.ipAddress,
          userAgent: context.userAgent,
          actorRole: context.userRole ?? undefined,
          correlationId: context.requestId,
        });

        return updated;
      }),

    list: protectedProcedure
      .input(
        z.object({
          status: z
            .enum(["pending", "approved", "rejected", "cancelled"])
            .optional(),
        }),
      )
      .handler(async ({ input }) => {
        return db.query.onCallSwaps.findMany({
          where: input.status
            ? eq(onCallSwaps.status, input.status)
            : undefined,
          orderBy: desc(onCallSwaps.createdAt),
          with: {
            assignment: {
              with: {
                schedule: true,
                staffProfile: { with: { user: true } },
              },
            },
            requester: { with: { user: true } },
            target: { with: { user: true } },
          },
        });
      }),
  },

  // Resolve effective on-call for a given date, applying any active overrides
  getEffectiveOnCall: protectedProcedure
    .input(z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }))
    .handler(async ({ input }) => {
      const schedule = await db.query.onCallSchedules.findFirst({
        where: and(
          eq(onCallSchedules.status, "published"),
          lte(onCallSchedules.weekStart, input.date),
          gte(onCallSchedules.weekEnd, input.date),
        ),
        with: {
          assignments: {
            with: { staffProfile: { with: { user: true, department: true } } },
          },
        },
      });

      if (!schedule) return null;

      // Fetch all overrides active on this date for this schedule
      const overrides = await db.query.onCallOverrides.findMany({
        where: and(
          eq(onCallOverrides.scheduleId, schedule.id),
          lte(onCallOverrides.startDate, input.date),
          gte(onCallOverrides.endDate, input.date),
        ),
        with: {
          overrideStaff: { with: { user: true, department: true } },
        },
      });

      // Apply overrides: replace originalStaffId with overrideStaff for the role
      const effectiveAssignments = schedule.assignments.map((a) => {
        const override = overrides.find(
          (o) => o.originalStaffId === a.staffProfileId && o.role === a.role,
        );
        if (override) {
          return { ...a, staffProfile: override.overrideStaff, overridden: true, overrideReason: override.reason };
        }
        return { ...a, overridden: false };
      });

      return { ...schedule, assignments: effectiveAssignments };
    }),

  // Assignment history with optional filters
  history: requireRole("rota", "read")
    .input(HistoryFilterInput)
    .handler(async ({ input }) => {
      return db.query.assignmentHistory.findMany({
        where: input.staffProfileId
          ? eq(assignmentHistory.staffProfileId, input.staffProfileId)
          : undefined,
        orderBy: desc(assignmentHistory.createdAt),
        limit: input.limit,
        with: {
          staffProfile: { with: { user: true } },
          schedule: true,
        },
      });
    }),

  // Acknowledge an on-call assignment — staff confirms they received it
  acknowledge: requireRole("rota", "update")
    .input(z.object({ assignmentId: z.string() }))
    .handler(async ({ input, context }) => {
      const assignment = await db.query.onCallAssignments.findFirst({
        where: eq(onCallAssignments.id, input.assignmentId),
      });
      if (!assignment) throw new ORPCError("NOT_FOUND");

      // Find staff profile for the current user
      const staffProfile = await db.query.staffProfiles.findFirst({
        where: eq(staffProfiles.userId, context.session.user.id),
      });
      if (!staffProfile) throw new ORPCError("NOT_FOUND", { message: "Staff profile not found" });

      const [updated] = await db
        .update(onCallAssignments)
        .set({
          acknowledgedAt: new Date(),
          acknowledgedById: staffProfile.id,
          isConfirmed: true,
        })
        .where(eq(onCallAssignments.id, input.assignmentId))
        .returning();
      if (!updated) throw new ORPCError("INTERNAL_SERVER_ERROR");

      await logHistory({
        scheduleId: assignment.scheduleId,
        assignmentId: assignment.id,
        staffProfileId: assignment.staffProfileId,
        role: assignment.role,
        action: "acknowledged",
        performedById: context.session.user.id,
      });

      await logAudit({
        actorId: context.session.user.id,
        actorName: context.session.user.name,
        actorRole: context.userRole ?? undefined,
        correlationId: context.requestId,
        action: "rota.assignment.acknowledge",
        module: "rota",
        resourceType: "on_call_assignment",
        resourceId: input.assignmentId,
        afterValue: { acknowledgedAt: updated.acknowledgedAt },
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
      });

      return updated;
    }),

  // Import warnings — ambiguous spreadsheet entries flagged for admin review
  listImportWarnings: protectedProcedure
    .input(z.object({ status: z.enum(["pending", "resolved", "dismissed"]).optional() }))
    .handler(async ({ input }) => {
      return db.query.rotaImportWarnings.findMany({
        where: input.status
          ? eq(rotaImportWarnings.status, input.status)
          : undefined,
        orderBy: asc(rotaImportWarnings.weekStart),
        with: { schedule: true },
      });
    }),

  resolveImportWarning: requireRole("rota", "update")
    .input(
      z.object({
        warningId: z.string(),
        action: z.enum(["resolved", "dismissed"]),
        notes: z.string().optional(),
      }),
    )
    .handler(async ({ input, context }) => {
      const [updated] = await db
        .update(rotaImportWarnings)
        .set({
          status: input.action,
          resolvedById: context.session.user.id,
          resolvedAt: new Date(),
          resolutionNotes: input.notes,
        })
        .where(eq(rotaImportWarnings.id, input.warningId))
        .returning();
      if (!updated) throw new ORPCError("NOT_FOUND");

      await logAudit({
        actorId: context.session.user.id,
        actorName: context.session.user.name,
        actorRole: context.userRole ?? undefined,
        correlationId: context.requestId,
        action: `rota.import_warning.${input.action}`,
        module: "rota",
        resourceType: "rota_import_warning",
        resourceId: input.warningId,
        afterValue: { status: input.action, notes: input.notes },
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
      });

      return updated;
    }),
};
