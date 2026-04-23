#!/usr/bin/env bun
/**
 * seed-appraisals.ts
 *
 * Imports historical appraisal workbooks from extracted DCS/ and NOC/
 * directories into the appraisal tables.
 *
 * Usage:
 *   bun --env-file=apps/server/.env scripts/seed-appraisals.ts <root-dir>
 *
 * The root directory should contain DCS/ and NOC/ folders. The script scans
 * recursively for Excel files whose names contain Appraisal, PerformanceEvaluation,
 * or Tracker, and supports multi-sheet workbooks.
 */

import ExcelJS from "exceljs";
import { readdir, stat } from "node:fs/promises";
import path from "node:path";

import { eq, sql } from "../packages/db/node_modules/drizzle-orm";
import {
  appraisalNotes,
  appraisalScores,
  appraisalTracker,
  appraisals,
  db,
  departments,
  staffProfiles,
  user,
} from "../packages/db/src/index";

type AppraisalStatus =
  | "draft"
  | "scheduled"
  | "in_progress"
  | "submitted"
  | "approved"
  | "rejected"
  | "completed"
  | "overdue";

type StaffMap = {
  byName: Map<string, string>;
  byEmail: Map<string, string>;
};

type AppraisalDraft = {
  key: string;
  staffProfileId: string;
  reviewerId: string | null;
  departmentId: string | null;
  year: number | null;
  period: string | null;
  totalScore: number | null;
  status: AppraisalStatus;
  scores: Array<{
    category: string;
    criteria: string;
    score: number;
    comment: string | null;
  }>;
  notes: Array<{
    noteType: string;
    content: string;
  }>;
  sourceFile: string;
  sheetName: string;
};

type TrackerRow = {
  departmentId: string | null;
  year: number;
  period: string;
  draftCount: number;
  scheduledCount: number;
  inProgressCount: number;
  submittedCount: number;
  approvedCount: number;
  rejectedCount: number;
  completedCount: number;
  overdueCount: number;
  totalCount: number;
};

type ParsedSheet = {
  workbookName: string;
  sheetName: string;
  rows: string[][];
};

const SOURCE_ROOT = process.argv[2] ? path.resolve(process.argv[2]) : null;
const FILE_PATTERN = /(?:appraisal|performanceevaluation|tracker)/i;
const EXCEL_PATTERN = /\.(xlsx|xlsm|xls)$/i;

function normalizeKey(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

function normalizeName(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

function parseInteger(value: string): number | null {
  const cleaned = value.trim().replace(/[^0-9.-]/g, "");
  if (!cleaned) return null;
  const parsed = Number.parseFloat(cleaned);
  return Number.isFinite(parsed) ? Math.round(parsed) : null;
}

function parseYear(value: string | number | null | undefined): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.trunc(value);
  }
  const text = String(value ?? "").trim();
  const match = text.match(/(19|20)\d{2}/);
  if (!match) return null;
  return Number(match[0]);
}

function parseStatus(value: string | null | undefined): AppraisalStatus | null {
  const normalized = normalizeKey(String(value ?? ""));
  if (!normalized) return null;
  if (normalized.includes("draft")) return "draft";
  if (normalized.includes("schedule")) return "scheduled";
  if (normalized.includes("progress")) return "in_progress";
  if (normalized.includes("submit")) return "submitted";
  if (normalized.includes("approve")) return "approved";
  if (normalized.includes("reject")) return "rejected";
  if (normalized.includes("complete")) return "completed";
  if (normalized.includes("overdue")) return "overdue";
  return null;
}

function formatPeriodLabel(start: string | null, end: string | null, fallback: string | null): string | null {
  if (fallback?.trim()) return fallback.trim();
  if (start && end) return `${start} - ${end}`;
  return null;
}

