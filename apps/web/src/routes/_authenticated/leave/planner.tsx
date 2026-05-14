// /leave/planner — Leave Planner (Gantt + List + Summary)
// Drop-in from `design handoff/screens-new-2.jsx` (LeavePlannerScreen).
//
// Data: all sourced from oRPC.
//   • orpc.leave.requests.list  → leave requests in [from, to] range
//   • orpc.leave.types.list     → leave types (for legend + summary breakdown)
//   • orpc.staff.list           → staff rows for Gantt left column
//
// Views: Gantt (default) / List / Summary, toggled by a button group in the page header.
// Year+Month selectors determine the visible window and are passed to requests.list as from/to.
// Status colours follow DESIGN_HANDOFF.md (approved=blue, pending=amber, rejected=red).

import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  differenceInDays,
  endOfMonth,
  format,
  getDaysInMonth,
  parseISO,
  startOfMonth,
} from "date-fns";
import {
  BarChart3,
  CalendarOff,
  ChevronLeft,
  ChevronRight,
  GanttChart,
  List as ListIcon,
} from "lucide-react";

import { Button } from "@ndma-dcs-staff-portal/ui/components/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@ndma-dcs-staff-portal/ui/components/card";
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

import { Header } from "@/components/layout/header";
import { Main } from "@/components/layout/main";
import { ThemeSwitch } from "@/components/theme-switch";
import { useTeamFilter } from "@/lib/team-filter";
import {
  getLeaveTypeDisplayName,
  isVisibleLeaveType,
  sortLeaveTypesByCanonicalOrder,
} from "@/lib/leave-types";
import { orpc } from "@/utils/orpc";

export const Route = createFileRoute("/_authenticated/leave/planner")({
  component: LeavePlannerPage,
});

// ── View modes ─────────────────────────────────────────────────────────────────
type ViewMode = "gantt" | "list" | "summary";

const VIEW_OPTIONS: { value: ViewMode; label: string; Icon: typeof GanttChart }[] = [
  { value: "gantt",   label: "Gantt",   Icon: GanttChart },
  { value: "list",    label: "List",    Icon: ListIcon },
  { value: "summary", label: "Summary", Icon: BarChart3 },
];

// ── Status colour map (per DESIGN_HANDOFF.md — no green) ───────────────────────
type LeaveStatus = "pending" | "approved" | "rejected" | "cancelled";

const STATUS_BADGE: Record<LeaveStatus, string> = {
  approved:  "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  pending:   "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  rejected:  "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
  cancelled: "bg-muted text-muted-foreground",
};
const STATUS_LABEL: Record<LeaveStatus, string> = {
  approved:  "Approved",
  pending:   "Pending",
  rejected:  "Rejected",
  cancelled: "Cancelled",
};

// ── Leave-type colour palette for Gantt bars + summary chips ───────────────────
// Keyed by display name (not id) so it's stable across deployments.
// Palette intentionally avoids green; falls back to indigo for unknown types.
const TYPE_COLORS: Record<string, { bar: string; chip: string; text: string }> = {
  "Annual Leave":    { bar: "bg-violet-500", chip: "bg-violet-100 dark:bg-violet-900/30", text: "text-violet-700 dark:text-violet-300" },
  "Sick Leave":      { bar: "bg-red-500",    chip: "bg-red-100 dark:bg-red-900/30",       text: "text-red-700 dark:text-red-300" },
  "Maternity Leave": { bar: "bg-pink-500",   chip: "bg-pink-100 dark:bg-pink-900/30",     text: "text-pink-700 dark:text-pink-300" },
  "Study Leave":     { bar: "bg-indigo-500", chip: "bg-indigo-100 dark:bg-indigo-900/30", text: "text-indigo-700 dark:text-indigo-300" },
  "Emergency":       { bar: "bg-rose-500",   chip: "bg-rose-100 dark:bg-rose-900/30",     text: "text-rose-700 dark:text-rose-300" },
  "No Pay":          { bar: "bg-slate-500",  chip: "bg-slate-100 dark:bg-slate-900/30",   text: "text-slate-700 dark:text-slate-300" },
  "Special Leave":   { bar: "bg-amber-500",  chip: "bg-amber-100 dark:bg-amber-900/30",   text: "text-amber-700 dark:text-amber-300" },
};
const DEFAULT_TYPE_COLOR = { bar: "bg-blue-500", chip: "bg-blue-100 dark:bg-blue-900/30", text: "text-blue-700 dark:text-blue-300" };

function getTypeColor(name: string) {
  return TYPE_COLORS[getLeaveTypeDisplayName(name)] ?? DEFAULT_TYPE_COLOR;
}

