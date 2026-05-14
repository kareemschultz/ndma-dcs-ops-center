// /leave/planner — Leave Planner (Gantt / List / Summary)
//
// Polished handoff drop-in. Mirrors `design handoff/screens-new-2.jsx` LeavePlannerScreen.
//
// Hard requirement from handoff chat:
//   • Summary stats bar at the very TOP of the page (Annual / Sick / Mat-Pat /
//     Compassionate / Half Day / WFH / Total) — ALWAYS visible regardless of
//     view (Gantt / List / Summary).
//
// All data is fetched from oRPC — ZERO mock arrays.

import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  endOfMonth,
  format,
  getDay,
  parseISO,
  startOfMonth,
} from "date-fns";
import {
  BarChart3,
  CalendarRange,
  ChevronLeft,
  ChevronRight,
  GanttChart,
  List as ListIcon,
} from "lucide-react";

import { Button } from "@ndma-dcs-staff-portal/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@ndma-dcs-staff-portal/ui/components/card";
import { Skeleton } from "@ndma-dcs-staff-portal/ui/components/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@ndma-dcs-staff-portal/ui/components/select";
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
import { getLeaveTypeDisplayName } from "@/lib/leave-types";
import { orpc } from "@/utils/orpc";

export const Route = createFileRoute("/_authenticated/leave/planner")({
  component: LeavePlannerPage,
});

// ── Leave-type code mapping ────────────────────────────────────────────────
// Single-letter codes used inside Gantt cells + summary stat tiles.

type LeaveCode = "A" | "S" | "M" | "C" | "H" | "W" | "O";

interface LeaveTypeStyle {
  code: LeaveCode;
  label: string;
  bg: string;     // chip / cell background
  tc: string;     // chip / cell text
  pillBg: string; // big stat tile background
  pillTc: string; // big stat tile text
  barBg: string;  // gantt bar fill
  barTc: string;  // gantt bar text
}

// Map a display name (or code) to a single-letter category and styling.
function classifyLeaveType(name: string): LeaveTypeStyle {
  const n = name.toLowerCase();
  if (n.startsWith("annual"))     return LEAVE_STYLES.A;
  if (n.startsWith("sick"))       return LEAVE_STYLES.S;
  if (n.startsWith("maternity") ||
      n.startsWith("paternity") ||
      n.startsWith("mat"))        return LEAVE_STYLES.M;
  if (n.startsWith("compassion")) return LEAVE_STYLES.C;
  if (n.startsWith("half"))       return LEAVE_STYLES.H;
  if (n.startsWith("wfh") ||
      n.includes("work from home")) return LEAVE_STYLES.W;
  return LEAVE_STYLES.O;
}

const LEAVE_STYLES: Record<LeaveCode, LeaveTypeStyle> = {
  A: {
    code: "A", label: "Annual",
    bg: "bg-violet-100 dark:bg-violet-950/40", tc: "text-violet-800 dark:text-violet-200",
    pillBg: "bg-violet-100 dark:bg-violet-950/30", pillTc: "text-violet-800 dark:text-violet-200",
    barBg: "bg-violet-500", barTc: "text-white",
  },
  S: {
    code: "S", label: "Sick",
    bg: "bg-red-100 dark:bg-red-950/40", tc: "text-red-700 dark:text-red-300",
    pillBg: "bg-red-100 dark:bg-red-950/30", pillTc: "text-red-700 dark:text-red-300",
    barBg: "bg-red-500", barTc: "text-white",
  },
  M: {
    code: "M", label: "Mat / Pat",
    bg: "bg-pink-100 dark:bg-pink-950/40", tc: "text-pink-700 dark:text-pink-300",
    pillBg: "bg-pink-100 dark:bg-pink-950/30", pillTc: "text-pink-700 dark:text-pink-300",
    barBg: "bg-pink-500", barTc: "text-white",
  },
  C: {
    code: "C", label: "Compassion.",
    bg: "bg-purple-100 dark:bg-purple-950/40", tc: "text-purple-700 dark:text-purple-300",
    pillBg: "bg-purple-100 dark:bg-purple-950/30", pillTc: "text-purple-700 dark:text-purple-300",
    barBg: "bg-purple-500", barTc: "text-white",
  },
  H: {
    code: "H", label: "Half Day",
    bg: "bg-amber-100 dark:bg-amber-950/40", tc: "text-amber-700 dark:text-amber-300",
    pillBg: "bg-amber-100 dark:bg-amber-950/30", pillTc: "text-amber-700 dark:text-amber-300",
    barBg: "bg-amber-500", barTc: "text-white",
  },
  W: {
    code: "W", label: "WFH",
    bg: "bg-blue-100 dark:bg-blue-950/40", tc: "text-blue-700 dark:text-blue-300",
    pillBg: "bg-blue-100 dark:bg-blue-950/30", pillTc: "text-blue-700 dark:text-blue-300",
    barBg: "bg-blue-500", barTc: "text-white",
  },
  O: {
    code: "O", label: "Other",
    bg: "bg-slate-100 dark:bg-slate-900/60", tc: "text-slate-700 dark:text-slate-300",
    pillBg: "bg-slate-100 dark:bg-slate-900/40", pillTc: "text-slate-700 dark:text-slate-300",
    barBg: "bg-slate-500", barTc: "text-white",
  },
};