function cellToString(cell: ExcelJS.Cell): string {
  if (cell.value === null || cell.value === undefined) return "";

  if (typeof cell.value === "object" && "richText" in cell.value) {
    return (cell.value as ExcelJS.CellRichTextValue).richText.map((r) => r.text).join("");
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

function rowHasData(row: string[]): boolean {
  return row.some((cell) => cell.trim().length > 0);
}

function buildHeaderMap(headerRow: string[]): Map<string, number> {
  const map = new Map<string, number>();
  headerRow.forEach((cell, index) => {
    const key = normalizeKey(cell);
    if (key && !map.has(key)) {
      map.set(key, index);
    }
  });
  return map;
}

function findHeaderRowIndex(rows: string[][], tokens: string[]): number {
  let bestIndex = -1;
  let bestScore = 0;

  for (let index = 0; index < Math.min(rows.length, 12); index++) {
    const row = rows[index] ?? [];
    const normalized = row.map((cell) => normalizeKey(cell));
    const score = normalized.reduce((sum, cell) => {
      if (!cell) return sum;
      return sum + (tokens.some((token) => cell.includes(token)) ? 1 : 0);
    }, 0);

    if (score > bestScore && row.filter(Boolean).length >= 2) {
      bestIndex = index;
      bestScore = score;
    }
  }

  return bestIndex;
}

function getRowValue(
  row: string[],
  headerMap: Map<string, number> | null,
  aliases: string[],
): string {
  if (!headerMap) return "";
  for (const alias of aliases) {
    const index = headerMap.get(normalizeKey(alias));
    if (index === undefined) continue;
    const value = row[index] ?? "";
    if (value.trim()) return value.trim();
  }
  return "";
}

function extractMetadata(rows: string[][]): Record<string, string> {
  const metadata: Record<string, string> = {};
  for (const row of rows.slice(0, 20)) {
    if (row.length < 2) continue;
    const key = normalizeKey(row[0] ?? "");
    const value = (row[1] ?? row[2] ?? "").trim();
    if (!key || !value) continue;
    if (key.includes("staff") && !metadata.staff) metadata.staff = value;
    if (key.includes("reviewer") && !metadata.reviewer) metadata.reviewer = value;
    if (key.includes("year") && !metadata.year) metadata.year = value;
    if (key.includes("period") && !metadata.period) metadata.period = value;
    if (key.includes("status") && !metadata.status) metadata.status = value;
    if ((key.includes("score") || key.includes("total")) && !metadata.totalScore) metadata.totalScore = value;
    if (key.includes("department") && !metadata.department) metadata.department = value;
  }
  return metadata;
}

function resolveDepartmentId(
  rawValue: string,
  folderCode: string | null,
  departmentLookup: Map<string, string>,
): string | null {
  const candidate = rawValue.trim() || folderCode?.trim() || "";
  if (!candidate) return null;
  const normalized = normalizeKey(candidate);
  return departmentLookup.get(normalized) ?? departmentLookup.get(candidate.toLowerCase()) ?? null;
}

function resolveStaffId(rowValue: string, staffMaps: StaffMap): string | null {
  const email = rowValue.includes("@") ? rowValue : "";
  if (email) {
    const byEmail = staffMaps.byEmail.get(normalizeEmail(email));
    if (byEmail) return byEmail;
  }

  const normalized = normalizeName(rowValue);
  if (!normalized) return null;
  if (staffMaps.byName.has(normalized)) return staffMaps.byName.get(normalized)!;

  const firstName = normalized.split(" ")[0];
  if (firstName && staffMaps.byName.has(firstName)) return staffMaps.byName.get(firstName)!;

  for (const [key, id] of staffMaps.byName.entries()) {
    if (key.startsWith(normalized) || normalized.startsWith(key)) return id;
  }

  return null;
}

async function collectFiles(root: string): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const fullPath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectFiles(fullPath)));
      continue;
    }

    if (entry.isFile() && EXCEL_PATTERN.test(entry.name) && FILE_PATTERN.test(entry.name)) {
      files.push(fullPath);
    }
  }

  return files;
}