// ── Month names ─────────────────────────────────────────────────────────────────
const MONTHS_LONG = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

// ── Page ────────────────────────────────────────────────────────────────────────
function LeavePlannerPage() {
  const now = new Date();
  const [year, setYear] = useState<number>(now.getFullYear());
  const [month, setMonth] = useState<number>(now.getMonth() + 1); // 1-12
  const [view, setView] = useState<ViewMode>("gantt");
  const { team } = useTeamFilter();

  // Range covering the selected month
  const monthStart = useMemo(() => startOfMonth(new Date(year, month - 1, 1)), [year, month]);
  const monthEnd   = useMemo(() => endOfMonth(monthStart), [monthStart]);
  const fromIso    = format(monthStart, "yyyy-MM-dd");
  const toIso      = format(monthEnd,   "yyyy-MM-dd");
  const days       = getDaysInMonth(monthStart);

  // ── Queries ──────────────────────────────────────────────────────────────────
  const { data: requests, isLoading: loadingRequests } = useQuery(
    orpc.leave.requests.list.queryOptions({
      input: {
        from: fromIso,
        to: toIso,
        limit: 200,
        team: team === "All" ? undefined : team,
      },
    }),
  );

  const { data: leaveTypes } = useQuery(orpc.leave.types.list.queryOptions());

  const { data: staff, isLoading: loadingStaff } = useQuery(
    orpc.staff.list.queryOptions({
      input: {
        limit: 200,
        offset: 0,
        team: team === "All" ? undefined : team,
        status: "active",
      },
    }),
  );

  const isLoading = loadingRequests || loadingStaff;

  // ── Derived: rows that intersect the visible month ───────────────────────────
  const visibleRequests = useMemo(() => {
    if (!requests) return [];
    return requests.filter((r) => {
      const s = parseISO(r.startDate);
      const e = parseISO(r.endDate);
      return s <= monthEnd && e >= monthStart;
    });
  }, [requests, monthStart, monthEnd]);

  // Gantt rows = staff who have at least one leave intersecting the month
  const ganttRows = useMemo(() => {
    if (!staff) return [];
    const idsWithLeave = new Set(visibleRequests.map((r) => r.staffProfileId));
    return staff.filter((s) => idsWithLeave.has(s.id));
  }, [staff, visibleRequests]);

  // Summary stats: KPI counts
  const approvedDays = useMemo(
    () => visibleRequests
      .filter((r) => r.status === "approved")
      .reduce((sum, r) => sum + (r.totalDays ?? 0), 0),
    [visibleRequests],
  );
  const pendingCount = useMemo(
    () => visibleRequests.filter((r) => r.status === "pending").length,
    [visibleRequests],
  );
  const rejectedCount = useMemo(
    () => visibleRequests.filter((r) => r.status === "rejected").length,
    [visibleRequests],
  );

  // Per-type breakdown (approved only)
  const visibleTypes = useMemo(
    () => (leaveTypes ?? [])
      .filter((lt) => isVisibleLeaveType(lt.name))
      .slice()
      .sort(sortLeaveTypesByCanonicalOrder),
    [leaveTypes],
  );

  const typeBreakdown = useMemo(() => {
    const totals = new Map<string, number>();
    for (const r of visibleRequests) {
      if (r.status !== "approved") continue;
      const name = getLeaveTypeDisplayName(r.leaveType?.name ?? "Other");
      totals.set(name, (totals.get(name) ?? 0) + (r.totalDays ?? 0));
    }
    return Array.from(totals.entries())
      .map(([name, total]) => ({ name, total }))
      .sort((a, b) => b.total - a.total);
  }, [visibleRequests]);

  // ── Navigation handlers ──────────────────────────────────────────────────────
  function shiftMonth(delta: number) {
    let m = month + delta;
    let y = year;
    if (m < 1)  { m = 12; y -= 1; }
    if (m > 12) { m =  1; y += 1; }
    setMonth(m);
    setYear(y);
  }

  return (
    <>
      <Header fixed>
        <div className="flex items-center gap-2">
          <CalendarOff className="size-4 text-muted-foreground" />
          <span className="text-sm font-medium">Leave Planner</span>
        </div>
        <div className="ms-auto flex items-center gap-2">
          <ThemeSwitch />
        </div>
      </Header>

      <Main className="space-y-6">
        {/* Page heading + month nav + view toggle */}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-wider text-muted-foreground">People</p>
            <h1 className="text-2xl font-bold tracking-tight">Leave Planner</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Approved and scheduled leave — {MONTHS_LONG[month - 1]} {year}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="icon"
              variant="outline"
              className="size-8"
              onClick={() => shiftMonth(-1)}
              aria-label="Previous month"
            >
              <ChevronLeft className="size-4" />
            </Button>

            <Select value={String(month)} onValueChange={(v) => setMonth(Number(v))}>
              <SelectTrigger className="h-8 w-[140px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                {MONTHS_LONG.map((name, i) => (
                  <SelectItem key={name} value={String(i + 1)}>{name}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
              <SelectTrigger className="h-8 w-[100px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                {[year - 2, year - 1, year, year + 1, year + 2].map((y) => (
                  <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Button
              size="icon"
              variant="outline"
              className="size-8"
              onClick={() => shiftMonth(1)}
              aria-label="Next month"
            >
              <ChevronRight className="size-4" />
            </Button>

            {/* View mode toggle */}
            <div className="ml-2 inline-flex overflow-hidden rounded-md border">
              {VIEW_OPTIONS.map((opt) => {
                const active = view === opt.value;
                return (
                  <button
                    key={opt.value}
                    onClick={() => setView(opt.value)}
                    className={[
                      "flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors border-r last:border-r-0",
                      active
                        ? "bg-primary text-primary-foreground"
                        : "bg-background text-muted-foreground hover:bg-muted",
                    ].join(" ")}
                  >
                    <opt.Icon className="size-3.5" />
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Stats strip — always visible */}
        <Card>
          <CardContent className="flex flex-wrap items-center gap-x-8 gap-y-4 p-4">
            <KpiCell label="Approved Days"  value={approvedDays}  tone="blue" />
            <KpiCell label="Pending"        value={pendingCount}  tone="amber" />
            <KpiCell label="Rejected"       value={rejectedCount} tone="red" />
            <div className="ml-auto flex flex-wrap items-center gap-1.5">
              {typeBreakdown.length === 0 ? (
                <span className="text-xs text-muted-foreground">No approved leave this month.</span>
              ) : typeBreakdown.map((t) => {
                const c = TYPE_COLORS[t.name] ?? DEFAULT_TYPE_COLOR;
                return (
                  <span
                    key={t.name}
                    className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium ${c.chip} ${c.text}`}
                  >
                    {t.name}: <span className="tabular-nums font-semibold">{t.total}</span>
                  </span>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* Legend (visible leave types) */}
        {visibleTypes.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {visibleTypes.map((lt) => {
              const display = getLeaveTypeDisplayName(lt.name);
              const c = TYPE_COLORS[display] ?? DEFAULT_TYPE_COLOR;
              return (
                <span
                  key={lt.id}
                  className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${c.chip} ${c.text}`}
                >
                  <span className={`size-2 rounded-full ${c.bar}`} />
                  {display}
                </span>
              );
            })}
          </div>
        )}

        {/* ── Body ────────────────────────────────────────────────────────── */}
        {isLoading ? (
          <Skeleton className="h-64 w-full" />
        ) : view === "gantt" ? (
          <GanttView
            year={year}
            month={month}
            days={days}
            staffRows={ganttRows}
            requests={visibleRequests}
            monthStart={monthStart}
            monthEnd={monthEnd}
          />
        ) : view === "list" ? (
          <ListView requests={visibleRequests} />
        ) : (
          <SummaryView
            staff={staff ?? []}
            requests={visibleRequests}
            visibleTypes={visibleTypes}
          />
        )}
      </Main>
    </>
  );
}

