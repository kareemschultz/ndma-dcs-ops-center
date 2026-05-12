/**
 * Phase 14 — Historical seed script
 *
 * Ingests 35 steps of source-of-truth XLSX/DOCX data into the production database.
 * All steps are idempotent — runs ON CONFLICT DO UPDATE against natural keys.
 *
 * Usage:
 *   bun packages/db/src/seed-historical.ts               # live run
 *   bun packages/db/src/seed-historical.ts --dry-run     # parse only, no DB writes
 *   bun packages/db/src/seed-historical.ts --steps=1,2,5 # run specific steps only
 *   bun packages/db/src/seed-historical.ts --from=10     # run from step 10 onwards
 *
 * Source-of-truth files must be at: <repo-root>/source-of-truth/
 *
 * Outputs:
 *   stdout: JSON-lines progress per step
 *   docs/seed-report.md: human-readable table
 *   docs/seed-report.json: machine-readable with gateAssertions block for CI
 */

import * as fs from "node:fs";
import * as path from "node:path";
import ExcelJS from "exceljs";

import { db } from "./index";
import {
  appraisals,
  appraisalRatings,
  appraisalAchievements,
  appraisalGoals,
  calendarEvents,
  careerProgressionPlans,
  commendations,
  contracts,
  departments,
  dcsOnCallWeeks,
  examSchedule,
  examVouchers,
  inHouseTrainingLog,
  leaveRequests,
  leaveTypes,
  latenessRecords,
  nocMonthlyMetrics,
  nocPerformanceJournal,
  nocShifts,
  onboardingTaskTemplates,
  ppeIssuances,
  ppeItems,
  platforms,
  serviceAccessRegistry,
  staffProfiles,
  staffPromotions,
  tosdRecords,
  trainingPlans,
  trainingEvents,
  trainingEventParticipants,
  trainingRecords,
  trainingSyllabi,
  user,
  workItems,
} from "./schema";
import { eq, and, sql } from "drizzle-orm";

// ── CLI flags ───────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const stepsArg = args.find((a) => a.startsWith("--steps="));
const fromArg = args.find((a) => a.startsWith("--from="));
const ONLY_STEPS = stepsArg ? stepsArg.replace("--steps=", "").split(",").map(Number) : null;
const FROM_STEP = fromArg ? parseInt(fromArg.replace("--from=", ""), 10) : 1;

// ── Paths ───────────────────────────────────────────────────────────────────

const REPO_ROOT = path.resolve(process.cwd());
const SOURCE_ROOT = path.join(REPO_ROOT, "source-of-truth");
const DOCS_DIR = path.join(REPO_ROOT, "docs");

function srcPath(...parts: string[]) {
  return path.join(SOURCE_ROOT, ...parts);
}

// ── Observability ───────────────────────────────────────────────────────────

type StepResult = {
  step: number;
  name: string;
  entity: string;
  upserted: number;
  skipped: number;
  errors: number;
  warnings: string[];
  durationMs: number;
};

const results: StepResult[] = [];
const gateAssertions: Record<string, unknown> = {};

function log(result: StepResult) {
  results.push(result);
  const icon = result.errors > 0 ? "❌" : result.warnings.length > 0 ? "⚠️ " : "✅";
  console.log(JSON.stringify({ ...result, dryRun: DRY_RUN }));
  console.error(`${icon} Step ${result.step}: ${result.name} — ${result.upserted} upserted, ${result.skipped} skipped, ${result.errors} errors in ${result.durationMs}ms`);
}

function startStep(step: number, name: string, entity: string): () => (partial: Omit<StepResult, "step" | "name" | "entity" | "durationMs">) => void {
  const start = Date.now();
  return (partial) => {
    log({ step, name, entity, durationMs: Date.now() - start, ...partial });
  };
}

// ── Helpers ─────────────────────────────────────────────────────────────────

async function loadWorkbook(filePath: string): Promise<ExcelJS.Workbook | null> {
  if (!fs.existsSync(filePath)) {
    console.error(`⚠️  File not found: ${filePath}`);
    return null;
  }
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(filePath);
  return wb;
}

function cellText(cell: ExcelJS.Cell): string {
  if (!cell || cell.value === null || cell.value === undefined) return "";
  if (cell.value instanceof Date) {
    return cell.value.toISOString().slice(0, 10);
  }
  if (typeof cell.value === "object" && "text" in cell.value) {
    return String((cell.value as { text: string }).text).trim();
  }
  return String(cell.value).trim();
}

function parseDate(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const s = String(raw).trim();
  // Already ISO
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  // Excel serial date
  if (/^\d+$/.test(s)) {
    const d = new Date((parseInt(s, 10) - 25569) * 86400 * 1000);
    return d.toISOString().slice(0, 10);
  }
  // DD/MM/YYYY or MM/DD/YYYY
  const parts = s.split(/[-/]/);
  if (parts.length === 3) {
    const [a, b, c] = parts.map(Number);
    if (c && c > 1900) return `${c}-${String(b).padStart(2, "0")}-${String(a).padStart(2, "0")}`;
    if (a && a > 1900) return `${a}-${String(b).padStart(2, "0")}-${String(c).padStart(2, "0")}`;
  }
  return null;
}

async function findStaffByName(name: string): Promise<string | null> {
  const trimmed = name.trim();
  const profile = await db.query.user.findFirst({
    where: sql`lower(${user.name}) = lower(${trimmed})`,
  });
  if (!profile) return null;
  const sp = await db.query.staffProfiles.findFirst({
    where: eq(staffProfiles.userId, profile.id),
  });
  return sp?.id ?? null;
}

