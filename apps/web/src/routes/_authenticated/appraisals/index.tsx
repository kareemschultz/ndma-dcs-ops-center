import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type ReactNode } from "react";
import { useState } from "react";
import { format } from "date-fns";
import { ClipboardCheck, Inbox, LayoutGrid, Send, ShieldCheck, TrendingUp } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { Badge } from "@ndma-dcs-staff-portal/ui/components/badge";
import { Button } from "@ndma-dcs-staff-portal/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@ndma-dcs-staff-portal/ui/components/card";
import { Skeleton } from "@ndma-dcs-staff-portal/ui/components/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@ndma-dcs-staff-portal/ui/components/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@ndma-dcs-staff-portal/ui/components/table";

import { Header } from "@/components/layout/header";
import { Main } from "@/components/layout/main";
import { ThemeSwitch } from "@/components/theme-switch";
import { chartTheme } from "@/lib/chart-theme";
import { useTeamFilter } from "@/lib/team-filter";
import { orpc } from "@/utils/orpc";

export const Route = createFileRoute("/_authenticated/appraisals/")({
  component: AppraisalsPage,
});

type AppraisalStatus =
  | "draft"
  | "scheduled"
  | "in_progress"
  | "submitted"
  | "approved"
  | "rejected"
  | "completed"
  | "overdue";

type AppraisalListRow = {
  id: string;
  staffProfileId: string;
  reviewerId: string | null;
  year: number | null;
  period: string | null;
  totalScore: number | null;
  status: string;
  periodStart: string | null;
  periodEnd: string | null;
  reviewer?: { user?: { name?: string | null } | null } | null;
  staffProfile?: {
    user?: { name?: string | null } | null;
    department?: { id: string; name: string; code: string } | null;
  } | null;
};

type TrackerRow = {
  id: number;
  departmentId: string | null;
  departmentName: string;
  departmentCode: string;
  year: number;
  period: string;
  totalCount: number;
  draftCount: number;
  scheduledCount: number;
  inProgressCount: number;
  submittedCount: number;
  approvedCount: number;
  rejectedCount: number;
  completedCount: number;
  overdueCount: number;
};

type AppraisalKpiSummary = {
  totalEvaluations: number;
  averageScore: number | null;
  completionRate: number;
  pendingCount: number;
  approvedCount: number;
  processedCount: number;
  completedCount: number;
  overdueCount: number;
  dueSoonFollowups: number;
  overdueFollowups: number;
  scoreBands: { label: string; count: number }[];
  statusBreakdown: { status: string; count: number }[];
  cycleBreakdown: {
    year: number | null;
    period: string | null;
    total: number;
    completed: number;
    averageScore: number | null;
  }[];
};

const STATUS_ORDER: AppraisalStatus[] = [
  "draft",
  "scheduled",
  "in_progress",
  "submitted",
  "approved",
  "rejected",
  "completed",
  "overdue",
];

const STATUS_COLORS: Record<AppraisalStatus, string> = {
  draft: "bg-muted text-muted-foreground",
  scheduled: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  in_progress: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300",
  submitted: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  approved: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300",
  rejected: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
  completed: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300",
  overdue: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
};

const KPI_STATUS_COLORS: Record<string, string> = {
  Draft: "#94a3b8",
  Pending_Approval: "#f59e0b",
  Approved_By_Manager: "#3b82f6",
  Processed_By_PA: "#8b5cf6",
  Completed: "#22c55e",
  Rejected: "#ef4444",
  Overdue: "#ef4444",
  Other: "#64748b",
};

const SCORE_BAND_COLORS: Record<string, string> = {
  "90-100": "#16a34a",
  "80-89": "#22c55e",
  "70-79": "#f59e0b",
  "Below 70": "#ef4444",
  "No Score": "#94a3b8",
};

const REVIEW_CHAIN = {
  manager: "Sachin Ramsuran",
  pa: "Ataybia Williams",
};

