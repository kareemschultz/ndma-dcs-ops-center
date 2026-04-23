#!/usr/bin/env bun
/**
 * seed-policies-budgets.ts
 *
 * Imports policy documents, certification budget sheets, and future training
 * schedules into the shared HR tables.
 */

import ExcelJS from "exceljs";
import path from "node:path";
import { readdir, readFile } from "node:fs/promises";

import {
  certificationBudgets,
  companyPolicies,
  db,
  staffTrainingRecords,
  trainingCourses,
} from "../packages/db/src/index";

const SOURCE_ROOT = process.argv[2]
  ? path.resolve(process.argv[2])
  : "C:\\Users\\admin\\Documents\\karetech\\ndma-dcs-ops-center\\category-zips";

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

function mapBudgetStatus(value: unknown): "Planned" | "Approved" | "Spent" {
  const normalized = normalizeKey(String(value ?? ""));
  if (normalized.includes("approve")) return "Approved";
  if (normalized.includes("spent") || normalized.includes("paid")) return "Spent";
  return "Planned";
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

async function readWorkbook(filePath: string): Promise<{ workbookName: string; sheetName: string; rows: string[][] }[]> {
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

async function importCleanDeskPolicy(filePath: string) {
  const mammoth = await import("mammoth");
  const buffer = await readFile(filePath);
  const result = await mammoth.extractRawText({ buffer });
  await db.insert(companyPolicies).values({
    title: "Clean Desk Policy",
    contentText: result.value.trim(),
    documentUrl: filePath,
    lastUpdated: new Date().toISOString().slice(0, 10),
  }).onConflictDoNothing();
}

async function importBudgetSheet(sheet: { rows: string[][]; workbookName: string; sheetName: string }) {
  const headerIndex = sheet.rows.findIndex((row) => row.some((cell) => /certif|course|title/i.test(cell)));
  if (headerIndex < 0) return;
  const header = sheet.rows[headerIndex] ?? [];
  const lowerHeader = header.map((cell) => normalizeKey(cell));
  const certIndex = lowerHeader.findIndex((cell) => cell.includes("certif") || cell.includes("course") || cell.includes("title"));
  const estIndex = lowerHeader.findIndex((cell) => cell.includes("est"));
  const actualIndex = lowerHeader.findIndex((cell) => cell.includes("actual"));
  const statusIndex = lowerHeader.findIndex((cell) => cell.includes("status"));

  for (const row of sheet.rows.slice(headerIndex + 1)) {
    if (!rowHasData(row)) continue;
    const certification = row[certIndex] || sheet.sheetName;
    await db.insert(certificationBudgets).values({
      certificationName: certification,
      year: Number(sheet.sheetName.match(/(2024|2025|2026)/)?.[1] ?? 2026),
      estimatedCost: Number((row[estIndex] ?? "0").replace(/[^0-9]/g, "")) || 0,
      actualCost: Number((row[actualIndex] ?? "0").replace(/[^0-9]/g, "")) || 0,
      currency: "GYD",
      status: mapBudgetStatus(row[statusIndex]),
    }).onConflictDoNothing();
  }
}

async function importFutureTrainingSchedule(sheet: { rows: string[][]; workbookName: string; sheetName: string }) {
  const headerIndex = sheet.rows.findIndex((row) => row.some((cell) => /staff|course|title/i.test(cell)));
  if (headerIndex < 0) return;
  const header = sheet.rows[headerIndex] ?? [];
  const lowerHeader = header.map((cell) => normalizeKey(cell));
  const staffIndex = lowerHeader.findIndex((cell) => cell.includes("staff") || cell.includes("participant"));
  const courseIndex = lowerHeader.findIndex((cell) => cell.includes("course") || cell.includes("title"));
  const targetIndex = lowerHeader.findIndex((cell) => cell.includes("target") || cell.includes("date"));

  const staff = await db.query.staffProfiles.findMany({ with: { user: true } });

  for (const row of sheet.rows.slice(headerIndex + 1)) {
    if (!rowHasData(row)) continue;
    const courseTitle = row[courseIndex] || sheet.sheetName;
    const [course] = await db
      .insert(trainingCourses)
      .values({
        title: courseTitle,
        vendor: /huawei/i.test(sheet.workbookName) ? "Huawei" : "Internal",
        courseType: "Certification",
      })
      .onConflictDoNothing()
      .returning();

    const staffCell = row[staffIndex] ?? "";
    const normalizedStaff = normalizeKey(staffCell);
    const staffMember = staff.find((member) => member.user?.name && normalizeKey(member.user.name) === normalizedStaff);
    if (!staffMember || !course) continue;
    await db.insert(staffTrainingRecords).values({
      staffId: staffMember.id,
      courseId: course.id,
      status: "Enrolled",
      startDate: parseIsoDate(row[targetIndex] ?? undefined),
      completionDate: null,
      targetDate: parseIsoDate(row[targetIndex] ?? undefined),
      notes: `${sheet.workbookName} :: ${sheet.sheetName}`,
    }).onConflictDoNothing();
  }
}

async function main() {
  const files = (await walk(SOURCE_ROOT)).filter((file) => /\.(xlsx|xlsm|xls|docx)$/i.test(file));

  for (const file of files) {
    const base = path.basename(file);
    if (/clean desk policy/i.test(base) && /\.docx$/i.test(base)) {
      await importCleanDeskPolicy(file);
      continue;
    }

    if (/Certifications2024_20240706_v01/i.test(base) || /TrainingSchedule2026_2027/i.test(base)) {
      const sheets = await readWorkbook(file);
      for (const sheet of sheets) {
        if (/2024 Budget|2025 Budget|2026 Budget/i.test(sheet.sheetName)) {
          await importBudgetSheet(sheet);
        }
        if (/NOC|DCS/i.test(sheet.sheetName)) {
          await importFutureTrainingSchedule(sheet);
        }
      }
    }
  }

  console.log(JSON.stringify({ sourceRoot: SOURCE_ROOT, files: files.length }, null, 2));
}

await main();
