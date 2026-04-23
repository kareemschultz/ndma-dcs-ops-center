#!/usr/bin/env bun
/**
 * seed-current-data.ts
 *
 * Master seed for the current NDMA source-of-truth archive set.
 *
 * It unpacks the category-zips archives into a temporary working tree, then
 * invokes the existing domain seeders in dependency order:
 * - work / temp tracker
 * - leave
 * - training / budgets / policies
 * - HR roster, contracts, PPE
 * - NOC shifts
 * - appraisals
 * - attendance / lateness
 *
 * Usage:
 *   bun --env-file=apps/server/.env scripts/seed-current-data.ts [category-zips-root] [work-update-xlsx]
 */

import JSZip from "jszip";
import os from "node:os";
import path from "node:path";
import { copyFile, mkdir, readdir, stat } from "node:fs/promises";

const BUN_BIN = process.execPath;
const DEFAULT_ARCHIVE_ROOT =
  "C:\\Users\\admin\\Documents\\karetech\\ndma-dcs-ops-center\\category-zips";
const DEFAULT_WORK_UPDATE =
  "C:\\Users\\admin\\Documents\\karetech\\ndma-dcs-ops-center\\WorkUpdate_20240118_v01.xlsx";

const ARCHIVE_ROOT = path.resolve(process.argv[2] ?? DEFAULT_ARCHIVE_ROOT);
const WORK_UPDATE = path.resolve(process.argv[3] ?? DEFAULT_WORK_UPDATE);
const TEMP_ROOT = path.join(os.tmpdir(), `ndma-current-data-${Date.now()}-${crypto.randomUUID()}`);
const TEMP_ARCHIVES = path.join(TEMP_ROOT, "_archives");
const REPO_ROOT = process.cwd();
const DB_WORKSPACE = path.join(REPO_ROOT, "packages", "db");
const SERVER_ENV_FILE = path.join(REPO_ROOT, "apps", "server", ".env");

const ZIP_NAMES = [
  "Shared-leave.zip",
  "Shared-training.zip",
  "Shared-timesheets-2021.zip",
  "Shared-timesheets-2023.zip",
  "Shared-timesheets-2024.zip",
  "Shared-timesheets-2025.zip",
  "Shared-timesheets-2026.zip",
  "DCS.zip",
  "NOC.zip",
] as const;

const REQUIRED_ARCHIVES = [
  "Shared-leave.zip",
  "Shared-training.zip",
  "Shared-timesheets-2021.zip",
  "Shared-timesheets-2023.zip",
  "Shared-timesheets-2024.zip",
  "Shared-timesheets-2025.zip",
  "Shared-timesheets-2026.zip",
  "DCS.zip",
  "NOC.zip",
] as const;

async function ensureDir(dir: string) {
  await mkdir(dir, { recursive: true });
}

async function extractZip(zipPath: string, destinationDir: string) {
  await ensureDir(destinationDir);
  const archive = await JSZip.loadAsync(await Bun.file(zipPath).arrayBuffer());

  for (const entry of Object.values(archive.files)) {
    const resolved = path.join(destinationDir, entry.name);
    if (entry.dir) {
      await ensureDir(resolved);
      continue;
    }

    await ensureDir(path.dirname(resolved));
    const data = await entry.async("nodebuffer");
    await Bun.write(resolved, data);
  }
}