async function loadStaffMaps(): Promise<StaffMap> {
  const rows = await db
    .select({
      id: staffProfiles.id,
      name: user.name,
      email: user.email,
    })
    .from(staffProfiles)
    .innerJoin(user, eq(staffProfiles.userId, user.id));

  const byName = new Map<string, string>();
  const byEmail = new Map<string, string>();

  for (const row of rows) {
    if (row.name) {
      const normalized = normalizeName(row.name);
      if (!byName.has(normalized)) byName.set(normalized, row.id);
      const first = normalized.split(" ")[0];
      if (first && !byName.has(first)) byName.set(first, row.id);
    }
    if (row.email) {
      byEmail.set(normalizeEmail(row.email), row.id);
    }
  }

  return { byName, byEmail };
}

async function loadDepartmentLookup(): Promise<Map<string, string>> {
  const rows = await db.select().from(departments);
  const lookup = new Map<string, string>();
  for (const row of rows) {
    lookup.set(normalizeKey(row.code), row.id);
    lookup.set(normalizeKey(row.name), row.id);
  }
  return lookup;
}

async function loadExistingAppraisalKeys(): Promise<Set<string>> {
  const rows = await db
    .select({
      staffProfileId: appraisals.staffProfileId,
      year: appraisals.year,
      period: appraisals.period,
    })
    .from(appraisals);

  const keys = new Set<string>();
  for (const row of rows) {
    keys.add([row.staffProfileId, row.year ?? "", row.period ?? ""].join("|"));
  }
  return keys;
}

async function readWorkbook(filePath: string): Promise<ParsedSheet[]> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);

  const workbookName = path.basename(filePath);
  const sheets: ParsedSheet[] = [];

  for (const sheet of workbook.worksheets) {
    const rows: string[][] = [];
    sheet.eachRow({ includeEmpty: true }, (row) => {
      const values: string[] = [];
      row.eachCell({ includeEmpty: true }, (cell) => {
        values.push(cellToString(cell));
      });
      rows.push(values);
    });
    sheets.push({ workbookName, sheetName: sheet.name, rows });
  }

  return sheets;
}

