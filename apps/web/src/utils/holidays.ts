/**
 * Guyana Public Holidays — used to highlight holiday columns in scheduling grids.
 *
 * Sources:
 *  - Fixed: New Year's Day, Mashramani, Labour Day, Indian Arrival Day,
 *           Independence Day, CARICOM Day, Emancipation Day, Christmas, Boxing Day
 *  - Variable (computed per year): Phagwah (Holi), Good Friday, Easter Monday,
 *           Diwali, Youman Nabi (Eid al-Milad)
 *
 * Update the variable dates each year when the calendar is confirmed.
 */

// Map of "YYYY-MM-DD" → holiday name
const HOLIDAYS: Record<string, string> = {
  // ── 2025 ─────────────────────────────────────────────────────────────────────
  "2025-01-01": "New Year's Day",
  "2025-02-23": "Mashramani (Republic Day)",
  "2025-03-25": "Phagwah (Holi)",
  "2025-04-18": "Good Friday",
  "2025-04-21": "Easter Monday",
  "2025-05-01": "Labour Day",
  "2025-05-05": "Indian Arrival Day",
  "2025-05-26": "Independence Day",
  "2025-07-07": "CARICOM Day",
  "2025-08-01": "Emancipation Day",
  "2025-10-21": "Diwali",
  "2025-11-05": "Youman Nabi",
  "2025-12-25": "Christmas Day",
  "2025-12-26": "Boxing Day",

  // ── 2026 ─────────────────────────────────────────────────────────────────────
  "2026-01-01": "New Year's Day",
  "2026-02-23": "Mashramani (Republic Day)",
  "2026-03-14": "Phagwah (Holi)",
  "2026-04-03": "Good Friday",
  "2026-04-06": "Easter Monday",
  "2026-05-01": "Labour Day",
  "2026-05-05": "Indian Arrival Day",
  "2026-05-26": "Independence Day",
  "2026-07-06": "CARICOM Day",
  "2026-08-01": "Emancipation Day",
  "2026-10-11": "Diwali",
  "2026-10-25": "Youman Nabi",
  "2026-12-25": "Christmas Day",
  "2026-12-26": "Boxing Day",

  // ── 2027 ─────────────────────────────────────────────────────────────────────
  "2027-01-01": "New Year's Day",
  "2027-02-23": "Mashramani (Republic Day)",
  "2027-03-03": "Phagwah (Holi)",
  "2027-03-26": "Good Friday",
  "2027-03-29": "Easter Monday",
  "2027-05-01": "Labour Day",
  "2027-05-05": "Indian Arrival Day",
  "2027-05-26": "Independence Day",
  "2027-07-05": "CARICOM Day",
  "2027-08-01": "Emancipation Day",
  "2027-10-29": "Diwali",
  "2027-10-14": "Youman Nabi",
  "2027-12-25": "Christmas Day",
  "2027-12-26": "Boxing Day",
};

/**
 * Returns the holiday name if the given date string ("YYYY-MM-DD") is a public holiday,
 * or `null` if it is not.
 */
export function getHoliday(dateStr: string): string | null {
  return HOLIDAYS[dateStr] ?? null;
}

/**
 * Returns all holiday entries that fall within the given month.
 * Returns an array of { date: "YYYY-MM-DD", name: string }.
 */
export function getHolidaysForMonth(
  year: number,
  month: number,
): { date: string; name: string }[] {
  const prefix = `${year}-${String(month).padStart(2, "0")}-`;
  return Object.entries(HOLIDAYS)
    .filter(([date]) => date.startsWith(prefix))
    .map(([date, name]) => ({ date, name }));
}

/**
 * Returns all holiday entries within a date range (inclusive).
 */
export function getHolidaysInRange(
  fromDate: string,
  toDate: string,
): { date: string; name: string }[] {
  return Object.entries(HOLIDAYS)
    .filter(([date]) => date >= fromDate && date <= toDate)
    .map(([date, name]) => ({ date, name }));
}
