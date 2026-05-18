import { ORPCError } from "@orpc/server";
import { and, asc, between, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";

import { attendanceLogs, db, latenessRecords } from "@ndma-dcs-staff-portal/db";

import { protectedProcedure, requireRole } from "../index";
import { logAudit } from "../lib/audit";
import { getCallerStaffProfile, getManagedStaffIds } from "../lib/scope";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
] as const;

const QUARTER_MONTHS: Record<number, string[]> = {
  1: ["January", "February", "March"],
  2: ["April", "May", "June"],
  3: ["July", "August", "September"],
  4: ["October", "November", "December"],
};

// Clock-log-derived lateness — see quarterlyGrid. The standard DCS workday
// starts at 08:00. A clock-in after that (but before midday) counts as a late
// day; clock-ins past midday are treated as shift work and ignored so NOC
// swing/night shifts don't register false lateness.
const EXPECTED_START_MIN = 8 * 60;    // 08:00
const LATE_WINDOW_END_MIN = 12 * 60;  // ignore afternoon / night clock-ins

/** Parse an "H:MM" / "HH:MM[:SS]" string to minutes-since-midnight. */
function hmToMinutes(t: string | null | undefined): number | null {
  if (!t) return null;
  const m = /^(\d{1,2}):(\d{2})/.exec(String(t).trim());
  if (!m) return null;
  return parseInt(m[1]!, 10) * 60 + parseInt(m[2]!, 10);
}

