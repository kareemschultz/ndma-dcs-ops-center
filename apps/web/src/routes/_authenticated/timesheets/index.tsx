// /timesheets — Full timesheet management
//
// Features:
//  • List all timesheets with status badges + total hours
//  • Expand any row to view/add/delete individual entries (date, hours, category, description)
//  • Per-status actions: Submit (draft), Approve/Reject (submitted)
//  • Edit timesheet metadata (draft only)
//  • Create new timesheet dialog
//  • Filter by status + team
//  • Reject dialog with required reason field

import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format, getDaysInMonth, parseISO } from "date-fns";
import { useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  Check,
  ChevronDown,
  ChevronRight,
  CircleAlert,
  ClipboardList,
  Clock,
  Eye,
  FileUp,
  Pencil,
  Plus,
  Trash2,
  Upload,
  X,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";

import { Header } from "@/components/layout/header";
import { Main } from "@/components/layout/main";
import { ThemeSwitch } from "@/components/theme-switch";
import { orpc } from "@/utils/orpc";
import { Badge } from "@ndma-dcs-staff-portal/ui/components/badge";
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
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@ndma-dcs-staff-portal/ui/components/tabs";
import { Textarea } from "@ndma-dcs-staff-portal/ui/components/textarea";

export const Route = createFileRoute("/_authenticated/timesheets/")({
  component: TimesheetsPage,
});

// ─── Types ────────────────────────────────────────────────────────────────────

type TimesheetStatus = "draft" | "submitted" | "approved" | "rejected" | "closed";

const STATUS_LABEL: Record<TimesheetStatus, string> = {
  draft: "Draft",
  submitted: "Pending Review",
  approved: "Approved",
  rejected: "Rejected",
  closed: "Closed",
};

const STATUS_CLASS: Record<TimesheetStatus, string> = {
  draft: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  submitted: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
  approved: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  rejected: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
  closed: "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400",
};

const ENTRY_CATEGORIES = [
  "Regular",
  "Overtime",
  "On-Call",
  "Training",
  "Administrative",
  "Incident Response",
  "Maintenance",
  "Other",
] as const;

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

// ─── Create Timesheet Dialog ──────────────────────────────────────────────────

function CreateTimesheetDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const { data: staff } = useQuery(
    orpc.staff.list.queryOptions({ input: { limit: 200, offset: 0 } }),
  );
  const now = new Date();
  const [staffProfileId, setStaffProfileId] = useState("");
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);

  const title = `${MONTH_NAMES[month - 1]} ${year}`;
  const periodStart = `${year}-${String(month).padStart(2, "0")}-01`;
  const periodEnd = `${year}-${String(month).padStart(2, "0")}-${String(
    getDaysInMonth(new Date(year, month - 1)),
  ).padStart(2, "0")}`;

  const yearOptions = [now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1];

  const mutation = useMutation(
    orpc.timesheets.create.mutationOptions({
      onSuccess: async () => {
        toast.success("Timesheet created");
        await queryClient.invalidateQueries({
          queryKey: orpc.timesheets.list.key(),
        });
        onOpenChange(false);
        setStaffProfileId("");
        setYear(now.getFullYear());
        setMonth(now.getMonth() + 1);
      },
      onError: (error: Error) =>
        toast.error(error.message ?? "Failed to create timesheet"),
    }),
  );

  function submit() {
    if (!staffProfileId) {
      toast.error("Select a staff member.");
      return;
    }
    mutation.mutate({ staffProfileId, title, periodStart, periodEnd });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>New Timesheet</DialogTitle>
          <DialogDescription>
            Create a monthly timesheet record for a staff member.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>Staff Member</Label>
            <Select
              value={staffProfileId}
              onValueChange={(v) => setStaffProfileId(v ?? "")}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select staff member" />
              </SelectTrigger>
              <SelectContent>
                {staff?.map((person) => (
                  <SelectItem key={person.id} value={person.id}>
                    {person.user?.name ?? person.id}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Year</Label>
              <Select
                value={String(year)}
                onValueChange={(v) => v && setYear(Number(v))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {yearOptions.map((y) => (
                    <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Month</Label>
              <Select
                value={String(month)}
                onValueChange={(v) => v && setMonth(Number(v))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MONTH_NAMES.map((name, i) => (
                    <SelectItem key={i + 1} value={String(i + 1)}>{name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="rounded-lg bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
            Timesheet: <span className="font-medium text-foreground">{title}</span>
            &nbsp;·&nbsp;{format(parseISO(periodStart), "d MMM")} – {format(parseISO(periodEnd), "d MMM yyyy")}
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={mutation.isPending}
          >
            Cancel
          </Button>
          <Button onClick={submit} disabled={mutation.isPending}>
            {mutation.isPending ? "Saving…" : "Create Timesheet"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Edit Timesheet Dialog ────────────────────────────────────────────────────

function EditTimesheetDialog({
  timesheet,
  onClose,
}: {
  timesheet: { id: string; title: string; periodStart: string; periodEnd: string };
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const parsed = timesheet.periodStart ? parseISO(timesheet.periodStart) : new Date();
  const [year, setYear] = useState(parsed.getFullYear());
  const [month, setMonth] = useState(parsed.getMonth() + 1);
  const now = new Date();
  const yearOptions = [now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1];

  const title = `${MONTH_NAMES[month - 1]} ${year}`;
  const periodStart = `${year}-${String(month).padStart(2, "0")}-01`;
  const periodEnd = `${year}-${String(month).padStart(2, "0")}-${String(
    getDaysInMonth(new Date(year, month - 1)),
  ).padStart(2, "0")}`;

  const mutation = useMutation(
    orpc.timesheets.update.mutationOptions({
      onSuccess: async () => {
        toast.success("Timesheet updated");
        await queryClient.invalidateQueries({
          queryKey: orpc.timesheets.list.key(),
        });
        onClose();
      },
      onError: (e: Error) => toast.error(e.message),
    }),
  );

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit Timesheet</DialogTitle>
          <DialogDescription>
            Only draft timesheets can be edited.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Year</Label>
              <Select
                value={String(year)}
                onValueChange={(v) => v && setYear(Number(v))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {yearOptions.map((y) => (
                    <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Month</Label>
              <Select
                value={String(month)}
                onValueChange={(v) => v && setMonth(Number(v))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MONTH_NAMES.map((name, i) => (
                    <SelectItem key={i + 1} value={String(i + 1)}>{name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="rounded-lg bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
            Timesheet: <span className="font-medium text-foreground">{title}</span>
            &nbsp;·&nbsp;{format(parseISO(periodStart), "d MMM")} – {format(parseISO(periodEnd), "d MMM yyyy")}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={mutation.isPending}>
            Cancel
          </Button>
          <Button
            onClick={() =>
              mutation.mutate({ id: timesheet.id, title, periodStart, periodEnd })
            }
            disabled={mutation.isPending}
          >
            {mutation.isPending ? "Saving…" : "Save Changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Add Entry Dialog ─────────────────────────────────────────────────────────

function AddEntryDialog({
  timesheetId,
  onClose,
}: {
  timesheetId: string;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    workDate: new Date().toISOString().slice(0, 10),
    hours: "",
    category: "Regular",
    description: "",
  });

  const mutation = useMutation(
    orpc.timesheets.addEntry.mutationOptions({
      onSuccess: async () => {
        toast.success("Entry added");
        await queryClient.invalidateQueries({
          queryKey: orpc.timesheets.list.key(),
        });
        onClose();
      },
      onError: (e: Error) => toast.error(e.message),
    }),
  );

  function submit() {
    const hours = parseFloat(form.hours);
    if (!form.workDate || isNaN(hours) || hours < 0.25) {
      toast.error("Valid date and hours (≥ 0.25) required.");
      return;
    }
    mutation.mutate({
      timesheetId,
      workDate: form.workDate,
      hours,
      category: form.category,
      description: form.description || undefined,
    });
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add Entry</DialogTitle>
          <DialogDescription>Record hours worked for a specific day.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="entry-date">Date</Label>
              <Input
                id="entry-date"
                type="date"
                value={form.workDate}
                onChange={(e) => setForm((c) => ({ ...c, workDate: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="entry-hours">Hours</Label>
              <Input
                id="entry-hours"
                type="number"
                step="0.25"
                min="0.25"
                max="24"
                placeholder="e.g. 8"
                value={form.hours}
                onChange={(e) => setForm((c) => ({ ...c, hours: e.target.value }))}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Category</Label>
            <Select
              value={form.category}
              onValueChange={(v) => setForm((c) => ({ ...c, category: v ?? "Regular" }))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ENTRY_CATEGORIES.map((cat) => (
                  <SelectItem key={cat} value={cat}>
                    {cat}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="entry-desc">Description (optional)</Label>
            <Textarea
              id="entry-desc"
              rows={2}
              placeholder="What was worked on…"
              value={form.description}
              onChange={(e) => setForm((c) => ({ ...c, description: e.target.value }))}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={mutation.isPending}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={mutation.isPending}>
            {mutation.isPending ? "Adding…" : "Add Entry"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Reject Dialog ────────────────────────────────────────────────────────────

function RejectDialog({
  timesheetId,
  onClose,
}: {
  timesheetId: string;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [reason, setReason] = useState("");

  const mutation = useMutation(
    orpc.timesheets.reject.mutationOptions({
      onSuccess: async () => {
        toast.success("Timesheet rejected");
        await queryClient.invalidateQueries({
          queryKey: orpc.timesheets.list.key(),
        });
        onClose();
      },
      onError: (e: Error) => toast.error(e.message),
    }),
  );

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Reject Timesheet</DialogTitle>
          <DialogDescription>Provide a reason for rejection.</DialogDescription>
        </DialogHeader>

        <div className="py-2 space-y-1.5">
          <Label htmlFor="reject-reason">Reason</Label>
          <Textarea
            id="reject-reason"
            rows={3}
            placeholder="Explain why this timesheet is being rejected…"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={mutation.isPending}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            disabled={mutation.isPending || !reason.trim()}
            onClick={() => mutation.mutate({ id: timesheetId, reason: reason.trim() })}
          >
            {mutation.isPending ? "Rejecting…" : "Reject"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Attendance log shape (subset used for matching) ──────────────────────────

type AttendanceLog = {
  id: number;
  staffId: string;
  date: string;
  status: string;
  clockIn: string | null;
  clockOut: string | null;
  workHours: string | null;
};

// ─── Import from Attendance Dialog ────────────────────────────────────────────

function ImportFromAttendanceDialog({
  timesheet,
  attendanceLogs,
  existingEntryDates,
  onClose,
}: {
  timesheet: {
    id: string;
    staffProfileId: string;
    periodStart: string;
    periodEnd: string;
  };
  attendanceLogs: AttendanceLog[];
  existingEntryDates: Set<string>;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const addEntryMut = useMutation(orpc.timesheets.addEntry.mutationOptions());

  // Pre-check Workday rows that have workHours AND aren't already in timesheet
  const initialSelected = useMemo(() => {
    const set = new Set<number>();
    for (const log of attendanceLogs) {
      if (
        log.status === "Workday" &&
        log.workHours &&
        Number(log.workHours) > 0 &&
        !existingEntryDates.has(log.date)
      ) {
        set.add(log.id);
      }
    }
    return set;
  }, [attendanceLogs, existingEntryDates]);

  const [selected, setSelected] = useState<Set<number>>(initialSelected);
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0, failed: 0 });

  function toggle(id: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // Sort logs by date ascending for the preview
  const sortedLogs = useMemo(
    () =>
      [...attendanceLogs].sort((a, b) =>
        a.date.localeCompare(b.date),
      ),
    [attendanceLogs],
  );

  function isSelectable(log: AttendanceLog) {
    return log.status === "Workday";
  }

  async function runImport() {
    const targets = sortedLogs.filter(
      (log) => selected.has(log.id) && isSelectable(log),
    );
    if (targets.length === 0) {
      toast.error("Select at least one Workday row to import.");
      return;
    }
    setImporting(true);
    setProgress({ done: 0, total: targets.length, failed: 0 });
    let done = 0;
    let failed = 0;
    for (const log of targets) {
      try {
        const hours = Number(log.workHours);
        await addEntryMut.mutateAsync({
          timesheetId: timesheet.id,
          workDate: log.date,
          hours: Number.isFinite(hours) && hours > 0 ? Number(hours.toFixed(2)) : 8,
          category: "Regular",
          description: `Imported from attendance — clock-in ${log.clockIn ?? "—"} · clock-out ${log.clockOut ?? "—"}`,
        });
        done++;
      } catch {
        failed++;
      }
      setProgress({ done: done + failed, total: targets.length, failed });
    }
    await queryClient.invalidateQueries({
      queryKey: orpc.timesheets.list.key(),
    });
    setImporting(false);
    if (failed > 0) {
      toast.warning(`Imported ${done}, failed ${failed}.`);
    } else {
      toast.success(`Imported ${done} attendance entr${done === 1 ? "y" : "ies"}.`);
    }
    onClose();
  }

  const selectableCount = sortedLogs.filter((l) => isSelectable(l)).length;
  const selectedCount = sortedLogs.filter(
    (l) => selected.has(l.id) && isSelectable(l),
  ).length;

  return (
    <Dialog open onOpenChange={(o) => { if (!o && !importing) onClose(); }}>
      <DialogContent className="sm:max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Import Entries from Attendance</DialogTitle>
          <DialogDescription>
            {sortedLogs.length} attendance log{sortedLogs.length === 1 ? "" : "s"} for this period ·
            {" "}{selectableCount} workday{selectableCount === 1 ? "" : "s"} eligible ·
            {" "}{selectedCount} selected
          </DialogDescription>
        </DialogHeader>

        {sortedLogs.length === 0 ? (
          <div className="py-10 text-center text-sm text-muted-foreground">
            No attendance logs found for this period.
          </div>
        ) : (
          <div className="rounded-md border overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/60 border-b">
                  <th className="w-8 px-2 py-2" />
                  <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">
                    Date
                  </th>
                  <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">
                    Status
                  </th>
                  <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">
                    Clock In
                  </th>
                  <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">
                    Clock Out
                  </th>
                  <th className="text-right px-3 py-2 text-xs font-medium text-muted-foreground">
                    Work Hours
                  </th>
                  <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">
                    Category
                  </th>
                </tr>
              </thead>
              <tbody>
                {sortedLogs.map((log) => {
                  const selectable = isSelectable(log);
                  const alreadyImported = existingEntryDates.has(log.date);
                  return (
                    <tr
                      key={log.id}
                      className={`border-b last:border-0 ${selectable ? "hover:bg-muted/20" : "opacity-50"}`}
                    >
                      <td className="px-2 py-1.5 text-center">
                        <input
                          type="checkbox"
                          disabled={!selectable || importing}
                          checked={selected.has(log.id) && selectable}
                          onChange={() => toggle(log.id)}
                          className="size-4 accent-primary"
                        />
                      </td>
                      <td className="px-3 py-1.5 font-mono text-xs">
                        {format(parseISO(log.date), "dd MMM yyyy")}
                      </td>
                      <td className="px-3 py-1.5">
                        <span className="text-xs rounded px-1.5 py-0.5 bg-muted">
                          {log.status}
                        </span>
                      </td>
                      <td className="px-3 py-1.5 font-mono text-xs">
                        {log.clockIn ? log.clockIn.slice(0, 5) : "—"}
                      </td>
                      <td className="px-3 py-1.5 font-mono text-xs">
                        {log.clockOut ? log.clockOut.slice(0, 5) : "—"}
                      </td>
                      <td className="px-3 py-1.5 text-right font-mono text-xs">
                        {log.workHours ?? "—"}
                      </td>
                      <td className="px-3 py-1.5 text-xs text-muted-foreground">
                        {alreadyImported ? (
                          <span className="text-blue-700 dark:text-blue-300">
                            already in timesheet
                          </span>
                        ) : selectable ? (
                          "Regular"
                        ) : (
                          "—"
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {importing && progress.total > 0 && (
          <p className="text-xs text-muted-foreground py-1">
            Imported {progress.done} of {progress.total}…
            {progress.failed > 0 ? ` (${progress.failed} failed)` : ""}
          </p>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={importing}>
            Cancel
          </Button>
          <Button
            onClick={runImport}
            disabled={importing || selectedCount === 0}
          >
            {importing
              ? `Importing ${progress.done}/${progress.total}…`
              : `Import ${selectedCount} entr${selectedCount === 1 ? "y" : "ies"}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Alignment helpers ────────────────────────────────────────────────────────

type AlignmentKind = "match" | "mismatch" | "absent" | "none";

function getAlignment(
  entryDate: string,
  entryHours: number | null,
  log: AttendanceLog | undefined,
): AlignmentKind {
  void entryDate;
  if (!log) return "none";
  if (log.status === "Absent") return "absent";
  if (log.status !== "Workday") return "none";
  if (entryHours == null) return "none";
  const logHrs = log.workHours != null ? Number(log.workHours) : NaN;
  if (!Number.isFinite(logHrs)) return "none";
  const delta = Math.abs(logHrs - entryHours);
  return delta <= 0.5 ? "match" : "mismatch";
}

function AlignmentBadge({ kind }: { kind: AlignmentKind }) {
  if (kind === "match") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300 px-1.5 py-0.5 text-[10px] font-medium">
        <Check className="size-3" />
        matches
      </span>
    );
  }
  if (kind === "mismatch") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-300 px-1.5 py-0.5 text-[10px] font-medium">
        <AlertTriangle className="size-3" />
        mismatch
      </span>
    );
  }
  if (kind === "absent") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300 px-1.5 py-0.5 text-[10px] font-medium">
        <XCircle className="size-3" />
        absent
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-muted text-muted-foreground px-1.5 py-0.5 text-[10px] font-medium">
      <CircleAlert className="size-3" />
      no attendance
    </span>
  );
}

// ─── Expanded Entries Panel ───────────────────────────────────────────────────

function EntriesPanel({
  timesheet,
}: {
  timesheet: {
    id: string;
    status: string;
    staffProfileId: string;
    periodStart: string | null;
    periodEnd: string | null;
    staffProfile?: {
      id: string;
      user?: { name?: string | null } | null;
    } | null;
    entries?: Array<{
      id: string;
      workDate: string;
      hours: string | number | null;
      category: string;
      description: string | null;
    }> | null;
  };
}) {
  const queryClient = useQueryClient();
  const [addOpen, setAddOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const isDraft = timesheet.status === "draft";

  // Single bulk attendance query for this timesheet's period — used for both
  // the Import dialog and alignment badges. No N+1.
  const attendanceQuery = useQuery({
    ...orpc.attendanceTime.logs.list.queryOptions({
      input: {
        staffProfileId: timesheet.staffProfileId,
        from: timesheet.periodStart ?? undefined,
        to: timesheet.periodEnd ?? undefined,
        limit: 500,
      },
    }),
    enabled: Boolean(timesheet.periodStart && timesheet.periodEnd),
  });

  const attendanceLogs: AttendanceLog[] = useMemo(
    () =>
      (attendanceQuery.data ?? []).map((log) => ({
        id: log.id,
        staffId: log.staffId,
        date: log.date,
        status: log.status,
        clockIn: log.clockIn,
        clockOut: log.clockOut,
        workHours: log.workHours,
      })),
    [attendanceQuery.data],
  );

  const attendanceByDate = useMemo(() => {
    const map = new Map<string, AttendanceLog>();
    for (const log of attendanceLogs) {
      map.set(log.date, log);
    }
    return map;
  }, [attendanceLogs]);

  const removeMutation = useMutation(
    orpc.timesheets.removeEntry.mutationOptions({
      onSuccess: async () => {
        toast.success("Entry removed");
        await queryClient.invalidateQueries({
          queryKey: orpc.timesheets.list.key(),
        });
      },
      onError: (e: Error) => toast.error(e.message),
    }),
  );

  const entries = timesheet.entries ?? [];
  const existingEntryDates = useMemo(
    () => new Set(entries.map((e) => e.workDate)),
    [entries],
  );

  const staffName = timesheet.staffProfile?.user?.name;
  const staffId = timesheet.staffProfileId;

  return (
    <div className="bg-muted/30 border-t px-4 py-3">
      <div className="flex items-center justify-between mb-2 gap-2 flex-wrap">
        <div className="flex items-center gap-3">
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            Time Entries ({entries.length})
          </span>
          {staffId && (
            <Link
              to="/staff/$staffId"
              params={{ staffId }}
              className="text-xs text-primary hover:underline inline-flex items-center gap-0.5"
            >
              View {staffName ?? "staff"} profile
              <ArrowRight className="size-3" />
            </Link>
          )}
        </div>
        {isDraft && (
          <div className="flex items-center gap-1.5">
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs"
              onClick={() => setImportOpen(true)}
              disabled={attendanceQuery.isLoading}
            >
              <Clock className="size-3 mr-1" />
              Import from Attendance
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs"
              onClick={() => setAddOpen(true)}
            >
              <Plus className="size-3 mr-1" />
              Add Entry
            </Button>
          </div>
        )}
      </div>

      {entries.length === 0 ? (
        <p className="text-sm text-muted-foreground py-2">
          No entries yet.{isDraft ? " Add entries using the buttons above." : ""}
        </p>
      ) : (
        <div className="rounded-md border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/60 border-b">
                <th className="text-left px-3 py-1.5 text-xs font-medium text-muted-foreground">Date</th>
                <th className="text-left px-3 py-1.5 text-xs font-medium text-muted-foreground">Hours</th>
                <th className="text-left px-3 py-1.5 text-xs font-medium text-muted-foreground">Category</th>
                <th className="text-left px-3 py-1.5 text-xs font-medium text-muted-foreground">Description</th>
                <th className="text-left px-3 py-1.5 text-xs font-medium text-muted-foreground">Attendance</th>
                {isDraft && <th className="w-8 px-2 py-1.5" />}
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => {
                const hoursNum =
                  entry.hours == null ? null : Number(entry.hours);
                const log = attendanceByDate.get(entry.workDate);
                const kind = getAlignment(
                  entry.workDate,
                  Number.isFinite(hoursNum) ? (hoursNum as number) : null,
                  log,
                );
                return (
                  <tr key={entry.id} className="border-b last:border-0 hover:bg-muted/20">
                    <td className="px-3 py-2 font-mono text-xs">
                      {entry.workDate ? format(parseISO(entry.workDate), "dd MMM yyyy") : "—"}
                    </td>
                    <td className="px-3 py-2 font-semibold">{entry.hours ?? "—"}</td>
                    <td className="px-3 py-2">
                      <span className="text-xs bg-primary/10 text-primary rounded px-1.5 py-0.5">
                        {entry.category}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-muted-foreground text-xs max-w-xs truncate">
                      {entry.description || "—"}
                    </td>
                    <td className="px-3 py-2">
                      {attendanceQuery.isLoading ? (
                        <Skeleton className="h-4 w-20" />
                      ) : (
                        <AlignmentBadge kind={kind} />
                      )}
                    </td>
                    {isDraft && (
                      <td className="px-2 py-2">
                        <button
                          className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                          disabled={removeMutation.isPending}
                          onClick={() => {
                            if (confirm("Remove this entry?")) {
                              removeMutation.mutate({ id: entry.id });
                            }
                          }}
                        >
                          <X className="size-3.5" />
                        </button>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {addOpen && (
        <AddEntryDialog timesheetId={timesheet.id} onClose={() => setAddOpen(false)} />
      )}
      {importOpen && timesheet.periodStart && timesheet.periodEnd && (
        <ImportFromAttendanceDialog
          timesheet={{
            id: timesheet.id,
            staffProfileId: timesheet.staffProfileId,
            periodStart: timesheet.periodStart,
            periodEnd: timesheet.periodEnd,
          }}
          attendanceLogs={attendanceLogs}
          existingEntryDates={existingEntryDates}
          onClose={() => setImportOpen(false)}
        />
      )}
    </div>
  );
}

// ─── HR Timesheet Documents ───────────────────────────────────────────────────

const OFFICE_LABEL: Record<string, string> = {
  castellani: "Castellani",
  liliendaal: "Liliendaal",
};

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("Failed to read file."));
    reader.readAsDataURL(file);
  });
}

function isPdfDataUrl(dataUrl: string): boolean {
  return dataUrl.startsWith("data:application/pdf");
}

function openTimesheetDocument(storagePath: string, filename: string) {
  if (!storagePath) {
    toast.error("This document has no stored file.");
    return;
  }
  if (isPdfDataUrl(storagePath)) {
    window.open(storagePath, "_blank", "noopener,noreferrer");
    return;
  }
  // Excel / other — trigger a download via a transient anchor.
  const anchor = document.createElement("a");
  anchor.href = storagePath;
  anchor.download = filename || "timesheet";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}

// ─── Upload Timesheet Document Dialog ─────────────────────────────────────────

function UploadDocumentDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const { data: staff } = useQuery(
    orpc.staff.list.queryOptions({ input: { limit: 500, offset: 0 } }),
  );
  const now = new Date();
  const [staffId, setStaffId] = useState("");
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [office, setOffice] = useState<"castellani" | "liliendaal">("castellani");
  const [file, setFile] = useState<File | null>(null);
  const [reading, setReading] = useState(false);

  const yearOptions = [
    now.getFullYear() - 2,
    now.getFullYear() - 1,
    now.getFullYear(),
    now.getFullYear() + 1,
  ];

  function reset() {
    setStaffId("");
    setYear(now.getFullYear());
    setMonth(now.getMonth() + 1);
    setOffice("castellani");
    setFile(null);
  }

  const mutation = useMutation(
    orpc.timesheetDocuments.create.mutationOptions({
      onSuccess: async () => {
        toast.success("Timesheet document uploaded");
        await queryClient.invalidateQueries({
          queryKey: orpc.timesheetDocuments.list.key(),
        });
        onOpenChange(false);
        reset();
      },
      onError: (error: Error & { code?: string }) => {
        if (error.code === "CONFLICT") {
          toast.error(
            "A timesheet already exists for that staff/month/office — delete it first to replace.",
          );
        } else {
          toast.error(error.message ?? "Failed to upload timesheet document.");
        }
      },
    }),
  );

  async function submit() {
    if (!staffId) {
      toast.error("Select a staff member.");
      return;
    }
    if (!file) {
      toast.error("Choose a timesheet file to upload.");
      return;
    }
    setReading(true);
    try {
      const dataUrl = await readFileAsDataUrl(file);
      setReading(false);
      mutation.mutate({
        staffId,
        year,
        month,
        office,
        filename: file.name,
        storagePath: dataUrl,
      });
    } catch (err) {
      setReading(false);
      toast.error((err as Error).message ?? "Failed to read file.");
    }
  }

  const busy = reading || mutation.isPending;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!busy) onOpenChange(o); }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Upload Timesheet</DialogTitle>
          <DialogDescription>
            Upload a monthly timesheet file (PDF or Excel) received from HR for a
            staff member.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>Staff Member</Label>
            <Select value={staffId} onValueChange={(v) => setStaffId(v ?? "")}>
              <SelectTrigger>
                <SelectValue placeholder="Select staff member" />
              </SelectTrigger>
              <SelectContent>
                {staff?.map((person) => (
                  <SelectItem key={person.id} value={person.id}>
                    {person.user?.name ?? person.id}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label>Year</Label>
              <Select
                value={String(year)}
                onValueChange={(v) => v && setYear(Number(v))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {yearOptions.map((y) => (
                    <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Month</Label>
              <Select
                value={String(month)}
                onValueChange={(v) => v && setMonth(Number(v))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MONTH_NAMES.map((name, i) => (
                    <SelectItem key={i + 1} value={String(i + 1)}>{name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Office</Label>
            <Select
              value={office}
              onValueChange={(v) =>
                setOffice((v as "castellani" | "liliendaal") ?? "castellani")
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="castellani">Castellani</SelectItem>
                <SelectItem value="liliendaal">Liliendaal</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="doc-file">Timesheet File</Label>
            <Input
              id="doc-file"
              type="file"
              accept=".pdf,.xlsx,.xls"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
            {file && (
              <p className="text-xs text-muted-foreground">
                {file.name} · {(file.size / 1024).toFixed(0)} KB
              </p>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={busy}
          >
            Cancel
          </Button>
          <Button onClick={submit} disabled={busy}>
            {busy ? "Uploading…" : "Upload Timesheet"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Delete Document Dialog ───────────────────────────────────────────────────

function DeleteDocumentDialog({
  document: doc,
  onClose,
}: {
  document: { id: number; filename: string };
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const mutation = useMutation(
    orpc.timesheetDocuments.delete.mutationOptions({
      onSuccess: async () => {
        toast.success("Timesheet document deleted");
        await queryClient.invalidateQueries({
          queryKey: orpc.timesheetDocuments.list.key(),
        });
        onClose();
      },
      onError: (e: Error) => toast.error(e.message),
    }),
  );

  return (
    <Dialog open onOpenChange={(o) => { if (!o && !mutation.isPending) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Delete Timesheet Document</DialogTitle>
          <DialogDescription>
            This will permanently remove <span className="font-medium">{doc.filename}</span>.
            This action cannot be undone.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={onClose}
            disabled={mutation.isPending}
          >
            Cancel
          </Button>
          <Button
            variant="destructive"
            disabled={mutation.isPending}
            onClick={() => mutation.mutate({ id: doc.id })}
          >
            {mutation.isPending ? "Deleting…" : "Delete"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── HR Timesheet Documents Tab ───────────────────────────────────────────────

function TimesheetDocumentsTab() {
  const now = new Date();
  const [uploadOpen, setUploadOpen] = useState(false);
  const [deleteDoc, setDeleteDoc] = useState<{
    id: number;
    filename: string;
  } | null>(null);
  const [yearFilter, setYearFilter] = useState<string>("all");
  const [monthFilter, setMonthFilter] = useState<string>("all");

  const yearOptions = [
    now.getFullYear() - 2,
    now.getFullYear() - 1,
    now.getFullYear(),
    now.getFullYear() + 1,
  ];

  const { data, isLoading } = useQuery(
    orpc.timesheetDocuments.list.queryOptions({
      input: {
        year: yearFilter !== "all" ? Number(yearFilter) : undefined,
        month: monthFilter !== "all" ? Number(monthFilter) : undefined,
        limit: 500,
        offset: 0,
      },
    }),
  );

  const documents = data ?? [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap gap-3">
          <div className="flex flex-col gap-1">
            <span className="text-xs text-muted-foreground">Year</span>
            <Select value={yearFilter} onValueChange={(v) => setYearFilter(v ?? "all")}>
              <SelectTrigger className="w-28">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All years</SelectItem>
                {yearOptions.map((y) => (
                  <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs text-muted-foreground">Month</span>
            <Select value={monthFilter} onValueChange={(v) => setMonthFilter(v ?? "all")}>
              <SelectTrigger className="w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All months</SelectItem>
                {MONTH_NAMES.map((name, i) => (
                  <SelectItem key={i + 1} value={String(i + 1)}>{name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <Button size="sm" onClick={() => setUploadOpen(true)}>
          <Upload className="mr-1.5 size-4" />
          Upload Timesheet
        </Button>
      </div>

      <div className="rounded-xl border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Staff</TableHead>
              <TableHead>Period</TableHead>
              <TableHead>Office</TableHead>
              <TableHead>Filename</TableHead>
              <TableHead>Uploaded by</TableHead>
              <TableHead>Uploaded</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 7 }).map((_, j) => (
                    <TableCell key={j}>
                      <Skeleton className="h-4 w-full" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : documents.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={7}
                  className="py-12 text-center text-muted-foreground"
                >
                  <FileUp className="mx-auto mb-2 size-8 opacity-40" />
                  No timesheet documents uploaded yet.
                  <div className="mt-1 text-xs">
                    Use “Upload Timesheet” to add a file received from HR.
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              documents.map((doc) => (
                <TableRow key={doc.id} className="hover:bg-muted/40">
                  <TableCell className="font-medium">
                    {doc.staffProfile?.user?.name ?? "—"}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                    {MONTH_NAMES[doc.month - 1] ?? doc.month} {doc.year}
                  </TableCell>
                  <TableCell className="text-sm">
                    {OFFICE_LABEL[doc.office] ?? doc.office}
                  </TableCell>
                  <TableCell className="max-w-xs truncate text-sm">
                    {doc.filename}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {doc.uploader?.name ?? "—"}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                    {doc.uploadedAt
                      ? format(parseISO(String(doc.uploadedAt)), "dd MMM yyyy")
                      : "—"}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 px-2 text-xs"
                        onClick={() =>
                          openTimesheetDocument(doc.storagePath ?? "", doc.filename)
                        }
                      >
                        <Eye className="mr-1 size-3" />
                        View
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 px-2 text-xs text-destructive hover:bg-destructive/10"
                        onClick={() =>
                          setDeleteDoc({ id: doc.id, filename: doc.filename })
                        }
                      >
                        <Trash2 className="mr-1 size-3" />
                        Delete
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {!isLoading && documents.length > 0 && (
        <div className="text-xs text-muted-foreground">
          {documents.length} document{documents.length === 1 ? "" : "s"}
        </div>
      )}

      <UploadDocumentDialog open={uploadOpen} onOpenChange={setUploadOpen} />
      {deleteDoc && (
        <DeleteDocumentDialog
          document={deleteDoc}
          onClose={() => setDeleteDoc(null)}
        />
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

function TimesheetsPage() {
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [teamFilter, setTeamFilter] = useState<string>("all");
  const now = new Date();
  const [yearFilter, setYearFilter] = useState<string>(String(now.getFullYear()));
  const [monthFilter, setMonthFilter] = useState<string>("all");
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [editTimesheet, setEditTimesheet] = useState<{
    id: string;
    title: string;
    periodStart: string;
    periodEnd: string;
  } | null>(null);
  const [rejectId, setRejectId] = useState<string | null>(null);

  const { data, isLoading } = useQuery(
    orpc.timesheets.list.queryOptions({
      input: {
        status: statusFilter !== "all" ? (statusFilter as TimesheetStatus) : undefined,
        team:
          teamFilter !== "all"
            ? (teamFilter as "DCS" | "NOC")
            : undefined,
      },
    }),
  );
  const yearOptions = [now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1];

  const submitMutation = useMutation(
    orpc.timesheets.submit.mutationOptions({
      onSuccess: async () => {
        toast.success("Timesheet submitted for review");
        await queryClient.invalidateQueries({
          queryKey: orpc.timesheets.list.key(),
        });
      },
      onError: (e: Error) => toast.error(e.message),
    }),
  );

  const approveMutation = useMutation(
    orpc.timesheets.approve.mutationOptions({
      onSuccess: async () => {
        toast.success("Timesheet approved");
        await queryClient.invalidateQueries({
          queryKey: orpc.timesheets.list.key(),
        });
      },
      onError: (e: Error) => toast.error(e.message),
    }),
  );

  function toggleExpand(id: string) {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  const timesheets = useMemo(() => {
    const all = data ?? [];
    return all.filter((ts) => {
      const start = ts.periodStart ?? "";
      if (yearFilter !== "all" && !start.startsWith(yearFilter)) return false;
      if (monthFilter !== "all") {
        const monthPrefix = `${yearFilter}-${String(monthFilter).padStart(2, "0")}`;
        if (!start.startsWith(monthPrefix)) return false;
      }
      return true;
    });
  }, [data, yearFilter, monthFilter]);

  return (
    <>
      <Header fixed>
        <div className="flex items-center gap-2">
          <ClipboardList className="size-4 text-muted-foreground" />
          <span className="text-sm font-medium">Timesheets</span>
        </div>
        <div className="ms-auto flex items-center gap-2">
          <ThemeSwitch />
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="mr-1.5 size-4" />
            New Timesheet
          </Button>
        </div>
      </Header>

      <Main>
        <div className="mb-6">
          <h1 className="text-2xl font-bold tracking-tight">Timesheets</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Track period submissions, time entries, and approvals for operational work.
          </p>
        </div>

        <Tabs defaultValue="records">
          <TabsList className="mb-4">
            <TabsTrigger value="records">Timesheet Records</TabsTrigger>
            <TabsTrigger value="documents">HR Timesheet Documents</TabsTrigger>
          </TabsList>

          <TabsContent value="records">
        {/* Filters */}
        <div className="mb-4 flex flex-wrap gap-3">
          <div className="flex flex-col gap-1">
            <span className="text-xs text-muted-foreground">Year</span>
            <Select value={yearFilter} onValueChange={(v) => { setYearFilter(v ?? String(now.getFullYear())); setMonthFilter("all"); }}>
              <SelectTrigger className="w-24">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {yearOptions.map((y) => (
                  <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs text-muted-foreground">Month</span>
            <Select value={monthFilter} onValueChange={(v) => setMonthFilter(v ?? "all")}>
              <SelectTrigger className="w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All months</SelectItem>
                {MONTH_NAMES.map((name, i) => (
                  <SelectItem key={i + 1} value={String(i + 1)}>{name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs text-muted-foreground">Status</span>
            <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v ?? "all")}>
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="draft">Draft</SelectItem>
                <SelectItem value="submitted">Pending Review</SelectItem>
                <SelectItem value="approved">Approved</SelectItem>
                <SelectItem value="rejected">Rejected</SelectItem>
                <SelectItem value="closed">Closed</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs text-muted-foreground">Team</span>
            <Select value={teamFilter} onValueChange={(v) => setTeamFilter(v ?? "all")}>
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All teams</SelectItem>
                <SelectItem value="DCS">DCS</SelectItem>
                <SelectItem value="NOC">NOC</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="rounded-xl border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8" />
                <TableHead>Staff</TableHead>
                <TableHead>Period</TableHead>
                <TableHead>Title</TableHead>
                <TableHead className="text-right">Hours</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 7 }).map((_, j) => (
                      <TableCell key={j}>
                        <Skeleton className="h-4 w-full" />
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : timesheets.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={7}
                    className="py-12 text-center text-muted-foreground"
                  >
                    No timesheets found.
                  </TableCell>
                </TableRow>
              ) : (
                timesheets.flatMap((row) => {
                  const isExpanded = expandedIds.has(row.id);
                  const status = row.status as TimesheetStatus;
                  const entryCount = row.entries?.length ?? 0;

                  return [
                    <TableRow
                      key={row.id}
                      className="cursor-pointer hover:bg-muted/40"
                      onClick={() => toggleExpand(row.id)}
                    >
                      {/* Expand toggle */}
                      <TableCell className="w-8 pr-0">
                        {isExpanded ? (
                          <ChevronDown className="size-4 text-muted-foreground" />
                        ) : (
                          <ChevronRight className="size-4 text-muted-foreground" />
                        )}
                      </TableCell>

                      <TableCell className="font-medium">
                        {row.staffProfile?.user?.name ?? "—"}
                        <div className="text-xs text-muted-foreground">
                          {row.staffProfile?.department?.name}
                        </div>
                      </TableCell>

                      <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                        {row.periodStart
                          ? format(parseISO(row.periodStart), "dd MMM")
                          : "—"}
                        {" – "}
                        {row.periodEnd
                          ? format(parseISO(row.periodEnd), "dd MMM yyyy")
                          : "—"}
                      </TableCell>

                      <TableCell>
                        <span className="font-medium">{row.title}</span>
                        <span className="ml-2 text-xs text-muted-foreground">
                          ({entryCount} {entryCount === 1 ? "entry" : "entries"})
                        </span>
                      </TableCell>

                      <TableCell className="text-right font-mono text-sm">
                        {row.totalHours ?? "0.00"}h
                      </TableCell>

                      <TableCell>
                        <span
                          className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_CLASS[status] ?? ""}`}
                        >
                          {STATUS_LABEL[status] ?? status}
                        </span>
                      </TableCell>

                      <TableCell
                        className="text-right"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="flex items-center justify-end gap-1.5">
                          {/* Draft: Edit + Submit */}
                          {status === "draft" && (
                            <>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 px-2 text-xs"
                                onClick={() =>
                                  setEditTimesheet({
                                    id: row.id,
                                    title: row.title,
                                    periodStart: row.periodStart ?? "",
                                    periodEnd: row.periodEnd ?? "",
                                  })
                                }
                              >
                                <Pencil className="size-3 mr-1" />
                                Edit
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 px-2 text-xs"
                                disabled={
                                  submitMutation.isPending || entryCount === 0
                                }
                                onClick={() => submitMutation.mutate({ id: row.id })}
                              >
                                Submit
                              </Button>
                            </>
                          )}

                          {/* Submitted: Approve + Reject */}
                          {status === "submitted" && (
                            <>
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 px-2 text-xs text-blue-700 border-blue-300 hover:bg-blue-50"
                                disabled={approveMutation.isPending}
                                onClick={() =>
                                  approveMutation.mutate({ id: row.id })
                                }
                              >
                                Approve
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 px-2 text-xs text-destructive border-destructive/30 hover:bg-destructive/5"
                                onClick={() => setRejectId(row.id)}
                              >
                                Reject
                              </Button>
                            </>
                          )}

                          {/* Rejected: note */}
                          {status === "rejected" && row.reviewNotes && (
                            <span
                              className="text-xs text-muted-foreground max-w-32 truncate"
                              title={row.reviewNotes}
                            >
                              {row.reviewNotes}
                            </span>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>,

                    // Expanded entries panel
                    ...(isExpanded
                      ? [
                          <TableRow key={`${row.id}-entries`}>
                            <TableCell colSpan={7} className="p-0 border-0">
                              <EntriesPanel timesheet={row} />
                            </TableCell>
                          </TableRow>,
                        ]
                      : []),
                  ];
                })
              )}
            </TableBody>
          </Table>
        </div>

        {/* Summary strip */}
        {!isLoading && timesheets.length > 0 && (
          <div className="mt-3 flex gap-4 text-xs text-muted-foreground">
            <span>{timesheets.length} total</span>
            <span>
              {timesheets.filter((t) => t.status === "submitted").length} pending review
            </span>
            <span>
              {timesheets.filter((t) => t.status === "approved").length} approved
            </span>
          </div>
        )}
          </TabsContent>

          <TabsContent value="documents">
            <TimesheetDocumentsTab />
          </TabsContent>
        </Tabs>
      </Main>

      {/* Dialogs */}
      <CreateTimesheetDialog open={createOpen} onOpenChange={setCreateOpen} />

      {editTimesheet && (
        <EditTimesheetDialog
          timesheet={editTimesheet}
          onClose={() => setEditTimesheet(null)}
        />
      )}

      {rejectId && (
        <RejectDialog
          timesheetId={rejectId}
          onClose={() => setRejectId(null)}
        />
      )}
    </>
  );
}
