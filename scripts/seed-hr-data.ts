#!/usr/bin/env bun
/**
 * seed-hr-data.ts
 *
 * Scans DCS/ and NOC/ for roster, contract, and PPE workbooks and maps them
 * into the HR scheduling tables.
 *
 * Usage:
 *   bun --env-file=apps/server/.env scripts/seed-hr-data.ts <root-dir>
 */

import ExcelJS from "exceljs";
import path from "node:path";
import { readdir } from "node:fs/promises";

import {
  contracts,
  db,
  onCallAssignments,
  onCallSchedules,
  ppeRecords,
  staffProfiles,
  user,
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

const SOURCE_ROOT = process.argv[2]
  ? path.resolve(process.argv[2])
  : "C:\\Users\\admin\\Documents\\karetech\\ndma-dcs-ops-center\\category-zips";

function compactKey(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function normalizeKey(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

function rowHasData(row: string[]) {
  return row.some((cell) => cell.trim().length > 0);
}

function cellToString(cell: ExcelJS.Cell): string {
  if (cell.value == null) return "";
  if (typeof cell.value === "object" && "richText" in cell.value) {
    return (cell.value as ExcelJS.CellRichTextValue).richText.map((part) => part.text).join("");
  }
  if (typeof cell.value === "object" && "result" in cell.value) {
    const result = (cell.value as ExcelJS.CellFormulaValue).result;
    return result == null ? "" : String(result);
  }
  if (cell.value instanceof Date) return cell.value.toISOString().slice(0, 10);
  if (typeof cell.value === "object" && "text" in cell.value) {
    return String((cell.value as ExcelJS.CellHyperlinkValue).text);
  }
  return String(cell.value).trim();
}

function parseIsoDate(value: unknown): string | null {
  if (value == null || value === "") return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "number" && Number.isFinite(value)) {
    const date = new Date(Date.UTC(1899, 11, 30 + value));
    return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
  }
  const text = String(value).trim();
  const match = text.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/);
  if (match) {
    const [, year, month, day] = match;
    return new Date(Date.UTC(Number(year), Number(month) - 1, Number(day))).toISOString().slice(0, 10);
  }
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10);
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

async function readWorkbook(filePath: string): Promise<ParsedSheet[]> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);
  return workbook.worksheets.map((sheet) => {
    const rows: string[][] = [];
    sheet.eachRow({ includeEmpty: true }, (row) => {
      const values: string[] = [];
      row.eachCell({ includeEmpty: true }, (cell) => values.push(cellToString(cell)));
      rows.push(values);
    });
    return { workbookName: path.basename(filePath), sheetName: sheet.name, rows };
  });
}

async function buildStaffMaps(): Promise<StaffMap> {
  const staff = await db.query.staffProfiles.findMany({ with: { user: true } });
  const byName = new Map<string, string>();
  const byEmail = new Map<string, string>();
  const byEmployeeId = new Map<string, string>();

  for (const member of staff) {
    if (member.user?.name) byName.set(normalizeKey(member.user.name), member.id);
    if (member.user?.email) byEmail.set(normalizeKey(member.user.email), member.id);
    if (member.employeeId) byEmployeeId.set(normalizeKey(member.employeeId), member.id);
  }

  return { byName, byEmail, byEmployeeId };
}

function findStaffId(row: string[], maps: StaffMap): string | null {
  for (const cell of row) {
    const key = normalizeKey(cell);
    if (!key) continue;
    if (maps.byName.has(key)) return maps.byName.get(key) ?? null;
    if (maps.byEmail.has(key)) return maps.byEmail.get(key) ?? null;
    if (maps.byEmployeeId.has(key)) return maps.byEmployeeId.get(key) ?? null;
  }
  return null;
}

function findHeaderRow(rows: string[][], tokens: string[]): number {
  let bestIndex = -1;
  let bestScore = 0;
  for (let index = 0; index < Math.min(rows.length, 12); index += 1) {
    const row = rows[index] ?? [];
    const score = row.reduce((sum, cell) => {
      const normalized = normalizeKey(cell);
      return sum + (tokens.some((token) => normalized.includes(token)) ? 1 : 0);
    }, 0);
    if (score > bestScore && row.filter(Boolean).length >= 2) {
      bestIndex = index;
      bestScore = score;
    }
  }
  return bestIndex;
}

