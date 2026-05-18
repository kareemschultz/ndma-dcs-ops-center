// /attendance/analytics — Attendance Analytics (revamped)
//
// A correlated picture of the whole Attendance module rather than just the
// lateness register. It joins FIVE datasets that the module now holds:
//   1. attendanceDaily.listRange   — the 10-status daily roll-call grid
//   2. attendanceTime.logs.list    — clock in/out logs (work hours, status)
//   3. attendanceTime.lateness.list — the manual lateness register
//   4. lateness.quarterlyGrid      — clock-log-DERIVED lateness + quarter totals
//   5. leave.tosd.list             — the Time-Off / Sick-Days register
//   + attendanceTime.leaveOverlay  — approved leave projected onto the month
//
// Three lenses (Overview · Lateness · Time & Leave) keep it readable; one
// query per dataset, shared across every lens.

import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { getDaysInMonth } from "date-fns";
import {
  AlertTriangle,
  BarChart3,
  CalendarOff,
  Clock,
  Hourglass,
  LayoutGrid,
  Plane,
  TrendingUp,
  Users,
} from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@ndma-dcs-staff-portal/ui/components/card";
import { Skeleton } from "@ndma-dcs-staff-portal/ui/components/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@ndma-dcs-staff-portal/ui/components/select";

import { AttendanceSubNav } from "@/components/layout/attendance-sub-nav";
import { DepartmentFilter } from "@/components/layout/department-filter";
import { Header } from "@/components/layout/header";
import { Main } from "@/components/layout/main";
import { StatusLegend } from "@/components/status-legend";
import { DataPagination, usePagination } from "@/components/data-pagination";
import { ThemeSwitch } from "@/components/theme-switch";
import { orpc } from "@/utils/orpc";
import { chartTheme } from "@/lib/chart-theme";
import { useTeamFilter } from "@/lib/team-filter";
import {
  ATTENDANCE_STATUS_TONE,
  TONES,
  legendFromMap,
} from "@/lib/status-colors";

export const Route = createFileRoute("/_authenticated/attendance/analytics")({
  component: AttendanceAnalyticsPage,
});

// ─── Palette (blue/indigo — no green; bad = red/amber/orange) ─────────────────

const C = {
  blue: TONES.blue.hex,
  blueDark: "#2563eb",
  indigo: TONES.indigo.hex,
  amber: TONES.amber.hex,
  orange: TONES.orange.hex,
  red: TONES.red.hex,
  rose: TONES.rose.hex,
  violet: TONES.violet.hex,
  purple: TONES.purple.hex,
  pink: TONES.pink.hex,
  sky: TONES.sky.hex,
  slate: TONES.slate.hex,
  cyan: TONES.cyan.hex,
} as const;

type DailyStatus =
  | "on_site"
  | "wfh"
  | "late"
  | "half_day"
  | "annual_leave"
  | "sick"
  | "compassionate"
  | "maternity_paternity"
  | "absent"
  | "holiday";

const STATUS_LABEL: Record<DailyStatus, string> = {
  on_site: "On Site",
  wfh: "WFH",
  late: "Late",
  half_day: "Half Day",
  annual_leave: "Annual Leave",
  sick: "Sick",
  compassionate: "Compassionate",
  maternity_paternity: "Mat/Pat",
  absent: "Absent",
  holiday: "Holiday",
};

const STATUS_COLOR: Record<DailyStatus, string> = {
  on_site: C.blue,
  wfh: C.sky,
  late: C.orange,
  half_day: C.amber,
  annual_leave: C.violet,
  sick: C.red,
  compassionate: C.purple,
  maternity_paternity: C.pink,
  absent: "#b91c1c",
  holiday: C.slate,
};

const STATUS_ORDER: DailyStatus[] = [
  "on_site",
  "wfh",
  "late",
  "half_day",
  "annual_leave",
  "sick",
  "compassionate",
  "maternity_paternity",
  "absent",
  "holiday",
];

const PRESENT_STATUSES: ReadonlySet<DailyStatus> = new Set<DailyStatus>([
  "on_site",
  "wfh",
  "late",
  "half_day",
]);
const LEAVE_STATUSES: ReadonlySet<DailyStatus> = new Set<DailyStatus>([
  "annual_leave",
  "sick",
  "compassionate",
  "maternity_paternity",
]);

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const QUARTER_MONTHS: Record<number, string[]> = {
  1: ["January", "February", "March"],
  2: ["April", "May", "June"],
  3: ["July", "August", "September"],
  4: ["October", "November", "December"],
};