function parseAppraisalSheet(
  filePath: string,
  sheetName: string,
  rows: string[][],
  folderCode: string | null,
  staffMaps: StaffMap,
  departmentLookup: Map<string, string>,
): AppraisalDraft[] {
  const metadata = extractMetadata(rows);
  const headerTokens = [
    "staff",
    "reviewer",
    "year",
    "period",
    "score",
    "status",
    "category",
    "criteria",
    "comment",
    "note",
    "department",
  ];
  const headerIndex = findHeaderRowIndex(rows, headerTokens);
  const headerMap = headerIndex >= 0 ? buildHeaderMap(rows[headerIndex] ?? []) : null;
  const startRow = headerIndex >= 0 ? headerIndex + 1 : 0;

  const drafts = new Map<string, AppraisalDraft>();
  let currentDraft: AppraisalDraft | null = null;

  function ensureDraft(
    staffProfileId: string,
    departmentId: string | null,
    year: number | null,
    period: string | null,
  ) {
    const key = [staffProfileId, year ?? "", period ?? ""].join("|");
    if (!drafts.has(key)) {
      drafts.set(key, {
        key,
        staffProfileId,
        reviewerId: null,
        departmentId,
        year,
        period,
        totalScore: null,
        status: "completed",
        scores: [],
        notes: [],
        sourceFile: path.basename(filePath),
        sheetName,
      });
    }
    currentDraft = drafts.get(key)!;
    return currentDraft;
  }

  for (let index = startRow; index < rows.length; index++) {
    const row = rows[index] ?? [];
    if (!rowHasData(row)) continue;

    const staffValue =
      getRowValue(row, headerMap, ["staff", "staff name", "name", "employee", "employee name"]) ||
      metadata.staff ||
      "";
    const reviewerValue =
      getRowValue(row, headerMap, ["reviewer", "reviewer name", "manager", "supervisor"]) ||
      metadata.reviewer ||
      "";
    const yearValue =
      getRowValue(row, headerMap, ["year"]) ||
      metadata.year ||
      path.basename(filePath).match(/(19|20)\d{2}/)?.[0] ||
      "";
    const periodValue =
      getRowValue(row, headerMap, ["period", "cycle", "appraisal period"]) ||
      metadata.period ||
      "";
    const statusValue =
      getRowValue(row, headerMap, ["status", "appraisal status"]) || metadata.status || "";
    const totalScoreValue =
      getRowValue(row, headerMap, ["total score", "score", "overall score", "aggregated score"]) ||
      metadata.totalScore ||
      "";
    const departmentValue =
      getRowValue(row, headerMap, ["department", "team"]) ||
      metadata.department ||
      "";

    const staffProfileId = resolveStaffId(staffValue, staffMaps) ?? currentDraft?.staffProfileId ?? null;
    const year = parseYear(yearValue) ?? currentDraft?.year ?? parseYear(metadata.year) ?? null;
    const period = formatPeriodLabel(
      getRowValue(row, headerMap, ["period start", "start date", "from"]) || null,
      getRowValue(row, headerMap, ["period end", "end date", "to"]) || null,
      periodValue || currentDraft?.period || null,
    ) ?? currentDraft?.period ?? null;
    const departmentId = resolveDepartmentId(departmentValue, folderCode, departmentLookup) ?? currentDraft?.departmentId ?? null;
    const status = parseStatus(statusValue) ?? currentDraft?.status ?? "completed";
    const totalScore = parseInteger(totalScoreValue) ?? currentDraft?.totalScore ?? null;

    const scoreCategory =
      getRowValue(row, headerMap, ["category", "score category", "competency"]) || "";
    const scoreCriteria =
      getRowValue(row, headerMap, ["criteria", "criterion", "sub criteria"]) || "";
    const scoreValue = parseInteger(getRowValue(row, headerMap, ["score", "rating", "value"]));
    const scoreComment =
      getRowValue(row, headerMap, ["comment", "comments", "notes", "note"]) || null;

    const noteType = getRowValue(row, headerMap, ["note type", "note"]) || "";
    const noteContent = getRowValue(row, headerMap, ["content", "note content", "details"]) || "";

    if (!staffProfileId || !year || !period) {
      continue;
    }

    const draft = ensureDraft(staffProfileId, departmentId, year, period);
    draft.departmentId = draft.departmentId ?? departmentId;
    draft.reviewerId =
      draft.reviewerId ?? resolveStaffId(reviewerValue, staffMaps);
    draft.status = status ?? draft.status;
    draft.totalScore = totalScore ?? draft.totalScore;

    if (scoreCategory || scoreCriteria || scoreValue != null || scoreComment) {
      if (scoreValue != null) {
        draft.scores.push({
          category: scoreCategory || "General",
          criteria: scoreCriteria || "Appraisal Score",
          score: scoreValue,
          comment: scoreComment,
        });
      }
    }

    if (noteType || noteContent) {
      draft.notes.push({
        noteType: noteType || "note",
        content: noteContent || scoreComment || "",
      });
    }
  }

  return [...drafts.values()].filter((draft) => draft.staffProfileId);
}

