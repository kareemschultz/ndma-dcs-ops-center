/**
 * seed-ex-staff.ts
 *
 * Creates minimal, deactivated staff profiles for people who appear in the
 * historical leave / TOSD spreadsheets but no longer work at NDMA. Without a
 * staff_profiles row their historical records cannot be loaded (FK constraint).
 *
 * These profiles are status = "inactive", employmentStatus = "Former Staff" and
 * are NOT on-call eligible — they will not surface in active-staff pickers.
 *
 * Idempotent (onConflictDoNothing).
 * Run: bun --env-file=../../apps/server/.env src/seed-ex-staff.ts
 */
import { user } from "./schema/auth";
import { staffProfiles } from "./schema/staff";
import { db } from "./index";

// slug → display name. The slug drives deterministic ids so re-runs are stable.
const EX_STAFF: [string, string][] = [
  ["alicia-arthur", "Alicia Arthur"],
  ["kevin-pharous", "Kevin Pharous"],
  ["alec-persaud", "Alec Persaud"],
  ["tramayne-henry", "Tramayne Henry"],
  ["jamal-gray", "Jamal Gray"],
  ["osafo-sam", "Osafo Sam"],
  ["marcellous-bhagwandeen", "Marcellous Bhagwandeen"],
  ["lionel-christian", "Lionel Christian"],
  ["titus-collins", "Titus Collins"],
  ["joel-samuels", "Joel Samuels"],
  ["curlyann-morrise", "Curlyann Morrise"],
  ["molly-hurbard", "Molly Hurbard"],
];

async function main() {
  let users = 0;
  let profiles = 0;

  for (let i = 0; i < EX_STAFF.length; i++) {
    const [slug, name] = EX_STAFF[i]!;
    const userId = `ex-user-${slug}`;
    const profileId = `sp-ex-${slug}`;

    const u = await db
      .insert(user)
      .values({
        id: userId,
        name,
        email: `${slug}@former.ndma.gov.gy`,
        emailVerified: false,
        role: "staff",
      })
      .onConflictDoNothing()
      .returning({ id: user.id });
    users += u.length;

    const p = await db
      .insert(staffProfiles)
      .values({
        id: profileId,
        userId,
        employeeId: `EX-${String(i + 1).padStart(3, "0")}`,
        departmentId: "dept-noc",
        jobTitle: "Former Staff",
        status: "inactive",
        employmentStatus: "Former Staff",
        isOnCallEligible: false,
        startDate: new Date("2021-01-01"),
      })
      .onConflictDoNothing()
      .returning({ id: staffProfiles.id });
    profiles += p.length;
  }

  console.log(`Ex-staff seed: ${users} users + ${profiles} staff_profiles created `
    + `(${EX_STAFF.length} total — existing rows left untouched).`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