// TOSD register type → label + colour. Mirrors tosdTypeEnum in the schema.
const TOSD_TYPE_LABEL: Record<string, string> = {
  reported_sick: "Reported Sick",
  medical: "Medical",
  absent: "Absent",
  time_off: "Time Off",
  work_from_home: "Work From Home",
  lateness: "Lateness",
  callout_legacy: "Callout (legacy)",
};
const TOSD_TYPE_COLOR: Record<string, string> = {
  reported_sick: C.red,
  medical: C.rose,
  absent: "#b91c1c",
  time_off: C.indigo,
  work_from_home: C.sky,
  lateness: C.orange,
  callout_legacy: C.slate,
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Parse the `totalTimeLate` string into minutes. The lateness importer stores
 * either "HH:MM" / "H:MM:SS" clock strings or a raw fraction-of-a-day number.
 */
function parseTimeLateMinutes(raw: string | null | undefined): number {
  if (!raw) return 0;
  const trimmed = raw.trim();
  if (trimmed === "" || trimmed === "0") return 0;
  if (trimmed.includes(":")) {
    const parts = trimmed.split(":").map((p) => Number(p) || 0);
    const [h = 0, m = 0, s = 0] = parts;
    return h * 60 + m + s / 60;
  }
  const num = Number(trimmed);
  if (Number.isNaN(num)) return 0;
  // Fraction-of-a-day (Excel time) → minutes; otherwise treat as raw minutes.
  return num > 0 && num < 1 ? num * 24 * 60 : num;
}

function fmtHours(hrs: number): string {
  if (hrs <= 0) return "0h";
  return `${hrs.toFixed(1)}h`;
}

/**
 * Normalise a stored month value to its canonical full name ("April").
 * The lateness register has historically been keyed with a mix of full names
 * ("April") and 3-letter abbreviations ("Jan", "Oct"). Without this, an exact
 * `includes()` match against full-name quarter buckets silently drops the
 * abbreviated rows — under-counting the lateness charts / KPIs. Mirrors
 * `canonicalMonth()` in packages/api/src/routers/lateness.ts.
 */
function canonicalMonth(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const s = raw.trim().toLowerCase();
  if (!s) return null;
  const exact = MONTHS.find((m) => m.toLowerCase() === s);
  if (exact) return exact;
  const prefix = s.slice(0, 3);
  return MONTHS.find((m) => m.toLowerCase().startsWith(prefix)) ?? null;
}

// ─── KPI tile ─────────────────────────────────────────────────────────────────

type Tone = "blue" | "amber" | "orange" | "red" | "indigo" | "violet" | "sky";

const KPI_TONE: Record<Tone, string> = {
  blue: "bg-blue-500/10 text-blue-700 dark:text-blue-300",
  amber: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
  orange: "bg-orange-500/10 text-orange-700 dark:text-orange-300",
  red: "bg-red-500/10 text-red-700 dark:text-red-300",
  indigo: "bg-indigo-500/10 text-indigo-700 dark:text-indigo-300",
  violet: "bg-violet-500/10 text-violet-700 dark:text-violet-300",
  sky: "bg-sky-500/10 text-sky-700 dark:text-sky-300",
};

function KpiTile({
  label,
  value,
  sub,
  icon: Icon,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  icon: React.FC<React.SVGProps<SVGSVGElement>>;
  tone: Tone;
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-4">
        <div className={`grid size-10 shrink-0 place-items-center rounded-xl ${KPI_TONE[tone]}`}>
          <Icon className="size-5" />
        </div>
        <div className="min-w-0">
          <div className="text-2xl font-bold tabular-nums leading-tight">{value}</div>
          <div className="truncate text-xs text-muted-foreground">{label}</div>
          {sub && <div className="truncate text-[11px] text-muted-foreground/70">{sub}</div>}
        </div>
      </CardContent>
    </Card>
  );
}

function NoData({ height = 260 }: { height?: number }) {
  return (
    <div
      className="flex items-center justify-center text-sm text-muted-foreground"
      style={{ height }}
    >
      No data for the selected period
    </div>
  );
}

function ChartCard({
  title,
  hint,
  children,
  loading,
  span,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
  loading?: boolean;
  span?: boolean;
}) {
  return (
    <Card className={span ? "lg:col-span-2" : undefined}>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{title}</CardTitle>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </CardHeader>
      <CardContent>
        {loading ? <Skeleton className="h-[260px] w-full rounded-xl" /> : children}
      </CardContent>
    </Card>
  );
}

// ─── Lens toggle ──────────────────────────────────────────────────────────────

type Lens = "overview" | "lateness" | "time-leave";

const LENSES: Array<{ value: Lens; label: string; Icon: React.FC<React.SVGProps<SVGSVGElement>> }> = [
  { value: "overview", label: "Overview", Icon: LayoutGrid },
  { value: "lateness", label: "Lateness", Icon: Timer },
  { value: "time-leave", label: "Time & Leave", Icon: Plane },
];

// Re-use the Timer icon name without importing twice.
function Timer(props: React.SVGProps<SVGSVGElement>) {
  return <Clock {...props} />;
}

// ─── Main page ────────────────────────────────────────────────────────────────

function AttendanceAnalyticsPage() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1); // 1-12
  const [lens, setLens] = useState<Lens>("overview");
  const { team } = useTeamFilter();
  const teamParam = team === "All" ? undefined : team;

  const daysInMonth = getDaysInMonth(new Date(year, month - 1));
  const from = `${year}-${String(month).padStart(2, "0")}-01`;
  const to = `${year}-${String(month).padStart(2, "0")}-${String(daysInMonth).padStart(2, "0")}`;
  const quarter = Math.ceil(month / 3);

  // ── Data — one query per dataset, shared across every lens ─────────────────
  const dailyQuery = useQuery(
    orpc.attendanceDaily.listRange.queryOptions({ input: { from, to } }),
  );
  const logsQuery = useQuery(
    orpc.attendanceTime.logs.list.queryOptions({
      input: { from, to, team: teamParam, limit: 500 },
    }),
  );
  const latenessQuery = useQuery(
    orpc.attendanceTime.lateness.list.queryOptions({
      input: { year, team: teamParam },
    }),
  );
  const quarterlyQuery = useQuery(
    orpc.lateness.quarterlyGrid.queryOptions({ input: { year, quarter } }),
  );
  const tosdQuery = useQuery(orpc.leave.tosd.list.queryOptions({ input: { year } }));
  const holidaysQuery = useQuery(
    orpc.attendanceTime.holidays.list.queryOptions({ input: { year } }),
  );
  const overlayQuery = useQuery(
    orpc.attendanceTime.leaveOverlay.queryOptions({
      input: { from, to, team: teamParam },
    }),
  );

  const isLoading =
    latenessQuery.isLoading ||
    dailyQuery.isLoading ||
    logsQuery.isLoading ||
    quarterlyQuery.isLoading;

  // ── Daily roll-call aggregation (selected month) ───────────────────────────
  const daily = useMemo(() => {
    let rows = dailyQuery.data ?? [];
    if (teamParam) {
      rows = rows.filter(
        (r) => r.staffProfile?.department?.code === teamParam,
      );
    }

    const statusCounts: Record<DailyStatus, number> = {
      on_site: 0, wfh: 0, late: 0, half_day: 0, annual_leave: 0,
      sick: 0, compassionate: 0, maternity_paternity: 0, absent: 0, holiday: 0,
    };
    // day → headcount split
    const perDay = new Map<
      number,
      { present: number; absent: number; late: number; leave: number }
    >();
    // department → status tallies
    const deptAgg = new Map<
      string,
      { name: string; present: number; absent: number; late: number; leave: number; total: number }
    >();

    for (const r of rows) {
      const st = r.status as DailyStatus;
      if (st in statusCounts) statusCounts[st] += 1;

      const day = Number(r.date.slice(8, 10));
      const d = perDay.get(day) ?? { present: 0, absent: 0, late: 0, leave: 0 };
      if (PRESENT_STATUSES.has(st)) d.present += 1;
      if (st === "absent") d.absent += 1;
      if (st === "late") d.late += 1;
      if (LEAVE_STATUSES.has(st)) d.leave += 1;
      perDay.set(day, d);

      const dept = r.staffProfile?.department?.name ?? "Unassigned";
      const da =
        deptAgg.get(dept) ??
        { name: dept, present: 0, absent: 0, late: 0, leave: 0, total: 0 };
      da.total += 1;
      if (PRESENT_STATUSES.has(st)) da.present += 1;
      if (st === "absent") da.absent += 1;
      if (st === "late") da.late += 1;
      if (LEAVE_STATUSES.has(st)) da.leave += 1;
      deptAgg.set(dept, da);
    }

    const total = rows.length;
    const presentTotal =
      statusCounts.on_site + statusCounts.wfh + statusCounts.late + statusCounts.half_day;
    const leaveTotal =
      statusCounts.annual_leave +
      statusCounts.sick +
      statusCounts.compassionate +
      statusCounts.maternity_paternity;
    const attendanceRate = total > 0 ? Math.round((presentTotal / total) * 100) : 0;
    const absenteeismRate = total > 0 ? Math.round((statusCounts.absent / total) * 100) : 0;

    const statusDist = STATUS_ORDER.filter((s) => statusCounts[s] > 0).map((s) => ({
      name: STATUS_LABEL[s],
      value: statusCounts[s],
      fill: STATUS_COLOR[s],
    }));

    const dailyTrend = Array.from({ length: daysInMonth }, (_, i) => {
      const day = i + 1;
      const d = perDay.get(day) ?? { present: 0, absent: 0, late: 0, leave: 0 };
      return { day: String(day), ...d };
    });

    const byDept = [...deptAgg.values()]
      .sort((a, b) => b.total - a.total)
      .map((d) => ({
        ...d,
        rate: d.total > 0 ? Math.round((d.present / d.total) * 100) : 0,
      }));

    return {
      total,
      presentTotal,
      leaveTotal,
      attendanceRate,
      absenteeismRate,
      statusCounts,
      statusDist,
      dailyTrend,
      byDept,
    };
  }, [dailyQuery.data, daysInMonth, teamParam]);

  // ── Clock-log aggregation (work hours, selected month) ─────────────────────
  const clock = useMemo(() => {
    const rows = logsQuery.data ?? [];
    let totalHours = 0;
    let hoursRows = 0;
    let clockInCount = 0;
    const statusCounts: Record<string, number> = {};
    // department → { hours, days }
    const deptAgg = new Map<string, { name: string; hours: number; days: number }>();
    // staff → { hours, days }
    const staffAgg = new Map<string, { name: string; hours: number; days: number }>();
    // day → total work hours
    const perDay = new Map<number, number>();

    for (const r of rows) {
      statusCounts[r.status] = (statusCounts[r.status] ?? 0) + 1;
      if (r.clockIn) clockInCount += 1;
      const h = r.workHours ? Number(r.workHours) : 0;
      if (h > 0) {
        totalHours += h;
        hoursRows += 1;
        const day = Number(r.date.slice(8, 10));
        perDay.set(day, (perDay.get(day) ?? 0) + h);

        const dept = r.staffProfile?.department?.name ?? "Unassigned";
        const da = deptAgg.get(dept) ?? { name: dept, hours: 0, days: 0 };
        da.hours += h;
        da.days += 1;
        deptAgg.set(dept, da);

        const name =
          r.staffProfile?.user?.name ?? r.staffProfile?.employeeId ?? "Unknown";
        const sa = staffAgg.get(r.staffId) ?? { name, hours: 0, days: 0 };
        sa.hours += h;
        sa.days += 1;
        staffAgg.set(r.staffId, sa);
      }
    }

    const avgHours = hoursRows > 0 ? totalHours / hoursRows : 0;

    const hoursByDept = [...deptAgg.values()]
      .map((d) => ({ name: d.name, hours: Math.round(d.hours) }))
      .sort((a, b) => b.hours - a.hours);

    const hoursTrend = Array.from({ length: daysInMonth }, (_, i) => ({
      day: String(i + 1),
      hours: Math.round((perDay.get(i + 1) ?? 0) * 10) / 10,
    }));

    const topHours = [...staffAgg.values()]
      .sort((a, b) => b.hours - a.hours)
      .slice(0, 10)
      .map((s) => ({
        name: s.name,
        hours: Math.round(s.hours),
        avg: s.days > 0 ? Math.round((s.hours / s.days) * 10) / 10 : 0,
      }));

    return {
      logCount: rows.length,
      totalHours,
      avgHours,
      clockInCount,
      statusCounts,
      hoursByDept,
      hoursTrend,
      topHours,
    };
  }, [logsQuery.data, daysInMonth]);

  // ── Manual lateness register (selected quarter) ────────────────────────────
  const lateness = useMemo(() => {
    const all = latenessQuery.data ?? [];
    const quarterMonths = QUARTER_MONTHS[quarter] ?? [];
    // Normalise each record's month to a canonical full name so abbreviated
    // entries ("Jan", "Oct") still land in the right quarter bucket.
    const rows = all
      .map((r) => ({ ...r, canonMonth: canonicalMonth(r.month) }))
      .filter((r) => r.canonMonth !== null && quarterMonths.includes(r.canonMonth));

    let totalDaysLate = 0;
    let totalMinutes = 0;
    const staffAgg = new Map<string, { name: string; daysLate: number; minutes: number }>();
    const deptAgg = new Map<string, { name: string; daysLate: number }>();
    const monthAgg = new Map<string, { daysLate: number; minutes: number }>();

    for (const r of rows) {
      const mins = parseTimeLateMinutes(r.totalTimeLate);
      totalDaysLate += r.daysLate;
      totalMinutes += mins;

      const name =
        r.staffProfile?.user?.name ?? r.staffProfile?.employeeId ?? "Unknown";
      const s = staffAgg.get(r.staffId) ?? { name, daysLate: 0, minutes: 0 };
      s.daysLate += r.daysLate;
      s.minutes += mins;
      staffAgg.set(r.staffId, s);

      const dept = r.staffProfile?.department?.name ?? "Unassigned";
      const d = deptAgg.get(dept) ?? { name: dept, daysLate: 0 };
      d.daysLate += r.daysLate;
      deptAgg.set(dept, d);

      // Key the per-month tally by the CANONICAL name so the quarter trend
      // chart below (which looks up full month names) finds every record.
      const mm = monthAgg.get(r.canonMonth!) ?? { daysLate: 0, minutes: 0 };
      mm.daysLate += r.daysLate;
      mm.minutes += mins;
      monthAgg.set(r.canonMonth!, mm);
    }

    const byDept = [...deptAgg.values()].sort((a, b) => b.daysLate - a.daysLate);

    const trend = quarterMonths.map((m) => ({
      name: m.slice(0, 3),
      daysLate: monthAgg.get(m)?.daysLate ?? 0,
      avgMinutes: Math.round(monthAgg.get(m)?.minutes ?? 0),
    }));

    const staffAffected = [...staffAgg.values()].filter((s) => s.daysLate > 0).length;
    const avgMinutes = totalDaysLate > 0 ? totalMinutes / totalDaysLate : 0;

    return {
      recordCount: rows.length,
      totalDaysLate,
      totalMinutes,
      avgMinutes,
      staffAffected,
      byDept,
      trend,
    };
  }, [latenessQuery.data, quarter]);

  // ── Quarterly grid — correlate MANUAL vs clock-log-DERIVED lateness ────────
  const correlated = useMemo(() => {
    const grid = quarterlyQuery.data;
    if (!grid) {
      return { months: [] as string[], byMonth: [], staffRows: [], derivedOnly: 0 };
    }
    const months = grid.months;

    // per-month: manual days vs derived days vs combined quarter
    const byMonth = months.map((m) => {
      let manual = 0;
      let derived = 0;
      for (const row of grid.rows) {
        if (row.months[m]) manual += row.months[m]!.daysLate;
        if (row.derived[m]) derived += row.derived[m]!.daysLate;
      }
      return { name: m.slice(0, 3), manual, derived };
    });

    // per-staff quarter totals (manual where present, else derived) + how much
    // of each came from clock logs only.
    const staffRows = grid.rows
      .map((row) => {
        let manualDays = 0;
        let derivedFillDays = 0;
        for (const m of months) {
          if (row.months[m]) manualDays += row.months[m]!.daysLate;
          else if (row.derived[m]) derivedFillDays += row.derived[m]!.daysLate;
        }
        return {
          staffId: row.staffId,
          name: row.staffName,
          quarterDays: row.quarterTotal.daysLate,
          quarterTime: row.quarterTotal.totalTimeLate,
          manualDays,
          derivedFillDays,
        };
      })
      .filter((r) => r.quarterDays > 0)
      .sort((a, b) => b.quarterDays - a.quarterDays);

    // staff whose quarter total is entirely clock-log-derived (no manual record)
    const derivedOnly = staffRows.filter(
      (r) => r.manualDays === 0 && r.derivedFillDays > 0,
    ).length;

    return { months, byMonth, staffRows, derivedOnly };
  }, [quarterlyQuery.data]);

  // ── TOSD register (selected year) ──────────────────────────────────────────
  const tosd = useMemo(() => {
    let rows = tosdQuery.data ?? [];
    if (teamParam) {
      rows = rows.filter((r) => r.staffProfile?.department?.code === teamParam);
    }
    const typeCounts: Record<string, number> = {};
    let sickDays = 0;
    let timeOffDays = 0;
    // month index → count
    const perMonth = new Map<number, number>();
    const staffAgg = new Map<string, { name: string; count: number; days: number }>();

    for (const r of rows) {
      typeCounts[r.type] = (typeCounts[r.type] ?? 0) + 1;
      const d = r.days ? Number(r.days) : 1;
      if (r.type === "reported_sick" || r.type === "medical") sickDays += d;
      if (r.type === "time_off" || r.type === "work_from_home") timeOffDays += d;

      const mi = Number(r.date.slice(5, 7)) - 1;
      perMonth.set(mi, (perMonth.get(mi) ?? 0) + 1);

      const name =
        r.staffProfile?.user?.name ?? r.staffProfile?.employeeId ?? "Unknown";
      const sa = staffAgg.get(r.staffId) ?? { name, count: 0, days: 0 };
      sa.count += 1;
      sa.days += d;
      staffAgg.set(r.staffId, sa);
    }

    const byType = Object.entries(typeCounts)
      .map(([t, value]) => ({
        name: TOSD_TYPE_LABEL[t] ?? t,
        value,
        fill: TOSD_TYPE_COLOR[t] ?? C.slate,
      }))
      .sort((a, b) => b.value - a.value);

    const trend = MONTHS.map((m, i) => ({
      name: m.slice(0, 3),
      count: perMonth.get(i) ?? 0,
    }));

    const topStaff = [...staffAgg.values()]
      .sort((a, b) => b.days - a.days)
      .slice(0, 10);

    return {
      total: rows.length,
      sickDays,
      timeOffDays,
      byType,
      trend,
      topStaff,
    };
  }, [tosdQuery.data, teamParam]);

  // ── Leave overlay — approved leave projected onto the month ────────────────
  const overlay = useMemo(() => {
    const map = overlayQuery.data ?? {};
    let staffOnLeave = 0;
    let leaveDays = 0;
    const typeAgg = new Map<string, number>();
    for (const days of Object.values(map)) {
      const entries = Object.values(days);
      if (entries.length > 0) staffOnLeave += 1;
      leaveDays += entries.length;
      for (const d of entries) {
        typeAgg.set(d.leaveType, (typeAgg.get(d.leaveType) ?? 0) + 1);
      }
    }
    const byType = [...typeAgg.entries()]
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
    return { staffOnLeave, leaveDays, byType };
  }, [overlayQuery.data]);

  // ── Coverage correlation — roll-call rows vs clock logs vs leave overlay ───
  const coverage = useMemo(() => {
    return [
      { name: "Roll-call marks", value: daily.total, fill: C.blue },
      { name: "Clock logs", value: clock.logCount, fill: C.indigo },
      { name: "Approved-leave days", value: overlay.leaveDays, fill: C.rose },
    ].filter((d) => d.value > 0);
  }, [daily.total, clock.logCount, overlay.leaveDays]);

  // Department comparison table pagination (overview lens)
  const deptPag = usePagination(daily.byDept, 8);
  // Quarter offenders table pagination (lateness lens)
  const offenderPag = usePagination(correlated.staffRows, 12);
  // TOSD staff table pagination (time-leave lens)
  const tosdPag = usePagination(tosd.topStaff, 10);

  const yearOptions = [
    now.getFullYear() - 2,
    now.getFullYear() - 1,
    now.getFullYear(),
    now.getFullYear() + 1,
  ];

  const holidayCount = holidaysQuery.data?.length ?? 0;
  const holidayThisMonth =
    holidaysQuery.data?.filter((h) => h.eventDate.startsWith(from.slice(0, 7)))
      .length ?? 0;

  return (
    <>
      <Header fixed>
        <div className="flex items-center gap-2">
          <BarChart3 className="size-4 text-muted-foreground" />
          <span className="text-sm font-medium">Attendance Analytics</span>
        </div>
        <div className="ms-auto flex items-center gap-2">
          <ThemeSwitch />
        </div>
      </Header>

      <AttendanceSubNav activeView="analytics" />

      <Main className="space-y-6">
        {/* Heading + filters */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Attendance Analytics</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Correlated view of roll-call, clock logs, lateness, time-off / sick
              days and approved leave. Lateness charts use {year} Q{quarter};
              attendance / hours charts use {MONTHS[month - 1]} {year}.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <DepartmentFilter />
            <Select value={String(year)} onValueChange={(v) => v && setYear(Number(v))}>
              <SelectTrigger className="h-9 w-24 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {yearOptions.map((y) => (
                  <SelectItem key={y} value={String(y)}>
                    {y}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={String(month)} onValueChange={(v) => v && setMonth(Number(v))}>
              <SelectTrigger className="h-9 w-36 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MONTHS.map((m, i) => (
                  <SelectItem key={m} value={String(i + 1)}>
                    {m}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Lens toggle */}
        <div className="inline-flex rounded-lg border p-0.5">
          {LENSES.map((l) => {
            const active = l.value === lens;
            return (
              <button
                key={l.value}
                type="button"
                onClick={() => setLens(l.value)}
                className={[
                  "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                  active
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground",
                ].join(" ")}
              >
                <l.Icon className="size-3.5" />
                {l.label}
              </button>
            );
          })}
        </div>

        {/* KPI tiles — always visible, summarise every dataset */}
        {isLoading ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-[78px] w-full rounded-xl" />
            ))}
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <KpiTile
              label={`Attendance rate (${MONTHS[month - 1].slice(0, 3)})`}
              value={`${daily.attendanceRate}%`}
              sub={`${daily.presentTotal} present / ${daily.total} marks`}
              icon={BarChart3}
              tone="blue"
            />
            <KpiTile
              label={`Absenteeism (${MONTHS[month - 1].slice(0, 3)})`}
              value={`${daily.absenteeismRate}%`}
              sub={`${daily.statusCounts.absent} absent · ${daily.leaveTotal} on leave`}
              icon={CalendarOff}
              tone="red"
            />
            <KpiTile
              label={`Late days (Q${quarter} combined)`}
              value={String(correlated.staffRows.reduce((a, r) => a + r.quarterDays, 0))}
              sub={`${correlated.derivedOnly} staff from clock logs only`}
              icon={Clock}
              tone="orange"
            />
            <KpiTile
              label={`Work hours logged (${MONTHS[month - 1].slice(0, 3)})`}
              value={fmtHours(clock.totalHours)}
              sub={`avg ${fmtHours(clock.avgHours)}/day · ${clock.logCount} logs`}
              icon={Hourglass}
              tone="indigo"
            />
          </div>
        )}

        {/* ══ OVERVIEW LENS ══════════════════════════════════════════════════ */}
        {lens === "overview" && (
          <div className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <KpiTile
                label="Staff affected by lateness"
                value={String(lateness.staffAffected)}
                sub={`${lateness.recordCount} register records (Q${quarter})`}
                icon={Users}
                tone="amber"
              />
              <KpiTile
                label="Staff on approved leave"
                value={String(overlay.staffOnLeave)}
                sub={`${overlay.leaveDays} leave-days this month`}
                icon={Plane}
                tone="violet"
              />
              <KpiTile
                label={`TOSD records (${year})`}
                value={String(tosd.total)}
                sub={`${tosd.sickDays} sick · ${tosd.timeOffDays} time-off days`}
                icon={CalendarOff}
                tone="sky"
              />
              <KpiTile
                label="Public holidays"
                value={String(holidayCount)}
                sub={`${holidayThisMonth} in ${MONTHS[month - 1]}`}
                icon={CalendarOff}
                tone="blue"
              />
            </div>

            <div className="grid gap-6 lg:grid-cols-2">
              <ChartCard
                title="Roll-Call Status Distribution"
                hint={`10-status daily attendance grid — ${MONTHS[month - 1]} ${year}`}
                loading={isLoading}
              >
                {daily.statusDist.length === 0 ? (
                  <NoData />
                ) : (
                  <>
                    <ResponsiveContainer width="100%" height={240}>
                      <PieChart>
                        <Pie
                          data={daily.statusDist}
                          dataKey="value"
                          nameKey="name"
                          cx="50%"
                          cy="50%"
                          outerRadius={88}
                          paddingAngle={2}
                        >
                          {daily.statusDist.map((e) => (
                            <Cell key={e.name} fill={e.fill} />
                          ))}
                        </Pie>
                        <Tooltip contentStyle={chartTheme.tooltipContent} />
                      </PieChart>
                    </ResponsiveContainer>
                    <StatusLegend
                      className="mt-2 justify-center"
                      items={legendFromMap(ATTENDANCE_STATUS_TONE, STATUS_LABEL)}
                    />
                  </>
                )}
              </ChartCard>

              <ChartCard
                title="Data Coverage Correlation"
                hint="How the three attendance datasets overlap for this month"
                loading={isLoading}
              >
                {coverage.length === 0 ? (
                  <NoData />
                ) : (
                  <ResponsiveContainer width="100%" height={272}>
                    <BarChart
                      data={coverage}
                      margin={{ top: 8, right: 8, left: -16, bottom: 4 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                      <XAxis dataKey="name" tick={chartTheme.axisTickSmall} />
                      <YAxis allowDecimals={false} tick={chartTheme.axisTick} />
                      <Tooltip contentStyle={chartTheme.tooltipContent} />
                      <Bar dataKey="value" name="Records" radius={[4, 4, 0, 0]}>
                        {coverage.map((e) => (
                          <Cell key={e.name} fill={e.fill} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </ChartCard>

              <ChartCard
                title={`Presence vs Absence vs Leave — ${MONTHS[month - 1]}`}
                hint="Daily roll-call headcount, stacked"
                loading={isLoading}
                span
              >
                {daily.total === 0 ? (
                  <NoData height={280} />
                ) : (
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart
                      data={daily.dailyTrend}
                      margin={{ top: 8, right: 8, left: -16, bottom: 4 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                      <XAxis dataKey="day" tick={chartTheme.axisTickSmall} interval={1} />
                      <YAxis allowDecimals={false} tick={chartTheme.axisTick} />
                      <Tooltip contentStyle={chartTheme.tooltipContent} />
                      <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
                      <Bar dataKey="present" name="Present" stackId="a" fill={C.blue} />
                      <Bar dataKey="leave" name="On Leave" stackId="a" fill={C.rose} />
                      <Bar
                        dataKey="absent"
                        name="Absent"
                        stackId="a"
                        fill={C.red}
                        radius={[3, 3, 0, 0]}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </ChartCard>

              <ChartCard
                title="Department Attendance Comparison"
                hint="Roll-call attendance rate + absence count per department"
                loading={isLoading}
                span
              >
                {daily.byDept.length === 0 ? (
                  <NoData />
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b text-left text-xs text-muted-foreground">
                          <th className="py-2 pe-3 font-medium">Department</th>
                          <th className="py-2 pe-3 text-right font-medium">Marks</th>
                          <th className="py-2 pe-3 text-right font-medium">Present</th>
                          <th className="py-2 pe-3 text-right font-medium">Late</th>
                          <th className="py-2 pe-3 text-right font-medium">Leave</th>
                          <th className="py-2 pe-3 text-right font-medium">Absent</th>
                          <th className="py-2 text-right font-medium">Rate</th>
                        </tr>
                      </thead>
                      <tbody>
                        {deptPag.pageItems.map((d) => (
                          <tr key={d.name} className="border-b last:border-0">
                            <td className="py-2 pe-3 font-medium">{d.name}</td>
                            <td className="py-2 pe-3 text-right tabular-nums">{d.total}</td>
                            <td className="py-2 pe-3 text-right tabular-nums text-blue-600 dark:text-blue-400">
                              {d.present}
                            </td>
                            <td className="py-2 pe-3 text-right tabular-nums text-orange-600 dark:text-orange-400">
                              {d.late}
                            </td>
                            <td className="py-2 pe-3 text-right tabular-nums text-rose-600 dark:text-rose-400">
                              {d.leave}
                            </td>
                            <td className="py-2 pe-3 text-right tabular-nums text-red-600 dark:text-red-400">
                              {d.absent}
                            </td>
                            <td className="py-2 text-right font-semibold tabular-nums">
                              {d.rate}%
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <DataPagination
                      page={deptPag.page}
                      pageCount={deptPag.pageCount}
                      total={deptPag.total}
                      rangeLabel={deptPag.rangeLabel}
                      onPageChange={deptPag.setPage}
                    />
                  </div>
                )}
              </ChartCard>
            </div>
          </div>
        )}

        {/* ══ LATENESS LENS ══════════════════════════════════════════════════ */}
        {lens === "lateness" && (
          <div className="space-y-6">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
              <AlertTriangle className="size-4 text-amber-500" />
              LATENESS — {year} Q{quarter} · manual register correlated with clock logs
            </h2>

            <div className="grid gap-6 lg:grid-cols-2">
              <ChartCard
                title="Manual Register vs Clock-Log Derived"
                hint="Late days per month — keyed records vs lateness inferred from clock-in times"
                loading={quarterlyQuery.isLoading}
              >
                {correlated.byMonth.every((m) => m.manual === 0 && m.derived === 0) ? (
                  <NoData />
                ) : (
                  <ResponsiveContainer width="100%" height={260}>
                    <BarChart
                      data={correlated.byMonth}
                      margin={{ top: 8, right: 8, left: -16, bottom: 4 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                      <XAxis dataKey="name" tick={chartTheme.axisTick} />
                      <YAxis allowDecimals={false} tick={chartTheme.axisTick} />
                      <Tooltip contentStyle={chartTheme.tooltipContent} />
                      <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
                      <Bar dataKey="manual" name="Manual record" fill={C.indigo} radius={[4, 4, 0, 0]} />
                      <Bar dataKey="derived" name="Clock-log derived" fill={C.orange} radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </ChartCard>

              <ChartCard
                title="Lateness Trend (Register)"
                hint={`Late days + minutes late across Q${quarter}`}
                loading={isLoading}
              >
                {lateness.trend.every((t) => t.daysLate === 0) ? (
                  <NoData />
                ) : (
                  <ResponsiveContainer width="100%" height={260}>
                    <ComposedChart
                      data={lateness.trend}
                      margin={{ top: 8, right: 16, left: -16, bottom: 4 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                      <XAxis dataKey="name" tick={chartTheme.axisTick} />
                      <YAxis allowDecimals={false} tick={chartTheme.axisTick} />
                      <Tooltip contentStyle={chartTheme.tooltipContent} />
                      <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
                      <Bar dataKey="daysLate" name="Late Days" fill={C.amber} radius={[4, 4, 0, 0]} />
                      <Line
                        type="monotone"
                        dataKey="avgMinutes"
                        name="Minutes Late"
                        stroke={C.blue}
                        strokeWidth={2.5}
                        dot={{ r: 4 }}
                      />
                    </ComposedChart>
                  </ResponsiveContainer>
                )}
              </ChartCard>

              <ChartCard
                title="Late Days by Department"
                hint="Manual lateness register, this quarter"
                loading={isLoading}
              >
                {lateness.byDept.length === 0 ? (
                  <NoData />
                ) : (
                  <ResponsiveContainer width="100%" height={260}>
                    <BarChart
                      data={lateness.byDept}
                      margin={{ top: 4, right: 8, left: -16, bottom: 4 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                      <XAxis dataKey="name" tick={chartTheme.axisTickSmall} />
                      <YAxis allowDecimals={false} tick={chartTheme.axisTick} />
                      <Tooltip contentStyle={chartTheme.tooltipContent} />
                      <Bar dataKey="daysLate" name="Late Days" radius={[4, 4, 0, 0]}>
                        {lateness.byDept.map((e) => (
                          <Cell key={e.name} fill={C.indigo} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </ChartCard>

              <ChartCard
                title="Late Arrivals per Day (Roll-Call)"
                hint={`Staff marked "Late" in the daily roll-call — ${MONTHS[month - 1]}`}
                loading={isLoading}
              >
                {daily.total === 0 ? (
                  <NoData />
                ) : (
                  <ResponsiveContainer width="100%" height={260}>
                    <LineChart
                      data={daily.dailyTrend}
                      margin={{ top: 8, right: 16, left: -16, bottom: 4 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                      <XAxis dataKey="day" tick={chartTheme.axisTickSmall} interval={1} />
                      <YAxis allowDecimals={false} tick={chartTheme.axisTick} />
                      <Tooltip contentStyle={chartTheme.tooltipContent} />
                      <Line
                        type="monotone"
                        dataKey="late"
                        name="Late Arrivals"
                        stroke={C.orange}
                        strokeWidth={2.5}
                        dot={{ r: 3 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </ChartCard>
            </div>

            {/* Quarter offenders table — combined total + manual / derived split */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">
                  Quarter Lateness — Combined Totals (Q{quarter})
                </CardTitle>
                <p className="text-xs text-muted-foreground">
                  Per-staff quarter total from the lateness router — manual records
                  where keyed, clock-log-derived elsewhere. {correlated.derivedOnly}{" "}
                  staff have lateness ONLY from clock logs (no manual record).
                </p>
              </CardHeader>
              <CardContent>
                {quarterlyQuery.isLoading ? (
                  <Skeleton className="h-[300px] w-full rounded-xl" />
                ) : correlated.staffRows.length === 0 ? (
                  <NoData />
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b text-left text-xs text-muted-foreground">
                          <th className="py-2 pe-3 font-medium">Staff</th>
                          <th className="py-2 pe-3 text-right font-medium">Quarter Days</th>
                          <th className="py-2 pe-3 text-right font-medium">Time Late</th>
                          <th className="py-2 pe-3 text-right font-medium">Manual</th>
                          <th className="py-2 text-right font-medium">Clock-Log Filled</th>
                        </tr>
                      </thead>
                      <tbody>
                        {offenderPag.pageItems.map((r) => (
                          <tr key={r.staffId} className="border-b last:border-0">
                            <td className="py-2 pe-3 font-medium">{r.name}</td>
                            <td className="py-2 pe-3 text-right font-semibold tabular-nums text-orange-600 dark:text-orange-400">
                              {r.quarterDays}
                            </td>
                            <td className="py-2 pe-3 text-right tabular-nums text-muted-foreground">
                              {r.quarterTime}
                            </td>
                            <td className="py-2 pe-3 text-right tabular-nums text-indigo-600 dark:text-indigo-400">
                              {r.manualDays}
                            </td>
                            <td className="py-2 text-right tabular-nums text-amber-600 dark:text-amber-400">
                              {r.derivedFillDays}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <DataPagination
                      page={offenderPag.page}
                      pageCount={offenderPag.pageCount}
                      total={offenderPag.total}
                      rangeLabel={offenderPag.rangeLabel}
                      onPageChange={offenderPag.setPage}
                    />
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        {/* ══ TIME & LEAVE LENS ══════════════════════════════════════════════ */}
        {lens === "time-leave" && (
          <div className="space-y-6">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
              <Hourglass className="size-4 text-indigo-500" />
              WORK HOURS · TIME-OFF / SICK DAYS · APPROVED LEAVE
            </h2>

            <div className="grid gap-6 lg:grid-cols-2">
              <ChartCard
                title={`Work Hours per Day — ${MONTHS[month - 1]}`}
                hint="Total clock-log work hours across all staff, by day"
                loading={logsQuery.isLoading}
                span
              >
                {clock.hoursTrend.every((d) => d.hours === 0) ? (
                  <NoData />
                ) : (
                  <ResponsiveContainer width="100%" height={260}>
                    <AreaChart
                      data={clock.hoursTrend}
                      margin={{ top: 8, right: 16, left: -16, bottom: 4 }}
                    >
                      <defs>
                        <linearGradient id="hoursFill" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor={C.indigo} stopOpacity={0.4} />
                          <stop offset="95%" stopColor={C.indigo} stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                      <XAxis dataKey="day" tick={chartTheme.axisTickSmall} interval={1} />
                      <YAxis tick={chartTheme.axisTick} />
                      <Tooltip contentStyle={chartTheme.tooltipContent} />
                      <Area
                        type="monotone"
                        dataKey="hours"
                        name="Work Hours"
                        stroke={C.indigo}
                        strokeWidth={2.5}
                        fill="url(#hoursFill)"
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                )}
              </ChartCard>

              <ChartCard
                title="Work Hours by Department"
                hint="Total clock-log hours this month"
                loading={logsQuery.isLoading}
              >
                {clock.hoursByDept.length === 0 ? (
                  <NoData />
                ) : (
                  <ResponsiveContainer width="100%" height={260}>
                    <BarChart
                      data={clock.hoursByDept}
                      layout="vertical"
                      margin={{ top: 4, right: 24, left: 8, bottom: 4 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" horizontal={false} className="stroke-border" />
                      <XAxis type="number" tick={chartTheme.axisTick} />
                      <YAxis
                        type="category"
                        dataKey="name"
                        width={120}
                        tick={chartTheme.axisTickSmall}
                      />
                      <Tooltip
                        contentStyle={chartTheme.tooltipContent}
                        formatter={(v) => [`${v} h`, "Work Hours"]}
                      />
                      <Bar dataKey="hours" name="Work Hours" radius={[0, 4, 4, 0]}>
                        {clock.hoursByDept.map((e) => (
                          <Cell key={e.name} fill={C.indigo} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </ChartCard>

              <ChartCard
                title="Time-Off / Sick-Days by Type"
                hint={`TOSD register — ${year}`}
                loading={tosdQuery.isLoading}
              >
                {tosd.byType.length === 0 ? (
                  <NoData />
                ) : (
                  <ResponsiveContainer width="100%" height={260}>
                    <PieChart>
                      <Pie
                        data={tosd.byType}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        innerRadius={48}
                        outerRadius={88}
                        paddingAngle={2}
                      >
                        {tosd.byType.map((e) => (
                          <Cell key={e.name} fill={e.fill} />
                        ))}
                      </Pie>
                      <Tooltip contentStyle={chartTheme.tooltipContent} />
                      <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </ChartCard>

              <ChartCard
                title="TOSD Records by Month"
                hint={`Time-off / sick-day entries logged across ${year}`}
                loading={tosdQuery.isLoading}
              >
                {tosd.trend.every((t) => t.count === 0) ? (
                  <NoData />
                ) : (
                  <ResponsiveContainer width="100%" height={260}>
                    <BarChart
                      data={tosd.trend}
                      margin={{ top: 8, right: 8, left: -16, bottom: 4 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                      <XAxis dataKey="name" tick={chartTheme.axisTickSmall} />
                      <YAxis allowDecimals={false} tick={chartTheme.axisTick} />
                      <Tooltip contentStyle={chartTheme.tooltipContent} />
                      <Bar dataKey="count" name="Records" radius={[4, 4, 0, 0]}>
                        {tosd.trend.map((e) => (
                          <Cell key={e.name} fill={C.sky} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </ChartCard>

              <ChartCard
                title="Approved Leave Overlay by Type"
                hint={`Approved leave projected onto ${MONTHS[month - 1]} — leave-days per type`}
                loading={overlayQuery.isLoading}
              >
                {overlay.byType.length === 0 ? (
                  <NoData />
                ) : (
                  <ResponsiveContainer width="100%" height={260}>
                    <BarChart
                      data={overlay.byType}
                      margin={{ top: 8, right: 8, left: -16, bottom: 4 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                      <XAxis dataKey="name" tick={chartTheme.axisTickSmall} />
                      <YAxis allowDecimals={false} tick={chartTheme.axisTick} />
                      <Tooltip contentStyle={chartTheme.tooltipContent} />
                      <Bar dataKey="value" name="Leave Days" radius={[4, 4, 0, 0]}>
                        {overlay.byType.map((e) => (
                          <Cell key={e.name} fill={C.rose} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </ChartCard>

              <ChartCard
                title="Top Logged Work Hours (Staff)"
                hint="Clock-log work hours this month, top 10"
                loading={logsQuery.isLoading}
              >
                {clock.topHours.length === 0 ? (
                  <NoData />
                ) : (
                  <ResponsiveContainer width="100%" height={260}>
                    <BarChart
                      data={clock.topHours}
                      layout="vertical"
                      margin={{ top: 4, right: 24, left: 8, bottom: 4 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" horizontal={false} className="stroke-border" />
                      <XAxis type="number" tick={chartTheme.axisTick} />
                      <YAxis
                        type="category"
                        dataKey="name"
                        width={130}
                        tick={chartTheme.axisTickSmall}
                      />
                      <Tooltip
                        contentStyle={chartTheme.tooltipContent}
                        formatter={(v, n) => [n === "hours" ? `${v} h` : `${v} h/day`, n === "hours" ? "Total" : "Avg/day"]}
                      />
                      <Bar dataKey="hours" name="hours" radius={[0, 4, 4, 0]}>
                        {clock.topHours.map((e) => (
                          <Cell key={e.name} fill={C.blue} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </ChartCard>
            </div>

            {/* TOSD top staff table */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">
                  Time-Off / Sick-Days — Staff Breakdown ({year})
                </CardTitle>
                <p className="text-xs text-muted-foreground">
                  Staff with the most time-off / sick days recorded in the TOSD
                  register.
                </p>
              </CardHeader>
              <CardContent>
                {tosdQuery.isLoading ? (
                  <Skeleton className="h-[260px] w-full rounded-xl" />
                ) : tosd.topStaff.length === 0 ? (
                  <NoData />
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b text-left text-xs text-muted-foreground">
                          <th className="py-2 pe-3 font-medium">Staff</th>
                          <th className="py-2 pe-3 text-right font-medium">Records</th>
                          <th className="py-2 text-right font-medium">Total Days</th>
                        </tr>
                      </thead>
                      <tbody>
                        {tosdPag.pageItems.map((s) => (
                          <tr key={s.name} className="border-b last:border-0">
                            <td className="py-2 pe-3 font-medium">{s.name}</td>
                            <td className="py-2 pe-3 text-right tabular-nums">{s.count}</td>
                            <td className="py-2 text-right font-semibold tabular-nums text-rose-600 dark:text-rose-400">
                              {s.days % 1 === 0 ? s.days : s.days.toFixed(1)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <DataPagination
                      page={tosdPag.page}
                      pageCount={tosdPag.pageCount}
                      total={tosdPag.total}
                      rangeLabel={tosdPag.rangeLabel}
                      onPageChange={tosdPag.setPage}
                    />
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}
      </Main>
    </>
  );
}