function parseTrackerSheet(
  filePath: string,
  sheetName: string,
  rows: string[][],
  folderCode: string | null,
  departmentLookup: Map<string, string>,
): TrackerRow[] {
  const metadata = extractMetadata(rows);
  const headerTokens = [
    "department",
    "year",
    "period",
    "status",
    "count",
    "draft",
    "scheduled",
    "progress",
    "submitted",
    "approved",
    "rejected",
    "completed",
    "overdue",
    "total",
  ];
  const headerIndex = findHeaderRowIndex(rows, headerTokens);
  const headerMap = headerIndex >= 0 ? buildHeaderMap(rows[headerIndex] ?? []) : null;
  const startRow = headerIndex >= 0 ? headerIndex + 1 : 0;

  const trackerRows: TrackerRow[] = [];
  const defaultDepartmentId = resolveDepartmentId(metadata.department || "", folderCode, departmentLookup);

  for (let index = startRow; index < rows.length; index++) {
    const row = rows[index] ?? [];
    if (!rowHasData(row)) continue;

    const rowDepartment = resolveDepartmentId(
      getRowValue(row, headerMap, ["department", "team"]) || metadata.department || "",
      folderCode,
      departmentLookup,
    );
    const departmentId = rowDepartment ?? defaultDepartmentId;
    const year = parseYear(getRowValue(row, headerMap, ["year"]) || metadata.year || "");
    const period = formatPeriodLabel(
      getRowValue(row, headerMap, ["period start", "start date", "from"]) || null,
      getRowValue(row, headerMap, ["period end", "end date", "to"]) || null,
      getRowValue(row, headerMap, ["period", "cycle"]) || metadata.period || "",
    );

    if (!year || !period) {
      continue;
    }

    const statusValue = getRowValue(row, headerMap, ["status"]) || "";
    const countValue = getRowValue(row, headerMap, ["count", "total"]) || "";

    const rowCounts = {
      draftCount: parseInteger(getRowValue(row, headerMap, ["draft"])) ?? 0,
      scheduledCount: parseInteger(getRowValue(row, headerMap, ["scheduled"])) ?? 0,
      inProgressCount:
        parseInteger(getRowValue(row, headerMap, ["in progress", "in_progress", "progress"])) ?? 0,
      submittedCount: parseInteger(getRowValue(row, headerMap, ["submitted"])) ?? 0,
      approvedCount: parseInteger(getRowValue(row, headerMap, ["approved"])) ?? 0,
      rejectedCount: parseInteger(getRowValue(row, headerMap, ["rejected"])) ?? 0,
      completedCount: parseInteger(getRowValue(row, headerMap, ["completed"])) ?? 0,
      overdueCount: parseInteger(getRowValue(row, headerMap, ["overdue"])) ?? 0,
    };

    const hasWideCounts = Object.values(rowCounts).some((count) => count > 0);

    if (hasWideCounts) {
      const totalCount =
        rowCounts.draftCount +
        rowCounts.scheduledCount +
        rowCounts.inProgressCount +
        rowCounts.submittedCount +
        rowCounts.approvedCount +
        rowCounts.rejectedCount +
        rowCounts.completedCount +
        rowCounts.overdueCount;
      trackerRows.push({
        departmentId,
        year,
        period,
        totalCount,
        ...rowCounts,
      });
      continue;
    }

    const status = parseStatus(statusValue);
    const count = parseInteger(countValue) ?? 1;
    if (!status) continue;

    const base = {
      draftCount: 0,
      scheduledCount: 0,
      inProgressCount: 0,
      submittedCount: 0,
      approvedCount: 0,
      rejectedCount: 0,
      completedCount: 0,
      overdueCount: 0,
    };

    const keyMap: Record<AppraisalStatus, keyof typeof base> = {
      draft: "draftCount",
      scheduled: "scheduledCount",
      in_progress: "inProgressCount",
      submitted: "submittedCount",
      approved: "approvedCount",
      rejected: "rejectedCount",
      completed: "completedCount",
      overdue: "overdueCount",
    };

    base[keyMap[status]] = count;

    trackerRows.push({
      departmentId,
      year,
      period,
      totalCount: count,
      ...base,
    });
  }

  return trackerRows;
}

