import { ORPCError } from "@orpc/server";
import { and, asc, desc, eq, inArray, lte, sql } from "drizzle-orm";
import { z } from "zod";

import {
  appraisals,
  appraisalFollowups,
  appraisalTracker,
  examDates,
  db,
  staffProfiles,
  staffPromotions,
} from "@ndma-dcs-staff-portal/db";

import { requireRole } from "../index";
import { logAudit } from "../lib/audit";
import {
  canAccessStaffPrivate,
  getCallerStaffProfile,
  getManagedStaffIds,
} from "../lib/scope";
import { getTeamStaffIds } from "../lib/team";
import { createNotification } from "../lib/notify";

const ratingMatrixSchema = z.object({
  organisational_skills: z.number().min(1).max(5),
  quality_of_work: z.number().min(1).max(5),
  dependability: z.number().min(1).max(5),
  communication_skills: z.number().min(1).max(5),
  cooperation: z.number().min(1).max(5),
  initiative: z.number().min(1).max(5),
  technical_skills: z.number().min(1).max(5),
  attendance_punctuality: z.number().min(1).max(5),
});

const appraisalStatusSchema = z.enum([
  "draft",
  "in_progress",
  "submitted",
  "approved",
  "rejected",
  "completed",
  "overdue",
]);

function normalizeKey(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

function computePercentage(ratingMatrix: Record<string, number>) {
  const values = Object.values(ratingMatrix);
  if (values.length === 0) {
    return null;
  }
  const average = values.reduce((sum, value) => sum + value, 0) / values.length;
  return Math.round((average / 5) * 100);
}

async function canAccessAppraisal(context: Parameters<typeof canAccessStaffPrivate>[0], staffProfileId: string) {
  const role = context.userRole ?? "";
  if (role === "admin" || role === "hrAdminOps") {
    return true;
  }
  return canAccessStaffPrivate(context, staffProfileId);
}

async function notifyRelatedPeople(appraisal: {
  staffProfileId: string;
  reviewerId: string | null;
  teamLeadId: string | null;
}, title: string, body: string, module: string, resourceId: string) {
  const recipients = new Set<string>();

  const staff = await db.query.staffProfiles.findFirst({
    where: eq(staffProfiles.id, appraisal.staffProfileId),
    with: { user: true },
  });
  if (staff?.user?.id) {
    recipients.add(staff.user.id);
  }

  if (appraisal.reviewerId) {
    const reviewer = await db.query.staffProfiles.findFirst({
      where: eq(staffProfiles.id, appraisal.reviewerId),
      with: { user: true },
    });
    if (reviewer?.user?.id) {
      recipients.add(reviewer.user.id);
    }
  }

  if (appraisal.teamLeadId) {
    const lead = await db.query.staffProfiles.findFirst({
      where: eq(staffProfiles.id, appraisal.teamLeadId),
      with: { user: true },
    });
    if (lead?.user?.id) {
      recipients.add(lead.user.id);
    }
  }

  await Promise.all(
    [...recipients].map((recipientId) =>
      createNotification({
        recipientId,
        title,
        body,
        module,
        resourceType: "appraisal",
        resourceId,
      }),
    ),
  );
}

async function fetchAppraisal(id: string) {
  return db.query.appraisals.findFirst({
    where: eq(appraisals.id, id),
    with: {
      staffProfile: { with: { user: true, department: true, teamLead: true } },
      reviewer: { with: { user: true } },
      teamLead: { with: { user: true } },
      scores: true,
      notes: true,
      submittedBy: true,
      approvedBy: true,
      rejectedBy: true,
      cycle: true,
    },
  });
}

async function getDepartmentStaffIds(departmentId: string) {
  const rows = await db
    .select({ id: staffProfiles.id })
    .from(staffProfiles)
    .where(eq(staffProfiles.departmentId, departmentId));
  return rows.map((row) => row.id);
}

function parseAverageScore(rows: Array<{ totalScore: number | null }>) {
  const scores = rows
    .map((row) => row.totalScore)
    .filter((score): score is number => typeof score === "number" && Number.isFinite(score));
  if (!scores.length) return null;
  return Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length);
}

function normalizeKpiStatus(status: string | null | undefined): string {
  const s = String(status ?? "").toLowerCase();
  if (s === "draft" || s === "in_progress") return "draft";
  if (s === "submitted") return "submitted";
  if (s === "approved") return "approved";
  if (s === "completed") return "completed";
  if (s === "rejected") return "rejected";
  if (s === "overdue") return "overdue";
  return "other";
}

async function resolveAppraisalScope(
  context: Parameters<typeof canAccessStaffPrivate>[0],
  input: { staffProfileId?: string; team?: "DCS" | "NOC"; departmentId?: string },
) {
  const role = context.userRole ?? "";
  const isPrivileged = role === "admin" || role === "hrAdminOps";
  const caller = await getCallerStaffProfile(context);
  const managedStaffIds = isPrivileged ? null : new Set(await getManagedStaffIds(context));
  if (managedStaffIds && caller?.id) {
    managedStaffIds.add(caller.id);
  }

  if (input.staffProfileId) {
    await assertVisibleOrThrow(context, input.staffProfileId);
    return [input.staffProfileId];
  }

  if (input.team) {
    const teamStaffIds = await getTeamStaffIds(input.team);
    if (teamStaffIds.length === 0) {
      return [];
    }
    return isPrivileged || !managedStaffIds
      ? teamStaffIds
      : teamStaffIds.filter((id) => managedStaffIds.has(id));
  }

  if (input.departmentId) {
    const departmentStaffIds = await getDepartmentStaffIds(input.departmentId);
    if (departmentStaffIds.length === 0) {
      return [];
    }
    return isPrivileged || !managedStaffIds
      ? departmentStaffIds
      : departmentStaffIds.filter((id) => managedStaffIds.has(id));
  }

  if (isPrivileged) {
    return null;
  }

  return managedStaffIds ? [...managedStaffIds] : [];
}

