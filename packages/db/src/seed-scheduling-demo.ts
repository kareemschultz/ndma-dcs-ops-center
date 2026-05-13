/**
 * seed-scheduling-demo.ts
 * Populates dcs_on_call_weeks + noc_shifts + quarterly_maintenance_tasks
 * with realistic demo data using staff from seed-demo.ts.
 *
 * Run: bun packages/db/src/seed-scheduling-demo.ts
 */
import { db } from "./index";
import { dcsOnCallWeeks, quarterlyMaintenanceTasks } from "./schema/scheduling";
import { nocShifts } from "./schema/noc-shifts";

// DCS staff (from seed-demo.ts)
const DCS = {
  lead:       "sp-sachin",
  asn:        "sp-kareem",
  enterprise: "sp-devon",
  core:       "sp-nicolai",
};

// NOC staff — 5 rotators using DCS staff as stand-ins for demo
const NOC_STAFF = ["sp-shemar", "sp-bheesham", "sp-timothy", "sp-gerard", "sp-devon"];

// Helper: ISO week start/end (Mon-Sun) for a given year + weekNum
function weekDates(year: number, weekNum: number): { start: string; end: string } {
  // Jan 4 is always in week 1 (ISO 8601)
  const jan4 = new Date(year, 0, 4);
  const dayOfWeek = jan4.getDay() || 7;
  const week1Mon = new Date(jan4);
  week1Mon.setDate(jan4.getDate() - dayOfWeek + 1);

  const start = new Date(week1Mon);
  start.setDate(week1Mon.getDate() + (weekNum - 1) * 7);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);

  return {
    start: start.toISOString().slice(0, 10),
    end:   end.toISOString().slice(0, 10),
  };
}

// ── DCS On-Call Weeks ─────────────────────────────────────────────────────
async function seedDcsOnCall() {
  console.log("📅 Seeding DCS on-call weeks (weeks 1-26, 2026)...");

  const rotation = [
    [DCS.lead, DCS.asn,        DCS.enterprise, DCS.core],
    [DCS.asn,  DCS.enterprise, DCS.core,        DCS.lead],
    [DCS.enterprise, DCS.core, DCS.lead,        DCS.asn],
    [DCS.core, DCS.lead,       DCS.asn,         DCS.enterprise],
  ];

  let inserted = 0;
  for (let w = 1; w <= 26; w++) {
    const rot = rotation[(w - 1) % 4];
    const { start, end } = weekDates(2026, w);
    try {
      await db
        .insert(dcsOnCallWeeks)
        .values({
          year:               2026,
          weekNum:            w,
          weekStartDate:      start,
          weekEndDate:        end,
          leadEngineerId:     rot[0],
          asnSupportId:       rot[1],
          enterpriseSupportId: rot[2],
          coreSupportId:      rot[3],
          notes:              w % 4 === 0 ? "Public holiday adjustment — check calendar" : null,
        })
        .onConflictDoNothing();
      inserted++;
    } catch (e: any) {
      console.warn(`  ⚠ week ${w}: ${e.message?.slice(0, 80)}`);
    }
  }
  console.log(`  ✅ ${inserted} DCS on-call week rows inserted`);
}

// ── NOC Shifts ───────────────────────────────────────────────────────────
// 7-day rotating pattern per staff member
const SHIFT_PATTERNS: Array<ReadonlyArray<string>> = [
  ["12hr Day",   "12hr Day",   "12hr Night", "12hr Night", "Off",         "Off",         "Off"],
  ["Off",        "Off",        "12hr Day",   "12hr Day",   "12hr Night",  "12hr Night",  "Off"],
  ["12hr Night", "Off",        "Off",        "12hr Day",   "12hr Day",    "12hr Night",  "12hr Night"],
  ["Off",        "12hr Night", "Off",        "Off",        "12hr Day",    "12hr Day",    "12hr Night"],
  ["12hr Day",   "12hr Night", "12hr Night", "Off",        "Off",         "12hr Day",    "12hr Day"],
];

// Special overrides by staffId → date → shiftType
const SPECIALS: Record<string, Record<string, string>> = {
  "sp-shemar":   { "2026-05-01": "Annual Leave", "2026-05-02": "Annual Leave", "2026-05-05": "Annual Leave" },
  "sp-bheesham": { "2026-04-20": "Sick Leave",    "2026-04-21": "Sick Leave" },
  "sp-timothy":  { "2026-05-07": "Split Shift" },
};