async function aggregateTrackerFromAppraisals(): Promise<Map<string, TrackerRow>> {
  const rows = await db
    .select({
      departmentId: staffProfiles.departmentId,
      year: appraisals.year,
      period: appraisals.period,
      status: appraisals.status,
      count: sql<number>`count(*)::int`,
    })
    .from(appraisals)
    .innerJoin(staffProfiles, eq(appraisals.staffProfileId, staffProfiles.id))
    .groupBy(staffProfiles.departmentId, appraisals.year, appraisals.period, appraisals.status);

  const trackerMap = new Map<string, TrackerRow>();

  function ensureRow(departmentId: string | null, year: number, period: string): TrackerRow {
    const key = [departmentId ?? "", year, period].join("|");
    const existing = trackerMap.get(key);
    if (existing) return existing;
    const fresh: TrackerRow = {
      departmentId,
      year,
      period,
      draftCount: 0,
      scheduledCount: 0,
      inProgressCount: 0,
      submittedCount: 0,
      approvedCount: 0,
      rejectedCount: 0,
      completedCount: 0,
      overdueCount: 0,
      totalCount: 0,
    };
    trackerMap.set(key, fresh);
    return fresh;
  }

  for (const row of rows) {
    if (!row.year || !row.period) continue;
    const trackerRow = ensureRow(row.departmentId ?? null, row.year, row.period);
    trackerRow.totalCount += row.count;
    switch (row.status) {
      case "draft":
        trackerRow.draftCount += row.count;
        break;
      case "scheduled":
        trackerRow.scheduledCount += row.count;
        break;
      case "in_progress":
        trackerRow.inProgressCount += row.count;
        break;
      case "submitted":
        trackerRow.submittedCount += row.count;
        break;
      case "approved":
        trackerRow.approvedCount += row.count;
        break;
      case "rejected":
        trackerRow.rejectedCount += row.count;
        break;
      case "completed":
        trackerRow.completedCount += row.count;
        break;
      case "overdue":
        trackerRow.overdueCount += row.count;
        break;
      default:
        break;
    }
  }

  return trackerMap;
}

async function importAppraisalDrafts(
  drafts: AppraisalDraft[],
  existingKeys: Set<string>,
) {
  let inserted = 0;
  let skipped = 0;

  for (const draft of drafts) {
    const key = [draft.staffProfileId, draft.year ?? "", draft.period ?? ""].join("|");
    if (existingKeys.has(key)) {
      skipped++;
      continue;
    }

    const totalScore =
      draft.totalScore ??
      (draft.scores.length > 0
        ? Math.round(draft.scores.reduce((sum, score) => sum + score.score, 0) / draft.scores.length)
        : null);

    const [appraisal] = await db
      .insert(appraisals)
      .values({
        staffProfileId: draft.staffProfileId,
        reviewerId: draft.reviewerId,
        year: draft.year,
        period: draft.period,
        totalScore,
        status: draft.status,
        periodStart: `${draft.year ?? 1900}-01-01`,
        periodEnd: `${draft.year ?? 1900}-12-31`,
      })
      .returning();

    if (!appraisal) {
      skipped++;
      continue;
    }

    if (draft.scores.length > 0) {
      await db.insert(appraisalScores).values(
        draft.scores.map((score) => ({
          appraisalId: appraisal.id,
          category: score.category,
          criteria: score.criteria,
          score: score.score,
          comment: score.comment,
        })),
      );
    }

    if (draft.notes.length > 0) {
      await db.insert(appraisalNotes).values(
        draft.notes.map((note) => ({
          appraisalId: appraisal.id,
          noteType: note.noteType,
          content: note.content,
        })),
      );
    }

    existingKeys.add(key);
    inserted++;
  }

  return { inserted, skipped };
}

