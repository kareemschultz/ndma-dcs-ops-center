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

import { AttendanceSubNav } from "@/components/layout/attendance-sub-nav";
import { InfoPopover } from "@/components/info-popover";
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
//
// Format: "LatenessReportNOC&DC_YYYY_v01.xlsx"
//   Sheets: "1st Quarter", "2nd Quarter", "3rd Quarter", "4th Quarter"
//   Row 0: empty
//   Row 1: "Late" markers at cols 3, 8, 13
//   Row 2: column headers  (Name|Month|Hours:Minutes:Seconds|#DaysLate per group)
//   Row 3+: data — 3 INDEPENDENT lists side by side:
//     Group 1  → cols 1(Name) 2(Month) 3(Hours) 4(DaysLate)
//     Group 2  → cols 6(Name) 7(Month) 8(Hours) 9(DaysLate)
//     Group 3  → cols 11(Name) 12(Month) 13(Hours)
//                   Q1/Q2: 14(DaysMissing) 15(DaysOnSchedule)
//                   Q3/Q4: 14(DaysLate)
//   Each group is its own sorted staff list — staff in row N of Group 1
//   may be a DIFFERENT person than row N of Group 2.

/** Map the abbreviations used in the Excel to full month names stored in DB. */
const MONTH_ABBREV: Record<string, string> = {
  jan: "January", feb: "February", mar: "March",
  april: "April", may: "May", june: "June",
  july: "July", aug: "August", sept: "September", sep: "September",
  oct: "October", nov: "November", dec: "December",
};

function expandMonth(abbrev: unknown): string {
  if (abbrev == null) return "";
  const key = String(abbrev).trim().toLowerCase();
  return MONTH_ABBREV[key] ?? "";
}

/**
 * Format a stored "H:MM" lateness string as an unambiguous "1h 30m" label so
 * it can never be misread as minutes:seconds. "0:00" → "0m", "2:00" → "2h".
 */
function formatTimeLate(hm: string | null | undefined): string {
  if (hm == null || hm === "") return "—";
  const m = /^(\d+):(\d{1,2})/.exec(String(hm).trim());
  if (!m) return String(hm);
  const h = parseInt(m[1]!, 10);
  const min = parseInt(m[2]!, 10);
  if (h === 0 && min === 0) return "0m";
  if (h === 0) return `${min}m`;
  if (min === 0) return `${h}h`;
  return `${h}h ${min}m`;
}

/**
 * Convert an Excel time value to "H:MM" string.
 * Excel stores times as fractions of a day (e.g. 2h28m → 0.10278).
 * XLSX.js with raw:true returns these as numbers; string 'nil'/'Nil' → "0:00".
 */
function normaliseTimeLate(raw: unknown): string {
  if (raw == null) return "0:00";

  if (typeof raw === "number") {
    // Fraction of day → minutes
    const totalMins = Math.round(raw * 24 * 60);
    const h = Math.floor(totalMins / 60);
    const m = totalMins % 60;
    return `${h}:${String(m).padStart(2, "0")}`;
  }

  const s = String(raw).trim().toLowerCase();
  if (!s || s === "nil" || s === "n/a" || s === "-" || s === "0") return "0:00";

  // "H:MM:SS" or "H:MM" string
  const parts = s.split(":");
  if (parts.length >= 2) {
    const h = parseInt(parts[0] ?? "0", 10) || 0;
    const mn = parseInt(parts[1] ?? "0", 10) || 0;
    return `${h}:${String(mn).padStart(2, "0")}`;
  }

  return "0:00";
}

/**
 * Parse a days-late cell — some cells contain free text like
 * "2 only the 3rd day was a clock out"; extract the leading integer.
 */
function toInt(raw: unknown): number {
  if (raw == null) return 0;
  if (typeof raw === "number") return Math.round(raw);
  const match = String(raw).match(/^(\d+)/);
  return match ? parseInt(match[1]!, 10) : 0;
}

function toIntOrUndefined(raw: unknown): number | undefined {
  if (raw == null) return undefined;
  if (typeof raw === "number") return Math.round(raw);
  const match = String(raw).match(/^(\d+)/);
  return match ? parseInt(match[1]!, 10) : undefined;
}

/** Skip rows that are clearly footer / note rows (not staff names). */
function isNoteRow(name: string): boolean {
  const l = name.toLowerCase();
  return (
    l.startsWith("noc staff") ||
    l.startsWith("total") ||
    l.startsWith("grand") ||
    l.startsWith("note") ||
    l === "name"
  );
}

/**
 * Parse one column group (nameCol, monthCol, hoursCol, col4).
 * col4 is either DaysLate (groups 1 & 2, and group 3 Q3/Q4)
 * or DaysMissing (group 3 Q1/Q2).
 */
