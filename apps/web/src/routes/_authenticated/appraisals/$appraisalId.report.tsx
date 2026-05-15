import { useMemo } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import {
  Activity,
  AlertCircle,
  ArrowLeft,
  Award,
  BarChart3,
  ClipboardCheck,
  FileDown,
  FileSpreadsheet,
  Flag,
  MessageSquare,
  Pencil,
  Sparkles,
  Target,
  TrendingUp,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { Button } from "@ndma-dcs-staff-portal/ui/components/button";
import { Skeleton } from "@ndma-dcs-staff-portal/ui/components/skeleton";

import { Header } from "@/components/layout/header";
import { Main } from "@/components/layout/main";
import { ThemeSwitch } from "@/components/theme-switch";
import { chartTheme } from "@/lib/chart-theme";
import { orpc } from "@/utils/orpc";
import { exportOfficialAppraisalExcel } from "@/utils/excel-export";
import { exportOfficialAppraisalPDF } from "@/utils/pdf-export";

export const Route = createFileRoute(
  "/_authenticated/appraisals/$appraisalId/report",
)({
  component: AppraisalReportPage,
});

const CATEGORIES: { key: string; label: string; short: string }[] = [
  { key: "organisational_skills", label: "Organisational Skills", short: "Organisation" },
  { key: "quality_of_work", label: "Quality of Work", short: "Quality" },
  { key: "dependability", label: "Dependability", short: "Dependability" },
  { key: "communication_skills", label: "Communication Skills", short: "Communication" },
  { key: "cooperation", label: "Cooperation", short: "Cooperation" },
  { key: "initiative", label: "Initiative", short: "Initiative" },
  { key: "technical_skills", label: "Problem Solving", short: "Problem Solving" },
  { key: "attendance_punctuality", label: "Overall Professionalism", short: "Professionalism" },
];

const RATING_LABELS: Record<number, string> = {
  5: "Excellent",
  4: "Good",
  3: "Acceptable",
  2: "Needs Improvement",
  1: "Unsatisfactory",
};

function gradeLabel(pct: number): { label: string; cls: string } {
  if (pct >= 91) return { label: "Excellent", cls: "text-blue-700 dark:text-blue-400" };
  if (pct >= 81) return { label: "Good", cls: "text-blue-600 dark:text-blue-400" };
  if (pct >= 71) return { label: "Acceptable", cls: "text-amber-600 dark:text-amber-400" };
  if (pct >= 61) return { label: "Needs Improvement", cls: "text-amber-600 dark:text-amber-400" };
  return { label: "Unsatisfactory", cls: "text-red-600 dark:text-red-400" };
}

function barColor(rating: number): string {
  if (rating >= 4) return "#2563eb";
  if (rating === 3) return "#3b82f6";
  if (rating === 2) return "#f59e0b";
  return "#ef4444";
}

function AppraisalReportPage() {
  const { appraisalId } = Route.useParams();
  const navigate = useNavigate();

  const { data: appraisal, isLoading, isError } = useQuery(
    orpc.appraisals.getDetail.queryOptions({ input: { id: appraisalId } }),
  );

  const staffProfileId = appraisal?.staffProfileId;
  const { data: history } = useQuery({
    ...orpc.appraisals.getByStaff.queryOptions({
      input: { staffProfileId: staffProfileId ?? "" },
    }),
    enabled: !!staffProfileId,
  });

  // ── Derived data (hooks before any early return) ──
  const matrix = (appraisal?.ratingMatrix as Record<string, number> | null) ?? {};
  const objectives =
    (appraisal?.objectives as { title: string; rating?: number }[] | null) ?? [];

  const categoryTotal = useMemo(
    () => CATEGORIES.reduce((sum, c) => sum + (matrix[c.key] ?? 0), 0),
    [matrix],
  );
  const respTotal = useMemo(
    () => objectives.reduce((sum, o) => sum + (o.rating ?? 0), 0),
    [objectives],
  );
  const rawTotal = categoryTotal + respTotal;
  const percentage = appraisal
    ? appraisal.percentageScore ?? Math.round((rawTotal / 65) * 100)
    : 0;

  const radarData = useMemo(
    () =>
      CATEGORIES.map((c) => ({
        category: c.short,
        rating: matrix[c.key] ?? 0,
      })),
    [matrix],
  );
  const barData = useMemo(
    () =>
      CATEGORIES.map((c) => ({
        name: c.short,
        rating: matrix[c.key] ?? 0,
      })),
    [matrix],
  );
  const respChartData = useMemo(
    () =>
      objectives
        .filter((o) => o.title?.trim())
        .map((o, i) => ({
          name: o.title.length > 28 ? `${o.title.slice(0, 28)}…` : o.title,
          rating: o.rating ?? 0,
          idx: i,
        })),
    [objectives],
  );

  // Trend across this staff member's prior appraisals.
  const trendData = useMemo(() => {
    const rows = (history ?? []) as Array<{
      id: string;
      period: string | null;
      year: number | null;
      periodStart: string | null;
      percentageScore: number | null;
    }>;
    return [...rows]
      .filter((r) => r.percentageScore != null)
      .sort((a, b) => (a.periodStart ?? "").localeCompare(b.periodStart ?? ""))
      .map((r) => ({
        name:
          r.period ??
          (r.periodStart ? r.periodStart.slice(0, 7) : String(r.year ?? "")),
        score: r.percentageScore ?? 0,
        current: r.id === appraisalId,
      }));
  }, [history, appraisalId]);

  if (isLoading) {
    return (
      <>
        <Header fixed>
          <div className="flex items-center gap-2">
            <ClipboardCheck className="size-4 text-muted-foreground" />
            <span className="text-sm font-medium">Appraisal Report</span>
          </div>
          <div className="ms-auto">
            <ThemeSwitch />
          </div>
        </Header>
        <Main>
          <div className="mx-auto max-w-5xl space-y-6">
            <Skeleton className="h-8 w-64" />
            <Skeleton className="h-40 w-full" />
            <Skeleton className="h-72 w-full" />
          </div>
        </Main>
      </>
    );
  }

  if (isError || !appraisal) {
    return (
      <>
        <Header fixed>
          <div className="flex items-center gap-2">
            <ClipboardCheck className="size-4 text-muted-foreground" />
            <span className="text-sm font-medium">Appraisal Report</span>
          </div>
          <div className="ms-auto">
            <ThemeSwitch />
          </div>
        </Header>
        <Main>
          <div className="mx-auto flex max-w-5xl flex-col items-center gap-4 py-20 text-center">
            <AlertCircle className="size-10 text-destructive" />
            <p className="text-lg font-semibold">Appraisal not found</p>
            <Button variant="outline" onClick={() => navigate({ to: "/appraisals" })}>
              <ArrowLeft className="mr-2 size-4" />
              Back to Appraisals
            </Button>
          </div>
        </Main>
      </>
    );
  }

  const staffName =
    (appraisal.staffProfile as { user?: { name?: string | null } | null } | null)
      ?.user?.name ?? "—";
  const staffInitials = (() => {
    if (!staffName || staffName === "—") return "—";
    const parts = staffName.trim().split(/\s+/);
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  })();
  const reviewerName =
    (appraisal.reviewer as { user?: { name?: string | null } | null } | null)
      ?.user?.name ?? "—";
  const departmentName =
    (appraisal.staffProfile as { department?: { name: string } | null } | null)
      ?.department?.name ?? "—";
  const designation =
    (appraisal.staffProfile as { jobTitle?: string | null } | null)?.jobTitle ??
    "—";
  const periodLabel =
    appraisal.periodStart && appraisal.periodEnd
      ? `${format(parseISO(appraisal.periodStart), "d MMM yyyy")} – ${format(parseISO(appraisal.periodEnd), "d MMM yyyy")}`
      : "—";
  const increment =
    percentage <= 60 ? 1 : percentage <= 70 ? 2 : percentage <= 80 ? 3 : percentage <= 90 ? 4 : 5;
  const grade = gradeLabel(percentage);
  // getDetail overrides `achievements` / `goals` with sub-table rows
  // ({ seq, text, ... }); `goalIndicators` is the untouched JSONB column.
  const goalRows =
    (appraisal.goals as Array<{ text: string }> | string[] | null) ?? [];
  const goalArr = goalRows.map((g) => (typeof g === "string" ? g : g.text));
  const indicators = (appraisal.goalIndicators as string[] | null) ?? [];
  const achievementRows =
    (appraisal.achievements as Array<{ text: string }> | string[] | null) ?? [];
  const achievements = achievementRows.map((a) =>
    typeof a === "string" ? a : a.text,
  );

  function buildOfficialData() {
    if (!appraisal) {
      throw new Error("Appraisal not loaded");
    }
    return {
      employeeName: staffName,
      jobTitle: designation,
      supervisor: reviewerName,
      department: departmentName,
      location: appraisal.location ?? "",
      typeOfReview: appraisal.typeOfReview ?? "Biannually",
      periodStart: appraisal.periodStart ?? "",
      periodEnd: appraisal.periodEnd ?? "",
      status: appraisal.status,
      ratingMatrix: matrix,
      categoryComments:
        (appraisal.categoryComments as Record<string, string> | null) ?? {},
      responsibilities: objectives
        .filter((o) => o.title?.trim())
        .map((o) => ({ title: o.title, rating: o.rating ?? 0 })),
      responsibilitiesComment: appraisal.responsibilitiesComment ?? "",
      areasOfStrength: appraisal.areasOfStrength ?? "",
      improvementsMade: appraisal.improvementsMade ?? "",
      areasForDevelopment: appraisal.areasForDevelopment ?? "",
      developmentActions: appraisal.developmentActions ?? "",
      achievements,
      goals: goalArr.map((g, i) => ({ goal: g, indicator: indicators[i] ?? "" })),
    };
  }

  return (
    <>
      <Header fixed>
        <div className="flex items-center gap-2">
          <ClipboardCheck className="size-4 text-muted-foreground" />
          <span className="text-sm text-muted-foreground">Appraisals</span>
          <span className="text-muted-foreground">/</span>
          <span className="text-sm font-medium">Report — {staffName}</span>
        </div>
        <div className="ms-auto flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              navigate({
                to: "/appraisals/$appraisalId",
                params: { appraisalId },
              })
            }
          >
            <Pencil className="mr-1.5 size-4" />
            Edit
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              exportOfficialAppraisalExcel(
                buildOfficialData(),
                `Appraisal_${staffName.replace(/\s+/g, "_")}.xlsx`,
              )
            }
          >
            <FileSpreadsheet className="mr-1.5 size-4" />
            Excel
          </Button>
          <Button
            size="sm"
            onClick={() =>
              exportOfficialAppraisalPDF(
                buildOfficialData(),
                `Appraisal_${staffName.replace(/\s+/g, "_")}.pdf`,
              )
            }
          >
            <FileDown className="mr-1.5 size-4" />
            Download PDF
          </Button>
          <ThemeSwitch />
        </div>
      </Header>

      <Main>
        <div className="mx-auto max-w-5xl space-y-6 pb-16">
          <Link
            to="/appraisals"
            className="flex w-fit items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="size-4" />
            Back to Appraisals
          </Link>

          {/* Hero — score summary */}
          <div className="relative overflow-hidden rounded-2xl border border-blue-900/20 bg-gradient-to-br from-blue-600 via-blue-700 to-blue-900 p-6 text-white shadow-lg sm:p-8">
            {/* decorative glow */}
            <div className="pointer-events-none absolute -right-16 -top-16 size-56 rounded-full bg-blue-400/20 blur-3xl" />
            <div className="pointer-events-none absolute -bottom-20 left-1/3 size-48 rounded-full bg-indigo-400/10 blur-3xl" />
            <div className="relative flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex items-start gap-4">
                <div className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-white/15 text-lg font-bold backdrop-blur-sm ring-1 ring-white/20">
                  {staffInitials}
                </div>
                <div>
                  <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-blue-200">
                    Performance Evaluation Report
                  </p>
                  <h1 className="mt-1 text-2xl font-bold leading-tight sm:text-[1.7rem]">
                    {staffName}
                  </h1>
                  <p className="mt-0.5 text-sm text-blue-100">
                    {designation} · {departmentName}
                  </p>
                  <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                    <span className="inline-flex items-center gap-1 rounded-md bg-white/10 px-2 py-0.5 text-[11px] font-medium ring-1 ring-white/15">
                      {periodLabel}
                    </span>
                    <span className="inline-flex items-center gap-1 rounded-md bg-white/10 px-2 py-0.5 text-[11px] font-medium ring-1 ring-white/15">
                      Reviewer: {reviewerName}
                    </span>
                    <span className="inline-flex items-center gap-1 rounded-md bg-white/15 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ring-1 ring-white/20">
                      {appraisal.status.replace(/_/g, " ")}
                    </span>
                  </div>
                </div>
              </div>

              {/* Score block */}
              <div className="flex items-center gap-5 rounded-2xl bg-white/10 p-4 ring-1 ring-white/15 backdrop-blur-sm">
                {/* score ring */}
                <div
                  className="relative flex size-24 items-center justify-center rounded-full"
                  style={{
                    background: `conic-gradient(#bfdbfe ${percentage * 3.6}deg, rgba(255,255,255,0.14) ${percentage * 3.6}deg)`,
                  }}
                >
                  <div className="flex size-[4.6rem] flex-col items-center justify-center rounded-full bg-blue-800/90">
                    <span className="text-2xl font-bold tabular-nums leading-none">
                      {percentage}%
                    </span>
                    <span className="mt-0.5 text-[10px] text-blue-200">
                      {rawTotal}/65 pts
                    </span>
                  </div>
                </div>
                <div className="space-y-2">
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-blue-200">
                      Overall Grade
                    </p>
                    <p className="text-base font-bold leading-tight">{grade.label}</p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-blue-200">
                      Salary Increment
                    </p>
                    <p className="text-base font-bold leading-tight tabular-nums">
                      {increment}%
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Stat tiles */}
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <StatTile
              label="Overall Grade"
              value={grade.label}
              valueCls={grade.cls}
              icon={<Award className="size-4 text-blue-600" />}
              barPct={percentage}
            />
            <StatTile
              label="General Performance"
              value={`${categoryTotal} / 40`}
              icon={<TrendingUp className="size-4 text-blue-600" />}
              barPct={Math.round((categoryTotal / 40) * 100)}
            />
            <StatTile
              label="Core Responsibilities"
              value={`${respTotal} / 25`}
              icon={<Target className="size-4 text-blue-600" />}
              barPct={Math.round((respTotal / 25) * 100)}
            />
            <StatTile
              label="Status"
              value={appraisal.status.replace(/_/g, " ")}
              valueCls="capitalize"
              icon={<ClipboardCheck className="size-4 text-blue-600" />}
            />
          </div>

          {/* Charts row */}
          <div className="grid gap-4 lg:grid-cols-2">
            <ChartCard
              title="Category Profile"
              subtitle="Rating across the 8 evaluation categories"
              icon={<Activity className="size-4" />}
            >
              {categoryTotal > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <RadarChart data={radarData} outerRadius="72%">
                    <PolarGrid stroke="var(--border)" />
                    <PolarAngleAxis
                      dataKey="category"
                      tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                    />
                    <PolarRadiusAxis
                      domain={[0, 5]}
                      tickCount={6}
                      tick={{ fontSize: 9, fill: "var(--muted-foreground)" }}
                    />
                    <Radar
                      name="Rating"
                      dataKey="rating"
                      stroke="#2563eb"
                      fill="#3b82f6"
                      fillOpacity={0.45}
                    />
                    <Tooltip contentStyle={chartTheme.tooltipContent} />
                  </RadarChart>
                </ResponsiveContainer>
              ) : (
                <EmptyChart />
              )}
            </ChartCard>

            <ChartCard
              title="Category Breakdown"
              subtitle="Per-category score (1–5 scale)"
              icon={<BarChart3 className="size-4" />}
            >
              {categoryTotal > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart
                    data={barData}
                    layout="vertical"
                    margin={{ top: 4, right: 16, left: 4, bottom: 4 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                    <XAxis
                      type="number"
                      domain={[0, 5]}
                      tickCount={6}
                      tick={chartTheme.axisTick}
                    />
                    <YAxis
                      type="category"
                      dataKey="name"
                      width={96}
                      tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                    />
                    <Tooltip
                      contentStyle={chartTheme.tooltipContent}
                      formatter={(v) => {
                        const n = Number(v);
                        return [`${n} — ${RATING_LABELS[n] ?? "Not rated"}`, "Rating"];
                      }}
                    />
                    <Bar dataKey="rating" radius={[0, 6, 6, 0]} barSize={16}>
                      {barData.map((entry) => (
                        <Cell key={entry.name} fill={barColor(entry.rating)} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <EmptyChart />
              )}
            </ChartCard>
          </div>

          {/* Responsibilities + trend */}
          <div className="grid gap-4 lg:grid-cols-2">
            <ChartCard
              title="Core Responsibilities"
              subtitle="Performance against key responsibilities"
              icon={<Target className="size-4" />}
            >
              {respChartData.length > 0 ? (
                <ResponsiveContainer width="100%" height={Math.max(180, respChartData.length * 56)}>
                  <BarChart
                    data={respChartData}
                    layout="vertical"
                    margin={{ top: 4, right: 16, left: 4, bottom: 4 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                    <XAxis
                      type="number"
                      domain={[0, 5]}
                      tickCount={6}
                      tick={chartTheme.axisTick}
                    />
                    <YAxis
                      type="category"
                      dataKey="name"
                      width={130}
                      tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                    />
                    <Tooltip
                      contentStyle={chartTheme.tooltipContent}
                      formatter={(v) => {
                        const n = Number(v);
                        return [`${n} — ${RATING_LABELS[n] ?? "Not rated"}`, "Rating"];
                      }}
                    />
                    <Bar dataKey="rating" radius={[0, 6, 6, 0]} barSize={18}>
                      {respChartData.map((entry) => (
                        <Cell key={entry.idx} fill={barColor(entry.rating)} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <EmptyChart label="No core responsibilities recorded." />
              )}
            </ChartCard>

            <ChartCard
              title="Score Trend"
              subtitle="This employee's appraisal scores over time"
              icon={<TrendingUp className="size-4" />}
            >
              {trendData.length > 1 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart
                    data={trendData}
                    margin={{ top: 8, right: 12, left: -12, bottom: 4 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="name" tick={chartTheme.axisTickSmall} />
                    <YAxis domain={[0, 100]} tick={chartTheme.axisTick} />
                    <Tooltip
                      contentStyle={chartTheme.tooltipContent}
                      formatter={(v) => [`${Number(v)}%`, "Score"]}
                    />
                    <Bar dataKey="score" radius={[6, 6, 0, 0]} barSize={36}>
                      {trendData.map((entry) => (
                        <Cell
                          key={entry.name}
                          fill={entry.current ? "#2563eb" : "#93c5fd"}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <EmptyChart label="Not enough prior appraisals to chart a trend." />
              )}
            </ChartCard>
          </div>

          {/* Category comments */}
          <ReportSection title="Category Comments" icon={<MessageSquare className="size-4" />}>
            <div className="divide-y">
              {CATEGORIES.map((c) => {
                const rating = matrix[c.key] ?? 0;
                const comment =
                  (appraisal.categoryComments as Record<string, string> | null)?.[
                    c.key
                  ] ?? "";
                return (
                  <div key={c.key} className="flex gap-4 py-3">
                    <div className="w-48 shrink-0">
                      <p className="text-sm font-medium">{c.label}</p>
                      <span
                        className="mt-0.5 inline-flex items-center rounded-md px-1.5 py-0.5 text-[11px] font-semibold text-white"
                        style={{ background: barColor(rating || 1) }}
                      >
                        {rating ? `${rating} — ${RATING_LABELS[rating]}` : "Not rated"}
                      </span>
                    </div>
                    <p className="flex-1 text-sm text-muted-foreground">
                      {comment || (
                        <span className="italic">No comment recorded.</span>
                      )}
                    </p>
                  </div>
                );
              })}
            </div>
          </ReportSection>

          {/* Development summary */}
          <ReportSection title="Summary & Development" icon={<Activity className="size-4" />}>
            <div className="grid gap-4 sm:grid-cols-2">
              <DevBlock label="Areas of Strength" value={appraisal.areasOfStrength} />
              <DevBlock
                label="Improvements Made Over the Past Year"
                value={appraisal.improvementsMade}
              />
              <DevBlock
                label="Areas for Development"
                value={appraisal.areasForDevelopment}
              />
              <DevBlock
                label="Actions Planned to Address Development"
                value={appraisal.developmentActions}
              />
            </div>
          </ReportSection>

          {/* Achievements + goals */}
          <div className="grid gap-4 lg:grid-cols-2">
            <ReportSection title="Key Achievements" icon={<Sparkles className="size-4" />}>
              {achievements.length > 0 ? (
                <ol className="space-y-2">
                  {achievements.map((a, i) => (
                    <li key={i} className="flex gap-2 text-sm">
                      <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-blue-100 text-[11px] font-bold text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">
                        {i + 1}
                      </span>
                      <span>{a}</span>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="text-sm italic text-muted-foreground">
                  No achievements recorded.
                </p>
              )}
            </ReportSection>

            <ReportSection title="Goals for Next Period" icon={<Flag className="size-4" />}>
              {goalArr.length > 0 ? (
                <ol className="space-y-3">
                  {goalArr.map((g, i) => (
                    <li key={i} className="text-sm">
                      <div className="flex gap-2">
                        <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-blue-100 text-[11px] font-bold text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">
                          {i + 1}
                        </span>
                        <span className="font-medium">{g}</span>
                      </div>
                      {indicators[i] && (
                        <p className="ml-7 mt-0.5 text-xs text-muted-foreground">
                          Indicator: {indicators[i]}
                        </p>
                      )}
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="text-sm italic text-muted-foreground">
                  No goals recorded.
                </p>
              )}
            </ReportSection>
          </div>
        </div>
      </Main>
    </>
  );
}

function StatTile({
  label,
  value,
  valueCls,
  icon,
  barPct,
}: {
  label: string;
  value: string;
  valueCls?: string;
  icon: React.ReactNode;
  barPct?: number;
}) {
  return (
    <div className="rounded-xl border bg-card p-4 shadow-sm transition-shadow hover:shadow-md">
      <div className="mb-1.5 flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
          {label}
        </span>
        <span className="flex size-7 items-center justify-center rounded-lg bg-blue-50 dark:bg-blue-950/40">
          {icon}
        </span>
      </div>
      <p className={`text-lg font-bold leading-tight ${valueCls ?? ""}`}>
        {value}
      </p>
      {typeof barPct === "number" && (
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-blue-600 transition-all"
            style={{ width: `${Math.min(Math.max(barPct, 0), 100)}%` }}
          />
        </div>
      )}
    </div>
  );
}

function ChartCard({
  title,
  subtitle,
  icon,
  children,
}: {
  title: string;
  subtitle: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border bg-card shadow-sm transition-shadow hover:shadow-md">
      <div className="flex items-center gap-2.5 border-b px-5 py-3.5">
        {icon && (
          <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600 dark:bg-blue-950/40">
            {icon}
          </span>
        )}
        <div>
          <h3 className="text-sm font-semibold leading-tight">{title}</h3>
          <p className="text-xs text-muted-foreground">{subtitle}</p>
        </div>
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

function ReportSection({
  title,
  icon,
  children,
}: {
  title: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border bg-card shadow-sm">
      <div className="flex items-center gap-2 border-b px-6 py-4">
        {icon && <span className="text-blue-600">{icon}</span>}
        <h2 className="font-semibold">{title}</h2>
      </div>
      <div className="px-6 py-5">{children}</div>
    </div>
  );
}

function DevBlock({
  label,
  value,
}: {
  label: string;
  value: string | null | undefined;
}) {
  return (
    <div className="rounded-lg border bg-muted/30 p-3">
      <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="whitespace-pre-wrap text-sm">
        {value || <span className="italic text-muted-foreground">Not recorded.</span>}
      </p>
    </div>
  );
}

function EmptyChart({ label }: { label?: string }) {
  return (
    <div className="flex h-[260px] flex-col items-center justify-center text-center">
      <AlertCircle className="mb-2 size-8 text-muted-foreground/40" />
      <p className="text-sm text-muted-foreground">
        {label ?? "No ratings recorded yet."}
      </p>
    </div>
  );
}
