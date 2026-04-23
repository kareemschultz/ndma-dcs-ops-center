#!/usr/bin/env bun
/**
 * seed-tasks.ts
 *
 * Imports the legacy NDMA work tracker workbook into the relational work module.
 *
 * Usage:
 *   bun --env-file=apps/server/.env scripts/seed-tasks.ts
 *   bun --env-file=apps/server/.env scripts/seed-tasks.ts "C:\\path\\to\\WorkUpdate_20240118_v01.xlsx"
 *   bun --env-file=apps/server/.env scripts/seed-tasks.ts "C:\\path\\to\\work-folder"
 */

import ExcelJS from "exceljs";
import path from "node:path";
import { readdir, stat } from "node:fs/promises";
import { and, eq } from "drizzle-orm";

import {
  db,
  departments,
  staffProfiles,
  temporaryChanges,
  workItemComments,
  workItemTemplates,
  workItems,
} from "../packages/db/src/index";

type Sheet = {
  workbookName: string;
  sheetName: string;
  rows: string[][];
};

type StaffMaps = {
  byName: Map<string, string>;
  byEmail: Map<string, string>;
  byEmployeeId: Map<string, string>;
};

const DEFAULT_SOURCE = "C:\\Users\\admin\\Documents\\karetech\\ndma-dcs-ops-center\\WorkUpdate_20240118_v01.xlsx";

function normalizeKey(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseIsoDate(value: unknown): string | null {
  if (value == null || value === "") return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "number" && Number.isFinite(value)) {
    const date = new Date(Date.UTC(1899, 11, 30 + value));
    return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
  }

  const text = String(value).trim();
  if (!text) return null;

  const explicit = text.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/);
  if (explicit) {
    const [, year, month, day] = explicit;
    return new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)))
      .toISOString()
      .slice(0, 10);
  }

  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10);
}

function rowHasData(row: string[]) {
  return row.some((cell) => cell.trim().length > 0);
}

function cellToString(cell: ExcelJS.Cell): string {
  if (cell.value == null) return "";
  if (typeof cell.value === "object" && "richText" in cell.value) {
    return (cell.value as ExcelJS.CellRichTextValue).richText
      .map((part) => part.text)
      .join("");
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

async function readSheets(filePath: string): Promise<Sheet[]> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);
  return workbook.worksheets.map((sheet) => {
    const rows: string[][] = [];
    sheet.eachRow({ includeEmpty: true }, (row) => {
      const values: string[] = [];
      row.eachCell({ includeEmpty: true }, (cell) => values.push(cellToString(cell)));
      rows.push(values);
    });
    return {
      workbookName: path.basename(filePath),
      sheetName: sheet.name,
      rows,
    };
  });
}

