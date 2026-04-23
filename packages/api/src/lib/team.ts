import { eq, inArray } from "drizzle-orm";

import { db, departments, staffProfiles } from "@ndma-dcs-staff-portal/db";

export type TeamCode = "DCS" | "NOC";

export function normalizeTeamCode(value: string | null | undefined): TeamCode | null {
  if (value === "DCS" || value === "NOC") return value;
  return null;
}

export async function getTeamDepartmentIds(team: TeamCode) {
  const rows = await db
    .select({ id: departments.id })
    .from(departments)
    .where(eq(departments.code, team));
  return rows.map((row) => row.id);
}

export async function getTeamStaffIds(team: TeamCode) {
  const departmentIds = await getTeamDepartmentIds(team);
  if (departmentIds.length === 0) {
    return [];
  }

  const rows = await db
    .select({ id: staffProfiles.id })
    .from(staffProfiles)
    .where(inArray(staffProfiles.departmentId, departmentIds));

  return rows.map((row) => row.id);
}
