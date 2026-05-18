/* @media print: hide header controls, show only chart content */

import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  BarChart3,
  Download,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@ndma-dcs-staff-portal/ui/components/card";
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "@ndma-dcs-staff-portal/ui/components/tabs";
import { Skeleton } from "@ndma-dcs-staff-portal/ui/components/skeleton";
import { Badge } from "@ndma-dcs-staff-portal/ui/components/badge";
import { Header } from "@/components/layout/header";
import { Main } from "@/components/layout/main";
import { ThemeSwitch } from "@/components/theme-switch";
import { orpc } from "@/utils/orpc";
import { chartTheme } from "@/lib/chart-theme";

export const Route = createFileRoute("/_authenticated/analytics/")({
  component: AnalyticsPage,
});

// ── Constants ──────────────────────────────────────────────────────────────

const CURRENT_YEAR = 2026;

// ── Color palette ──────────────────────────────────────────────────────────

const C = {
  blue: "#3b82f6",
  green: "#3b82f6",   // intentionally blue — no green in this app
  amber: "#f59e0b",
  red: "#ef4444",
  purple: "#8b5cf6",
  indigo: "#6366f1",
  teal: "#d946ef",   // intentionally fuchsia — no green/teal in this app
  orange: "#f97316",
  rose: "#f43f5e",
  slate: "#64748b",
  cyan: "#06b6d4",
  sky: "#0ea5e9",
  pink: "#ec4899",
  violet: "#7c3aed",
  fuchsia: "#d946ef",
} as const;

// ── Helpers ────────────────────────────────────────────────────────────────

