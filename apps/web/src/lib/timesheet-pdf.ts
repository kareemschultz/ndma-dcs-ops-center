// Parser for the NDMA "Electronic Time Card" timesheet PDF.
//
// PDF structure (one staff member spans several pages):
//   - A header line per page:  "User ID : 220   Name : Ataybia Williams   Department : Data Centre   Date : 03/01/2026 - 04/30/2026"
//   - One row per calendar day: "MM-DD-YYYY Day  DayType  Sche  [In time]  [Out time]  [WorkHours]"
//     e.g.  "03-05-2026 Thu  Workday  1  08:53 AM  04:35 PM  7.62"
//   - In / Out times are 12-hour "hh:mm AM/PM". WorkHours is a decimal printed by the device.
//   - Restday / Holiday rows and "Absent" rows have no clock times.
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

/**
 * Parse the timesheet PDF ArrayBuffer into per-day rows.
 * Lines are reconstructed by grouping text items that share a y-coordinate.
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

      // Day row — starts with MM-DD-YYYY.
      const dateM = text.match(/^(\d{2})-(\d{2})-(\d{4})\b/);
      if (!dateM || !currentName) continue;

      const isoDate = `${dateM[3]}-${dateM[1]}-${dateM[2]}`;

      // Day type.
      let dayType = "Workday";
      if (/\bRestday\b/.test(text)) dayType = "Restday";
      else if (/\bHoliday\b/.test(text)) dayType = "Holiday";
      else if (/\bAbsent\b/.test(text)) dayType = "Absent";

      // Clock times: 12-hour times appear in column order — first = In, second = Out.
      const timeMatches = [...text.matchAll(/(\d{1,2}:\d{2}\s*(?:AM|PM))/gi)].map((m) =>
        to24h(m[1]!),
      );
      const clockIn = timeMatches[0] ?? null;
      const clockOut = timeMatches[1] ?? null;

      // Work hours: the device prints a decimal like "7.62" / "8.50".
      const hoursM = text.match(/\b(\d{1,2}\.\d{2})\b/);
      const hoursWorked = hoursM ? hoursM[1]! : calcHours(clockIn, clockOut);

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