// ── KPI cell ────────────────────────────────────────────────────────────────────
function KpiCell({ label, value, tone }: { label: string; value: number; tone: "blue" | "amber" | "red" }) {
  const cls = tone === "blue"
    ? "text-blue-600 dark:text-blue-400"
    : tone === "amber"
      ? "text-amber-600 dark:text-amber-400"
      : "text-red-600 dark:text-red-400";
  return (
    <div className="flex flex-col">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</span>
      <span className={`text-2xl font-bold tabular-nums ${cls}`}>{value}</span>
    </div>
  );
}

// ── Gantt view ──────────────────────────────────────────────────────────────────
type StaffRow = {
  id: string;
  user: { name: string | null } | null;
  department: { name: string | null } | null;
};

type RequestRow = {
  id: string;
  staffProfileId: string;
  startDate: string;
  endDate: string;
  status: string;
  totalDays: number;
  reason: string | null;
  leaveType?: { name: string | null } | null;
  staffProfile?: {
    user?: { name: string | null } | null;
    department?: { name: string | null } | null;
  } | null;
};

function GanttView({
  year, month, days, staffRows, requests, monthStart, monthEnd,
}: {
  year: number;
  month: number;
  days: number;
  staffRows: StaffRow[];
  requests: RequestRow[];
  monthStart: Date;
  monthEnd: Date;
}) {
  // Group requests by staffProfileId
  const byStaff = useMemo(() => {
    const map = new Map<string, RequestRow[]>();
    for (const r of requests) {
      const arr = map.get(r.staffProfileId) ?? [];
      arr.push(r);
      map.set(r.staffProfileId, arr);
    }
    return map;
  }, [requests]);

  if (staffRows.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-sm text-muted-foreground">
          No leave scheduled in {format(monthStart, "MMMM yyyy")}.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="overflow-auto rounded-xl border bg-card">
      <table className="min-w-max border-collapse text-xs">
        <thead className="sticky top-0 z-10 bg-muted/60 backdrop-blur">
          <tr className="border-b">
            <th className="sticky left-0 z-20 min-w-[200px] border-r bg-muted/80 px-3 py-2 text-left font-semibold">
              Staff
            </th>
            {Array.from({ length: days }, (_, i) => {
              const d = i + 1;
              const date = new Date(year, month - 1, d);
              const dow = date.getDay(); // 0=Sun, 6=Sat
              const isWknd = dow === 0 || dow === 6;
              const isToday =
                date.getFullYear() === new Date().getFullYear() &&
                date.getMonth() === new Date().getMonth() &&
                date.getDate() === new Date().getDate();
              return (
                <th
                  key={d}
                  className={[
                    "w-8 min-w-[30px] border-r py-1.5 text-center font-medium",
                    isWknd ? "bg-muted/40 text-muted-foreground"
                           : isToday ? "bg-primary/10 text-primary"
                           : "text-muted-foreground",
                  ].join(" ")}
                >
                  <div className="text-[9px] uppercase">
                    {["S","M","T","W","T","F","S"][dow]}
                  </div>
                  <div className="text-[11px]">{d}</div>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {staffRows.map((st) => {
            const reqs = byStaff.get(st.id) ?? [];
            return (
              <tr key={st.id} className="border-b hover:bg-muted/20">
                <td className="sticky left-0 z-10 min-w-[200px] border-r bg-background px-3 py-1.5">
                  <div className="font-medium text-[12px]">{st.user?.name ?? "—"}</div>
                  <div className="text-[10px] text-muted-foreground">
                    {st.department?.name ?? ""}
                  </div>
                </td>
                {Array.from({ length: days }, (_, i) => {
                  const d = i + 1;
                  const cellDate = new Date(year, month - 1, d);
                  const matching = reqs.find((r) => {
                    const s = parseISO(r.startDate);
                    const e = parseISO(r.endDate);
                    return cellDate >= s && cellDate <= e;
                  });
                  const dow = cellDate.getDay();
                  const isWknd = dow === 0 || dow === 6;
                  const color = matching ? getTypeColor(matching.leaveType?.name ?? "") : null;
                  const isPending = matching?.status === "pending";
                  return (
                    <td
                      key={d}
                      className={[
                        "border-r p-0.5",
                        isWknd ? "bg-muted/30" : "",
                      ].join(" ")}
                    >
                      {matching && color ? (
                        <div
                          className={[
                            "h-5 w-full rounded",
                            color.bar,
                            isPending ? "opacity-50 ring-1 ring-amber-400" : "",
                          ].join(" ")}
                          title={`${matching.leaveType?.name ?? ""} — ${matching.startDate} → ${matching.endDate} (${matching.status})`}
                        />
                      ) : (
                        <div className="h-5 w-full" />
                      )}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="border-t bg-muted/30 px-3 py-2 text-[11px] text-muted-foreground">
        Bars span start → end of each leave request. Pending requests render faded with an amber ring.
        Visible window clips at month boundaries; full duration shows in the tooltip.
      </p>
    </div>
  );
}

// ── List view ───────────────────────────────────────────────────────────────────
function ListView({ requests }: { requests: RequestRow[] }) {
  if (requests.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-sm text-muted-foreground">
          No leave requests in this month.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Staff</TableHead>
            <TableHead>Department</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Start</TableHead>
            <TableHead>End</TableHead>
            <TableHead className="text-right">Duration</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Reason</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {requests.map((r) => {
            const s = parseISO(r.startDate);
            const e = parseISO(r.endDate);
            const duration = differenceInDays(e, s) + 1;
            const status = (r.status as LeaveStatus) ?? "pending";
            const typeName = getLeaveTypeDisplayName(r.leaveType?.name ?? "—");
            const c = TYPE_COLORS[typeName] ?? DEFAULT_TYPE_COLOR;
            return (
              <TableRow key={r.id}>
                <TableCell className="font-medium">
                  {r.staffProfile?.user?.name ?? "—"}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {r.staffProfile?.department?.name ?? "—"}
                </TableCell>
                <TableCell>
                  <span className={`inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-medium ${c.chip} ${c.text}`}>
                    <span className={`size-2 rounded-full ${c.bar}`} />
                    {typeName}
                  </span>
                </TableCell>
                <TableCell className="font-mono text-xs">{format(s, "d MMM yyyy")}</TableCell>
                <TableCell className="font-mono text-xs">{format(e, "d MMM yyyy")}</TableCell>
                <TableCell className="text-right font-medium tabular-nums">
                  {duration} day{duration !== 1 ? "s" : ""}
                </TableCell>
                <TableCell>
                  <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ${STATUS_BADGE[status]}`}>
                    {STATUS_LABEL[status] ?? status}
                  </span>
                </TableCell>
                <TableCell className="max-w-[240px] truncate text-sm text-muted-foreground" title={r.reason ?? undefined}>
                  {r.reason ?? "—"}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

// ── Summary view ────────────────────────────────────────────────────────────────
function SummaryView({
  staff, requests, visibleTypes,
}: {
  staff: StaffRow[];
  requests: RequestRow[];
  visibleTypes: { id: string; name: string }[];
}) {
  // Sum approved days per staff per type
  type Row = {
    id: string;
    name: string;
    dept: string;
    perType: Record<string, number>;
    total: number;
  };

  const typeNames = visibleTypes.map((t) => getLeaveTypeDisplayName(t.name));

  const rows: Row[] = useMemo(() => {
    const byStaff = new Map<string, Row>();
    for (const r of requests) {
      if (r.status !== "approved") continue;
      const name = r.staffProfile?.user?.name ?? "—";
      const dept = r.staffProfile?.department?.name ?? "—";
      const typeName = getLeaveTypeDisplayName(r.leaveType?.name ?? "Other");
      const existing = byStaff.get(r.staffProfileId) ?? {
        id: r.staffProfileId,
        name,
        dept,
        perType: {} as Record<string, number>,
        total: 0,
      };
      existing.perType[typeName] = (existing.perType[typeName] ?? 0) + (r.totalDays ?? 0);
      existing.total += r.totalDays ?? 0;
      byStaff.set(r.staffProfileId, existing);
    }
    return Array.from(byStaff.values()).sort((a, b) => b.total - a.total);
  }, [requests]);

  // Aggregate totals
  const totals: Record<string, number> = {};
  let grandTotal = 0;
  for (const r of rows) {
    for (const t of typeNames) {
      totals[t] = (totals[t] ?? 0) + (r.perType[t] ?? 0);
    }
    grandTotal += r.total;
  }

  return (
    <div className="space-y-6">
      {/* KPI grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Total Approved Days
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold tabular-nums">{grandTotal}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Staff On Leave
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold tabular-nums">{rows.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Pending Requests
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold tabular-nums text-amber-600 dark:text-amber-400">
              {requests.filter((r) => r.status === "pending").length}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Total Staff Roster
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold tabular-nums">{staff.length}</p>
          </CardContent>
        </Card>
      </div>

      {/* Per-type breakdown table */}
      {rows.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            No approved leave to summarise in this month.
          </CardContent>
        </Card>
      ) : (
        <div className="overflow-hidden rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Staff</TableHead>
                <TableHead>Department</TableHead>
                {typeNames.map((t) => (
                  <TableHead key={t} className="text-right">{t}</TableHead>
                ))}
                <TableHead className="text-right">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">{r.name}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{r.dept}</TableCell>
                  {typeNames.map((t) => {
                    const v = r.perType[t] ?? 0;
                    const c = TYPE_COLORS[t] ?? DEFAULT_TYPE_COLOR;
                    return (
                      <TableCell key={t} className="text-right tabular-nums">
                        {v > 0 ? <span className={`font-semibold ${c.text}`}>{v}</span> : <span className="text-muted-foreground">—</span>}
                      </TableCell>
                    );
                  })}
                  <TableCell className="text-right font-bold tabular-nums">{r.total}</TableCell>
                </TableRow>
              ))}
              {/* Totals row */}
              <TableRow className="bg-muted/30 font-semibold">
                <TableCell colSpan={2}>Totals</TableCell>
                {typeNames.map((t) => (
                  <TableCell key={t} className="text-right tabular-nums">
                    {totals[t] ? totals[t] : "—"}
                  </TableCell>
                ))}
                <TableCell className="text-right tabular-nums">{grandTotal}</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
