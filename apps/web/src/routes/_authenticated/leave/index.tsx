// /leave — Leave Management (Requests)
//
// Multi-view page (see CLAUDE.md "Multi-View Pages Pattern"):
//   • List      — compact table
//   • Detailed  — rich cards with reason / approver / violations
//   • Board     — kanban grouped by status
//   • Gantt     — per-staff timeline across the selected year
// Calendar lives in its own sub-nav tab (/leave/calendar) — not duplicated here.
//
// Department (NOC / DCS) filtering uses the shared URL-backed team filter.

import { useMemo, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  differenceInCalendarDays, format, isLeapYear, parseISO,
} from "date-fns";
import {
  CalendarOff, CheckCircle, Columns3, FileDown, GanttChartSquare,
  LayoutList, List, Plus, Trash2, XCircle,
} from "lucide-react";
import { exportLeaveExcel } from "@/utils/excel-export";
import { toast } from "sonner";

import { Button } from "@ndma-dcs-staff-portal/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@ndma-dcs-staff-portal/ui/components/card";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@ndma-dcs-staff-portal/ui/components/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@ndma-dcs-staff-portal/ui/components/select";
import { Skeleton } from "@ndma-dcs-staff-portal/ui/components/skeleton";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@ndma-dcs-staff-portal/ui/components/table";
import { DataPagination, usePagination } from "@/components/data-pagination";
import { DepartmentFilter } from "@/components/layout/department-filter";
import { Header } from "@/components/layout/header";
import { LeaveViolationsBadge } from "@/components/leave-violations-badge";
import { LeaveSubNav } from "@/components/layout/leave-sub-nav";
import { Main } from "@/components/layout/main";
import { PageHeader } from "@/components/layout/page-header";
import { StatusLegend } from "@/components/status-legend";
import { ThemeSwitch } from "@/components/theme-switch";
import { FormerTag, isFormerStatus } from "@/components/former-tag";
import {
  EFFECTIVE_LEAVE_STATUS_LABELS, EFFECTIVE_LEAVE_STATUS_ORDER,
  EFFECTIVE_LEAVE_STATUS_TONE, effectiveLeaveStatus,
  type EffectiveLeaveStatus,
} from "@/lib/leave-status";
import { useTeamFilter } from "@/lib/team-filter";
import {
  getLeaveTypeDisplayName, isVisibleLeaveType, sortLeaveTypesByCanonicalOrder,
} from "@/lib/leave-types";
import { orpc, queryClient } from "@/utils/orpc";

export const Route = createFileRoute("/_authenticated/leave/")({
  component: LeavePage,
});

// The DB-backed leave statuses (what `status` actually holds). "completed" is
// NOT one of these — it is derived (see @/lib/leave-status).
type LeaveDbStatus = "pending" | "approved" | "rejected" | "cancelled";
type ViewMode = "list" | "detailed" | "board" | "gantt";

// Display uses the *effective* status: an approved leave whose endDate is in
// the past reads "Completed". Colours/labels come from @/lib/leave-status,
// which builds on the central status-color system so a hue means the same
// thing across the app: pending=amber, approved=blue, completed=slate,
// rejected=red, cancelled=neutral/muted.
const STATUS_LABELS = EFFECTIVE_LEAVE_STATUS_LABELS;
const STATUS_COLORS: Record<EffectiveLeaveStatus, string> = Object.fromEntries(
  EFFECTIVE_LEAVE_STATUS_ORDER.map((s) => [s, EFFECTIVE_LEAVE_STATUS_TONE[s].badge]),
) as Record<EffectiveLeaveStatus, string>;
const STATUS_BAR: Record<EffectiveLeaveStatus, string> = Object.fromEntries(
  EFFECTIVE_LEAVE_STATUS_ORDER.map((s) => [s, EFFECTIVE_LEAVE_STATUS_TONE[s].bar]),
) as Record<EffectiveLeaveStatus, string>;
const STATUS_BORDER: Record<EffectiveLeaveStatus, string> = Object.fromEntries(
  EFFECTIVE_LEAVE_STATUS_ORDER.map((s) => [s, EFFECTIVE_LEAVE_STATUS_TONE[s].border]),
) as Record<EffectiveLeaveStatus, string>;
const LEAVE_STATUS_LEGEND = EFFECTIVE_LEAVE_STATUS_ORDER.map((s) => ({
  label: STATUS_LABELS[s],
  tone: EFFECTIVE_LEAVE_STATUS_TONE[s],
}));

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

