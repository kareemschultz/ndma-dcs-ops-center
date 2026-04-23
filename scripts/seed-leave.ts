#!/usr/bin/env bun
/**
 * seed-leave.ts
 *
 * Imports historical leave workbook data into leave_types and leave_requests.
 * Source of truth: Shared-leave.zip / TimeOffSickDays_20251010_v01.xlsx
 *
 * Usage:
 *   bun --env-file=apps/server/.env scripts/seed-leave.ts [path-to-Shared-leave.zip|xlsx|directory]
 */

import path from "node:path";
import { readdir, stat } from "node:fs/promises";

import JSZip from "jszip";
import ExcelJS from "exceljs";
import { eq } from "drizzle-orm";
import {
  db,
  leaveRequests,
  leaveTypes,
  staffProfiles,
  user,
} from "@ndma-dcs-staff-portal/db";

type CanonicalLeaveType = {
  name: string;
  code: string;
  defaultAnnualAllowance: number;
  requiresApproval: boolean;
};

type DateRange = {
  startDate: string;
  endDate: string;
};

type ParsedRow = Record<string, unknown>;

const DEFAULT_SOURCE_ROOT =
  process.argv[2] ??
  "C:\\Users\\admin\\Documents\\karetech\\ndma-dcs-ops-center\\category-zips\\Shared-leave.zip";

const CANONICAL_LEAVE_TYPES: CanonicalLeaveType[] = [
  { name: "Annual Leave", code: "AL", defaultAnnualAllowance: 20, requiresApproval: true },
  { name: "Sick Leave", code: "SL", defaultAnnualAllowance: 10, requiresApproval: true },
  { name: "Maternity Leave", code: "ML", defaultAnnualAllowance: 90, requiresApproval: true },
  { name: "Study Leave", code: "STL", defaultAnnualAllowance: 20, requiresApproval: true },
  { name: "Emergency", code: "EM", defaultAnnualAllowance: 0, requiresApproval: true },
  { name: "No Pay", code: "NP", defaultAnnualAllowance: 0, requiresApproval: true },
  { name: "Special", code: "SP", defaultAnnualAllowance: 0, requiresApproval: true },
];

const MONTHS: Record<string, number> = {
  jan: 1,
  january: 1,
  feb: 2,
  february: 2,
  mar: 3,
  march: 3,
  apr: 4,
  april: 4,
  may: 5,
  jun: 6,
  june: 6,
  jul: 7,
  july: 7,
  aug: 8,
  august: 8,
  sep: 9,
  sept: 9,
  september: 9,
  oct: 10,
  october: 10,
  nov: 11,
  november: 11,
  dec: 12,
  december: 12,
};

const LEGACY_TYPE_ALIASES: Array<[RegExp, { name: string; note?: string }]> = [
  [/^annual(\s+leave)?$/i, { name: "Annual Leave" }],
  [/^time\s*off$/i, { name: "Annual Leave" }],
  [/^vacation$/i, { name: "Annual Leave" }],
  [/^sick$/i, { name: "Sick Leave" }],
  [/^sick\s*leave$/i, { name: "Sick Leave" }],
  [/^reported\s*sick$/i, { name: "Sick Leave" }],
  [/^medical$/i, { name: "Sick Leave" }],
  [/^absence?$|^absent$/i, { name: "No Pay", note: "(Legacy: Absent)" }],
  [/^no\s*pay$/i, { name: "No Pay" }],
  [/^unpaid(\s*leave)?$/i, { name: "No Pay" }],
  [/^lwop$/i, { name: "No Pay" }],
  [/^maternity(\s*leave)?$/i, { name: "Maternity Leave" }],
  [/^study(\s*leave)?$/i, { name: "Study Leave" }],
  [/^emergency(\s*leave)?$/i, { name: "Emergency" }],
  [/^special\s*leave$/i, { name: "Special" }],
  [/^special\s*allowance.*work\s*from\s*home$/i, { name: "Special", note: "(Legacy: Work From Home)" }],
  [/^work\s*from\s*home$/i, { name: "Special", note: "(Legacy: Work From Home)" }],
  [/^work\s*from\s*home\s*$/i, { name: "Special", note: "(Legacy: Work From Home)" }],
  [/^compassionate(\s+leave)?$/i, { name: "Special", note: "(Legacy: Compassionate)" }],
  [/^call\s*out$/i, { name: "" }],
];

