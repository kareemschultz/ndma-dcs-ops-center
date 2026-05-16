import { ORPCError } from "@orpc/server";
import { z } from "zod";
import {
  db,
  calendarEvents,
  leaveTypes,
  leaveBalances,
  leaveRequests,
  staffProfiles,
  tosdRecords,
  tosdTypeEnum,
} from "@ndma-dcs-staff-portal/db";
import { and, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { protectedProcedure, requireRole } from "../index";
import { logAudit } from "../lib/audit";
import { createNotification } from "../lib/notify";
import { getTeamStaffIds } from "../lib/team";

// Maximum number of staff from the same department allowed on leave simultaneously.
// Increase this per-department when a department config table exists.
const MAX_DEPT_LEAVE_OVERLAP = 2;
const LEGACY_LEAVE_TYPE_NAMES = new Set(["Compassionate", "Compassionate Leave"]);
const LEAVE_TYPE_SORT_ORDER = [
  "Annual Leave",
  "Sick Leave",
  "Maternity Leave",
  "Study Leave",
  "Emergency",
  "No Pay",
  "Special",
] as const;

function displayLeaveTypeName(name: string): string {
  if (name === "Special") return "Special Leave";
  return name;
}

function leaveTypeSortIndex(name: string): number {
  const normalized = name === "Special Leave" ? "Special" : name;
  const idx = LEAVE_TYPE_SORT_ORDER.indexOf(
    normalized as (typeof LEAVE_TYPE_SORT_ORDER)[number],
  );
  return idx === -1 ? LEAVE_TYPE_SORT_ORDER.length : idx;
}

export const leaveRouter = {
  // ── Leave Types ───────────────────────────────────────────────────────────
  types: {
    list: protectedProcedure.handler(async () => {
      const rows = await db.query.leaveTypes.findMany({
        where: eq(leaveTypes.isActive, true),
      });
      return rows
        .filter((row) => !LEGACY_LEAVE_TYPE_NAMES.has(row.name))
        .map((row) => ({
          ...row,
          name: displayLeaveTypeName(row.name),
        }))
        .sort((a, b) => leaveTypeSortIndex(a.name) - leaveTypeSortIndex(b.name));
    }),

    create: requireRole("leave", "create")
      .input(
        z.object({
          name: z.string().min(1),
          code: z.string().min(1).max(10),
          defaultAnnualAllowance: z.number().default(20),
          requiresApproval: z.boolean().default(true),
        }),
      )
      .handler(async ({ input, context }) => {
        const [type] = await db.insert(leaveTypes).values(input).returning();
        if (!type) throw new ORPCError("INTERNAL_SERVER_ERROR");
        await logAudit({
          actorId: context.session.user.id,
          actorName: context.session.user.name,
          action: "leave_type.create",
          module: "leave",
          resourceType: "leave_type",
          resourceId: type.id,
          afterValue: type as Record<string, unknown>,
          ipAddress: context.ipAddress,
          userAgent: context.userAgent,
          actorRole: context.userRole ?? undefined,
          correlationId: context.requestId,
        });
        return type;
      }),

    update: requireRole("leave", "update")
      .input(
        z.object({
          id: z.string(),
          name: z.string().optional(),
          defaultAnnualAllowance: z.number().optional(),
          requiresApproval: z.boolean().optional(),
          isActive: z.boolean().optional(),
        }),
      )
      .handler(async ({ input, context }) => {
        const { id, ...updates } = input;
        const [updated] = await db
          .update(leaveTypes)
          .set(updates)
          .where(eq(leaveTypes.id, id))
          .returning();
        await logAudit({
          actorId: context.session.user.id,
          actorName: context.session.user.name,
          action: "leave_type.update",
          module: "leave",
          resourceType: "leave_type",
          resourceId: id,
          afterValue: updated as Record<string, unknown>,
          ipAddress: context.ipAddress,
          userAgent: context.userAgent,
          actorRole: context.userRole ?? undefined,
          correlationId: context.requestId,
        });
        return updated;
      }),
  },

  // ── Leave Balances ────────────────────────────────────────────────────────
  balances: {
    getByStaff: protectedProcedure
      .input(z.object({ staffProfileId: z.string() }))
      .handler(async ({ input, context }) => {
        const role = context.userRole;
        const canSeeAll =
          role && ["admin", "hrAdminOps", "manager", "personalAssistant", "readOnly"].includes(role);

        if (!canSeeAll) {
          // Staff can only see their own balances
          const ownProfile = await db.query.staffProfiles.findFirst({
            where: eq(staffProfiles.userId, context.session.user.id),
          });
          if (!ownProfile || ownProfile.id !== input.staffProfileId) {
            throw new ORPCError("FORBIDDEN", { message: "You can only view your own leave balances." });
          }
        }

        return db.query.leaveBalances.findMany({
          where: eq(leaveBalances.staffProfileId, input.staffProfileId),
          with: { leaveType: true },
        });
      }),

    adjust: requireRole("leave", "update")
      .input(
        z.object({
          staffProfileId: z.string(),
          leaveTypeId: z.string(),
          contractYearStart: z.string(),
          contractYearEnd: z.string(),
          entitlement: z.number(),
          adjustment: z.number().default(0),
          carriedOver: z.number().default(0),
        }),
      )
      .handler(async ({ input, context }) => {
        const [balance] = await db
          .insert(leaveBalances)
          .values(input)
          .onConflictDoUpdate({
            target: [
              leaveBalances.staffProfileId,
              leaveBalances.leaveTypeId,
              leaveBalances.contractYearStart,
            ],
            set: {
              entitlement: input.entitlement,
              adjustment: input.adjustment,
              carriedOver: input.carriedOver,
            },
          })
          .returning();
        if (!balance) throw new ORPCError("INTERNAL_SERVER_ERROR");

        await logAudit({
          actorId: context.session.user.id,
          actorName: context.session.user.name,
          action: "leave_balance.adjust",
          module: "leave",
          resourceType: "leave_balance",
          resourceId: balance.id,
          afterValue: balance as Record<string, unknown>,
          ipAddress: context.ipAddress,
          userAgent: context.userAgent,
          actorRole: context.userRole ?? undefined,
          correlationId: context.requestId,
        });

        return balance;
      }),
  },

  // ── Leave Requests ────────────────────────────────────────────────────────
  requests: {
    list: protectedProcedure
      .input(
        z.object({
          staffProfileId: z.string().optional(),
          team: z.enum(["DCS", "NOC"]).optional(),
          status: z
            .enum(["pending", "approved", "rejected", "cancelled"])
            .optional(),
          from: z.string().optional(),
          to: z.string().optional(),
          limit: z.number().min(1).max(200).default(50),
        }),
      )
      .handler(async ({ input, context }) => {
        const role = context.userRole;
        const canSeeAll =
          role && ["admin", "hrAdminOps", "manager", "personalAssistant", "readOnly"].includes(role);

        const conditions = [];

        if (canSeeAll) {
          if (input.staffProfileId)
            conditions.push(eq(leaveRequests.staffProfileId, input.staffProfileId));
          if (input.team) {
            const teamStaffIds = await getTeamStaffIds(input.team);
            if (teamStaffIds.length === 0) return [];
            conditions.push(inArray(leaveRequests.staffProfileId, teamStaffIds));
          }
        } else {
          // Staff can only see their own requests
          const ownProfile = await db.query.staffProfiles.findFirst({
            where: eq(staffProfiles.userId, context.session.user.id),
          });
          if (!ownProfile) return [];
          conditions.push(eq(leaveRequests.staffProfileId, ownProfile.id));
        }

        if (input.status)
          conditions.push(eq(leaveRequests.status, input.status));
        // Overlap filter: a request matches the [from, to] window if it touches
        // it at all — NOT only if fully contained. A leave that starts before
        // `from` but runs into the window must still appear (e.g. on the planner).
        if (input.from)
          conditions.push(gte(leaveRequests.endDate, input.from));
        if (input.to)
          conditions.push(lte(leaveRequests.startDate, input.to));

        return db.query.leaveRequests.findMany({
          where: conditions.length > 0 ? and(...conditions) : undefined,
          with: {
            staffProfile: { with: { user: true, department: true } },
            leaveType: true,
            approvedBy: true,
          },
          limit: input.limit,
        });
      }),

    create: requireRole("leave", "create")
      .input(
        z.object({
          staffProfileId: z.string(),
          leaveTypeId: z.string(),
          startDate: z.string(),
          endDate: z.string(),
          totalDays: z.number().min(1),
          reason: z.string().optional(),
        }),
      )
      .handler(async ({ input, context }) => {
        // Staff can only create leave for themselves
        const role = context.userRole;
        const canActOnBehalf = role && ["admin", "hrAdminOps", "manager"].includes(role);
        if (!canActOnBehalf) {
          const ownProfile = await db.query.staffProfiles.findFirst({
            where: eq(staffProfiles.userId, context.session.user.id),
          });
          if (!ownProfile || ownProfile.id !== input.staffProfileId) {
            throw new ORPCError("FORBIDDEN", { message: "You can only submit leave for yourself." });
          }
        }

        // Check sufficient leave balance
        const balance = await db.query.leaveBalances.findFirst({
          where: and(
            eq(leaveBalances.staffProfileId, input.staffProfileId),
            eq(leaveBalances.leaveTypeId, input.leaveTypeId),
          ),
          orderBy: (t, { desc }) => [desc(t.contractYearStart)],
        });

        if (balance) {
          const available =
            balance.entitlement +
            balance.carriedOver +
            balance.adjustment -
            balance.used;
          if (input.totalDays > available) {
            throw new ORPCError("BAD_REQUEST", {
              message: `Insufficient leave balance: ${available} days available, ${input.totalDays} requested`,
            });
          }
        }

        // Check for overlapping approved/pending requests
        const overlapping = await db.query.leaveRequests.findFirst({
          where: and(
            eq(leaveRequests.staffProfileId, input.staffProfileId),
            sql`${leaveRequests.status} IN ('pending', 'approved')`,
            lte(leaveRequests.startDate, input.endDate),
            gte(leaveRequests.endDate, input.startDate),
          ),
        });

        if (overlapping) {
          throw new ORPCError("CONFLICT", {
            message: `Overlapping leave request exists (${overlapping.startDate} to ${overlapping.endDate})`,
          });
        }

        const [request] = await db
          .insert(leaveRequests)
          .values({ ...input, reason: input.reason ?? null })
          .returning();
        if (!request) throw new ORPCError("INTERNAL_SERVER_ERROR");

        await logAudit({
          actorId: context.session.user.id,
          actorName: context.session.user.name,
          action: "leave_request.create",
          module: "leave",
          resourceType: "leave_request",
          resourceId: request.id,
          afterValue: request as Record<string, unknown>,
          ipAddress: context.ipAddress,
          userAgent: context.userAgent,
          actorRole: context.userRole ?? undefined,
          correlationId: context.requestId,
        });

        return request;
      }),

    approve: requireRole("leave", "approve")
      .input(z.object({ id: z.string() }))
      .handler(async ({ input, context }) => {
        const before = await db.query.leaveRequests.findFirst({
          where: eq(leaveRequests.id, input.id),
          with: { staffProfile: true },
        });
        if (!before) throw new ORPCError("NOT_FOUND");
        if (before.status !== "pending")
          throw new ORPCError("CONFLICT", { message: "Request is not pending" });

        // Team overlap cap — prevent too many from same department on leave simultaneously
        if (before.staffProfile.departmentId) {
          const [overlapResult] = await db
            .select({ count: sql<number>`count(*)::int` })
            .from(leaveRequests)
            .innerJoin(staffProfiles, eq(leaveRequests.staffProfileId, staffProfiles.id))
            .where(
              and(
                eq(staffProfiles.departmentId, before.staffProfile.departmentId),
                eq(leaveRequests.status, "approved"),
                lte(leaveRequests.startDate, before.endDate),
                gte(leaveRequests.endDate, before.startDate),
                sql`${leaveRequests.staffProfileId} != ${before.staffProfileId}`,
              ),
            );
          const overlapCount = overlapResult?.count ?? 0;
          if (overlapCount >= MAX_DEPT_LEAVE_OVERLAP) {
            throw new ORPCError("CONFLICT", {
              message: `Cannot approve: ${overlapCount} colleague(s) from the same department are already on approved leave during this period (department cap: ${MAX_DEPT_LEAVE_OVERLAP})`,
            });
          }
        }

        const [updated] = await db
          .update(leaveRequests)
          .set({
            status: "approved",
            approvedById: context.session.user.id,
            approvedAt: new Date(),
          })
          .where(eq(leaveRequests.id, input.id))
          .returning();

        // Update used balance
        await db
          .update(leaveBalances)
          .set({ used: sql`${leaveBalances.used} + ${before.totalDays}` })
          .where(
            and(
              eq(leaveBalances.staffProfileId, before.staffProfileId),
              eq(leaveBalances.leaveTypeId, before.leaveTypeId),
            ),
          );

        await createNotification({
          recipientId: before.staffProfile.userId,
          title: "Leave request approved",
          body: `Your leave from ${before.startDate} to ${before.endDate} has been approved.`,
          module: "leave",
          resourceType: "leave_request",
          resourceId: input.id,
          linkUrl: `/leave`,
        });

        await logAudit({
          actorId: context.session.user.id,
          actorName: context.session.user.name,
          action: "leave_request.approve",
          module: "leave",
          resourceType: "leave_request",
          resourceId: input.id,
          beforeValue: { status: before.status },
          afterValue: { status: "approved" },
          ipAddress: context.ipAddress,
          userAgent: context.userAgent,
          actorRole: context.userRole ?? undefined,
          correlationId: context.requestId,
        });

        return updated;
      }),

    reject: requireRole("leave", "reject")
      .input(z.object({ id: z.string(), rejectionReason: z.string().optional() }))
      .handler(async ({ input, context }) => {
        const before = await db.query.leaveRequests.findFirst({
          where: eq(leaveRequests.id, input.id),
          with: { staffProfile: true },
        });
        if (!before) throw new ORPCError("NOT_FOUND");
        if (before.status !== "pending")
          throw new ORPCError("CONFLICT", { message: "Request is not pending" });

        const [updated] = await db
          .update(leaveRequests)
          .set({
            status: "rejected",
            approvedById: context.session.user.id,
            approvedAt: new Date(),
            rejectionReason: input.rejectionReason ?? null,
          })
          .where(eq(leaveRequests.id, input.id))
          .returning();

        await createNotification({
          recipientId: before.staffProfile.userId,
          title: "Leave request rejected",
          body: input.rejectionReason ?? `Your leave request has been rejected.`,
          module: "leave",
          resourceType: "leave_request",
          resourceId: input.id,
        });

        await logAudit({
          actorId: context.session.user.id,
          actorName: context.session.user.name,
          action: "leave_request.reject",
          module: "leave",
          resourceType: "leave_request",
          resourceId: input.id,
          beforeValue: { status: before.status },
          afterValue: { status: "rejected", rejectionReason: input.rejectionReason },
          ipAddress: context.ipAddress,
          userAgent: context.userAgent,
          actorRole: context.userRole ?? undefined,
          correlationId: context.requestId,
        });

        return updated;
      }),

    cancel: requireRole("leave", "cancel")
      .input(z.object({ id: z.string() }))
      .handler(async ({ input, context }) => {
        const before = await db.query.leaveRequests.findFirst({
          where: eq(leaveRequests.id, input.id),
        });
        if (!before) throw new ORPCError("NOT_FOUND");
        if (!["pending", "approved"].includes(before.status))
          throw new ORPCError("CONFLICT", { message: "Cannot cancel this request" });

        const [updated] = await db
          .update(leaveRequests)
          .set({ status: "cancelled" })
          .where(eq(leaveRequests.id, input.id))
          .returning();

        // Return days to balance if cancelling an approved request
        if (before.status === "approved") {
          await db
            .update(leaveBalances)
            .set({ used: sql`GREATEST(0, ${leaveBalances.used} - ${before.totalDays})` })
            .where(
              and(
                eq(leaveBalances.staffProfileId, before.staffProfileId),
                eq(leaveBalances.leaveTypeId, before.leaveTypeId),
              ),
            );
        }

        await logAudit({
          actorId: context.session.user.id,
          actorName: context.session.user.name,
          action: "leave_request.cancel",
          module: "leave",
          resourceType: "leave_request",
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

    delete: requireRole("leave", "delete")
      .input(z.object({ id: z.string().min(1) }))
      .handler(async ({ input, context }) => {
        const before = await db.query.leaveRequests.findFirst({
          where: eq(leaveRequests.id, input.id),
        });
        if (!before) throw new ORPCError("NOT_FOUND");

        await db.delete(leaveRequests).where(eq(leaveRequests.id, input.id));

        await logAudit({
          actorId: context.session.user.id,
          actorName: context.session.user.name,
          actorRole: context.userRole ?? undefined,
          action: "leave_request.delete",
          module: "leave",
          resourceType: "leave_request",
          resourceId: input.id,
          beforeValue: before as Record<string, unknown>,
          ipAddress: context.ipAddress,
          userAgent: context.userAgent,
          correlationId: context.requestId,
        });

        return before;
      }),
  },

  // ── Team calendar: approved leave for a date range ─────────────────────
  getTeamCalendar: requireRole("leave", "read")
    .input(z.object({ from: z.string(), to: z.string(), departmentId: z.string().optional(), team: z.enum(["DCS", "NOC"]).optional() }))
    .handler(async ({ input }) => {
      const conditions = [
        eq(leaveRequests.status, "approved"),
        lte(leaveRequests.startDate, input.to),
        gte(leaveRequests.endDate, input.from),
      ];

      if (input.team) {
        const teamStaffIds = await getTeamStaffIds(input.team);
        if (teamStaffIds.length === 0) return [];
        conditions.push(inArray(leaveRequests.staffProfileId, teamStaffIds));
      }

      return db.query.leaveRequests.findMany({
        where: and(...conditions),
        with: {
          staffProfile: { with: { user: true, department: true } },
          leaveType: true,
        },
      });
    }),

  // ── Calendar events: birthdays and training reminders ────────────────────
  calendarEvents: {
    list: requireRole("leave", "read")
      .input(
        z.object({
          from: z.string(),
          to: z.string(),
          eventTypes: z
            .array(z.enum(["Birthday", "Training", "Event"]))
            .optional(),
        }),
      )
      .handler(async ({ input }) => {
        const conditions = [
          gte(calendarEvents.eventDate, input.from),
          lte(calendarEvents.eventDate, input.to),
        ];

        if (input.eventTypes?.length) {
          conditions.push(inArray(calendarEvents.eventType, input.eventTypes));
        }

        return db.query.calendarEvents.findMany({
          where: and(...conditions),
          with: {
            staffProfile: { with: { user: true, department: true } },
          },
          orderBy: (table, { asc }) => [asc(table.eventDate), asc(table.title)],
        });
      }),
  },

  // ── Validate leave request (check rules before submission) ───────────────
  validateRequest: requireRole("leave", "read")
    .input(
      z.object({
        staffId: z.string().min(1),
        leaveTypeId: z.string().min(1),
        startDate: z.string(),
        endDate: z.string(),
      }),
    )
    .handler(async ({ input }) => {
      const violations: string[] = [];
      let status: "ok" | "warning" | "blocked" = "ok";

      const start = new Date(input.startDate);
      const end = new Date(input.endDate);

      // Rule: start must be <= end
      if (start > end) {
        violations.push("start_after_end");
        status = "blocked";
      }

      // Rule: balance check for annual leave
      const leaveType = await db.query.leaveTypes.findFirst({
        where: eq(leaveTypes.id, input.leaveTypeId),
      });

      if (leaveType && leaveType.name.toLowerCase().includes("annual")) {
        const yearStart = `${start.getFullYear()}-01-01`;
        const balance = await db.query.leaveBalances.findFirst({
          where: and(
            eq(leaveBalances.staffProfileId, input.staffId),
            eq(leaveBalances.leaveTypeId, input.leaveTypeId),
            eq(leaveBalances.contractYearStart, yearStart),
          ),
        });

        if (balance) {
          const requestedDays = Math.ceil(
            (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24),
          ) + 1;
          const available = balance.entitlement + balance.carriedOver + balance.adjustment - balance.used;
          if (requestedDays > available) {
            violations.push("insufficient_balance");
            if (status === "ok") status = "warning";
          }
        }

        // Rule: blocked months for annual leave (July, August, November)
        const startMonth = start.getMonth() + 1; // 1-indexed
        if ([7, 8, 11].includes(startMonth)) {
          violations.push("blocked_month");
          if (status === "ok") status = "warning";
        }
      }

      return { status, violations };
    }),

  // ── TOSD Records (Time Off & Sick Days) ───────────────────────────────────
  tosd: {
    list: requireRole("leave", "read")
      .input(
        z.object({
          staffId: z.string().optional(),
          year: z.number().int().optional(),
        }),
      )
      .handler(async ({ input }) => {
        const conditions = [];
        if (input.staffId) {
          conditions.push(eq(tosdRecords.staffId, input.staffId));
        }
        if (input.year) {
          const yearStart = `${input.year}-01-01`;
          const yearEnd = `${input.year}-12-31`;
          conditions.push(gte(tosdRecords.date, yearStart));
          conditions.push(lte(tosdRecords.date, yearEnd));
        }

        return db.query.tosdRecords.findMany({
          where: conditions.length > 0 ? and(...conditions) : undefined,
          with: {
            staffProfile: { with: { user: true, department: true } },
          },
          orderBy: (table, { desc }) => [desc(table.date)],
        });
      }),

    create: requireRole("leave", "create")
      .input(
        z.object({
          staffId: z.string().min(1),
          date: z.string(),
          type: z.enum(tosdTypeEnum),
          reasonText: z.string().optional(),
          days: z.string().optional(),
          hours: z.string().optional(),
        }),
      )
      .handler(async ({ input, context }) => {
        const [created] = await db
          .insert(tosdRecords)
          .values({
            staffId: input.staffId,
            date: input.date,
            type: input.type,
            reasonText: input.reasonText ?? null,
            days: input.days ?? null,
            hours: input.hours ?? null,
          })
          .returning();

        if (!created) throw new ORPCError("INTERNAL_SERVER_ERROR");

        await logAudit({
          actorId: context.session.user.id,
          actorName: context.session.user.name,
          actorRole: context.userRole ?? undefined,
          action: "leave.tosd.create",
          module: "leave",
          resourceType: "tosd_record",
          resourceId: created.id,
          afterValue: created as Record<string, unknown>,
          ipAddress: context.ipAddress,
          userAgent: context.userAgent,
          correlationId: context.requestId,
        });

        return created;
      }),

    update: requireRole("leave", "update")
      .input(
        z.object({
          id: z.string().min(1),
          type: z.enum(tosdTypeEnum).optional(),
          reasonText: z.string().nullable().optional(),
          days: z.string().nullable().optional(),
          hours: z.string().nullable().optional(),
        }),
      )
      .handler(async ({ input, context }) => {
        const before = await db.query.tosdRecords.findFirst({
          where: eq(tosdRecords.id, input.id),
        });
        if (!before) throw new ORPCError("NOT_FOUND");

        const nextValues: Record<string, unknown> = {
          updatedAt: new Date(),
        };
        if (input.type !== undefined) nextValues.type = input.type;
        if (input.reasonText !== undefined) nextValues.reasonText = input.reasonText;
        if (input.days !== undefined) nextValues.days = input.days;
        if (input.hours !== undefined) nextValues.hours = input.hours;

        const [updated] = await db
          .update(tosdRecords)
          .set(nextValues)
          .where(eq(tosdRecords.id, input.id))
          .returning();
        if (!updated) throw new ORPCError("INTERNAL_SERVER_ERROR");

        await logAudit({
          actorId: context.session.user.id,
          actorName: context.session.user.name,
          actorRole: context.userRole ?? undefined,
          action: "leave.tosd.update",
          module: "leave",
          resourceType: "tosd_record",
          resourceId: input.id,
          beforeValue: before as Record<string, unknown>,
          afterValue: updated as Record<string, unknown>,
          ipAddress: context.ipAddress,
          userAgent: context.userAgent,
          correlationId: context.requestId,
        });

        return updated;
      }),

    delete: requireRole("leave", "delete")
      .input(z.object({ id: z.string().min(1) }))
      .handler(async ({ input, context }) => {
        const before = await db.query.tosdRecords.findFirst({
          where: eq(tosdRecords.id, input.id),
        });
        if (!before) throw new ORPCError("NOT_FOUND");

        await db.delete(tosdRecords).where(eq(tosdRecords.id, input.id));

        await logAudit({
          actorId: context.session.user.id,
          actorName: context.session.user.name,
          actorRole: context.userRole ?? undefined,
          action: "leave.tosd.delete",
          module: "leave",
          resourceType: "tosd_record",
          resourceId: input.id,
          beforeValue: before as Record<string, unknown>,
          ipAddress: context.ipAddress,
          userAgent: context.userAgent,
          correlationId: context.requestId,
        });

        return before;
      }),
  },
};