// A leave request as returned by orpc.leave.requests.list.
type LeaveRow = {
  id: string;
  startDate: string;
  endDate: string;
  totalDays: number;
  status: string;
  reason?: string | null;
  violations?: string[] | null;
  leaveTypeId: string;
  staffProfileId: string;
  leaveType?: { name?: string | null } | null;
  staffProfile?: {
    user?: { name?: string | null } | null;
    employeeId?: string | null;
    status?: string | null;
  } | null;
  approvedBy?: { name?: string | null } | null;
};

// Records for people who have left NDMA carry a gentle "Former" tag
// (shared component — see @/components/former-tag).
function isFormer(r: LeaveRow): boolean {
  return isFormerStatus(r.staffProfile?.status);
}

// Renders the *effective* status — an approved-but-past leave shows "Completed".
function LeaveStatusBadge({ row }: { row: LeaveRow }) {
  const eff   = effectiveLeaveStatus(row.status, row.endDate);
  const cls   = STATUS_COLORS[eff] ?? "bg-muted text-muted-foreground";
  const label = STATUS_LABELS[eff] ?? row.status;
  return (
    <span
      className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ${cls}`}
      title={eff === "completed" ? "An approved leave whose end date has passed." : undefined}
    >
      {label}
    </span>
  );
}

function staffName(r: LeaveRow): string {
  return r.staffProfile?.user?.name ?? r.staffProfile?.employeeId ?? "Unnamed";
}

// ── Leave balance bar ──────────────────────────────────────────────────────────

// Shows leave taken vs remaining for one leave type. `remaining` =
// allowance − used, where allowance = entitlement + carried-over + adjustment.
// The remaining figure is given top billing — that is what staff most want
// to see ("how much leave is left").
function LeaveBalanceBar({
  label, used, allowance, note,
}: { label: string; used: number; allowance: number; note?: string }) {
  const pct = allowance > 0 ? Math.min((used / allowance) * 100, 100) : 0;
  const over = used > allowance;
  const remaining = allowance - used;
  const barCls = over ? "bg-red-500" : pct >= 80 ? "bg-amber-500" : "bg-primary";
  const remCls = over
    ? "text-red-600 dark:text-red-400"
    : pct >= 80
      ? "text-amber-600 dark:text-amber-400"
      : "text-primary";
  return (
    <div className="space-y-1.5 rounded-lg border bg-card p-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">{label}</span>
        <span className="text-xs tabular-nums text-muted-foreground">
          {used} of {allowance} days taken
        </span>
      </div>
      <div className="flex items-baseline gap-1.5">
        <span className={`text-2xl font-bold tabular-nums ${remCls}`}>
          {over ? 0 : remaining}
        </span>
        <span className="text-xs text-muted-foreground">days remaining</span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
        <div className={`h-full rounded-full transition-all ${barCls}`} style={{ width: `${pct}%` }} />
      </div>
      <div className="text-xs text-muted-foreground">
        {over ? (
          <span className="text-red-600 dark:text-red-400">
            {used - allowance} days over allowance
          </span>
        ) : (
          <span>{used} taken · {remaining} remaining</span>
        )}
        {note && <span className="ml-1 opacity-70">· {note}</span>}
      </div>
    </div>
  );
}

// ── Row action buttons (shared by list / detailed / board) ─────────────────────

function RowActions({
  row, onApprove, onReject, onDelete, busy,
}: {
  row: LeaveRow;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
  onDelete: (row: LeaveRow) => void;
  busy: boolean;
}) {
  return (
    <div className="flex gap-1">
      {row.status === "pending" && (
        <>
          <Button size="icon" variant="ghost" className="size-7 text-blue-600 hover:text-blue-700"
            onClick={() => onApprove(row.id)} disabled={busy} title="Approve">
            <CheckCircle className="size-4" />
          </Button>
          <Button size="icon" variant="ghost" className="size-7 text-red-500 hover:text-red-600"
            onClick={() => onReject(row.id)} disabled={busy} title="Reject">
            <XCircle className="size-4" />
          </Button>
        </>
      )}
      <Button size="icon" variant="ghost" className="size-7 text-destructive hover:text-destructive/80"
        onClick={() => onDelete(row)} title="Delete leave request">
        <Trash2 className="size-4" />
      </Button>
    </div>
  );
}

// ── List view — compact table ──────────────────────────────────────────────────

function LeaveListView({ rows, ...actions }: ViewProps) {
  if (rows.length === 0) return <EmptyState />;
  return (
    <div className="overflow-hidden rounded-xl border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Staff Member</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Dates</TableHead>
            <TableHead>Days</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Violations</TableHead>
            <TableHead>Approver</TableHead>
            <TableHead className="w-32">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.id}>
              <TableCell className="font-medium">{staffName(r)}{isFormer(r) && <FormerTag />}</TableCell>
              <TableCell>{getLeaveTypeDisplayName(r.leaveType?.name ?? "")}</TableCell>
              <TableCell className="font-mono text-xs">
                {format(parseISO(r.startDate), "d MMM")} – {format(parseISO(r.endDate), "d MMM yyyy")}
              </TableCell>
              <TableCell><span className="tabular-nums font-medium">{r.totalDays}</span></TableCell>
              <TableCell><LeaveStatusBadge row={r} /></TableCell>
              <TableCell><LeaveViolationsBadge violations={r.violations ?? undefined} /></TableCell>
              <TableCell className="text-sm">{r.approvedBy?.name ?? "—"}</TableCell>
              <TableCell><RowActions row={r} {...actions} /></TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

// ── Detailed view — rich cards ─────────────────────────────────────────────────

function LeaveDetailedView({ rows, ...actions }: ViewProps) {
  if (rows.length === 0) return <EmptyState />;
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {rows.map((r) => (
        <Card key={r.id} className="overflow-hidden">
          <CardContent className="space-y-3 p-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="font-semibold leading-tight">
                  {staffName(r)}{isFormer(r) && <FormerTag />}
                </div>
                <div className="text-xs text-muted-foreground">
                  {getLeaveTypeDisplayName(r.leaveType?.name ?? "")}
                </div>
              </div>
              <LeaveStatusBadge row={r} />
            </div>
            <div className="flex items-center justify-between rounded-lg bg-muted/50 px-3 py-2 text-sm">
              <span className="font-mono text-xs">
                {format(parseISO(r.startDate), "d MMM")} – {format(parseISO(r.endDate), "d MMM yyyy")}
              </span>
              <span className="tabular-nums font-semibold">{r.totalDays} days</span>
            </div>
            {r.reason && (
              <div className="text-xs text-muted-foreground">
                <span className="font-medium text-foreground">Note: </span>{r.reason}
              </div>
            )}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <LeaveViolationsBadge violations={r.violations ?? undefined} />
                {r.approvedBy?.name && <span>Approved by {r.approvedBy.name}</span>}
              </div>
              <RowActions row={r} {...actions} />
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ── Board view — kanban grouped by status ──────────────────────────────────────

function LeaveBoardView({ rows, ...actions }: ViewProps) {
  // Board groups by *effective* status — "Completed" is its own column.
  const columns: EffectiveLeaveStatus[] = [
    "pending", "approved", "completed", "rejected", "cancelled",
  ];
  return (
    <div className="flex gap-4 overflow-x-auto pb-2">
      {columns.map((col) => {
        const items = rows.filter(
          (r) => effectiveLeaveStatus(r.status, r.endDate) === col,
        );
        return (
          <div key={col} className="flex w-72 shrink-0 flex-col gap-2">
            <div className="flex items-center justify-between px-1">
              <span className="text-sm font-semibold">{STATUS_LABELS[col]}</span>
              <span className="rounded-full bg-muted px-2 py-0.5 text-xs tabular-nums text-muted-foreground">
                {items.length}
              </span>
            </div>
            <div className="space-y-2">
              {items.length === 0 ? (
                <div className="rounded-lg border border-dashed py-8 text-center text-xs text-muted-foreground">
                  None
                </div>
              ) : items.map((r) => (
                <Card key={r.id} className={`border-l-4 ${STATUS_BORDER[col]}`}>
                  <CardContent className="space-y-1.5 p-3">
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-sm font-medium leading-tight">
                        {staffName(r)}{isFormer(r) && <FormerTag />}
                      </span>
                      <RowActions row={r} {...actions} />
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {getLeaveTypeDisplayName(r.leaveType?.name ?? "")}
                    </div>
                    <div className="flex items-center justify-between font-mono text-xs">
                      <span>
                        {format(parseISO(r.startDate), "d MMM")} – {format(parseISO(r.endDate), "d MMM")}
                      </span>
                      <span className="tabular-nums font-semibold">{r.totalDays}d</span>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Gantt view — per-staff timeline across one year ────────────────────────────

function LeaveGanttView({ rows, year }: { rows: LeaveRow[]; year: number }) {
  const yearStart = new Date(year, 0, 1);
  const totalDays = isLeapYear(yearStart) ? 366 : 365;

  // Only requests that touch the selected year.
  const inYear = rows.filter((r) => {
    const s = parseISO(r.startDate), e = parseISO(r.endDate);
    return s.getFullYear() <= year && e.getFullYear() >= year;
  });

  const byStaff = useMemo(() => {
    const map = new Map<string, LeaveRow[]>();
    for (const r of inYear) {
      const k = staffName(r);
      (map.get(k) ?? map.set(k, []).get(k)!).push(r);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [inYear]);

  if (byStaff.length === 0) return <EmptyState message={`No leave recorded for ${year}.`} />;

  // Month gridline offsets (% of year).
  const monthOffsets = MONTHS.map((_, m) =>
    (differenceInCalendarDays(new Date(year, m, 1), yearStart) / totalDays) * 100,
  );

  return (
    <div className="overflow-x-auto rounded-xl border">
      <div className="min-w-[820px]">
        {/* Month header */}
        <div className="flex border-b bg-muted/40">
          <div className="w-44 shrink-0 border-r px-3 py-2 text-xs font-semibold">Staff</div>
          <div className="relative flex-1">
            <div className="flex">
              {MONTHS.map((m) => (
                <div key={m} className="flex-1 border-r py-2 text-center text-xs font-medium text-muted-foreground last:border-r-0">
                  {m}
                </div>
              ))}
            </div>
          </div>
        </div>
        {/* Staff rows */}
        {byStaff.map(([name, reqs]) => (
          <div key={name} className="flex border-b last:border-b-0 hover:bg-muted/30">
            <div className="flex w-44 shrink-0 items-center border-r px-3 py-3 text-sm font-medium">
              {name}
            </div>
            <div className="relative flex-1 py-2.5" style={{ minHeight: "2.75rem" }}>
              {/* month gridlines */}
              {monthOffsets.map((off, i) => (
                <div key={i} className="absolute top-0 bottom-0 w-px bg-border/60" style={{ left: `${off}%` }} />
              ))}
              {/* leave bars */}
              {reqs.map((r) => {
                const s = parseISO(r.startDate), e = parseISO(r.endDate);
                const startOff = Math.max(0, differenceInCalendarDays(s, yearStart));
                const endOff = Math.min(totalDays - 1, differenceInCalendarDays(e, yearStart));
                const left = (startOff / totalDays) * 100;
                const width = Math.max(((endOff - startOff + 1) / totalDays) * 100, 0.8);
                const eff = effectiveLeaveStatus(r.status, r.endDate);
                const cls = STATUS_BAR[eff] ?? "bg-primary";
                return (
                  <div
                    key={r.id}
                    className={`absolute top-1/2 h-5 -translate-y-1/2 rounded ${cls} flex items-center overflow-hidden px-1.5`}
                    style={{ left: `${left}%`, width: `${width}%` }}
                    title={`${getLeaveTypeDisplayName(r.leaveType?.name ?? "")} · ${format(s, "d MMM")} – ${format(e, "d MMM yyyy")} · ${r.totalDays} days · ${STATUS_LABELS[eff] ?? r.status}`}
                  >
                    <span className="truncate text-[10px] font-medium text-white">{r.totalDays}d</span>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function EmptyState({ message = "No leave requests found." }: { message?: string }) {
  return (
    <div className="rounded-xl border py-16 text-center text-muted-foreground">
      <CalendarOff className="mx-auto mb-2 size-8 opacity-40" />
      {message}
    </div>
  );
}

type ViewProps = {
  rows: LeaveRow[];
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
  onDelete: (row: LeaveRow) => void;
  busy: boolean;
};

const VIEW_OPTIONS: { mode: ViewMode; label: string; title: string; Icon: typeof List }[] = [
  { mode: "list",     label: "List",     title: "List view",     Icon: List },
  { mode: "detailed", label: "Detailed", title: "Detailed view", Icon: LayoutList },
  { mode: "board",    label: "Board",    title: "Board view",    Icon: Columns3 },
  { mode: "gantt",    label: "Gantt",    title: "Timeline view", Icon: GanttChartSquare },
];

function LeavePage() {
  const [viewMode,       setViewMode]       = useState<ViewMode>("list");
  // statusFilter holds the *effective* status — "completed" is filtered
  // client-side since the DB has no such status.
  const [statusFilter,   setStatusFilter]   = useState<EffectiveLeaveStatus | "">("");
  const [typeFilter,     setTypeFilter]     = useState<string>("");
  const [employeeFilter, setEmployeeFilter] = useState<string>("");
  const [yearFilter,     setYearFilter]     = useState<number>(new Date().getFullYear());
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
  const navigate = useNavigate();
  const { team } = useTeamFilter();

  const { data: currentStaff } = useQuery(orpc.staff.me.queryOptions());

  // "completed" is a derived status — the server only knows the DB statuses,
  // so when the filter is "completed" we fetch all "approved" rows and narrow
  // down client-side. Any other filter value is a real DB status.
  const serverStatus: LeaveDbStatus | undefined =
    statusFilter === "completed" ? "approved"
    : statusFilter === "" ? undefined
    : statusFilter;

  const { data, isLoading } = useQuery(
    orpc.leave.requests.list.queryOptions({
      input: {
        status: serverStatus,
        limit: 200, offset: 0,
        team: team === "All" ? undefined : team,
      },
    }),
  );

  const { data: leaveBalances } = useQuery({
    ...orpc.leave.balances.getByStaff.queryOptions({
      input: { staffProfileId: currentStaff?.id ?? "" },
    }),
    enabled: Boolean(currentStaff?.id),
  });

  const { data: leaveTypes } = useQuery(orpc.leave.types.list.queryOptions());

  const approveMutation = useMutation(
    orpc.leave.requests.approve.mutationOptions({
      onSuccess: () => { toast.success("Leave approved"); queryClient.invalidateQueries({ queryKey: orpc.leave.requests.list.key() }); },
      onError: (e: Error) => toast.error(e.message),
    }),
  );
  const rejectMutation = useMutation(
    orpc.leave.requests.reject.mutationOptions({
      onSuccess: () => { toast.success("Leave rejected"); queryClient.invalidateQueries({ queryKey: orpc.leave.requests.list.key() }); },
      onError: (e: Error) => toast.error(e.message),
    }),
  );
  const deleteMutation = useMutation(
    orpc.leave.requests.delete.mutationOptions({
      onSuccess: () => {
        toast.success("Leave request deleted");
        queryClient.invalidateQueries({ queryKey: orpc.leave.requests.list.key() });
        setDeleteTarget(null);
      },
      onError: (e: Error) => toast.error(e.message),
    }),
  );

  const visibleTypes = useMemo(
    () => (leaveTypes ?? []).filter((lt) => isVisibleLeaveType(lt.name)).sort(sortLeaveTypesByCanonicalOrder),
    [leaveTypes],
  );

  // Build one balance bar per visible leave type. The server enriches each
  // balance row with `allowance` (entitlement + carried-over + adjustment,
  // with a role-based 28/45-day default for Annual Leave) and `remaining`.
  const balanceRows = useMemo(() => {
    if (!leaveBalances || !visibleTypes.length) return [];
    return visibleTypes.map((lt) => {
      const bal = leaveBalances.find((b) => b.leaveTypeId === lt.id);
      const used      = bal?.used ?? 0;
      const allowance = bal?.allowance ?? (lt.defaultAnnualAllowance ?? 0);
      const note      = bal?.isSynthetic
        ? `default for ${bal.roleTier === "manager" ? "managers" : "staff"}`
        : undefined;
      return { label: getLeaveTypeDisplayName(lt.name), used, allowance, note };
    });
  }, [leaveBalances, visibleTypes]);

  // Years present in the data (for the year selector).
  const yearOptions = useMemo(() => {
    const set = new Set<number>([new Date().getFullYear()]);
    for (const r of (data ?? []) as LeaveRow[]) {
      set.add(parseISO(r.startDate).getFullYear());
      set.add(parseISO(r.endDate).getFullYear());
    }
    return [...set].sort((a, b) => b - a);
  }, [data]);

  // Distinct employees present in the data (for the employee filter).
  const employeeOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const r of (data ?? []) as LeaveRow[]) {
      if (r.staffProfileId) map.set(r.staffProfileId, staffName(r));
    }
    return [...map.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [data]);

  // Apply type + employee + year + effective-status filters client-side.
  // Gantt does its own year handling. The effective-status filter splits the
  // server's "approved" rows into "approved" (ongoing/upcoming) and
  // "completed" (already ended) — board view groups by status itself, so it
  // skips the status filter.
  const rows = useMemo(() => {
    let list = ((data ?? []) as LeaveRow[]);
    if (typeFilter) list = list.filter((r) => r.leaveTypeId === typeFilter);
    if (employeeFilter) list = list.filter((r) => r.staffProfileId === employeeFilter);
    if (statusFilter && viewMode !== "board") {
      list = list.filter(
        (r) => effectiveLeaveStatus(r.status, r.endDate) === statusFilter,
      );
    }
    if (viewMode !== "gantt") {
      list = list.filter((r) => {
        const s = parseISO(r.startDate), e = parseISO(r.endDate);
        return s.getFullYear() <= yearFilter && e.getFullYear() >= yearFilter;
      });
    }
    return list;
  }, [data, typeFilter, employeeFilter, statusFilter, yearFilter, viewMode]);

  // Paginate the flat list/detailed views (board groups by status, gantt
  // aggregates by staff — both keep the full set). 25 rows/page.
  const pagination = usePagination(rows, 25);

  const pendingCount = useMemo(() => rows.filter((r) => r.status === "pending").length, [rows]);
  // Completed = approved leave whose end date has passed.
  const completedCount = useMemo(
    () => rows.filter((r) => effectiveLeaveStatus(r.status, r.endDate) === "completed").length,
    [rows],
  );
  // Days booked sums EVERY approved request (split annual leave counts each
  // half independently) — both still-approved and completed leave count.
  const daysBooked   = useMemo(
    () => rows.filter((r) => r.status === "approved").reduce((sum, r) => sum + (r.totalDays ?? 0), 0),
    [rows],
  );

  const actions: Omit<ViewProps, "rows"> = {
    onApprove: (id) => approveMutation.mutate({ id }),
    onReject:  (id) => rejectMutation.mutate({ id, rejectionReason: "" }),
    onDelete:  (r)  => setDeleteTarget({ id: r.id, name: staffName(r) }),
    busy: approveMutation.isPending || rejectMutation.isPending,
  };

  return (
    <>
      <Header fixed>
        <div className="flex items-center gap-2">
          <CalendarOff className="size-4 text-muted-foreground" />
          <span className="text-sm font-medium">Leave Management</span>
        </div>
        <div className="ms-auto flex items-center gap-2">
          <DepartmentFilter />
          <ThemeSwitch />
        </div>
      </Header>

      <LeaveSubNav />

      <Main className="space-y-6">
        <PageHeader
          eyebrow="People"
          title="Leave"
          description="Submit and manage team leave requests."
          actions={
            <>
              <Button
                variant="outline"
                size="sm"
                title="Download the current filtered list as an Excel file."
                onClick={() => exportLeaveExcel(rows, `Leave_Requests_${new Date().toISOString().slice(0, 10)}.xlsx`)}
                disabled={!rows.length}
              >
                <FileDown className="mr-1 size-4" />
                Export Excel
              </Button>
              <Button size="sm" onClick={() => navigate({ to: "/leave/new" })}>
                <Plus className="mr-1 size-4" />Request Leave
              </Button>
            </>
          }
        />

        {/* Stats strip */}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Card><CardContent className="p-4">
            <div className="text-2xl font-bold tabular-nums">{rows.length}</div>
            <div className="text-xs text-muted-foreground">
              Requests {team !== "All" ? `· ${team}` : ""} {viewMode !== "gantt" ? `· ${yearFilter}` : ""}
            </div>
          </CardContent></Card>
          <Card><CardContent className="p-4">
            <div className="text-2xl font-bold tabular-nums text-amber-600 dark:text-amber-400">{pendingCount}</div>
            <div className="text-xs text-muted-foreground">Pending approval</div>
          </CardContent></Card>
          <Card><CardContent className="p-4">
            <div className="text-2xl font-bold tabular-nums text-slate-600 dark:text-slate-300">{completedCount}</div>
            <div className="text-xs text-muted-foreground">Completed leave</div>
          </CardContent></Card>
          <Card><CardContent className="p-4">
            <div className="text-2xl font-bold tabular-nums">{daysBooked}</div>
            <div className="text-xs text-muted-foreground">Approved days booked</div>
          </CardContent></Card>
        </div>

        {/* Leave balances */}
        {currentStaff && balanceRows.length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold">
                Your Leave Balances — {currentStaff.user?.name}
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {balanceRows.map((b) => (
                <LeaveBalanceBar
                  key={b.label}
                  label={b.label}
                  used={b.used}
                  allowance={b.allowance}
                  note={b.note}
                />
              ))}
            </CardContent>
          </Card>
        )}

        {/* Toolbar — view toggle + filters */}
        <div className="flex flex-wrap items-center gap-3">
          {/* View-mode toggle */}
          <div className="inline-flex rounded-lg border p-0.5">
            {VIEW_OPTIONS.map(({ mode, label, title, Icon }) => (
              <button
                key={mode}
                title={title}
                onClick={() => setViewMode(mode)}
                className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors ${
                  viewMode === mode
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Icon className="size-3.5" />
                {label}
              </button>
            ))}
          </div>

          {/* Year selector */}
          <Select value={String(yearFilter)} onValueChange={(v) => setYearFilter(Number(v))}>
            <SelectTrigger className="w-[110px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {yearOptions.map((y) => (
                <SelectItem key={y} value={String(y)}>{y}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Employee filter */}
          <Select value={employeeFilter || "_all"} onValueChange={(v) => setEmployeeFilter(v && v !== "_all" ? v : "")}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="All Employees">
                {(v: unknown) =>
                  v && v !== "_all"
                    ? employeeOptions.find((e) => e.id === v)?.name ?? "All Employees"
                    : "All Employees"}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="_all">All Employees</SelectItem>
              {employeeOptions.map((e) => (
                <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Status filter — hidden in board view (board already groups by status) */}
          {viewMode !== "board" && (
            <Select value={statusFilter || "_all"} onValueChange={(v) => setStatusFilter(v === "_all" ? "" : v as EffectiveLeaveStatus)}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="All Statuses">
                  {(v: unknown) =>
                    v && v !== "_all" ? STATUS_LABELS[v as EffectiveLeaveStatus] ?? "All Statuses" : "All Statuses"}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="_all">All Statuses</SelectItem>
                {EFFECTIVE_LEAVE_STATUS_ORDER.map((s) => (
                  <SelectItem key={s} value={s}>{STATUS_LABELS[s]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {/* Type filter pills */}
          <div className="flex flex-wrap gap-1.5" title="Filter requests by leave category">
            <button
              onClick={() => setTypeFilter("")}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${!typeFilter ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80"}`}
            >
              All types
            </button>
            {visibleTypes.map((lt) => (
              <button
                key={lt.id}
                onClick={() => setTypeFilter(lt.id === typeFilter ? "" : lt.id)}
                className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${typeFilter === lt.id ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80"}`}
              >
                {getLeaveTypeDisplayName(lt.name)}
              </button>
            ))}
          </div>
        </div>

        {/* Status legend — keeps badge colours unambiguous */}
        <StatusLegend items={LEAVE_STATUS_LEGEND} label="Status" />

        {/* Active view */}
        {isLoading ? (
          <Skeleton className="h-64 w-full" />
        ) : viewMode === "list" ? (
          <>
            <LeaveListView rows={pagination.pageItems} {...actions} />
            <DataPagination
              page={pagination.page}
              pageCount={pagination.pageCount}
              total={pagination.total}
              rangeLabel={pagination.rangeLabel}
              onPageChange={pagination.setPage}
            />
          </>
        ) : viewMode === "detailed" ? (
          <>
            <LeaveDetailedView rows={pagination.pageItems} {...actions} />
            <DataPagination
              page={pagination.page}
              pageCount={pagination.pageCount}
              total={pagination.total}
              rangeLabel={pagination.rangeLabel}
              onPageChange={pagination.setPage}
            />
          </>
        ) : viewMode === "board" ? (
          <LeaveBoardView rows={rows} {...actions} />
        ) : (
          <LeaveGanttView rows={rows} year={yearFilter} />
        )}

        {/* Delete confirm dialog */}
        <Dialog open={Boolean(deleteTarget)} onOpenChange={(v) => { if (!v) setDeleteTarget(null); }}>
          <DialogContent className="sm:max-w-sm">
            <DialogHeader>
              <DialogTitle>Delete Leave Request</DialogTitle>
              <DialogDescription>
                Are you sure you want to permanently delete the leave request for{" "}
                <span className="font-medium">{deleteTarget?.name}</span>? This cannot be undone.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => setDeleteTarget(null)} disabled={deleteMutation.isPending}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                disabled={deleteMutation.isPending}
                onClick={() => { if (deleteTarget) deleteMutation.mutate({ id: deleteTarget.id }); }}
              >
                {deleteMutation.isPending ? "Deleting…" : "Delete"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </Main>
    </>
  );
}
