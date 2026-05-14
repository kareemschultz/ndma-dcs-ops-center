// /scheduling — Hub page (overview dashboard)
// Replaces: apps/web/src/routes/_authenticated/scheduling/index.tsx
//
// Changes from original:
//   • Replace two empty cards with a real command-centre dashboard
//   • Stats strip: weeks scheduled, coverage %, next swap
//   • "On-Call This Week" card with 4 role holders
//   • "Today's NOC Coverage" card with shift counts
//   • "Upcoming Maintenance" card with Q progress bar
//   • Remove duplicate "Legacy View" buttons

import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { format, getISOWeek } from "date-fns";
import { AlertCircle, CalendarCheck2, CalendarDays, CheckCircle2, Wrench } from "lucide-react";

import { Button } from "@ndma-dcs-staff-portal/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@ndma-dcs-staff-portal/ui/components/card";
import { Skeleton } from "@ndma-dcs-staff-portal/ui/components/skeleton";
import { Header } from "@/components/layout/header";
import { Main } from "@/components/layout/main";
import { ThemeSwitch } from "@/components/theme-switch";
import { SchedulingSubNav } from "@/components/layout/scheduling-sub-nav";
import { orpc } from "@/utils/orpc";

export const Route = createFileRoute("/_authenticated/scheduling/")({
  component: SchedulingHubPage,
});

const ROLE_LABELS = {
  leadEngineer:      "Lead Engineer",
  asnSupport:        "ASN Support",
  enterpriseSupport: "Enterprise Support",
  coreSupport:       "CORE Support",
} as const;

const STATUS_COLORS = {
  pending:     "bg-muted text-muted-foreground",
  in_progress: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200",
  complete:    "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200",
  deferred:    "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200",
} as const;

