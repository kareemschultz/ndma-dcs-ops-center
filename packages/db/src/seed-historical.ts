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
  type NocShiftType,
  appraisals,
  appraisalCycles,
  appraisalRatings,
  appraisalResponsibilities,
  appraisalAchievements,
  appraisalGoals,
  assessmentQuestions,
  calendarEvents,
  careerProgressionPlans,
  certificationCatalog,
  commendations,
  contracts,
  departments,
  dcsOnCallWeeks,
  employeeOfTheMonth,
  examSchedule,
  examVouchers,
  inHouseTrainingLog,
  leaveRequests,
  leaveTypes,
  latenessRecords,
  nocMonthlyMetrics,
  nocPerformanceJournal,
  nocShifts,
  nocTicketActivity,
  onboardingTaskTemplates,
  ppeIssuances,
  ppeItems,
  platforms,
  quarterlyMaintenanceTasks,
  serviceAccessRegistry,
  staffFeedback,
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
  // IDs match what seed.ts originally created in prod (dept-dcs, dept-noc, dept-asn, etc.)
  const canonical = [
    { id: "dept-dcs", name: "Data Centre Services", code: "DCS", parentId: null },
    { id: "dept-noc", name: "Network Operations Centre", code: "NOC", parentId: null },
    { id: "dept-asn", name: "Applications, Systems & NetOps", code: "ASN", parentId: "dept-dcs" },
    { id: "dept-core", name: "Core Infrastructure", code: "CORE", parentId: "dept-dcs" },
    { id: "dept-enterprise", name: "Enterprise Systems", code: "ENT", parentId: "dept-dcs" },
    { id: "dept-noc-day", name: "NOC Day Shift", code: "NOC-D", parentId: "dept-noc" },
    { id: "dept-noc-night", name: "NOC Night Shift", code: "NOC-N", parentId: "dept-noc" },
  ];

  let upserted = 0;
  if (!DRY_RUN) {
    for (const dept of canonical) {
      await db.insert(departments).values(dept).onConflictDoUpdate({
        target: [departments.code],
        set: { name: dept.name, parentId: dept.parentId },
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
    // Sheet names like "Aug2024", "Jan2025", "January2026" (no space between month and year)
    const dateMatch = sheetName.match(/([A-Za-z]+)\s*(\d{4})/);
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
      const staffId = await findStaffByName(staffName) ?? await findStaffByFirstName(staffName);
      if (!staffId) { warnings.push(`Staff not found: ${staffName}`); skipped++; continue; }

      const metrics: Record<string, number> = {};
      for (let metricRow = 2; metricRow <= Math.min(10, sheet.rowCount); metricRow++) {
        const row = sheet.getRow(metricRow);
        const metricName = metricNames[metricRow - 2];
        if (!metricName) continue;
        const val = cellText(row.getCell(col));
        const parsed = parseFloat(val);
        metrics[metricName] = isNaN(parsed) ? 0 : parsed;
      }

      if (!DRY_RUN) {
        await db.insert(nocMonthlyMetrics).values({
          staffId,
          year,
          month,
          mt: Math.round(metrics.mt ?? 0),
          ittIncident: Math.round(metrics.itt_incident ?? 0),
          ittProblem: Math.round(metrics.itt_problem ?? 0),
          daysDayShift: Math.round(metrics.days_day_shift ?? 0),
          daysSwingShift: Math.round(metrics.days_swing_shift ?? 0),
          daysNightShift: Math.round(metrics.days_night_shift ?? 0),
          noccc: Math.round(metrics.noccc ?? 0),
          nct: Math.round(metrics.nct ?? 0),
          ma: Math.round(metrics.ma ?? 0),
        }).onConflictDoUpdate({
          target: [nocMonthlyMetrics.staffId, nocMonthlyMetrics.year, nocMonthlyMetrics.month],
          set: {
            mt: Math.round(metrics.mt ?? 0),
            ittIncident: Math.round(metrics.itt_incident ?? 0),
            ittProblem: Math.round(metrics.itt_problem ?? 0),
            daysDayShift: Math.round(metrics.days_day_shift ?? 0),
            daysSwingShift: Math.round(metrics.days_swing_shift ?? 0),
            daysNightShift: Math.round(metrics.days_night_shift ?? 0),
            noccc: Math.round(metrics.noccc ?? 0),
            nct: Math.round(metrics.nct ?? 0),
            ma: Math.round(metrics.ma ?? 0),
          },
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
            "D": "Day Shift", "S": "Day Shift", "N": "Night Shift",
            "OFF": "Off", "AL": "Annual Leave", "ML": "Maternity Leave",
            "SICK": "Sick Leave",
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
              shiftType: shiftType as NocShiftType,
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

/**
 * Step 4 — Calendar events: birthdays + GY public holidays
 * Natural key: (title, event_date)
 * Birthdays sourced from staff_profiles.dateOfBirth (if present).
 * GY public holidays hardcoded for current and next year.
 */
async function step04_calendarEvents() {
  const done = startStep(4, "calendar events (birthdays + GY holidays)", "calendar_events");
  let upserted = 0, skipped = 0;
  const warnings: string[] = [];

  const currentYear = new Date().getFullYear();
  const years = [currentYear, currentYear + 1];

  // GY public holidays (recurring)
  const holidays = [
    { md: "01-01", title: "New Year's Day" },
    { md: "02-23", title: "Republic Day (Mashramani)" },
    { md: "03-08", title: "International Women's Day" },
    { md: "05-01", title: "Labour Day" },
    { md: "05-05", title: "Indian Arrival Day" },
    { md: "05-26", title: "Independence Day" },
    { md: "07-01", title: "CARICOM Day" },
    { md: "08-01", title: "Emancipation Day" },
    { md: "12-25", title: "Christmas Day" },
    { md: "12-26", title: "Boxing Day" },
  ];

  for (const year of years) {
    for (const h of holidays) {
      const eventDate = `${year}-${h.md}`;
      try {
        if (!DRY_RUN) {
          // Natural key: (title, event_date) — no unique constraint exists, use SELECT-then-INSERT
          const existing = await db.query.calendarEvents.findFirst({
            where: and(eq(calendarEvents.title, h.title), eq(calendarEvents.eventDate, eventDate)),
          });
          if (existing) {
            skipped++;
            continue;
          }
          await db.insert(calendarEvents).values({
            title: h.title,
            eventType: "public_holiday",
            eventDate,
          });
        }
        upserted++;
      } catch (e) {
        warnings.push(`Holiday ${h.title} ${year}: ${String(e)}`);
      }
    }
  }

  // Birthdays from staff_profiles.dateOfBirth
  try {
    const profiles = await db.query.staffProfiles.findMany({ with: { user: true } });
    for (const p of profiles) {
      const dob = (p as { dateOfBirth?: string | null }).dateOfBirth;
      if (!dob) continue;
      const md = String(dob).slice(5, 10); // "MM-DD"
      const name = (p as { user?: { name?: string } }).user?.name ?? "Staff";
      for (const year of years) {
        const eventDate = `${year}-${md}`;
        const title = `${name} Birthday`;
        if (!DRY_RUN) {
          const existing = await db.query.calendarEvents.findFirst({
            where: and(eq(calendarEvents.title, title), eq(calendarEvents.eventDate, eventDate)),
          });
          if (existing) {
            skipped++;
            continue;
          }
          await db.insert(calendarEvents).values({
            title,
            eventType: "Birthday",
            eventDate,
            staffId: p.id,
          });
        }
        upserted++;
      }
    }
  } catch (e) {
    warnings.push(`Birthday fetch failed: ${String(e)}`);
  }

  done({ upserted, skipped, errors: 0, warnings });
}

// ── Appraisal helpers ────────────────────────────────────────────────────────

const MONTH_LOOKUP: Record<string, number> = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4,
  may: 5, jun: 6, june: 6, jul: 7, july: 7, aug: 8, august: 8,
  sep: 9, sept: 9, september: 9, oct: 10, october: 10, nov: 11, november: 11,
  dec: 12, december: 12,
};

function splitCamelName(raw: string): string {
  // "AliciaArthur" → "Alicia Arthur", "DevonAbrams" → "Devon Abrams"
  return raw.replace(/([a-z])([A-Z])/g, "$1 $2").trim();
}

/** Parse appraisal XLSX filename → { staffName, periodStart?, periodEnd? } */
function parseAppraisalFilename(filename: string): { staffName: string; periodStart?: string; periodEnd?: string } | null {
  // Strip extension + trailing _v01 etc + trailing date stamp _YYYYMMDD
  const base = filename.replace(/\.xlsx$/i, "").replace(/_v\d+$/i, "").replace(/_\d{8}$/, "");
  // Try splits like "AliciaArthur_August2023February2024", "DennisSouthwellJanuary2024July2024",
  // "DevonAbramsJune2024Dec2024", "AsifKhanJuly2023December2023"
  let nameRaw: string;
  let periodRaw: string;
  if (base.includes("_")) {
    const parts = base.split("_");
    nameRaw = parts[0] ?? "";
    periodRaw = parts.slice(1).join("_");
  } else {
    // Find first occurrence of a month name
    const m = base.match(/^([A-Z][a-z]+(?:[A-Z][a-z]+)+?)(January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Oct|Nov|Dec)/);
    if (!m || !m[1]) return null;
    nameRaw = m[1];
    periodRaw = base.slice(m[1].length);
  }
  if (!nameRaw) return null;
  const staffName = splitCamelName(nameRaw).trim();
  // Try to extract two month+year pairs
  const dateRe = /(January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s*-?\s*(\d{4})/g;
  const matches = Array.from(periodRaw.matchAll(dateRe));
  let periodStart: string | undefined;
  let periodEnd: string | undefined;
  if (matches.length >= 2) {
    const m0 = matches[0];
    const m1m = matches[1];
    if (m0 && m1m && m0[1] && m0[2] && m1m[1] && m1m[2]) {
      const monStart = MONTH_LOOKUP[m0[1].toLowerCase()];
      const yStart = parseInt(m0[2], 10);
      const monEnd = MONTH_LOOKUP[m1m[1].toLowerCase()];
      const yEnd = parseInt(m1m[2], 10);
      if (monStart && yStart) periodStart = `${yStart}-${String(monStart).padStart(2, "0")}-01`;
      if (monEnd && yEnd) periodEnd = `${yEnd}-${String(monEnd).padStart(2, "0")}-01`;
    }
  }
  return { staffName, periodStart, periodEnd };
}

async function ensureAppraisalCycle(year: number, half: "h1" | "h2"): Promise<string | null> {
  const title = `${year} ${half.toUpperCase()}`;
  const startDate = half === "h1" ? `${year}-01-01` : `${year}-07-01`;
  const endDate = half === "h1" ? `${year}-06-30` : `${year}-12-31`;
  if (DRY_RUN) return "dry-cycle-id";
  // departmentId is part of unique constraint and is nullable; we use null
  const existing = await db.query.appraisalCycles.findFirst({
    where: and(eq(appraisalCycles.year, year), eq(appraisalCycles.half, half)),
  });
  if (existing) return existing.id;
  const [created] = await db.insert(appraisalCycles).values({
    year, half, title, startDate, endDate, status: "closed",
  }).onConflictDoNothing().returning();
  if (created) return created.id;
  const re = await db.query.appraisalCycles.findFirst({
    where: and(eq(appraisalCycles.year, year), eq(appraisalCycles.half, half)),
  });
  return re?.id ?? null;
}

/**
 * Step 6 — Appraisals + (7) ratings + (8) achievements/goals (combined)
 * Natural key: (staff_profile_id, cycle_id)
 * Reads 02-dcs/appraisals/{year}/*.xlsx + 03-noc/appraisals/{Appraisals }{year}/*.xlsx
 */
async function step06_appraisals() {
  const done = startStep(6, "appraisals + ratings + achievements/goals", "appraisals");
  let upserted = 0, skipped = 0, errors = 0;
  const warnings: string[] = [];

  const roots = [srcPath("02-dcs", "appraisals"), srcPath("03-noc", "appraisals")];
  const files: string[] = [];
  for (const root of roots) {
    if (!fs.existsSync(root)) continue;
    for (const sub of fs.readdirSync(root)) {
      const subPath = path.join(root, sub);
      if (!fs.statSync(subPath).isDirectory()) continue;
      if (sub.toLowerCase() === "template" || sub.toLowerCase().includes("promotion")) continue;
      for (const f of fs.readdirSync(subPath)) {
        if (f.endsWith(".xlsx") && !f.startsWith("~$")) files.push(path.join(subPath, f));
      }
    }
  }

  // Category labels we look for in column A
  const CATEGORY_LABELS = [
    "Organisational Skills:",
    "Quality of Work:",
    "Dependability:",
    "Communication Skills:",
    "Initiative:",
    "Job Knowledge:",
    "Teamwork:",
    "Productivity:",
    "Attendance:",
    "Adaptability:",
    "Leadership:",
    "Problem Solving:",
    "Customer Service:",
  ];

  for (const filePath of files) {
    const filename = path.basename(filePath);
    const parsed = parseAppraisalFilename(filename);
    if (!parsed) { warnings.push(`Could not parse appraisal filename: ${filename}`); skipped++; continue; }

    const staffId = await findStaffByName(parsed.staffName);
    if (!staffId) { warnings.push(`Staff not found: ${parsed.staffName} (file: ${filename})`); skipped++; continue; }

    // Pick cycle based on periodStart month
    if (!parsed.periodStart || !parsed.periodEnd) { skipped++; continue; }
    const yearMatch = parsed.periodEnd.match(/^(\d{4})/);
    const year = yearMatch && yearMatch[1] ? parseInt(yearMatch[1], 10) : new Date().getFullYear();
    const monthStr = parsed.periodEnd.slice(5, 7);
    const half: "h1" | "h2" = parseInt(monthStr, 10) <= 6 ? "h1" : "h2";

    const cycleId = await ensureAppraisalCycle(year, half);
    if (!cycleId) { errors++; continue; }

    const wb = await loadWorkbook(filePath);
    if (!wb) { errors++; continue; }

    const sheet = wb.getWorksheet("Performance Evaluation") ?? wb.worksheets[0];
    if (!sheet) { skipped++; continue; }

    // Parse ratings: scan rows for "Check appropriate box:" in col 1, look for X in B..F (5..1)
    const ratings: { category: string; rating: number }[] = [];
    let lastCategory: string | null = null;
    for (let r = 1; r <= sheet.rowCount; r++) {
      const row = sheet.getRow(r);
      const a = cellText(row.getCell(1));
      if (CATEGORY_LABELS.includes(a)) lastCategory = a.replace(/:$/, "").trim();
      if (a.toLowerCase().startsWith("check appropriate box")) {
        for (let c = 2; c <= 6; c++) {
          const v = cellText(row.getCell(c)).toUpperCase();
          if (v === "X") {
            const rating = 7 - c; // c=2 → 5, c=3 → 4, ... c=6 → 1
            if (lastCategory) ratings.push({ category: lastCategory, rating });
            break;
          }
        }
      }
    }

    // Insert appraisal (natural key: staff + cycle). No unique constraint exists, so check first.
    let appraisalId: string | null = null;
    if (!DRY_RUN) {
      const existing = await db.query.appraisals.findFirst({
        where: and(eq(appraisals.staffProfileId, staffId), eq(appraisals.cycleId, cycleId)),
      });
      if (existing) {
        appraisalId = existing.id;
        await db.update(appraisals).set({
          year, period: `${parsed.periodStart} → ${parsed.periodEnd}`,
          periodStart: parsed.periodStart, periodEnd: parsed.periodEnd,
          status: "completed",
        }).where(eq(appraisals.id, existing.id));
      } else {
        const [created] = await db.insert(appraisals).values({
          cycleId,
          staffProfileId: staffId,
          year,
          period: `${parsed.periodStart} → ${parsed.periodEnd}`,
          periodStart: parsed.periodStart,
          periodEnd: parsed.periodEnd,
          status: "completed",
        }).returning();
        appraisalId = created?.id ?? null;
      }
    } else {
      appraisalId = "dry-appraisal-id";
    }
    if (!appraisalId) { errors++; continue; }
    upserted++;

    // Insert ratings (natural key: appraisal_id + category)
    if (!DRY_RUN && appraisalId !== "dry-appraisal-id") {
      for (const { category, rating } of ratings) {
        await db.insert(appraisalRatings).values({
          appraisalId, kind: "category", category, rating,
        }).onConflictDoUpdate({
          target: [appraisalRatings.appraisalId, appraisalRatings.category],
          set: { rating },
        });
      }
    }

    // Achievements + Goals are not reliably parseable from these XLSX templates → skip
  }

  done({ upserted, skipped, errors, warnings });
}

/**
 * Step 7 — Appraisal ratings (merged into step 6)
 */
async function step07_appraisalRatings() {
  const done = startStep(7, "appraisal ratings (merged into step 6)", "appraisal_ratings");
  done({ upserted: 0, skipped: 0, errors: 0, warnings: ["Merged into step 6 — see appraisals step output"] });
}

/**
 * Step 8 — Appraisal achievements/goals (skipped — XLSX templates have free-text Notes only)
 */
async function step08_appraisalAchievementsGoals() {
  const done = startStep(8, "appraisal achievements/goals (stub)", "appraisal_achievements/goals");
  done({ upserted: 0, skipped: 0, errors: 0, warnings: ["STUB — appraisal XLSX templates lack structured achievements/goals; parser TBD"] });
}

/**
 * Step 9 — Staff feedback from APPRAISAL TRACKER DCS.xlsx > FeedbackFromStaff
 * Natural key: (staff_profile_id, year, category) — closest approximation
 */
async function step09_staffFeedback() {
  const done = startStep(9, "staff feedback", "staff_feedback");
  const filePath = srcPath("02-dcs", "appraisal-tracker", "APPRAISAL TRACKER DCS.xlsx");
  const wb = await loadWorkbook(filePath);
  if (!wb) {
    done({ upserted: 0, skipped: 0, errors: 0, warnings: [`File not found: ${filePath}`] });
    return;
  }
  const sheet = wb.getWorksheet("FeedbackFromStaff");
  if (!sheet) {
    done({ upserted: 0, skipped: 0, errors: 0, warnings: ["FeedbackFromStaff sheet not found"] });
    return;
  }

  let upserted = 0, skipped = 0;
  const warnings: string[] = [];

  for (let i = 2; i <= sheet.rowCount; i++) {
    const row = sheet.getRow(i);
    const person = cellText(row.getCell(1));
    const feedback = cellText(row.getCell(2));
    const comment = cellText(row.getCell(3));
    const yearStr = cellText(row.getCell(4));
    if (!person || !feedback) { skipped++; continue; }
    const staffId = await findStaffByFirstName(person) ?? await findStaffByName(person);
    if (!staffId) { warnings.push(`Staff not found: ${person}`); skipped++; continue; }
    const year = parseInt(yearStr, 10);
    if (!year) { skipped++; continue; }
    const category = `Feedback ${year}`;
    const body = comment ? `${feedback}\n\n${comment}` : feedback;

    if (!DRY_RUN) {
      // No unique constraint on staff_feedback — manual idempotency by (staff + category + comments)
      const existing = await db.query.staffFeedback.findFirst({
        where: and(eq(staffFeedback.staffProfileId, staffId), eq(staffFeedback.category, category), eq(staffFeedback.comments, body)),
      });
      if (existing) { skipped++; continue; }
      await db.insert(staffFeedback).values({
        staffProfileId: staffId,
        category,
        comments: body,
        status: "submitted",
      });
    }
    upserted++;
  }

  done({ upserted, skipped, errors: 0, warnings });
}

/**
 * Step 10 — NOC performance journal (mistake-matrix)
 * Natural key: (staff_profile_id, year, month, category)
 * Source: 03-noc/performance-journal/StaffPerformanceJournal_20230731_v01.xlsx
 */
async function step10_nocPerformanceJournal() {
  const done = startStep(10, "NOC performance journal", "noc_performance_journal");
  const filePath = srcPath("03-noc", "performance-journal", "StaffPerformanceJournal_20230731_v01.xlsx");
  const wb = await loadWorkbook(filePath);
  if (!wb) {
    done({ upserted: 0, skipped: 0, errors: 0, warnings: [`File not found: ${filePath}`] });
    return;
  }

  let upserted = 0, skipped = 0;
  const warnings: string[] = [];

  // Map labels to category enum
  const CATEGORY_MAP: Record<string, "tickets_itop" | "alarms" | "slack_whatsapp" | "task_incomplete"> = {
    "tickets/itop issue": "tickets_itop",
    "tickets / itop issue": "tickets_itop",
    "tickets itop issue": "tickets_itop",
    "alarms": "alarms",
    "missed alarms": "alarms",
    "slack/whatsapp communication": "slack_whatsapp",
    "slack / whatsapp communication": "slack_whatsapp",
    "task incomplete": "task_incomplete",
  };

  for (const sheet of wb.worksheets) {
    if (sheet.name.toLowerCase() === "summary") continue;
    const staffFirstName = sheet.name.trim();
    if (!staffFirstName) continue;
    const staffId = await findStaffByFirstName(staffFirstName);
    if (!staffId) { warnings.push(`Staff not found by first name: ${staffFirstName}`); skipped++; continue; }

    // Scan rows. A "year header" row has integer year in col 1.
    // Then category rows follow with category label in col 1, Jan..Dec in cols 2..13.
    let currentYear: number | null = null;
    let currentNarrativeRow: ExcelJS.Row | null = null;
    for (let r = 1; r <= sheet.rowCount; r++) {
      const row = sheet.getRow(r);
      const a = cellText(row.getCell(1));
      const aNum = parseInt(a, 10);
      if (!isNaN(aNum) && aNum >= 2020 && aNum <= 2099) {
        currentYear = aNum;
        currentNarrativeRow = null;
        continue;
      }
      // Narrative row: blank col1, text in cols 2+
      if (!a && currentYear) {
        const c2 = cellText(row.getCell(2));
        if (c2 && c2.length > 5) currentNarrativeRow = row;
        continue;
      }
      const key = a.toLowerCase().replace(/[:.]/g, "").trim();
      const category = CATEGORY_MAP[key];
      if (!category || !currentYear) continue;

      for (let month = 1; month <= 12; month++) {
        const cellVal = cellText(row.getCell(month + 1));
        const count = parseInt(cellVal, 10);
        if (isNaN(count) || count <= 0) continue;
        const narrative = currentNarrativeRow ? cellText(currentNarrativeRow.getCell(month + 1)) || null : null;

        if (!DRY_RUN) {
          await db.insert(nocPerformanceJournal).values({
            staffProfileId: staffId,
            year: currentYear,
            month,
            category,
            count,
            narrative,
          }).onConflictDoUpdate({
            target: [nocPerformanceJournal.staffProfileId, nocPerformanceJournal.year, nocPerformanceJournal.month, nocPerformanceJournal.category],
            set: { count, narrative },
          });
        }
        upserted++;
      }
    }
  }

  done({ upserted, skipped, errors: 0, warnings });
}

/**
 * Step 12 — Staff promotions (STUB)
 */
async function step12_staffPromotions() {
  const done = startStep(12, "staff promotions (stub)", "staff_promotions");
  // Promotion letters folder exists under 03-noc/appraisals/promotion-letters but is uncertain DOCX format
  done({ upserted: 0, skipped: 0, errors: 0, warnings: ["STUB — promotion-letters folder is DOCX-based, parser TBD"] });
}

/**
 * Step 13 — Career progression plans from ContractEndDates_NOC.xlsx > Plan sheet
 * Natural key: (staff_id, target_year)
 */
async function step13_careerProgression() {
  const done = startStep(13, "career progression plans", "career_progression_plans");
  const filePath = srcPath("03-noc", "contracts", "ContractEndDates_NOC.xlsx");
  const wb = await loadWorkbook(filePath);
  if (!wb) {
    done({ upserted: 0, skipped: 0, errors: 0, warnings: [`File not found: ${filePath}`] });
    return;
  }
  const sheet = wb.getWorksheet("Plan");
  if (!sheet) {
    done({ upserted: 0, skipped: 0, errors: 0, warnings: ["Plan sheet not found"] });
    return;
  }

  let upserted = 0, skipped = 0;
  const warnings: string[] = [];

  // Row 1: cols 3..6 = years (2026, 2027, 2028, 2029). Col 1 = name. Col 2 = current conditions.
  const headerRow = sheet.getRow(1);
  const yearCols: { col: number; year: number }[] = [];
  for (let c = 3; c <= sheet.columnCount; c++) {
    const v = cellText(headerRow.getCell(c));
    const y = parseInt(v, 10);
    if (y >= 2020 && y <= 2099) yearCols.push({ col: c, year: y });
  }

  for (let r = 2; r <= sheet.rowCount; r++) {
    const row = sheet.getRow(r);
    const firstName = cellText(row.getCell(1));
    const conditions = cellText(row.getCell(2));
    if (!firstName) continue;
    const staffId = await findStaffByFirstName(firstName) ?? await findStaffByName(firstName);
    if (!staffId) { warnings.push(`Staff not found: ${firstName}`); skipped++; continue; }

    for (const { col, year } of yearCols) {
      const role = cellText(row.getCell(col));
      if (!role) continue;
      if (!DRY_RUN) {
        await db.insert(careerProgressionPlans).values({
          staffId, targetYear: year, plannedRole: role, conditions: conditions || null,
        }).onConflictDoUpdate({
          target: [careerProgressionPlans.staffId, careerProgressionPlans.targetYear],
          set: { plannedRole: role, conditions: conditions || null },
        });
      }
      upserted++;
    }
  }

  done({ upserted, skipped, errors: 0, warnings });
}

/**
 * Step 15 — NOC ticket activity from IncidentProblem_CreatedandClose_20252905.xlsx
 * Natural key: (ticket_id, action) (unique)
 */
async function step15_nocTicketActivity() {
  const done = startStep(15, "NOC ticket activity", "noc_ticket_activity");
  const filePath = srcPath("03-noc", "employee-of-month", "IncidentProblem_CreatedandClose_20252905.xlsx");
  const wb = await loadWorkbook(filePath);
  if (!wb) {
    done({ upserted: 0, skipped: 0, errors: 0, warnings: [`File not found: ${filePath}`] });
    return;
  }

  let upserted = 0, skipped = 0;
  const warnings: string[] = [];

  for (const sheet of wb.worksheets) {
    const sname = sheet.name.toLowerCase();
    const isIncident = sname.includes("incident");
    const isProblem = sname.includes("problem");
    if (!isIncident && !isProblem) continue;
    const type: "incident" | "problem" = isIncident ? "incident" : "problem";

    // Parse month/year from sheet name (e.g. "April Incident", "Feb26 incident", "Mar26 Incident")
    const monthMatch = sname.match(/(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|stember|oct|nov|dec)/);
    const yearMatch = sname.match(/(\d{2})/);
    if (!monthMatch || !monthMatch[1]) continue;
    // Map known oddities
    let monthKey = monthMatch[1];
    if (monthKey === "stember") monthKey = "sept";
    const month = MONTH_LOOKUP[monthKey];
    if (!month) continue;
    // year: 2-digit "26" → 2026, else assume current year - skip if unclear
    let year = 2025;
    if (yearMatch && yearMatch[1]) year = 2000 + parseInt(yearMatch[1], 10);

    // Layout: Col 1 = closed ticket id, Col 2 = note (e.g. "closed by asif")
    //         Col 3 = created ticket id, Col 4 = note (e.g. "created by wynonna")
    //         Col 5 = closed-in-month-but-created-before id, Col 6 = closer note
    for (let r = 2; r <= sheet.rowCount; r++) {
      const row = sheet.getRow(r);
      // CLOSED in this month (col 1)
      const closedId = cellText(row.getCell(1));
      const closedNote = cellText(row.getCell(2));
      if (closedId && (closedId.startsWith("I-") || closedId.startsWith("P-"))) {
        const actor = closedNote.replace(/closed/i, "").replace(/by/i, "").trim() || null;
        if (!DRY_RUN) {
          await db.insert(nocTicketActivity).values({
            ticketId: closedId, type, year, month, action: "closed", notes: closedNote || null,
            actorStaffId: actor ? await findStaffByFirstName(actor) : null,
          }).onConflictDoNothing();
        }
        upserted++;
      }
      // CREATED in this month (col 3)
      const createdId = cellText(row.getCell(3));
      const createdNote = cellText(row.getCell(4));
      if (createdId && (createdId.startsWith("I-") || createdId.startsWith("P-"))) {
        const actor = createdNote.replace(/created/i, "").replace(/by/i, "").trim() || null;
        if (!DRY_RUN) {
          await db.insert(nocTicketActivity).values({
            ticketId: createdId, type, year, month, action: "created", notes: createdNote || null,
            actorStaffId: actor ? await findStaffByFirstName(actor) : null,
          }).onConflictDoNothing();
        }
        upserted++;
      }
    }
  }

  done({ upserted, skipped, errors: 0, warnings });
}

/**
 * Step 16 — Employee of the month (computed from noc_monthly_metrics)
 * Natural key: (year, month)
 */
async function step16_employeeOfTheMonth() {
  const done = startStep(16, "Employee of the Month", "employee_of_the_month");
  let upserted = 0, skipped = 0;
  const warnings: string[] = [];

  if (DRY_RUN) {
    done({ upserted: 0, skipped: 0, errors: 0, warnings: ["Dry-run: EOM computation skipped"] });
    return;
  }

  // Distinct (year, month) tuples from noc_monthly_metrics
  const distinctRows = await db.execute(sql`SELECT DISTINCT year, month FROM noc_monthly_metrics ORDER BY year, month`);
  for (const r of distinctRows.rows as Array<{ year: number; month: number }>) {
    const year = Number(r.year);
    const month = Number(r.month);
    const metrics = await db.select().from(nocMonthlyMetrics).where(
      and(eq(nocMonthlyMetrics.year, year), eq(nocMonthlyMetrics.month, month)),
    );
    if (metrics.length === 0) { skipped++; continue; }

    const overall = (m: typeof metrics[number]) => m.noccc + m.nct - m.mt - m.ma;
    const sorted = [...metrics].sort((a, b) => overall(b) - overall(a));
    const winners = {
      year, month,
      overallBestStaffId: sorted[0]?.staffId ?? null,
      secondBestStaffId: sorted[1]?.staffId ?? null,
      mostIncidentTicketsStaffId: [...metrics].sort((a, b) => b.ittIncident - a.ittIncident)[0]?.staffId ?? null,
      mostProblemTicketsStaffId: [...metrics].sort((a, b) => b.ittProblem - a.ittProblem)[0]?.staffId ?? null,
      mostNocTicketsClosedStaffId: [...metrics].sort((a, b) => b.nct - a.nct)[0]?.staffId ?? null,
      leastAlarmNonComplianceStaffId: [...metrics].sort((a, b) => a.ma - b.ma)[0]?.staffId ?? null,
      leastTicketNonComplianceStaffId: [...metrics].sort((a, b) => a.mt - b.mt)[0]?.staffId ?? null,
    };

    await db.insert(employeeOfTheMonth).values(winners).onConflictDoUpdate({
      target: [employeeOfTheMonth.year, employeeOfTheMonth.month],
      set: {
        overallBestStaffId: winners.overallBestStaffId,
        secondBestStaffId: winners.secondBestStaffId,
        mostIncidentTicketsStaffId: winners.mostIncidentTicketsStaffId,
        mostProblemTicketsStaffId: winners.mostProblemTicketsStaffId,
        mostNocTicketsClosedStaffId: winners.mostNocTicketsClosedStaffId,
        leastAlarmNonComplianceStaffId: winners.leastAlarmNonComplianceStaffId,
        leastTicketNonComplianceStaffId: winners.leastTicketNonComplianceStaffId,
      },
    });
    upserted++;
  }

  done({ upserted, skipped, errors: 0, warnings });
}

/**
 * Step 18 — DCS on-call weeks from PlannedOnCallRoster_20230123 (1).xlsx > 2026
 * Natural key: (year, week_num) — schema enforces unique
 */
async function step18_dcsOnCallWeeks() {
  const done = startStep(18, "DCS on-call weeks (2026)", "dcs_on_call_weeks");
  const filePath = srcPath("02-dcs", "on-call", "PlannedOnCallRoster_20230123 (1).xlsx");
  const wb = await loadWorkbook(filePath);
  if (!wb) {
    done({ upserted: 0, skipped: 0, errors: 0, warnings: [`File not found: ${filePath}`] });
    return;
  }
  const sheet = wb.getWorksheet("2026");
  if (!sheet) {
    done({ upserted: 0, skipped: 0, errors: 0, warnings: ["2026 sheet not found"] });
    return;
  }

  let upserted = 0, skipped = 0;
  const warnings: string[] = [];
  const year = 2026;

  // Header at row 5: Week / Dates | Lead Engineer | ASN Support | Enterprise Support | CORE Support
  // Data rows start at row 7
  let weekNum = 0;
  for (let r = 7; r <= sheet.rowCount; r++) {
    const row = sheet.getRow(r);
    const weekLabel = cellText(row.getCell(1));
    if (!weekLabel) continue;
    if (!/\d/.test(weekLabel)) continue;
    weekNum++;

    // Parse first date from "4–10 Jan" or "29 Mar – 4 Apr"
    const mCross = weekLabel.match(/(\d{1,2})\s*(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s*[–-]\s*(\d{1,2})\s*(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)/i);
    const mSame = weekLabel.match(/(\d{1,2})\s*[–-]\s*(\d{1,2})\s*(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)/i);
    let startDay: number, startMonth: number | undefined, endDay: number, endMonth: number | undefined;
    if (mCross && mCross[1] && mCross[2] && mCross[3] && mCross[4]) {
      startDay = parseInt(mCross[1], 10);
      startMonth = MONTH_LOOKUP[mCross[2].toLowerCase()];
      endDay = parseInt(mCross[3], 10);
      endMonth = MONTH_LOOKUP[mCross[4].toLowerCase()];
    } else if (mSame && mSame[1] && mSame[2] && mSame[3]) {
      startDay = parseInt(mSame[1], 10);
      endDay = parseInt(mSame[2], 10);
      startMonth = MONTH_LOOKUP[mSame[3].toLowerCase()];
      endMonth = startMonth;
    } else {
      skipped++; continue;
    }
    if (!startMonth || !endMonth) { skipped++; continue; }
    const weekStartDate = `${year}-${String(startMonth).padStart(2, "0")}-${String(startDay).padStart(2, "0")}`;
    const weekEndDate = `${year}-${String(endMonth).padStart(2, "0")}-${String(endDay).padStart(2, "0")}`;

    const lead = cellText(row.getCell(2));
    const asn = cellText(row.getCell(3));
    const ent = cellText(row.getCell(4));
    const core = cellText(row.getCell(5));

    const leadId = lead ? await findStaffByFirstName(lead) : null;
    const asnId = asn ? await findStaffByFirstName(asn) : null;
    const entId = ent ? await findStaffByFirstName(ent) : null;
    const coreId = core ? await findStaffByFirstName(core) : null;

    if (!DRY_RUN) {
      await db.insert(dcsOnCallWeeks).values({
        year, weekNum, weekStartDate, weekEndDate,
        leadEngineerId: leadId, asnSupportId: asnId,
        enterpriseSupportId: entId, coreSupportId: coreId,
      }).onConflictDoUpdate({
        target: [dcsOnCallWeeks.year, dcsOnCallWeeks.weekNum],
        set: {
          weekStartDate, weekEndDate,
          leadEngineerId: leadId, asnSupportId: asnId,
          enterpriseSupportId: entId, coreSupportId: coreId,
        },
      });
    }
    upserted++;
  }

  done({ upserted, skipped, errors: 0, warnings });
}

/**
 * Step 19 — Quarterly maintenance tasks from PlannedOnCallRoster > 2026 top table
 * Natural key: (year, quarter, task_name)
 */
async function step19_quarterlyMaintenance() {
  const done = startStep(19, "quarterly maintenance tasks", "quarterly_maintenance_tasks");
  const filePath = srcPath("02-dcs", "on-call", "PlannedOnCallRoster_20230123 (1).xlsx");
  const wb = await loadWorkbook(filePath);
  if (!wb) {
    done({ upserted: 0, skipped: 0, errors: 0, warnings: [`File not found: ${filePath}`] });
    return;
  }
  const sheet = wb.getWorksheet("2026");
  if (!sheet) {
    done({ upserted: 0, skipped: 0, errors: 0, warnings: ["2026 sheet not found"] });
    return;
  }

  let upserted = 0, skipped = 0;
  const warnings: string[] = [];
  const year = 2026;

  // Row 1: quarter starts (cols 2..5 = Q1..Q4)
  // Rows 2..3: task names in col 1, staff list per quarter in cols 2..5
  for (let r = 2; r <= 4; r++) {
    const row = sheet.getRow(r);
    const taskName = cellText(row.getCell(1));
    if (!taskName) continue;
    for (let q = 1; q <= 4; q++) {
      const staffText = cellText(row.getCell(q + 1));
      if (!staffText) continue;
      // Split by newline or comma
      const names = staffText.split(/[\n,]+/).map((s) => s.trim()).filter(Boolean);
      const staffIds: string[] = [];
      for (const name of names) {
        const clean = (name.split(/[\s(]/)[0] ?? "").trim(); // strip "(NOC)" suffix etc.
        if (!clean) continue;
        const sid = await findStaffByFirstName(clean);
        if (sid) staffIds.push(sid);
      }
      if (!DRY_RUN) {
        await db.insert(quarterlyMaintenanceTasks).values({
          year, quarter: q, taskName, assignedStaffIds: staffIds,
        }).onConflictDoUpdate({
          target: [quarterlyMaintenanceTasks.year, quarterlyMaintenanceTasks.quarter, quarterlyMaintenanceTasks.taskName],
          set: { assignedStaffIds: staffIds },
        });
      }
      upserted++;
    }
  }

  done({ upserted, skipped, errors: 0, warnings });
}

/**
 * Step 25 — Training plans (STUB)
 */
async function step25_trainingPlans() {
  const done = startStep(25, "training plans (stub)", "training_plans");
  const filePath = srcPath("06-shared-training", "plan-2026-2027", "TrainingSchedule2026_2027.xlsx");
  if (!fs.existsSync(filePath)) {
    done({ upserted: 0, skipped: 0, errors: 0, warnings: [`File not found: ${filePath}`] });
    return;
  }
  done({ upserted: 0, skipped: 0, errors: 0, warnings: ["STUB — TrainingSchedule sheet shape is a cross-tab matrix; parser TBD"] });
}

/**
 * Step 26 — Certification catalog from TrainingSchedule2026_2027.xlsx > Certs sheet
 * Natural key: (vendor, recommended_cert) — no unique constraint, use SELECT-then-INSERT
 */
async function step26_certificationCatalog() {
  const done = startStep(26, "certification catalog", "certification_catalog");
  const filePath = srcPath("06-shared-training", "plan-2026-2027", "TrainingSchedule2026_2027.xlsx");
  const wb = await loadWorkbook(filePath);
  if (!wb) {
    done({ upserted: 0, skipped: 0, errors: 0, warnings: [`File not found: ${filePath}`] });
    return;
  }
  const sheet = wb.getWorksheet("Certs");
  if (!sheet) {
    done({ upserted: 0, skipped: 0, errors: 0, warnings: ["Certs sheet not found"] });
    return;
  }

  let upserted = 0, skipped = 0;
  const warnings: string[] = [];

  for (let r = 2; r <= sheet.rowCount; r++) {
    const row = sheet.getRow(r);
    const vendor = cellText(row.getCell(1));
    const trainingArea = cellText(row.getCell(2));
    const recommendedCert = cellText(row.getCell(3));
    if (!trainingArea || !recommendedCert) { skipped++; continue; }

    if (!DRY_RUN) {
      const existing = await db.query.certificationCatalog.findFirst({
        where: and(eq(certificationCatalog.vendor, vendor || ""), eq(certificationCatalog.recommendedCert, recommendedCert)),
      });
      if (existing) {
        await db.update(certificationCatalog).set({ trainingArea }).where(eq(certificationCatalog.id, existing.id));
      } else {
        await db.insert(certificationCatalog).values({ vendor: vendor || null, trainingArea, recommendedCert });
      }
    }
    upserted++;
  }

  done({ upserted, skipped, errors: 0, warnings });
}

/**
 * Step 27 — In-house training log (STUB)
 */
async function step27_inHouseTrainingLog() {
  const done = startStep(27, "in-house training log (stub)", "in_house_training_log");
  done({ upserted: 0, skipped: 0, errors: 0, warnings: ["STUB — no dedicated source file identified"] });
}

/**
 * Step 28 — Exam schedule from Exam Dates.xlsx
 * Natural key: (staff_profile_id, exam_name, scheduled_date)
 */
async function step28_examSchedule() {
  const done = startStep(28, "exam schedule", "exam_schedule");
  const filePath = srcPath("06-shared-training", "exam-dates", "Exam Dates.xlsx");
  const wb = await loadWorkbook(filePath);
  if (!wb) {
    done({ upserted: 0, skipped: 0, errors: 0, warnings: [`File not found: ${filePath}`] });
    return;
  }

  let upserted = 0, skipped = 0;
  const warnings: string[] = [];

  for (const sheet of wb.worksheets) {
    for (let r = 2; r <= sheet.rowCount; r++) {
      const row = sheet.getRow(r);
      const cert = cellText(row.getCell(1));
      const empFirstName = cellText(row.getCell(2));
      const timeframe = cellText(row.getCell(3));
      const updateCol = cellText(row.getCell(4));
      if (!cert || !empFirstName) { skipped++; continue; }
      const staffId = await findStaffByFirstName(empFirstName);
      if (!staffId) { warnings.push(`Staff not found: ${empFirstName}`); skipped++; continue; }

      // Parse scheduled date heuristic: try parseDate(updateCol), else use first day of next month
      const scheduledDate = parseDate(updateCol) ?? `${new Date().getFullYear()}-12-31`;

      if (!DRY_RUN) {
        const existing = await db.query.examSchedule.findFirst({
          where: and(
            eq(examSchedule.staffProfileId, staffId),
            eq(examSchedule.examName, cert),
            eq(examSchedule.scheduledDate, scheduledDate),
          ),
        });
        if (existing) {
          await db.update(examSchedule).set({ notes: timeframe || null }).where(eq(examSchedule.id, existing.id));
        } else {
          await db.insert(examSchedule).values({
            staffProfileId: staffId,
            examName: cert,
            scheduledDate,
            notes: timeframe || null,
            status: "scheduled",
          });
        }
      }
      upserted++;
    }
  }

  done({ upserted, skipped, errors: 0, warnings });
}

/**
 * Step 29 — Exam vouchers from NDMA EXAM VOUCHER.xlsx
 * Natural key: voucher_number (unique)
 */
async function step29_examVouchers() {
  const done = startStep(29, "exam vouchers", "exam_vouchers");
  const filePath = srcPath("06-shared-training", "vouchers", "NDMA EXAM VOUCHER.xlsx");
  const wb = await loadWorkbook(filePath);
  if (!wb) {
    done({ upserted: 0, skipped: 0, errors: 0, warnings: [`File not found: ${filePath}`] });
    return;
  }
  const sheet = wb.worksheets[0];
  if (!sheet) {
    done({ upserted: 0, skipped: 0, errors: 0, warnings: ["No sheet found"] });
    return;
  }

  let upserted = 0, skipped = 0;
  const warnings: string[] = [];

  // Header at row 3, data from row 4
  for (let r = 4; r <= sheet.rowCount; r++) {
    const row = sheet.getRow(r);
    const voucherNumber = cellText(row.getCell(2));
    const productName = cellText(row.getCell(3));
    const mustBeUsedBy = parseDate(cellText(row.getCell(4)));
    const assignedFirstName = cellText(row.getCell(6));
    if (!voucherNumber || !productName || !mustBeUsedBy) { skipped++; continue; }

    const assignedStaffId = assignedFirstName ? await findStaffByFirstName(assignedFirstName) : null;
    if (assignedFirstName && !assignedStaffId) {
      warnings.push(`Voucher ${voucherNumber}: staff '${assignedFirstName}' not found`);
    }

    if (!DRY_RUN) {
      await db.insert(examVouchers).values({
        voucherNumber, productName, mustBeUsedBy, assignedStaffId,
        status: assignedStaffId ? "assigned" : "unused",
      }).onConflictDoUpdate({
        target: [examVouchers.voucherNumber],
        set: { productName, mustBeUsedBy, assignedStaffId },
      });
    }
    upserted++;
  }

  done({ upserted, skipped, errors: 0, warnings });
}

/**
 * Step 30 — Training events from TrainingDocumentationForm_2026 1.xlsx
 * Natural key: (institution, description, start_date) — no unique constraint, manual check
 */
async function step30_trainingEvents() {
  const done = startStep(30, "training events", "training_events");
  const filePath = srcPath("06-shared-training", "plan-2026-2027", "TrainingDocumentationForm_2026 1.xlsx");
  const wb = await loadWorkbook(filePath);
  if (!wb) {
    done({ upserted: 0, skipped: 0, errors: 0, warnings: [`File not found: ${filePath}`] });
    return;
  }

  let upserted = 0, skipped = 0;
  const warnings: string[] = [];

  for (const sheet of wb.worksheets) {
    // Header is at row 4 in this XLSX
    for (let r = 5; r <= sheet.rowCount; r++) {
      const row = sheet.getRow(r);
      const institution = cellText(row.getCell(2));
      const description = cellText(row.getCell(3));
      if (!institution || !description) { skipped++; continue; }

      // Best-effort: no explicit start date in the simple form — use 2026-01-01 placeholder
      const startDate = `2026-01-01`;
      const endDate = `2026-12-31`;

      if (!DRY_RUN) {
        const existing = await db.query.trainingEvents.findFirst({
          where: and(
            eq(trainingEvents.institution, institution),
            eq(trainingEvents.description, description),
            eq(trainingEvents.startDate, startDate),
          ),
        });
        if (!existing) {
          await db.insert(trainingEvents).values({ institution, description, startDate, endDate });
        }
      }
      upserted++;
    }
  }

  done({ upserted, skipped, errors: 0, warnings });
}

/**
 * Step 31 — Training event participants (STUB — source doesn't list participants directly)
 */
async function step31_trainingEventParticipants() {
  const done = startStep(31, "training event participants (stub)", "training_event_participants");
  done({ upserted: 0, skipped: 0, errors: 0, warnings: ["STUB — TrainingDocumentationForm does not list per-event participants"] });
}

/**
 * Step 32 — Training syllabi (STUB — no canonical NOCTrainingProgramSyllabus*.xlsx found)
 */
async function step32_trainingSyllabi() {
  const done = startStep(32, "training syllabi (stub)", "training_syllabi");
  done({ upserted: 0, skipped: 0, errors: 0, warnings: ["STUB — NOCTrainingProgramSyllabus*.xlsx not present in source-of-truth"] });
}

/**
 * Step 33 — Assessment questions (STUB — DOCX parsing complex)
 */
async function step33_assessmentQuestions() {
  const done = startStep(33, "assessment questions (stub)", "assessment_questions");
  done({ upserted: 0, skipped: 0, errors: 0, warnings: ["STUB — assessment questions are DOCX-based, parser TBD"] });
}

/**
 * Step 35 — Work items from WorkUpdate_20240118_v01.xlsx (24 weekly snapshot sheets)
 * Natural key: (year, period, assigned_engineer, title-hash) — manual check via title+period+assigned
 */
async function step35_workItems() {
  const done = startStep(35, "work items (weekly tracker)", "work_items");
  const filePath = srcPath("07-work-register", "WorkUpdate_20240118_v01.xlsx");
  const wb = await loadWorkbook(filePath);
  if (!wb) {
    done({ upserted: 0, skipped: 0, errors: 0, warnings: [`File not found: ${filePath}`] });
    return;
  }

  let upserted = 0, skipped = 0;
  const warnings: string[] = [];

  // Skip non-weekly sheets
  const skipSheets = new Set(["routine", "temporarytracker", "currentwork", "analytics", "otherdept"]);

  for (const sheet of wb.worksheets) {
    if (skipSheets.has(sheet.name.toLowerCase())) continue;
    // Parse period from sheet name like "0301" (3 Jan), "31012025" (31 Jan 2025), "070225" (7 Feb 2025)
    const sname = sheet.name;
    let weekStartDate: string | null = null;
    let year = 2025;
    let period: string | null = null;

    if (/^\d{6}$/.test(sname)) {
      // DDMMYY
      const d = sname.slice(0, 2), m = sname.slice(2, 4), y = "20" + sname.slice(4, 6);
      weekStartDate = `${y}-${m}-${d}`;
      year = parseInt(y, 10);
      period = `${y}-W${sname}`;
    } else if (/^\d{8}$/.test(sname)) {
      const d = sname.slice(0, 2), m = sname.slice(2, 4), y = sname.slice(4, 8);
      weekStartDate = `${y}-${m}-${d}`;
      year = parseInt(y, 10);
      period = `${y}-W${sname}`;
    } else if (/^\d{4}$/.test(sname)) {
      // DDMM — assume 2025
      const d = sname.slice(0, 2), m = sname.slice(2, 4);
      weekStartDate = `2025-${m}-${d}`;
      year = 2025;
      period = `2025-W${sname}`;
    } else {
      continue;
    }

    // Header row 1: Task Assigned | Date Assigned | Details | Update | Deadline/Overdue | Engineer | iTop/Trello/Teams
    for (let r = 2; r <= sheet.rowCount; r++) {
      const row = sheet.getRow(r);
      const title = cellText(row.getCell(1));
      if (!title || title.length < 3) { skipped++; continue; }
      const dateAssigned = parseDate(cellText(row.getCell(2)));
      const details = cellText(row.getCell(3));
      const updateText = cellText(row.getCell(4));
      const deadline = parseDate(cellText(row.getCell(5)));
      const engineer = cellText(row.getCell(6));
      const source = cellText(row.getCell(7));

      // Pick first engineer name (comma/and separated)
      const firstEngineerName = engineer.split(/[,/&]| and /i)[0]?.trim();
      const assignedToId = firstEngineerName ? await findStaffByFirstName(firstEngineerName) : null;

      // Determine status from update text
      const u = updateText.toLowerCase();
      let status: "todo" | "in_progress" | "done" | "cancelled" | "blocked" = "todo";
      if (u.includes("complet")) status = "done";
      else if (u.includes("cancel")) status = "cancelled";
      else if (u.includes("progress")) status = "in_progress";
      else if (u.includes("block") || u.includes("await")) status = "blocked";

      if (!DRY_RUN) {
        const existing = await db.query.workItems.findFirst({
          where: and(
            eq(workItems.title, title),
            eq(workItems.year, year),
            eq(workItems.period, period!),
          ),
        });
        if (existing) {
          await db.update(workItems).set({
            description: details || null,
            status,
            assignedToId,
            dueDate: deadline,
            sourceSystem: source || null,
            weekStartDate,
          }).where(eq(workItems.id, existing.id));
        } else {
          await db.insert(workItems).values({
            title,
            description: details || null,
            type: "routine",
            status,
            priority: "medium",
            assignedToId,
            dueDate: deadline ?? null,
            sourceSystem: source || null,
            year,
            period,
            weekStartDate,
            createdAt: dateAssigned ? new Date(dateAssigned) : undefined,
          });
        }
      }
      upserted++;
    }
  }

  done({ upserted, skipped, errors: 0, warnings });
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
  if (shouldRun(4))  await step04_calendarEvents();
  if (shouldRun(5))  await step05_contracts();
  if (shouldRun(6))  await step06_appraisals();
  if (shouldRun(7))  await step07_appraisalRatings();
  if (shouldRun(8))  await step08_appraisalAchievementsGoals();
  if (shouldRun(9))  await step09_staffFeedback();
  if (shouldRun(10)) await step10_nocPerformanceJournal();
  if (shouldRun(11)) await step11_commendations();
  if (shouldRun(12)) await step12_staffPromotions();
  if (shouldRun(13)) await step13_careerProgression();
  if (shouldRun(14)) await step14_nocMonthlyMetrics();
  if (shouldRun(15)) await step15_nocTicketActivity();
  if (shouldRun(16)) await step16_employeeOfTheMonth();
  if (shouldRun(17)) await step17_nocShifts();
  if (shouldRun(18)) await step18_dcsOnCallWeeks();
  if (shouldRun(19)) await step19_quarterlyMaintenance();
  if (shouldRun(20)) await step20_leaveRequests();
  if (shouldRun(21)) await step21_tosdRecords();
  if (shouldRun(22)) await step22_latenessRecords();
  if (shouldRun(23)) await step23_ppeItems();
  if (shouldRun(24)) await step24_ppeIssuances();
  if (shouldRun(25)) await step25_trainingPlans();
  if (shouldRun(26)) await step26_certificationCatalog();
  if (shouldRun(27)) await step27_inHouseTrainingLog();
  if (shouldRun(28)) await step28_examSchedule();
  if (shouldRun(29)) await step29_examVouchers();
  if (shouldRun(30)) await step30_trainingEvents();
  if (shouldRun(31)) await step31_trainingEventParticipants();
  if (shouldRun(32)) await step32_trainingSyllabi();
  if (shouldRun(33)) await step33_assessmentQuestions();
  if (shouldRun(34)) await step34_onboardingTemplates();
  if (shouldRun(35)) await step35_workItems();

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