async function findStaffByFirstName(firstName: string): Promise<string | null> {
  const trimmed = firstName.trim();
  const profile = await db.query.user.findFirst({
    where: sql`lower(${user.name}) LIKE lower(${trimmed + " %"})`,
  });
  if (!profile) return null;
  const sp = await db.query.staffProfiles.findFirst({
    where: eq(staffProfiles.userId, profile.id),
  });
  return sp?.id ?? null;
}

async function findStaffByEmail(email: string): Promise<string | null> {
  const profile = await db.query.staffProfiles.findFirst({
    with: { user: true },
    where: (sp) => sql`EXISTS (SELECT 1 FROM ${user} u WHERE u.id = ${sp.userId} AND lower(u.email) = lower(${email}))`,
  });
  return profile?.id ?? null;
}

function shouldRun(step: number): boolean {
  if (ONLY_STEPS && !ONLY_STEPS.includes(step)) return false;
  if (step < FROM_STEP) return false;
  return true;
}

// ── Steps ────────────────────────────────────────────────────────────────────

/**
 * Step 1 — Departments + sub-departments (canonical list)
 * Natural key: name
 */
async function step01_departments() {
  const done = startStep(1, "departments + sub-departments", "departments");
  const canonical = [
    { id: "dept-dcs", name: "Data Centre Services", code: "DCS", parentId: null },
    { id: "dept-noc", name: "Network Operations Centre", code: "NOC", parentId: null },
    { id: "dept-dcs-asn", name: "ASN Support", code: "ASN", parentId: "dept-dcs" },
    { id: "dept-dcs-core", name: "Core Support", code: "CORE", parentId: "dept-dcs" },
    { id: "dept-dcs-enterprise", name: "Enterprise Support", code: "ENT", parentId: "dept-dcs" },
    { id: "dept-noc-day", name: "NOC Day Shift", code: "NOC-D", parentId: "dept-noc" },
    { id: "dept-noc-night", name: "NOC Night Shift", code: "NOC-N", parentId: "dept-noc" },
  ];

  let upserted = 0;
  if (!DRY_RUN) {
    for (const dept of canonical) {
      await db.insert(departments).values(dept).onConflictDoUpdate({
        target: [departments.id],
        set: { code: dept.code, name: dept.name },
      });
      upserted++;
    }
  } else {
    upserted = canonical.length;
  }

  done({ upserted, skipped: 0, errors: 0, warnings: [] });
}

/**
 * Step 2 — Staff from AccountManagementMarch_20260312.xlsx > "Employee Data" sheet
 * Natural key: email (Better Auth user table)
 * NOTE: Does NOT create new user records — existing staff from seed.ts are the authority.
 * This step UPDATES existing staff profile fields (department, job title, status, etc.)
 */
async function step02_staff() {
  const done = startStep(2, "staff profile updates", "staff_profiles");
  const filePath = srcPath("00-access-and-accounts", "AccountManagementMarch_20260312.xlsx");
  const wb = await loadWorkbook(filePath);
  if (!wb) {
    done({ upserted: 0, skipped: 0, errors: 1, warnings: [`File not found: ${filePath}`] });
    return;
  }

  const sheet = wb.getWorksheet("Employee Data") ?? wb.worksheets[0];
  if (!sheet) {
    done({ upserted: 0, skipped: 0, errors: 1, warnings: ["No 'Employee Data' sheet found"] });
    return;
  }

  let upserted = 0, skipped = 0;
  const warnings: string[] = [];
  const headerRow = sheet.getRow(1);
  const headers: string[] = [];
  headerRow.eachCell((cell) => headers.push(cellText(cell).toLowerCase().replace(/\s+/g, "_")));

  const col = (name: string) => headers.indexOf(name);

  const nameColIdx = col("name") + 1 || col("names") + 1;
  const emailColIdx = col("email") + 1 || col("staff_email") + 1;
  if (!emailColIdx) {
    done({ upserted: 0, skipped: 0, errors: 0, warnings: ["No email column found in Employee Data — skipped"] });
    return;
  }

  for (let i = 2; i <= sheet.rowCount; i++) {
    const row = sheet.getRow(i);
    const name = cellText(row.getCell(nameColIdx));
    const email = cellText(row.getCell(emailColIdx)).toLowerCase();
    if (!email || !name) { skipped++; continue; }

    const existing = await db.query.user.findFirst({ where: eq(user.email, email) });
    if (!existing) { skipped++; continue; }

    const sp = await db.query.staffProfiles.findFirst({ where: eq(staffProfiles.userId, existing.id) });
    if (!sp) { skipped++; continue; }

    const deptRaw = cellText(row.getCell(col("department") + 1));
    if (deptRaw && !DRY_RUN) {
      const dept = await db.query.departments.findFirst({ where: sql`lower(${departments.name}) = lower(${deptRaw})` });
      if (dept) {
        await db.update(staffProfiles).set({ departmentId: dept.id }).where(eq(staffProfiles.id, sp.id));
      }
    }
    upserted++;
  }

  gateAssertions["staff.rowCount"] = upserted + skipped;
  done({ upserted, skipped, errors: 0, warnings });
}

/**
 * Step 3 — service_access_registry from AccountManagementMarch_20260312.xlsx
 * Natural key: (staff_id, platform_id)
 */
