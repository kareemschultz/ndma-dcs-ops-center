// /lateness — Quarterly Lateness Report
//
// Features:
//   • Quarterly grid: staff × month (3 months per quarter)
//   • Click any cell to edit a record inline (opens upsert dialog pre-filled)
//   • Add button per month column header
//   • Delete via right-click / delete icon in edit dialog
//   • Excel bulk import: reads the NOC & DC Lateness Report format
//     (quarterly sheets, staff rows, time-late + days-late per month)

import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { Clock3, Plus, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import * as XLSX from "xlsx";

import { Button } from "@ndma-dcs-staff-portal/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@ndma-dcs-staff-portal/ui/components/dialog";
import { Input } from "@ndma-dcs-staff-portal/ui/components/input";
import { Label } from "@ndma-dcs-staff-portal/ui/components/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@ndma-dcs-staff-portal/ui/components/select";
import { Skeleton } from "@ndma-dcs-staff-portal/ui/components/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@ndma-dcs-staff-portal/ui/components/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@ndma-dcs-staff-portal/ui/components/tabs";

import { Header } from "@/components/layout/header";
import { Main } from "@/components/layout/main";
import { ThemeSwitch } from "@/components/theme-switch";
import { orpc } from "@/utils/orpc";

export const Route = createFileRoute("/_authenticated/lateness/")({
  component: LatenessPage,
});

// ─── Constants ────────────────────────────────────────────────────────────────

const MONTHS_PER_QUARTER: Record<number, string[]> = {
  1: ["January", "February", "March"],
  2: ["April", "May", "June"],
  3: ["July", "August", "September"],
  4: ["October", "November", "December"],
};

const ALL_MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
] as const;

// ─── Types ────────────────────────────────────────────────────────────────────

interface LatenessRec {
  id: number;
  totalTimeLate: string;
  daysLate: number;
  daysMissingFromAttendance: number | null;
  daysOnSchedule: number | null;
  notes: string | null;
}

interface ParsedImportRow {
  staffName: string;
  month: string;
  year: number;
  totalTimeLate: string;
  daysLate: number;
  daysMissingFromAttendance?: number;
  daysOnSchedule?: number;
  matchedStaffId?: string;   // filled after matching
  matchedName?: string;
}

// ─── Excel Parser ─────────────────────────────────────────────────────────────

/** Find column index matching any keyword within a column range. Returns -1 if not found. */
function findColByKeyword(
  row: (string | number | null | undefined)[],
  startCol: number,
  endCol: number,
  keywords: string[],
): number {
  for (let ci = startCol; ci <= Math.min(endCol, row.length - 1); ci++) {
    const cell = String(row[ci] ?? "").toLowerCase().trim();
    if (keywords.some((k) => cell.includes(k))) return ci;
  }
  return -1;
}

/**
 * Parse the quarterly lateness Excel workbook.
 *
 * Supports two layouts:
 *   A) Wide / side-by-side — month names appear in a single header row, staff in rows below.
 *      Example: col A = Name, then groups of 2-4 cols per month (Time Late, Days Late, ...).
 *   B) Flat — each row is one staff × month record.
 *      Columns: Name | Month | Total Time Late | # Days Late [| Days Missing | Days On Schedule]
 */