function parseGroup(
  row: unknown[],
  nameCol: number,
  monthCol: number,
  hoursCol: number,
  col4: number,
  col5: number | null, // daysOnSchedule (group 3 Q1/Q2 only)
  col4IsDaysMissing: boolean,
  year: number,
): ParsedImportRow | null {
  const name = String(row[nameCol] ?? "").trim();
  if (!name || isNoteRow(name)) return null;

  const month = expandMonth(row[monthCol]);
  if (!month) return null;

  const timeLate = normaliseTimeLate(row[hoursCol]);
  const col4Val = row[col4];
  const col5Val = col5 != null ? row[col5] : undefined;

  if (col4IsDaysMissing) {
    return {
      staffName: name,
      month,
      year,
      totalTimeLate: timeLate,
      daysLate: 0,               // not recorded for this group/quarter combo
      daysMissingFromAttendance: toIntOrUndefined(col4Val),
      daysOnSchedule: toIntOrUndefined(col5Val),
    };
  }

  return {
    staffName: name,
    month,
    year,
    totalTimeLate: timeLate,
    daysLate: toInt(col4Val),
  };
}

/**
 * Parse the quarterly lateness Excel workbook.
 * Handles the exact "LatenessReportNOC&DC" format with fixed column positions.
 */
function parseLatenessWorkbook(
  workbook: XLSX.WorkBook,
  year: number,
): ParsedImportRow[] {
  const results: ParsedImportRow[] = [];

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) continue;

    // Detect quarter from sheet name: "1st Quarter", "2nd Quarter", etc.
    let quarter: 1 | 2 | 3 | 4 | null = null;
    if (/1st/i.test(sheetName)) quarter = 1;
    else if (/2nd/i.test(sheetName)) quarter = 2;
    else if (/3rd/i.test(sheetName)) quarter = 3;
    else if (/4th/i.test(sheetName)) quarter = 4;

    if (quarter === null) continue; // skip unrecognised sheets

    // Q1 and Q2 group-3 uses DaysMissing+DaysOnSchedule instead of DaysLate
    const group3IsDaysMissing = quarter === 1 || quarter === 2;

    // Read with raw:true so Excel time fractions come through as numbers
    const raw = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
      header: 1,
      raw: true,
      defval: null,
    });

    // Data starts at row index 3 (rows 0-2 are header rows)
    const DATA_START = 3;

    for (let ri = DATA_START; ri < raw.length; ri++) {
      const row = raw[ri] ?? [];

      // Group 1: cols 1(Name) 2(Month) 3(Hours) 4(DaysLate)
      const g1 = parseGroup(row, 1, 2, 3, 4, null, false, year);
      if (g1) results.push(g1);

      // Group 2: cols 6(Name) 7(Month) 8(Hours) 9(DaysLate)
      const g2 = parseGroup(row, 6, 7, 8, 9, null, false, year);
      if (g2) results.push(g2);

      // Group 3: cols 11(Name) 12(Month) 13(Hours) 14(DaysMissing or DaysLate) [15(DaysOnSchedule)]
      const g3 = parseGroup(
        row, 11, 12, 13, 14,
        group3IsDaysMissing ? 15 : null,
        group3IsDaysMissing,
        year,
      );
      if (g3) results.push(g3);
    }
  }

  // De-duplicate: same staffName × month can appear in multiple groups across sheets
  const seen = new Set<string>();
  return results.filter((r) => {
    const key = `${r.staffName}|${r.month}|${r.year}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
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
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);

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
    <>
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
                          return s?.user?.name ?? s?.employeeId ?? "Unnamed";
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
              <p className="text-xs text-muted-foreground">
                Hours:Minutes — e.g. <span className="font-mono">1:30</span> = 1h 30m
              </p>
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
              onClick={() => setConfirmDeleteOpen(true)}
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

    <Dialog
      open={confirmDeleteOpen}
      onOpenChange={(o) => { if (!o) setConfirmDeleteOpen(false); }}
    >
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Delete Lateness Record</DialogTitle>
          <DialogDescription>
            Permanently delete the {month} {year} lateness record for this
            staff member? This cannot be undone.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            onClick={() => setConfirmDeleteOpen(false)}
            disabled={deleteMut.isPending}
          >
            Cancel
          </Button>
          <Button
            variant="destructive"
            disabled={deleteMut.isPending}
            onClick={() => {
              if (existingRecord?.id != null) {
                deleteMut.mutate({ id: existingRecord.id });
              }
              setConfirmDeleteOpen(false);
            }}
          >
            {deleteMut.isPending ? "Deleting…" : "Delete"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </>
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
                  <td className="px-3 py-1.5 text-right font-mono">{formatTimeLate(row.totalTimeLate)}</td>
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
            <TableHead
              colSpan={2}
              className="text-center border-l min-w-32 bg-muted/40"
              title="Combined late time and late days across all three months of the quarter."
            >
              <span className="font-semibold">Quarter Total</span>
            </TableHead>
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
                <span className="inline-flex items-center gap-1">
                  Missing
                  <InfoPopover label="About the Missing column">
                    Days the person had no attendance record at all — neither
                    present nor on leave.
                  </InfoPopover>
                </span>
              </TableHead>,
              <TableHead key={`${m}-dos`} className="text-xs text-muted-foreground min-w-14">
                <span className="inline-flex items-center gap-1">
                  Scheduled
                  <InfoPopover label="About the Scheduled column">
                    Days the person arrived on time.
                  </InfoPopover>
                </span>
              </TableHead>,
            ])}
            <TableHead className="text-xs text-muted-foreground border-l min-w-20 bg-muted/40">
              Time Late
            </TableHead>
            <TableHead
              className="text-xs text-muted-foreground min-w-14 bg-muted/40"
              title="Combined late time and late days across all three months of the quarter."
            >
              Days Late
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => {
            const derived = (row as { derived?: Record<string, { totalTimeLate: string; daysLate: number }> }).derived ?? {};
            const quarterTotal = (row as { quarterTotal?: { totalTimeLate: string; daysLate: number } }).quarterTotal
              ?? { totalTimeLate: "0:00", daysLate: 0 };
            return (
            <TableRow key={row.staffId}>
              <TableCell className="sticky left-0 bg-background font-medium text-sm">
                {row.staffName}
              </TableCell>
              <TableCell className="text-xs text-muted-foreground">
                {row.department ?? "—"}
              </TableCell>
              {months.flatMap((m) => {
                const rec = row.months[m];
                const der = derived[m];
                const hasLate = rec && rec.daysLate > 0;

                return [
                  <TableCell
                    key={`${m}-tl`}
                    title={!rec && der ? "Inferred from clock-in logs — no record was entered for this month." : undefined}
                    className={`text-sm border-l cursor-pointer hover:bg-muted/40 ${
                      hasLate ? "text-red-600 dark:text-red-400"
                        : !rec && der ? "italic text-amber-600 dark:text-amber-400"
                        : "text-muted-foreground"
                    }`}
                    onClick={() => (rec ? onEdit(m, row.staffId, rec) : onAdd(m))}
                  >
                    {rec ? formatTimeLate(rec.totalTimeLate) : der ? formatTimeLate(der.totalTimeLate) : "—"}
                  </TableCell>,
                  <TableCell
                    key={`${m}-dl`}
                    title={!rec && der ? "Inferred from clock-in logs — no record was entered for this month." : undefined}
                    className={`text-center text-sm cursor-pointer hover:bg-muted/40 ${
                      hasLate ? "font-semibold text-red-600 dark:text-red-400"
                        : !rec && der ? "italic text-amber-600 dark:text-amber-400"
                        : "text-muted-foreground"
                    }`}
                    onClick={() => (rec ? onEdit(m, row.staffId, rec) : onAdd(m))}
                  >
                    {rec?.daysLate ?? der?.daysLate ?? "—"}
                  </TableCell>,
                  <TableCell
                    key={`${m}-dm`}
                    className="text-center text-sm text-muted-foreground cursor-pointer hover:bg-muted/40"
                    onClick={() => (rec ? onEdit(m, row.staffId, rec) : onAdd(m))}
                  >
                    {rec?.daysMissingFromAttendance ?? "—"}
                  </TableCell>,
                  <TableCell
                    key={`${m}-dos`}
                    className="text-center text-sm text-muted-foreground cursor-pointer hover:bg-muted/40"
                    onClick={() => (rec ? onEdit(m, row.staffId, rec) : onAdd(m))}
                  >
                    {rec?.daysOnSchedule ?? "—"}
                  </TableCell>,
                ];
              })}
              <TableCell className="border-l bg-muted/30 text-sm font-semibold tabular-nums">
                {formatTimeLate(quarterTotal.totalTimeLate)}
              </TableCell>
              <TableCell className="bg-muted/30 text-center text-sm font-semibold tabular-nums">
                {quarterTotal.daysLate === 0 ? "—" : `${quarterTotal.daysLate} ${quarterTotal.daysLate === 1 ? "day" : "days"}`}
              </TableCell>
            </TableRow>
            );
          })}
          {rows.length === 0 && (
            <TableRow>
              <TableCell
                colSpan={2 + months.length * 4 + 2}
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
  const now = new Date();
  const currentYear = now.getFullYear();
  // Open on the quarter that contains today's date (Q1 Jan–Mar … Q4 Oct–Dec)
  // so freshly-logged data for the current month is visible without switching.
  const currentQuarter = String(Math.floor(now.getMonth() / 3) + 1);
  const [year, setYear] = useState(currentYear);
  const [activeQuarter, setActiveQuarter] = useState(currentQuarter);

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

      <AttendanceSubNav activeView="lateness" />

      <Main>
        <div className="mb-4">
          <p className="text-sm text-muted-foreground">
            Click any cell to edit. Use + to add a new record. Import from the quarterly Lateness Report Excel.
            The <span className="italic text-amber-600 dark:text-amber-400">amber italic</span> values are
            inferred from clock-in logs where no record was keyed in; the <span className="font-semibold">Quarter
            Total</span> column sums each staff member's late time and days late across the quarter.
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