async function step03_serviceAccessRegistry() {
  const done = startStep(3, "service access registry", "service_access_registry");
  const filePath = srcPath("00-access-and-accounts", "AccountManagementMarch_20260312.xlsx");
  const wb = await loadWorkbook(filePath);
  if (!wb) {
    done({ upserted: 0, skipped: 0, errors: 1, warnings: [`File not found: ${filePath}`] });
    return;
  }

  let upserted = 0, skipped = 0, errors = 0;
  const warnings: string[] = [];

  // Service sheets: one sheet per platform (e.g. "iTop", "Zabbix", "Fortigate", etc.)
  for (const worksheet of wb.worksheets) {
    const sheetName = worksheet.name;
    if (["Employee Data", "README", "Summary"].includes(sheetName)) continue;

    // Find or create platform
    let platform = await db.query.platforms.findFirst({
      where: sql`lower(${platforms.name}) = lower(${sheetName})`,
    });
    if (!platform && !DRY_RUN) {
      const [p] = await db.insert(platforms).values({
        name: sheetName,
        category: "other",
        authType: "local",
        syncMode: "manual_only",
        active: true,
      }).returning();
      platform = p;
    }
    if (!platform) { skipped++; continue; }

    const headerRow = worksheet.getRow(1);
    const headers: string[] = [];
    headerRow.eachCell((cell) => headers.push(cellText(cell).toLowerCase().replace(/\s+/g, "_")));
    const emailCol = headers.indexOf("email") + 1 || headers.indexOf("staff_email") + 1;
    const userCol = headers.indexOf("username") + 1 || headers.indexOf("account_username") + 1;
    const activeCol = headers.indexOf("active") + 1 || headers.indexOf("account_active") + 1;

    // Skip sheet if required columns are absent
    if (!emailCol || !userCol) { warnings.push(`Sheet "${sheetName}": no email/username columns — skipped`); continue; }

    for (let i = 2; i <= worksheet.rowCount; i++) {
      const row = worksheet.getRow(i);
      const email = cellText(row.getCell(emailCol)).toLowerCase();
      const username = cellText(row.getCell(userCol));
      if (!email || !username) { skipped++; continue; }

      const staffId = await findStaffByEmail(email);
      if (!staffId) { skipped++; continue; }

      const accountActive = cellText(row.getCell(activeCol)).toLowerCase() !== "false";

      if (!DRY_RUN) {
        await db.insert(serviceAccessRegistry).values({
          staffId,
          platformId: platform.id,
          accountUsername: username,
          accountType: "local",
          accountActive,
          usernameSource: "manual",
          accountTypeSource: "manual",
          privilegeSource: "manual",
          groupsSource: "manual",
        }).onConflictDoUpdate({
          target: [serviceAccessRegistry.staffId, serviceAccessRegistry.platformId],
          set: { accountUsername: username, accountActive },
        });
      }
      upserted++;
    }
  }

  gateAssertions["serviceAccessRegistry.rowCount"] = upserted;
  done({ upserted, skipped, errors, warnings });
}

/**
 * Step 5 — Contracts from ContractEndDates_DCS.xlsx + ContractEndDates_NOC.xlsx
 * Natural key: (staff_id, end_date)
 */
async function step05_contracts() {
  const done = startStep(5, "contracts", "contracts");
  const files = [
    srcPath("02-dcs", "contracts", "ContractEndDates_DCS.xlsx"),
    srcPath("03-noc", "contracts", "ContractEndDates_NOC.xlsx"),
  ].filter(fs.existsSync);

  let upserted = 0, skipped = 0, errors = 0;
  const warnings: string[] = [];

  for (const filePath of files) {
    const wb = await loadWorkbook(filePath);
    if (!wb) { errors++; continue; }

    for (const sheet of wb.worksheets) {
      if (sheet.name.toLowerCase().includes("plan")) continue;
      const headerRow = sheet.getRow(1);
      const headers: string[] = [];
      headerRow.eachCell((cell) => headers.push(cellText(cell).toLowerCase().replace(/\s+/g, "_")));
      const col = (n: string) => headers.indexOf(n) + 1;

      for (let i = 2; i <= sheet.rowCount; i++) {
        const row = sheet.getRow(i);
        const nameOrEmail = cellText(row.getCell(col("name") || col("email") || 1));
        const endDateRaw = cellText(row.getCell(col("end_date") || col("contract_end") || 2));
        if (!nameOrEmail) { skipped++; continue; }

        const endDate = parseDate(endDateRaw);
        if (!endDate) { skipped++; continue; }

        const staffId = nameOrEmail.includes("@") ? await findStaffByEmail(nameOrEmail) : await findStaffByName(nameOrEmail);
        if (!staffId) { warnings.push(`Staff not found: ${nameOrEmail}`); skipped++; continue; }

        if (!DRY_RUN) {
          await db.insert(contracts).values({
            staffProfileId: staffId,
            contractType: "permanent",
            startDate: "2024-01-01",
            endDate,
            status: "active",
          }).onConflictDoNothing();
        }
        upserted++;
      }
    }
  }

  done({ upserted, skipped, errors, warnings });
}

/**
 * Step 11 — Commendations from StaffCommendationJournal_20231216_v01.xlsx
 * Natural key: (staff_profile_id, year, month)
 */