async function assertVisibleOrThrow(
  context: Parameters<typeof canAccessStaffPrivate>[0],
  staffProfileId: string,
) {
  const allowed = await canAccessAppraisal(context, staffProfileId);
  if (!allowed) {
    throw new ORPCError("FORBIDDEN");
  }
}

export const appraisalsRouter = {
  list: requireRole("appraisal", "read")
    .input(
      z.object({
        staffProfileId: z.string().optional(),
        departmentId: z.string().optional(),
        team: z.enum(["DCS", "NOC"]).optional(),
        cycleId: z.string().optional(),
        status: appraisalStatusSchema.optional(),
        limit: z.number().min(1).max(200).default(50),
        offset: z.number().min(0).default(0),
      }),
    )
    .handler(async ({ input, context }) => {
      const caller = await getCallerStaffProfile(context);
      const role = context.userRole ?? "";
      const isPrivileged = role === "admin" || role === "hrAdminOps";
      const accessibleStaffIds = isPrivileged ? null : new Set(await getManagedStaffIds(context));
      if (accessibleStaffIds && caller?.id) {
        accessibleStaffIds.add(caller.id);
      }

      const conditions = [];
      if (input.staffProfileId) {
        await assertVisibleOrThrow(context, input.staffProfileId);
        conditions.push(eq(appraisals.staffProfileId, input.staffProfileId));
      } else if (input.team) {
        const teamStaffIds = await getTeamStaffIds(input.team);
        const staffIds =
          isPrivileged || !accessibleStaffIds
            ? teamStaffIds
            : teamStaffIds.filter((id) => accessibleStaffIds.has(id));
        if (staffIds.length === 0) {
          return [];
        }
        conditions.push(inArray(appraisals.staffProfileId, staffIds));
      } else if (input.departmentId) {
        const departmentStaffIds = await getDepartmentStaffIds(input.departmentId);
        const staffIds =
          isPrivileged || !accessibleStaffIds
            ? departmentStaffIds
            : departmentStaffIds.filter((id) => accessibleStaffIds.has(id));

        if (staffIds.length === 0) {
          return [];
        }
        conditions.push(inArray(appraisals.staffProfileId, staffIds));
      } else if (!isPrivileged) {
        if (!accessibleStaffIds || accessibleStaffIds.size === 0) {
          return [];
        }
        conditions.push(inArray(appraisals.staffProfileId, [...accessibleStaffIds]));
      }

      if (input.cycleId) {
        conditions.push(eq(appraisals.cycleId, input.cycleId));
      }
      if (input.status) {
        conditions.push(eq(appraisals.status, input.status));
      }

      return db.query.appraisals.findMany({
        where: conditions.length > 0 ? and(...conditions) : undefined,
        with: {
          staffProfile: { with: { user: true, department: true, teamLead: true } },
          reviewer: { with: { user: true } },
          teamLead: { with: { user: true } },
          cycle: true,
        },
        orderBy: [desc(appraisals.updatedAt), desc(appraisals.createdAt)],
        limit: input.limit,
        offset: input.offset,
      });
    }),

  get: requireRole("appraisal", "read")
    .input(z.object({ id: z.string() }))
    .handler(async ({ input, context }) => {
      const appraisal = await fetchAppraisal(input.id);
      if (!appraisal) {
        throw new ORPCError("NOT_FOUND");
      }

      await assertVisibleOrThrow(context, appraisal.staffProfileId);
      return appraisal;
    }),

  getByStaff: requireRole("appraisal", "read")
    .input(z.object({ staffProfileId: z.string(), team: z.enum(["DCS", "NOC"]).optional() }))
    .handler(async ({ input, context }) => {
      if (input.team) {
        const teamStaffIds = await getTeamStaffIds(input.team);
        if (!teamStaffIds.includes(input.staffProfileId)) {
          throw new ORPCError("FORBIDDEN");
        }
      }
      await assertVisibleOrThrow(context, input.staffProfileId);
      return db.query.appraisals.findMany({
        where: eq(appraisals.staffProfileId, input.staffProfileId),
        with: {
          reviewer: { with: { user: true } },
          teamLead: { with: { user: true } },
          cycle: true,
        },
        orderBy: [desc(appraisals.createdAt)],
      });
    }),

  getStaffSummary: requireRole("appraisal", "read")
    .input(z.object({ staffProfileId: z.string(), team: z.enum(["DCS", "NOC"]).optional() }))
    .handler(async ({ input, context }) => {
      if (input.team) {
        const teamStaffIds = await getTeamStaffIds(input.team);
        if (!teamStaffIds.includes(input.staffProfileId)) {
          throw new ORPCError("FORBIDDEN");
        }
      }
      await assertVisibleOrThrow(context, input.staffProfileId);

      const staffProfile = await db.query.staffProfiles.findFirst({
        where: eq(staffProfiles.id, input.staffProfileId),
        with: { user: true, department: true, teamLead: true },
      });
      if (!staffProfile) {
        throw new ORPCError("NOT_FOUND", { message: "Staff profile not found." });
      }

      const evaluations = await db.query.appraisals.findMany({
        where: eq(appraisals.staffProfileId, input.staffProfileId),
        with: {
          reviewer: { with: { user: true } },
          staffProfile: { with: { user: true, department: true } },
          scores: true,
          notes: true,
        },
        orderBy: [desc(appraisals.year), desc(appraisals.createdAt)],
      });

      const averageTotalScore = parseAverageScore(evaluations);
      const latestEvaluation = evaluations[0] ?? null;

      return {
        staffProfile,
        summary: {
          averageTotalScore,
          evaluationCount: evaluations.length,
          latestYear: latestEvaluation?.year ?? null,
          latestPeriod: latestEvaluation?.period ?? null,
          latestStatus: latestEvaluation?.status ?? null,
        },
        evaluations,
      };
    }),

  kpis: {
    summary: requireRole("appraisal", "read")
      .input(
        z.object({
          staffProfileId: z.string().optional(),
          departmentId: z.string().optional(),
          team: z.enum(["DCS", "NOC"]).optional(),
          cycleId: z.string().optional(),
        }),
      )
      .handler(async ({ input, context }) => {
        const staffScope = await resolveAppraisalScope(context, input);
        if (staffScope?.length === 0) {
          return {
            totalEvaluations: 0,
            averageScore: null,
            completionRate: 0,
            pendingCount: 0,
            approvedCount: 0,
            processedCount: 0,
            completedCount: 0,
            overdueCount: 0,
            dueSoonFollowups: 0,
            overdueFollowups: 0,
            scoreBands: [],
            statusBreakdown: [],
            cycleBreakdown: [],
          };
        }

        const conditions = [];
        if (staffScope) {
          conditions.push(inArray(appraisals.staffProfileId, staffScope));
        }
        if (input.cycleId) {
          conditions.push(eq(appraisals.cycleId, input.cycleId));
        }

        const appraisalRows = await db.query.appraisals.findMany({
          where: conditions.length > 0 ? and(...conditions) : undefined,
          columns: {
            id: true,
            status: true,
            totalScore: true,
            year: true,
            period: true,
            cycleId: true,
          },
        });

        const statusCounts = new Map<string, number>();
        const scoreBands = new Map<string, number>([
          ["90-100", 0],
          ["80-89", 0],
          ["70-79", 0],
          ["Below 70", 0],
          ["No Score", 0],
        ]);
        const cycleMap = new Map<string, {
          year: number | null;
          period: string | null;
          total: number;
          completed: number;
          averageScore: number | null;
        }>();

        let completedFinal = 0;
        for (const appraisal of appraisalRows) {
          const bucket = normalizeKpiStatus(appraisal.status);
          statusCounts.set(bucket, (statusCounts.get(bucket) ?? 0) + 1);
          if (bucket === "completed" || bucket === "approved") {
            completedFinal += 1;
          }

          if (typeof appraisal.totalScore === "number") {
            if (appraisal.totalScore >= 90) scoreBands.set("90-100", (scoreBands.get("90-100") ?? 0) + 1);
            else if (appraisal.totalScore >= 80) scoreBands.set("80-89", (scoreBands.get("80-89") ?? 0) + 1);
            else if (appraisal.totalScore >= 70) scoreBands.set("70-79", (scoreBands.get("70-79") ?? 0) + 1);
            else scoreBands.set("Below 70", (scoreBands.get("Below 70") ?? 0) + 1);
          } else {
            scoreBands.set("No Score", (scoreBands.get("No Score") ?? 0) + 1);
          }

          const cycleKey = appraisal.cycleId ?? `${appraisal.year ?? "unknown"}|${appraisal.period ?? "Unknown"}`;
          const existing = cycleMap.get(cycleKey) ?? {
            year: appraisal.year ?? null,
            period: appraisal.period ?? null,
            total: 0,
            completed: 0,
            averageScore: null,
          };
          existing.total += 1;
          if (bucket === "completed" || bucket === "approved") {
            existing.completed += 1;
          }
          if (typeof appraisal.totalScore === "number") {
            const currentTotal = existing.averageScore == null ? appraisal.totalScore : existing.averageScore * (existing.total - 1) + appraisal.totalScore;
            existing.averageScore = Math.round(currentTotal / existing.total);
          }
          cycleMap.set(cycleKey, existing);
        }

        const followupConditions = [];
        if (staffScope) {
          followupConditions.push(inArray(appraisals.staffProfileId, staffScope));
        }
        if (input.cycleId) {
          followupConditions.push(eq(appraisals.cycleId, input.cycleId));
        }

        const followups = await db
          .select({
            dueDate: appraisalFollowups.dueDate,
            completedAt: appraisalFollowups.completedAt,
          })
          .from(appraisalFollowups)
          .innerJoin(appraisals, eq(appraisalFollowups.appraisalId, appraisals.id))
          .where(followupConditions.length > 0 ? and(...followupConditions) : undefined);

        const today = new Date();
        const dueSoonCutoff = new Date(today);
        dueSoonCutoff.setDate(dueSoonCutoff.getDate() + 14);
        const dueSoonFollowups = followups.filter((followup) => {
          if (followup.completedAt) return false;
          const dueDate = new Date(followup.dueDate);
          return dueDate >= today && dueDate <= dueSoonCutoff;
        }).length;
        const overdueFollowups = followups.filter((followup) => {
          if (followup.completedAt) return false;
          return new Date(followup.dueDate) < today;
        }).length;

        const totalEvaluations = appraisalRows.length;
        const averageScore = parseAverageScore(appraisalRows);
        const completionRate =
          totalEvaluations > 0
            ? Math.round((completedFinal / totalEvaluations) * 100)
            : 0;

        return {
          totalEvaluations,
          averageScore,
          completionRate,
          pendingCount: statusCounts.get("submitted") ?? 0,
          approvedCount: statusCounts.get("approved") ?? 0,
          processedCount: statusCounts.get("approved") ?? 0,
          completedCount: statusCounts.get("completed") ?? 0,
          overdueCount: statusCounts.get("overdue") ?? 0,
          dueSoonFollowups,
          overdueFollowups,
          scoreBands: [...scoreBands.entries()].map(([label, count]) => ({ label, count })),
          statusBreakdown: [...statusCounts.entries()].map(([status, count]) => ({ status, count })),
          cycleBreakdown: [...cycleMap.values()]
            .sort((a, b) => {
              const aYear = a.year ?? 0;
              const bYear = b.year ?? 0;
              if (aYear !== bYear) return bYear - aYear;
              return (b.averageScore ?? 0) - (a.averageScore ?? 0);
            })
            .slice(0, 8),
        };
      }),
  },
    tracker: {
    list: requireRole("appraisal", "read")
      .input(
        z.object({
          departmentId: z.string().optional(),
          team: z.enum(["DCS", "NOC"]).optional(),
          year: z.number().int().optional(),
          period: z.string().optional(),
        }),
      )
      .handler(async ({ input, context }) => {
        const role = context.userRole ?? "";
        const isPrivileged = role === "admin" || role === "hrAdminOps";
        const whereConditions = [];
        if (input.departmentId) {
          if (!isPrivileged) {
            const caller = await getCallerStaffProfile(context);
            const accessibleStaffIds = new Set(await getManagedStaffIds(context));
            if (caller?.id) {
              accessibleStaffIds.add(caller.id);
            }
            const accessibleDepartments = await db
              .select({ departmentId: staffProfiles.departmentId })
              .from(staffProfiles)
              .where(
                and(
                  inArray(staffProfiles.id, [...accessibleStaffIds]),
                  sql`${staffProfiles.departmentId} IS NOT NULL`,
                ),
              )
              .groupBy(staffProfiles.departmentId);
            const allowedDepartments = new Set(
              accessibleDepartments
                .map((row) => row.departmentId)
                .filter((departmentId): departmentId is string => Boolean(departmentId)),
            );
            if (!allowedDepartments.has(input.departmentId)) {
              return [];
            }
          }
          whereConditions.push(eq(appraisalTracker.departmentId, input.departmentId));
        } else if (input.team) {
          const teamStaffIds = await getTeamStaffIds(input.team);
          if (teamStaffIds.length === 0) {
            return [];
          }
          const teamDepartments = await db
            .select({ departmentId: staffProfiles.departmentId })
            .from(staffProfiles)
            .where(inArray(staffProfiles.id, teamStaffIds))
            .groupBy(staffProfiles.departmentId);
          const departmentIds = teamDepartments
            .map((row) => row.departmentId)
            .filter((departmentId): departmentId is string => Boolean(departmentId));
          if (departmentIds.length === 0) {
            return [];
          }
          whereConditions.push(inArray(appraisalTracker.departmentId, departmentIds));
        } else if (!isPrivileged) {
          const caller = await getCallerStaffProfile(context);
          const accessibleStaffIds = new Set(await getManagedStaffIds(context));
          if (caller?.id) {
            accessibleStaffIds.add(caller.id);
          }
          if (accessibleStaffIds.size === 0) {
            return [];
          }

          const accessibleDepartments = await db
            .select({ departmentId: staffProfiles.departmentId })
            .from(staffProfiles)
            .where(
              and(
                inArray(staffProfiles.id, [...accessibleStaffIds]),
                sql`${staffProfiles.departmentId} IS NOT NULL`,
              ),
            )
            .groupBy(staffProfiles.departmentId);

          const departmentIds = accessibleDepartments
            .map((row) => row.departmentId)
            .filter((departmentId): departmentId is string => Boolean(departmentId));
          if (departmentIds.length === 0) {
            return [];
          }
          whereConditions.push(inArray(appraisalTracker.departmentId, departmentIds));
        }

        if (input.year) {
          whereConditions.push(eq(appraisalTracker.year, input.year));
        }
        if (input.period) {
          whereConditions.push(eq(appraisalTracker.period, input.period));
        }

        const rows = await db.query.appraisalTracker.findMany({
          where: whereConditions.length > 0 ? and(...whereConditions) : undefined,
          with: {
            department: true,
          },
          orderBy: [asc(appraisalTracker.year), asc(appraisalTracker.period)],
        });

        return rows.map((row) => ({
          id: row.id,
          departmentId: row.departmentId,
          departmentName: row.department?.name ?? "Unassigned",
          departmentCode: row.department?.code ?? "—",
          year: row.year,
          period: row.period,
          totalCount: row.totalCount,
          draftCount: row.draftCount,
          scheduledCount: row.scheduledCount,
          inProgressCount: row.inProgressCount,
          submittedCount: row.submittedCount,
          approvedCount: row.approvedCount,
          rejectedCount: row.rejectedCount,
          completedCount: row.completedCount,
          overdueCount: row.overdueCount,
        }));
      }),
  },

  workflow: {
    list: requireRole("appraisal", "read")
      .input(
        z.object({
          team: z.enum(["DCS", "NOC"]).optional(),
          status: z
            .enum([
              "draft",
              "in_progress",
              "submitted",
              "approved",
              "completed",
            ])
            .optional(),
        }),
      )
      .handler(async ({ input, context }) => {
        const conditions = [];
        if (input.team) {
          const teamStaffIds = await getTeamStaffIds(input.team);
          if (teamStaffIds.length === 0) return [];
          conditions.push(inArray(appraisals.staffProfileId, teamStaffIds));
        }
        if (input.status) {
          conditions.push(eq(appraisals.status, input.status));
        } else {
          conditions.push(
            inArray(appraisals.status, [
              "draft",
              "in_progress",
              "submitted",
              "approved",
              "completed",
            ]),
          );
        }

        const role = context.userRole ?? "";
        if (role !== "admin" && role !== "hrAdminOps") {
          const managed = new Set(await getManagedStaffIds(context));
          const caller = await getCallerStaffProfile(context);
          if (caller?.id) managed.add(caller.id);
          if (managed.size === 0) return [];
          conditions.push(inArray(appraisals.staffProfileId, [...managed]));
        }

        return db.query.appraisals.findMany({
          where: and(...conditions),
          with: {
            staffProfile: { with: { user: true, department: true } },
            reviewer: { with: { user: true } },
            teamLead: { with: { user: true } },
            cycle: true,
          },
          orderBy: [desc(appraisals.updatedAt), desc(appraisals.createdAt)],
        });
      }),

    submit: requireRole("appraisal", "submit")
      .input(z.object({ id: z.string() }))
      .handler(async ({ input, context }) => {
        const before = await db.query.appraisals.findFirst({ where: eq(appraisals.id, input.id) });
        if (!before) throw new ORPCError("NOT_FOUND");

        const [updated] = await db
          .update(appraisals)
          .set({
            status: "submitted",
            submittedAt: new Date(),
            submittedById: context.session.user.id,
            updatedAt: new Date(),
          })
          .where(eq(appraisals.id, input.id))
          .returning();
        if (!updated) throw new ORPCError("INTERNAL_SERVER_ERROR");

        await createNotification({
          recipientId: before.reviewerId ? (await db.query.staffProfiles.findFirst({ where: eq(staffProfiles.id, before.reviewerId), with: { user: true } }))?.user?.id ?? context.session.user.id : context.session.user.id,
          title: "Appraisal submitted for approval",
          body: `Appraisal for ${before.staffProfileId} is now pending approval.`,
          module: "appraisal",
          resourceType: "appraisal",
          resourceId: updated.id,
          linkUrl: `/appraisals/${updated.id}`,
        });

        await logAudit({
          actorId: context.session.user.id,
          actorName: context.session.user.name,
          action: "appraisal.workflow.submit",
          module: "staff",
          resourceType: "appraisal",
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

    approve: requireRole("appraisal", "approve")
      .input(z.object({ id: z.string() }))
      .handler(async ({ input, context }) => {
        const before = await db.query.appraisals.findFirst({ where: eq(appraisals.id, input.id) });
        if (!before) throw new ORPCError("NOT_FOUND");

        const [updated] = await db
          .update(appraisals)
          .set({
            status: "approved",
            approvedAt: new Date(),
            approvedById: context.session.user.id,
            updatedAt: new Date(),
          })
          .where(eq(appraisals.id, input.id))
          .returning();
        if (!updated) throw new ORPCError("INTERNAL_SERVER_ERROR");

        await createNotification({
          recipientId: context.session.user.id,
          title: "Appraisal approved by manager",
          body: `Appraisal for ${before.staffProfileId} is ready for PA processing.`,
          module: "appraisal",
          resourceType: "appraisal",
          resourceId: updated.id,
          linkUrl: `/appraisals/${updated.id}`,
        });

        await logAudit({
          actorId: context.session.user.id,
          actorName: context.session.user.name,
          action: "appraisal.workflow.approve",
          module: "staff",
          resourceType: "appraisal",
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

    process: requireRole("appraisal", "process")
      .input(z.object({ id: z.string() }))
      .handler(async ({ input, context }) => {
        const before = await db.query.appraisals.findFirst({ where: eq(appraisals.id, input.id) });
        if (!before) throw new ORPCError("NOT_FOUND");

        const [updated] = await db
          .update(appraisals)
          .set({
            status: "completed",
            updatedAt: new Date(),
          })
          .where(eq(appraisals.id, input.id))
          .returning();
        if (!updated) throw new ORPCError("INTERNAL_SERVER_ERROR");

        await createNotification({
          recipientId: context.session.user.id,
          title: "Appraisal processed for HR",
          body: `Appraisal for ${before.staffProfileId} has been exported and sent to HR.`,
          module: "appraisal",
          resourceType: "appraisal",
          resourceId: updated.id,
          linkUrl: `/appraisals/${updated.id}`,
        });

        await logAudit({
          actorId: context.session.user.id,
          actorName: context.session.user.name,
          action: "appraisal.workflow.process",
          module: "staff",
          resourceType: "appraisal",
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
  },

  exams: {
    list: requireRole("appraisal", "read")
      .input(
        z.object({
          staffProfileId: z.string().optional(),
          team: z.enum(["DCS", "NOC"]).optional(),
          status: z.enum(["Scheduled", "Passed", "Failed"]).optional(),
        }),
      )
      .handler(async ({ input, context }) => {
        const conditions = [];
        if (input.staffProfileId) {
          await assertVisibleOrThrow(context, input.staffProfileId);
          conditions.push(eq(examDates.staffId, input.staffProfileId));
        } else if (input.team) {
          const teamStaffIds = await getTeamStaffIds(input.team);
          if (teamStaffIds.length === 0) return [];
          conditions.push(inArray(examDates.staffId, teamStaffIds));
        } else {
          const role = context.userRole ?? "";
          if (role !== "admin" && role !== "hrAdminOps") {
            const managed = new Set(await getManagedStaffIds(context));
            const caller = await getCallerStaffProfile(context);
            if (caller?.id) managed.add(caller.id);
            if (managed.size === 0) return [];
            conditions.push(inArray(examDates.staffId, [...managed]));
          }
        }

        if (input.status) conditions.push(eq(examDates.status, input.status));

        return db.query.examDates.findMany({
          where: conditions.length > 0 ? and(...conditions) : undefined,
          with: { staffProfile: { with: { user: true, department: true } } },
          orderBy: [asc(examDates.scheduledDate), asc(examDates.examName)],
        });
      }),
  },

  promotions: {
    list: requireRole("appraisal", "read")
      .input(z.object({ staffProfileId: z.string().optional(), team: z.enum(["DCS", "NOC"]).optional() }))
      .handler(async ({ input, context }) => {
        const conditions = [];
        if (input.staffProfileId) {
          await assertVisibleOrThrow(context, input.staffProfileId);
          conditions.push(eq(staffPromotions.staffId, input.staffProfileId));
        } else if (input.team) {
          const teamStaffIds = await getTeamStaffIds(input.team);
          if (teamStaffIds.length === 0) return [];
          conditions.push(inArray(staffPromotions.staffId, teamStaffIds));
        } else {
          const role = context.userRole ?? "";
          if (role !== "admin" && role !== "hrAdminOps") {
            const managed = new Set(await getManagedStaffIds(context));
            const caller = await getCallerStaffProfile(context);
            if (caller?.id) managed.add(caller.id);
            if (managed.size === 0) return [];
            conditions.push(inArray(staffPromotions.staffId, [...managed]));
          }
        }

        return db.query.staffPromotions.findMany({
          where: conditions.length > 0 ? and(...conditions) : undefined,
          with: { staffProfile: { with: { user: true, department: true } } },
          orderBy: [desc(staffPromotions.promotionDate), desc(staffPromotions.id)],
        });
      }),

    create: requireRole("appraisal", "update")
      .input(
        z.object({
          staffProfileId: z.string(),
          promotionDate: z.string(),
          letterDate: z.string().optional(),
          fromTitle: z.string().optional(),
          toTitle: z.string().min(1),
          letterUrl: z.string().optional(),
          notes: z.string().optional(),
        }),
      )
      .handler(async ({ input, context }) => {
        await assertVisibleOrThrow(context, input.staffProfileId);
        const [row] = await db
          .insert(staffPromotions)
          .values({
            staffId: input.staffProfileId,
            promotionDate: input.promotionDate,
            letterDate: input.letterDate ?? null,
            fromTitle: input.fromTitle ?? null,
            toTitle: input.toTitle,
            letterUrl: input.letterUrl ?? null,
            notes: input.notes ?? null,
          })
          .returning();
        if (!row) throw new ORPCError("INTERNAL_SERVER_ERROR");

        await logAudit({
          actorId: context.session.user.id,
          actorName: context.session.user.name,
          actorRole: context.userRole ?? undefined,
          action: "appraisal.promotion.create",
          module: "staff",
          resourceType: "staff_promotion",
          resourceId: String(row.id),
          afterValue: row as Record<string, unknown>,
          ipAddress: context.ipAddress,
          userAgent: context.userAgent,
          correlationId: context.requestId,
        });

        return row;
      }),
  },

  getOverdue: requireRole("appraisal", "read").handler(async ({ context }) => {
    const today = new Date().toISOString().slice(0, 10);
    const caller = await getCallerStaffProfile(context);
    const role = context.userRole ?? "";

    const conditions = [
      sql`${appraisals.scheduledDate} IS NOT NULL`,
      lte(appraisals.scheduledDate, today),
      sql`${appraisals.status} NOT IN ('completed', 'approved', 'rejected')`,
    ];

    if (role !== "admin" && role !== "hrAdminOps") {
      const accessible = new Set(await getManagedStaffIds(context));
      if (caller?.id) {
        accessible.add(caller.id);
      }
      if (accessible.size === 0) {
        return [];
      }
      conditions.push(inArray(appraisals.staffProfileId, [...accessible]));
    }

    return db.query.appraisals.findMany({
      where: and(...conditions),
      with: {
        staffProfile: { with: { user: true, department: true, teamLead: true } },
        reviewer: { with: { user: true } },
        teamLead: { with: { user: true } },
      },
      orderBy: [asc(appraisals.scheduledDate)],
    });
  }),

  create: requireRole("appraisal", "create")
    .input(
      z.object({
        staffProfileId: z.string(),
        cycleId: z.string().optional(),
        reviewerId: z.string().optional(),
        year: z.number().int().optional(),
        period: z.string().optional(),
        totalScore: z.number().int().optional(),
        periodStart: z.string(),
        periodEnd: z.string(),
        scheduledDate: z.string().optional(),
        location: z.string().optional(),
        typeOfReview: z.string().optional(),
        objectives: z
          .array(
            z.object({
              title: z.string(),
              rating: z.number().optional(),
              comments: z.string().optional(),
            }),
          )
          .optional(),
        achievements: z.array(z.string()).optional(),
        goals: z.array(z.string()).optional(),
        ratingMatrix: ratingMatrixSchema.optional(),
      }),
    )
    .handler(async ({ input, context }) => {
      await assertVisibleOrThrow(context, input.staffProfileId);

      const staffProfile = await db.query.staffProfiles.findFirst({
        where: eq(staffProfiles.id, input.staffProfileId),
      });
      if (!staffProfile) {
        throw new ORPCError("NOT_FOUND", { message: "Staff profile not found." });
      }

      const [appraisal] = await db
        .insert(appraisals)
        .values({
          cycleId: input.cycleId ?? null,
          staffProfileId: input.staffProfileId,
          reviewerId: input.reviewerId ?? null,
          year: input.year ?? Number(input.periodStart.slice(0, 4)),
          period: input.period ?? `${input.periodStart} - ${input.periodEnd}`,
          totalScore: input.totalScore ?? null,
          teamLeadId: staffProfile.teamLeadId ?? null,
          periodStart: input.periodStart,
          periodEnd: input.periodEnd,
          scheduledDate: input.scheduledDate ?? null,
          status: "draft",
          objectives: input.objectives ?? null,
          achievements: input.achievements ?? null,
          goals: input.goals ?? null,
          ratingMatrix: input.ratingMatrix ?? null,
          percentageScore: input.ratingMatrix
            ? computePercentage(input.ratingMatrix)
            : null,
          location: input.location ?? null,
          typeOfReview: input.typeOfReview ?? null,
          submittedById: null,
          approvedById: null,
          rejectedById: null,
          rejectionReason: null,
          immutableFrom: null,
        })
        .returning();
      if (!appraisal) throw new ORPCError("INTERNAL_SERVER_ERROR");

      await logAudit({
        actorId: context.session.user.id,
        actorName: context.session.user.name,
        action: "appraisal.create",
        module: "staff",
        resourceType: "appraisal",
        resourceId: appraisal.id,
        afterValue: appraisal as Record<string, unknown>,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
        actorRole: context.userRole ?? undefined,
        correlationId: context.requestId,
      });

      return fetchAppraisal(appraisal.id);
    }),

  update: requireRole("appraisal", "update")
    .input(
      z.object({
        id: z.string(),
        cycleId: z.string().optional(),
        reviewerId: z.string().optional(),
        year: z.number().int().optional(),
        period: z.string().optional(),
        totalScore: z.number().int().optional(),
        scheduledDate: z.string().optional(),
        completedDate: z.string().optional(),
        status: appraisalStatusSchema.optional(),
        overallRating: z.number().min(1).max(5).optional(),
        summary: z.string().optional(),
        location: z.string().optional(),
        typeOfReview: z.string().optional(),
        objectives: z
          .array(
            z.object({
              title: z.string(),
              rating: z.number().optional(),
              comments: z.string().optional(),
            }),
          )
          .optional(),
        achievements: z.array(z.string()).optional(),
        goals: z.array(z.string()).optional(),
        staffFeedback: z.string().optional(),
        supervisorComments: z.string().optional(),
        managerComments: z.string().optional(),
      }),
    )
    .handler(async ({ input, context }) => {
      const { id, ...updates } = input;
      const before = await db.query.appraisals.findFirst({
        where: eq(appraisals.id, id),
      });
      if (!before) throw new ORPCError("NOT_FOUND");

      if (before.immutableFrom && context.userRole !== "admin" && context.userRole !== "hrAdminOps") {
        throw new ORPCError("CONFLICT", {
          message: "Approved appraisals are immutable.",
        });
      }

      if (!(await canAccessAppraisal(context, before.staffProfileId))) {
        throw new ORPCError("FORBIDDEN");
      }

      const [updated] = await db
        .update(appraisals)
        .set({
          ...updates,
          ratingMatrix: before.ratingMatrix ?? null,
          percentageScore: before.percentageScore ?? null,
          year: updates.year ?? before.year,
          period: updates.period ?? before.period,
          totalScore: updates.totalScore ?? before.totalScore,
        })
        .where(eq(appraisals.id, id))
        .returning();

      await logAudit({
        actorId: context.session.user.id,
        actorName: context.session.user.name,
        action: "appraisal.update",
        module: "staff",
        resourceType: "appraisal",
        resourceId: id,
        beforeValue: before as Record<string, unknown>,
        afterValue: updated as Record<string, unknown>,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
        actorRole: context.userRole ?? undefined,
        correlationId: context.requestId,
      });

      return fetchAppraisal(id);
    }),

  setRatings: requireRole("appraisal", "update")
    .input(
      z.object({
        id: z.string(),
        ratingMatrix: ratingMatrixSchema,
        achievements: z.array(z.string()).optional(),
        goals: z.array(z.string()).optional(),
        staffFeedback: z.string().optional(),
        supervisorComments: z.string().optional(),
        managerComments: z.string().optional(),
        location: z.string().optional(),
        typeOfReview: z.string().optional(),
      }),
    )
    .handler(async ({ input, context }) => {
      const before = await db.query.appraisals.findFirst({
        where: eq(appraisals.id, input.id),
      });
      if (!before) throw new ORPCError("NOT_FOUND");

      if (before.immutableFrom && context.userRole !== "admin" && context.userRole !== "hrAdminOps") {
        throw new ORPCError("CONFLICT", {
          message: "Approved appraisals are immutable.",
        });
      }

      if (!(await canAccessAppraisal(context, before.staffProfileId))) {
        throw new ORPCError("FORBIDDEN");
      }

      const [updated] = await db
        .update(appraisals)
        .set({
          ratingMatrix: input.ratingMatrix,
          percentageScore: computePercentage(input.ratingMatrix),
          totalScore: computePercentage(input.ratingMatrix),
          achievements: input.achievements ?? before.achievements ?? null,
          goals: input.goals ?? before.goals ?? null,
          staffFeedback: input.staffFeedback ?? before.staffFeedback,
          supervisorComments: input.supervisorComments ?? before.supervisorComments,
          managerComments: input.managerComments ?? before.managerComments,
          location: input.location ?? before.location,
          typeOfReview: input.typeOfReview ?? before.typeOfReview,
          updatedAt: new Date(),
        })
        .where(eq(appraisals.id, input.id))
        .returning();

      await logAudit({
        actorId: context.session.user.id,
        actorName: context.session.user.name,
        action: "appraisal.set_ratings",
        module: "staff",
        resourceType: "appraisal",
        resourceId: input.id,
        beforeValue: before as Record<string, unknown>,
        afterValue: updated as Record<string, unknown>,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
        actorRole: context.userRole ?? undefined,
        correlationId: context.requestId,
      });

      return fetchAppraisal(input.id);
    }),

  submit: requireRole("appraisal", "submit")
    .input(
      z.object({
        id: z.string(),
        staffFeedback: z.string().optional(),
        supervisorComments: z.string().optional(),
        managerComments: z.string().optional(),
      }),
    )
    .handler(async ({ input, context }) => {
      const before = await db.query.appraisals.findFirst({
        where: eq(appraisals.id, input.id),
      });
      if (!before) throw new ORPCError("NOT_FOUND");

      if (!(await canAccessAppraisal(context, before.staffProfileId))) {
        throw new ORPCError("FORBIDDEN");
      }

      if (before.status === "approved" || before.status === "rejected") {
        throw new ORPCError("CONFLICT", {
          message: "Approved or rejected appraisals cannot be resubmitted.",
        });
      }

      const now = new Date();
      const [updated] = await db
        .update(appraisals)
        .set({
          status: "submitted",
          submittedAt: now,
          submittedById: context.session.user.id,
          staffFeedback: input.staffFeedback ?? before.staffFeedback,
          supervisorComments: input.supervisorComments ?? before.supervisorComments,
          managerComments: input.managerComments ?? before.managerComments,
          immutableFrom: null,
          updatedAt: now,
        })
        .where(eq(appraisals.id, input.id))
        .returning();

      if (!updated) {
        throw new ORPCError("INTERNAL_SERVER_ERROR");
      }

      await notifyRelatedPeople(
        {
          staffProfileId: updated.staffProfileId,
          reviewerId: updated.reviewerId,
          teamLeadId: updated.teamLeadId,
        },
        "Appraisal submitted",
        `Appraisal for ${updated.staffProfileId} has been submitted for review.`,
        "staff",
        updated.id,
      );

      await logAudit({
        actorId: context.session.user.id,
        actorName: context.session.user.name,
        action: "appraisal.submit",
        module: "staff",
        resourceType: "appraisal",
        resourceId: input.id,
        beforeValue: before as Record<string, unknown>,
        afterValue: updated as Record<string, unknown>,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
        actorRole: context.userRole ?? undefined,
        correlationId: context.requestId,
      });

      return fetchAppraisal(input.id);
    }),

  approve: requireRole("appraisal", "approve")
    .input(
      z.object({
        id: z.string(),
        managerComments: z.string().optional(),
      }),
    )
    .handler(async ({ input, context }) => {
      const before = await db.query.appraisals.findFirst({
        where: eq(appraisals.id, input.id),
      });
      if (!before) throw new ORPCError("NOT_FOUND");

      if (before.status !== "submitted") {
        throw new ORPCError("CONFLICT", {
          message: "Only submitted appraisals can be approved.",
        });
      }

      if (!(await canAccessAppraisal(context, before.staffProfileId))) {
        throw new ORPCError("FORBIDDEN");
      }

      const now = new Date();
      const [updated] = await db
        .update(appraisals)
        .set({
          status: "approved",
          approvedAt: now,
          approvedById: context.session.user.id,
          completedDate: now.toISOString().slice(0, 10),
          immutableFrom: now,
          managerComments: input.managerComments ?? before.managerComments,
          updatedAt: now,
        })
        .where(eq(appraisals.id, input.id))
        .returning();

      if (!updated) {
        throw new ORPCError("INTERNAL_SERVER_ERROR");
      }

      const followups = [
        {
          appraisalId: updated.id,
          followUpType: "three_month" as const,
          dueDate: new Date(now.getFullYear(), now.getMonth() + 3, now.getDate()),
        },
        {
          appraisalId: updated.id,
          followUpType: "six_month" as const,
          dueDate: new Date(now.getFullYear(), now.getMonth() + 6, now.getDate()),
        },
      ];

      await db
        .insert(appraisalFollowups)
        .values(
          followups.map((followUp) => ({
            ...followUp,
            dueDate: followUp.dueDate.toISOString().slice(0, 10),
          })),
        )
        .onConflictDoNothing();

      await notifyRelatedPeople(
        {
          staffProfileId: updated.staffProfileId,
          reviewerId: updated.reviewerId,
          teamLeadId: updated.teamLeadId,
        },
        "Appraisal approved",
        `Appraisal for ${updated.staffProfileId} has been approved.`,
        "staff",
        updated.id,
      );

      await logAudit({
        actorId: context.session.user.id,
        actorName: context.session.user.name,
        action: "appraisal.approve",
        module: "staff",
        resourceType: "appraisal",
        resourceId: input.id,
        beforeValue: before as Record<string, unknown>,
        afterValue: updated as Record<string, unknown>,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
        actorRole: context.userRole ?? undefined,
        correlationId: context.requestId,
      });

      return fetchAppraisal(input.id);
    }),

  reject: requireRole("appraisal", "reject")
    .input(
      z.object({
        id: z.string(),
        rejectionReason: z.string().min(1),
      }),
    )
    .handler(async ({ input, context }) => {
      const before = await db.query.appraisals.findFirst({
        where: eq(appraisals.id, input.id),
      });
      if (!before) throw new ORPCError("NOT_FOUND");

      if (before.status !== "submitted" && before.status !== "in_progress") {
        throw new ORPCError("CONFLICT", {
          message: "Only submitted or in-progress appraisals can be rejected.",
        });
      }

      if (!(await canAccessAppraisal(context, before.staffProfileId))) {
        throw new ORPCError("FORBIDDEN");
      }

      const now = new Date();
      const [updated] = await db
        .update(appraisals)
        .set({
          status: "rejected",
          rejectedAt: now,
          rejectedById: context.session.user.id,
          rejectionReason: input.rejectionReason,
          immutableFrom: now,
          updatedAt: now,
        })
        .where(eq(appraisals.id, input.id))
        .returning();

      if (!updated) throw new ORPCError("INTERNAL_SERVER_ERROR");

      await notifyRelatedPeople(
        {
          staffProfileId: updated.staffProfileId,
          reviewerId: updated.reviewerId,
          teamLeadId: updated.teamLeadId,
        },
        "Appraisal rejected",
        `Appraisal for ${updated.staffProfileId} was rejected.`,
        "staff",
        updated.id,
      );

      await logAudit({
        actorId: context.session.user.id,
        actorName: context.session.user.name,
        action: "appraisal.reject",
        module: "staff",
        resourceType: "appraisal",
        resourceId: input.id,
        beforeValue: before as Record<string, unknown>,
        afterValue: updated as Record<string, unknown>,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
        actorRole: context.userRole ?? undefined,
        correlationId: context.requestId,
      });

      return fetchAppraisal(input.id);
  }),
};
