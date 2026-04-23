#!/usr/bin/env bun
/**
 * seed-noc-shifts.ts
 *
 * Imports NOC monthly shift workbooks into noc_shifts and appends contract
 * end-date data into contracts.
 *
 * Usage:
 *   bun --env-file=apps/server/.env scripts/seed-noc-shifts.ts <root-dir>
 */

import ExcelJS from "exceljs";
import { createHash } from "node:crypto";
import { readdir, stat } from "node:fs/promises";
import path from "node:path";

import { and, gte, lte } from "drizzle-orm";
import {
  contracts,
  db,
  nocShifts,
  staffProfiles,
} from "../packages/db/src/index";

type StaffMap = {
  byName: Map<string, string>;
  byEmail: Map<string, string>;
  byEmployeeId: Map<string, string>;
};

type ParsedSheet = {
  workbookName: string;
  sheetName: string;
  rows: string[][];
};

type NocShiftRow = {
  staffId: string;
  shiftDate: string;
  shiftType: "12hr Day" | "12hr Night" | "Off" | "Annual Leave" | "Sick Leave";
  notes: string | null;
};

const SOURCE_ROOT = process.argv[2] ? path.resolve(process.argv[2]) : process.cwd();
const MONTH_FILE_PATTERN = /(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|noc|shift|schedule|\d{8})/i;
const CONTRACT_FILE_PATTERN = /contractenddates|contract end dates|contractdates/i;
const EXCEL_PATTERN = /\.(xlsx|xlsm|xls)$/i;
const MONTHS = new Map([
  ["jan", 1],
  ["feb", 2],
  ["mar", 3],
  ["apr", 4],
  ["may", 5],
  ["jun", 6],
  ["jul", 7],
  ["aug", 8],
  ["sep", 9],
  ["oct", 10],
  ["nov", 11],
  ["dec", 12],
]);

function normalizeKey(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

function normalizeName(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

function compactKey(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function rowHasData(row: string[]): boolean {
  return row.some((cell) => cell.trim().length > 0);
}

function cellToString(cell: ExcelJS.Cell): string {
  if (cell.value === null || cell.value === undefined) return "";
  if (typeof cell.value === "object" && "richText" in cell.value) {
    return (cell.value as ExcelJS.CellRichTextValue).richText.map((item) => item.text).join("");
  }
  if (typeof cell.value === "object" && "result" in cell.value) {
    const result = (cell.value as ExcelJS.CellFormulaValue).result;
    return result === null || result === undefined ? "" : String(result);
  }
  if (cell.value instanceof Date) {
    return cell.value.toISOString().slice(0, 10);
  }
  if (typeof cell.value === "object" && "text" in cell.value) {
    return String((cell.value as ExcelJS.CellHyperlinkValue).text);
  }
  if (typeof cell.value === "object" && "error" in cell.value) {
    return "";
  }
  return String(cell.value).trim();
}

async function walk(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const resolved = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walk(resolved)));
    } else {
      files.push(resolved);
    }
  }
  return files;
}

function parseYearMonthFromFilename(fileName: string): string | null {
  const numeric = fileName.match(/(\d{4})(\d{2})\d{2}/);
  if (numeric) {
    return `${numeric[1]}-${numeric[2]}`;
  }

  const monthMatch = fileName.match(/(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*[_-]?(\d{4})/i);
  if (monthMatch) {
    const monthNumber = MONTHS.get(monthMatch[1].slice(0, 3).toLowerCase());
    if (!monthNumber) return null;
    return `${monthMatch[2]}-${String(monthNumber).padStart(2, "0")}`;
  }

  return null;
}

function parseDate(value: string | number | null | undefined): string | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    const date = new Date(Date.UTC(1899, 11, 30 + value));
    return date.toISOString().slice(0, 10);
  }
  const text = String(value ?? "").trim();
  if (!text) return null;
  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return text;
  const parsed = new Date(text);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toISOString().slice(0, 10);
  }
  return null;
}

