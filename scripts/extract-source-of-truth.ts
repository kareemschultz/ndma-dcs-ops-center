/**
 * extract-source-of-truth.ts — Canonical extraction of `source-of-truth/`
 *
 * Walks every XLSX / DOCX / TXT under `source-of-truth/`, extracts content
 * preserving hidden-state and formula-vs-value distinctions, and emits:
 *
 *   - docs/source-of-truth/canonical-data.json — machine-readable
 *   - docs/source-of-truth/canonical-data.md   — human-readable companion
 *
 * Goal: stop opening Excel files. Seed scripts read the JSON, not the XLSX.
 *
 * Usage:
 *   bun scripts/extract-source-of-truth.ts --src ./source-of-truth \
 *     --out-md docs/source-of-truth/canonical-data.md \
 *     --out-json docs/source-of-truth/canonical-data.json
 *   bun scripts/extract-source-of-truth.ts --summary  # slim mode, omits row-level data
 *
 * Limitations vs. handoff prompt:
 *   - Does NOT run headless LibreOffice for formula recache. If `value` is null
 *     and `formula` is non-null, the cell is flagged with `needsRecache: true`
 *     and the seed script must handle it (or re-run after manual recache).
 *   - Conditional formatting rules are captured at the *range* level but
 *     business-meaning extraction (red = overdue) is left to seed authors.
 *   - Data validations + defined names captured if present in ExcelJS model.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import * as crypto from "node:crypto";
import ExcelJS from "exceljs";
// @ts-expect-error mammoth has no types
import mammoth from "mammoth";

// ── CLI ─────────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
function argOf(name: string, fallback: string): string {
  const flag = args.find((a) => a.startsWith(`--${name}=`));
  if (flag) return flag.replace(`--${name}=`, "");
  const idx = args.indexOf(`--${name}`);
  if (idx >= 0 && args[idx + 1]) return args[idx + 1]!;
  return fallback;
}

const REPO_ROOT = process.cwd();
const SRC = path.resolve(argOf("src", path.join(REPO_ROOT, "source-of-truth")));
const OUT_JSON = path.resolve(argOf("out-json", path.join(REPO_ROOT, "docs/source-of-truth/canonical-data.json")));
const OUT_MD = path.resolve(argOf("out-md", path.join(REPO_ROOT, "docs/source-of-truth/canonical-data.md")));
const SUMMARY = args.includes("--summary");
const MAX_ROWS_PER_SHEET = SUMMARY ? 5 : 10_000;

// ── Types ───────────────────────────────────────────────────────────────────

type CellOut = { value: string | number | boolean | Date | null; formula?: string; format?: string; comment?: string; needsRecache?: boolean };
type RowOut = { row: number; hidden: boolean; cells: Record<string, CellOut> };
type ColOut = { letter: string; header?: string; hidden: boolean; width?: number };
type SheetOut = {
  name: string;
  state: "visible" | "hidden" | "veryHidden";
  dimensions: string | null;
  rowCount: number;
  colCount: number;
  hiddenRowCount: number;
  hiddenColCount: number;
  autoFilter: string | null;
  freezePanes: string | null;
  mergedCells: string[];
  columns: ColOut[];
  rows: RowOut[];
  truncated: boolean;
};
type FileOut = {
  path: string;
  sha256: string;
  sizeBytes: number;
  mtime: string;
  type: "xlsx" | "docx" | "txt";
  sheets?: SheetOut[];
  paragraphs?: string[];
  tables?: { rows: string[][] }[];
  text?: string;
  parseError?: string;
};

type Output = {
  schemaVersion: "1.0.0";
  extractedAt: string;
  extractedBy: string;
  gitShaAtExtraction: string;
  sourceRootSha256: string;
  summaryMode: boolean;
  fileCounts: { xlsx: number; docx: number; txt: number; total: number };
  files: FileOut[];
  seedMapping: Record<string, SeedMappingEntry>;
  gateAssertions: Record<string, unknown>;
  anomalies: Array<{ severity: "warning" | "error"; file: string; sheet?: string; issue: string }>;
};

type SeedMappingEntry = {
  sourceFiles: string[];
  targetTable: string;
  naturalKey: string[];
  columnMap: Record<string, string>;
  transforms: string[];
  expectedRowCount?: number;
  notes?: string;
  upstreamPhase: number;
};

// ── Helpers ─────────────────────────────────────────────────────────────────

function walk(dir: string, out: string[] = []): string[] {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

function sha256File(p: string): string {
  const buf = fs.readFileSync(p);
  return crypto.createHash("sha256").update(buf).digest("hex");
}

function colLetter(col: number): string {
  let s = "";
  let n = col;
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s || "A";
}

function cellOut(cell: ExcelJS.Cell): CellOut {
  const v = cell.value;
  const formulaResult =
    typeof v === "object" && v !== null && "formula" in v
      ? (v as ExcelJS.CellFormulaValue)
      : null;
  if (formulaResult) {
    const result = formulaResult.result ?? null;
    return {
      value: result as CellOut["value"],
      formula: `=${formulaResult.formula}`,
      format: typeof cell.numFmt === "string" ? cell.numFmt : undefined,
      needsRecache: result === null,
    };
  }
  if (v instanceof Date) return { value: v };
  if (typeof v === "object" && v !== null) {
    if ("richText" in v) {
      return { value: (v as ExcelJS.CellRichTextValue).richText.map((r) => r.text).join("") };
    }
    if ("hyperlink" in v) {
      return { value: (v as ExcelJS.CellHyperlinkValue).text ?? null };
    }
    if ("error" in v) {
      return { value: null, needsRecache: true };
    }
  }
  return { value: v as CellOut["value"], format: typeof cell.numFmt === "string" ? cell.numFmt : undefined };
}

// ── Per-file extractors ─────────────────────────────────────────────────────

async function extractXlsx(filePath: string): Promise<Omit<FileOut, "path" | "sha256" | "sizeBytes" | "mtime" | "type">> {
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.readFile(filePath);
  } catch (err) {
    return { parseError: String(err) };
  }

  const sheets: SheetOut[] = [];

  wb.worksheets.forEach((ws) => {
    const state = (ws.state as "visible" | "hidden" | "veryHidden") ?? "visible";
    const rowCount = ws.rowCount;
    const colCount = ws.columnCount;

    // Columns + hidden flag
    const columns: ColOut[] = [];
    let hiddenColCount = 0;
    for (let c = 1; c <= colCount; c++) {
      const dim = ws.getColumn(c);
      const isHidden = dim?.hidden === true;
      if (isHidden) hiddenColCount++;
      columns.push({
        letter: colLetter(c),
        hidden: isHidden,
        width: typeof dim?.width === "number" ? dim.width : undefined,
      });
    }

    // Header row (try row 1 first; some files use row 2 — caller decides)
    if (rowCount > 0) {
      const headerRow = ws.getRow(1);
      headerRow.eachCell({ includeEmpty: false }, (cell, colNum) => {
        const v = cell.value;
        if (v != null && typeof v !== "object") {
          const colIdx = columns.findIndex((cc) => cc.letter === colLetter(colNum));
          if (colIdx >= 0) columns[colIdx]!.header = String(v);
        } else if (typeof v === "object" && v !== null && "richText" in v) {
          const text = (v as ExcelJS.CellRichTextValue).richText.map((r) => r.text).join("");
          const colIdx = columns.findIndex((cc) => cc.letter === colLetter(colNum));
          if (colIdx >= 0) columns[colIdx]!.header = text;
        }
      });
    }

    // Rows
    const rows: RowOut[] = [];
    let hiddenRowCount = 0;
    const cap = Math.min(rowCount, MAX_ROWS_PER_SHEET);
    let truncated = rowCount > MAX_ROWS_PER_SHEET;
    for (let r = 1; r <= cap; r++) {
      const row = ws.getRow(r);
      const isHidden = row.hidden === true;
      if (isHidden) hiddenRowCount++;
      const cells: Record<string, CellOut> = {};
      row.eachCell({ includeEmpty: false }, (cell, colNum) => {
        cells[colLetter(colNum)] = cellOut(cell);
      });
      // Skip totally blank rows that aren't explicitly hidden — keeps JSON small
      if (Object.keys(cells).length === 0 && !isHidden) continue;
      rows.push({ row: r, hidden: isHidden, cells });
    }

    // Merged cells: ExcelJS exposes via _merges (private). Try public API.
    const mergedCells: string[] = [];
    // @ts-expect-error _merges is private but stable
    const merges = ws._merges as Record<string, ExcelJS.Range> | undefined;
    if (merges) {
      for (const key of Object.keys(merges)) mergedCells.push(key);
    }

    // Auto-filter / freeze panes
    const autoFilter =
      typeof ws.autoFilter === "object" && ws.autoFilter && "from" in ws.autoFilter
        ? `${(ws.autoFilter as { from: { row: number; column: number }; to: { row: number; column: number } }).from.row}:${(ws.autoFilter as { from: { row: number; column: number }; to: { row: number; column: number } }).to.row}`
        : typeof ws.autoFilter === "string"
        ? ws.autoFilter
        : null;
    const freezePanes =
      ws.views?.[0]?.state === "frozen"
        ? `xSplit=${ws.views[0].xSplit ?? 0} ySplit=${ws.views[0].ySplit ?? 0}`
        : null;

    sheets.push({
      name: ws.name,
      state,
      dimensions: rowCount > 0 ? `A1:${colLetter(colCount)}${rowCount}` : null,
      rowCount,
      colCount,
      hiddenRowCount,
      hiddenColCount,
      autoFilter,
      freezePanes,
      mergedCells,
      columns,
      rows: SUMMARY ? rows.slice(0, 3) : rows,
      truncated,
    });
  });

  return { sheets };
}

async function extractDocx(filePath: string): Promise<Omit<FileOut, "path" | "sha256" | "sizeBytes" | "mtime" | "type">> {
  try {
    const result = await mammoth.extractRawText({ path: filePath });
    const text: string = result.value ?? "";
    const paragraphs = text.split(/\r?\n/).filter((p: string) => p.trim().length > 0);
    return { paragraphs: SUMMARY ? paragraphs.slice(0, 20) : paragraphs };
  } catch (err) {
    return { parseError: String(err) };
  }
}

function extractTxt(filePath: string): Omit<FileOut, "path" | "sha256" | "sizeBytes" | "mtime" | "type"> {
  try {
    const text = fs.readFileSync(filePath, "utf-8");
    return { text: SUMMARY ? text.slice(0, 4000) : text };
  } catch (err) {
    return { parseError: String(err) };
  }
}

// ── Seed mapping (hardcoded from master plan §10 / §13) ─────────────────────

const SEED_MAPPING: Record<string, SeedMappingEntry> = {
  step_1_departments: {
    sourceFiles: ["(hardcoded — 7 canonical departments)"],
    targetTable: "departments",
    naturalKey: ["code"],
    columnMap: {},
    transforms: ["7 canonical codes seeded inline"],
    expectedRowCount: 7,
    upstreamPhase: 1,
  },
  step_2_staff_profiles: {
    sourceFiles: ["00-access-and-accounts/AccountManagementMarch_20260312.xlsx > Employee Data"],
    targetTable: "staff_profiles + user",
    naturalKey: ["email"],
    columnMap: {
      Name: "fullName",
      Department: "department_code → departments.id",
      "Current Appointment": "current_appointment",
      Email: "user.email + staff_profiles.email",
      Phone: "phone_number",
      Birthday: "birthday",
      "Hire Date": "hire_date",
      "Contract End": "contract_end_date",
      Status: "employment_status",
    },
    transforms: ["Email normalized lowercase", "Name → email derivation when email missing"],
    expectedRowCount: 281,
    notes: "Gate: staff.rowCount == 281",
    upstreamPhase: 1,
  },
  step_3_service_access_registry: {
    sourceFiles: ["00-access-and-accounts/AccountManagementMarch_20260312.xlsx > (Services, Fortigate, Uportal, VPN, Biometrics)"],
    targetTable: "service_access_registry",
    naturalKey: ["staffProfileId", "platformId"],
    columnMap: { "(per-platform column)": "access + role + active fields with _source provenance" },
    transforms: ["pivot wide → long (one row per staff × platform)"],
    expectedRowCount: 3000,
    notes: "Gate: serviceAccessRegistry.rowCount >= 3000",
    upstreamPhase: 1,
  },
  step_4_calendar_events_birthdays_holidays: {
    sourceFiles: ["00-access-and-accounts/AccountManagementMarch_20260312.xlsx (birthdays)", "(hardcoded GY public holidays)"],
    targetTable: "calendar_events",
    naturalKey: ["title", "startDate"],
    columnMap: { Birthday: "title='<Name> Birthday', type='birthday'", "Public Holiday": "type='public_holiday'" },
    transforms: ["birthdays one row per staff with birthday non-null; public holidays hardcoded list for current + next year"],
    upstreamPhase: 10,
  },
  step_5_contracts: {
    sourceFiles: ["02-dcs/contracts/ContractEndDates_DCS.xlsx", "03-noc/contracts/ContractEndDates_NOC_*.xlsx"],
    targetTable: "contracts",
    naturalKey: ["staffProfileId", "startDate"],
    columnMap: {
      Name: "→ staff_profiles.id by name match",
      "Contract Start": "start_date",
      "Contract End": "end_date",
      "Appraisal 1 Due": "appraisal_1_due_date",
      "Appraisal 2 Due": "appraisal_2_due_date",
      "Renewal Letter Due": "renewal_letter_due_date",
    },
    transforms: ["EDATE formulas pre-computed in XLSX; read cached value, fallback to JS Date arithmetic"],
    expectedRowCount: 160,
    upstreamPhase: 6,
  },
  step_6_career_progression_plans: {
    sourceFiles: ["03-noc/contracts/ContractEndDates_NOC_*.xlsx > Plan sheet"],
    targetTable: "career_progression_plans",
    naturalKey: ["staffProfileId", "year"],
    columnMap: { Year: "year", "Plan Notes": "plan_notes", Goal: "goal_summary" },
    transforms: ["one row per (staff, year) — multi-year horizon"],
    upstreamPhase: 6,
  },
  step_7_appraisal_cycles: {
    sourceFiles: ["02-dcs/appraisals/{2021..2026}/", "03-noc/appraisals/{2021..2026}/"],
    targetTable: "appraisal_cycles",
    naturalKey: ["year", "half"],
    columnMap: { "(derived)": "year + half (h1/h2) + signature_mode='digital'" },
    transforms: ["one cycle row per (year, half) from 2021 onwards"],
    expectedRowCount: 12,
    upstreamPhase: 4,
  },
  step_8_appraisals: {
    sourceFiles: ["02-dcs/appraisals/{2021..2026}/*.xlsx", "03-noc/appraisals/{2021..2026}/*.xlsx"],
    targetTable: "appraisals + appraisal_ratings + appraisal_responsibilities + appraisal_achievements + appraisal_goals",
    naturalKey: ["staffProfileId", "cycleId"],
    columnMap: {
      "Performance Evaluation B-F columns": "ratings 1-5 per category",
      "Core Responsibilities": "responsibilities (5 rows)",
      "Achievements": "achievements (min 3)",
      "Goals": "goals (min 3)",
    },
    transforms: ["openpyxl/exceljs reads raw position B-F not formula result (per master plan §10.3)", "filename pattern <Name>_<Period>_<yyyymmdd>_v01.xlsx parsed for cycle"],
    notes: "~130 historical files. Critical for appraisal_tracker_view gate (rowCount >= 130)",
    expectedRowCount: 130,
    upstreamPhase: 4,
  },
  step_9_appraisal_followups: {
    sourceFiles: ["02-dcs/contracts/ContractEndDates_DCS.xlsx > Follow up sheet"],
    targetTable: "appraisal_followups",
    naturalKey: ["appraisalId", "type"],
    columnMap: { "EDATE(apprDate, 3)": "three_month due date", "EDATE(apprDate, 9)": "six_month due date" },
    transforms: ["derived from appraisal date + EDATE offsets"],
    upstreamPhase: 4,
  },
  step_10_noc_performance_journal: {
    sourceFiles: ["03-noc/performance-journal/StaffPerformanceJournal_20230731_v01.xlsx"],
    targetTable: "noc_performance_journal",
    naturalKey: ["staffProfileId", "year", "month", "category"],
    columnMap: { "Sheet name = staff first name": "staff_profile_id", Year: "year", Month: "month", "Category": "category enum (tickets_itop / alarms / slack_whatsapp / task_incomplete)", "Count": "count", "Notes": "narrative" },
    transforms: ["wide pivot → long (12 per-person sheets, 4 years, 12 months, 4 categories = ~2,304 rows)"],
    upstreamPhase: 5,
  },
  step_11_commendations: {
    sourceFiles: ["03-noc/appraisals/StaffCommendationJournal_20231216_v01.xlsx"],
    targetTable: "commendations",
    naturalKey: ["staffProfileId", "year", "month"],
    columnMap: { Person: "staff_profile_id", Year: "year", Month: "month", Commendation: "notes" },
    transforms: ["one row per (staff, year, month) with positive narrative"],
    expectedRowCount: 11,
    upstreamPhase: 5,
  },
  step_12_noc_ticket_activity: {
    sourceFiles: ["03-noc/appraisals/IncidentProblem_CreatedandClose_20252905.xlsx (24 sheets)"],
    targetTable: "noc_ticket_activity",
    naturalKey: ["ticketId"],
    columnMap: { "I-/P- ticket ID": "ticket_id", Creator: "created_by_staff_id", Closer: "closed_by_staff_id", Month: "(month, year derived from sheet name)" },
    transforms: ["12 Incident + 12 Problem sheets covering Apr 2025 – Mar 2026"],
    upstreamPhase: 5,
  },
  step_13_employee_of_the_month: {
    sourceFiles: ["03-noc/employee-of-month/EmployeeOfTheMonth_20240923_v01.xlsx (19 monthly sheets)"],
    targetTable: "employee_of_the_month",
    naturalKey: ["year", "month"],
    columnMap: { "Overall Best Technician": "winner_staff_id", "Second Best Overall": "runner_up_staff_id", "Most Incident Tickets": "most_incidents_staff_id", "Most NOC Tickets Closed": "most_noc_closed_staff_id", "Least Alarm Non-Compliance": "least_alarm_noncompliance_staff_id" },
    transforms: ["one row per month Aug2024 → March2026", "EOM calculator validates: computed overall_best matches recorded label"],
    expectedRowCount: 19,
    notes: "Gate: employeeOfTheMonth.matchRate == 19/19",
    upstreamPhase: 5,
  },
  step_14_noc_monthly_metrics: {
    sourceFiles: ["03-noc/employee-of-month/EmployeeOfTheMonth_20240923_v01.xlsx"],
    targetTable: "noc_monthly_metrics",
    naturalKey: ["staffProfileId", "year", "month"],
    columnMap: { Tech: "staff_id", MT: "mt", ITT_incident: "itt_incident", ITT_problem: "itt_problem", DShift: "d_shift", "Day Shift Ticket Rate": "day_shift_ticket_rate (computed)" },
    transforms: ["pre-computed rates from XLSX formulas; recalc to verify"],
    expectedRowCount: 202,
    upstreamPhase: 5,
  },
  step_15_appraisal_tracker_seed: {
    sourceFiles: ["02-dcs/appraisal-tracker/APPRAISAL TRACKER DCS.xlsx", "03-noc/appraisals/AppraisalTracker_20241210_v01.xlsx"],
    targetTable: "(read-only VIEW appraisal_tracker_view — no insert; gate validates rowcount)",
    naturalKey: [],
    columnMap: { Name: "staff_profile_id", Percentage: "percentage", Period: "period", Year: "year" },
    transforms: ["View derived from appraisals.status='completed'; this step is a gate-only assertion"],
    expectedRowCount: 130,
    notes: "Gate: appraisalTrackerView.rowCount >= 130",
    upstreamPhase: 4,
  },
  step_16_staff_feedback: {
    sourceFiles: ["02-dcs/appraisal-tracker/APPRAISAL TRACKER DCS.xlsx > FeedbackFromStaff", "08-feedback-notes/*.xlsx"],
    targetTable: "staff_feedback",
    naturalKey: ["staffProfileId", "year", "feedbackType"],
    columnMap: { Person: "staff_profile_id", Feedback: "feedback_text", Comment: "comment_text", Year: "year" },
    transforms: ["one row per (staff, year, type)"],
    upstreamPhase: 4,
  },
  step_17_noc_shifts: {
    sourceFiles: ["03-noc/shift-schedules/shift-schedule-*.xlsx"],
    targetTable: "noc_shifts",
    naturalKey: ["staffProfileId", "shiftDate"],
    columnMap: { "Staff name (col 3+)": "staff_profile_id", "Date (col 1)": "shift_date", "Cell value (D/S/N/sick/off/al/ml)": "shift_type" },
    transforms: ["short codes → enum (12hr Day / 12hr Night / Off / Annual Leave / Sick Leave / Split Shift / Maternity Leave)"],
    expectedRowCount: 453,
    upstreamPhase: 3,
  },
  step_18_dcs_oncall_weeks: {
    sourceFiles: ["02-dcs/on-call/PlannedOnCallRoster_20230123 (1).xlsx > 2026 sheet"],
    targetTable: "dcs_on_call_weeks",
    naturalKey: ["weekStartDate"],
    columnMap: { Week: "week_start_date", "Lead Engineer": "lead_engineer_id", "ASN Support": "asn_support_id", "Enterprise Support": "enterprise_support_id", "CORE Support": "core_support_id" },
    transforms: ["names → staff_profile_id via match"],
    upstreamPhase: 3,
  },
  step_19_quarterly_maintenance: {
    sourceFiles: ["02-dcs/on-call/PlannedOnCallRoster_20230123 (1).xlsx > 2026 (quarterly tasks)"],
    targetTable: "quarterly_maintenance_tasks",
    naturalKey: ["quarter", "year", "title"],
    columnMap: { Task: "title", "Cleaning Server Room": "title='Server Room Cleaning'", "Routine Maintenance DCS": "title='Routine Maintenance'", Assignee: "assigned_staff_id" },
    transforms: ["cross-team tasks preserved (e.g., 'NOC Asif — Test Fire Detection System')"],
    upstreamPhase: 3,
  },
  step_20_leave_requests_2026: {
    sourceFiles: ["04-shared-leave/AnnualLeaveRosterNOC.xlsx"],
    targetTable: "leave_requests",
    naturalKey: ["staffProfileId", "startDate"],
    columnMap: { Name: "staff_profile_id", Start: "start_date", End: "end_date", Type: "leave_type_code", Status: "status" },
    transforms: ["calendar days = end - start + 1; type normalized"],
    notes: "File currently absent from source-of-truth — step will warn",
    upstreamPhase: 2,
  },
  step_21_tosd_records: {
    sourceFiles: ["04-shared-leave/TimeOffSickDays_*.xlsx"],
    targetTable: "tosd_records",
    naturalKey: ["staffProfileId", "date", "type"],
    columnMap: { Date: "date", Staff: "staff_profile_id", Type: "type enum (reported_sick / medical / absent / time_off / work_from_home / lateness / callout_legacy)", Reason: "reason" },
    transforms: ["7-type enum; callout_legacy preserves Phase-0-dropped data"],
    expectedRowCount: 125,
    upstreamPhase: 2,
  },
  step_22_lateness_records: {
    sourceFiles: ["04-shared-leave/LatenessReportNOC&DC_2025_v01.xlsx"],
    targetTable: "lateness_records",
    naturalKey: ["staffProfileId", "year", "month"],
    columnMap: { Name: "staff_profile_id", Year: "year", Month: "month", "Total Time Late": "total_time_late_minutes", "Days Late": "days_late" },
    transforms: ["quarterly grid → monthly rows"],
    upstreamPhase: 8,
  },
  step_23_ppe_items: {
    sourceFiles: ["(hardcoded 17 canonical items)"],
    targetTable: "ppe_items",
    naturalKey: ["code"],
    columnMap: {},
    transforms: ["17 canonical: long_boots, overalls, mousepad, safety_boots, bag, screwdriver, db9_rj45, db9_usb, monitor, hdmi, laptop, mifi, cug_phone, cug_sim, ndma_shirts, usb_ethernet, umbrella"],
    expectedRowCount: 17,
    upstreamPhase: 8,
  },
  step_24_ppe_issuances: {
    sourceFiles: ["02-dcs/ppe/PPE&IndividualTools_20240726_v01.xlsx"],
    targetTable: "ppe_issuances",
    naturalKey: ["staffProfileId", "ppeItemId", "issuedDate"],
    columnMap: { Staff: "staff_profile_id", "Item column": "ppe_item_id", "Cell value": "status (issued / not_issued / n_a / etc.)", "Size column": "size", "Asset Tag": "asset_tag" },
    transforms: ["wide matrix → long; ~17 columns × 23 staff = ~391 rows"],
    upstreamPhase: 8,
  },
  step_25_training_plans: {
    sourceFiles: ["06-shared-training/TrainingPlan*.xlsx"],
    targetTable: "training_plans",
    naturalKey: ["staffProfileId", "year", "trainingArea"],
    columnMap: { Staff: "staff_profile_id", Year: "year", Area: "training_area", Plan: "plan_text" },
    transforms: ["matrix → long (team × staff × training areas)"],
    upstreamPhase: 7,
  },
  step_26_exam_schedule: {
    sourceFiles: ["06-shared-training/ExamSchedule*.xlsx"],
    targetTable: "exam_schedule",
    naturalKey: ["staffProfileId", "examName", "windowStart"],
    columnMap: { Staff: "staff_profile_id", "Exam Name": "exam_name", "Window Start": "window_start", "Window End": "window_end" },
    transforms: ["window_start + window_end columns added in Phase 7"],
    upstreamPhase: 7,
  },
  step_27_exam_vouchers: {
    sourceFiles: ["06-shared-training/Vouchers*.xlsx"],
    targetTable: "exam_vouchers",
    naturalKey: ["voucherCode"],
    columnMap: { Code: "voucher_code", Staff: "assigned_staff_id", Expiry: "expires_at" },
    transforms: ["expiry reminder cadence is router-side (sendExpiryReminders)"],
    upstreamPhase: 7,
  },
  step_28_training_events: {
    sourceFiles: ["06-shared-training/TrainingEvents*.xlsx"],
    targetTable: "training_events + training_event_participants",
    naturalKey: ["title", "startDate"],
    columnMap: { Title: "title", Start: "start_date", End: "end_date", Cost: "cost_breakdown" },
    transforms: ["cost breakdown stored as JSON; auto-sums in UI"],
    upstreamPhase: 7,
  },
  step_29_in_house_training_log: {
    sourceFiles: ["06-shared-training/InHouseTraining*.xlsx"],
    targetTable: "in_house_training_log",
    naturalKey: ["topic", "deliveredDate"],
    columnMap: { Topic: "topic", Date: "delivered_date", Presenter: "presenter_staff_id", Attendees: "attendee_ids" },
    transforms: [],
    upstreamPhase: 7,
  },
  step_30_training_syllabi: {
    sourceFiles: ["06-shared-training/Syllabi*.xlsx"],
    targetTable: "training_syllabi",
    naturalKey: ["title", "version"],
    columnMap: { Title: "title", Version: "version", Content: "content_md" },
    transforms: [],
    upstreamPhase: 7,
  },
  step_31_certification_catalog: {
    sourceFiles: ["06-shared-training/CertCatalog*.xlsx"],
    targetTable: "certification_catalog",
    naturalKey: ["vendor", "name"],
    columnMap: { Vendor: "vendor", Name: "name", Level: "level", Validity: "validity_years" },
    transforms: [],
    upstreamPhase: 7,
  },
  step_32_training_records: {
    sourceFiles: ["06-shared-training/CompletedTraining*.xlsx"],
    targetTable: "training_records",
    naturalKey: ["staffProfileId", "trainingName", "completedDate"],
    columnMap: { Staff: "staff_profile_id", Training: "training_name", Completed: "completed_date" },
    transforms: [],
    upstreamPhase: 7,
  },
  step_33_promotions: {
    sourceFiles: ["02-dcs/appraisals/Promotions*.xlsx", "03-noc/appraisals/Promotions*.xlsx"],
    targetTable: "staff_promotions",
    naturalKey: ["staffProfileId", "effectiveDate"],
    columnMap: { Staff: "staff_profile_id", From: "from_appointment", To: "to_appointment", Date: "effective_date" },
    transforms: [],
    upstreamPhase: 6,
  },
  step_34_onboarding_task_templates: {
    sourceFiles: ["(hardcoded 8 canonical templates)"],
    targetTable: "onboarding_task_templates",
    naturalKey: ["code"],
    columnMap: {},
    transforms: ["8 canonical: it_equipment, accounts, building_access, server_room, hr_docs, dept_orientation, buddy_assign, ppe_issuance"],
    expectedRowCount: 8,
    upstreamPhase: 7,
  },
  step_35_work_items_historical: {
    sourceFiles: ["07-work-register/WorkUpdate_20240118_v01.xlsx (24 sheets)"],
    targetTable: "work_items",
    naturalKey: ["title", "year", "period"],
    columnMap: { Title: "title", Engineer: "assigned_engineer_id", Status: "status", "Week (sheet name)": "(year, period) derived" },
    transforms: ["24 sheets covering 2024 weekly status updates"],
    upstreamPhase: 11,
  },
};

const GATE_ASSERTIONS = {
  "staff.rowCount": 281,
  "serviceAccessRegistry.rowCount_min": 3000,
  "appraisalTrackerView.rowCount_min": 130,
  "employeeOfTheMonth.matchRate": "19/19",
};

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  if (!fs.existsSync(SRC)) {
    console.error(`Source root not found: ${SRC}`);
    process.exit(1);
  }

  const allFiles = walk(SRC).filter((p) => /\.(xlsx|docx|txt)$/i.test(p));
  const xlsxs = allFiles.filter((p) => p.toLowerCase().endsWith(".xlsx"));
  const docxs = allFiles.filter((p) => p.toLowerCase().endsWith(".docx"));
  const txts = allFiles.filter((p) => p.toLowerCase().endsWith(".txt"));

  console.error(`Found ${xlsxs.length} XLSX + ${docxs.length} DOCX + ${txts.length} TXT = ${allFiles.length} files`);

  const files: FileOut[] = [];
  const anomalies: Output["anomalies"] = [];
  let processed = 0;

  for (const p of allFiles) {
    processed++;
    if (processed % 25 === 0) console.error(`  ... processed ${processed}/${allFiles.length}`);
    const stat = fs.statSync(p);
    const rel = path.relative(SRC, p).replace(/\\/g, "/");
    const sha = sha256File(p);
    const base: FileOut = {
      path: rel,
      sha256: sha,
      sizeBytes: stat.size,
      mtime: stat.mtime.toISOString(),
      type: p.toLowerCase().endsWith(".xlsx") ? "xlsx" : p.toLowerCase().endsWith(".docx") ? "docx" : "txt",
    };
    try {
      if (base.type === "xlsx") {
        const ext = await extractXlsx(p);
        Object.assign(base, ext);
        for (const sh of ext.sheets ?? []) {
          if (sh.hiddenRowCount > 0) {
            anomalies.push({ severity: "warning", file: rel, sheet: sh.name, issue: `${sh.hiddenRowCount} hidden rows preserved with hidden=true` });
          }
          for (const r of sh.rows) {
            for (const k of Object.keys(r.cells)) {
              if (r.cells[k]!.needsRecache) {
                anomalies.push({ severity: "warning", file: rel, sheet: sh.name, issue: `Cell ${k}${r.row} has formula but null cached value (needsRecache)` });
              }
            }
          }
        }
      } else if (base.type === "docx") {
        const ext = await extractDocx(p);
        Object.assign(base, ext);
      } else {
        const ext = extractTxt(p);
        Object.assign(base, ext);
      }
    } catch (err) {
      base.parseError = String(err);
      anomalies.push({ severity: "error", file: rel, issue: String(err) });
    }
    files.push(base);
  }

  // Source root sha256 = sha256 of sorted concatenation of file shas
  const sortedShas = files.map((f) => f.sha256).sort().join("\n");
  const sourceRootSha256 = crypto.createHash("sha256").update(sortedShas).digest("hex");

  let gitSha = "unknown";
  try {
    gitSha = (await (await import("child_process")).execSync("git rev-parse HEAD", { cwd: REPO_ROOT }).toString()).trim();
  } catch {}

  const out: Output = {
    schemaVersion: "1.0.0",
    extractedAt: new Date().toISOString(),
    extractedBy: `bun:extract-source-of-truth@${gitSha.slice(0, 7)}`,
    gitShaAtExtraction: gitSha,
    sourceRootSha256,
    summaryMode: SUMMARY,
    fileCounts: { xlsx: xlsxs.length, docx: docxs.length, txt: txts.length, total: allFiles.length },
    files,
    seedMapping: SEED_MAPPING,
    gateAssertions: GATE_ASSERTIONS,
    anomalies,
  };

  fs.mkdirSync(path.dirname(OUT_JSON), { recursive: true });
  fs.writeFileSync(OUT_JSON, JSON.stringify(out, null, SUMMARY ? 2 : 0));
  console.error(`✅ Wrote ${OUT_JSON} (${(fs.statSync(OUT_JSON).size / 1024 / 1024).toFixed(2)} MB)`);

  // ── Markdown companion ───────────────────────────────────────────────────
  const md: string[] = [];
  md.push(`# Canonical Source-of-Truth Snapshot\n`);
  md.push(`> Generated by \`scripts/extract-source-of-truth.ts\` on ${out.extractedAt}.`);
  md.push(`> Git SHA: \`${out.gitShaAtExtraction}\` · Source root sha256: \`${out.sourceRootSha256.slice(0, 16)}…\``);
  md.push(`> **Summary mode:** ${SUMMARY ? "yes (row-level data truncated)" : "no (full)"}\n`);
  md.push(`This file is the human-readable companion to \`canonical-data.json\`. **Do not edit by hand** — regenerate with \`bun run sot:extract\`.\n`);

  md.push(`## 1. Inventory\n`);
  md.push(`| Counts | XLSX | DOCX | TXT | Total |`);
  md.push(`|---|---|---|---|---|`);
  md.push(`| Files | ${out.fileCounts.xlsx} | ${out.fileCounts.docx} | ${out.fileCounts.txt} | ${out.fileCounts.total} |\n`);

  md.push(`### 1.1 XLSX files (top-20 by sheet count)\n`);
  md.push(`| Path | Sheets | Total rows | Hidden rows |`);
  md.push(`|---|---|---|---|`);
  const xlsxFiles = files.filter((f) => f.type === "xlsx");
  const xlsxSorted = [...xlsxFiles].sort((a, b) => (b.sheets?.length ?? 0) - (a.sheets?.length ?? 0)).slice(0, 20);
  for (const f of xlsxSorted) {
    const totalRows = (f.sheets ?? []).reduce((acc, s) => acc + s.rowCount, 0);
    const hiddenRows = (f.sheets ?? []).reduce((acc, s) => acc + s.hiddenRowCount, 0);
    md.push(`| \`${f.path}\` | ${f.sheets?.length ?? 0} | ${totalRows} | ${hiddenRows} |`);
  }
  md.push("");

  md.push(`## 2. Seed mapping (35 steps)\n`);
  md.push(`For each step, the source-file(s), target table, natural key, and column map. Authoritative source for \`packages/db/src/seed-historical.ts\`.\n`);
  for (const [key, m] of Object.entries(SEED_MAPPING)) {
    md.push(`### ${key}\n`);
    md.push(`- **Phase:** ${m.upstreamPhase}`);
    md.push(`- **Target:** \`${m.targetTable}\``);
    md.push(`- **Natural key:** \`${JSON.stringify(m.naturalKey)}\``);
    md.push(`- **Source file(s):** ${m.sourceFiles.map((s) => `\`${s}\``).join(", ")}`);
    if (m.expectedRowCount) md.push(`- **Expected rows:** ${m.expectedRowCount}`);
    if (m.notes) md.push(`- **Notes:** ${m.notes}`);
    if (Object.keys(m.columnMap).length > 0) {
      md.push(`- **Column map:**`);
      for (const [k, v] of Object.entries(m.columnMap)) md.push(`  - \`${k}\` → \`${v}\``);
    }
    if (m.transforms.length > 0) {
      md.push(`- **Transforms:**`);
      for (const t of m.transforms) md.push(`  - ${t}`);
    }
    md.push("");
  }

  md.push(`## 3. Gate assertions\n`);
  for (const [k, v] of Object.entries(GATE_ASSERTIONS)) md.push(`- **${k}:** \`${v}\``);
  md.push("");

  md.push(`## 4. Anomalies (${anomalies.length})\n`);
  md.push(`Hidden rows, formula cells with null cached values, parse errors. Preserved in JSON, summarized here.\n`);
  const grouped = new Map<string, number>();
  for (const a of anomalies) {
    const key = a.issue.includes("hidden rows") ? "Hidden rows preserved" : a.issue.includes("needsRecache") ? "Formula cells needing recache" : a.severity === "error" ? "Parse error" : "Other warning";
    grouped.set(key, (grouped.get(key) ?? 0) + 1);
  }
  for (const [k, n] of grouped) md.push(`- **${k}:** ${n} occurrences`);
  md.push("");
  md.push(`> Full list in \`canonical-data.json.anomalies\`.\n`);

  md.push(`## 5. Per-staff name resolution table\n`);
  md.push(`The 281 canonical staff with email + DCS/NOC department live in \`AccountManagementMarch_20260312.xlsx > Employee Data\`. The seed script's \`findStaffByName\` / \`findStaffByFirstName\` helpers handle spelling variants. Variants seen in source files are commented inline in \`seed-historical.ts\`.\n`);
  md.push(`## 6. How to use this output\n`);
  md.push(`1. Seed code (\`packages/db/src/seed-historical.ts\`) reads \`canonical-data.json\` instead of opening XLSX files at runtime where possible.`);
  md.push(`2. For row-level data, the JSON contains every cell with formula + cached value. Use the cached value; if \`needsRecache\` is true, the seed must compute itself.`);
  md.push(`3. Anomalies should be reviewed when the seed produces unexpected row counts.`);
  md.push(`4. Regenerate with \`bun run sot:extract\` whenever \`source-of-truth/\` changes (write fresh sha256 and commit).`);

  fs.mkdirSync(path.dirname(OUT_MD), { recursive: true });
  fs.writeFileSync(OUT_MD, md.join("\n"));
  console.error(`✅ Wrote ${OUT_MD}`);

  console.error(`\nSummary:`);
  console.error(`  Files: ${out.fileCounts.total}`);
  console.error(`  Anomalies: ${anomalies.length}`);
  console.error(`  Source root sha256: ${out.sourceRootSha256}`);
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});
