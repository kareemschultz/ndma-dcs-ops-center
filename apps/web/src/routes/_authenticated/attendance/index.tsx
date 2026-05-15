// /attendance — Attendance & Time
//
// Tabs:
//   Lateness Dashboard — quarterly lateness summary table (read-only here; edit on /lateness)
//   Clock Logs        — daily clock-in/out per staff; full CRUD (add, edit times, delete)

import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useRef, useState } from "react";
import {
  ClipboardList,
  Clock3,
  Pencil,
  Plus,
  SortAsc,
  SortDesc,
  Trash2,
  Upload,
} from "lucide-react";
import * as XLSX from "xlsx";
import { format, parseISO } from "date-fns";
import { toast } from "sonner";

import { Badge } from "@ndma-dcs-staff-portal/ui/components/badge";
import { Button } from "@ndma-dcs-staff-portal/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@ndma-dcs-staff-portal/ui/components/card";
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
import { AttendanceSubNav } from "@/components/layout/attendance-sub-nav";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@ndma-dcs-staff-portal/ui/components/table";

import { Header } from "@/components/layout/header";
import { Main } from "@/components/layout/main";
import { ThemeSwitch } from "@/components/theme-switch";
import { orpc } from "@/utils/orpc";

export const Route = createFileRoute("/_authenticated/attendance/")({
  component: AttendancePage,
});

// ─── Types ────────────────────────────────────────────────────────────────────

type AttendanceStatus = "Workday" | "Restday" | "Absent" | "Leave" | "Holiday";

const STATUS_OPTIONS: AttendanceStatus[] = ["Workday", "Restday", "Absent", "Leave", "Holiday"];