/** Format minutes as an "H:MM" string. */
function minutesToHm(mins: number): string {
  const safe = Math.max(0, Math.round(mins));
  return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, "0")}`;
}

/**
 * Normalise a stored month value to its canonical full name ("April").
 * Tolerates casing and abbreviations ("apr", "Apr", "APRIL", "sept") so a
 * record keyed slightly differently still lands in the right grid column.
 */
function canonicalMonth(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const s = raw.trim().toLowerCase();
  if (!s) return null;
  const exact = MONTHS.find((m) => m.toLowerCase() === s);
  if (exact) return exact;
  const prefix = s.slice(0, 3);
  return MONTHS.find((m) => m.toLowerCase().startsWith(prefix)) ?? null;
}

/** The quarter (1-4) a canonical month name belongs to. */
function quarterOfMonth(canonical: string): number {
  return Math.ceil((MONTHS.indexOf(canonical as (typeof MONTHS)[number]) + 1) / 3);
}

export const latenessRouter = {
  // List lateness records — optionally filtered by year / quarter / staff
  list: requireRole("compliance", "read")
    .input(
      z.object({
        year: z.number().int().optional(),
        quarter: z.number().int().min(1).max(4).optional(),
        staffId: z.string().optional(),
        limit: z.number().int().min(1).max(500).optional(),
        offset: z.number().int().min(0).optional(),
      }),
    )
    .handler(async ({ input, context }) => {
      const role = context.userRole ?? "";
      const conditions = [];

      if (input.year) {
        conditions.push(eq(latenessRecords.year, input.year));
      }
      if (input.quarter) {
        conditions.push(eq(latenessRecords.quarter, input.quarter));
      }
      if (input.staffId) {
        conditions.push(eq(latenessRecords.staffId, input.staffId));
      } else if (role !== "admin" && role !== "hrAdminOps" && role !== "manager") {
        // Non-admin: restrict to own + managed staff
        const managed = await getManagedStaffIds(context);
        const caller = await getCallerStaffProfile(context);
        const ids = new Set(managed);
        if (caller?.id) ids.add(caller.id);
        if (ids.size === 0) return [];
        conditions.push(inArray(latenessRecords.staffId, [...ids]));
      }

      const rows = await db.query.latenessRecords.findMany({
        where: conditions.length > 0 ? and(...conditions) : undefined,
        with: { staffProfile: { with: { user: true } } },
        orderBy: [desc(latenessRecords.year), asc(latenessRecords.month)],
        limit: input.limit ?? 200,
        offset: input.offset ?? 0,
      });

      return rows;
    }),

  // Quarterly grid: returns all staff with their lateness records for a given year+quarter
  quarterlyGrid: requireRole("compliance", "read")
    .input(
      z.object({
        year: z.number().int(),
        quarter: z.number().int().min(1).max(4),
      }),
    )
    .handler(async ({ input }) => {
      const months = QUARTER_MONTHS[input.quarter] ?? [];

      // Query by YEAR only — the quarter is derived from each record's month
      // name below, not trusted from the stored `quarter` column (which can be
      // null or stale on older / imported rows, hiding e.g. April records).
      const records = await db.query.latenessRecords.findMany({
        where: eq(latenessRecords.year, input.year),
        with: { staffProfile: { with: { user: true } } },
        orderBy: [asc(latenessRecords.staffId), asc(latenessRecords.month)],
      });

      type MonthRec = {
        id: number;
        totalTimeLate: string;
        daysLate: number;
        daysMissingFromAttendance: number | null;
        daysOnSchedule: number | null;
        notes: string | null;
      };
      type DerivedRec = { daysLate: number; totalMinutesLate: number; totalTimeLate: string };
      type StaffRow = {
        staffId: string;
        staffName: string;
        department: string | null;
        months: Record<string, MonthRec>;
        /** Lateness inferred from clock-in logs, per month — fills gaps where
         *  no manual record exists. */
        derived: Record<string, DerivedRec>;
        /** Quarter total — manual record where present, else derived. */
        quarterTotal: { daysLate: number; totalTimeLate: string };
      };

      const staffMap = new Map<string, StaffRow>();
      function ensureRow(staffId: string, name: string, department: string | null): StaffRow {
        let row = staffMap.get(staffId);
        if (!row) {
          row = { staffId, staffName: name, department, months: {}, derived: {}, quarterTotal: { daysLate: 0, totalTimeLate: "0:00" } };
          staffMap.set(staffId, row);
        }
        return row;
      }

      for (const rec of records) {
        // Normalise the month and derive the quarter from it — only keep
        // records that actually fall in the requested quarter.
        const month = canonicalMonth(rec.month);
        if (!month || quarterOfMonth(month) !== input.quarter) continue;

        const row = ensureRow(
          rec.staffId,
          rec.staffProfile?.user?.name ?? rec.staffProfile?.employeeId ?? "Unknown",
          rec.staffProfile?.departmentId ?? null,
        );
        row.months[month] = {
          id: rec.id,
          totalTimeLate: rec.totalTimeLate,
          daysLate: rec.daysLate,
          daysMissingFromAttendance: rec.daysMissingFromAttendance ?? null,
          daysOnSchedule: rec.daysOnSchedule ?? null,
          notes: rec.notes ?? null,
        };
      }

      // ── Correlate clock-in logs → derived lateness ──────────────────────────
      // Pull every clock-log for the quarter and infer late days from the
      // clock-in time, so months with no manually-keyed record still show a
      // number and the quarter total is always complete.
      // Quarter → month range: Q1 Jan–Mar, Q2 Apr–Jun, Q3 Jul–Sep, Q4 Oct–Dec.
      const startMonth = (input.quarter - 1) * 3 + 1;   // 1, 4, 7, 10
      const endMonth = startMonth + 2;                   // 3, 6, 9, 12
      const lastDay = new Date(input.year, endMonth, 0).getDate(); // 31/30/28…
      const qStart = `${input.year}-${String(startMonth).padStart(2, "0")}-01`;
      const qEnd = `${input.year}-${String(endMonth).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
      const logs = await db.query.attendanceLogs.findMany({
        where: between(attendanceLogs.date, qStart, qEnd),
        with: { staffProfile: { with: { user: true } } },
      });

      // staffId → month → running { daysLate, totalMinutesLate }
      const derivedAgg = new Map<string, Map<string, { daysLate: number; minutes: number }>>();
      for (const log of logs) {
        const clockInMin = hmToMinutes(log.clockIn);
        if (clockInMin == null) continue;
        if (clockInMin <= EXPECTED_START_MIN || clockInMin > LATE_WINDOW_END_MIN) continue;
        const monthName = MONTHS[parseInt(log.date.slice(5, 7), 10) - 1];
        if (!monthName || !months.includes(monthName)) continue;
        const lateMins = clockInMin - EXPECTED_START_MIN;
        let perStaff = derivedAgg.get(log.staffId);
        if (!perStaff) { perStaff = new Map(); derivedAgg.set(log.staffId, perStaff); }
        const cell = perStaff.get(monthName) ?? { daysLate: 0, minutes: 0 };
        cell.daysLate += 1;
        cell.minutes += lateMins;
        perStaff.set(monthName, cell);

        // Make sure staff who only have clock-logs (no manual record) still appear.
        ensureRow(
          log.staffId,
          log.staffProfile?.user?.name ?? log.staffProfile?.employeeId ?? "Unknown",
          log.staffProfile?.departmentId ?? null,
        );
      }

      for (const [staffId, perMonth] of derivedAgg) {
        const row = staffMap.get(staffId);
        if (!row) continue;
        for (const [monthName, cell] of perMonth) {
          row.derived[monthName] = {
            daysLate: cell.daysLate,
            totalMinutesLate: cell.minutes,
            totalTimeLate: minutesToHm(cell.minutes),
          };
        }
      }

      // ── Quarter total — manual record per month if present, else derived ────
      for (const row of staffMap.values()) {
        let totalDays = 0;
        let totalMinutes = 0;
        for (const m of months) {
          const manual = row.months[m];
          if (manual) {
            totalDays += manual.daysLate;
            totalMinutes += hmToMinutes(manual.totalTimeLate) ?? 0;
          } else if (row.derived[m]) {
            totalDays += row.derived[m]!.daysLate;
            totalMinutes += row.derived[m]!.totalMinutesLate;
          }
        }
        row.quarterTotal = { daysLate: totalDays, totalTimeLate: minutesToHm(totalMinutes) };
      }

      return {
        year: input.year,
        quarter: input.quarter,
        months,
        rows: [...staffMap.values()].sort((a, b) => a.staffName.localeCompare(b.staffName)),
      };
    }),

  // Upsert a single lateness record (per staff × year × month)
  upsert: requireRole("compliance", "update")
    .input(
      z.object({
        staffId: z.string(),
        year: z.number().int(),
        month: z.string(), // "January", "February", etc.
        quarter: z.number().int().min(1).max(4).optional(),
        totalTimeLate: z.string(),
        daysLate: z.number().int().min(0),
        daysMissingFromAttendance: z.number().int().min(0).optional(),
        daysOnSchedule: z.number().int().min(0).optional(),
        notes: z.string().optional(),
      }),
    )
    .handler(async ({ input, context }) => {
      // Infer quarter from month if not supplied
      let quarter = input.quarter;
      if (!quarter) {
        const monthIndex = MONTHS.indexOf(input.month as (typeof MONTHS)[number]);
        if (monthIndex >= 0) {
          quarter = Math.ceil((monthIndex + 1) / 3);
        }
      }

      const existing = await db.query.latenessRecords.findFirst({
        where: and(
          eq(latenessRecords.staffId, input.staffId),
          eq(latenessRecords.year, input.year),
          eq(latenessRecords.month, input.month),
        ),
      });

      let row;
      if (existing) {
        const updated = await db
          .update(latenessRecords)
          .set({
            totalTimeLate: input.totalTimeLate,
            daysLate: input.daysLate,
            quarter: quarter ?? existing.quarter,
            daysMissingFromAttendance: input.daysMissingFromAttendance ?? existing.daysMissingFromAttendance,
            daysOnSchedule: input.daysOnSchedule ?? existing.daysOnSchedule,
            notes: input.notes ?? existing.notes,
          })
          .where(eq(latenessRecords.id, existing.id))
          .returning();
        row = updated[0];

        await logAudit({
          actorId: context.session.user.id,
          actorName: context.session.user.name,
          actorRole: context.userRole ?? undefined,
          action: "lateness_record.update",
          module: "compliance",
          resourceType: "lateness_record",
          resourceId: String(existing.id),
          beforeValue: existing as Record<string, unknown>,
          afterValue: row as Record<string, unknown>,
          ipAddress: context.ipAddress,
          userAgent: context.userAgent,
          correlationId: context.requestId,
        });
      } else {
        const inserted = await db
          .insert(latenessRecords)
          .values({
            staffId: input.staffId,
            year: input.year,
            month: input.month,
            quarter: quarter ?? null,
            totalTimeLate: input.totalTimeLate,
            daysLate: input.daysLate,
            daysMissingFromAttendance: input.daysMissingFromAttendance ?? null,
            daysOnSchedule: input.daysOnSchedule ?? null,
            notes: input.notes ?? null,
          })
          .returning();
        row = inserted[0];

        await logAudit({
          actorId: context.session.user.id,
          actorName: context.session.user.name,
          actorRole: context.userRole ?? undefined,
          action: "lateness_record.create",
          module: "compliance",
          resourceType: "lateness_record",
          resourceId: String(row?.id),
          afterValue: row as Record<string, unknown>,
          ipAddress: context.ipAddress,
          userAgent: context.userAgent,
          correlationId: context.requestId,
        });
      }

      if (!row) throw new ORPCError("INTERNAL_SERVER_ERROR");
      return row;
    }),

  // Delete a lateness record
  delete: requireRole("compliance", "update")
    .input(z.object({ id: z.number().int() }))
    .handler(async ({ input, context }) => {
      const before = await db.query.latenessRecords.findFirst({
        where: eq(latenessRecords.id, input.id),
      });
      if (!before) throw new ORPCError("NOT_FOUND");

      await db.delete(latenessRecords).where(eq(latenessRecords.id, input.id));

      await logAudit({
        actorId: context.session.user.id,
        actorName: context.session.user.name,
        actorRole: context.userRole ?? undefined,
        action: "lateness_record.delete",
        module: "compliance",
        resourceType: "lateness_record",
        resourceId: String(input.id),
        beforeValue: before as Record<string, unknown>,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
        correlationId: context.requestId,
      });

      return { success: true };
    }),

  // Summary stats for a year: total late minutes, most late staff
  stats: protectedProcedure
    .input(z.object({ year: z.number().int() }))
    .handler(async ({ input }) => {
      const rows = await db.query.latenessRecords.findMany({
        where: eq(latenessRecords.year, input.year),
        with: { staffProfile: { with: { user: true } } },
      });

      // Aggregate per staff
      const staffTotals = new Map<string, { name: string; totalDaysLate: number; }>();
      for (const r of rows) {
        if (!staffTotals.has(r.staffId)) {
          staffTotals.set(r.staffId, {
            name: r.staffProfile?.user?.name ?? r.staffProfile?.employeeId ?? "Unknown",
            totalDaysLate: 0,
          });
        }
        staffTotals.get(r.staffId)!.totalDaysLate += r.daysLate;
      }

      const sorted = [...staffTotals.entries()]
        .sort((a, b) => b[1].totalDaysLate - a[1].totalDaysLate)
        .slice(0, 10)
        .map(([staffId, val]) => ({ staffId, ...val }));

      return {
        year: input.year,
        totalRecords: rows.length,
        topLate: sorted,
      };
    }),
};