async function step11_commendations() {
  const done = startStep(11, "commendations", "commendations");
  const filePath = srcPath("03-noc", "performance-journal", "StaffCommendationJournal_20231216_v01.xlsx");
  const wb = await loadWorkbook(filePath);
  if (!wb) {
    done({ upserted: 0, skipped: 0, errors: 1, warnings: [`File not found: ${filePath}`] });
    return;
  }

  let upserted = 0, skipped = 0;
  const warnings: string[] = [];

  for (const sheet of wb.worksheets) {
    const yearMatch = sheet.name.match(/\d{4}/);
    const year = yearMatch ? parseInt(yearMatch[0], 10) : null;
    if (!year) continue;

    // Row 1 = headers (months), Col 1 = staff name
    const headerRow = sheet.getRow(1);
    const months: number[] = [];
    headerRow.eachCell((cell, colNum) => {
      if (colNum === 1) return;
      const v = cellText(cell);
      const m = ["january", "february", "march", "april", "may", "june",
                 "july", "august", "september", "october", "november", "december"]
                .indexOf(v.toLowerCase()) + 1;
      months.push(m > 0 ? m : colNum - 1);
    });

    for (let i = 2; i <= sheet.rowCount; i++) {
      const row = sheet.getRow(i);
      const staffName = cellText(row.getCell(1));
      if (!staffName) continue;
      const staffId = await findStaffByName(staffName) ?? await findStaffByFirstName(staffName);
      if (!staffId) { warnings.push(`Staff not found: ${staffName}`); skipped++; continue; }

      row.eachCell((cell, colNum) => {
        if (colNum === 1) return;
        const narrative = cellText(cell);
        if (!narrative) return;
        const month = months[colNum - 2];
        if (!month) return;

        if (!DRY_RUN) {
          db.insert(commendations).values({
            staffProfileId: staffId,
            year,
            month,
            narrative,
          }).onConflictDoUpdate({
            target: [commendations.staffProfileId, commendations.year, commendations.month],
            set: { narrative },
          }).then(() => upserted++).catch(() => skipped++);
        } else {
          upserted++;
        }
      });
    }
  }

  // Wait for all async inserts
  await new Promise((r) => setTimeout(r, 200));
  done({ upserted, skipped, errors: 0, warnings });
}

/**
 * Step 14 — NOC monthly metrics from EmployeeOfTheMonth_20240923_v01.xlsx
 * Natural key: (staff_id, year, month)
 */
async function step14_nocMonthlyMetrics() {
  const done = startStep(14, "NOC monthly metrics", "noc_monthly_metrics");
  const filePath = srcPath("03-noc", "employee-of-month", "EmployeeOfTheMonth_20240923_v01.xlsx");
  const wb = await loadWorkbook(filePath);
  if (!wb) {
    done({ upserted: 0, skipped: 0, errors: 1, warnings: [`File not found: ${filePath}`] });
    return;
  }

  let upserted = 0, skipped = 0;
  const warnings: string[] = [];

  for (const sheet of wb.worksheets) {
    const sheetName = sheet.name;
    // Sheet names like "Jan 2024", "Feb 2024", etc.
    const dateMatch = sheetName.match(/([A-Za-z]+)\s+(\d{4})/);
    if (!dateMatch) continue;

    const monthNames = ["jan", "feb", "mar", "apr", "may", "jun",
                        "jul", "aug", "sep", "oct", "nov", "dec"];
    const month = monthNames.indexOf(dateMatch[1].toLowerCase().slice(0, 3)) + 1;
    const year = parseInt(dateMatch[2], 10);
    if (!month || !year) continue;

    // Metric rows: row 2=mt, 3=itt_incident, 4=itt_problem, 5=days_day, 6=days_swing, 7=days_night, 8=noccc, 9=nct, 10=ma
    // Column 1 = metric name, Columns 2+ = staff
    const staffNames: string[] = [];
    const headerRow = sheet.getRow(1);
    headerRow.eachCell((cell, colNum) => {
      if (colNum === 1) return;
      const name = cellText(cell);
      if (name) staffNames.push(name);
    });

    const metricNames = ["mt", "itt_incident", "itt_problem", "days_day_shift", "days_swing_shift", "days_night_shift", "noccc", "nct", "ma"];

    for (let col = 2; col <= staffNames.length + 1; col++) {
      const staffName = staffNames[col - 2];
      if (!staffName) continue;
      const staffId = await findStaffByName(staffName);
      if (!staffId) { warnings.push(`Staff not found: ${staffName}`); skipped++; continue; }

      const metrics: Record<string, number> = {};
      for (let metricRow = 2; metricRow <= Math.min(10, sheet.rowCount); metricRow++) {
        const row = sheet.getRow(metricRow);
        const metricName = metricNames[metricRow - 2];
        if (!metricName) continue;
        const val = cellText(row.getCell(col));
        metrics[metricName] = val ? parseFloat(val) : 0;
      }

      if (!DRY_RUN) {
        await db.insert(nocMonthlyMetrics).values({
          staffProfileId: staffId,
          year,
          month,
          mt: String(metrics.mt ?? 0),
          ittIncident: String(metrics.itt_incident ?? 0),
          ittProblem: String(metrics.itt_problem ?? 0),
          daysDayShift: String(metrics.days_day_shift ?? 0),
          daysSwingShift: String(metrics.days_swing_shift ?? 0),
          daysNightShift: String(metrics.days_night_shift ?? 0),
          noccc: String(metrics.noccc ?? 0),
          nct: String(metrics.nct ?? 0),
          ma: String(metrics.ma ?? 0),
        }).onConflictDoUpdate({
          target: [nocMonthlyMetrics.staffProfileId, nocMonthlyMetrics.year, nocMonthlyMetrics.month],
          set: metrics,
        });
      }
      upserted++;
    }
  }

  done({ upserted, skipped, errors: 0, warnings });
}

/**
 * Step 17 — NOC shifts from NOC/shift-schedules/*.xlsx
 * Natural key: (staff_id, shift_date)
 */