// Order shown in the always-visible stats strip + Summary view columns.
const STAT_ORDER: LeaveCode[] = ["A", "S", "M", "C", "H", "W"];

// ── Types ─────────────────────────────────────────────────────────────────

interface LeaveTypeLite { id: string; name: string }

interface StaffLite {
  id: string;
  jobTitle: string | null;
  user?: { id: string; name?: string | null } | null;
  department?: { id: string; name: string } | null;
}

interface LeaveRequestLite {
  id: string;
  staffProfileId: string;
  leaveTypeId: string;
  startDate: string; // YYYY-MM-DD
  endDate: string;   // YYYY-MM-DD
  status: string;
  staffProfile?: { id: string; user?: { name?: string | null } | null; department?: { name?: string | null } | null } | null;
  leaveType?: { id: string; name: string } | null;
}

interface DayCell { code: LeaveCode; typeId: string; requestId: string }
type StaffGrid = Record<number, DayCell>; // dayOfMonth → cell
type StaffSegment = { code: LeaveCode; start: number; end: number; count: number; typeId: string; requestId: string };

// ── Helpers ───────────────────────────────────────────────────────────────

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function daysInMonth(year: number, month1: number): number {
  return new Date(year, month1, 0).getDate();
}

// Convert a JS Date to YYYY-MM-DD without UTC drift.
function ymd(year: number, month1: number, day: number): string {
  return `${year}-${String(month1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

const DOW_SHORT = ["S", "M", "T", "W", "T", "F", "S"];

// Build a per-staff day-grid from approved leave requests for the displayed month.
function buildGantt(
  requests: LeaveRequestLite[],
  leaveTypes: LeaveTypeLite[],
  year: number,
  month1: number,
): Record<string, StaffGrid> {
  const typeById = new Map(leaveTypes.map((lt) => [lt.id, lt]));
  const days = daysInMonth(year, month1);
  const monthStart = startOfMonth(new Date(year, month1 - 1, 1));
  const monthEnd = endOfMonth(monthStart);
  const out: Record<string, StaffGrid> = {};

  for (const r of requests) {
    if (r.status !== "approved") continue;
    let start: Date, end: Date;
    try {
      start = parseISO(r.startDate);
      end = parseISO(r.endDate);
    } catch {
      continue;
    }
    if (end < monthStart || start > monthEnd) continue;

    const lt = typeById.get(r.leaveTypeId) ?? r.leaveType ?? null;
    const code = classifyLeaveType(lt?.name ?? "").code;

    const grid = (out[r.staffProfileId] ??= {});
    const lo = Math.max(start.getTime(), monthStart.getTime());
    const hi = Math.min(end.getTime(), monthEnd.getTime());
    for (let t = lo; t <= hi; t += 86_400_000) {
      const d = new Date(t).getDate();
      if (d >= 1 && d <= days) {
        grid[d] = { code, typeId: r.leaveTypeId, requestId: r.id };
      }
    }
  }
  return out;
}

// ── Page ──────────────────────────────────────────────────────────────────

function LeavePlannerPage() {
  const today = new Date();
  const [year, setYear]   = useState<number>(today.getFullYear());
  const [month, setMonth] = useState<number>(today.getMonth() + 1); // 1-12
  const [view, setView]   = useState<"gantt" | "list" | "summary">("gantt");
  const { team } = useTeamFilter();

  const monthStartDate = useMemo(() => startOfMonth(new Date(year, month - 1, 1)), [year, month]);
  const monthEndDate   = useMemo(() => endOfMonth(monthStartDate), [monthStartDate]);
  const fromIso = ymd(year, month, 1);
  const toIso   = ymd(year, month, daysInMonth(year, month));

  const { data: leaveTypes } = useQuery(orpc.leave.types.list.queryOptions());
  const { data: staffData, isLoading: staffLoading } = useQuery(
    orpc.staff.list.queryOptions({
      input: {
        limit: 200,
        offset: 0,
        status: "active",
        team: team === "All" ? undefined : team,
      },
    }),
  );
  const { data: requestsData, isLoading: requestsLoading } = useQuery(
    orpc.leave.requests.list.queryOptions({
      input: {
        status: "approved",
        from: fromIso,
        to: toIso,
        limit: 200,
        team: team === "All" ? undefined : team,
      },
    }),
  );

  // Personal Annual leave context (for the current user)
  const { data: me } = useQuery(orpc.staff.me.queryOptions());
  const { data: myBalances } = useQuery({
    ...orpc.leave.balances.getByStaff.queryOptions({
      input: { staffProfileId: me?.id ?? "" },
    }),
    enabled: Boolean(me?.id),
  });
  const myAnnual = useMemo(() => {
    if (!myBalances || !leaveTypes) return null;
    const annualType = leaveTypes.find((t) => classifyLeaveType(t.name).code === "A");
    if (!annualType) return null;
    const bal = myBalances.find((b) => b.leaveTypeId === annualType.id);
    if (!bal) return null;
    const entitlement = bal.entitlement ?? 0;
    const carried     = bal.carriedOver ?? 0;
    const adjustment  = bal.adjustment ?? 0;
    const used        = bal.used ?? 0;
    const allowance   = entitlement + carried + adjustment;
    return { used, allowance, remaining: allowance - used };
  }, [myBalances, leaveTypes]);

  const staff: StaffLite[] = (staffData ?? []) as StaffLite[];
  const requests: LeaveRequestLite[] = (requestsData ?? []) as LeaveRequestLite[];
  const types: LeaveTypeLite[] = (leaveTypes ?? []).map((t) => ({ id: t.id, name: t.name }));

  // Per-staff day grid
  const gantt = useMemo(
    () => buildGantt(requests, types, year, month),
    [requests, types, year, month],
  );

  // ── Compute counts per staff × per code ──────────────────────────────
  type StaffSummary = {
    id: string;
    name: string;
    initials: string;
    dept: string;
    counts: Record<LeaveCode, number>;
    total: number;
  };
  const staffSummary: StaffSummary[] = useMemo(() => {
    return staff.map((st) => {
      const grid = gantt[st.id] ?? {};
      const counts: Record<LeaveCode, number> = { A:0,S:0,M:0,C:0,H:0,W:0,O:0 };
      Object.values(grid).forEach((c) => { counts[c.code] += 1; });
      const total = Object.values(counts).reduce((s, v) => s + v, 0);
      const name = st.user?.name ?? "—";
      return {
        id: st.id,
        name,
        initials: getInitials(name),
        dept: st.department?.name ?? "—",
        counts,
        total,
      };
    });
  }, [staff, gantt]);

  // Filtered summary rows: only staff with at least one leave day this month
  const summaryRows = useMemo(
    () => staffSummary.filter((s) => s.total > 0)
                      .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name)),
    [staffSummary],
  );

  // ── Totals for top stats strip ─────────────────────────────────────────
  const totals = useMemo(() => {
    const t: Record<LeaveCode, number> = { A:0,S:0,M:0,C:0,H:0,W:0,O:0 };
    staffSummary.forEach((s) => {
      (Object.keys(s.counts) as LeaveCode[]).forEach((k) => { t[k] += s.counts[k]; });
    });
    return t;
  }, [staffSummary]);
  const grandTotal = useMemo(
    () => Object.values(totals).reduce((s, v) => s + v, 0),
    [totals],
  );

  // ── List view rows (segment per contiguous run) ───────────────────────
  type ListRow = StaffSegment & { staffId: string; staffName: string; dept: string };
  const listRows: ListRow[] = useMemo(() => {
    const rows: ListRow[] = [];
    const days = daysInMonth(year, month);
    for (const st of staff) {
      const grid = gantt[st.id] ?? {};
      let current: StaffSegment | null = null;
      for (let d = 1; d <= days; d++) {
        const cell = grid[d];
        if (cell) {
          if (current && current.code === cell.code) {
            current.end = d;
            current.count += 1;
          } else {
            current = {
              code: cell.code,
              start: d,
              end: d,
              count: 1,
              typeId: cell.typeId,
              requestId: cell.requestId,
            };
            rows.push({
              ...current,
              staffId: st.id,
              staffName: st.user?.name ?? "—",
              dept: st.department?.name ?? "—",
            });
          }
        } else {
          current = null;
        }
      }
    }
    rows.sort((a, b) => a.start - b.start || a.staffName.localeCompare(b.staffName));
    return rows;
  }, [staff, gantt, year, month]);

  // ── Gantt column meta ──────────────────────────────────────────────────
  const numDays = daysInMonth(year, month);
  const columnMeta = useMemo(() => {
    return Array.from({ length: numDays }, (_, i) => {
      const day = i + 1;
      const dow = getDay(new Date(year, month - 1, day)); // 0=Sun … 6=Sat
      const isWeekend = dow === 0 || dow === 6;
      const isToday =
        day === today.getDate() &&
        month === today.getMonth() + 1 &&
        year === today.getFullYear();
      return { day, dow, isWeekend, isToday };
    });
  }, [year, month, numDays, today]);

  // ── Navigation handlers ───────────────────────────────────────────────
  const prevMonth = () => {
    if (month === 1) { setMonth(12); setYear(year - 1); } else setMonth(month - 1);
  };
  const nextMonth = () => {
    if (month === 12) { setMonth(1); setYear(year + 1); } else setMonth(month + 1);
  };

  const monthLabel = format(monthStartDate, "MMMM yyyy");
  const isLoading = staffLoading || requestsLoading;

  // ──────────────────────────────────────────────────────────────────────
  return (
    <>
      <Header fixed>
        <div className="flex items-center gap-2">
          <CalendarRange className="size-4 text-muted-foreground" />
          <span className="text-sm font-medium">Leave Planner</span>
        </div>
        <div className="ms-auto flex items-center gap-2">
          <ThemeSwitch />
        </div>
      </Header>

      <Main className="space-y-4">
        {/* Page heading */}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">People</p>
            <h1 className="text-2xl font-bold tracking-tight">Leave Planner</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Approved and scheduled leave — {monthLabel}
              {team !== "All" ? ` · ${team}` : ""}
            </p>
          </div>
        </div>

        {/* ── Always-visible summary stats strip (TOP) ─────────────────── */}
        <Card>
          <CardContent className="p-0">
            <div className="flex flex-wrap items-stretch divide-x divide-border">
              {STAT_ORDER.map((code) => {
                const s = LEAVE_STYLES[code];
                return (
                  <div key={code} className="flex items-center gap-2.5 px-4 py-3 min-w-[140px]">
                    <span
                      className={`inline-flex items-center justify-center h-8 w-8 rounded-md text-xs font-bold ${s.pillBg} ${s.pillTc}`}
                    >
                      {s.code}
                    </span>
                    <div>
                      <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                        {s.label}
                      </div>
                      <div className={`text-lg font-bold tabular-nums ${s.pillTc}`}>
                        {isLoading ? "—" : totals[code]}
                      </div>
                    </div>
                  </div>
                );
              })}
              <div className="flex items-center px-5 py-3 ml-auto">
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                    Total Leave Days
                  </div>
                  <div className="text-lg font-bold tabular-nums">
                    {isLoading ? "—" : grandTotal}
                  </div>
                </div>
              </div>
            </div>

            {/* Annual leave personal context (current user) */}
            {myAnnual && (
              <div className="border-t bg-muted/30 px-4 py-2 flex flex-wrap items-center gap-x-6 gap-y-1 text-xs">
                <span className="font-medium text-muted-foreground uppercase tracking-wider">
                  Your Annual Leave
                </span>
                <span className="tabular-nums">
                  Used <span className="font-semibold text-violet-700 dark:text-violet-300">{myAnnual.used}</span> /
                  {" "}{myAnnual.allowance} days
                </span>
                <span className="tabular-nums">
                  Remaining{" "}
                  <span className={`font-semibold ${
                    myAnnual.remaining <= 0
                      ? "text-red-600 dark:text-red-400"
                      : myAnnual.remaining <= 5
                        ? "text-amber-600 dark:text-amber-400"
                        : "text-foreground"
                  }`}>
                    {myAnnual.remaining}
                  </span>{" "}
                  days
                </span>
              </div>
            )}
          </CardContent>
        </Card>

        {/* ── Year + Month selectors + View toggle ─────────────────────── */}
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={prevMonth} aria-label="Previous month">
            <ChevronLeft className="size-4" />
          </Button>
          <Select value={String(month)} onValueChange={(v) => setMonth(Number(v))}>
            <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                <SelectItem key={m} value={String(m)}>
                  {format(new Date(2000, m - 1, 1), "MMMM")}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
            <SelectTrigger className="w-[110px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {[year - 2, year - 1, year, year + 1].map((y) => (
                <SelectItem key={y} value={String(y)}>{y}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={nextMonth} aria-label="Next month">
            <ChevronRight className="size-4" />
          </Button>

          <div className="ml-auto inline-flex rounded-md border overflow-hidden">
            {([
              { v: "gantt",   icon: GanttChart, label: "Gantt"   },
              { v: "list",    icon: ListIcon,   label: "List"    },
              { v: "summary", icon: BarChart3,  label: "Summary" },
            ] as const).map((b) => {
              const ActiveIcon = b.icon;
              const isActive = view === b.v;
              return (
                <button
                  key={b.v}
                  type="button"
                  onClick={() => setView(b.v)}
                  className={`h-8 px-3 inline-flex items-center gap-1.5 text-xs font-medium border-r last:border-r-0 transition-colors ${
                    isActive
                      ? "bg-primary text-primary-foreground"
                      : "bg-background text-muted-foreground hover:bg-muted"
                  }`}
                >
                  <ActiveIcon className="size-3.5" />
                  {b.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* ── Legend ──────────────────────────────────────────────────── */}
        <div className="flex flex-wrap items-center gap-1.5">
          {STAT_ORDER.map((code) => {
            const s = LEAVE_STYLES[code];
            return (
              <span
                key={code}
                className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-bold ${s.bg} ${s.tc}`}
              >
                {s.code} {s.label}
              </span>
            );
          })}
          <span className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-bold bg-muted text-muted-foreground">
            — Weekend
          </span>
        </div>

        {/* ── View body ───────────────────────────────────────────────── */}
        {isLoading ? (
          <Skeleton className="h-72 w-full" />
        ) : view === "summary" ? (
          <SummaryView
            rows={summaryRows}
            totals={totals}
            grandTotal={grandTotal}
          />
        ) : view === "list" ? (
          <ListView
            rows={listRows}
            year={year}
            month={month}
            typeNameById={new Map(types.map((t) => [t.id, t.name]))}
          />
        ) : (
          <GanttView
            staff={staff}
            gantt={gantt}
            columnMeta={columnMeta}
          />
        )}
      </Main>
    </>
  );
}