async function copyArchive(zipPath: string, destinationDir: string) {
  await ensureDir(destinationDir);
  await copyFile(zipPath, path.join(destinationDir, path.basename(zipPath)));
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

async function findFirstFile(dir: string, matcher: RegExp): Promise<string | null> {
  const files = await walk(dir);
  for (const file of files) {
    if (matcher.test(path.basename(file))) {
      return file;
    }
  }
  return null;
}

async function runScript(scriptPath: string, args: string[]) {
  const proc = Bun.spawn([BUN_BIN, `--env-file=${SERVER_ENV_FILE}`, path.resolve(scriptPath), ...args], {
    cwd: DB_WORKSPACE,
    stdout: "inherit",
    stderr: "inherit",
    stdin: "inherit",
  });
  const exitCode = await proc.exited;
  if (exitCode !== 0) {
    throw new Error(`Seed script failed: ${scriptPath} (${exitCode})`);
  }
}

async function main() {
  const archiveStat = await stat(ARCHIVE_ROOT).catch(() => null);
  if (!archiveStat?.isDirectory()) {
    throw new Error(`Archive root must be a directory: ${ARCHIVE_ROOT}`);
  }

  const workUpdateStat = await stat(WORK_UPDATE).catch(() => null);
  if (!workUpdateStat?.isFile()) {
    throw new Error(`Work update workbook not found: ${WORK_UPDATE}`);
  }

  await ensureDir(TEMP_ROOT);
  await ensureDir(TEMP_ARCHIVES);

  const zipPaths = Object.fromEntries(
    await Promise.all(
      ZIP_NAMES.map(async (name) => {
        const source = path.join(ARCHIVE_ROOT, name);
        const sourceStat = await stat(source).catch(() => null);
        if (!sourceStat?.isFile()) return [name, null] as const;
        return [name, source] as const;
      }),
    ),
  ) as Record<(typeof ZIP_NAMES)[number], string | null>;

  const missingRequiredArchives = REQUIRED_ARCHIVES.filter((name) => !zipPaths[name]);
  if (missingRequiredArchives.length > 0) {
    throw new Error(
      `Historical source-of-truth archives are missing from ${ARCHIVE_ROOT}: ${missingRequiredArchives.join(", ")}`,
    );
  }

  for (const name of ZIP_NAMES) {
    const source = zipPaths[name];
    if (!source) continue;
    await copyArchive(source, TEMP_ARCHIVES);
  }

  if (zipPaths["DCS.zip"]) {
    await extractZip(zipPaths["DCS.zip"], path.join(TEMP_ROOT, "DCS"));
  }
  if (zipPaths["NOC.zip"]) {
    await extractZip(zipPaths["NOC.zip"], path.join(TEMP_ROOT, "NOC"));
  }
  if (zipPaths["Shared-training.zip"]) {
    await extractZip(zipPaths["Shared-training.zip"], path.join(TEMP_ROOT, "Shared-training"));
  }
  if (zipPaths["Shared-leave.zip"]) {
    await extractZip(zipPaths["Shared-leave.zip"], path.join(TEMP_ROOT, "Shared-leave"));
  }
  for (const name of ZIP_NAMES.filter((zipName) => zipName.startsWith("Shared-timesheets-"))) {
    const source = zipPaths[name];
    if (!source) continue;
    await extractZip(source, path.join(TEMP_ROOT, name.replace(/\.zip$/i, "")));
  }

  const extractedLeaveWorkbook =
    (await findFirstFile(path.join(TEMP_ROOT, "Shared-leave"), /TimeOffSickDays_.*\.xlsx$/i)) ??
    zipPaths["Shared-leave.zip"] ??
    null;
  const extractedTrainingRoot = path.join(TEMP_ROOT, "Shared-training");
  const extractedTeamRoot = TEMP_ROOT;
  const extractedAttendanceRoot = TEMP_ROOT;

  const steps: Array<[string, string[]]> = [
    ["packages/db/src/seed.ts", []],
    ["scripts/seed-tasks.ts", [WORK_UPDATE]],
    ["scripts/seed-leave.ts", extractedLeaveWorkbook ? [extractedLeaveWorkbook] : []],
    ["scripts/seed-training.ts", [extractedTrainingRoot]],
    ["scripts/seed-policies-budgets.ts", [extractedTrainingRoot]],
    ["scripts/seed-hr-data.ts", [extractedTeamRoot]],
    ["scripts/seed-noc-shifts.ts", [extractedTeamRoot]],
    ["scripts/seed-appraisals.ts", [extractedTeamRoot]],
    ["scripts/seed-attendance.ts", [extractedAttendanceRoot]],
  ];

  for (const [scriptPath, args] of steps) {
    if (scriptPath === "scripts/seed-leave.ts" && args.length === 0) continue;
    await runScript(scriptPath, args);
  }

  console.log(
    JSON.stringify(
      {
        archiveRoot: ARCHIVE_ROOT,
        workUpdate: WORK_UPDATE,
        tempRoot: TEMP_ROOT,
        historicalCoverage: {
          leave: "2021-2026 leave history via Shared-leave.zip",
          training: "2024-2026 training history via Shared-training.zip",
          timesheets: "2021-2026 attendance history via Shared-timesheets-*.zip",
          appraisals: "DCS/NOC historical appraisal workbooks",
          work: "Legacy WorkUpdate workbook and TemporaryTracker history",
        },
        imported: {
          work: true,
          leave: Boolean(extractedLeaveWorkbook),
          training: true,
          policiesBudgets: true,
          hr: true,
          nocShifts: true,
          appraisals: true,
          attendance: true,
        },
      },
      null,
      2,
    ),
  );
}

await main();
