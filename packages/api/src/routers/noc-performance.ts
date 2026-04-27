import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";

import {
  db,
  employeeOfTheMonth,
  nocMonthlyMetrics,
  nocTicketActivity,
  staffProfiles,
  user,
} from "@ndma-dcs-staff-portal/db";

import { requireRole } from "../index";
import { logAudit } from "../lib/audit";

// ── helpers ────────────────────────────────────────────────────────────────

/**
 * Compute Employee of the Month winners from noc_monthly_metrics for a given
 * year/month. Returns an object shaped to match the employeeOfTheMonth table.
 */
async function computeEOM(year: number, month: number) {
  const metrics = await db
    .select()
    .from(nocMonthlyMetrics)
    .where(and(eq(nocMonthlyMetrics.year, year), eq(nocMonthlyMetrics.month, month)));

  if (metrics.length === 0) {
    return null;
  }

  // Overall best: lowest (mt + ma) + highest (noccc + nct)
  function overallScore(m: (typeof metrics)[number]) {
    return m.noccc + m.nct - m.mt - m.ma;
  }

  const sorted = [...metrics].sort((a, b) => overallScore(b) - overallScore(a));

  const overallBest = sorted[0]?.staffId ?? null;
  const secondBest = sorted[1]?.staffId ?? null;

  // Most incident tickets (highest ittIncident)
  const byIncident = [...metrics].sort((a, b) => b.ittIncident - a.ittIncident);
  const mostIncident = byIncident[0]?.staffId ?? null;

  // Most problem tickets (highest ittProblem)
  const byProblem = [...metrics].sort((a, b) => b.ittProblem - a.ittProblem);
  const mostProblem = byProblem[0]?.staffId ?? null;

  // Most NOC tickets closed (highest nct)
  const byNct = [...metrics].sort((a, b) => b.nct - a.nct);
  const mostNocClosed = byNct[0]?.staffId ?? null;

  // Least alarm non-compliance (lowest ma)
  const byMa = [...metrics].sort((a, b) => a.ma - b.ma);
  const leastAlarm = byMa[0]?.staffId ?? null;

  // Least ticket non-compliance (lowest mt)
  const byMt = [...metrics].sort((a, b) => a.mt - b.mt);
  const leastTicket = byMt[0]?.staffId ?? null;

  return {
    year,
    month,
    overallBestStaffId: overallBest,
    secondBestStaffId: secondBest,
    mostIncidentTicketsStaffId: mostIncident,
    mostProblemTicketsStaffId: mostProblem,
    mostNocTicketsClosedStaffId: mostNocClosed,
    leastAlarmNonComplianceStaffId: leastAlarm,
    leastTicketNonComplianceStaffId: leastTicket,
  };
}

/** Fetch a map of staffProfileId -> user.name for a set of staff profile IDs. */
async function staffNameMap(staffIds: string[]): Promise<Map<string, string>> {
  if (staffIds.length === 0) return new Map();

  const rows = await db
    .select({ id: staffProfiles.id, name: user.name })
    .from(staffProfiles)
    .innerJoin(user, eq(staffProfiles.userId, user.id))
    .where(inArray(staffProfiles.id, staffIds));

  return new Map(rows.map((r) => [r.id, r.name]));
}

// ── router ─────────────────────────────────────────────────────────────────