const GUYANA_DATE_FORMATTER = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Guyana",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

function normalizeKey(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeName(value: string): string {
  return normalizeKey(value);
}

function normalizeText(value: unknown): string {
  if (value == null) return "";
  if (value instanceof Date) return formatGuyanaDate(value);
  return String(value).trim();
}

function formatGuyanaDate(date: Date): string {
  const parts = GUYANA_DATE_FORMATTER.formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value ?? "1970";
  const month = parts.find((part) => part.type === "month")?.value ?? "01";
  const day = parts.find((part) => part.type === "day")?.value ?? "01";
  return `${year}-${month}-${day}`;
}

function excelSerialToDate(serial: number): Date {
  const wholeDays = Math.floor(serial - 25569);
  const seconds = Math.round((serial - Math.floor(serial)) * 86_400);
  return new Date((wholeDays * 86_400 + seconds) * 1000);
}

function toIsoDate(value: unknown): string | null {
  if (value == null || value === "") return null;
  if (value instanceof Date) {
    return formatGuyanaDate(value);
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return formatGuyanaDate(excelSerialToDate(value));
  }
  const text = String(value).trim();
  if (!text) return null;

  const isoMatch = text.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/);
  if (isoMatch) {
    const [, yearText, monthText, dayText] = isoMatch;
    const year = Number(yearText);
    const month = Number(monthText);
    const day = Number(dayText);
    const date = new Date(Date.UTC(year, month - 1, day));
    return Number.isNaN(date.getTime()) ? null : formatGuyanaDate(date);
  }

  const parsed = new Date(text);
  if (!Number.isNaN(parsed.getTime())) {
    return formatGuyanaDate(parsed);
  }

  return null;
}

