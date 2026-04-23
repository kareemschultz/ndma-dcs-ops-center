#!/usr/bin/env bun
/**
 * seed-attendance.ts
 *
 * Parses FingerTec time card PDFs and lateness workbooks into attendance_logs
 * and lateness_records. Also enumerates historical Shared-timesheets archives
 * and logs the parsing strategy for the remaining files.
 */

import ExcelJS from "exceljs";
import path from "node:path";
import { readdir } from "node:fs/promises";

import {
  attendanceLogs,
  db,
  latenessRecords,
  staffProfiles,
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

async function buildStaffMap() {
  const staff = await db.query.staffProfiles.findMany({ with: { user: true } });
  const map = new Map<string, string>();
  for (const member of staff) {
    if (member.user?.name) map.set(normalizeKey(member.user.name), member.id);
    if (member.employeeId) map.set(normalizeKey(member.employeeId), member.id);
  }
  return map;
}

async function importPdfTimesheet(filePath: string, staffMap: Map<string, string>) {
  const pdfParseModule = await import("pdf-parse");
  const PDFParse = pdfParseModule.PDFParse as new (options: { data: Buffer }) => {
    getText(): Promise<{ text: string }>;
  };
  const buffer = await Bun.file(filePath).arrayBuffer();
  const parser = new PDFParse({ data: Buffer.from(buffer) });
  const data = await parser.getText();
  const lines = data.text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);

  let currentName = "";
  for (const line of lines) {
    const userMatch = line.match(/user\s*name\s*[:\-]\s*(.+)$/i);
    if (userMatch) {
      currentName = userMatch[1].trim();
      continue;
    }

    const dailyMatch = line.match(
      /(\d{4}-\d{2}-\d{2}|\d{1,2}[\/-]\d{1,2}[\/-]\d{4})\s+(\d{1,2}:\d{2}(?::\d{2})?)\s+(\d{1,2}:\d{2}(?::\d{2})?)\s+(\d+(?:\.\d+)?)?/,
    );
    if (!dailyMatch) continue;

    const staffId = staffMap.get(normalizeKey(currentName));
    if (!staffId) continue;

    const date = parseIsoDate(dailyMatch[1]);
    if (!date) continue;

    await db.insert(attendanceLogs).values({
      staffId,
      date,
      clockIn: dailyMatch[2],
      clockOut: dailyMatch[3],
      workHours: dailyMatch[4] ?? null,
      status: "Workday",
    }).onConflictDoNothing();
  }
}

async function importLatenessWorkbook(filePath: string) {
  const sheets = await readWorkbook(filePath);
  const staffMap = await buildStaffMap();

  for (const sheet of sheets) {
    if (!/quarter/i.test(sheet.sheetName)) continue;
    const headerIndex = sheet.rows.findIndex((row) => row.some((cell) => /staff|name/i.test(cell)));
    if (headerIndex < 0) continue;
    const header = sheet.rows[headerIndex] ?? [];
    const lowerHeader = header.map((cell) => normalizeKey(cell));
    const staffIndex = lowerHeader.findIndex((cell) => cell.includes("staff") || cell.includes("name"));
    const monthIndex = lowerHeader.findIndex((cell) => cell.includes("month"));
    const lateIndex = lowerHeader.findIndex((cell) => cell.includes("late") || cell.includes("time late"));
    const daysIndex = lowerHeader.findIndex((cell) => cell.includes("days"));

    for (const row of sheet.rows.slice(headerIndex + 1)) {
      if (!rowHasData(row)) continue;
      const staffId = staffMap.get(normalizeKey(row[staffIndex] ?? ""));
      if (!staffId) continue;
      await db.insert(latenessRecords).values({
        staffId,
        year: 2025,
        month: row[monthIndex] || sheet.sheetName,
        totalTimeLate: row[lateIndex] || "00:00:00",
        daysLate: Number(row[daysIndex] || 0),
      }).onConflictDoNothing();
    }
  }
}

async function outlineHistoricalArchives(root: string) {
  const files = await walk(root);
  const archives = files.filter((file) => /Shared-timesheets/i.test(file) && /\.zip$/i.test(file));
  console.log(
    JSON.stringify(
      {
        archives,
        parseStrategy: "Extract each archive, then use the same PDF workbook parser for each month and year from 2021-2026.",
      },
      null,
      2,
    ),
  );
}

async function main() {
  const files = (await walk(SOURCE_ROOT)).filter((file) => /\.(pdf|xlsx|xlsm|xls)$/i.test(file));
  const staffMap = await buildStaffMap();

  for (const file of files) {
    const base = path.basename(file);
    if (/Time Sheet/i.test(base) || /FingerTec/i.test(base)) {
      await importPdfTimesheet(file, staffMap);
      continue;
    }
    if (/LatenessReport/i.test(base)) {
      await importLatenessWorkbook(file);
    }
  }

  await outlineHistoricalArchives(SOURCE_ROOT);
}

await main();
