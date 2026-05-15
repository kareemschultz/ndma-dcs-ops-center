// Parser for the NDMA "Electronic Time Card" timesheet PDF.
//
// PDF structure (one staff member spans several pages):
//   - A header line per page:  "User ID : 220   Name : Ataybia Williams   Department : Data Centre   Date : 03/01/2026 - 04/30/2026"
//   - One row per calendar day. The device lays the columns out at FIXED x positions:
//       Date  x≈22   ·  Day Type  x≈86   ·  Sche  x≈146
//       In time   x≈191  ·  Out time  x≈301  ·  Work hours  x≈402
//       Late In / Diff OT / Early Out  x≈511   ·  Leave Taken  x≈551   ·  Remark  x≈636
//   - In / Out times are 12-hour "hh:mm AM/PM". Work hours is a decimal printed by the device.
//   - A row can have ONLY an Out punch (no In) or ONLY an In punch — so In/Out MUST be
//     assigned by x-coordinate, never by left-to-right match order.
//   - The "Day Type" column itself only ever holds Workday / Restday / Holiday. The reason a
//     work day has no punches (Absent / Annual / sick leave / Out of Office …) lives in the
//     separate "Leave Taken" column at x≈551.
//
// DCS staff start at 08:00; a clock-in after 08:15 (15-min grace) counts as late.

import { getDocument, GlobalWorkerOptions } from "pdfjs-dist";
// Vite resolves this ?url import to the bundled worker asset.
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

const WORK_START_MIN = 8 * 60; // 08:00
const GRACE_MIN = 15; // late after 08:15

export interface ParsedTimesheetRow {
  /** Name exactly as printed in the PDF. */
  staffName: string;
  /** "User ID" from the PDF header (device id, not necessarily our employeeId). */
  userId: string;
  /** ISO date YYYY-MM-DD. */
  date: string;
  /** 24h "HH:MM" or null. */
  clockIn: string | null;
  /** 24h "HH:MM" or null. */
  clockOut: string | null;
  /** Decimal hours string e.g. "7.62", or null. */
  hoursWorked: string | null;
  /** True when clockIn is after 08:15. */
  isLate: boolean;
  /** Minutes past the 08:15 grace cutoff (0 when on time / no clock-in). */
  minutesLate: number;
  /** Day Type from the PDF — Workday / Restday / Holiday / Absent. */
  dayType: string;
}

/** Convert a 12-hour "hh:mm AM/PM" string to 24h "HH:MM". Returns null if unparseable. */
function to24h(raw: string): string | null {
  const m = raw.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!m) return null;
  let h = parseInt(m[1]!, 10);
  const min = parseInt(m[2]!, 10);
  const ampm = m[3]!.toUpperCase();
  if (ampm === "PM" && h !== 12) h += 12;
  if (ampm === "AM" && h === 12) h = 0;
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

/** Minutes since midnight for "HH:MM". */
function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

/** Compute decimal work hours from two 24h times. */
function calcHours(clockIn: string | null, clockOut: string | null): string | null {
  if (!clockIn || !clockOut) return null;
  const diff = toMinutes(clockOut) - toMinutes(clockIn);
  if (diff <= 0) return null;
  return (diff / 60).toFixed(2);
}

interface LineCell {
  x: number;
  s: string;
}

// Fixed column x-coordinates from the device layout. A cell is assigned to a
// column when its x falls inside [center - HALF, center + HALF].
const COL_IN = 191;
const COL_OUT = 301;
const COL_TOLERANCE = 40; // generous; the In/Out columns are ~110px apart.

/** Pick the first cell whose x is within tolerance of a column centre. */
function cellNear(cells: LineCell[], centre: number, tolerance = COL_TOLERANCE): string | null {
  const hit = cells.find((c) => Math.abs(c.x - centre) <= tolerance);
  return hit ? hit.s.trim() : null;
}

/** Day-type / leave-taken keywords that mean "no expected clock punch". */
const ABSENCE_KEYWORDS =
  /^(Absent|Annual|Certified Sick|Uncert\. Sick|Out of Office|Out of Town|Leave|Holiday)\b/i;