async function rebuildTrackerTable(extraRows: TrackerRow[]) {
  const aggregateRows = await aggregateTrackerFromAppraisals();
  for (const row of extraRows) {
    const key = [row.departmentId ?? "", row.year, row.period].join("|");
    if (!aggregateRows.has(key)) {
      aggregateRows.set(key, row);
      continue;
    }
    const target = aggregateRows.get(key)!;
    target.draftCount = Math.max(target.draftCount, row.draftCount);
    target.scheduledCount = Math.max(target.scheduledCount, row.scheduledCount);
    target.inProgressCount = Math.max(target.inProgressCount, row.inProgressCount);
    target.submittedCount = Math.max(target.submittedCount, row.submittedCount);
    target.approvedCount = Math.max(target.approvedCount, row.approvedCount);
    target.rejectedCount = Math.max(target.rejectedCount, row.rejectedCount);
    target.completedCount = Math.max(target.completedCount, row.completedCount);
    target.overdueCount = Math.max(target.overdueCount, row.overdueCount);
    target.totalCount = Math.max(target.totalCount, row.totalCount);
  }

  await db.delete(appraisalTracker);

  const rowsToInsert = [...aggregateRows.values()].map((row) => ({
    departmentId: row.departmentId,
    year: row.year,
    period: row.period,
    draftCount: row.draftCount,
    scheduledCount: row.scheduledCount,
    inProgressCount: row.inProgressCount,
    submittedCount: row.submittedCount,
    approvedCount: row.approvedCount,
    rejectedCount: row.rejectedCount,
    completedCount: row.completedCount,
    overdueCount: row.overdueCount,
    totalCount: row.totalCount,
  }));

  if (rowsToInsert.length > 0) {
    await db.insert(appraisalTracker).values(rowsToInsert);
  }
}

async function main() {
  if (!SOURCE_ROOT) {
    throw new Error("Usage: bun --env-file=apps/server/.env scripts/seed-appraisals.ts <root-dir>");
  }

  const sourceStat = await stat(SOURCE_ROOT);
  if (!sourceStat.isDirectory()) {
    throw new Error(`Source root must be a directory: ${SOURCE_ROOT}`);
  }

  const subdirs = await readdir(SOURCE_ROOT, { withFileTypes: true });
  const teamDirs = subdirs
    .filter((entry) => entry.isDirectory() && ["dcs", "noc"].includes(entry.name.toLowerCase()))
    .map((entry) => path.join(SOURCE_ROOT, entry.name));

  const scanRoots = teamDirs.length > 0 ? teamDirs : [SOURCE_ROOT];
  const files = new Set<string>();
  for (const root of scanRoots) {
    for (const filePath of await collectFiles(root)) {
      files.add(filePath);
    }
  }

  const staffMaps = await loadStaffMaps();
  const departmentLookup = await loadDepartmentLookup();
  const existingKeys = await loadExistingAppraisalKeys();

  const appraisalDrafts: AppraisalDraft[] = [];
  const trackerRows: TrackerRow[] = [];

  console.log(`Scanning ${files.size} workbook(s) from ${SOURCE_ROOT}`);

  for (const filePath of [...files].sort()) {
    const fileName = path.basename(filePath);
    const folderCode = filePath.toLowerCase().includes(`${path.sep}noc${path.sep}`)
      ? "NOC"
      : filePath.toLowerCase().includes(`${path.sep}dcs${path.sep}`)
        ? "DCS"
        : null;
    const sheets = await readWorkbook(filePath);

    let fileAppraisalCount = 0;
    let fileTrackerCount = 0;

    for (const sheet of sheets) {
      const sheetKind =
        /tracker/i.test(fileName) || /tracker/i.test(sheet.sheetName)
          ? "tracker"
          : "appraisal";

      if (sheetKind === "tracker") {
        const parsedTracker = parseTrackerSheet(
          filePath,
          sheet.sheetName,
          sheet.rows,
          folderCode,
          departmentLookup,
        );
        trackerRows.push(...parsedTracker);
        fileTrackerCount += parsedTracker.length;
        continue;
      }

      const parsedAppraisals = parseAppraisalSheet(
        filePath,
        sheet.sheetName,
        sheet.rows,
        folderCode,
        staffMaps,
        departmentLookup,
      );
      appraisalDrafts.push(...parsedAppraisals);
      fileAppraisalCount += parsedAppraisals.length;
    }

    console.log(
      `${fileName}: ${fileAppraisalCount} appraisal block(s), ${fileTrackerCount} tracker row(s)`,
    );
  }

  const importResult = await importAppraisalDrafts(appraisalDrafts, existingKeys);
  await rebuildTrackerTable(trackerRows);

  console.log(
    `Imported ${importResult.inserted} appraisal record(s), skipped ${importResult.skipped}, and rebuilt tracker rows.`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