function parseLatenessWorkbook(
  workbook: XLSX.WorkBook,
  year: number,
): ParsedImportRow[] {
  const results: ParsedImportRow[] = [];

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) continue;

    // Detect quarter from sheet name so we know which months to expect
    let sheetQuarter: number | null = null;
    if (/q1|jan/i.test(sheetName)) sheetQuarter = 1;
    else if (/q2|apr/i.test(sheetName)) sheetQuarter = 2;
    else if (/q3|jul/i.test(sheetName)) sheetQuarter = 3;
    else if (/q4|oct/i.test(sheetName)) sheetQuarter = 4;

    const quarterMonths: string[] =
      sheetQuarter != null ? (MONTHS_PER_QUARTER[sheetQuarter] ?? []) : [];

    // Convert sheet to raw 2D array of strings
    const raw = XLSX.utils.sheet_to_json<(string | number | null | undefined)[]>(sheet, {
      header: 1,
      raw: false,
      defval: null,
    });

    if (raw.length < 2) continue;

    // ── Detect layout ─────────────────────────────────────────────────────

    type MonthGroup = {
      month: string;
      timeLateCol: number;
      daysLateCol: number;
      daysMissingCol?: number;
      daysOnScheduleCol?: number;
    };

    let headerRowIdx = -1;
    let monthGroups: MonthGroup[] = [];
    let isFlatFormat = false;
    let flatCols = { month: -1, timeLate: -1, daysLate: -1, daysMissing: -1, daysOnSchedule: -1 };

    for (let ri = 0; ri < Math.min(12, raw.length); ri++) {
      const row = raw[ri] ?? [];

      // Check for month names in this row (wide format header)
      const foundMonths: Array<{ month: string; col: number }> = [];
      for (let ci = 0; ci < row.length; ci++) {
        const cell = String(row[ci] ?? "").trim();
        const matched = ALL_MONTHS.find((m) => m.toLowerCase() === cell.toLowerCase());
        if (matched) foundMonths.push({ month: matched, col: ci });
      }

      if (foundMonths.length >= 2 || (foundMonths.length === 1 && sheetQuarter !== null)) {
        // Wide format: sub-headers on the next row
        const subRow = raw[ri + 1] ?? [];

        monthGroups = foundMonths.map((fm, mi) => {
          const startCol = fm.col;
          const endCol =
            mi + 1 < foundMonths.length ? foundMonths[mi + 1]!.col - 1 : row.length - 1;

          const timeLateCol = findColByKeyword(subRow, startCol, endCol, [
            "time late", "total time", "hours",
          ]);
          const daysLateCol = findColByKeyword(subRow, startCol, endCol, [
            "days late", "# days",
          ]);
          const daysMissingCol = findColByKeyword(subRow, startCol, endCol, ["missing"]);
          const daysOnScheduleCol = findColByKeyword(subRow, startCol, endCol, [
            "on schedule", "scheduled",
          ]);

          return {
            month: fm.month,
            // If sub-headers not found, default to first two columns in the group
            timeLateCol: timeLateCol !== -1 ? timeLateCol : startCol,
            daysLateCol: daysLateCol !== -1 ? daysLateCol : startCol + 1,
            daysMissingCol: daysMissingCol !== -1 ? daysMissingCol : undefined,
            daysOnScheduleCol: daysOnScheduleCol !== -1 ? daysOnScheduleCol : undefined,
          };
        });

        // Data starts two rows below the month headers (skip month header + sub-header)
        headerRowIdx = ri + 1;
        break;
      }

      // Check for flat format header (Name, Month, Time Late, Days Late)
      const lrow = row.map((c) => String(c ?? "").toLowerCase().trim());
      const nameIdx = lrow.findIndex((c) => c === "name");
      const tlIdx = lrow.findIndex((c) => c.includes("time late") || c.includes("total time"));
      const dlIdx = lrow.findIndex((c) => c.includes("days late") || c === "# days late");

      if (nameIdx !== -1 && tlIdx !== -1 && dlIdx !== -1) {
        isFlatFormat = true;
        flatCols = {
          month: lrow.findIndex((c) => c === "month" || ALL_MONTHS.some((m) => m.toLowerCase() === c)),
          timeLate: tlIdx,
          daysLate: dlIdx,
          daysMissing: lrow.findIndex((c) => c.includes("missing")),
          daysOnSchedule: lrow.findIndex((c) => c.includes("on schedule") || c.includes("scheduled")),
        };
        headerRowIdx = ri;
        break;
      }
    }

    // ── Parse data rows ────────────────────────────────────────────────────
    const dataStart = headerRowIdx + 1;

    for (let ri = dataStart; ri < raw.length; ri++) {
      const row = raw[ri] ?? [];
      const nameCell = String(row[0] ?? "").trim();

      // Skip blank / header / subtotal rows
      if (
        !nameCell ||
        nameCell.toLowerCase() === "name" ||
        nameCell.toLowerCase().startsWith("total") ||
        nameCell.toLowerCase().startsWith("grand")
      ) {
        continue;
      }
      if (row.slice(1).every((c) => c == null || String(c).trim() === "")) continue;

      if (isFlatFormat) {
        // One row = one staff × month record
        const rawMonth =
          flatCols.month !== -1 ? String(row[flatCols.month] ?? "").trim() : "";
        const month =
          ALL_MONTHS.find((m) => m.toLowerCase() === rawMonth.toLowerCase()) ??
          quarterMonths[0] ??
          "";
        if (!month) continue;

        results.push({
          staffName: nameCell,
          month,
          year,
          totalTimeLate: normaliseTimeLate(row[flatCols.timeLate]),
          daysLate: toInt(row[flatCols.daysLate]),
          daysMissingFromAttendance:
            flatCols.daysMissing !== -1
              ? toIntOrUndefined(row[flatCols.daysMissing])
              : undefined,
          daysOnSchedule:
            flatCols.daysOnSchedule !== -1
              ? toIntOrUndefined(row[flatCols.daysOnSchedule])
              : undefined,
        });
      } else if (monthGroups.length > 0) {
        // Wide: one row = one staff, multiple month column groups
        for (const group of monthGroups) {
          const timeLate = normaliseTimeLate(row[group.timeLateCol]);
          const daysLate = toInt(row[group.daysLateCol]);
          // Skip cells that are clearly empty / zero-lateness
          if (row[group.timeLateCol] == null && row[group.daysLateCol] == null) continue;

          results.push({
            staffName: nameCell,
            month: group.month,
            year,
            totalTimeLate: timeLate,
            daysLate,
            daysMissingFromAttendance:
              group.daysMissingCol != null
                ? toIntOrUndefined(row[group.daysMissingCol])
                : undefined,
            daysOnSchedule:
              group.daysOnScheduleCol != null
                ? toIntOrUndefined(row[group.daysOnScheduleCol])
                : undefined,
          });
        }
      } else if (quarterMonths.length > 0) {
        // Positional fallback: cols 1-2 = Month1, 3-4 = Month2, 5-6 = Month3
        quarterMonths.forEach((month, idx) => {
          const baseCol = 1 + idx * 2;
          const timeLate = normaliseTimeLate(row[baseCol]);
          const daysLate = toInt(row[baseCol + 1]);
          if (row[baseCol] == null && row[baseCol + 1] == null) return;
          results.push({ staffName: nameCell, month, year, totalTimeLate: timeLate, daysLate });
        });
      }
    }
  }

  return results;
}