// ── Sub-views ─────────────────────────────────────────────────────────────

function SummaryView({
  rows,
  totals,
  grandTotal,
}: {
  rows: Array<{
    id: string;
    name: string;
    initials: string;
    dept: string;
    counts: Record<LeaveCode, number>;
    total: number;
  }>;
  totals: Record<LeaveCode, number>;
  grandTotal: number;
}) {
  if (rows.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-sm text-muted-foreground">
          No approved leave this month.
        </CardContent>
      </Card>
    );
  }
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold">Per-staff leave totals</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Staff</TableHead>
              <TableHead>Department</TableHead>
              {STAT_ORDER.map((c) => (
                <TableHead key={c} className="text-right">
                  {LEAVE_STYLES[c].label}
                </TableHead>
              ))}
              <TableHead className="text-right">Total</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.id}>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-muted text-[10px] font-semibold">
                      {r.initials}
                    </span>
                    <span className="font-medium">{r.name}</span>
                  </div>
                </TableCell>
                <TableCell>
                  <span className="inline-flex items-center rounded-md bg-muted px-2 py-0.5 text-xs">
                    {r.dept}
                  </span>
                </TableCell>
                {STAT_ORDER.map((c) => {
                  const v = r.counts[c];
                  return (
                    <TableCell key={c} className="text-right font-mono tabular-nums">
                      {v ? <span className={LEAVE_STYLES[c].pillTc}>{v}</span> : <span className="text-muted-foreground/40">—</span>}
                    </TableCell>
                  );
                })}
                <TableCell className="text-right font-mono tabular-nums font-bold">
                  {r.total}
                </TableCell>
              </TableRow>
            ))}
            {/* Totals row */}
            <TableRow className="border-t-2 bg-muted/40 font-semibold">
              <TableCell colSpan={2} className="font-bold uppercase text-xs tracking-wider text-muted-foreground">
                Totals
              </TableCell>
              {STAT_ORDER.map((c) => (
                <TableCell key={c} className="text-right font-mono tabular-nums font-bold">
                  {totals[c] || <span className="text-muted-foreground/40 font-normal">—</span>}
                </TableCell>
              ))}
              <TableCell className="text-right font-mono tabular-nums font-bold">
                {grandTotal}
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function ListView({
  rows,
  year,
  month,
  typeNameById,
}: {
  rows: Array<{
    code: LeaveCode;
    start: number;
    end: number;
    count: number;
    typeId: string;
    requestId: string;
    staffId: string;
    staffName: string;
    dept: string;
  }>;
  year: number;
  month: number;
  typeNameById: Map<string, string>;
}) {
  const monthShort = format(new Date(year, month - 1, 1), "MMM");
  if (rows.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-sm text-muted-foreground">
          No approved leave this month.
        </CardContent>
      </Card>
    );
  }
  return (
    <Card>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Staff</TableHead>
              <TableHead>Dept</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Period</TableHead>
              <TableHead className="text-right">Days</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => {
              const s = LEAVE_STYLES[r.code];
              const typeDisplay = getLeaveTypeDisplayName(typeNameById.get(r.typeId) ?? "");
              return (
                <TableRow key={`${r.requestId}-${r.start}`}>
                  <TableCell className="font-medium">{r.staffName}</TableCell>
                  <TableCell>
                    <span className="inline-flex items-center rounded-md bg-muted px-2 py-0.5 text-xs">
                      {r.dept}
                    </span>
                  </TableCell>
                  <TableCell>
                    <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-[11px] font-semibold ${s.bg} ${s.tc}`}>
                      {typeDisplay || s.label}
                    </span>
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    {r.start === r.end
                      ? `${monthShort} ${r.start}`
                      : `${monthShort} ${r.start} – ${r.end}`}
                  </TableCell>
                  <TableCell className="text-right font-mono tabular-nums">{r.count}</TableCell>
                  <TableCell>
                    <span className="inline-flex items-center rounded-md bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">
                      Approved
                    </span>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function GanttView({
  staff,
  gantt,
  columnMeta,
}: {
  staff: StaffLite[];
  gantt: Record<string, StaffGrid>;
  columnMeta: Array<{ day: number; dow: number; isWeekend: boolean; isToday: boolean }>;
}) {
  if (staff.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-sm text-muted-foreground">
          No staff found.
        </CardContent>
      </Card>
    );
  }
  return (
    <Card>
      <CardContent className="p-0 overflow-auto">
        <table className="border-collapse text-[11px] min-w-max w-full">
          <thead className="sticky top-0 z-10">
            <tr className="bg-muted/60 backdrop-blur border-b-2 border-border">
              <th className="sticky left-0 z-20 bg-muted/80 px-3 py-2 text-left font-semibold min-w-[200px] border-r-2 border-border">
                Staff
              </th>
              {columnMeta.map((c) => (
                <th
                  key={c.day}
                  className={`w-8 min-w-[28px] py-1.5 text-center font-semibold border-r border-border ${
                    c.isWeekend
                      ? "bg-muted/40 text-muted-foreground/60"
                      : c.isToday
                        ? "bg-primary/10 text-primary"
                        : "text-muted-foreground"
                  }`}
                >
                  <div className="text-[8px] uppercase">{DOW_SHORT[c.dow]}</div>
                  <div>{c.day}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {staff.map((st) => {
              const grid = gantt[st.id] ?? {};
              const name = st.user?.name ?? "—";
              const initials = getInitials(name);
              const dept = st.department?.name ?? "—";
              return (
                <tr key={st.id} className="border-b border-border/60 hover:bg-muted/30">
                  <td className="sticky left-0 z-10 bg-background px-3 py-1.5 border-r-2 border-border">
                    <div className="flex items-center gap-2">
                      <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-muted text-[10px] font-semibold">
                        {initials}
                      </span>
                      <div>
                        <div className="font-medium text-[12px]">{name}</div>
                        <div className="text-[10px] text-muted-foreground">{dept}</div>
                      </div>
                    </div>
                  </td>
                  {columnMeta.map((c) => {
                    const cell = grid[c.day];
                    const s = cell ? LEAVE_STYLES[cell.code] : null;
                    return (
                      <td
                        key={c.day}
                        className={`p-0.5 border-r border-border/40 ${
                          c.isWeekend ? "bg-muted/30" : ""
                        }`}
                      >
                        <div
                          className={`w-full h-6 rounded flex items-center justify-center text-[9px] font-bold ${
                            s ? `${s.bg} ${s.tc}` : "bg-transparent"
                          }`}
                          title={cell ? `${name} — ${LEAVE_STYLES[cell.code].label}` : undefined}
                        >
                          {cell?.code ?? ""}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}