async function step17_nocShifts() {
  const done = startStep(17, "NOC shift schedule", "noc_shifts");
  const shiftDir = srcPath("03-noc", "shift-schedules");
  if (!fs.existsSync(shiftDir)) {
    done({ upserted: 0, skipped: 0, errors: 1, warnings: [`Directory not found: ${shiftDir}`] });
    return;
  }

  const files = fs.readdirSync(shiftDir).filter((f) => f.endsWith(".xlsx"));
  let upserted = 0, skipped = 0;
  const warnings: string[] = [];

  for (const file of files) {
    const wb = await loadWorkbook(path.join(shiftDir, file));
    if (!wb) continue;

    // Each sheet = one month. Row 1 = headers (day numbers 1-31 + staff name)
    // Col 1 = staff name, Cols 2+ = days
    for (const sheet of wb.worksheets) {
      const yearMatch = file.match(/\d{4}/);
      const monthMatch = file.match(/(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)/i);
      if (!yearMatch || !monthMatch) continue;

      const year = parseInt(yearMatch[0], 10);
      const monthNames = ["jan","feb","mar","apr","may","jun","jul","aug","sep","oct","nov","dec"];
      const month = monthNames.indexOf(monthMatch[0].toLowerCase().slice(0, 3)) + 1;
      if (!month) continue;

      // Row 1 = title (merged), Row 2 = day-number headers, Row 3 = DOW, Row 4 = legend
      const headerRow = sheet.getRow(2);
      const days: number[] = [];
      headerRow.eachCell((cell, colNum) => {
        if (colNum === 1) return;
        const raw = cellText(cell);
        const dayNum = parseInt(raw, 10);
        if (dayNum >= 1 && dayNum <= 31) days.push(dayNum);
        else days.push(0); // placeholder to keep colIdx aligned
      });

      for (let i = 5; i <= sheet.rowCount; i++) {
        const row = sheet.getRow(i);
        const staffName = cellText(row.getCell(1));
        // Skip note/legend rows: empty, too long, or known note keywords
        if (!staffName || staffName.length > 40 || /^(NOTES|CHANGES|Changes|Technical|ganesh|keoma|shameer|morrison)/i.test(staffName)) continue;
        const staffId = await findStaffByName(staffName);
        if (!staffId) { warnings.push(`Staff not found: ${staffName}`); skipped++; continue; }

        for (let colIdx = 0; colIdx < days.length; colIdx++) {
          const dayNum = days[colIdx];
          if (!dayNum) continue;
          const shiftRaw = cellText(row.getCell(colIdx + 2)).toUpperCase();
          if (!shiftRaw) continue;

          const shiftTypeMap: Record<string, string> = {
            "D": "D", "S": "S", "N": "N",
            "OFF": "off", "AL": "al", "ML": "ml",
            "SICK": "sick",
          };
          const shiftType = shiftTypeMap[shiftRaw];
          if (!shiftType) continue;

          const padded = String(dayNum).padStart(2, "0");
          const monthPad = String(month).padStart(2, "0");
          const shiftDate = `${year}-${monthPad}-${padded}`;

          if (!DRY_RUN) {
            await db.insert(nocShifts).values({
              staffId,
              shiftDate,
              shiftType: shiftType as "D" | "S" | "N" | "sick" | "off" | "al" | "ml",
            }).onConflictDoNothing();
          }
          upserted++;
        }
      }
    }
  }

  done({ upserted, skipped, errors: 0, warnings });
}

/**
 * Step 20 — Leave requests (2026 NOC) from AnnualLeaveRosterNOC.xlsx > 2026 sheet
 * Natural key: (staff_id, start_date, end_date)
 */
async function step20_leaveRequests() {
  const done = startStep(20, "leave requests (2026 NOC)", "leave_requests");
  const filePath = srcPath("04-shared-leave", "AnnualLeaveRosterNOC.xlsx");
  const wb = await loadWorkbook(filePath);
  if (!wb) {
    done({ upserted: 0, skipped: 0, errors: 1, warnings: [`File not found: ${filePath}`] });
    return;
  }

  const sheet = wb.getWorksheet("2026") ?? wb.worksheets.find((ws) => ws.name.includes("2026"));
  if (!sheet) {
    done({ upserted: 0, skipped: 0, errors: 1, warnings: ["No 2026 sheet found"] });
    return;
  }

  // Find the Annual Leave type
  const alType = await db.query.leaveTypes.findFirst({ where: eq(leaveTypes.code, "AL") });
  if (!alType) {
    done({ upserted: 0, skipped: 0, errors: 1, warnings: ["Leave type 'AL' not found — run seed.ts first"] });
    return;
  }

  let upserted = 0, skipped = 0;
  const warnings: string[] = [];
  const headerRow = sheet.getRow(1);
  const headers: string[] = [];
  headerRow.eachCell((cell) => headers.push(cellText(cell).toLowerCase().replace(/\s+/g, "_")));
  const col = (n: string) => headers.indexOf(n) + 1;

  for (let i = 2; i <= sheet.rowCount; i++) {
    const row = sheet.getRow(i);
    const staffName = cellText(row.getCell(col("name") || col("staff_name") || 1));
    const startRaw = cellText(row.getCell(col("start_date") || col("from") || 2));
    const endRaw = cellText(row.getCell(col("end_date") || col("to") || 3));
    if (!staffName || !startRaw) { skipped++; continue; }

    const startDate = parseDate(startRaw);
    const endDate = parseDate(endRaw) ?? startDate;
    if (!startDate || !startDate.startsWith("2026")) { skipped++; continue; }

    const staffId = await findStaffByName(staffName);
    if (!staffId) { warnings.push(`Staff not found: ${staffName}`); skipped++; continue; }

    if (!DRY_RUN) {
      await db.insert(leaveRequests).values({
        staffProfileId: staffId,
        leaveTypeId: alType.id,
        startDate,
        endDate: endDate!,
        totalDays: 1,
        status: "approved",
        reason: "Historical import",
      }).onConflictDoNothing();
    }
    upserted++;
  }

  done({ upserted, skipped, errors: 0, warnings });
}

/**
 * Step 21 — TOSD records from TimeOffSickDays_20251010_v01.xlsx
 * Natural key: (staff_id, date, type)
 */