async function seedNocShifts() {
  console.log("🕐 Seeding NOC shifts (April + May 2026)...");

  const months = [
    { year: 2026, month: 4, days: 30 },
    { year: 2026, month: 5, days: 31 },
  ];

  let inserted = 0;
  for (const { year, month, days } of months) {
    for (let d = 1; d <= days; d++) {
      const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      const dayOfWeek = new Date(dateStr).getDay(); // 0=Sun
      const weekDay = dayOfWeek === 0 ? 6 : dayOfWeek - 1; // 0=Mon…6=Sun

      for (let si = 0; si < NOC_STAFF.length; si++) {
        const staffId = NOC_STAFF[si];
        const shiftType = SPECIALS[staffId]?.[dateStr] ?? SHIFT_PATTERNS[si][weekDay];

        try {
          await db
            .insert(nocShifts)
            .values({
              staffId,
              shiftDate: dateStr,
              shiftType: shiftType as any,
            })
            .onConflictDoNothing();
          inserted++;
        } catch (e: any) {
          console.warn(`  ⚠ ${staffId} ${dateStr}: ${e.message?.slice(0, 80)}`);
        }
      }
    }
  }
  console.log(`  ✅ ${inserted} NOC shift rows inserted`);
}

// ── Quarterly Maintenance ─────────────────────────────────────────────────
async function seedMaintenance() {
  console.log("🔧 Seeding quarterly maintenance tasks (Q2 + Q3 2026)...");

  const tasks = [
    // Q2 = 2
    { year: 2026, quarter: 2, taskName: "UPS battery checks — all server rooms",        assignedStaffIds: ["sp-gerard"],              completionStatus: "complete"     as const, completionDate: "2026-04-15", completionNotes: "Rooms A, B, C checked. Room C battery at 71% — scheduled for Q3 replacement." },
    { year: 2026, quarter: 2, taskName: "Server room temperature audit",                 assignedStaffIds: ["sp-sachin"],              completionStatus: "complete"     as const, completionDate: "2026-04-22", completionNotes: "All rooms within spec. Chillers serviced." },
    { year: 2026, quarter: 2, taskName: "Patch cycle — Windows Server 2022",             assignedStaffIds: ["sp-bheesham", "sp-shemar"], completionStatus: "in_progress" as const, completionDate: null,         completionNotes: null },
    { year: 2026, quarter: 2, taskName: "Fibre tray cleaning — Rack A backbone",         assignedStaffIds: ["sp-devon"],               completionStatus: "pending"      as const, completionDate: null,         completionNotes: null },
    { year: 2026, quarter: 2, taskName: "Generator fuel top-up + load test",             assignedStaffIds: ["sp-gerard"],              completionStatus: "pending"      as const, completionDate: null,         completionNotes: null },
    { year: 2026, quarter: 2, taskName: "Network diagram update — post LEO installs",    assignedStaffIds: ["sp-kareem", "sp-timothy"], completionStatus: "pending"     as const, completionDate: null,         completionNotes: null },
    // Q3 = 3
    { year: 2026, quarter: 3, taskName: "UPS battery checks — all server rooms (Q3)",   assignedStaffIds: ["sp-gerard"],              completionStatus: "pending"      as const, completionDate: null,         completionNotes: "Replace Room C battery flagged in Q2." },
    { year: 2026, quarter: 3, taskName: "Firewall firmware upgrade — FortiGate 1801F",   assignedStaffIds: ["sp-bheesham"],            completionStatus: "pending"      as const, completionDate: null,         completionNotes: null },
    { year: 2026, quarter: 3, taskName: "Cabling audit — NOC patch panels",              assignedStaffIds: ["sp-timothy", "sp-devon"], completionStatus: "pending"      as const, completionDate: null,         completionNotes: null },
  ];

  let inserted = 0;
  for (const t of tasks) {
    try {
      await db
        .insert(quarterlyMaintenanceTasks)
        .values({
          year:             t.year,
          quarter:          t.quarter,
          taskName:         t.taskName,
          assignedStaffIds: t.assignedStaffIds,
          completionStatus: t.completionStatus,
          completionDate:   t.completionDate ?? null,
          completionNotes:  t.completionNotes ?? null,
        })
        .onConflictDoNothing();
      inserted++;
    } catch (e: any) {
      console.warn(`  ⚠ "${t.taskName}": ${e.message?.slice(0, 80)}`);
    }
  }
  console.log(`  ✅ ${inserted} maintenance task rows inserted`);
}

async function main() {
  console.log("\n🗓  DCS Ops Center — Scheduling Demo Seed\n");
  try {
    await seedDcsOnCall();
    await seedNocShifts();
    await seedMaintenance();
    console.log("\n✅ Scheduling seed complete!\n");
  } catch (err) {
    console.error("Seed failed:", err);
    process.exit(1);
  } finally {
    process.exit(0);
  }
}

main();
