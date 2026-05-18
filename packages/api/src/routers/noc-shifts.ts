import { ORPCError } from "@orpc/server";
import { and, asc, eq, gte, inArray, lte } from "drizzle-orm";
import { z } from "zod";

import {
  db,
  nocShifts,
  staffProfiles,
} from "@ndma-dcs-staff-portal/db";

import { requireRole } from "../index";
import { logAudit } from "../lib/audit";
import { canAccessStaffPrivate, getCallerStaffProfile, getManagedStaffIds } from "../lib/scope";
import { getTeamStaffIds } from "../lib/team";

const monthKeySchema = z.string().regex(/^\d{4}-\d{2}$/);

async function assertNocAccess(context: Parameters<typeof canAccessStaffPrivate>[0], staffProfileId: string) {
  const role = context.userRole ?? "";
  if (role === "admin" || role === "hrAdminOps") return;
  const caller = await getCallerStaffProfile(context);
  if (!caller) throw new ORPCError("FORBIDDEN");
  if (caller.id === staffProfileId) return;
  if (!(await canAccessStaffPrivate(context, staffProfileId))) {
    throw new ORPCError("FORBIDDEN");
  }
}

export const nocShiftsRouter = {
  list: requireRole("roster", "read")
    .input(
        z.object({
          monthKey: monthKeySchema.optional(),
          staffProfileId: z.string().optional(),
          departmentId: z.string().optional(),
          team: z.enum(["DCS", "NOC"]).optional(),
          limit: z.number().min(1).max(500).default(500),
        }),
      )
    .handler(async ({ input, context }) => {
      const role = context.userRole ?? "";
      const isPrivileged = role === "admin" || role === "hrAdminOps";
      const conditions = [];

      if (input.monthKey) {
        const start = `${input.monthKey}-01`;
        const [yearText = "1970", monthText = "1"] = input.monthKey.split("-");
        const next = new Date(Date.UTC(Number(yearText), Number(monthText), 1)).toISOString().slice(0, 7);
        const end = `${next}-01`;
        conditions.push(gte(nocShifts.shiftDate, start));
        conditions.push(lte(nocShifts.shiftDate, new Date(new Date(end).getTime() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10)));
      }

      if (input.staffProfileId) {
        await assertNocAccess(context, input.staffProfileId);
        conditions.push(eq(nocShifts.staffId, input.staffProfileId));
      } else if (input.team) {
        // A `team` filter must not let a rank-and-file user enumerate another
        // department's roster. Non-management callers only ever see their own
        // shift rows; management/privileged see the whole team.
        const teamStaffIds = await getTeamStaffIds(input.team);
        if (teamStaffIds.length === 0) return [];
        const isManagement =
          isPrivileged ||
          ["manager", "teamLead", "personalAssistant"].includes(role);
        if (isManagement) {
          conditions.push(inArray(nocShifts.staffId, teamStaffIds));
        } else {
          const caller = await getCallerStaffProfile(context);
          const allowed = teamStaffIds.filter((id) => id === caller?.id);
          if (allowed.length === 0) return [];
          conditions.push(inArray(nocShifts.staffId, allowed));
        }
      } else if (!isPrivileged) {
        const managed = new Set(await getManagedStaffIds(context));
        const caller = await getCallerStaffProfile(context);
        if (caller?.id) managed.add(caller.id);
        if (managed.size === 0) return [];
        conditions.push(inArray(nocShifts.staffId, [...managed]));
      }

      if (input.departmentId) {
        const caller = await getCallerStaffProfile(context);
        const managed = isPrivileged
          ? null
          : new Set([
              ...(await getManagedStaffIds(context)),
              ...(caller?.id ? [caller.id] : []),
            ]);
        const staffIds = await db.query.staffProfiles.findMany({
          where:
            managed && managed.size > 0
              ? and(
                  eq(staffProfiles.departmentId, input.departmentId),
                  inArray(staffProfiles.id, [...managed]),
                )
              : eq(staffProfiles.departmentId, input.departmentId),
          columns: { id: true },
        });
        const ids = staffIds.map((row) => row.id);
        if (ids.length === 0) return [];
        conditions.push(inArray(nocShifts.staffId, ids));
      }

      const rows = await db.query.nocShifts.findMany({
        where: conditions.length > 0 ? and(...conditions) : undefined,
        with: {
          staffProfile: { with: { user: true, department: true } },
        },
        orderBy: [asc(nocShifts.shiftDate), asc(nocShifts.id)],
        limit: input.limit,
      });

      return rows;
    }),

  create: requireRole("roster", "create")
    .input(
      z.object({
        staffId: z.string(),
        shiftDate: z.string(),
        shiftType: z.enum([
          "Day Shift",
          "Night Shift",
          "Swing Shift",
          "Off",
          "Annual Leave",
          "Sick Leave",
          "Maternity Leave",
          "Training",
          "Training Half Day",
          "Custom",
          "Outreach",
        ]),
        notes: z.string().optional(),
      }),
    )
    .handler(async ({ input, context }) => {
      const [row] = await db.insert(nocShifts).values({
        staffId: input.staffId,
        shiftDate: input.shiftDate,
        shiftType: input.shiftType,
        notes: input.notes ?? null,
      }).returning();
      if (!row) throw new ORPCError("INTERNAL_SERVER_ERROR");

      await logAudit({
        actorId: context.session.user.id,
        actorName: context.session.user.name,
        action: "noc_shifts.create",
        module: "roster",
        resourceType: "noc_shift",
        resourceId: String(row.id),
        afterValue: row as Record<string, unknown>,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
        actorRole: context.userRole ?? undefined,
        correlationId: context.requestId,
      });

      return row;
    }),
};