function toNumber(value: unknown): number | null {
  if (value == null || value === "") return null;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const parsed = Number(String(value).replace(/[^0-9.\-]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function daysInclusive(startDate: string, endDate: string): number {
  const start = new Date(`${startDate}T00:00:00.000Z`);
  const end = new Date(`${endDate}T00:00:00.000Z`);
  const diff = Math.round((end.getTime() - start.getTime()) / 86_400_000);
  return Math.max(1, diff + 1);
}

function appendNote(reason: string | null, note: string | null): string | null {
  const base = (reason ?? "").trim();
  const extra = (note ?? "").trim();
  if (!base && !extra) return null;
  if (!extra) return base || null;
  if (!base) return extra;
  return `${base} ${extra}`;
}

function shouldSkipType(type: string): boolean {
  return /^call\s*out$/i.test(type);
}

function mapLeaveType(rawType: unknown): { name: string; note: string | null } | null {
  const value = normalizeText(rawType);
  if (!value) return null;

  for (const [pattern, mapped] of LEGACY_TYPE_ALIASES) {
    if (pattern.test(value)) {
      if (!mapped.name) return null;
      return { name: mapped.name, note: mapped.note ?? null };
    }
  }

  const lower = value.toLowerCase();
  if (lower.includes("emergency")) return { name: "Emergency", note: null };
  if (lower.includes("special")) {
    return {
      name: "Special",
      note: lower.includes("compassionate")
        ? "(Legacy: Compassionate)"
        : lower.includes("work from home")
          ? "(Legacy: Work From Home)"
          : null,
    };
  }
  if (lower.includes("no pay") || lower.includes("unpaid") || lower.includes("lwop")) {
    return { name: "No Pay", note: null };
  }
  if (lower.includes("study")) return { name: "Study Leave", note: null };
  if (lower.includes("maternity")) return { name: "Maternity Leave", note: null };
  if (lower.includes("sick") || lower.includes("medical")) return { name: "Sick Leave", note: null };
  if (lower.includes("time off") || lower.includes("annual") || lower.includes("vacation")) {
    return { name: "Annual Leave", note: null };
  }
  if (lower.includes("compassionate")) {
    return { name: "Special", note: "(Legacy: Compassionate)" };
  }
  if (lower.includes("work from home")) {
    return { name: "Special", note: "(Legacy: Work From Home)" };
  }
  if (lower.includes("absent")) {
    return { name: "No Pay", note: "(Legacy: Absent)" };
  }

  return null;
}

function normalizeCellHeader(value: unknown): string {
  return normalizeKey(normalizeText(value));
}

async function readWorkbookFromSource(sourcePath: string): Promise<ExcelJS.Workbook> {
  const workbook = new ExcelJS.Workbook();
  const sourceStat = await stat(sourcePath);

  if (sourceStat.isDirectory()) {
    const entries = await readdir(sourcePath, { withFileTypes: true });
    const workbookPath = entries
      .filter((entry) => entry.isFile())
      .map((entry) => path.join(sourcePath, entry.name))
      .find((candidate) => candidate.toLowerCase().endsWith(".xlsx"));

    if (!workbookPath) {
      throw new Error(`No workbook found in directory: ${sourcePath}`);
    }

    await workbook.xlsx.readFile(workbookPath);
    return workbook;
  }

  if (sourcePath.toLowerCase().endsWith(".xlsx")) {
    const buffer = await Bun.file(sourcePath).arrayBuffer();
    await workbook.xlsx.load(Buffer.from(buffer));
    return workbook;
  }

  if (!sourcePath.toLowerCase().endsWith(".zip")) {
    throw new Error(`Unsupported source path: ${sourcePath}`);
  }

  const archive = await JSZip.loadAsync(await Bun.file(sourcePath).arrayBuffer());
  const workbookEntry = Object.values(archive.files).find(
    (entry) => !entry.dir && entry.name.toLowerCase().endsWith(".xlsx"),
  );

  if (!workbookEntry) {
    throw new Error(`No workbook found inside archive: ${sourcePath}`);
  }

  const workbookBuffer = await workbookEntry.async("uint8array");
  await workbook.xlsx.load(Buffer.from(workbookBuffer));
  return workbook;
}

async function loadStaffMaps(): Promise<{
  byName: Map<string, string>;
  byFirstName: Map<string, string>;
}> {
  const rows = await db
    .select({
      id: staffProfiles.id,
      name: user.name,
    })
    .from(staffProfiles)
    .innerJoin(user, eq(staffProfiles.userId, user.id));

  const byName = new Map<string, string>();
  const byFirstName = new Map<string, string>();

  for (const row of rows) {
    if (!row.name) continue;
    const normalized = normalizeName(row.name);
    if (!byName.has(normalized)) byName.set(normalized, row.id);
    const firstName = normalized.split(" ")[0];
    if (firstName && !byFirstName.has(firstName)) {
      byFirstName.set(firstName, row.id);
    }
  }

  return { byName, byFirstName };
}

async function ensureCanonicalLeaveTypes(): Promise<Map<string, string>> {
  const existing = await db.select().from(leaveTypes);
  const byCode = new Map(existing.map((row) => [row.code.toLowerCase(), row]));
  const byName = new Map(existing.map((row) => [row.name.toLowerCase(), row]));
  const resolved = new Map<string, string>();

  for (const type of CANONICAL_LEAVE_TYPES) {
    let row = byCode.get(type.code.toLowerCase()) ?? byName.get(type.name.toLowerCase());

    if (row) {
      if (
        row.name !== type.name ||
        row.code !== type.code ||
        row.defaultAnnualAllowance !== type.defaultAnnualAllowance ||
        row.requiresApproval !== type.requiresApproval ||
        !row.isActive
      ) {
        await db
          .update(leaveTypes)
          .set({
            name: type.name,
            code: type.code,
            defaultAnnualAllowance: type.defaultAnnualAllowance,
            requiresApproval: type.requiresApproval,
            isActive: true,
          })
          .where(eq(leaveTypes.id, row.id));
        row = { ...row, ...type, isActive: true };
      }
    } else {
      const [inserted] = await db
        .insert(leaveTypes)
        .values({
          id: crypto.randomUUID(),
          name: type.name,
          code: type.code,
          defaultAnnualAllowance: type.defaultAnnualAllowance,
          requiresApproval: type.requiresApproval,
          isActive: true,
        })
        .returning();

      if (!inserted) {
        throw new Error(`Failed to insert leave type "${type.name}"`);
      }
      row = inserted;
    }

    resolved.set(type.name, row.id);
    byCode.set(type.code.toLowerCase(), row);
    byName.set(type.name.toLowerCase(), row);
  }

  for (const legacy of existing) {
    if (legacy.name.toLowerCase().includes("compassionate") && legacy.isActive) {
      await db
        .update(leaveTypes)
        .set({ isActive: false })
        .where(eq(leaveTypes.id, legacy.id));
    }
  }

  return resolved;
}

async function loadExistingKeys(): Promise<Set<string>> {
  const rows = await db
    .select({
      staffProfileId: leaveRequests.staffProfileId,
      leaveTypeId: leaveRequests.leaveTypeId,
      startDate: leaveRequests.startDate,
      endDate: leaveRequests.endDate,
      totalDays: leaveRequests.totalDays,
      reason: leaveRequests.reason,
    })
    .from(leaveRequests);

  return new Set(
    rows.map((row) =>
      [
        row.staffProfileId,
        row.leaveTypeId,
        row.startDate,
        row.endDate,
        row.totalDays,
        row.reason ?? "",
      ].join("|"),
    ),
  );
}

function resolveStaffId(
  row: ParsedRow,
  staffMaps: { byName: Map<string, string>; byFirstName: Map<string, string> },
): string | null {
  const rawName = normalizeText(
    row.staff ?? row.staffName ?? row.name ?? row["Name"] ?? row["Staff Name"],
  );
  if (!rawName) return null;

  const normalized = normalizeName(rawName);
  if (staffMaps.byName.has(normalized)) {
    return staffMaps.byName.get(normalized)!;
  }

  const firstName = normalized.split(" ")[0];
  if (firstName && staffMaps.byFirstName.has(firstName)) {
    return staffMaps.byFirstName.get(firstName)!;
  }

  for (const [name, id] of staffMaps.byName.entries()) {
    if (name.includes(normalized) || normalized.includes(name)) {
      return id;
    }
  }

  return null;
}

function parseSheetRows(worksheet: ExcelJS.Worksheet): ParsedRow[] {
  const headerRow = worksheet.getRow(1);
  const headers = new Map<number, string>();

  headerRow.eachCell({ includeEmpty: false }, (cell, columnNumber) => {
    const header = normalizeCellHeader(cell.value);
    if (header) {
      headers.set(columnNumber, header);
    }
  });

  const rows: ParsedRow[] = [];

  for (let rowNumber = 2; rowNumber <= worksheet.rowCount; rowNumber += 1) {
    const row = worksheet.getRow(rowNumber);
    const values: ParsedRow = {};
    let hasAnyValue = false;

    headers.forEach((header, columnNumber) => {
      const cellValue = row.getCell(columnNumber).value;
      if (cellValue !== null && cellValue !== undefined && cellValue !== "") {
        hasAnyValue = true;
      }
      values[header] = cellValue as unknown;
    });

    if (hasAnyValue) {
      rows.push(values);
    }
  }

  return rows;
}

function buildDateRange(row: ParsedRow): DateRange | null {
  const dateValue = row.date ?? row["date"];
  const startDate = toIsoDate(dateValue);
  if (!startDate) return null;

  const endValue = row.end ?? row["end"] ?? dateValue;
  const endDate = toIsoDate(endValue) ?? startDate;
  return { startDate, endDate };
}

function buildTotalDays(row: ParsedRow, range: DateRange): number {
  const daysValue = toNumber(row.days ?? row["days"] ?? row["number of days"]);
  if (daysValue && daysValue > 0) {
    return Math.max(1, Math.round(daysValue));
  }

  const hoursValue = toNumber(row.hours ?? row["hours"]);
  if (hoursValue && hoursValue > 0) {
    return Math.max(1, Math.ceil(hoursValue / 8));
  }

  return daysInclusive(range.startDate, range.endDate);
}

async function importWorkbook(sourcePath: string): Promise<void> {
  const workbook = await readWorkbookFromSource(sourcePath);
  const staffMaps = await loadStaffMaps();
  const leaveTypeIds = await ensureCanonicalLeaveTypes();
  const existingKeys = await loadExistingKeys();

  const targetSheets = workbook.worksheets.filter((worksheet) => /tosd/i.test(worksheet.name));
  if (targetSheets.length === 0) {
    throw new Error("No TOSD sheets found in the shared leave workbook.");
  }

  let inserted = 0;
  let skipped = 0;
  let staffNotFound = 0;

  for (const worksheet of targetSheets) {
    const rows = parseSheetRows(worksheet);
    console.log(`Parsing sheet ${worksheet.name} (${rows.length} data rows)`);

    for (const row of rows) {
      const staffId = resolveStaffId(row, staffMaps);
      if (!staffId) {
        staffNotFound += 1;
        continue;
      }

      const typeValue =
        row.type ??
        row.leaveType ??
        row.category ??
        row["Type"] ??
        row["Leave Type"];

      const mappedType = mapLeaveType(typeValue);
      if (!mappedType) {
        skipped += 1;
        continue;
      }

      if (shouldSkipType(normalizeText(typeValue))) {
        skipped += 1;
        continue;
      }

      const leaveTypeId = leaveTypeIds.get(mappedType.name);
      if (!leaveTypeId) {
        skipped += 1;
        continue;
      }

      const range = buildDateRange(row);
      if (!range) {
        skipped += 1;
        continue;
      }

      const totalDays = buildTotalDays(row, range);
      const reason = appendNote(
        normalizeText(row.reason ?? row.notes ?? row.comment ?? row.comments),
        mappedType.note,
      );

      const key = [
        staffId,
        leaveTypeId,
        range.startDate,
        range.endDate,
        totalDays,
        reason ?? "",
      ].join("|");

      if (existingKeys.has(key)) {
        skipped += 1;
        continue;
      }

      await db.insert(leaveRequests).values({
        staffProfileId: staffId,
        leaveTypeId,
        startDate: range.startDate,
        endDate: range.endDate,
        totalDays,
        reason,
        status: "approved",
        approvedAt: new Date(),
        approvedById: null,
        overlapOverride: false,
      });

      existingKeys.add(key);
      inserted += 1;
    }
  }

  console.log(`Inserted ${inserted} leave requests.`);
  console.log(`Skipped ${skipped} rows.`);
  console.log(`Could not resolve staff for ${staffNotFound} rows.`);
}

async function main(): Promise<void> {
  const sourcePath = path.resolve(DEFAULT_SOURCE_ROOT);
  const sourceStat = await stat(sourcePath);
  if (!sourceStat.isFile() && !sourceStat.isDirectory()) {
    throw new Error(`Source path does not exist: ${sourcePath}`);
  }

  console.log(`Using leave source: ${sourcePath}`);
  await importWorkbook(sourcePath);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
