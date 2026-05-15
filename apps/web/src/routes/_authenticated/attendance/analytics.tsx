// /attendance/analytics — Attendance & Lateness Analytics
//
// Interactive recharts visualising the lateness register (lateness.list /
// lateness.stats) and the 10-status daily attendance grid
// (attendanceDaily.listRange). KPI tiles + month / quarter filters.

import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { getDaysInMonth } from "date-fns";
import {
  AlertTriangle,
  BarChart3,
  Clock,
  TrendingUp,
  Users,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
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
import { Header } from "@/components/layout/header";
import { Main } from "@/components/layout/main";
import { ThemeSwitch } from "@/components/theme-switch";
import { orpc } from "@/utils/orpc";
import { chartTheme } from "@/lib/chart-theme";

export const Route = createFileRoute("/_authenticated/attendance/analytics")({
  component: AttendanceAnalyticsPage,
});

// ─── Palette (blue/indigo — no green; bad = red/amber) ────────────────────────

const C = {
  blue: "#3b82f6",
  blueDark: "#2563eb",
  indigo: "#6366f1",
  amber: "#f59e0b",
  red: "#ef4444",
  violet: "#8b5cf6",
  pink: "#ec4899",
  slate: "#64748b",
  sky: "#0ea5e9",
  teal: "#14b8a6",
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
  late: C.amber,
  half_day: C.indigo,
  annual_leave: C.violet,
  sick: C.red,
  compassionate: "#a855f7",
  maternity_paternity: C.pink,
  absent: "#b91c1c",
  holiday: C.teal,
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

function fmtMinutes(mins: number): string {
  const m = Math.round(mins);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

// ─── KPI tile ─────────────────────────────────────────────────────────────────

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
  tone: "blue" | "amber" | "red" | "indigo";
}) {
  const tones = {
    blue: "bg-blue-500/10 text-blue-700 dark:text-blue-300",
    amber: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
    red: "bg-red-500/10 text-red-700 dark:text-red-300",
    indigo: "bg-indigo-500/10 text-indigo-700 dark:text-indigo-300",
  };
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-4">
        <div className={`grid size-10 place-items-center rounded-xl ${tones[tone]}`}>
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

// ─── Main page ────────────────────────────────────────────────────────────────

function AttendanceAnalyticsPage() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1); // 1-12

  const daysInMonth = getDaysInMonth(new Date(year, month - 1));
  const from = `${year}-${String(month).padStart(2, "0")}-01`;
  const to = `${year}-${String(month).padStart(2, "0")}-${String(daysInMonth).padStart(2, "0")}`;
  const quarter = Math.ceil(month / 3);

  // ── Data ──────────────────────────────────────────────────────────────────
  const latenessQuery = useQuery(
    orpc.lateness.list.queryOptions({ input: { year } }),
  );
  const dailyQuery = useQuery(
    orpc.attendanceDaily.listRange.queryOptions({ input: { from, to } }),
  );
  const departmentsQuery = useQuery(orpc.staff.getDepartments.queryOptions());

  const isLoading = latenessQuery.isLoading || dailyQuery.isLoading;

  // departmentId → department name lookup
  const deptNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const d of departmentsQuery.data ?? []) map.set(d.id, d.name);
    return map;
  }, [departmentsQuery.data]);

  // ── Lateness aggregation (for the selected quarter) ───────────────────────
  const lateness = useMemo(() => {
    const all = latenessQuery.data ?? [];
    const quarterMonths = QUARTER_MONTHS[quarter] ?? [];
    const rows = all.filter((r) => quarterMonths.includes(r.month));

    let totalDaysLate = 0;
    let totalMinutes = 0;
    const staffAgg = new Map<
      string,
      { name: string; daysLate: number; minutes: number }
    >();
    const deptAgg = new Map<string, { name: string; daysLate: number }>();
    const monthAgg = new Map<string, { daysLate: number; minutes: number }>();

    for (const r of rows) {
      const mins = parseTimeLateMinutes(r.totalTimeLate);
      totalDaysLate += r.daysLate;
      totalMinutes += mins;

      const name = r.staffProfile?.user?.name ?? r.staffProfile?.employeeId ?? "Unknown";
      const s = staffAgg.get(r.staffId) ?? { name, daysLate: 0, minutes: 0 };
      s.daysLate += r.daysLate;
      s.minutes += mins;
      staffAgg.set(r.staffId, s);

      const deptId = r.staffProfile?.departmentId ?? null;
      const dept = (deptId && deptNameById.get(deptId)) || "Unassigned";
      const d = deptAgg.get(dept) ?? { name: dept, daysLate: 0 };
      d.daysLate += r.daysLate;
      deptAgg.set(dept, d);

      const mm = monthAgg.get(r.month) ?? { daysLate: 0, minutes: 0 };
      mm.daysLate += r.daysLate;
      mm.minutes += mins;
      monthAgg.set(r.month, mm);
    }

    const topOffenders = [...staffAgg.values()]
      .sort((a, b) => b.daysLate - a.daysLate)
      .slice(0, 10)
      .map((s) => ({ name: s.name, daysLate: s.daysLate }));

    const byDept = [...deptAgg.values()]
      .sort((a, b) => b.daysLate - a.daysLate)
      .map((d) => ({ name: d.name, daysLate: d.daysLate }));

    const trend = quarterMonths.map((m) => ({
      name: m.slice(0, 3),
      daysLate: monthAgg.get(m)?.daysLate ?? 0,
      avgMinutes: Math.round(monthAgg.get(m)?.minutes ?? 0),
    }));

    const staffAffected = [...staffAgg.values()].filter(
      (s) => s.daysLate > 0,
    ).length;
    const avgMinutes = totalDaysLate > 0 ? totalMinutes / totalDaysLate : 0;

    return {
      recordCount: rows.length,
      totalDaysLate,
      totalMinutes,
      avgMinutes,
      staffAffected,
      topOffenders,
      byDept,
      trend,
    };
  }, [latenessQuery.data, quarter, deptNameById]);

  // ── Daily attendance aggregation (for the selected month) ─────────────────
  const attendance = useMemo(() => {
    const rows = dailyQuery.data ?? [];

    const statusCounts: Record<DailyStatus, number> = {
      on_site: 0,
      wfh: 0,
      late: 0,
      half_day: 0,
      annual_leave: 0,
      sick: 0,
      compassionate: 0,
      maternity_paternity: 0,
      absent: 0,
      holiday: 0,
    };
    // day → { present, absent }
    const perDay = new Map<number, { present: number; absent: number; late: number }>();

    for (const r of rows) {
      const st = r.status as DailyStatus;
      if (st in statusCounts) statusCounts[st] += 1;
      const day = Number(r.date.slice(8, 10));
      const d = perDay.get(day) ?? { present: 0, absent: 0, late: 0 };
      if (PRESENT_STATUSES.has(st)) d.present += 1;
      if (st === "absent") d.absent += 1;
      if (st === "late") d.late += 1;
      perDay.set(day, d);
    }

    const total = rows.length;
    const presentTotal =
      statusCounts.on_site +
      statusCounts.wfh +
      statusCounts.late +
      statusCounts.half_day;
    const attendanceRate =
      total > 0 ? Math.round((presentTotal / total) * 100) : 0;

    const statusDist = STATUS_ORDER.filter((s) => statusCounts[s] > 0).map(
      (s) => ({
        name: STATUS_LABEL[s],
        value: statusCounts[s],
        fill: STATUS_COLOR[s],
      }),
    );

    const dailyTrend = Array.from({ length: daysInMonth }, (_, i) => {
      const day = i + 1;
      const d = perDay.get(day) ?? { present: 0, absent: 0, late: 0 };
      return { day: String(day), present: d.present, absent: d.absent, late: d.late };
    });

    return {
      total,
      presentTotal,
      attendanceRate,
      statusCounts,
      statusDist,
      dailyTrend,
    };
  }, [dailyQuery.data, daysInMonth]);

  const yearOptions = [now.getFullYear() - 2, now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1];

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
              Lateness trends and daily attendance insights. Lateness charts use
              the {year} Q{quarter} register; attendance charts use {MONTHS[month - 1]} {year}.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Select value={String(year)} onValueChange={(v) => v && setYear(Number(v))}>
              <SelectTrigger className="h-8 w-24 text-xs">
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
              <SelectTrigger className="h-8 w-36 text-xs">
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

        {/* KPI tiles */}
        {isLoading ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-[78px] w-full rounded-xl" />
            ))}
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <KpiTile
              label={`Late days (Q${quarter})`}
              value={String(lateness.totalDaysLate)}
              sub={`${lateness.recordCount} lateness records`}
              icon={Clock}
              tone="amber"
            />
            <KpiTile
              label="Staff affected by lateness"
              value={String(lateness.staffAffected)}
              icon={Users}
              tone="indigo"
            />
            <KpiTile
              label="Avg time late per occurrence"
              value={fmtMinutes(lateness.avgMinutes)}
              sub={`${fmtMinutes(lateness.totalMinutes)} total`}
              icon={TrendingUp}
              tone="red"
            />
            <KpiTile
              label={`Attendance rate (${MONTHS[month - 1].slice(0, 3)})`}
              value={`${attendance.attendanceRate}%`}
              sub={`${attendance.presentTotal} / ${attendance.total} marked`}
              icon={BarChart3}
              tone="blue"
            />
          </div>
        )}

        {/* ── Lateness section ─────────────────────────────────────────────── */}
        <div>
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-muted-foreground">
            <AlertTriangle className="size-4 text-amber-500" />
            LATENESS — {year} Q{quarter}
          </h2>
          <div className="grid gap-6 lg:grid-cols-2">
            {/* Lateness trend over the quarter */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Lateness Trend (by Month)</CardTitle>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <Skeleton className="h-[260px] w-full rounded-xl" />
                ) : lateness.trend.every((t) => t.daysLate === 0) ? (
                  <NoData />
                ) : (
                  <ResponsiveContainer width="100%" height={260}>
                    <LineChart
                      data={lateness.trend}
                      margin={{ top: 8, right: 16, left: -16, bottom: 4 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                      <XAxis dataKey="name" tick={chartTheme.axisTick} />
                      <YAxis allowDecimals={false} tick={chartTheme.axisTick} />
                      <Tooltip contentStyle={chartTheme.tooltipContent} />
                      <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
                      <Line
                        type="monotone"
                        dataKey="daysLate"
                        name="Late Days"
                        stroke={C.amber}
                        strokeWidth={2.5}
                        dot={{ r: 4 }}
                      />
                      <Line
                        type="monotone"
                        dataKey="avgMinutes"
                        name="Minutes Late"
                        stroke={C.blue}
                        strokeWidth={2.5}
                        dot={{ r: 4 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            {/* Lateness by department */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Late Days by Department</CardTitle>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <Skeleton className="h-[260px] w-full rounded-xl" />
                ) : lateness.byDept.length === 0 ? (
                  <NoData />
                ) : (
                  <ResponsiveContainer width="100%" height={260}>
                    <BarChart
                      data={lateness.byDept}
                      margin={{ top: 4, right: 8, left: -16, bottom: 4 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                      <XAxis dataKey="name" tick={chartTheme.axisTick} />
                      <YAxis allowDecimals={false} tick={chartTheme.axisTick} />
                      <Tooltip contentStyle={chartTheme.tooltipContent} />
                      <Bar dataKey="daysLate" name="Late Days" radius={[4, 4, 0, 0]}>
                        {lateness.byDept.map((entry) => (
                          <Cell key={entry.name} fill={C.indigo} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            {/* Top offenders — full width */}
            <Card className="lg:col-span-2">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Top Late Offenders (Top 10)</CardTitle>
                <p className="text-xs text-muted-foreground">
                  Staff with the most recorded late days this quarter.
                </p>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <Skeleton className="h-[300px] w-full rounded-xl" />
                ) : lateness.topOffenders.length === 0 ? (
                  <NoData height={300} />
                ) : (
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart
                      data={lateness.topOffenders}
                      layout="vertical"
                      margin={{ top: 4, right: 24, left: 8, bottom: 4 }}
                    >
                      <CartesianGrid
                        strokeDasharray="3 3"
                        horizontal={false}
                        className="stroke-border"
                      />
                      <XAxis type="number" allowDecimals={false} tick={chartTheme.axisTick} />
                      <YAxis
                        type="category"
                        dataKey="name"
                        width={150}
                        tick={chartTheme.axisTick}
                      />
                      <Tooltip
                        contentStyle={chartTheme.tooltipContent}
                        formatter={(v) => [`${v} days`, "Late Days"]}
                      />
                      <Bar dataKey="daysLate" name="Late Days" radius={[0, 4, 4, 0]}>
                        {lateness.topOffenders.map((entry, i) => (
                          <Cell
                            key={entry.name}
                            fill={i < 3 ? C.red : C.amber}
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>
          </div>
        </div>

        {/* ── Attendance section ───────────────────────────────────────────── */}
        <div>
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-muted-foreground">
            <BarChart3 className="size-4 text-blue-500" />
            DAILY ATTENDANCE — {MONTHS[month - 1]} {year}
          </h2>
          <div className="grid gap-6 lg:grid-cols-2">
            {/* Status distribution pie */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Attendance Status Distribution</CardTitle>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <Skeleton className="h-[260px] w-full rounded-xl" />
                ) : attendance.statusDist.length === 0 ? (
                  <NoData />
                ) : (
                  <ResponsiveContainer width="100%" height={260}>
                    <PieChart>
                      <Pie
                        data={attendance.statusDist}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        outerRadius={90}
                        paddingAngle={2}
                      >
                        {attendance.statusDist.map((entry) => (
                          <Cell key={entry.name} fill={entry.fill} />
                        ))}
                      </Pie>
                      <Tooltip contentStyle={chartTheme.tooltipContent} />
                      <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            {/* On-time vs late split */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">On-Time vs Late (Present Staff)</CardTitle>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <Skeleton className="h-[260px] w-full rounded-xl" />
                ) : attendance.presentTotal === 0 ? (
                  <NoData />
                ) : (
                  <ResponsiveContainer width="100%" height={260}>
                    <PieChart>
                      <Pie
                        data={[
                          {
                            name: "On Time",
                            value:
                              attendance.statusCounts.on_site +
                              attendance.statusCounts.wfh +
                              attendance.statusCounts.half_day,
                            fill: C.blue,
                          },
                          {
                            name: "Late",
                            value: attendance.statusCounts.late,
                            fill: C.amber,
                          },
                        ]}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        innerRadius={50}
                        outerRadius={90}
                        paddingAngle={3}
                      >
                        <Cell fill={C.blue} />
                        <Cell fill={C.amber} />
                      </Pie>
                      <Tooltip contentStyle={chartTheme.tooltipContent} />
                      <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            {/* Present vs absent over the month — full width */}
            <Card className="lg:col-span-2">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">
                  Present vs Absent over {MONTHS[month - 1]}
                </CardTitle>
                <p className="text-xs text-muted-foreground">
                  Daily headcount of present (incl. late) vs absent staff.
                </p>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <Skeleton className="h-[280px] w-full rounded-xl" />
                ) : attendance.total === 0 ? (
                  <NoData height={280} />
                ) : (
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart
                      data={attendance.dailyTrend}
                      margin={{ top: 8, right: 8, left: -16, bottom: 4 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                      <XAxis dataKey="day" tick={chartTheme.axisTickSmall} interval={1} />
                      <YAxis allowDecimals={false} tick={chartTheme.axisTick} />
                      <Tooltip contentStyle={chartTheme.tooltipContent} />
                      <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
                      <Bar
                        dataKey="present"
                        name="Present"
                        stackId="a"
                        fill={C.blue}
                        radius={[0, 0, 0, 0]}
                      />
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
              </CardContent>
            </Card>

            {/* Late arrivals per day — full width line */}
            <Card className="lg:col-span-2">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Late Arrivals per Day</CardTitle>
                <p className="text-xs text-muted-foreground">
                  Daily count of staff marked "Late" in the roll-call.
                </p>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <Skeleton className="h-[240px] w-full rounded-xl" />
                ) : attendance.total === 0 ? (
                  <NoData height={240} />
                ) : (
                  <ResponsiveContainer width="100%" height={240}>
                    <LineChart
                      data={attendance.dailyTrend}
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
                        stroke={C.amber}
                        strokeWidth={2.5}
                        dot={{ r: 3 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </Main>
    </>
  );
}