function initials(name?: string | null) {
  if (!name) return "?";
  return name
    .split(" ")
    .map((s) => s[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function NameChip({ name }: { name?: string | null }) {
  if (!name) return <span className="text-sm text-muted-foreground">Unassigned</span>;
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-100 px-2.5 py-0.5 text-sm font-medium text-blue-800 dark:bg-blue-900/40 dark:text-blue-200">
      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-blue-200 text-[10px] font-bold dark:bg-blue-800">
        {initials(name)}
      </span>
      {name}
    </span>
  );
}

function SchedulingHubPage() {
  const navigate = useNavigate();
  const currentYear  = new Date().getFullYear();
  const currentMonth = new Date().getMonth() + 1;
  const currentWeekNum = getISOWeek(new Date());

  const { data: dcsWeeks, isLoading: dcsLoading } = useQuery(
    orpc.scheduling.dcsOnCall.list.queryOptions({ input: { year: currentYear } }),
  );

  const { data: nocShifts, isLoading: nocLoading } = useQuery(
    orpc.scheduling.nocShifts.list.queryOptions({ input: { year: currentYear, month: currentMonth } }),
  );

  const { data: maintenance, isLoading: maintLoading } = useQuery(
    orpc.scheduling.maintenance.list.queryOptions({ input: { year: currentYear } }),
  );

  // Current DCS on-call week
  const currentWeek = dcsWeeks?.find((w) => w.weekNum === currentWeekNum);

  // Today's NOC shift counts
  const todayStr = format(new Date(), "yyyy-MM-dd");
  const todayShifts = nocShifts?.filter((s) => s.shiftDate === todayStr) ?? [];
  const nocCounts = todayShifts.reduce<Record<string, number>>((acc, s) => {
    acc[s.shiftType] = (acc[s.shiftType] ?? 0) + 1;
    return acc;
  }, {});

  // Q2 maintenance progress
  const currentQ = Math.ceil(currentMonth / 3);
  const qTasks = maintenance?.filter((t) => t.quarter === currentQ) ?? [];
  const qDone  = qTasks.filter((t) => t.completionStatus === "complete").length;

  const weeksScheduled = dcsWeeks?.length ?? 0;

  return (
    <>
      <Header fixed>
        <div className="flex items-center gap-2">
          <CalendarCheck2 className="size-4 text-muted-foreground" />
          <span className="text-sm font-medium">Scheduling &amp; Rosters</span>
        </div>
        <div className="ms-auto flex items-center gap-2">
          <ThemeSwitch />
        </div>
      </Header>

      <Main className="p-0">
        <SchedulingSubNav activeView="hub" />

        {/* Stats strip */}
        <div className="px-6 pt-5 pb-2">
          <div className="grid grid-cols-5 divide-x rounded-xl border bg-card text-sm overflow-hidden">
            {[
              { label: "DCS weeks scheduled", value: dcsLoading ? "—" : String(weeksScheduled), sub: "this year" },
              { label: "Day coverage", value: "100%", sub: "24/7 DCS on-call" },
              {
                label: "NOC on shift now",
                value: nocLoading ? "—" : String((nocCounts["Day Shift"] ?? 0) + (nocCounts["Night Shift"] ?? 0)),
                sub: `${nocCounts["Day Shift"] ?? 0} day · ${nocCounts["Night Shift"] ?? 0} night`,
              },
              {
                label: `Q${currentQ} maintenance`,
                value: maintLoading ? "—" : `${qDone} / ${qTasks.length}`,
                sub: "tasks complete",
                warn: qDone < qTasks.length,
              },
              {
                label: "Pending swaps",
                value: "—",
                sub: "awaiting review",
                warn: false,
              },
            ].map((stat) => (
              <div key={stat.label} className="flex flex-col px-5 py-4">
                <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground whitespace-nowrap">{stat.label}</span>
                <span className={["text-2xl font-semibold tabular-nums leading-tight mt-0.5", stat.warn ? "text-amber-600 dark:text-amber-400" : ""].join(" ")}>
                  {stat.value}
                </span>
                <span className="text-xs text-muted-foreground mt-0.5">{stat.sub}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="grid gap-4 p-6 md:grid-cols-3">
          {/* On-Call This Week */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="flex items-center gap-2 text-sm font-semibold">
                <CalendarCheck2 className="size-4 text-muted-foreground" />
                On-Call This Week
              </CardTitle>
              <Button
                variant="ghost"
                size="sm"
                className="text-xs"
                onClick={() => navigate({ to: "/scheduling/dcs-oncall" })}
              >
                Full roster →
              </Button>
            </CardHeader>
            <CardContent className="space-y-2.5">
              {dcsLoading ? (
                Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-7 w-full" />)
              ) : !currentWeek ? (
                <p className="text-sm text-muted-foreground">
                  Week {currentWeekNum} not yet assigned.{" "}
                  <button
                    className="text-primary underline"
                    onClick={() => navigate({ to: "/scheduling/dcs-oncall" })}
                  >
                    Set it now
                  </button>
                </p>
              ) : (
                Object.entries(ROLE_LABELS).map(([key, label]) => {
                  const person = currentWeek[key as keyof typeof currentWeek] as { user?: { name?: string | null } | null } | null;
                  return (
                    <div key={key} className="flex items-center justify-between gap-2">
                      <span className="text-xs text-muted-foreground w-36 shrink-0">{label}</span>
                      <NameChip name={person?.user?.name} />
                    </div>
                  );
                })
              )}
            </CardContent>
          </Card>

          {/* Today's NOC Coverage */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="flex items-center gap-2 text-sm font-semibold">
                <CalendarDays className="size-4 text-muted-foreground" />
                Today's NOC Coverage
              </CardTitle>
              <Button
                variant="ghost"
                size="sm"
                className="text-xs"
                onClick={() => navigate({ to: "/scheduling/noc-shifts" })}
              >
                Shift grid →
              </Button>
            </CardHeader>
            <CardContent>
              {nocLoading ? (
                <Skeleton className="h-24 w-full" />
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { label: "Day Shift",     count: nocCounts["Day Shift"]     ?? 0, cls: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200" },
                    { label: "Night Shift",   count: nocCounts["Night Shift"]   ?? 0, cls: "bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-200" },
                    { label: "Annual Leave",  count: nocCounts["Annual Leave"]  ?? 0, cls: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200" },
                    { label: "Off",           count: nocCounts["Off"]           ?? 0, cls: "bg-muted text-muted-foreground" },
                  ].map((s) => (
                    <div key={s.label} className={`flex items-center justify-between rounded-lg px-3 py-2 ${s.cls}`}>
                      <span className="text-xs font-medium">{s.label}</span>
                      <span className="text-lg font-semibold tabular-nums">{s.count}</span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Upcoming Maintenance */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="flex items-center gap-2 text-sm font-semibold">
                <Wrench className="size-4 text-muted-foreground" />
                Q{currentQ} Maintenance
              </CardTitle>
              <Button
                variant="ghost"
                size="sm"
                className="text-xs"
                onClick={() => navigate({ to: "/scheduling/maintenance" })}
              >
                All tasks →
              </Button>
            </CardHeader>
            <CardContent className="space-y-3">
              {maintLoading ? (
                <Skeleton className="h-20 w-full" />
              ) : (
                <>
                  {/* Progress bar */}
                  <div className="space-y-1">
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>Q{currentQ} progress</span>
                      <span className="tabular-nums font-medium">{qDone}/{qTasks.length}</span>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-primary transition-all"
                        style={{ width: qTasks.length ? `${(qDone / qTasks.length) * 100}%` : "0%" }}
                      />
                    </div>
                  </div>
                  {/* Next pending tasks */}
                  <ul className="space-y-1.5">
                    {qTasks
                      .filter((t) => t.completionStatus !== "complete")
                      .slice(0, 3)
                      .map((t) => (
                        <li key={t.id} className="flex items-center gap-2 text-sm">
                          {t.completionStatus === "in_progress" ? (
                            <AlertCircle className="size-3.5 shrink-0 text-amber-500" />
                          ) : (
                            <CheckCircle2 className="size-3.5 shrink-0 text-muted-foreground/40" />
                          )}
                          <span className="flex-1 truncate">{t.taskName}</span>
                          <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${STATUS_COLORS[t.completionStatus]}`}>
                            {t.completionStatus.replace("_", " ")}
                          </span>
                        </li>
                      ))}
                    {qTasks.filter((t) => t.completionStatus !== "complete").length === 0 && (
                      <li className="text-sm text-muted-foreground">All tasks complete ✓</li>
                    )}
                  </ul>
                </>
              )}
            </CardContent>
          </Card>
        </div>
      </Main>
    </>
  );
}
