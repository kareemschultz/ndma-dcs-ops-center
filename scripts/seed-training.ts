#!/usr/bin/env bun
/**
 * seed-training.ts
 *
 * Parses historical training logs, syllabi, and future schedules into the
 * training tables.
 *
 * Usage:
 *   bun --env-file=apps/server/.env scripts/seed-training.ts <root-dir>
 */

import ExcelJS from "exceljs";
import path from "node:path";
import { readdir } from "node:fs/promises";

import { and, eq } from "drizzle-orm";
import {
  db,
  staffProfiles,
  staffTrainingRecords,
  trainingCourses,
  trainingMaterials,
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

const FILE_PATTERNS = [
  /TrainingLog_20260211_v01/i,
  /DCS-NOC-GOALCiscoCourses_20230817_v01/i,
  /HuaweiCertificate2023Participants_20231120_v01/i,
  /NOCTrainingProgramSyllabus_20250209_v01/i,
  /TrainingSchedule2026_2027/i,
];

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

function mapTrainingStatus(value: unknown): "Enrolled" | "In Progress" | "Completed" | "Failed" {
  const normalized = normalizeKey(String(value ?? ""));
  if (normalized.includes("progress")) return "In Progress";
  if (normalized.includes("complete") || normalized.includes("pass")) return "Completed";
  if (normalized.includes("fail")) return "Failed";
  return "Enrolled";
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

async function ensureCourse(
  title: string,
  vendor: string,
  courseType: "Certification" | "Syllabus" | "Internship",
) {
  const existing = await db.query.trainingCourses.findFirst({
    where: and(eq(trainingCourses.title, title), eq(trainingCourses.vendor, vendor)),
  });
  if (existing) return existing;

  const [created] = await db
    .insert(trainingCourses)
    .values({ title, vendor, courseType })
    .returning();
  return created ?? existing ?? null;
}

async function processTrainingLog(sheet: ParsedSheet, staffMaps: StaffMap) {
  const headerIndex = findHeaderRow(sheet.rows, ["staff", "course", "status", "target", "completion"]);
  if (headerIndex < 0) return;
  const header = sheet.rows[headerIndex] ?? [];
  const lowerHeader = header.map((cell) => normalizeKey(cell));

  const staffIndex = lowerHeader.findIndex((cell) => cell.includes("staff"));
  const courseIndex = lowerHeader.findIndex((cell) => cell.includes("course") || cell.includes("training"));
  const statusIndex = lowerHeader.findIndex((cell) => cell.includes("status"));
  const startIndex = lowerHeader.findIndex((cell) => cell.includes("start"));
  const completionIndex = lowerHeader.findIndex((cell) => cell.includes("completion") || cell.includes("completed"));
  const targetIndex = lowerHeader.findIndex((cell) => cell.includes("target"));
  const vendorIndex = lowerHeader.findIndex((cell) => cell.includes("vendor") || cell.includes("provider"));

  for (const row of sheet.rows.slice(headerIndex + 1)) {
    if (!rowHasData(row)) continue;
    const staffId = findStaffId([row[staffIndex] ?? ""], staffMaps);
    if (!staffId) continue;

    const title = row[courseIndex] || sheet.sheetName;
    const vendor = row[vendorIndex] || "Internal";
    const course = await ensureCourse(title, vendor, "Certification");
    if (!course) continue;

    const existing = await db.query.staffTrainingRecords.findFirst({
      where: and(eq(staffTrainingRecords.staffId, staffId), eq(staffTrainingRecords.courseId, course.id)),
    });
    if (existing) continue;

    await db.insert(staffTrainingRecords).values({
      staffId,
      courseId: course.id,
      status: mapTrainingStatus(row[statusIndex]),
      startDate: parseIsoDate(row[startIndex] ?? undefined),
      completionDate: parseIsoDate(row[completionIndex] ?? undefined),
      targetDate: parseIsoDate(row[targetIndex] ?? undefined),
      notes: `${sheet.workbookName} :: ${sheet.sheetName}`,
    });
  }
}

async function processCourseCatalogue(sheet: ParsedSheet, vendor: string) {
  const headerIndex = findHeaderRow(sheet.rows, ["course", "vendor", "status", "participant"]);
  if (headerIndex < 0) return;
  const header = sheet.rows[headerIndex] ?? [];
  const lowerHeader = header.map((cell) => normalizeKey(cell));
  const courseIndex = lowerHeader.findIndex((cell) => cell.includes("course") || cell.includes("title"));
  const participantIndex = lowerHeader.findIndex((cell) => cell.includes("participant") || cell.includes("staff"));
  const statusIndex = lowerHeader.findIndex((cell) => cell.includes("status"));
  const dateIndex = lowerHeader.findIndex((cell) => cell.includes("date"));

  const staffMaps = await buildStaffMaps();

  for (const row of sheet.rows.slice(headerIndex + 1)) {
    if (!rowHasData(row)) continue;
    const title = row[courseIndex] || sheet.sheetName;
    const course = await ensureCourse(title, vendor, "Certification");
    if (!course) continue;

    const staffId = findStaffId([row[participantIndex] ?? ""], staffMaps);
    if (!staffId) continue;

    const existing = await db.query.staffTrainingRecords.findFirst({
      where: and(eq(staffTrainingRecords.staffId, staffId), eq(staffTrainingRecords.courseId, course.id)),
    });
    if (existing) continue;

    await db.insert(staffTrainingRecords).values({
      staffId,
      courseId: course.id,
      status: mapTrainingStatus(row[statusIndex] || "Completed"),
      startDate: parseIsoDate(row[dateIndex] ?? undefined),
      completionDate: parseIsoDate(row[dateIndex] ?? undefined),
      targetDate: parseIsoDate(row[dateIndex] ?? undefined),
      notes: `${sheet.workbookName} :: ${sheet.sheetName}`,
    });
  }
}

async function processSyllabusWorkbook(sheet: ParsedSheet) {
  if (/program/i.test(sheet.sheetName)) {
    const headerIndex = findHeaderRow(sheet.rows, ["course", "title", "vendor", "type"]);
    if (headerIndex >= 0) {
      const header = sheet.rows[headerIndex] ?? [];
      const lowerHeader = header.map((cell) => normalizeKey(cell));
      const courseIndex = lowerHeader.findIndex((cell) => cell.includes("course") || cell.includes("title"));
      const vendorIndex = lowerHeader.findIndex((cell) => cell.includes("vendor"));
      const typeIndex = lowerHeader.findIndex((cell) => cell.includes("type"));
      for (const row of sheet.rows.slice(headerIndex + 1)) {
        if (!rowHasData(row)) continue;
        const title = row[courseIndex] || sheet.sheetName;
        const vendor = row[vendorIndex] || "Internal";
        const courseType = (row[typeIndex] || "Syllabus") as "Certification" | "Syllabus" | "Internship";
        await ensureCourse(title, vendor, courseType);
      }
    }
    return;
  }

  if (/recommendedbooks/i.test(sheet.sheetName) || /checklist/i.test(sheet.sheetName)) {
    const headerIndex = findHeaderRow(sheet.rows, ["course", "title", "reference", "link"]);
    if (headerIndex < 0) return;
    const header = sheet.rows[headerIndex] ?? [];
    const lowerHeader = header.map((cell) => normalizeKey(cell));
    const titleIndex = lowerHeader.findIndex((cell) => cell.includes("title") || cell.includes("book") || cell.includes("item"));
    const courseIndex = lowerHeader.findIndex((cell) => cell.includes("course"));
    const referenceIndex = lowerHeader.findIndex((cell) => cell.includes("link") || cell.includes("reference"));

    for (const row of sheet.rows.slice(headerIndex + 1)) {
      if (!rowHasData(row)) continue;
      const course = await ensureCourse(row[courseIndex] || sheet.sheetName, "Internal", "Syllabus");
      if (!course) continue;
      const materialType = /checklist/i.test(sheet.sheetName) ? "Checklist" : "Book";
      const existing = await db.query.trainingMaterials.findFirst({
        where: and(eq(trainingMaterials.courseId, course.id), eq(trainingMaterials.title, row[titleIndex] || "Material")),
      });
      if (existing) continue;
      await db.insert(trainingMaterials).values({
        courseId: course.id,
        materialType: materialType as any,
        title: row[titleIndex] || sheet.sheetName,
        referenceLink: row[referenceIndex] || null,
      });
    }
  }
}

async function processScheduleWorkbook(sheet: ParsedSheet) {
  const staffMaps = await buildStaffMaps();
  const headerIndex = findHeaderRow(sheet.rows, ["staff", "course", "date", "target"]);
  if (headerIndex < 0) return;
  const header = sheet.rows[headerIndex] ?? [];
  const lowerHeader = header.map((cell) => normalizeKey(cell));
  const staffIndex = lowerHeader.findIndex((cell) => cell.includes("staff") || cell.includes("participant"));
  const courseIndex = lowerHeader.findIndex((cell) => cell.includes("course") || cell.includes("training"));
  const statusIndex = lowerHeader.findIndex((cell) => cell.includes("status"));
  const dateIndex = lowerHeader.findIndex((cell) => cell.includes("date") || cell.includes("target"));

  for (const row of sheet.rows.slice(headerIndex + 1)) {
    if (!rowHasData(row)) continue;
    const staffId = findStaffId([row[staffIndex] ?? ""], staffMaps);
    if (!staffId) continue;
    const course = await ensureCourse(row[courseIndex] || sheet.sheetName, "Internal", "Certification");
    if (!course) continue;
    const existing = await db.query.staffTrainingRecords.findFirst({
      where: and(eq(staffTrainingRecords.staffId, staffId), eq(staffTrainingRecords.courseId, course.id)),
    });
    if (existing) continue;
    await db.insert(staffTrainingRecords).values({
      staffId,
      courseId: course.id,
      status: mapTrainingStatus(row[statusIndex]),
      startDate: parseIsoDate(row[dateIndex] ?? undefined),
      completionDate: null,
      targetDate: parseIsoDate(row[dateIndex] ?? undefined),
      notes: `${sheet.workbookName} :: ${sheet.sheetName}`,
    });
  }
}

async function main() {
  const files = (await walk(SOURCE_ROOT)).filter((file) =>
    FILE_PATTERNS.some((pattern) => pattern.test(path.basename(file))),
  );
  const staffMaps = await buildStaffMaps();

  for (const file of files) {
    const sheets = await readWorkbook(file);
    for (const sheet of sheets) {
      if (/traininglog/i.test(file)) {
        await processTrainingLog(sheet, staffMaps);
      } else if (/DCS-NOC-GOALCiscoCourses/i.test(file)) {
        await processCourseCatalogue(sheet, "Cisco");
      } else if (/HuaweiCertificate2023Participants/i.test(file)) {
        await processCourseCatalogue(sheet, "Huawei");
      } else if (/NOCTrainingProgramSyllabus/i.test(file)) {
        await processSyllabusWorkbook(sheet);
      } else if (/TrainingSchedule2026_2027/i.test(file)) {
        await processScheduleWorkbook(sheet);
      }
    }
  }

  console.log(JSON.stringify({ sourceRoot: SOURCE_ROOT, files: files.length }, null, 2));
}

await main();
