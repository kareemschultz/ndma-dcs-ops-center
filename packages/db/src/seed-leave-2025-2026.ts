/**
 * seed-leave-2025-2026.ts
 *
 * Wipes leave_requests and reloads it with the 2025 + 2026 Annual Leave
 * roster extracted from the NDMA source spreadsheets:
 *   - LeaveDates_DCS.xlsx                     (DCS — 2025 free-text + 2026)
 *   - AnnualLeaveRoster2026_20260103_v01.xlsx (NOC — 2026)
 *
 * The parsed, normalised dataset lives in ./data/leave-roster-2025-2026.json
 * (see AGENT_LOG.md 2026-05-15 for how it was extracted).
 *
 * Run: bun --env-file=../../apps/server/.env src/seed-leave-2025-2026.ts
 */
import roster from "./data/leave-roster-2025-2026.json";
import { db } from "./index";
import { leaveRequests, leaveTypes } from "./schema/leave";

type RosterEntry = {
  staffProfileId: string;
  leaveTypeCode: string;
  startDate: string;
  endDate: string;
  totalDays: number;
  reason: string | null;
  year: number;
};

async function main() {
  const entries = roster.entries as RosterEntry[];

  // Resolve leave type codes -> ids
  const types = await db.select().from(leaveTypes);
  const typeByCode = new Map(types.map((t) => [t.code, t.id]));

  // Wipe existing leave requests (user-authorised: replace dev data)
  const deleted = await db.delete(leaveRequests).returning({ id: leaveRequests.id });
  console.log(`Deleted ${deleted.length} existing leave_requests rows.`);

  let inserted = 0;
  const failures: string[] = [];

  for (const e of entries) {
    const leaveTypeId = typeByCode.get(e.leaveTypeCode);
    if (!leaveTypeId) {
      failures.push(`${e.staffProfileId}: unknown leave type "${e.leaveTypeCode}"`);
      continue;
    }
    await db.insert(leaveRequests).values({
      staffProfileId: e.staffProfileId,
      leaveTypeId,
      startDate: e.startDate,
      endDate: e.endDate,
      totalDays: e.totalDays,
      reason: e.reason,
      status: "approved", // historical roster — auto-approved
      approvedAt: new Date(),
    });
    inserted++;
  }

  console.log(`Inserted ${inserted} leave_requests rows.`);
  if (failures.length > 0) {
    console.warn(`Skipped ${failures.length}:`);
    for (const f of failures) console.warn(`  - ${f}`);
  }
  if (Array.isArray(roster.skipped) && roster.skipped.length > 0) {
    console.log(`Source rows skipped at parse time: ${roster.skipped.length} (headers / non-staff names).`);
  }

  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