export const nocPerformanceRouter = {
  // ── metrics ──────────────────────────────────────────────────────────────

  metrics: {
    /** List monthly metrics. Filterable by year, month, staffId. */
    list: requireRole("report", "read")
      .input(
        z.object({
          year: z.number().int().min(2020).max(2100),
          month: z.number().int().min(1).max(12).optional(),
          staffId: z.string().optional(),
        }),
      )
      .handler(async ({ input }) => {
        const { year, month, staffId } = input;

        const conditions = [eq(nocMonthlyMetrics.year, year)];
        if (month !== undefined) {
          conditions.push(eq(nocMonthlyMetrics.month, month));
        }
        if (staffId !== undefined) {
          conditions.push(eq(nocMonthlyMetrics.staffId, staffId));
        }

        const rows = await db
          .select({
            id: nocMonthlyMetrics.id,
            staffId: nocMonthlyMetrics.staffId,
            year: nocMonthlyMetrics.year,
            month: nocMonthlyMetrics.month,
            mt: nocMonthlyMetrics.mt,
            ittIncident: nocMonthlyMetrics.ittIncident,
            ittProblem: nocMonthlyMetrics.ittProblem,
            daysDayShift: nocMonthlyMetrics.daysDayShift,
            daysSwingShift: nocMonthlyMetrics.daysSwingShift,
            daysNightShift: nocMonthlyMetrics.daysNightShift,
            noccc: nocMonthlyMetrics.noccc,
            nct: nocMonthlyMetrics.nct,
            ma: nocMonthlyMetrics.ma,
            createdAt: nocMonthlyMetrics.createdAt,
            updatedAt: nocMonthlyMetrics.updatedAt,
            staffName: user.name,
          })
          .from(nocMonthlyMetrics)
          .leftJoin(staffProfiles, eq(nocMonthlyMetrics.staffId, staffProfiles.id))
          .leftJoin(user, eq(staffProfiles.userId, user.id))
          .where(and(...conditions))
          .orderBy(asc(nocMonthlyMetrics.month), asc(user.name));

        return rows;
      }),

    /** Upsert (insert or update) metrics for a staff member/year/month. */
    upsert: requireRole("report", "create")
      .input(
        z.object({
          staffId: z.string().min(1),
          year: z.number().int().min(2020).max(2100),
          month: z.number().int().min(1).max(12),
          mt: z.number().int().min(0).default(0),
          ittIncident: z.number().int().min(0).default(0),
          ittProblem: z.number().int().min(0).default(0),
          daysDayShift: z.number().int().min(0).default(0),
          daysSwingShift: z.number().int().min(0).default(0),
          daysNightShift: z.number().int().min(0).default(0),
          noccc: z.number().int().min(0).default(0),
          nct: z.number().int().min(0).default(0),
          ma: z.number().int().min(0).default(0),
        }),
      )
      .handler(async ({ input, context }) => {
        const { staffId, year, month, ...rest } = input;

        const [existing] = await db
          .select()
          .from(nocMonthlyMetrics)
          .where(
            and(
              eq(nocMonthlyMetrics.staffId, staffId),
              eq(nocMonthlyMetrics.year, year),
              eq(nocMonthlyMetrics.month, month),
            ),
          );

        let result: typeof existing;

        if (existing) {
          const [updated] = await db
            .update(nocMonthlyMetrics)
            .set(rest)
            .where(eq(nocMonthlyMetrics.id, existing.id))
            .returning();
          result = updated;

          await logAudit({
            actorId: context.session.user.id,
            actorName: context.session.user.name,
            actorRole: context.userRole ?? undefined,
            action: "noc_monthly_metrics.update",
            module: "noc_performance",
            resourceType: "noc_monthly_metrics",
            resourceId: existing.id,
            beforeValue: existing as unknown as Record<string, unknown>,
            afterValue: rest as Record<string, unknown>,
            ipAddress: context.ipAddress,
            userAgent: context.userAgent,
            correlationId: context.requestId,
          });
        } else {
          const [inserted] = await db
            .insert(nocMonthlyMetrics)
            .values({ staffId, year, month, ...rest })
            .returning();
          result = inserted;

          await logAudit({
            actorId: context.session.user.id,
            actorName: context.session.user.name,
            actorRole: context.userRole ?? undefined,
            action: "noc_monthly_metrics.create",
            module: "noc_performance",
            resourceType: "noc_monthly_metrics",
            resourceId: inserted.id,
            afterValue: { staffId, year, month, ...rest } as Record<string, unknown>,
            ipAddress: context.ipAddress,
            userAgent: context.userAgent,
            correlationId: context.requestId,
          });
        }

        return result;
      }),
  },

  // ── tickets ───────────────────────────────────────────────────────────────

  tickets: {
    /** List ticket activity. Filterable by year, month, type. */
    list: requireRole("report", "read")
      .input(
        z.object({
          year: z.number().int().min(2020).max(2100),
          month: z.number().int().min(1).max(12).optional(),
          type: z.enum(["incident", "problem", "work_order"]).optional(),
        }),
      )
      .handler(async ({ input }) => {
        const { year, month, type } = input;

        const conditions = [eq(nocTicketActivity.year, year)];
        if (month !== undefined) {
          conditions.push(eq(nocTicketActivity.month, month));
        }
        if (type !== undefined) {
          conditions.push(eq(nocTicketActivity.type, type));
        }

        const rows = await db
          .select({
            id: nocTicketActivity.id,
            ticketId: nocTicketActivity.ticketId,
            type: nocTicketActivity.type,
            year: nocTicketActivity.year,
            month: nocTicketActivity.month,
            action: nocTicketActivity.action,
            actorStaffId: nocTicketActivity.actorStaffId,
            isDuplicate: nocTicketActivity.isDuplicate,
            notes: nocTicketActivity.notes,
            actorName: user.name,
          })
          .from(nocTicketActivity)
          .leftJoin(staffProfiles, eq(nocTicketActivity.actorStaffId, staffProfiles.id))
          .leftJoin(user, eq(staffProfiles.userId, user.id))
          .where(and(...conditions))
          .orderBy(desc(nocTicketActivity.year), desc(nocTicketActivity.month));

        return rows;
      }),

    /** Record a new ticket activity event. */
    create: requireRole("report", "create")
      .input(
        z.object({
          ticketId: z.string().min(1),
          type: z.enum(["incident", "problem", "work_order"]),
          year: z.number().int().min(2020).max(2100),
          month: z.number().int().min(1).max(12),
          action: z.enum(["created", "closed"]),
          actorStaffId: z.string().optional(),
          isDuplicate: z.boolean().default(false),
          notes: z.string().optional(),
        }),
      )
      .handler(async ({ input, context }) => {
        const [inserted] = await db
          .insert(nocTicketActivity)
          .values(input)
          .returning();

        await logAudit({
          actorId: context.session.user.id,
          actorName: context.session.user.name,
          actorRole: context.userRole ?? undefined,
          action: "noc_ticket_activity.create",
          module: "noc_performance",
          resourceType: "noc_ticket_activity",
          resourceId: inserted.id,
          afterValue: input as Record<string, unknown>,
          ipAddress: context.ipAddress,
          userAgent: context.userAgent,
          correlationId: context.requestId,
        });

        return inserted;
      }),
  },

  // ── eom ───────────────────────────────────────────────────────────────────

  eom: {
    /** Get the Employee of the Month record for a given year/month. */
    get: requireRole("report", "read")
      .input(
        z.object({
          year: z.number().int().min(2020).max(2100),
          month: z.number().int().min(1).max(12),
        }),
      )
      .handler(async ({ input }) => {
        const { year, month } = input;

        const [row] = await db
          .select()
          .from(employeeOfTheMonth)
          .where(
            and(eq(employeeOfTheMonth.year, year), eq(employeeOfTheMonth.month, month)),
          );

        if (!row) {
          return null;
        }

        // Enrich with staff names via staffId -> user.name lookup
        const staffIds = [
          row.overallBestStaffId,
          row.secondBestStaffId,
          row.mostIncidentTicketsStaffId,
          row.mostProblemTicketsStaffId,
          row.mostNocTicketsClosedStaffId,
          row.leastAlarmNonComplianceStaffId,
          row.leastTicketNonComplianceStaffId,
        ].filter((id): id is string => id !== null);

        const names = await staffNameMap(staffIds);

        const nameOf = (id: string | null) => (id ? (names.get(id) ?? null) : null);

        return {
          ...row,
          overallBestName: nameOf(row.overallBestStaffId),
          secondBestName: nameOf(row.secondBestStaffId),
          mostIncidentTicketsName: nameOf(row.mostIncidentTicketsStaffId),
          mostProblemTicketsName: nameOf(row.mostProblemTicketsStaffId),
          mostNocTicketsClosedName: nameOf(row.mostNocTicketsClosedStaffId),
          leastAlarmNonComplianceName: nameOf(row.leastAlarmNonComplianceStaffId),
          leastTicketNonComplianceName: nameOf(row.leastTicketNonComplianceStaffId),
        };
      }),

    /** Compute and upsert EOM winners from the monthly metrics for a given year/month. */
    compute: requireRole("report", "create")
      .input(
        z.object({
          year: z.number().int().min(2020).max(2100),
          month: z.number().int().min(1).max(12),
        }),
      )
      .handler(async ({ input, context }) => {
        const { year, month } = input;

        const computed = await computeEOM(year, month);
        if (!computed) {
          return { message: "No metrics found for this period — nothing to compute." };
        }

        const [existing] = await db
          .select()
          .from(employeeOfTheMonth)
          .where(
            and(eq(employeeOfTheMonth.year, year), eq(employeeOfTheMonth.month, month)),
          );

        let result: typeof existing;

        if (existing) {
          const [updated] = await db
            .update(employeeOfTheMonth)
            .set({ ...computed, computedAt: new Date() })
            .where(eq(employeeOfTheMonth.id, existing.id))
            .returning();
          result = updated;
        } else {
          const [inserted] = await db
            .insert(employeeOfTheMonth)
            .values(computed)
            .returning();
          result = inserted;
        }

        await logAudit({
          actorId: context.session.user.id,
          actorName: context.session.user.name,
          actorRole: context.userRole ?? undefined,
          action: "employee_of_the_month.compute",
          module: "noc_performance",
          resourceType: "employee_of_the_month",
          resourceId: result.id,
          afterValue: computed as Record<string, unknown>,
          ipAddress: context.ipAddress,
          userAgent: context.userAgent,
          correlationId: context.requestId,
        });

        return result;
      }),
  },
};