function formatPeriod(appraisal: AppraisalListRow) {
  if (appraisal.period) return appraisal.period;
  if (appraisal.periodStart && appraisal.periodEnd) {
    return `${format(new Date(appraisal.periodStart), "d MMM yyyy")} - ${format(new Date(appraisal.periodEnd), "d MMM yyyy")}`;
  }
  if (appraisal.year) return String(appraisal.year);
  return "—";
}

function StatCard({
  title,
  value,
  icon,
  tone,
}: {
  title: string;
  value: string;
  icon: ReactNode;
  tone: string;
}) {
  return (
    <Card className="border-border/60">
      <CardContent className="flex items-center gap-3 p-4">
        <div className={`flex size-10 items-center justify-center rounded-xl ${tone}`}>{icon}</div>
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">{title}</p>
          <p className="text-2xl font-bold leading-none">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function AppraisalsPage() {
  const queryClient = useQueryClient();
  const { team } = useTeamFilter();
  const [tab, setTab] = useState("records");

  const { data: trackerRows, isLoading: trackerLoading } = useQuery(
    orpc.appraisals.tracker.list.queryOptions({
      input: { team: team === "All" ? undefined : team },
    }),
  );

  const { data: appraisals, isLoading: appraisalsLoading } = useQuery(
    orpc.appraisals.list.queryOptions({
      input: {
        team: team === "All" ? undefined : team,
        limit: 200,
        offset: 0,
      },
    }),
  );
  const { data: pipelineRows, isLoading: pipelineLoading } = useQuery(
    orpc.appraisals.workflow.list.queryOptions({
      input: { team: team === "All" ? undefined : team },
    }),
  );
  const { data: kpiData, isLoading: kpiLoading } = useQuery(
    orpc.appraisals.kpis.summary.queryOptions({
      input: { team: team === "All" ? undefined : team },
    }),
  );

  const submitWorkflow = useMutation(
    orpc.appraisals.workflow.submit.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries({ queryKey: orpc.appraisals.workflow.list.key() });
        await queryClient.invalidateQueries({ queryKey: orpc.appraisals.list.key() });
      },
    }),
  );
  const approveWorkflow = useMutation(
    orpc.appraisals.workflow.approve.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries({ queryKey: orpc.appraisals.workflow.list.key() });
        await queryClient.invalidateQueries({ queryKey: orpc.appraisals.list.key() });
      },
    }),
  );
  const processWorkflow = useMutation(
    orpc.appraisals.workflow.process.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries({ queryKey: orpc.appraisals.workflow.list.key() });
        await queryClient.invalidateQueries({ queryKey: orpc.appraisals.list.key() });
      },
    }),
  );

  const rows = (appraisals ?? []) as AppraisalListRow[];
  const tracker = (trackerRows ?? []) as TrackerRow[];
  const kpis = kpiData as AppraisalKpiSummary | undefined;

  const totals = tracker.reduce(
    (acc, row) => ({
      totalCount: acc.totalCount + row.totalCount,
      draftCount: acc.draftCount + row.draftCount,
      scheduledCount: acc.scheduledCount + row.scheduledCount,
      inProgressCount: acc.inProgressCount + row.inProgressCount,
      submittedCount: acc.submittedCount + row.submittedCount,
      approvedCount: acc.approvedCount + row.approvedCount,
      rejectedCount: acc.rejectedCount + row.rejectedCount,
      completedCount: acc.completedCount + row.completedCount,
      overdueCount: acc.overdueCount + row.overdueCount,
    }),
    {
      totalCount: 0,
      draftCount: 0,
      scheduledCount: 0,
      inProgressCount: 0,
      submittedCount: 0,
      approvedCount: 0,
      rejectedCount: 0,
      completedCount: 0,
      overdueCount: 0,
    },
  );

  const scoredRows = rows.filter((appraisal) => typeof appraisal.totalScore === "number");
  const averageScore =
    scoredRows.length > 0
      ? Math.round(
          scoredRows.reduce((sum, appraisal) => sum + (appraisal.totalScore ?? 0), 0) /
            scoredRows.length,
        )
      : null;
  const statusChartData = (kpis?.statusBreakdown ?? []).map((item) => ({
    name: item.status.replaceAll("_", " "),
    count: item.count,
    fill: KPI_STATUS_COLORS[item.status] ?? KPI_STATUS_COLORS.Other,
  }));
  const scoreBandChartData = (kpis?.scoreBands ?? []).map((item) => ({
    name: item.label,
    count: item.count,
    fill: SCORE_BAND_COLORS[item.label] ?? "#64748b",
  }));
  const cycleChartData = (kpis?.cycleBreakdown ?? []).map((item) => ({
    name: item.period ?? (item.year != null ? String(item.year) : "Unknown"),
    total: item.total,
    completed: item.completed,
    averageScore: item.averageScore ?? 0,
  }));

  return (
    <>
      <Header fixed>
        <div className="flex items-center gap-2">
          <ClipboardCheck className="size-4 text-muted-foreground" />
          <span className="text-sm font-medium">Appraisals</span>
        </div>
        <div className="ms-auto flex items-center gap-2">
          <Button variant="outline" size="sm" render={<Link to="/appraisals/inbox" />}>
            <Inbox className="mr-1.5 size-3.5" />
            Inbox
          </Button>
          <ThemeSwitch />
        </div>
      </Header>

      <Main className="space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Centra Appraisals</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Browse appraisal history by team, then open a staff detail view for the full evaluation trail.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Badge variant="outline" className="border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900/60 dark:bg-blue-950/40 dark:text-blue-300">
                Manager: {REVIEW_CHAIN.manager}
              </Badge>
              <Badge variant="outline" className="border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-900/60 dark:bg-violet-950/40 dark:text-violet-300">
                PA: {REVIEW_CHAIN.pa}
              </Badge>
            </div>
          </div>
        </div>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
          {kpiLoading ? (
            Array.from({ length: 6 }).map((_, index) => (
              <Skeleton key={index} className="h-24 rounded-2xl" />
            ))
          ) : (
            <>
              <StatCard
                title="Total Evaluations"
                value={(kpis?.totalEvaluations ?? rows.length).toString()}
                icon={<LayoutGrid className="size-4 text-blue-600" />}
                tone="bg-blue-50 dark:bg-blue-950/40"
              />
              <StatCard
                title="Average Score"
                value={kpis?.averageScore != null ? `${kpis.averageScore}%` : "—"}
                icon={<TrendingUp className="size-4 text-green-600" />}
                tone="bg-green-50 dark:bg-green-950/40"
              />
              <StatCard
                title="Completion Rate"
                value={`${kpis?.completionRate ?? 0}%`}
                icon={<ClipboardCheck className="size-4 text-indigo-600" />}
                tone="bg-indigo-50 dark:bg-indigo-950/40"
              />
              <StatCard
                title="Pending Approval"
                value={(kpis?.pendingCount ?? 0).toString()}
                icon={<Send className="size-4 text-amber-600" />}
                tone="bg-amber-50 dark:bg-amber-950/40"
              />
              <StatCard
                title="Follow-ups Due Soon"
                value={(kpis?.dueSoonFollowups ?? 0).toString()}
                icon={<ShieldCheck className="size-4 text-violet-600" />}
                tone="bg-violet-50 dark:bg-violet-950/40"
              />
              <StatCard
                title="Overdue Follow-ups"
                value={(kpis?.overdueFollowups ?? 0).toString()}
                icon={<ClipboardCheck className="size-4 text-red-600" />}
                tone="bg-red-50 dark:bg-red-950/40"
              />
            </>
          )}
        </section>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {trackerLoading ? (
            Array.from({ length: 4 }).map((_, index) => (
              <Skeleton key={index} className="h-24 rounded-2xl" />
            ))
          ) : (
            <>
              <StatCard
                title="Total Evaluations"
                value={totals.totalCount.toString()}
                icon={<LayoutGrid className="size-4 text-blue-600" />}
                tone="bg-blue-50 dark:bg-blue-950/40"
              />
              <StatCard
                title="Approved / Completed"
                value={(totals.approvedCount + totals.completedCount).toString()}
                icon={<TrendingUp className="size-4 text-green-600" />}
                tone="bg-green-50 dark:bg-green-950/40"
              />
              <StatCard
                title="Submitted"
                value={totals.submittedCount.toString()}
                icon={<ClipboardCheck className="size-4 text-amber-600" />}
                tone="bg-amber-50 dark:bg-amber-950/40"
              />
              <StatCard
                title="Overdue"
                value={totals.overdueCount.toString()}
                icon={<ClipboardCheck className="size-4 text-red-600" />}
                tone="bg-red-50 dark:bg-red-950/40"
              />
            </>
          )}
        </section>

        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Tracked Teams</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {tracker.length > 0 ? (
                  tracker.map((row) => (
                    <Badge key={`${row.departmentCode}-${row.year}-${row.period}`} variant="outline">
                      {row.departmentCode} {row.year}
                    </Badge>
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground">No tracker rows available yet.</p>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Average Total Score</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold">{averageScore != null ? `${averageScore}%` : "—"}</p>
              <p className="text-sm text-muted-foreground">Across the filtered appraisal set.</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Current Filter</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm font-medium">
                {team === "All" ? "All teams" : `${team} only`}
              </p>
              <p className="text-sm text-muted-foreground">
                Showing appraisal records returned by the Hono API.
              </p>
            </CardContent>
          </Card>
        </div>

        <Tabs value={tab} onValueChange={setTab} className="space-y-4">
          <TabsList variant="line" className="justify-start">
            <TabsTrigger value="insights">KPI Insights</TabsTrigger>
            <TabsTrigger value="records">Records</TabsTrigger>
            <TabsTrigger value="pipeline">Approval Pipeline</TabsTrigger>
          </TabsList>

          <TabsContent value="insights">
            <div className="grid gap-4 xl:grid-cols-3">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Workflow Status Mix</CardTitle>
                </CardHeader>
                <CardContent>
                  {!statusChartData.length ? (
                    <p className="py-12 text-center text-sm text-muted-foreground">No appraisal status data yet.</p>
                  ) : (
                    <ResponsiveContainer width="100%" height={280}>
                      <PieChart>
                        <Pie data={statusChartData} dataKey="count" nameKey="name" cx="50%" cy="50%" outerRadius={90} label>
                          {statusChartData.map((entry) => (
                            <Cell key={entry.name} fill={entry.fill} />
                          ))}
                        </Pie>
                        <Tooltip contentStyle={chartTheme.tooltipContent} />
                        <Legend iconType="circle" iconSize={8} />
                      </PieChart>
                    </ResponsiveContainer>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Score Bands</CardTitle>
                </CardHeader>
                <CardContent>
                  {!scoreBandChartData.length ? (
                    <p className="py-12 text-center text-sm text-muted-foreground">No score data yet.</p>
                  ) : (
                    <ResponsiveContainer width="100%" height={280}>
                      <BarChart data={scoreBandChartData} margin={{ top: 4, right: 8, left: -12, bottom: 4 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} />
                        <XAxis dataKey="name" tick={chartTheme.axisTick} />
                        <YAxis allowDecimals={false} tick={chartTheme.axisTick} />
                        <Tooltip contentStyle={chartTheme.tooltipContent} />
                        <Bar dataKey="count" radius={[6, 6, 0, 0]}>
                          {scoreBandChartData.map((entry) => (
                            <Cell key={entry.name} fill={entry.fill} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Cycle Completion</CardTitle>
                </CardHeader>
                <CardContent>
                  {!cycleChartData.length ? (
                    <p className="py-12 text-center text-sm text-muted-foreground">No cycle data yet.</p>
                  ) : (
                    <ResponsiveContainer width="100%" height={280}>
                      <BarChart data={cycleChartData} margin={{ top: 4, right: 16, left: -12, bottom: 4 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} />
                        <XAxis dataKey="name" tick={chartTheme.axisTick} />
                        <YAxis allowDecimals={false} tick={chartTheme.axisTick} />
                        <Tooltip contentStyle={chartTheme.tooltipContent} />
                        <Legend iconType="circle" iconSize={8} />
                        <Bar dataKey="total" name="Total" fill="#cbd5e1" radius={[6, 6, 0, 0]} />
                        <Bar dataKey="completed" name="Completed" fill="#22c55e" radius={[6, 6, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="records">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Appraisal Records</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Staff Member</TableHead>
                  <TableHead>Team</TableHead>
                  <TableHead>Year</TableHead>
                  <TableHead>Period</TableHead>
                  <TableHead>Total Score</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Reviewer</TableHead>
                  <TableHead className="w-28" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {appraisalsLoading ? (
                  Array.from({ length: 5 }).map((_, rowIndex) => (
                    <TableRow key={rowIndex}>
                      {Array.from({ length: 8 }).map((_, cellIndex) => (
                        <TableCell key={cellIndex}>
                          <Skeleton className="h-4 w-full" />
                        </TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="py-12 text-center text-muted-foreground">
                      No appraisal records found for this filter.
                    </TableCell>
                  </TableRow>
                ) : (
                  rows.map((appraisal) => (
                    <TableRow key={appraisal.id}>
                      <TableCell className="font-medium">
                        {appraisal.staffProfile?.user?.name ?? "—"}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {appraisal.staffProfile?.department?.name ?? "—"}
                      </TableCell>
                      <TableCell>{appraisal.year ?? "—"}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{formatPeriod(appraisal)}</TableCell>
                      <TableCell className="font-mono">
                        {appraisal.totalScore != null
                          ? `${appraisal.totalScore}%`
                          : "—"}
                      </TableCell>
                      <TableCell>
                        <span
                          className={`inline-flex items-center rounded-lg px-2 py-0.5 text-xs font-medium ${
                            STATUS_COLORS[appraisal.status as AppraisalStatus] ?? STATUS_COLORS.draft
                          }`}
                        >
                          {appraisal.status.replace("_", " ")}
                        </span>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {appraisal.reviewer?.user?.name ?? "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="outline"
                          size="sm"
                          render={<Link to="/appraisals/staff/$staffProfileId" params={{ staffProfileId: appraisal.staffProfileId }} />}
                        >
                          View Staff
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="pipeline">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Approval Pipeline</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {pipelineLoading ? (
                  Array.from({ length: 4 }).map((_, index) => (
                    <Skeleton key={index} className="h-20 rounded-xl" />
                  ))
                ) : !pipelineRows?.length ? (
                  <p className="text-sm text-muted-foreground">No appraisals in the approval pipeline.</p>
                ) : (
                  (pipelineRows ?? []).map((row: AppraisalListRow) => (
                    <div key={row.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-4">
                      <div>
                        <p className="font-medium">{row.staffProfile?.user?.name ?? "—"}</p>
                        <p className="text-sm text-muted-foreground">{formatPeriod(row)} · {row.status}</p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {(row.status === "Draft" || row.status === "draft") && (
                          <Button size="sm" onClick={() => submitWorkflow.mutate({ id: row.id })}>
                            <Send className="mr-1.5 size-3.5" />
                            Submit for Approval
                          </Button>
                        )}
                        {(row.status === "Pending_Approval" || row.status === "submitted") && (
                          <Button size="sm" onClick={() => approveWorkflow.mutate({ id: row.id })}>
                            <ShieldCheck className="mr-1.5 size-3.5" />
                            Approve
                          </Button>
                        )}
                        {(row.status === "Approved_By_Manager" || row.status === "approved") && (
                          <Button size="sm" onClick={() => processWorkflow.mutate({ id: row.id })}>
                            <Inbox className="mr-1.5 size-3.5" />
                            Export &amp; Send to HR
                          </Button>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </Main>
    </>
  );
}