function parseShiftType(value: string): NocShiftRow["shiftType"] | null {
  const normalized = normalizeKey(value);
  if (!normalized) return null;
  if (normalized.includes("12hr day") || normalized === "day" || normalized === "d") return "12hr Day";
  if (normalized.includes("12hr night") || normalized === "night" || normalized === "n") return "12hr Night";
  if (normalized === "off" || normalized === "o") return "Off";
  if (normalized.includes("annual leave") || normalized === "al") return "Annual Leave";
  if (normalized.includes("sick leave") || normalized === "sl") return "Sick Leave";
  if (normalized.includes("day")) return "12hr Day";
  if (normalized.includes("night")) return "12hr Night";
  if (normalized.includes("leave") && normalized.includes("annual")) return "Annual Leave";
  if (normalized.includes("leave") && normalized.includes("sick")) return "Sick Leave";
  return null;
}

function buildId(...parts: string[]): string {
  return createHash("sha1").update(parts.join("|")).digest("hex").slice(0, 24);
}

function findHeaderRow(rows: string[][], tokens: string[]): number {
  let bestIndex = -1;
  let bestScore = 0;
  for (let index = 0; index < Math.min(rows.length, 12); index += 1) {
    const row = rows[index] ?? [];
    const score = row.reduce((sum, cell) => {
      const normalized = normalizeKey(cell);
      if (!normalized) return sum;
      return sum + (tokens.some((token) => normalized.includes(token)) ? 1 : 0);
    }, 0);
    if (score > bestScore && row.filter(Boolean).length >= 2) {
      bestIndex = index;
      bestScore = score;
    }
  }
  return bestIndex;
}

async function readWorkbook(filePath: string): Promise<ParsedSheet[]> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);
  return workbook.worksheets.map((sheet) => {
    const rows: string[][] = [];
    sheet.eachRow({ includeEmpty: true }, (row) => {
      const values: string[] = [];
      row.eachCell({ includeEmpty: true }, (cell) => {
        values.push(cellToString(cell));
      });
      rows.push(values);
    });
    return {
      workbookName: path.basename(filePath),
      sheetName: sheet.name,
      rows,
    };
  });
}

async function buildStaffMaps(): Promise<StaffMap> {
  const staff = await db.query.staffProfiles.findMany({
    with: { user: true },
  });

  const byName = new Map<string, string>();
  const byEmail = new Map<string, string>();
  const byEmployeeId = new Map<string, string>();

  for (const member of staff) {
    if (member.user?.name) byName.set(normalizeName(member.user.name), member.id);
    if (member.user?.email) byEmail.set(normalizeEmail(member.user.email), member.id);
    if (member.employeeId) byEmployeeId.set(normalizeKey(member.employeeId), member.id);
  }

  return { byName, byEmail, byEmployeeId };
}

function resolveStaffId(rawValue: string, staffMaps: StaffMap): string | null {
  const trimmed = rawValue.trim();
  if (!trimmed) return null;
  if (trimmed.includes("@")) {
    const byEmail = staffMaps.byEmail.get(normalizeEmail(trimmed));
    if (byEmail) return byEmail;
  }

  const byEmployeeId = staffMaps.byEmployeeId.get(normalizeKey(trimmed));
  if (byEmployeeId) return byEmployeeId;

  const byName = staffMaps.byName.get(normalizeName(trimmed));
  if (byName) return byName;

  return null;
}

