/**
 * seed-tosd-2022-2026.ts
 *
 * Loads the Time-Off / Sick-Days register (2022-2026) extracted from
 * TimeOffSickDays_20251010_v01.xlsx (sheets 2022-TOSD … 2026-TOSD + 2023-Callout).
 *
 * Parsed dataset: ./data/tosd-records-2022-2026.json
 * Ex-staff records (Alicia Arthur, Kevin Pharous, etc.) are NOT included — those
 * people have no staff_profiles row. See AGENT_LOG.md 2026-05-15.
 *
 * Run: bun --env-file=../../apps/server/.env src/seed-tosd-2022-2026.ts
 */
import roster from "./data/tosd-records-2022-2026.json";
import { db } from "./index";
import { tosdRecords } from "./schema/tosd-records";
import type { TosdType } from "./schema/tosd-records";

type TosdEntry = {
  staffProfileId: string;
  date: string;
  type: TosdType;
  reasonText: string | null;
  days: number | null;
  hours: number | null;
};

async function main() {
  const entries = roster.entries as TosdEntry[];

  const deleted = await db.delete(tosdRecords).returning({ id: tosdRecords.id });
  console.log(`Deleted ${deleted.length} existing tosd_records rows.`);

  let inserted = 0;
  for (const e of entries) {
    await db.insert(tosdRecords).values({
      staffId: e.staffProfileId,
      date: e.date,
      type: e.type,
      reasonText: e.reasonText,
      days: e.days != null ? String(e.days) : null,
      hours: e.hours != null ? String(e.hours) : null,
    });
    inserted++;
  }

  console.log(`Inserted ${inserted} tosd_records rows.`);
  if (Array.isArray(roster.skipped) || typeof roster.skipped === "object") {
    const skippedTotal = Object.values(roster.skipped as Record<string, number>)
      .reduce((a, b) => a + b, 0);
    console.log(`Skipped ${skippedTotal} ex-staff records (no staff_profiles row).`);
  }

  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