const STATUS_CLASS: Record<AttendanceStatus, string> = {
  Workday: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  Restday: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400",
  Absent: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
  Leave: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
  Holiday: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatTime(value?: string | null) {
  if (!value) return "—";
  // value is "HH:MM:SS" from Postgres — display as HH:MM
  const parts = value.split(":");
  if (parts.length >= 2) return `${parts[0]}:${parts[1]}`;
  return value;
}

function minutesLate(clockIn?: string | null): number | null {
  if (!clockIn) return null;
  const parts = clockIn.split(":");
  const h = parseInt(parts[0] ?? "0", 10);
  const m = parseInt(parts[1] ?? "0", 10);
  const totalMins = h * 60 + m;
  const grace = 8 * 60 + 15; // 08:15
  return totalMins > grace ? totalMins - grace : null;
}

// ─── Log Dialog (create + edit) ───────────────────────────────────────────────

interface LogDialogProps {
  mode: "create" | "edit";
  existing?: {
    id: number;
    staffId: string;
    date: string;
    status: AttendanceStatus;
    clockIn?: string | null;
    clockOut?: string | null;
    workHours?: string | null;
  };
  onClose: () => void;
}

function LogDialog({ mode, existing, onClose }: LogDialogProps) {
  const qc = useQueryClient();
  const staffQuery = useQuery(orpc.staff.list.queryOptions({ input: { limit: 200, offset: 0 } }));
  const staffList = staffQuery.data ?? [];

  const toTimeInput = (dbTime?: string | null) => {
    if (!dbTime) return "";
    // Postgres returns "HH:MM:SS" — input[type=time] wants "HH:MM"
    return dbTime.slice(0, 5);
  };

  const [form, setForm] = useState({
    staffProfileId: existing?.staffId ?? "",
    date: existing?.date ?? new Date().toISOString().slice(0, 10),
    status: (existing?.status ?? "Workday") as AttendanceStatus,
    clockIn: toTimeInput(existing?.clockIn),
    clockOut: toTimeInput(existing?.clockOut),
    workHours: existing?.workHours ?? "",
  });

  // Auto-calculate work hours when both times are set
  function computeWorkHours(ci: string, co: string): string {
    if (!ci || !co) return "";
    const [ih, im] = ci.split(":").map(Number);
    const [oh, om] = co.split(":").map(Number);
    if (ih == null || im == null || oh == null || om == null) return "";
    const diff = (oh * 60 + om) - (ih * 60 + im);
    if (diff <= 0) return "";
    return (diff / 60).toFixed(2);
  }

  function handleTimeChange(field: "clockIn" | "clockOut", val: string) {
    setForm((prev) => {
      const next = { ...prev, [field]: val };
      const auto = computeWorkHours(
        field === "clockIn" ? val : prev.clockIn,
        field === "clockOut" ? val : prev.clockOut,
      );
      if (auto) next.workHours = auto;
      return next;
    });
  }

  const createMut = useMutation(
    orpc.attendanceTime.logs.create.mutationOptions({
      onSuccess: async () => {
        toast.success("Log entry created");
        await qc.invalidateQueries({ queryKey: orpc.attendanceTime.logs.list.key() });
        onClose();
      },
      onError: (e: Error) => toast.error(e.message),
    }),
  );

  const updateMut = useMutation(
    orpc.attendanceTime.logs.update.mutationOptions({
      onSuccess: async () => {
        toast.success("Log entry updated");
        await qc.invalidateQueries({ queryKey: orpc.attendanceTime.logs.list.key() });
        onClose();
      },
      onError: (e: Error) => toast.error(e.message),
    }),
  );

  const deleteMut = useMutation(
    orpc.attendanceTime.logs.delete.mutationOptions({
      onSuccess: async () => {
        toast.success("Log entry deleted");
        await qc.invalidateQueries({ queryKey: orpc.attendanceTime.logs.list.key() });
        onClose();
      },
      onError: (e: Error) => toast.error(e.message),
    }),
  );

  const isPending = createMut.isPending || updateMut.isPending || deleteMut.isPending;

  function submit() {
    if (mode === "create") {
      if (!form.staffProfileId || !form.date) {
        toast.error("Staff and date are required.");
        return;
      }
      createMut.mutate({
        staffProfileId: form.staffProfileId,
        date: form.date,
        status: form.status,
        clockIn: form.clockIn || undefined,
        clockOut: form.clockOut || undefined,
        workHours: form.workHours || undefined,
      });
    } else if (existing) {
      updateMut.mutate({
        id: existing.id,
        status: form.status,
        clockIn: form.clockIn || null,
        clockOut: form.clockOut || null,
        workHours: form.workHours || null,
      });
    }
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{mode === "create" ? "Add Clock Log" : "Edit Clock Log"}</DialogTitle>
          <DialogDescription>
            {mode === "create"
              ? "Record a staff attendance entry."
              : `Editing log for ${existing?.date ?? ""}`}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-1">
          {/* Staff — only for create */}
          {mode === "create" && (
            <div className="space-y-1.5">
              <Label>Staff Member</Label>
              <Select
                value={form.staffProfileId}
                onValueChange={(v) => v != null && setForm((c) => ({ ...c, staffProfileId: v }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select staff…" />
                </SelectTrigger>
                <SelectContent>
                  {staffList.map((s: { id: string; user?: { name?: string } | null }) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.user?.name ?? s.id}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Date — only for create */}
          {mode === "create" && (
            <div className="space-y-1.5">
              <Label htmlFor="log-date">Date</Label>
              <Input
                id="log-date"
                type="date"
                value={form.date}
                onChange={(e) => setForm((c) => ({ ...c, date: e.target.value }))}
              />
            </div>
          )}

          {/* Status */}
          <div className="space-y-1.5">
            <Label>Status</Label>
            <Select
              value={form.status}
              onValueChange={(v) => v != null && setForm((c) => ({ ...c, status: v as AttendanceStatus }))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map((s) => (
                  <SelectItem key={s} value={s}>{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Clock In / Clock Out */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="log-clockin">Clock In</Label>
              <Input
                id="log-clockin"
                type="time"
                value={form.clockIn}
                onChange={(e) => handleTimeChange("clockIn", e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="log-clockout">Clock Out</Label>
              <Input
                id="log-clockout"
                type="time"
                value={form.clockOut}
                onChange={(e) => handleTimeChange("clockOut", e.target.value)}
              />
            </div>
          </div>

          {/* Work Hours */}
          <div className="space-y-1.5">
            <Label htmlFor="log-wh">Work Hours</Label>
            <Input
              id="log-wh"
              type="number"
              step="0.25"
              min="0"
              placeholder="Auto-calculated from clock in/out"
              value={form.workHours}
              onChange={(e) => setForm((c) => ({ ...c, workHours: e.target.value }))}
            />
            <p className="text-xs text-muted-foreground">
              Leave blank to auto-calculate from clock times.
            </p>
          </div>
        </div>

        <DialogFooter className="flex-row items-center justify-between">
          {mode === "edit" && existing && (
            <Button
              variant="ghost"
              size="sm"
              className="text-destructive hover:bg-destructive/10 mr-auto"
              disabled={isPending}
              onClick={() => {
                if (confirm("Delete this attendance log entry?")) {
                  deleteMut.mutate({ id: existing.id });
                }
              }}
            >
              <Trash2 className="size-3.5 mr-1" />
              Delete
            </Button>
          )}
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose} disabled={isPending}>
              Cancel
            </Button>
            <Button onClick={submit} disabled={isPending}>
              {isPending ? "Saving…" : mode === "create" ? "Add Log" : "Save Changes"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Excel Parser (LatenessReportNOC&DC format) ───────────────────────────────

interface ParsedImportRow {
  staffName: string;
  month: string;
  year: number;
  totalTimeLate: string;
  daysLate: number;
  daysMissingFromAttendance?: number;
  daysOnSchedule?: number;
  matchedStaffId?: string;
  matchedName?: string;
}

const MONTH_ABBREV: Record<string, string> = {
  jan: "January", feb: "February", mar: "March",
  april: "April", may: "May", june: "June",
  july: "July", aug: "August", sept: "September", sep: "September",
  oct: "October", nov: "November", dec: "December",
};

function expandMonth(raw: unknown): string {
  if (raw == null) return "";
  return MONTH_ABBREV[String(raw).trim().toLowerCase()] ?? "";
}

function normaliseTimeLate(raw: unknown): string {
  if (raw == null) return "0:00";
  if (typeof raw === "number") {
    const totalMins = Math.round(raw * 24 * 60);
    const h = Math.floor(totalMins / 60);
    const m = totalMins % 60;
    return `${h}:${String(m).padStart(2, "0")}`;
  }
  const s = String(raw).trim().toLowerCase();
  if (!s || s === "nil" || s === "n/a" || s === "-" || s === "0") return "0:00";
  const parts = s.split(":");
  if (parts.length >= 2) {
    const h = parseInt(parts[0] ?? "0", 10) || 0;
    const mn = parseInt(parts[1] ?? "0", 10) || 0;
    return `${h}:${String(mn).padStart(2, "0")}`;
  }
  return "0:00";
}

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

function isNoteRow(name: string): boolean {
  const l = name.toLowerCase();
  return (
    l.startsWith("noc staff") || l.startsWith("total") || l.startsWith("grand") ||
    l.startsWith("note") || l === "name"
  );
}

function parseGroup(
  row: unknown[],
  nameCol: number,
  monthCol: number,
  hoursCol: number,
  col4: number,
  col5: number | null,
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
      staffName: name, month, year, totalTimeLate: timeLate, daysLate: 0,
      daysMissingFromAttendance: toIntOrUndefined(col4Val),
      daysOnSchedule: toIntOrUndefined(col5Val),
    };
  }
  return { staffName: name, month, year, totalTimeLate: timeLate, daysLate: toInt(col4Val) };
}

function parseLatenessWorkbook(workbook: XLSX.WorkBook, year: number): ParsedImportRow[] {
  const results: ParsedImportRow[] = [];
  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) continue;
    let quarter: 1 | 2 | 3 | 4 | null = null;
    if (/1st/i.test(sheetName)) quarter = 1;
    else if (/2nd/i.test(sheetName)) quarter = 2;
    else if (/3rd/i.test(sheetName)) quarter = 3;
    else if (/4th/i.test(sheetName)) quarter = 4;
    if (quarter === null) continue;
    const group3IsDaysMissing = quarter === 1 || quarter === 2;
    const raw = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: true, defval: null });
    const DATA_START = 3;
    for (let ri = DATA_START; ri < raw.length; ri++) {
      const row = raw[ri] ?? [];
      const g1 = parseGroup(row, 1, 2, 3, 4, null, false, year);
      if (g1) results.push(g1);
      const g2 = parseGroup(row, 6, 7, 8, 9, null, false, year);
      if (g2) results.push(g2);
      const g3 = parseGroup(row, 11, 12, 13, 14, group3IsDaysMissing ? 15 : null, group3IsDaysMissing, year);
      if (g3) results.push(g3);
    }
  }
  const seen = new Set<string>();
  return results.filter((r) => {
    const key = `${r.staffName}|${r.month}|${r.year}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
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

  const enriched: ParsedImportRow[] = rows.map((row) => {
    const lower = row.staffName.toLowerCase();
    const match = staffList.find((s) => {
      const name = (s.user?.name ?? s.employeeId ?? "").toLowerCase();
      return name === lower || name.includes(lower) || lower.includes(name);
    });
    return { ...row, matchedStaffId: match?.id, matchedName: match?.user?.name ?? match?.employeeId };
  });

  const matched = enriched.filter((r) => r.matchedStaffId);
  const unmatched = enriched.filter((r) => !r.matchedStaffId);
  const [importing, setImporting] = useState(false);
  const upsertMut = useMutation(orpc.lateness.upsert.mutationOptions());

  async function runImport() {
    if (matched.length === 0) { toast.error("No matchable staff found."); return; }
    setImporting(true);
    let imported = 0, failed = 0;
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
      } catch { failed++; }
    }
    setImporting(false);
    await qc.invalidateQueries({ queryKey: orpc.attendanceTime.lateness.list.key() });
    await qc.invalidateQueries({ queryKey: orpc.lateness.quarterlyGrid.key() });
    await qc.invalidateQueries({ queryKey: orpc.lateness.list.key() });
    if (failed > 0) toast.warning(`Imported ${imported}, failed ${failed}`);
    else toast.success(`Imported ${imported} lateness records`);
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
              Unmatched names (will be skipped):
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
                <th className="text-left px-3 py-2">Name in Excel</th>
                <th className="text-left px-3 py-2">Matched To</th>
                <th className="text-left px-3 py-2">Month</th>
                <th className="text-right px-3 py-2">Time Late</th>
                <th className="text-right px-3 py-2">Days Late</th>
                <th className="text-right px-3 py-2">Missing</th>
              </tr>
            </thead>
            <tbody>
              {enriched.slice(0, 120).map((row, i) => (
                <tr key={i} className={`border-b last:border-0 ${!row.matchedStaffId ? "opacity-40" : ""}`}>
                  <td className="px-3 py-1.5 font-medium">{row.staffName}</td>
                  <td className="px-3 py-1.5 text-muted-foreground">
                    {row.matchedName ?? <span className="text-amber-600">Not found</span>}
                  </td>
                  <td className="px-3 py-1.5">{row.month}</td>
                  <td className="px-3 py-1.5 text-right font-mono">{row.totalTimeLate}</td>
                  <td className="px-3 py-1.5 text-right">{row.daysLate}</td>
                  <td className="px-3 py-1.5 text-right text-muted-foreground">
                    {row.daysMissingFromAttendance ?? "—"}
                  </td>
                </tr>
              ))}
              {enriched.length > 120 && (
                <tr>
                  <td colSpan={6} className="px-3 py-2 text-center text-muted-foreground">
                    … and {enriched.length - 120} more rows
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={importing}>Cancel</Button>
          <Button onClick={runImport} disabled={importing || matched.length === 0}>
            {importing ? "Importing…" : `Import ${matched.length} record${matched.length !== 1 ? "s" : ""}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Lateness Tab ─────────────────────────────────────────────────────────────

function LatenessTab() {
  const currentYear = new Date().getFullYear();
  const [sortKey, setSortKey] = useState<"late" | "days">("late");
  const [importYear, setImportYear] = useState(currentYear - 1); // default prior year
  const [importRows, setImportRows] = useState<ParsedImportRow[] | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const staffQuery = useQuery(orpc.staff.list.queryOptions({ input: { limit: 200, offset: 0 } }));

  const { data: latenessRows, isLoading } = useQuery(
    orpc.attendanceTime.lateness.list.queryOptions({ input: {} }),
  );

  const sorted = useMemo(() => {
    const rows = [...(latenessRows ?? [])];
    return rows.sort((a, b) =>
      sortKey === "days"
        ? (b.daysLate ?? 0) - (a.daysLate ?? 0)
        : String(b.totalTimeLate ?? "").localeCompare(String(a.totalTimeLate ?? "")),
    );
  }, [latenessRows, sortKey]);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = new Uint8Array(ev.target?.result as ArrayBuffer);
        const wb = XLSX.read(data, { type: "array" });
        const rows = parseLatenessWorkbook(wb, importYear);
        if (rows.length === 0) {
          toast.error("No records found. Check the file format.");
        } else {
          setImportRows(rows);
        }
      } catch {
        toast.error("Failed to parse Excel file.");
      }
      // reset so same file can be re-picked
      if (fileInputRef.current) fileInputRef.current.value = "";
    };
    reader.readAsArrayBuffer(file);
  }

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept=".xlsx,.xls"
        className="hidden"
        onChange={handleFileChange}
      />

      {importRows && (
        <ImportPreviewDialog
          rows={importRows}
          staffList={(staffQuery.data ?? []) as Array<{ id: string; employeeId: string; user?: { name?: string } | null }>}
          year={importYear}
          onClose={() => setImportRows(null)}
        />
      )}

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
          <CardTitle className="text-base">Lateness Records</CardTitle>
          <div className="flex items-center gap-2">
            <button
              className={`inline-flex items-center gap-1 rounded-md border px-3 py-1.5 text-xs ${sortKey === "late" ? "bg-primary text-primary-foreground" : ""}`}
              onClick={() => setSortKey("late")}
            >
              <SortAsc className="size-3.5" />
              Total Time Late
            </button>
            <button
              className={`inline-flex items-center gap-1 rounded-md border px-3 py-1.5 text-xs ${sortKey === "days" ? "bg-primary text-primary-foreground" : ""}`}
              onClick={() => setSortKey("days")}
            >
              <SortDesc className="size-3.5" />
              Days Late
            </button>

            {/* Year selector for import */}
            <Select
              value={String(importYear)}
              onValueChange={(v) => v != null && setImportYear(Number(v))}
            >
              <SelectTrigger className="w-24 h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[currentYear - 2, currentYear - 1, currentYear].map((y) => (
                  <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Button
              size="sm"
              variant="outline"
              className="h-8 text-xs gap-1.5"
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload className="size-3.5" />
              Import Excel
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Staff</TableHead>
                <TableHead>Year</TableHead>
                <TableHead>Month</TableHead>
                <TableHead>Total Time Late</TableHead>
                <TableHead>Days Late</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 5 }).map((_, j) => (
                      <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                    ))}
                  </TableRow>
                ))
              ) : sorted.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">
                    No lateness records yet. Use <strong>Import Excel</strong> to load from the Lateness Report.
                  </TableCell>
                </TableRow>
              ) : (
                sorted.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="font-medium">{row.staffProfile?.user?.name ?? "—"}</TableCell>
                    <TableCell>{row.year}</TableCell>
                    <TableCell>{row.month}</TableCell>
                    <TableCell className="font-mono">{row.totalTimeLate}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{row.daysLate}</Badge>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </>
  );
}

// ─── Clock Logs Tab ───────────────────────────────────────────────────────────

function ClockLogsTab() {
  const navigate = useNavigate();
  const [staffFilter, setStaffFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [teamFilter, setTeamFilter] = useState<string>("all");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [dialog, setDialog] = useState<
    | { mode: "create" }
    | {
        mode: "edit";
        entry: {
          id: number;
          staffId: string;
          date: string;
          status: AttendanceStatus;
          clockIn?: string | null;
          clockOut?: string | null;
          workHours?: string | null;
        };
      }
    | null
  >(null);

  const staffQuery = useQuery(orpc.staff.list.queryOptions({ input: { limit: 200, offset: 0 } }));

  const { data: logs, isLoading } = useQuery(
    orpc.attendanceTime.logs.list.queryOptions({
      input: {
        staffProfileId: staffFilter || undefined,
        team: teamFilter !== "all" ? (teamFilter as "DCS" | "NOC") : undefined,
        status: statusFilter !== "all" ? (statusFilter as AttendanceStatus) : undefined,
        from: fromDate || undefined,
        to: toDate || undefined,
        limit: 300,
      },
    }),
  );

  // Draft timesheets for cross-reference. Lookup map keyed by
  // `${staffProfileId}|YYYY-MM` → timesheet id. Used to wire the
  // "View timesheet" action per attendance row to the draft timesheet
  // covering that row's month, if one exists.
  const { data: draftTimesheets } = useQuery(
    orpc.timesheets.list.queryOptions({
      input: {
        status: "draft",
        staffProfileId: staffFilter || undefined,
        team: teamFilter !== "all" ? (teamFilter as "DCS" | "NOC") : undefined,
      },
    }),
  );

  const draftByStaffMonth = useMemo(() => {
    const map = new Map<string, string>();
    for (const ts of draftTimesheets ?? []) {
      if (!ts.periodStart || !ts.periodEnd) continue;
      // For each month that overlaps the timesheet period, register it.
      // periodStart/periodEnd are YYYY-MM-DD; iterate by month.
      const start = parseISO(ts.periodStart);
      const end = parseISO(ts.periodEnd);
      const cursor = new Date(start.getFullYear(), start.getMonth(), 1);
      const stop = new Date(end.getFullYear(), end.getMonth(), 1);
      while (cursor <= stop) {
        const key = `${ts.staffProfileId}|${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}`;
        if (!map.has(key)) map.set(key, ts.id);
        cursor.setMonth(cursor.getMonth() + 1);
      }
    }
    return map;
  }, [draftTimesheets]);

  function timesheetForRow(staffId: string, date: string): string | null {
    const yyyyMm = date.slice(0, 7);
    return draftByStaffMonth.get(`${staffId}|${yyyyMm}`) ?? null;
  }

  return (
    <>
      {/* Filters bar */}
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <span className="text-xs text-muted-foreground">Staff</span>
          <Select
            value={staffFilter}
            onValueChange={(v) => setStaffFilter(v === "all" ? "" : (v ?? ""))}
          >
            <SelectTrigger className="w-44">
              <SelectValue placeholder="All staff" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All staff</SelectItem>
              {(staffQuery.data ?? []).map(
                (s: { id: string; user?: { name?: string } | null }) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.user?.name ?? s.id}
                  </SelectItem>
                ),
              )}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-1">
          <span className="text-xs text-muted-foreground">Team</span>
          <Select value={teamFilter} onValueChange={(v) => setTeamFilter(v ?? "all")}>
            <SelectTrigger className="w-28">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="DCS">DCS</SelectItem>
              <SelectItem value="NOC">NOC</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-1">
          <span className="text-xs text-muted-foreground">Status</span>
          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v ?? "all")}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              {STATUS_OPTIONS.map((s) => (
                <SelectItem key={s} value={s}>{s}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-1">
          <span className="text-xs text-muted-foreground">From</span>
          <Input
            type="date"
            className="w-36"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
          />
        </div>

        <div className="flex flex-col gap-1">
          <span className="text-xs text-muted-foreground">To</span>
          <Input
            type="date"
            className="w-36"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
          />
        </div>

        <Button
          size="sm"
          className="ml-auto"
          onClick={() => setDialog({ mode: "create" })}
        >
          <Plus className="size-4 mr-1.5" />
          Add Log
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Staff</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Clock In</TableHead>
                <TableHead>Late</TableHead>
                <TableHead>Clock Out</TableHead>
                <TableHead>Hours</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Timesheet</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 9 }).map((_, j) => (
                      <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                    ))}
                  </TableRow>
                ))
              ) : !(logs?.length) ? (
                <TableRow>
                  <TableCell colSpan={9} className="py-10 text-center text-muted-foreground">
                    No attendance logs found.
                  </TableCell>
                </TableRow>
              ) : (
                logs.map((row) => {
                  const late = minutesLate(row.clockIn);
                  return (
                    <TableRow
                      key={row.id}
                      className="cursor-pointer hover:bg-muted/40"
                      onClick={() =>
                        setDialog({
                          mode: "edit",
                          entry: {
                            id: row.id,
                            staffId: row.staffId,
                            date: row.date,
                            status: row.status as AttendanceStatus,
                            clockIn: row.clockIn,
                            clockOut: row.clockOut,
                            workHours: row.workHours,
                          },
                        })
                      }
                    >
                      <TableCell className="font-medium">
                        {row.staffProfile?.user?.name ?? "—"}
                        <div className="text-xs text-muted-foreground">
                          {row.staffProfile?.department?.name}
                        </div>
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-sm">
                        {row.date ? format(parseISO(row.date), "dd MMM yyyy") : "—"}
                      </TableCell>
                      <TableCell className="font-mono text-sm">
                        {formatTime(row.clockIn)}
                      </TableCell>
                      <TableCell>
                        {late !== null ? (
                          <span className="font-mono text-xs text-amber-600 dark:text-amber-400">
                            +{late}m
                          </span>
                        ) : (
                          <span className="text-muted-foreground text-xs">—</span>
                        )}
                      </TableCell>
                      <TableCell className="font-mono text-sm">
                        {formatTime(row.clockOut)}
                      </TableCell>
                      <TableCell className="font-mono text-sm">
                        {row.workHours ? `${row.workHours}h` : "—"}
                      </TableCell>
                      <TableCell>
                        <span
                          className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_CLASS[row.status as AttendanceStatus] ?? ""}`}
                        >
                          {row.status}
                        </span>
                      </TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        {(() => {
                          const tsId = timesheetForRow(row.staffId, row.date);
                          if (tsId) {
                            return (
                              <button
                                type="button"
                                className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                                onClick={() => navigate({ to: "/timesheets" })}
                                title="View draft timesheet for this month"
                              >
                                <ClipboardList className="size-3.5" />
                                View timesheet
                              </button>
                            );
                          }
                          return (
                            <span
                              className="inline-flex items-center gap-1 text-xs text-muted-foreground/60 cursor-not-allowed"
                              title="No draft timesheet exists for this month"
                            >
                              <ClipboardList className="size-3.5" />
                              No draft
                            </span>
                          );
                        })()}
                      </TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <button
                          className="p-1 rounded hover:bg-muted text-muted-foreground"
                          onClick={() =>
                            setDialog({
                              mode: "edit",
                              entry: {
                                id: row.id,
                                staffId: row.staffId,
                                date: row.date,
                                status: row.status as AttendanceStatus,
                                clockIn: row.clockIn,
                                clockOut: row.clockOut,
                                workHours: row.workHours,
                              },
                            })
                          }
                        >
                          <Pencil className="size-3.5" />
                        </button>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Log dialog */}
      {dialog?.mode === "create" && (
        <LogDialog mode="create" onClose={() => setDialog(null)} />
      )}
      {dialog?.mode === "edit" && (
        <LogDialog mode="edit" existing={dialog.entry} onClose={() => setDialog(null)} />
      )}
    </>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

function AttendancePage() {
  return (
    <>
      <Header fixed>
        <div className="flex items-center gap-2">
          <Clock3 className="size-4 text-muted-foreground" />
          <span className="text-sm text-muted-foreground">Time &amp; Attendance</span>
          <span className="text-muted-foreground">/</span>
          <span className="text-sm font-medium">Attendance Logs</span>
        </div>
        <div className="ms-auto flex items-center gap-2">
          <ThemeSwitch />
        </div>
      </Header>

      <AttendanceSubNav activeView="logs" />

      <Main className="space-y-6">
        <ClockLogsTab />
      </Main>
    </>
  );
}

void LatenessTab;