async function parseNocShiftWorkbook(filePath: string, staffMaps: StaffMap): Promise<{ rows: NocShiftRow[]; monthKey: string | null }> {
  const sheets = await readWorkbook(filePath);
  const monthKey = parseYearMonthFromFilename(path.basename(filePath));
  const rows: NocShiftRow[] = [];

  for (const sheet of sheets) {
    const headerIndex = findHeaderRow(sheet.rows, ["day", "shift", "staff", "name"]);
    if (headerIndex === -1) continue;

    const headers = sheet.rows[headerIndex] ?? [];
    const dayColumns: Array<{ columnIndex: number; day: number }> = [];
    headers.forEach((cell, index) => {
      const numeric = Number.parseInt(cell.trim(), 10);
      if (Number.isInteger(numeric) && numeric >= 1 && numeric <= 31) {
        dayColumns.push({ columnIndex: index, day: numeric });
      }
    });

    if (dayColumns.length === 0) {
      for (let index = 1; index < headers.length; index += 1) {
        const match = headers[index]?.match(/^(\d{1,2})$/);
        if (match) {
          dayColumns.push({ columnIndex: index, day: Number(match[1]) });
        }
      }
    }

    if (dayColumns.length === 0 || !monthKey) continue;

    for (const row of sheet.rows.slice(headerIndex + 1)) {
      if (!rowHasData(row)) continue;
      const staffName = row[0]?.trim() ?? "";
      if (!staffName || /^(notes?|legend|totals?|shift code)/i.test(staffName)) continue;

      const staffId = resolveStaffId(staffName, staffMaps);
      if (!staffId) continue;

      for (const { columnIndex, day } of dayColumns) {
        const rawShift = row[columnIndex]?.trim() ?? "";
        if (!rawShift) continue;
        const shiftType = parseShiftType(rawShift);
        if (!shiftType) continue;
        rows.push({
          staffId,
          shiftDate: `${monthKey}-${String(day).padStart(2, "0")}`,
          shiftType,
          notes: null,
        });
      }
    }
  }

  return { rows, monthKey };
}

async function parseContractWorkbook(filePath: string, staffMaps: StaffMap): Promise<
  Array<{
    id: string;
    staffProfileId: string;
    contractType: string;
    startDate: string;
    endDate: string | null;
    appraisalPeriod: string | null;
    renewalStatus: string;
    status: "active" | "expiring_soon" | "expired" | "renewed" | "terminated";
    notes: string | null;
  }>
> {
  const sheets = await readWorkbook(filePath);
  const rows: Array<{
    id: string;
    staffProfileId: string;
    contractType: string;
    startDate: string;
    endDate: string | null;
    appraisalPeriod: string | null;
    renewalStatus: string;
    status: "active" | "expiring_soon" | "expired" | "renewed" | "terminated";
    notes: string | null;
  }> = [];

  for (const sheet of sheets) {
    const headerIndex = findHeaderRow(sheet.rows, [
      "name",
      "staff",
      "employee",
      "contract",
      "start",
      "end",
      "renewal",
      "appraisal",
    ]);
    if (headerIndex === -1) continue;

    const headers = sheet.rows[headerIndex] ?? [];
    const headerMap = new Map<string, number>();
    headers.forEach((cell, index) => {
      const normalized = normalizeKey(cell);
      if (normalized && !headerMap.has(normalized)) {
        headerMap.set(normalized, index);
      }
    });

    for (const row of sheet.rows.slice(headerIndex + 1)) {
      if (!rowHasData(row)) continue;
      const name =
        row[headerMap.get("name") ?? -1]?.trim() ||
        row[headerMap.get("staff name") ?? -1]?.trim() ||
        row[headerMap.get("employee name") ?? -1]?.trim() ||
        row[0]?.trim() ||
        "";
      if (!name || /^(notes?|legend|totals?)/i.test(name)) continue;

      const staffProfileId =
        resolveStaffId(name, staffMaps) ||
        resolveStaffId(row[headerMap.get("employee id") ?? -1] ?? "", staffMaps) ||
        resolveStaffId(row[headerMap.get("employee number") ?? -1] ?? "", staffMaps);
      if (!staffProfileId) continue;

      const contractType =
        row[headerMap.get("contract type") ?? -1]?.trim() ||
        row[headerMap.get("type") ?? -1]?.trim() ||
        "contract";
      const startDate =
        parseDate(row[headerMap.get("start date") ?? -1]) ||
        parseDate(row[headerMap.get("start") ?? -1]) ||
        new Date().toISOString().slice(0, 10);
      const endDate =
        parseDate(row[headerMap.get("end date") ?? -1]) ||
        parseDate(row[headerMap.get("end") ?? -1]) ||
        null;
      const appraisalPeriod =
        row[headerMap.get("appraisal period") ?? -1]?.trim() ||
        row[headerMap.get("period") ?? -1]?.trim() ||
        null;
      const renewalStatusRaw =
        row[headerMap.get("renewal status") ?? -1]?.trim() ||
        row[headerMap.get("status") ?? -1]?.trim() ||
        "";
      const renewalStatus =
        normalizeKey(renewalStatusRaw).replace(/\s+/g, "_") || "not_due";

      let status: "active" | "expiring_soon" | "expired" | "renewed" | "terminated" = "active";
      if (renewalStatus.includes("renew")) status = "renewed";
      else if (renewalStatus.includes("expire")) status = "expired";
      else if (renewalStatus.includes("soon") || renewalStatus.includes("due")) status = "expiring_soon";
      else if (renewalStatus.includes("term")) status = "terminated";

      const id = buildId(path.basename(filePath), sheet.sheetName, name, startDate, endDate ?? "", contractType);

      rows.push({
        id,
        staffProfileId,
        contractType,
        startDate,
        endDate,
        appraisalPeriod,
        renewalStatus,
        status,
        notes: row[headerMap.get("notes") ?? -1]?.trim() || null,
      });
    }
  }

  return rows;
}