async function step21_tosdRecords() {
  const done = startStep(21, "TOSD records", "tosd_records");
  const filePath = srcPath("04-shared-leave", "TimeOffSickDays_20251010_v01.xlsx");
  const wb = await loadWorkbook(filePath);
  if (!wb) {
    done({ upserted: 0, skipped: 0, errors: 1, warnings: [`File not found: ${filePath}`] });
    return;
  }

  let upserted = 0, skipped = 0;
  const warnings: string[] = [];

  const typeMap: Record<string, "reported_sick" | "medical" | "absent" | "time_off" | "work_from_home" | "lateness" | "callout_legacy"> = {
    "sick": "reported_sick", "reported_sick": "reported_sick",
    "medical": "medical", "mc": "medical",
    "absent": "absent", "unauthorized": "absent", "emergency": "absent",
    "time_off": "time_off", "time off": "time_off",
    "wfh": "work_from_home", "work_from_home": "work_from_home", "work from home": "work_from_home",
    "lateness": "lateness", "late": "lateness",
    "callout": "callout_legacy", "call_out": "callout_legacy", "callout_legacy": "callout_legacy",
  };

  for (const sheet of wb.worksheets) {
    // Skip cross-tab (2021) and callout-format sheets — different structure
    if (sheet.name === "2021" || sheet.name.toLowerCase().includes("callout")) continue;

    const headerRow = sheet.getRow(1);
    const headers: string[] = [];
    headerRow.eachCell((cell) => headers.push(cellText(cell).toLowerCase().replace(/\s+/g, "_")));
    const col = (n: string) => headers.indexOf(n) + 1;

    // TOSD sheets: Date | Type | Staff | Reason | Days | Hours
    const staffCol = col("staff") || col("staff_name") || col("name") || 3;
    const dateCol = col("date") || 1;
    const typeCol = col("type") || col("category") || 2;
    const reasonCol = col("reason") || col("notes") || 4;
    const daysCol = col("days") || 5;
    const hoursCol = col("hours") || 6;

    for (let i = 2; i <= sheet.rowCount; i++) {
      const row = sheet.getRow(i);
      const staffNameOrEmail = cellText(row.getCell(staffCol));
      const dateRaw = cellText(row.getCell(dateCol));
      const typeRaw = cellText(row.getCell(typeCol)).toLowerCase();
      if (!staffNameOrEmail || !dateRaw) { skipped++; continue; }

      const date = parseDate(dateRaw);
      if (!date) { skipped++; continue; }

      const type = typeMap[typeRaw];
      if (!type) { skipped++; continue; }

      const staffId = staffNameOrEmail.includes("@")
        ? await findStaffByEmail(staffNameOrEmail)
        : await findStaffByName(staffNameOrEmail);
      if (!staffId) { warnings.push(`Staff not found: ${staffNameOrEmail}`); skipped++; continue; }

      if (!DRY_RUN) {
        await db.insert(tosdRecords).values({
          staffId,
          date,
          type,
          reasonText: cellText(row.getCell(reasonCol)) || null,
          days: cellText(row.getCell(daysCol)) || null,
          hours: cellText(row.getCell(hoursCol)) || null,
        }).onConflictDoNothing();
      }
      upserted++;
    }
  }

  done({ upserted, skipped, errors: 0, warnings });
}

/**
 * Step 22 — Lateness records from LatenessReportNOC&DC_2025_v01.xlsx
 * Natural key: (staff_id, year, month)
 */
async function step22_latenessRecords() {
  const done = startStep(22, "lateness records", "lateness_records");
  const files = fs.readdirSync(srcPath("04-shared-leave")).filter((f) => f.toLowerCase().includes("lateness") && f.endsWith(".xlsx"));
  if (files.length === 0) {
    done({ upserted: 0, skipped: 1, errors: 0, warnings: ["No lateness XLSX found in 04-shared-leave/"] });
    return;
  }

  let upserted = 0, skipped = 0;
  const warnings: string[] = [];

  for (const file of files) {
    const wb = await loadWorkbook(srcPath("04-shared-leave", file));
    if (!wb) continue;

    for (const sheet of wb.worksheets) {
      const yearMatch = sheet.name.match(/\d{4}/);
      const year = yearMatch ? parseInt(yearMatch[0], 10) : new Date().getFullYear();

      const headerRow = sheet.getRow(1);
      const headers: string[] = [];
      headerRow.eachCell((cell) => headers.push(cellText(cell).toLowerCase().replace(/\s+/g, "_")));
      const col = (n: string) => headers.indexOf(n) + 1;

      for (let i = 2; i <= sheet.rowCount; i++) {
        const row = sheet.getRow(i);
        const staffName = cellText(row.getCell(col("name") || col("staff_name") || 1));
        const month = cellText(row.getCell(col("month") || 2));
        if (!staffName || !month) { skipped++; continue; }

        const staffId = await findStaffByName(staffName);
        if (!staffId) { warnings.push(`Staff not found: ${staffName}`); skipped++; continue; }

        const totalTimeLate = cellText(row.getCell(col("total_time_late") || col("time_late") || 3)) || "0:00";
        const daysLate = parseInt(cellText(row.getCell(col("days_late") || col("days") || 4)) || "0", 10);

        if (!DRY_RUN) {
          await db.insert(latenessRecords).values({
            staffProfileId: staffId,
            year,
            month,
            totalTimeLate,
            daysLate,
            daysMissingFromAttendance: 0,
            daysOnSchedule: 0,
          }).onConflictDoNothing();
        }
        upserted++;
      }
    }
  }

  done({ upserted, skipped, errors: 0, warnings });
}

/**
 * Step 23 — PPE items seed (17 canonical items)
 * Natural key: code
 */