async function seedOnCallRoster(sheets: ParsedSheet[], staffMaps: StaffMap) {
  const roleColumns = [
    { key: "lead_engineer", aliases: ["lead engineer", "lead", "duty lead", "primary"] },
    { key: "asn_support", aliases: ["asn", "asn support", "asn engineer"] },
    { key: "core_support", aliases: ["core", "core support", "routing"] },
    { key: "enterprise_support", aliases: ["enterprise", "enterprise support"] },
  ] as const;

  for (const sheet of sheets) {
    const headerIndex = findHeaderRow(sheet.rows, ["week", "start", "lead", "asn", "core", "enterprise"]);
    if (headerIndex < 0) continue;
    const header = sheet.rows[headerIndex] ?? [];
    const lowerHeader = header.map((cell) => normalizeKey(cell));
    const weekStartColumn = lowerHeader.findIndex((cell) => cell.includes("week") || cell.includes("start"));
    const weekStartFallback = sheet.workbookName.match(/(\d{4})[-_]?(\d{2})[-_]?(\d{2})/)?.[0];

    for (const row of sheet.rows.slice(headerIndex + 1)) {
      if (!rowHasData(row)) continue;
      const weekStart = parseIsoDate(row[weekStartColumn] ?? "") ?? parseIsoDate(weekStartFallback ?? "") ?? null;
      if (!weekStart) continue;

      const weekEnd = new Date(`${weekStart}T00:00:00Z`);
      weekEnd.setUTCDate(weekEnd.getUTCDate() + 6);
      const weekEndIso = weekEnd.toISOString().slice(0, 10);

      const [schedule] = await db
        .insert(onCallSchedules)
        .values({
          weekStart,
          weekEnd: weekEndIso,
          status: "published",
          notes: `${sheet.workbookName} :: ${sheet.sheetName}`,
          hasConflicts: false,
          isLegacyImport: true,
        })
        .onConflictDoUpdate({
          target: onCallSchedules.weekStart,
          set: {
            weekEnd: weekEndIso,
            status: "published",
            notes: `${sheet.workbookName} :: ${sheet.sheetName}`,
            hasConflicts: false,
            isLegacyImport: true,
            updatedAt: new Date(),
          },
        })
        .returning();

      if (!schedule) continue;

      for (const role of roleColumns) {
        const roleIndex = lowerHeader.findIndex((cell) => role.aliases.some((alias) => cell.includes(alias)));
        if (roleIndex < 0) continue;
        const staffName = row[roleIndex] ?? "";
        if (!staffName.trim()) continue;
        const staffId = findStaffId([staffName], staffMaps);
        if (!staffId) continue;
        await db
          .insert(onCallAssignments)
          .values({
            scheduleId: schedule.id,
            staffProfileId: staffId,
            role: role.key,
            conflictFlags: [],
            isConfirmed: true,
            isLegacyImport: true,
          })
          .onConflictDoNothing();
      }
    }
  }
}

async function seedPpeAndContracts(sheets: ParsedSheet[], staffMaps: StaffMap) {
  for (const sheet of sheets) {
    const headerIndex = findHeaderRow(sheet.rows, ["staff", "employee", "item", "contract", "date"]);
    if (headerIndex < 0) continue;
    const header = sheet.rows[headerIndex] ?? [];
    const lowerHeader = header.map((cell) => normalizeKey(cell));

    for (const row of sheet.rows.slice(headerIndex + 1)) {
      if (!rowHasData(row)) continue;
      const staffId = findStaffId(row, staffMaps);
      if (!staffId) continue;

      if (lowerHeader.some((cell) => cell.includes("item") || cell.includes("ppe"))) {
        const itemIndex = lowerHeader.findIndex((cell) => cell.includes("item"));
        const dateIndex = lowerHeader.findIndex((cell) => cell.includes("date"));
        const conditionIndex = lowerHeader.findIndex((cell) => cell.includes("condition"));
        const itemName = row[itemIndex] ?? "PPE";
        await db.insert(ppeRecords).values({
          staffProfileId: staffId,
          itemName,
          issuedDate: parseIsoDate(row[dateIndex] ?? undefined),
          expiryDate: null,
          size: null,
          condition: row[conditionIndex] || "good",
        }).onConflictDoNothing();
      }

      if (lowerHeader.some((cell) => cell.includes("contract"))) {
        const startIndex = lowerHeader.findIndex((cell) => cell.includes("start"));
        const endIndex = lowerHeader.findIndex((cell) => cell.includes("end"));
        const statusIndex = lowerHeader.findIndex((cell) => cell.includes("renewal"));
        const appraisalIndex = lowerHeader.findIndex((cell) => cell.includes("appraisal"));
        const contractTypeIndex = lowerHeader.findIndex((cell) => cell.includes("type"));
        const startDate = parseIsoDate(row[startIndex] ?? undefined);
        const endDate = parseIsoDate(row[endIndex] ?? undefined);
        if (!startDate) continue;
        await db.insert(contracts).values({
          staffProfileId: staffId,
          contractType: row[contractTypeIndex] || "permanent",
          startDate,
          endDate,
          appraisalPeriod: row[appraisalIndex] || null,
          renewalReminderDays: 60,
          renewalStatus: row[statusIndex] || "not_due",
          status: endDate ? (new Date(endDate).getTime() < Date.now() ? "expired" : "active") : "active",
          documentUrl: null,
          notes: `${sheet.workbookName} :: ${sheet.sheetName}`,
        }).onConflictDoNothing();
      }
    }
  }
}

async function main() {
  const files = (await walk(SOURCE_ROOT)).filter((file) => /\.(xlsx|xlsm|xls)$/i.test(file));
  const staffMaps = await buildStaffMaps();
  const rosterFiles = files.filter((file) => {
    const compact = compactKey(path.basename(file));
    return (
      compact.includes("plannedoncallroster") ||
      compact.includes("oncall") ||
      compact.includes("roster") ||
      compact.includes("rota")
    );
  });
  const ppeContractFiles = files.filter((file) => {
    const compact = compactKey(path.basename(file));
    return (
      compact.includes("ppeindividualtools") ||
      compact.includes("contractenddates") ||
      compact.includes("contractenddate") ||
      compact.includes("contractdates") ||
      compact.includes("ppe")
    );
  });

  for (const file of rosterFiles) {
    const sheets = await readWorkbook(file);
    await seedOnCallRoster(sheets, staffMaps);
  }

  for (const file of ppeContractFiles) {
    const sheets = await readWorkbook(file);
    await seedPpeAndContracts(sheets, staffMaps);
  }

  console.log(
    JSON.stringify({
      sourceRoot: SOURCE_ROOT,
      rosterFiles: rosterFiles.length,
      ppeContractFiles: ppeContractFiles.length,
      rosterPatterns: ["plannedoncallroster", "oncall", "roster", "rota"],
      ppeContractPatterns: [
        "ppeindividualtools",
        "contractenddates",
        "contractenddate",
        "contractdates",
        "ppe",
      ],
    }, null, 2),
  );
}

await main();