async function findFiles(rootDir: string) {
  const files = await walk(rootDir);
  return files.filter((file) => EXCEL_PATTERN.test(file));
}

async function main() {
  const rootStat = await stat(SOURCE_ROOT);
  if (!rootStat.isDirectory()) {
    throw new Error(`Source root is not a directory: ${SOURCE_ROOT}`);
  }

  const staffMaps = await buildStaffMaps();
  const allFiles = await findFiles(SOURCE_ROOT);
  const nocFiles = allFiles.filter((file) => {
    const name = path.basename(file);
    const compact = compactKey(name);
    return (
      MONTH_FILE_PATTERN.test(name) &&
      !CONTRACT_FILE_PATTERN.test(name) &&
      (compact.includes("noc") || compact.includes("shift") || compact.includes("schedule") || /\d{8}/.test(name))
    );
  });
  const contractFiles = allFiles.filter((file) => {
    const compact = compactKey(path.basename(file));
    return CONTRACT_FILE_PATTERN.test(path.basename(file)) || compact.includes("contractenddates");
  });

  let insertedShifts = 0;
  let insertedContracts = 0;

  for (const filePath of nocFiles) {
    const { rows, monthKey } = await parseNocShiftWorkbook(filePath, staffMaps);
    if (!rows.length || !monthKey) {
      console.log(`Skipped ${path.basename(filePath)} (no parseable NOC grid).`);
      continue;
    }

    await db.delete(nocShifts).where(
      and(
        gte(nocShifts.shiftDate, `${monthKey}-01`),
        lte(nocShifts.shiftDate, `${monthKey}-31`),
      ),
    );

    const result = await db
      .insert(nocShifts)
      .values(rows)
      .onConflictDoNothing()
      .returning({ id: nocShifts.id });

    insertedShifts += result.length;
    console.log(`Imported ${result.length} NOC shift rows from ${path.basename(filePath)}.`);
  }

  for (const filePath of contractFiles) {
    const rows = await parseContractWorkbook(filePath, staffMaps);
    if (!rows.length) {
      console.log(`Skipped ${path.basename(filePath)} (no parseable contract rows).`);
      continue;
    }

    const result = await db
      .insert(contracts)
      .values(rows)
      .onConflictDoNothing()
      .returning({ id: contracts.id });

    insertedContracts += result.length;
    console.log(`Imported ${result.length} contract rows from ${path.basename(filePath)}.`);
  }

  console.log(
    JSON.stringify(
      {
        sourceRoot: SOURCE_ROOT,
        insertedShifts,
        insertedContracts,
        historicalCoverage: {
          nocShifts: "Historical NOC monthly shift grids from 2023-2026",
          contracts: "Historical contract end dates and renewal tracking from DCS/NOC workbooks",
        },
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