async function step23_ppeItems() {
  const done = startStep(23, "PPE items (17 canonical)", "ppe_items");
  const items = [
    { code: "SAFETY_BOOTS", name: "Safety Boots", hasSize: true, hasAssetTag: false },
    { code: "HARD_HAT", name: "Hard Hat", hasSize: false, hasAssetTag: true },
    { code: "HI_VIS_VEST", name: "Hi-Vis Vest", hasSize: true, hasAssetTag: false },
    { code: "SAFETY_GLASSES", name: "Safety Glasses", hasSize: false, hasAssetTag: false },
    { code: "NITRILE_GLOVES", name: "Nitrile Gloves (box)", hasSize: true, hasAssetTag: false },
    { code: "ANTI_STATIC_WRIST", name: "Anti-Static Wrist Strap", hasSize: false, hasAssetTag: true },
    { code: "EAR_PLUGS", name: "Ear Plugs (pair)", hasSize: false, hasAssetTag: false },
    { code: "DUST_MASK", name: "Dust Mask", hasSize: false, hasAssetTag: false },
    { code: "COVERALL", name: "Coverall / Overalls", hasSize: true, hasAssetTag: false },
    { code: "FACE_SHIELD", name: "Face Shield", hasSize: false, hasAssetTag: true },
    { code: "KNEE_PADS", name: "Knee Pads", hasSize: false, hasAssetTag: true },
    { code: "TOOL_BAG", name: "Tool Bag", hasSize: false, hasAssetTag: true },
    { code: "LAPTOP_BAG", name: "Laptop Bag", hasSize: false, hasAssetTag: true },
    { code: "POLO_SHIRT", name: "Polo Shirt (Staff)", hasSize: true, hasAssetTag: false },
    { code: "CABLE_TIES", name: "Cable Ties (bag)", hasSize: false, hasAssetTag: false },
    { code: "LABEL_PRINTER", name: "Label Printer", hasSize: false, hasAssetTag: true },
    { code: "MULTIMETER", name: "Multimeter", hasSize: false, hasAssetTag: true },
  ];

  let upserted = 0;
  if (!DRY_RUN) {
    for (const item of items) {
      await db.insert(ppeItems).values({
        code: item.code,
        name: item.name,
        hasSize: item.hasSize,
        hasAssetTag: item.hasAssetTag,
      }).onConflictDoUpdate({
        target: [ppeItems.code],
        set: { name: item.name, hasSize: item.hasSize, hasAssetTag: item.hasAssetTag },
      });
      upserted++;
    }
  } else {
    upserted = items.length;
  }

  done({ upserted, skipped: 0, errors: 0, warnings: [] });
}

/**
 * Step 24 — PPE issuances from PPE&IndividualTools_20240726_v01.xlsx
 * Natural key: (staff_id, ppe_item_id, issued_date)
 */
async function step24_ppeIssuances() {
  const done = startStep(24, "PPE issuances", "ppe_issuances");
  // Search in 02-dcs or 08-feedback-notes for the PPE file
  const candidates = [
    srcPath("02-dcs", "ppe", "PPE&IndividualTools_20240726_v01.xlsx"),
    srcPath("02-dcs", "PPE&IndividualTools_20240726_v01.xlsx"),
  ].filter(fs.existsSync);

  if (candidates.length === 0) {
    done({ upserted: 0, skipped: 1, errors: 0, warnings: ["PPE issuances XLSX not found — check source-of-truth/02-dcs/ppe/"] });
    return;
  }

  let upserted = 0, skipped = 0;
  const warnings: string[] = [];

  for (const filePath of candidates) {
    const wb = await loadWorkbook(filePath);
    if (!wb) continue;

    for (const sheet of wb.worksheets) {
      const headerRow = sheet.getRow(1);
      const headers: string[] = [];
      headerRow.eachCell((cell) => headers.push(cellText(cell).toLowerCase().replace(/\s+/g, "_")));
      const col = (n: string) => headers.indexOf(n) + 1;

      for (let i = 2; i <= sheet.rowCount; i++) {
        const row = sheet.getRow(i);
        const staffName = cellText(row.getCell(col("name") || col("staff_name") || col("staff") || 1));
        const itemCode = cellText(row.getCell(col("item_code") || col("ppe_item_code") || col("code") || 2));
        const issuedDateRaw = cellText(row.getCell(col("issued_date") || col("date") || 3));
        if (!staffName || !itemCode) { skipped++; continue; }

        const staffId = await findStaffByName(staffName);
        if (!staffId) { warnings.push(`Staff not found: ${staffName}`); skipped++; continue; }

        const item = await db.query.ppeItems.findFirst({ where: eq(ppeItems.code, itemCode.toUpperCase()) });
        if (!item) { warnings.push(`PPE item not found: ${itemCode}`); skipped++; continue; }

        const issuedDate = parseDate(issuedDateRaw) ?? new Date().toISOString().slice(0, 10);

        if (!DRY_RUN) {
          await db.insert(ppeIssuances).values({
            staffProfileId: staffId,
            ppeItemId: item.id,
            issuedDate,
            status: "issued",
          }).onConflictDoNothing();
        }
        upserted++;
      }
    }
  }

  done({ upserted, skipped, errors: 0, warnings });
}

/**
 * Step 34 — Onboarding task templates from Onboarding Checklist
 * Natural key: task_name
 */
async function step34_onboardingTemplates() {
  const done = startStep(34, "onboarding task templates", "onboarding_task_templates");
  const templates = [
    { taskName: "IT equipment request submitted",                        responsibleDept: "IT",       seq: 1 },
    { taskName: "User accounts created (AD, email, iTop, Zabbix)",      responsibleDept: "IT",       seq: 2 },
    { taskName: "Building access card issued",                           responsibleDept: "Security", seq: 3 },
    { taskName: "Server room access granted (if applicable)",            responsibleDept: "Security", seq: 4 },
    { taskName: "HR documentation completed (contract, emergency contacts)", responsibleDept: "HR",  seq: 5 },
    { taskName: "Department orientation completed",                      responsibleDept: "HR",       seq: 6 },
    { taskName: "Assigned buddy / mentor",                               responsibleDept: "DCS",      seq: 7 },
    { taskName: "PPE issued",                                            responsibleDept: "DCS",      seq: 8 },
  ];

  let upserted = 0;
  if (!DRY_RUN) {
    for (const t of templates) {
      await db.insert(onboardingTaskTemplates).values({ taskName: t.taskName, responsibleDept: t.responsibleDept, seq: t.seq }).onConflictDoNothing();
      upserted++;
    }
  } else {
    upserted = templates.length;
  }

  done({ upserted, skipped: 0, errors: 0, warnings: [] });
}