/** Convert snake_case to Title Case */
function labelCase(s: string): string {
  return s
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/** Skeleton card for chart loading state */
function ChartCardSkeleton() {
  return (
    <Card>
      <CardHeader className="pb-3">
        <Skeleton className="h-5 w-40" />
      </CardHeader>
      <CardContent>
        <Skeleton className="w-full h-[260px] rounded-xl" />
      </CardContent>
    </Card>
  );
}

/** No data placeholder */
function NoData({ height = 260 }: { height?: number }) {
  return (
    <div
      className="flex items-center justify-center text-sm text-muted-foreground"
      style={{ height }}
    >
      No data available
    </div>
  );
}

/** Small stat card used in leave tab */
function StatCard({
  label,
  value,
  colorClass,
}: {
  label: string;
  value: number;
  colorClass: string;
}) {
  return (
    <div
      className={`flex flex-col items-center justify-center rounded-xl px-5 py-4 ${colorClass}`}
    >
      <span className="text-3xl font-bold tabular-nums">{value}</span>
      <span className="mt-1 text-xs font-medium opacity-80">{label}</span>
    </div>
  );
}

// ── Color maps ─────────────────────────────────────────────────────────────

const WORK_STATUS_COLORS: Record<string, string> = {
  todo: C.slate,
  in_progress: C.blue,
  review: C.amber,
  done: C.green,
  backlog: C.indigo,
  blocked: C.red,
  cancelled: "#94a3b8",
};

const SEVERITY_COLORS: Record<string, string> = {
  critical: C.red,
  high: C.orange,
  medium: C.amber,
  low: C.green,
  sev1: C.red,
  sev2: C.orange,
  sev3: C.amber,
  sev4: C.blue,
};

const INCIDENT_STATUS_COLORS: Record<string, string> = {
  open: C.red,
  investigating: C.amber,
  resolved: C.green,
  closed: C.slate,
};

const PROCUREMENT_STATUS_COLORS: Record<string, string> = {
  draft: "#94a3b8",
  submitted: C.blue,
  under_review: C.amber,
  approved: C.green,
  ordered: C.indigo,
  received: C.teal,
  rejected: C.red,
  cancelled: "#cbd5e1",
};

const PROCUREMENT_PRIORITY_COLORS: Record<string, string> = {
  low: C.green,
  medium: C.amber,
  high: C.red,
  critical: C.rose,
};

const WORK_PRIORITY_COLORS: Record<string, string> = {
  low: C.green,
  medium: C.amber,
  high: C.red,
  critical: C.rose,
  urgent: C.violet,
};

const WORK_TYPE_COLORS: string[] = [
  C.blue,
  C.indigo,
  C.purple,
  C.teal,
  C.cyan,
  C.sky,
  C.violet,
  C.amber,
  C.orange,
];

const LEAVE_TYPE_COLORS: string[] = [
  C.blue,
  C.green,
  C.purple,
  C.amber,
  C.teal,
  C.indigo,
  C.pink,
  C.cyan,
];

const LEAVE_STATUS_COLORS: Record<string, string> = {
  approved: C.green,
  pending: C.amber,
  rejected: C.red,
  cancelled: "#94a3b8",
};

const TRAINING_STATUS_COLORS: Record<string, string> = {
  current: C.green,
  expired: C.red,
  expiring_soon: C.amber,
  scheduled: C.blue,
  completed: C.teal,
};

const APPRAISAL_STATUS_COLORS: Record<string, string> = {
  pending: C.amber,
  in_progress: C.blue,
  completed: C.green,
  overdue: C.red,
};

// ── Roster colors ──────────────────────────────────────────────────────────

const ROTA_ROLE_CONFIG = [
  { key: "leadCount", label: "Lead Engineer", color: C.indigo },
  { key: "asnCount", label: "ASN Support", color: C.blue },
  { key: "coreCount", label: "Core Support", color: C.green },
  { key: "enterpriseCount", label: "Enterprise Support", color: C.purple },
] as const;

// ── Work tab ───────────────────────────────────────────────────────────────

function WorkTab({
  data,
}: {
  data: {
    byStatus: { status: string; count: number }[];
    byType: { type: string; count: number }[];
    byPriority: { priority: string; count: number }[];
    byAssignee: { name: string; count: number }[];
  };
}) {
  const statusData = data.byStatus.map((d) => ({
    name: labelCase(d.status),
    count: d.count,
    fill: WORK_STATUS_COLORS[d.status] ?? C.blue,
  }));

  const assigneeData = [...data.byAssignee]
    .sort((a, b) => b.count - a.count)
    .slice(0, 15)
    .map((d) => ({ name: d.name, count: d.count }));

  const typeData = data.byType.map((d, i) => ({
    name: labelCase(d.type),
    count: d.count,
    fill: WORK_TYPE_COLORS[i % WORK_TYPE_COLORS.length],
  }));

  const priorityData = data.byPriority.map((d) => ({
    name: labelCase(d.priority),
    count: d.count,
    fill: WORK_PRIORITY_COLORS[d.priority] ?? C.blue,
  }));

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {/* Status bar chart */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Work Items by Status</CardTitle>
        </CardHeader>
        <CardContent>
          {statusData.length === 0 ? (
            <NoData />
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart
                data={statusData}
                margin={{ top: 4, right: 8, left: -16, bottom: 4 }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  className="stroke-border"
                />
                <XAxis
                  dataKey="name"
                  tick={chartTheme.axisTick}
                />
                <YAxis
                  allowDecimals={false}
                  tick={chartTheme.axisTick}
                />
                <Tooltip contentStyle={chartTheme.tooltipContent} />
                <Bar dataKey="count" name="Items" radius={[4, 4, 0, 0]}>
                  {statusData.map((entry) => (
                    <Cell key={entry.name} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* Top assignees horizontal bar chart */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Top Assignees by Open Items</CardTitle>
        </CardHeader>
        <CardContent>
          {assigneeData.length === 0 ? (
            <NoData />
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart
                data={assigneeData}
                layout="vertical"
                margin={{ top: 4, right: 16, left: 0, bottom: 4 }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  horizontal={false}
                  className="stroke-border"
                />
                <XAxis
                  type="number"
                  allowDecimals={false}
                  tick={chartTheme.axisTick}
                />
                <YAxis
                  type="category"
                  dataKey="name"
                  width={120}
                  tick={chartTheme.axisTick}
                />
                <Tooltip contentStyle={chartTheme.tooltipContent} />
                <Bar
                  dataKey="count"
                  name="Items"
                  fill={C.blue}
                  radius={[0, 4, 4, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* Work type pie chart */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Work Items by Type</CardTitle>
        </CardHeader>
        <CardContent>
          {typeData.length === 0 ? (
            <NoData />
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie
                  data={typeData}
                  dataKey="count"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius={90}
                  paddingAngle={2}
                >
                  {typeData.map((entry, i) => (
                    <Cell key={`${entry.name}-${i}`} fill={entry.fill} />
                  ))}
                </Pie>
                <Tooltip contentStyle={chartTheme.tooltipContent} />
                <Legend
                  iconType="circle"
                  iconSize={8}
                  wrapperStyle={{ fontSize: 11 }}
                />
              </PieChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* Priority bar chart */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Work Items by Priority</CardTitle>
        </CardHeader>
        <CardContent>
          {priorityData.length === 0 ? (
            <NoData />
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart
                data={priorityData}
                margin={{ top: 4, right: 8, left: -16, bottom: 4 }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  className="stroke-border"
                />
                <XAxis
                  dataKey="name"
                  tick={chartTheme.axisTick}
                />
                <YAxis
                  allowDecimals={false}
                  tick={chartTheme.axisTick}
                />
                <Tooltip contentStyle={chartTheme.tooltipContent} />
                <Bar dataKey="count" name="Items" radius={[4, 4, 0, 0]}>
                  {priorityData.map((entry) => (
                    <Cell key={entry.name} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ── Incidents tab ──────────────────────────────────────────────────────────

function IncidentsTab({
  data,
}: {
  data: {
    bySeverity: { severity: string; count: number }[];
    byStatus: { status: string; count: number }[];
    byMonth: { month: string; monthNum: number; count: number }[];
  };
}) {
  const severityData = data.bySeverity.map((d) => ({
    name: labelCase(d.severity),
    count: d.count,
    fill: SEVERITY_COLORS[d.severity] ?? C.blue,
  }));

  const monthData = [...data.byMonth]
    .sort((a, b) => a.monthNum - b.monthNum)
    .map((d) => ({ name: d.month, count: d.count }));

  const statusData = data.byStatus.map((d) => ({
    name: labelCase(d.status),
    count: d.count,
    fill: INCIDENT_STATUS_COLORS[d.status] ?? C.blue,
  }));

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {/* Severity pie chart */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Incidents by Severity</CardTitle>
        </CardHeader>
        <CardContent>
          {severityData.length === 0 ? (
            <NoData />
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie
                  data={severityData}
                  dataKey="count"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius={90}
                  paddingAngle={2}
                >
                  {severityData.map((entry) => (
                    <Cell key={entry.name} fill={entry.fill} />
                  ))}
                </Pie>
                <Tooltip contentStyle={chartTheme.tooltipContent} />
                <Legend
                  iconType="circle"
                  iconSize={8}
                  wrapperStyle={{ fontSize: 11 }}
                />
              </PieChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* Incidents per month bar chart */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Incidents per Month ({CURRENT_YEAR})</CardTitle>
        </CardHeader>
        <CardContent>
          {monthData.length === 0 ? (
            <NoData />
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart
                data={monthData}
                margin={{ top: 4, right: 8, left: -16, bottom: 4 }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  className="stroke-border"
                />
                <XAxis
                  dataKey="name"
                  tick={chartTheme.axisTick}
                />
                <YAxis
                  allowDecimals={false}
                  tick={chartTheme.axisTick}
                />
                <Tooltip contentStyle={chartTheme.tooltipContent} />
                <Bar
                  dataKey="count"
                  name="Incidents"
                  fill={C.rose}
                  radius={[4, 4, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* By status pie chart */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Incidents by Status</CardTitle>
        </CardHeader>
        <CardContent>
          {statusData.length === 0 ? (
            <NoData />
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie
                  data={statusData}
                  dataKey="count"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius={90}
                  paddingAngle={2}
                >
                  {statusData.map((entry) => (
                    <Cell key={entry.name} fill={entry.fill} />
                  ))}
                </Pie>
                <Tooltip contentStyle={chartTheme.tooltipContent} />
                <Legend
                  iconType="circle"
                  iconSize={8}
                  wrapperStyle={{ fontSize: 11 }}
                />
              </PieChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ── Leave tab ──────────────────────────────────────────────────────────────

function LeaveTab({
  data,
}: {
  data: {
    byStaff: { name: string; totalDays: number }[];
    byType: { typeName: string; count: number; totalDays: number }[];
    byStatus: { status: string; count: number }[];
  };
}) {
  const staffData = [...data.byStaff]
    .sort((a, b) => b.totalDays - a.totalDays)
    .slice(0, 15)
    .map((d) => ({ name: d.name, count: d.totalDays }));

  const typeData = data.byType.map((d, i) => ({
    name: d.typeName,
    count: d.count,
    totalDays: d.totalDays,
    fill: LEAVE_TYPE_COLORS[i % LEAVE_TYPE_COLORS.length],
  }));

  const approvedCount =
    data.byStatus.find((s) => s.status === "approved")?.count ?? 0;
  const pendingCount =
    data.byStatus.find((s) => s.status === "pending")?.count ?? 0;
  const rejectedCount =
    data.byStatus.find((s) => s.status === "rejected")?.count ?? 0;

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {/* Leave days per staff horizontal bar chart */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Leave Days per Staff (Top 15)</CardTitle>
        </CardHeader>
        <CardContent>
          {staffData.length === 0 ? (
            <NoData />
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart
                data={staffData}
                layout="vertical"
                margin={{ top: 4, right: 16, left: 0, bottom: 4 }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  horizontal={false}
                  className="stroke-border"
                />
                <XAxis
                  type="number"
                  allowDecimals={false}
                  tick={chartTheme.axisTick}
                />
                <YAxis
                  type="category"
                  dataKey="name"
                  width={120}
                  tick={chartTheme.axisTick}
                />
                <Tooltip
                  contentStyle={chartTheme.tooltipContent}
                  formatter={(v) => [`${v} days`, "Total Days"]}
                />
                <Bar
                  dataKey="count"
                  name="Days"
                  fill={C.teal}
                  radius={[0, 4, 4, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* Leave by type pie chart */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Leave Requests by Type</CardTitle>
        </CardHeader>
        <CardContent>
          {typeData.length === 0 ? (
            <NoData />
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie
                  data={typeData}
                  dataKey="count"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius={90}
                  paddingAngle={2}
                >
                  {typeData.map((entry, i) => (
                    <Cell key={`${entry.name}-${i}`} fill={entry.fill} />
                  ))}
                </Pie>
                <Tooltip contentStyle={chartTheme.tooltipContent} />
                <Legend
                  iconType="circle"
                  iconSize={8}
                  wrapperStyle={{ fontSize: 11 }}
                />
              </PieChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* Status stat cards — full width row */}
      <Card className="lg:col-span-2">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Leave Request Status Summary</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-4">
            <StatCard
              label="Approved"
              value={approvedCount}
              colorClass="bg-blue-500/10 text-blue-700 dark:text-blue-300"
            />
            <StatCard
              label="Pending"
              value={pendingCount}
              colorClass="bg-amber-500/10 text-amber-700 dark:text-amber-300"
            />
            <StatCard
              label="Rejected"
              value={rejectedCount}
              colorClass="bg-red-500/10 text-red-700 dark:text-red-300"
            />
            {data.byStatus
              .filter(
                (s) =>
                  !["approved", "pending", "rejected"].includes(s.status)
              )
              .map((s) => (
                <StatCard
                  key={s.status}
                  label={labelCase(s.status)}
                  value={s.count}
                  colorClass="bg-muted text-foreground"
                />
              ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ── Roster tab ─────────────────────────────────────────────────────────────

function RosterTab({
  data,
}: {
  data: {
    fairness: {
      name: string;
      totalAssignments: number;
      leadCount: number;
      asnCount: number;
      coreCount: number;
      enterpriseCount: number;
    }[];
  };
}) {
  const chartData = [...data.fairness]
    .sort((a, b) => b.totalAssignments - a.totalAssignments)
    .map((d) => ({
      name: d.name,
      leadCount: d.leadCount,
      asnCount: d.asnCount,
      coreCount: d.coreCount,
      enterpriseCount: d.enterpriseCount,
      total: d.totalAssignments,
    }));

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {/* Stacked bar chart — takes full width on lg */}
      <Card className="lg:col-span-2">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">
            On-Call Roster Assignment Distribution ({CURRENT_YEAR})
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Stacked assignment counts per staff member across all roster roles
          </p>
        </CardHeader>
        <CardContent>
          {chartData.length === 0 ? (
            <NoData />
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart
                data={chartData}
                margin={{ top: 4, right: 8, left: -16, bottom: 4 }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  className="stroke-border"
                />
                <XAxis
                  dataKey="name"
                  tick={chartTheme.axisTick}
                />
                <YAxis
                  allowDecimals={false}
                  tick={chartTheme.axisTick}
                />
                <Tooltip contentStyle={chartTheme.tooltipContent} />
                <Legend
                  iconType="circle"
                  iconSize={8}
                  wrapperStyle={{ fontSize: 11 }}
                />
                {ROTA_ROLE_CONFIG.map((role) => (
                  <Bar
                    key={role.key}
                    dataKey={role.key}
                    name={role.label}
                    stackId="a"
                    fill={role.color}
                    radius={
                      role.key === "enterpriseCount"
                        ? [4, 4, 0, 0]
                        : [0, 0, 0, 0]
                    }
                  />
                ))}
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* Total assignments horizontal bar for fairness comparison */}
      <Card className="lg:col-span-2">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Total On-Call Assignments per Staff</CardTitle>
          <p className="text-xs text-muted-foreground">
            Use this to identify imbalances in on-call burden
          </p>
        </CardHeader>
        <CardContent>
          {chartData.length === 0 ? (
            <NoData />
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart
                data={chartData}
                layout="vertical"
                margin={{ top: 4, right: 16, left: 0, bottom: 4 }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  horizontal={false}
                  className="stroke-border"
                />
                <XAxis
                  type="number"
                  allowDecimals={false}
                  tick={chartTheme.axisTick}
                />
                <YAxis
                  type="category"
                  dataKey="name"
                  width={120}
                  tick={chartTheme.axisTick}
                />
                <Tooltip contentStyle={chartTheme.tooltipContent} />
                <Bar
                  dataKey="total"
                  name="Total Assignments"
                  fill={C.indigo}
                  radius={[0, 4, 4, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ── Procurement tab ────────────────────────────────────────────────────────

function ProcurementTab({
  data,
}: {
  data: {
    byStatus: { status: string; count: number }[];
    byPriority: { priority: string; count: number }[];
  };
}) {
  const statusData = data.byStatus.map((d) => ({
    name: labelCase(d.status),
    count: d.count,
    fill: PROCUREMENT_STATUS_COLORS[d.status] ?? C.blue,
  }));

  const priorityData = data.byPriority.map((d) => ({
    name: labelCase(d.priority),
    count: d.count,
    fill: PROCUREMENT_PRIORITY_COLORS[d.priority] ?? C.blue,
  }));

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {/* PRs by status pie chart */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Purchase Requisitions by Status</CardTitle>
        </CardHeader>
        <CardContent>
          {statusData.length === 0 ? (
            <NoData />
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie
                  data={statusData}
                  dataKey="count"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius={90}
                  paddingAngle={2}
                >
                  {statusData.map((entry) => (
                    <Cell key={entry.name} fill={entry.fill} />
                  ))}
                </Pie>
                <Tooltip contentStyle={chartTheme.tooltipContent} />
                <Legend
                  iconType="circle"
                  iconSize={8}
                  wrapperStyle={{ fontSize: 11 }}
                />
              </PieChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* PRs by priority bar chart */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Purchase Requisitions by Priority</CardTitle>
        </CardHeader>
        <CardContent>
          {priorityData.length === 0 ? (
            <NoData />
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart
                data={priorityData}
                margin={{ top: 4, right: 8, left: -16, bottom: 4 }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  className="stroke-border"
                />
                <XAxis
                  dataKey="name"
                  tick={chartTheme.axisTick}
                />
                <YAxis
                  allowDecimals={false}
                  tick={chartTheme.axisTick}
                />
                <Tooltip contentStyle={chartTheme.tooltipContent} />
                <Bar dataKey="count" name="PRs" radius={[4, 4, 0, 0]}>
                  {priorityData.map((entry) => (
                    <Cell key={entry.name} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ── Compliance tab ─────────────────────────────────────────────────────────

function ComplianceTab({
  data,
}: {
  data: {
    training: { byStatus: { status: string; count: number }[] };
    appraisals: { byStatus: { status: string; count: number }[] };
  };
}) {
  const trainingData = data.training.byStatus.map((d) => ({
    name: labelCase(d.status),
    count: d.count,
    fill: TRAINING_STATUS_COLORS[d.status] ?? C.blue,
  }));

  const appraisalData = data.appraisals.byStatus.map((d) => ({
    name: labelCase(d.status),
    count: d.count,
    fill: APPRAISAL_STATUS_COLORS[d.status] ?? C.blue,
  }));

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {/* Training by status */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Training Records by Status</CardTitle>
        </CardHeader>
        <CardContent>
          {trainingData.length === 0 ? (
            <NoData />
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie
                  data={trainingData}
                  dataKey="count"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius={90}
                  paddingAngle={2}
                >
                  {trainingData.map((entry) => (
                    <Cell key={entry.name} fill={entry.fill} />
                  ))}
                </Pie>
                <Tooltip contentStyle={chartTheme.tooltipContent} />
                <Legend
                  iconType="circle"
                  iconSize={8}
                  wrapperStyle={{ fontSize: 11 }}
                />
              </PieChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* Appraisals by status */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Appraisals by Status</CardTitle>
        </CardHeader>
        <CardContent>
          {appraisalData.length === 0 ? (
            <NoData />
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie
                  data={appraisalData}
                  dataKey="count"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius={90}
                  paddingAngle={2}
                >
                  {appraisalData.map((entry) => (
                    <Cell key={entry.name} fill={entry.fill} />
                  ))}
                </Pie>
                <Tooltip contentStyle={chartTheme.tooltipContent} />
                <Legend
                  iconType="circle"
                  iconSize={8}
                  wrapperStyle={{ fontSize: 11 }}
                />
              </PieChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ── Loading skeleton ────────────────────────────────────────────────────────

function PageLoadingSkeleton() {
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {Array.from({ length: 4 }).map((_, i) => (
        <ChartCardSkeleton key={i} />
      ))}
    </div>
  );
}

// ── Main page ───────────────────────────────────────────────────────────────

function AnalyticsPage() {
  const { data, isLoading, isError } = useQuery(
    orpc.analytics.overview.queryOptions({ input: { year: CURRENT_YEAR } })
  );

  return (
    <>
      <Header fixed>
        <div className="flex items-center gap-2">
          <BarChart3 className="size-4 text-muted-foreground" />
          <span className="text-sm font-medium">Analytics</span>
        </div>
        <div className="ms-auto flex items-center gap-2 print:hidden">
          <ThemeSwitch />
          <button
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-background px-3 py-1.5 text-xs font-medium shadow-xs hover:bg-muted transition-colors"
          >
            <Download className="size-3.5" />
            Export PDF
          </button>
        </div>
      </Header>

      <Main>
        {/* Page heading */}
        <div className="mb-6 flex flex-wrap items-center gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
              <BarChart3 className="size-6 text-blue-500" />
              Analytics
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Year-over-year operational data across all DCS modules.
            </p>
          </div>
          <Badge variant="outline" className="ml-auto text-sm px-3 py-1">
            {CURRENT_YEAR}
          </Badge>
        </div>

        {/* Error state */}
        {isError && (
          <div className="mb-6 rounded-xl border border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-900/20 px-4 py-3 text-sm text-red-700 dark:text-red-300">
            Failed to load analytics data. Please refresh the page.
          </div>
        )}

        {/* Tabs */}
        <Tabs defaultValue="work">
          <TabsList className="mb-6 h-auto flex-wrap gap-1">
            <TabsTrigger value="work">Work</TabsTrigger>
            <TabsTrigger value="incidents">Incidents</TabsTrigger>
            <TabsTrigger value="leave">Leave</TabsTrigger>
            <TabsTrigger value="roster">Roster</TabsTrigger>
            <TabsTrigger value="procurement">Procurement</TabsTrigger>
            <TabsTrigger value="compliance">Compliance</TabsTrigger>
          </TabsList>

          {/* Work tab */}
          <TabsContent value="work">
            {isLoading ? (
              <PageLoadingSkeleton />
            ) : data ? (
              <WorkTab data={data.work} />
            ) : null}
          </TabsContent>

          {/* Incidents tab */}
          <TabsContent value="incidents">
            {isLoading ? (
              <PageLoadingSkeleton />
            ) : data ? (
              <IncidentsTab data={data.incidents} />
            ) : null}
          </TabsContent>

          {/* Leave tab */}
          <TabsContent value="leave">
            {isLoading ? (
              <PageLoadingSkeleton />
            ) : data ? (
              <LeaveTab data={data.leave} />
            ) : null}
          </TabsContent>

          {/* Roster tab */}
          <TabsContent value="roster">
            {isLoading ? (
              <PageLoadingSkeleton />
            ) : data ? (
              <RosterTab data={data.rota} />
            ) : null}
          </TabsContent>

          {/* Procurement tab */}
          <TabsContent value="procurement">
            {isLoading ? (
              <PageLoadingSkeleton />
            ) : data ? (
              <ProcurementTab data={data.procurement} />
            ) : null}
          </TabsContent>

          {/* Compliance tab */}
          <TabsContent value="compliance">
            {isLoading ? (
              <PageLoadingSkeleton />
            ) : data ? (
              <ComplianceTab
                data={{
                  training: data.training,
                  appraisals: data.appraisals,
                }}
              />
            ) : null}
          </TabsContent>
        </Tabs>
      </Main>
    </>
  );
}
