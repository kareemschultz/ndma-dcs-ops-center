// leave-overlay.ts — read-time overlay of approved leave onto other modules.
//
// STAGE 3 (Data Linking): approved leave entered in the Leave module should
// surface where it logically belongs (attendance, scheduling, timesheets)
// WITHOUT ever persisting derived rows. Every consumer queries this helper at
// read time and merges the result into its own view model.
//
// `getApprovedLeaveForRange` returns a nested map:
//   staffProfileId → ISO date ("YYYY-MM-DD") → LeaveDay
// where LeaveDay carries the leave type label + request id for traceability.

import { and, eq, gte, inArray, lte } from "drizzle-orm";

import { db, leaveRequests } from "@ndma-dcs-staff-portal/db";

export interface LeaveDay {
  /** Human-readable leave type label, e.g. "Annual Leave" / "Sick Leave". */
  leaveType: string;
  /** The leave_requests.id this day was derived from (traceability). */
  requestId: string;
  /** The full inclusive range of the underlying request. */
  startDate: string;
  endDate: string;
}

/** staffProfileId → ISO date → LeaveDay */
export type LeaveOverlayMap = Record<string, Record<string, LeaveDay>>;

/**
 * Enumerate every ISO date (inclusive) between `from` and `to`.
 * Both inputs are "YYYY-MM-DD" strings. The range is expected to be bounded
 * (callers cap it at one month) so this stays cheap.
 */
function eachDay(from: string, to: string): string[] {
  const out: string[] = [];
  const start = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${to}T00:00:00Z`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return out;
  for (let d = start; d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

/**
 * Returns approved leave for the given date window as a per-staff, per-date map.
 *
 * Uses the same date-overlap predicate as `leave.getTeamCalendar` /
 * `leave.requests.create`: a request overlaps the window when
 * `startDate <= to AND endDate >= from`.
 *
 * @param from  inclusive ISO start date ("YYYY-MM-DD")
 * @param to    inclusive ISO end date ("YYYY-MM-DD")
 * @param staffProfileIds  optional filter — only these staff are considered
 */
export async function getApprovedLeaveForRange(
  from: string,
  to: string,
  staffProfileIds?: string[],
): Promise<LeaveOverlayMap> {
  // Empty explicit filter → no staff in scope → no overlay.
  if (staffProfileIds && staffProfileIds.length === 0) return {};

  const conditions = [
    eq(leaveRequests.status, "approved"),
    lte(leaveRequests.startDate, to),
    gte(leaveRequests.endDate, from),
  ];
  if (staffProfileIds && staffProfileIds.length > 0) {
    conditions.push(inArray(leaveRequests.staffProfileId, staffProfileIds));
  }

  const rows = await db.query.leaveRequests.findMany({
    where: and(...conditions),
    with: { leaveType: true },
  });

  const map: LeaveOverlayMap = {};
  for (const row of rows) {
    // Clip the request to the requested window so callers only get in-range dates.
    const clampStart = row.startDate > from ? row.startDate : from;
    const clampEnd = row.endDate < to ? row.endDate : to;
    const label = row.leaveType?.name ?? "Leave";

    const staffMap = (map[row.staffProfileId] ??= {});
    for (const day of eachDay(clampStart, clampEnd)) {
      // First approved request wins for a given day (overlaps are validated
      // away on create, so collisions are not expected).
      if (!staffMap[day]) {
        staffMap[day] = {
          leaveType: label,
          requestId: row.id,
          startDate: row.startDate,
          endDate: row.endDate,
        };
      }
    }
  }

  return map;
}

/**
 * Convenience: does `staffProfileId` have approved leave that overlaps the
 * inclusive [from, to] window? Used by scheduling to flag shift/on-call
 * assignments that collide with leave.
 */
export function leaveOverlapsWindow(
  overlay: LeaveOverlayMap,
  staffProfileId: string,
  from: string,
  to: string,
): LeaveDay | null {
  const staffMap = overlay[staffProfileId];
  if (!staffMap) return null;
  for (const day of eachDay(from, to)) {
    const hit = staffMap[day];
    if (hit) return hit;
  }
  return null;
}