/** Normalise time formats: "1:30:00" → "1:30", "0:15:00" → "0:15", etc. */
function normaliseTimeLate(raw: string | number | null | undefined): string {
  if (raw === null || raw === undefined) return "0:00";
  const s = String(raw).trim();
  if (!s || s === "0" || s === "-") return "0:00";

  // HH:MM:SS → HH:MM
  const parts = s.split(":");
  if (parts.length >= 2) {
    const h = parseInt(parts[0] ?? "0", 10) || 0;
    const m = parseInt(parts[1] ?? "0", 10) || 0;
    return `${h}:${String(m).padStart(2, "0")}`;
  }
  return s;
}

function toInt(raw: string | number | null | undefined): number {
  if (raw === null || raw === undefined) return 0;
  const n = parseInt(String(raw), 10);
  return isNaN(n) ? 0 : n;
}

function toIntOrUndefined(raw: string | number | null | undefined): number | undefined {
  if (raw === null || raw === undefined) return undefined;
  const n = parseInt(String(raw), 10);
  return isNaN(n) ? undefined : n;
}

// ─── Upsert Dialog (create / edit one record) ────────────────────────────────

function UpsertDialog({
  open,
  onClose,
  year,
  month,
  existingRecord,
}: {
  open: boolean;
  onClose: () => void;
  year: number;
  month: string;
  existingRecord?: {
    id?: number;
    staffId?: string;
    totalTimeLate?: string;
    daysLate?: number;
    daysMissingFromAttendance?: number | null;
    daysOnSchedule?: number | null;
    notes?: string | null;
  };
}) {
  const qc = useQueryClient();
  const staffQuery = useQuery(orpc.staff.list.queryOptions({ input: { limit: 200, offset: 0 } }));
  const staffList = staffQuery.data ?? [];

  const isEdit = Boolean(existingRecord?.staffId);

  const [form, setForm] = useState({
    staffId: existingRecord?.staffId ?? "",
    totalTimeLate: existingRecord?.totalTimeLate ?? "0:00",
    daysLate: existingRecord?.daysLate ?? 0,
    daysMissingFromAttendance: existingRecord?.daysMissingFromAttendance ?? 0,
    daysOnSchedule: existingRecord?.daysOnSchedule ?? 0,
    notes: existingRecord?.notes ?? "",
  });

  const upsertMut = useMutation(
    orpc.lateness.upsert.mutationOptions({
      onSuccess: () => {
        toast.success(isEdit ? "Record updated" : "Record saved");
        qc.invalidateQueries({ queryKey: orpc.lateness.quarterlyGrid.key() });
        qc.invalidateQueries({ queryKey: orpc.lateness.list.key() });
        onClose();
      },
      onError: (e: Error) => toast.error(e.message),
    }),
  );

  const deleteMut = useMutation(
    orpc.lateness.delete.mutationOptions({
      onSuccess: () => {
        toast.success("Record deleted");
        qc.invalidateQueries({ queryKey: orpc.lateness.quarterlyGrid.key() });
        qc.invalidateQueries({ queryKey: orpc.lateness.list.key() });
        onClose();
      },
      onError: (e: Error) => toast.error(e.message),
    }),
  );

  function submit() {
    if (!form.staffId) {
      toast.error("Select a staff member");
      return;
    }
    upsertMut.mutate({
      staffId: form.staffId,
      year,
      month,
      totalTimeLate: form.totalTimeLate,
      daysLate: form.daysLate,
      daysMissingFromAttendance: form.daysMissingFromAttendance || undefined,
      daysOnSchedule: form.daysOnSchedule || undefined,
      notes: form.notes || undefined,
    });
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit" : "Add"} Lateness Record</DialogTitle>
          <DialogDescription>
            {month} {year} — per-staff monthly lateness data
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-1">
          {/* Staff (only shown when creating new) */}
          {!isEdit && (
            <div className="space-y-1.5">
              <Label htmlFor="lat-staff">Staff Member</Label>
              <Select
                value={form.staffId}
                onValueChange={(v) => v != null && setForm((c) => ({ ...c, staffId: v }))}
              >
                <SelectTrigger id="lat-staff">
                  <SelectValue>
                    {form.staffId
                      ? (() => {
                          const s = staffList.find(
                            (x: { id: string; employeeId: string; user?: { name?: string } | null }) =>
                              x.id === form.staffId,
                          );
                          return s?.user?.name ?? s?.employeeId ?? form.staffId;
                        })()
                      : "Select staff"}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {staffList.map(
                    (s: { id: string; employeeId: string; user?: { name?: string } | null }) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.user?.name ?? s.employeeId}
                      </SelectItem>
                    ),
                  )}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="lat-tl">Total Time Late</Label>
              <Input
                id="lat-tl"
                placeholder="e.g. 1:30"
                value={form.totalTimeLate}
                onChange={(e) => setForm((c) => ({ ...c, totalTimeLate: e.target.value }))}
              />
              <p className="text-xs text-muted-foreground">Format: H:MM</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="lat-dl">Days Late</Label>
              <Input
                id="lat-dl"
                type="number"
                min={0}
                value={form.daysLate}
                onChange={(e) =>
                  setForm((c) => ({ ...c, daysLate: parseInt(e.target.value) || 0 }))
                }
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="lat-dm">Days Missing</Label>
              <Input
                id="lat-dm"
                type="number"
                min={0}
                value={form.daysMissingFromAttendance}
                onChange={(e) =>
                  setForm((c) => ({
                    ...c,
                    daysMissingFromAttendance: parseInt(e.target.value) || 0,
                  }))
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="lat-dos">Days On Schedule</Label>
              <Input
                id="lat-dos"
                type="number"
                min={0}
                value={form.daysOnSchedule}
                onChange={(e) =>
                  setForm((c) => ({
                    ...c,
                    daysOnSchedule: parseInt(e.target.value) || 0,
                  }))
                }
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="lat-notes">Notes</Label>
            <Input
              id="lat-notes"
              value={form.notes}
              onChange={(e) => setForm((c) => ({ ...c, notes: e.target.value }))}
              placeholder="Optional notes…"
            />
          </div>
        </div>

        <DialogFooter className="flex-row items-center justify-between">
          {isEdit && existingRecord?.id != null && (
            <Button
              variant="ghost"
              size="sm"
              className="text-destructive hover:bg-destructive/10 mr-auto"
              disabled={deleteMut.isPending}
              onClick={() => {
                if (confirm("Delete this lateness record?")) {
                  deleteMut.mutate({ id: existingRecord.id! });
                }
              }}
            >
              <Trash2 className="size-3.5 mr-1" />
              Delete
            </Button>
          )}
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={onClose}
              disabled={upsertMut.isPending || deleteMut.isPending}
            >
              Cancel
            </Button>
            <Button
              onClick={submit}
              disabled={upsertMut.isPending || deleteMut.isPending}
            >
              {upsertMut.isPending ? "Saving…" : "Save"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Import Preview Dialog ────────────────────────────────────────────────────

function ImportPreviewDialog({
  rows,
  staffList,
  year,
  onClose,
}: {
  rows: ParsedImportRow[];
  staffList: Array<{ id: string; employeeId: string; user?: { name?: string } | null }>;
  year: number;
  onClose: () => void;
}) {
  const qc = useQueryClient();

  // Match names to staff IDs
  const enriched: ParsedImportRow[] = rows.map((row) => {
    const lower = row.staffName.toLowerCase();
    const match = staffList.find((s) => {
      const name = (s.user?.name ?? s.employeeId ?? "").toLowerCase();
      return name === lower || name.includes(lower) || lower.includes(name);
    });
    return {
      ...row,
      matchedStaffId: match?.id,
      matchedName: match?.user?.name ?? match?.employeeId,
    };
  });

  const matched = enriched.filter((r) => r.matchedStaffId);
  const unmatched = enriched.filter((r) => !r.matchedStaffId);

  const [importing, setImporting] = useState(false);

  const upsertMut = useMutation(orpc.lateness.upsert.mutationOptions());

  async function runImport() {
    if (matched.length === 0) {
      toast.error("No matchable staff found.");
      return;
    }
    setImporting(true);
    let imported = 0;
    let failed = 0;

    for (const row of matched) {
      try {
        await upsertMut.mutateAsync({
          staffId: row.matchedStaffId!,
          year: row.year,
          month: row.month,
          totalTimeLate: row.totalTimeLate,
          daysLate: row.daysLate,
          daysMissingFromAttendance: row.daysMissingFromAttendance,
          daysOnSchedule: row.daysOnSchedule,
        });
        imported++;
      } catch {
        failed++;
      }
    }

    setImporting(false);
    await qc.invalidateQueries({ queryKey: orpc.lateness.quarterlyGrid.key() });
    await qc.invalidateQueries({ queryKey: orpc.lateness.list.key() });

    if (failed > 0) {
      toast.warning(`Imported ${imported}, failed ${failed}`);
    } else {
      toast.success(`Imported ${imported} lateness records`);
    }
    onClose();
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Import Preview — {year}</DialogTitle>
          <DialogDescription>
            {enriched.length} rows parsed · {matched.length} matched to staff · {unmatched.length} unmatched
          </DialogDescription>
        </DialogHeader>

        {unmatched.length > 0 && (
          <div className="rounded-md bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 p-3 mb-2">
            <p className="text-xs font-semibold text-amber-800 dark:text-amber-300 mb-1">
              Unmatched staff names (will be skipped):
            </p>
            <p className="text-xs text-amber-700 dark:text-amber-400">
              {[...new Set(unmatched.map((r) => r.staffName))].join(", ")}
            </p>
          </div>
        )}

        <div className="rounded-md border overflow-hidden">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-muted border-b">
                <th className="text-left px-3 py-2">Staff Name</th>
                <th className="text-left px-3 py-2">Matched To</th>
                <th className="text-left px-3 py-2">Month</th>
                <th className="text-right px-3 py-2">Time Late</th>
                <th className="text-right px-3 py-2">Days Late</th>
                <th className="text-right px-3 py-2">Missing</th>
              </tr>
            </thead>
            <tbody>
              {enriched.slice(0, 100).map((row, i) => (
                <tr
                  key={i}
                  className={`border-b last:border-0 ${!row.matchedStaffId ? "opacity-40" : ""}`}
                >
                  <td className="px-3 py-1.5 font-medium">{row.staffName}</td>
                  <td className="px-3 py-1.5 text-muted-foreground">
                    {row.matchedName ?? (
                      <span className="text-amber-600">Not found</span>
                    )}
                  </td>
                  <td className="px-3 py-1.5">{row.month}</td>
                  <td className="px-3 py-1.5 text-right font-mono">{row.totalTimeLate}</td>
                  <td className="px-3 py-1.5 text-right">{row.daysLate}</td>
                  <td className="px-3 py-1.5 text-right text-muted-foreground">
                    {row.daysMissingFromAttendance ?? "—"}
                  </td>
                </tr>
              ))}
              {enriched.length > 100 && (
                <tr>
                  <td colSpan={6} className="px-3 py-2 text-center text-muted-foreground">
                    … and {enriched.length - 100} more rows
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={importing}>
            Cancel
          </Button>
          <Button onClick={runImport} disabled={importing || matched.length === 0}>
            {importing
              ? "Importing…"
              : `Import ${matched.length} record${matched.length !== 1 ? "s" : ""}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Quarter Grid ─────────────────────────────────────────────────────────────

function QuarterGrid({
  year,
  quarter,
  onAdd,
  onEdit,
}: {
  year: number;
  quarter: number;
  onAdd: (month: string) => void;
  onEdit: (month: string, staffId: string, rec: LatenessRec) => void;
}) {
  const months = MONTHS_PER_QUARTER[quarter] ?? [];
  const { data, isLoading } = useQuery(
    orpc.lateness.quarterlyGrid.queryOptions({ input: { year, quarter } }),
  );

  if (isLoading) {
    return (
      <div className="space-y-2 mt-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </div>
    );
  }

  const rows = data?.rows ?? [];

  return (
    <div className="mt-4 overflow-x-auto rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="sticky left-0 bg-background min-w-48">Staff</TableHead>
            <TableHead className="min-w-24">Dept</TableHead>
            {months.map((m) => (
              <TableHead key={m} colSpan={4} className="text-center border-l min-w-64">
                <div className="flex items-center justify-between px-2">
                  <span className="font-medium">{m}</span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    onClick={() => onAdd(m)}
                  >
                    <Plus className="size-3" />
                  </Button>
                </div>
              </TableHead>
            ))}
          </TableRow>
          <TableRow>
            <TableHead className="sticky left-0 bg-background" />
            <TableHead />
            {months.flatMap((m) => [
              <TableHead
                key={`${m}-tl`}
                className="text-xs text-muted-foreground border-l min-w-20"
              >
                Time Late
              </TableHead>,
              <TableHead key={`${m}-dl`} className="text-xs text-muted-foreground min-w-14">
                Days Late
              </TableHead>,
              <TableHead key={`${m}-dm`} className="text-xs text-muted-foreground min-w-14">
                Missing
              </TableHead>,
              <TableHead key={`${m}-dos`} className="text-xs text-muted-foreground min-w-14">
                Scheduled
              </TableHead>,
            ])}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.staffId}>
              <TableCell className="sticky left-0 bg-background font-medium text-sm">
                {row.staffName}
              </TableCell>
              <TableCell className="text-xs text-muted-foreground">
                {row.department ?? "—"}
              </TableCell>
              {months.flatMap((m) => {
                const rec = row.months[m];
                const hasLate = rec && rec.daysLate > 0;

                return [
                  <TableCell
                    key={`${m}-tl`}
                    className={`text-sm border-l cursor-pointer hover:bg-muted/40 ${hasLate ? "text-red-600 dark:text-red-400" : "text-muted-foreground"}`}
                    onClick={() =>
                      rec
                        ? onEdit(m, row.staffId, rec)
                        : onAdd(m)
                    }
                  >
                    {rec?.totalTimeLate ?? "—"}
                  </TableCell>,
                  <TableCell
                    key={`${m}-dl`}
                    className={`text-center text-sm cursor-pointer hover:bg-muted/40 ${hasLate ? "font-semibold text-red-600 dark:text-red-400" : "text-muted-foreground"}`}
                    onClick={() =>
                      rec
                        ? onEdit(m, row.staffId, rec)
                        : onAdd(m)
                    }
                  >
                    {rec?.daysLate ?? "—"}
                  </TableCell>,
                  <TableCell
                    key={`${m}-dm`}
                    className="text-center text-sm text-muted-foreground cursor-pointer hover:bg-muted/40"
                    onClick={() =>
                      rec
                        ? onEdit(m, row.staffId, rec)
                        : onAdd(m)
                    }
                  >
                    {rec?.daysMissingFromAttendance ?? "—"}
                  </TableCell>,
                  <TableCell
                    key={`${m}-dos`}
                    className="text-center text-sm text-muted-foreground cursor-pointer hover:bg-muted/40"
                    onClick={() =>
                      rec
                        ? onEdit(m, row.staffId, rec)
                        : onAdd(m)
                    }
                  >
                    {rec?.daysOnSchedule ?? "—"}
                  </TableCell>,
                ];
              })}
            </TableRow>
          ))}
          {rows.length === 0 && (
            <TableRow>
              <TableCell
                colSpan={2 + months.length * 4}
                className="h-24 text-center text-muted-foreground"
              >
                No lateness records for Q{quarter} {year}. Use + to add a record or import from Excel.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

function LatenessPage() {
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);
  const [activeQuarter, setActiveQuarter] = useState("1");

  // Upsert dialog state
  const [upsertDialog, setUpsertDialog] = useState<{
    month: string;
    existingRecord?: {
      id?: number;
      staffId?: string;
      totalTimeLate?: string;
      daysLate?: number;
      daysMissingFromAttendance?: number | null;
      daysOnSchedule?: number | null;
      notes?: string | null;
    };
  } | null>(null);

  // Import state
  const importRef = useRef<HTMLInputElement>(null);
  const [importRows, setImportRows] = useState<ParsedImportRow[] | null>(null);
  const staffQuery = useQuery(orpc.staff.list.queryOptions({ input: { limit: 200, offset: 0 } }));

  function handleImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = new Uint8Array(ev.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: "array" });
        const rows = parseLatenessWorkbook(workbook, year);
        if (rows.length === 0) {
          toast.error("No data found in the Excel file. Check the format.");
          return;
        }
        setImportRows(rows);
        toast.info(`Parsed ${rows.length} rows from Excel.`);
      } catch (err) {
        toast.error(`Failed to parse Excel: ${err instanceof Error ? err.message : "Unknown error"}`);
      }
    };
    reader.readAsArrayBuffer(file);

    // Reset file input
    if (importRef.current) importRef.current.value = "";
  }

  const YEARS = [currentYear - 2, currentYear - 1, currentYear, currentYear + 1];

  return (
    <>
      <Header>
        <div className="flex items-center gap-2">
          <Clock3 className="size-5" />
          <h1 className="text-lg font-semibold">Lateness Report</h1>
        </div>
        <div className="ml-auto flex items-center gap-3">
          <Select
            value={String(year)}
            onValueChange={(v) => v != null && setYear(Number(v))}
          >
            <SelectTrigger className="w-28">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {YEARS.map((y) => (
                <SelectItem key={y} value={String(y)}>
                  {y}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button
            size="sm"
            variant="outline"
            onClick={() => importRef.current?.click()}
          >
            <Upload className="size-4 mr-1.5" />
            Import Excel
          </Button>
          <input
            ref={importRef}
            type="file"
            accept=".xlsx,.xls"
            className="hidden"
            onChange={handleImportFile}
          />

          <ThemeSwitch />
        </div>
      </Header>

      <Main>
        <div className="mb-4">
          <p className="text-sm text-muted-foreground">
            Click any cell to edit. Use + to add a new record. Import from the quarterly Lateness Report Excel.
          </p>
        </div>

        <Tabs value={activeQuarter} onValueChange={setActiveQuarter}>
          <TabsList>
            <TabsTrigger value="1">Q1 (Jan–Mar)</TabsTrigger>
            <TabsTrigger value="2">Q2 (Apr–Jun)</TabsTrigger>
            <TabsTrigger value="3">Q3 (Jul–Sep)</TabsTrigger>
            <TabsTrigger value="4">Q4 (Oct–Dec)</TabsTrigger>
          </TabsList>

          {[1, 2, 3, 4].map((q) => (
            <TabsContent key={q} value={String(q)}>
              <QuarterGrid
                year={year}
                quarter={q}
                onAdd={(month) => setUpsertDialog({ month })}
                onEdit={(month, staffId, rec) =>
                  setUpsertDialog({
                    month,
                    existingRecord: {
                      id: rec.id ?? undefined,
                      staffId,
                      totalTimeLate: rec.totalTimeLate,
                      daysLate: rec.daysLate,
                      daysMissingFromAttendance: rec.daysMissingFromAttendance,
                      daysOnSchedule: rec.daysOnSchedule,
                      notes: rec.notes,
                    },
                  })
                }
              />
            </TabsContent>
          ))}
        </Tabs>
      </Main>

      {/* Upsert dialog (add or edit) */}
      {upsertDialog && (
        <UpsertDialog
          open
          onClose={() => setUpsertDialog(null)}
          year={year}
          month={upsertDialog.month}
          existingRecord={upsertDialog.existingRecord}
        />
      )}

      {/* Import preview dialog */}
      {importRows && (
        <ImportPreviewDialog
          rows={importRows}
          staffList={staffQuery.data ?? []}
          year={year}
          onClose={() => setImportRows(null)}
        />
      )}
    </>
  );
}