/**
 * Parse the timesheet PDF ArrayBuffer into per-day rows.
 *
 * Lines are reconstructed by grouping text items that share a y-coordinate;
 * In / Out / Work columns are then resolved by each item's x-coordinate so a
 * row with only an Out punch (or only an In punch) is never mis-attributed.
 */
export async function parseTimesheetPdf(data: ArrayBuffer): Promise<ParsedTimesheetRow[]> {
  const doc = await getDocument({ data: new Uint8Array(data) }).promise;
  const rows: ParsedTimesheetRow[] = [];
  let currentName = "";
  let currentUserId = "";

  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const tc = await page.getTextContent();

    // Group text items into lines keyed by rounded y-coordinate.
    const lines = new Map<number, LineCell[]>();
    for (const it of tc.items) {
      if (!("str" in it) || !it.str.trim()) continue;
      const tr = it.transform as number[];
      const y = Math.round(tr[5]!);
      const x = Math.round(tr[4]!);
      (lines.get(y) ?? lines.set(y, []).get(y)!).push({ x, s: it.str });
    }

    // Top-down (descending y).
    const ys = [...lines.keys()].sort((a, b) => b - a);
    for (const y of ys) {
      const cells = lines.get(y)!.sort((a, b) => a.x - b.x);
      const text = cells.map((c) => c.s).join(" ");

      // Header line — update the staff context for following day rows.
      const nameM = text.match(/Name\s*:\s*(.+?)\s+Department/);
      if (nameM) currentName = nameM[1]!.trim();
      const uidM = text.match(/User ID\s*:\s*(\S+)/);
      if (uidM) currentUserId = uidM[1]!.trim();

      // Day row — the FIRST cell must start with MM-DD-YYYY. (Per-staff summary
      // tables at the foot of each section start with "Workday"/"Total" — those
      // contain decimals at column-ish x positions and must NOT be parsed.)
      const firstCell = cells[0]?.s.trim() ?? "";
      const dateM = firstCell.match(/^(\d{2})-(\d{2})-(\d{4})\b/);
      if (!dateM || !currentName) continue;

      const isoDate = `${dateM[3]}-${dateM[1]}-${dateM[2]}`;

      // Clock In / Out — resolved strictly by x-coordinate.
      const inRaw = cellNear(cells, COL_IN);
      const outRaw = cellNear(cells, COL_OUT);
      const clockIn = inRaw ? to24h(inRaw) : null;
      const clockOut = outRaw ? to24h(outRaw) : null;

      // Day Type column (x≈86) — only ever Workday / Restday / Holiday.
      const dayTypeCell = cellNear(cells, 86, 30) ?? "";
      // Leave Taken column (x≈551) — Absent / Annual / sick leave / Out of Office…
      const leaveCell = cells.find((c) => c.x >= 530 && c.x <= 615)?.s.trim() ?? "";

      let dayType = "Workday";
      if (/Restday/i.test(dayTypeCell)) dayType = "Restday";
      else if (/Holiday/i.test(dayTypeCell) || /^Holiday/i.test(leaveCell)) dayType = "Holiday";
      else if (ABSENCE_KEYWORDS.test(leaveCell) && !clockIn && !clockOut) dayType = "Absent";

      // Work hours = clock-out − clock-in, always computed from the punches.
      // (The device's printed Work column is ignored — punches are authoritative.)
      const hoursWorked = calcHours(clockIn, clockOut);

      let minutesLate = 0;
      if (clockIn) {
        const over = toMinutes(clockIn) - (WORK_START_MIN + GRACE_MIN);
        if (over > 0) minutesLate = over;
      }

      rows.push({
        staffName: currentName,
        userId: currentUserId,
        date: isoDate,
        clockIn,
        clockOut,
        hoursWorked,
        isLate: minutesLate > 0,
        minutesLate,
        dayType,
      });
    }
  }

  return rows;
}

/** Map an attendance dayType to the DB attendance_status enum. */
export function dayTypeToStatus(
  dayType: string,
): "Workday" | "Restday" | "Absent" | "Leave" | "Holiday" {
  switch (dayType) {
    case "Restday":
      return "Restday";
    case "Holiday":
      return "Holiday";
    case "Absent":
      return "Absent";
    default:
      return "Workday";
  }
}