async function buildStaffMaps(): Promise<StaffMaps> {
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

function findStaffId(row: string[], maps: StaffMaps): string | null {
  for (const cell of row) {
    const key = normalizeKey(cell);
    if (!key) continue;
    if (maps.byName.has(key)) return maps.byName.get(key) ?? null;
    if (maps.byEmail.has(key)) return maps.byEmail.get(key) ?? null;
    if (maps.byEmployeeId.has(key)) return maps.byEmployeeId.get(key) ?? null;
  }
  return null;
}

async function getDepartmentIdByCode(code: string): Promise<string | null> {
  const dept = await db.query.departments.findFirst({
    where: eq(departments.code, code),
  });
  return dept?.id ?? null;
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

function isMonthlySheet(headers: string[]) {
  const joined = headers.map(normalizeKey).join(" ");
  return (
    joined.includes("task assigned") &&
    joined.includes("details") &&
    joined.includes("engineer")
  );
}

function isCurrentWorkSheet(headers: string[]) {
  const joined = headers.map(normalizeKey).join(" ");
  return joined.includes("weeks overdue") || joined.includes("estimated time");
}

function isRoutineSheet(headers: string[]) {
  const joined = headers.map(normalizeKey).join(" ");
  return joined.includes("sub task") && joined.includes("scheduled") && joined.includes("folder");
}

function isTemporarySheet(headers: string[]) {
  const joined = headers.map(normalizeKey).join(" ");
  return joined.includes("date it should be removed") || joined.includes("date implemented");
}

function isOtherDeptSheet(headers: string[]) {
  const joined = headers.map(normalizeKey).join(" ");
  return joined.includes("follow up date") && joined.includes("dcs engineer to follow up");
}

function resolvePriorityFromText(text: string): "low" | "medium" | "high" | "critical" {
  const normalized = normalizeKey(text);
  if (normalized.includes("critical") || normalized.includes("urgent")) return "critical";
  if (normalized.includes("high")) return "high";
  if (normalized.includes("low")) return "low";
  return "medium";
}

function resolveStatusFromText(
  updateText: string,
  deadline: string | null,
  today = new Date().toISOString().slice(0, 10),
): "backlog" | "todo" | "in_progress" | "blocked" | "review" | "done" | "cancelled" {
  const normalized = normalizeKey(updateText);
  if (normalized.includes("cancel")) return "cancelled";
  if (normalized.includes("complete")) return "done";
  if (normalized.includes("review")) return "review";
  if (normalized.includes("block") || normalized.includes("overdue")) return "blocked";
  if (deadline && deadline < today) return "blocked";
  if (normalized.includes("progress") || normalized.includes("working")) return "in_progress";
  if (normalized.includes("todo") || normalized.includes("pending")) return "todo";
  return "backlog";
}

async function upsertWorkItem(params: {
  title: string;
  description?: string | null;
  status: "backlog" | "todo" | "in_progress" | "blocked" | "review" | "done" | "cancelled";
  priority: "low" | "medium" | "high" | "critical";
  dueDate?: string | null;
  estimatedHours?: string | null;
  assignedToId?: string | null;
  departmentId?: string | null;
  sourceSystem: string;
  sourceReference: string;
  type?: "routine" | "project" | "external_request" | "ad_hoc";
  requesterName?: string | null;
  requesterEmail?: string | null;
}) {
  const existing = await db.query.workItems.findFirst({
    where: and(
      eq(workItems.title, params.title),
      eq(workItems.sourceReference, params.sourceReference),
    ),
  });

  if (existing) {
    const [updated] = await db
      .update(workItems)
      .set({
        description: params.description ?? existing.description,
        status: params.status,
        priority: params.priority,
        dueDate: params.dueDate ?? existing.dueDate,
        estimatedHours: params.estimatedHours ?? existing.estimatedHours,
        assignedToId: params.assignedToId ?? existing.assignedToId,
        departmentId: params.departmentId ?? existing.departmentId,
        sourceSystem: params.sourceSystem,
        requesterName: params.requesterName ?? existing.requesterName,
        requesterEmail: params.requesterEmail ?? existing.requesterEmail,
        updatedAt: new Date(),
      })
      .where(eq(workItems.id, existing.id))
      .returning();
    return updated ?? existing;
  }

  const [created] = await db
    .insert(workItems)
    .values({
      title: params.title,
      description: params.description ?? null,
      type: params.type ?? "project",
      status: params.status,
      priority: params.priority,
      assignedToId: params.assignedToId ?? null,
      departmentId: params.departmentId ?? null,
      requesterName: params.requesterName ?? null,
      requesterEmail: params.requesterEmail ?? null,
      sourceSystem: params.sourceSystem,
      sourceReference: params.sourceReference,
      dueDate: params.dueDate ?? null,
      estimatedHours: params.estimatedHours ?? null,
    })
    .returning();

  return created ?? null;
}

async function addImportedComment(workItemId: string, body: string) {
  await db.insert(workItemComments).values({
    workItemId,
    authorId: null,
    body,
  });
}

async function importMonthlyAndCurrentWork(sheet: Sheet, staffMaps: StaffMaps, defaultDepartmentId: string | null) {
  const headerIndex = findHeaderRow(sheet.rows, [
    "task assigned",
    "details",
    "engineer",
    "deadline",
    "update",
  ]);
  if (headerIndex < 0) return;

  const header = sheet.rows[headerIndex] ?? [];
  const lower = header.map((cell) => normalizeKey(cell));
  const taskIndex = lower.findIndex((cell) => cell.includes("task assigned"));
  const detailsIndex = lower.findIndex((cell) => cell.includes("details"));
  const updateIndex = lower.findIndex((cell) => cell.includes("update"));
  const deadlineIndex = lower.findIndex((cell) => cell.includes("deadline"));
  const engineerIndex = lower.findIndex((cell) => cell.includes("engineer") || cell.includes("tech"));
  const priorityIndex = lower.findIndex((cell) => cell.includes("priority"));
  const sourceIndex = lower.findIndex((cell) => cell.includes("i top") || cell.includes("trello") || cell.includes("teams"));
  const estimateIndex = lower.findIndex((cell) => cell.includes("estimated time"));

  for (const row of sheet.rows.slice(headerIndex + 1)) {
    if (!rowHasData(row)) continue;
    const title = row[taskIndex] || row[detailsIndex] || `Imported work ${sheet.sheetName}`;
    const deadline = parseIsoDate(row[deadlineIndex] ?? undefined);
    const updateText = row[updateIndex] || "";
    const priority = priorityIndex >= 0 ? resolvePriorityFromText(row[priorityIndex] || "") : resolvePriorityFromText(updateText);
    const assignedToId = engineerIndex >= 0 ? findStaffId([row[engineerIndex] ?? ""], staffMaps) : null;
    const sourceSystem = row[sourceIndex] || "WorkUpdate";
    const sourceReference = `${sheet.workbookName}:${sheet.sheetName}:${row[taskIndex] || row[detailsIndex] || sheet.rows.indexOf(row)}`;
    const item = await upsertWorkItem({
      title,
      description: row[detailsIndex] || null,
      status: resolveStatusFromText(updateText, deadline),
      priority,
      dueDate: deadline,
      estimatedHours: estimateIndex >= 0 ? row[estimateIndex] || null : null,
      assignedToId,
      departmentId: defaultDepartmentId,
      sourceSystem,
      sourceReference,
      type: sheet.sheetName.toLowerCase().includes("current") ? "project" : "ad_hoc",
    });

    if (item && updateText.trim()) {
      await addImportedComment(
        item.id,
        `${updateText.trim()}${deadline ? `\nDeadline: ${deadline}` : ""}`,
      );
    }
  }
}

async function importRoutineSheet(sheet: Sheet, staffMaps: StaffMaps, defaultDepartmentId: string | null) {
  const headerIndex = findHeaderRow(sheet.rows, ["task", "sub task", "tech", "period", "scheduled", "due date", "status", "folder"]);
  if (headerIndex < 0) return;

  const header = sheet.rows[headerIndex] ?? [];
  const lower = header.map((cell) => normalizeKey(cell));
  const taskIndex = lower.findIndex((cell) => cell === "task");
  const subTaskIndex = lower.findIndex((cell) => cell.includes("sub task"));
  const techIndex = lower.findIndex((cell) => cell.includes("tech"));
  const periodIndex = lower.findIndex((cell) => cell.includes("period"));
  const scheduledIndex = lower.findIndex((cell) => cell.includes("scheduled"));
  const dueIndex = lower.findIndex((cell) => cell.includes("due date"));
  const statusIndex = lower.findIndex((cell) => cell.includes("status"));
  const folderIndex = lower.findIndex((cell) => cell.includes("folder"));

  for (const row of sheet.rows.slice(headerIndex + 1)) {
    if (!rowHasData(row)) continue;
    const title = row[taskIndex] || row[subTaskIndex] || `Routine task ${sheet.sheetName}`;
    const description = [row[subTaskIndex], row[folderIndex]].filter(Boolean).join(" • ");
    const assignedToId = techIndex >= 0 ? findStaffId([row[techIndex] ?? ""], staffMaps) : null;
    const dueDate = parseIsoDate(row[dueIndex] ?? row[scheduledIndex] ?? undefined);
    const item = await upsertWorkItem({
      title,
      description: description || null,
      status: resolveStatusFromText(row[statusIndex] || "", dueDate),
      priority: resolvePriorityFromText(row[statusIndex] || row[folderIndex] || ""),
      dueDate,
      assignedToId,
      departmentId: defaultDepartmentId,
      sourceSystem: sheet.workbookName,
      sourceReference: `${sheet.workbookName}:${sheet.sheetName}:${row[taskIndex] || row[subTaskIndex] || sheet.rows.indexOf(row)}`,
      type: "routine",
    });

    if (item && row[periodIndex]) {
      await addImportedComment(item.id, `Recurring period: ${row[periodIndex]}`);
    }
  }
}

async function importTemporarySheet(sheet: Sheet, staffMaps: StaffMaps, defaultDepartmentId: string | null) {
  const headerIndex = findHeaderRow(sheet.rows, ["change", "date implemented", "date it should be removed", "follow up", "engineer", "comment"]);
  if (headerIndex < 0) return;

  const header = sheet.rows[headerIndex] ?? [];
  const lower = header.map((cell) => normalizeKey(cell));
  const changeIndex = lower.findIndex((cell) => cell.includes("change"));
  const implementedIndex = lower.findIndex((cell) => cell.includes("date implemented"));
  const removalIndex = lower.findIndex((cell) => cell.includes("should be removed"));
  const followUpIndex = lower.findIndex((cell) => cell.includes("follow up"));
  const engineerIndex = lower.findIndex((cell) => cell.includes("engineer"));
  const commentIndex = lower.findIndex((cell) => cell.includes("comment"));

  for (const row of sheet.rows.slice(headerIndex + 1)) {
    if (!rowHasData(row)) continue;
    const title = row[changeIndex] || `Temporary change ${sheet.sheetName}`;
    const removalDate = parseIsoDate(row[removalIndex] ?? undefined);
    const implementedDate = parseIsoDate(row[implementedIndex] ?? undefined);
    const assignedToId = engineerIndex >= 0 ? findStaffId([row[engineerIndex] ?? ""], staffMaps) : null;
    const status =
      removalDate && removalDate < new Date().toISOString().slice(0, 10)
        ? "overdue"
        : "active";

    const existing = await db.query.temporaryChanges.findFirst({
      where: eq(temporaryChanges.title, title),
    });
    if (existing) continue;

    await db.insert(temporaryChanges).values({
      title,
      description: row[commentIndex] || null,
      justification: row[commentIndex] || null,
      ownerId: assignedToId,
      implementationDate: implementedDate,
      removeByDate: removalDate,
      followUpDate: parseIsoDate(row[followUpIndex] ?? undefined),
      status,
      createdById: null,
      category: "temporary_change",
      riskLevel: "medium",
      environment: "production",
      externalExposure: false,
      departmentId: defaultDepartmentId,
    });
  }
}

async function importOtherDeptSheet(sheet: Sheet, staffMaps: StaffMaps, defaultDepartmentId: string | null) {
  const headerIndex = findHeaderRow(sheet.rows, ["tech", "task", "story", "follow up"]);
  if (headerIndex < 0) return;

  const header = sheet.rows[headerIndex] ?? [];
  const lower = header.map((cell) => normalizeKey(cell));
  const techIndex = lower.findIndex((cell) => cell.includes("tech"));
  const taskIndex = lower.findIndex((cell) => cell.includes("task"));
  const storyIndex = lower.findIndex((cell) => cell.includes("story"));
  const followUpIndex = lower.findIndex((cell) => cell.includes("follow up"));
  const dateIndex = lower.findIndex((cell) => cell.includes("date assigned"));

  for (const row of sheet.rows.slice(headerIndex + 1)) {
    if (!rowHasData(row)) continue;
    const title = row[taskIndex] || row[storyIndex] || `External follow-up ${sheet.sheetName}`;
    const assignedToId = techIndex >= 0 ? findStaffId([row[techIndex] ?? ""], staffMaps) : null;
    const dueDate = parseIsoDate(row[followUpIndex] ?? row[dateIndex] ?? undefined);
    const item = await upsertWorkItem({
      title,
      description: row[storyIndex] || null,
      status: resolveStatusFromText(row[storyIndex] || "", dueDate),
      priority: resolvePriorityFromText(row[storyIndex] || ""),
      dueDate,
      assignedToId,
      departmentId: defaultDepartmentId,
      sourceSystem: sheet.workbookName,
      sourceReference: `${sheet.workbookName}:${sheet.sheetName}:${row[taskIndex] || row[storyIndex] || sheet.rows.indexOf(row)}`,
      type: "external_request",
      requesterName: row[techIndex] || null,
    });

    if (item && row[storyIndex]) {
      await addImportedComment(item.id, row[storyIndex]);
    }
  }
}

async function seedWorkbook(filePath: string) {
  const sheets = await readSheets(filePath);
  const staffMaps = await buildStaffMaps();
  const defaultDepartmentId = await getDepartmentIdByCode("DCS");

  for (const sheet of sheets) {
    const headers = (sheet.rows[findHeaderRow(sheet.rows, ["task", "change", "engineer", "status"]) ] ?? []).filter(Boolean);
    if (isRoutineSheet(headers)) {
      await importRoutineSheet(sheet, staffMaps, defaultDepartmentId);
    } else if (isTemporarySheet(headers)) {
      await importTemporarySheet(sheet, staffMaps, defaultDepartmentId);
    } else if (isOtherDeptSheet(headers)) {
      await importOtherDeptSheet(sheet, staffMaps, defaultDepartmentId);
    } else if (isMonthlySheet(headers) || isCurrentWorkSheet(headers)) {
      await importMonthlyAndCurrentWork(sheet, staffMaps, defaultDepartmentId);
    }
  }
}

async function locateSource(target: string): Promise<string> {
  const resolved = path.resolve(target);
  const info = await stat(resolved).catch(() => null);
  if (info?.isFile()) return resolved;
  if (info?.isDirectory()) {
    const entries = await readdir(resolved, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isFile() && /WorkUpdate_20240118_v01\.xlsx$/i.test(entry.name)) {
        return path.join(resolved, entry.name);
      }
    }
  }

  return DEFAULT_SOURCE;
}

async function main() {
  const source = process.argv[2] ? await locateSource(process.argv[2]) : DEFAULT_SOURCE;
  await seedWorkbook(source);
  console.log(JSON.stringify({ source }, null, 2));
}

await main();