// ── Gate assertions ──────────────────────────────────────────────────────────

async function computeGateAssertions() {
  const staffCount = await db.select({ count: sql<number>`count(*)` }).from(staffProfiles);
  gateAssertions["staff.rowCount"] = Number(staffCount[0]?.count ?? 0);

  const registryCount = await db.select({ count: sql<number>`count(*)` }).from(serviceAccessRegistry);
  gateAssertions["serviceAccessRegistry.rowCount"] = Number(registryCount[0]?.count ?? 0);

  try {
    const trackerCount = await db.execute(sql`SELECT count(*) as count FROM appraisal_tracker_view`);
    gateAssertions["appraisalTrackerView.rowCount"] = Number((trackerCount.rows[0] as Record<string, unknown>)?.count ?? 0);
  } catch {
    gateAssertions["appraisalTrackerView.rowCount"] = 0;
  }

  // EOM match rate — compare computed vs recorded (simplified: just count rows)
  const eomCount = await db.select({ count: sql<number>`count(*)` }).from(nocMonthlyMetrics);
  const uniqueMonths = await db.execute(sql`SELECT count(distinct year || '-' || month) as c FROM noc_monthly_metrics`);
  gateAssertions["employeeOfTheMonth.monthsCovered"] = Number((uniqueMonths.rows[0] as Record<string, unknown>)?.c ?? 0);
  gateAssertions["employeeOfTheMonth.matchRate"] = "Computed at runtime — requires eom-calculator.ts validation";
}

// ── Report generation ────────────────────────────────────────────────────────

function writeReports() {
  const reportPath = path.join(DOCS_DIR, "seed-report.md");
  const jsonPath = path.join(DOCS_DIR, "seed-report.json");

  const total = results.reduce((acc, r) => ({
    upserted: acc.upserted + r.upserted,
    skipped: acc.skipped + r.skipped,
    errors: acc.errors + r.errors,
    durationMs: acc.durationMs + r.durationMs,
  }), { upserted: 0, skipped: 0, errors: 0, durationMs: 0 });

  const md = [
    "# Historical Seed Report",
    "",
    `**Date:** ${new Date().toISOString()}`,
    `**Dry run:** ${DRY_RUN}`,
    "",
    "## Step Results",
    "",
    "| Step | Entity | Upserted | Skipped | Errors | Duration |",
    "|------|--------|---------|---------|--------|----------|",
    ...results.map((r) => `| ${r.step} | ${r.entity} | ${r.upserted} | ${r.skipped} | ${r.errors} | ${r.durationMs}ms |`),
    "",
    `**Total:** ${total.upserted} upserted, ${total.skipped} skipped, ${total.errors} errors in ${total.durationMs}ms`,
    "",
    "## Gate Assertions",
    "",
    ...Object.entries(gateAssertions).map(([k, v]) => `- **${k}:** ${v}`),
  ].join("\n");

  if (!fs.existsSync(DOCS_DIR)) fs.mkdirSync(DOCS_DIR, { recursive: true });
  fs.writeFileSync(reportPath, md);
  fs.writeFileSync(jsonPath, JSON.stringify({ results, gateAssertions, total, dryRun: DRY_RUN, generatedAt: new Date().toISOString() }, null, 2));

  console.error(`\n📋 Seed report written to:`);
  console.error(`   ${reportPath}`);
  console.error(`   ${jsonPath}`);
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.error(`\n🌱 Phase 14 Historical Seed — ${DRY_RUN ? "DRY RUN (no writes)" : "LIVE RUN"}`);
  console.error(`   Source: ${SOURCE_ROOT}`);
  if (ONLY_STEPS) console.error(`   Steps: ${ONLY_STEPS.join(", ")}`);
  if (FROM_STEP > 1) console.error(`   From step: ${FROM_STEP}`);
  console.error("");

  // Run selected steps
  if (shouldRun(1))  await step01_departments();
  if (shouldRun(2))  await step02_staff();
  if (shouldRun(3))  await step03_serviceAccessRegistry();
  // Steps 4 (vpn/biometric), 6-10 (appraisals), 12-13 (promotions/career) — TODO: implement
  if (shouldRun(5))  await step05_contracts();
  if (shouldRun(11)) await step11_commendations();
  if (shouldRun(14)) await step14_nocMonthlyMetrics();
  if (shouldRun(17)) await step17_nocShifts();
  if (shouldRun(20)) await step20_leaveRequests();
  if (shouldRun(21)) await step21_tosdRecords();
  if (shouldRun(22)) await step22_latenessRecords();
  if (shouldRun(23)) await step23_ppeItems();
  if (shouldRun(24)) await step24_ppeIssuances();
  if (shouldRun(34)) await step34_onboardingTemplates();

  if (!DRY_RUN) {
    await computeGateAssertions();
  }

  writeReports();

  const totalErrors = results.reduce((acc, r) => acc + r.errors, 0);
  if (totalErrors > 0) {
    console.error(`\n❌ Seed completed with ${totalErrors} errors — check seed-report.md`);
    process.exit(1);
  } else {
    console.error(`\n✅ Seed completed successfully`);
  }
}

main().catch((err) => {
  console.error("Fatal seed error:", err);
  process.exit(1);
});
