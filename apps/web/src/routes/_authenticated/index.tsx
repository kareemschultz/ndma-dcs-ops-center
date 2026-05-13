import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { format, startOfISOWeek, endOfISOWeek } from "date-fns";
import {
  AlertCircle,
  AlertTriangle,
  BarChart2,
  CalendarClock,
  CalendarOff,
  CheckCircle,
  CheckCircle2,
  ClipboardCheck,
  ClipboardList,
  LayoutDashboard,
  RefreshCw,
  ShoppingCart,
  Users,
  Wrench,
  XCircle,
  AlertOctagon,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@ndma-dcs-staff-portal/ui/components/card";
import { Skeleton } from "@ndma-dcs-staff-portal/ui/components/skeleton";
import { Header } from "@/components/layout/header";
import { Main } from "@/components/layout/main";
import { ThemeSwitch } from "@/components/theme-switch";
import { NotificationBell } from "@/components/notification-bell";
import { orpc } from "@/utils/orpc";
import { authClient } from "@/lib/auth-client";

export const Route = createFileRoute("/_authenticated/")({
  component: DashboardPage,
});

// ── Readiness indicator ────────────────────────────────────────────────────

const READINESS_CONFIG = {
  green: {
    label: "All Systems Operational",
    dot: "bg-blue-500",
    text: "text-blue-600 dark:text-blue-400",
    ring: "ring-blue-500/30",
    icon: CheckCircle,
  },
  amber: {
    label: "Minor Issues Detected",
    dot: "bg-amber-500",
    text: "text-amber-600 dark:text-amber-400",
    ring: "ring-amber-500/30",
    icon: AlertTriangle,
  },
  red: {
    label: "Attention Required",
    dot: "bg-red-500",
    text: "text-red-600 dark:text-red-400",
    ring: "ring-red-500/30",
    icon: XCircle,
  },
} as const;

// ── Activity label formatter ───────────────────────────────────────────────

function friendlyAction(action: string, resourceType: string): string {
  const verb = action.split(".").at(-1) ?? action;
  const resource = resourceType.replace(/_/g, " ");
  const verbMap: Record<string, string> = {
    create: "created",
    update: "updated",
    delete: "deleted",
    approve: "approved",
    reject: "rejected",
    publish: "published",
    assign: "assigned",
    remove: "removed",
    add: "added",
    acknowledge: "acknowledged",
  };
  return `${verbMap[verb] ?? verb} a ${resource}`;
}

// ── Dashboard page ─────────────────────────────────────────────────────────

function isoWeekBounds() {
  const now = new Date();
  return {
    weekStart: format(startOfISOWeek(now), "yyyy-MM-dd"),
    weekEnd: format(endOfISOWeek(now), "yyyy-MM-dd"),
  };
}

function DashboardPage() {
  const { data: session } = authClient.useSession();
  const userRole = (session?.user as Record<string, unknown> | undefined)?.role as string | undefined;
  const canSeeOpsReadiness = !!userRole && userRole !== "staff";
  const canSeeAuditActivity = !!userRole && ["admin", "hrAdminOps", "readOnly"].includes(userRole);

  const { data, isLoading } = useQuery(orpc.dashboard.main.queryOptions());
  const { data: readiness, isLoading: readinessLoading } = useQuery({
    ...orpc.dashboard.opsReadiness.queryOptions(),
    enabled: canSeeOpsReadiness,
  });
  const { data: activity, isLoading: activityLoading } = useQuery({
    ...orpc.dashboard.recentActivity.queryOptions({ input: { limit: 10 } }),
    enabled: canSeeAuditActivity,
  });

  const { weekStart, weekEnd } = isoWeekBounds();

  const { data: cycles, isLoading: cyclesLoading } = useQuery(
    orpc.cycles.list.queryOptions({ input: { status: "active", limit: 5 } })
  );
  const { data: workload, isLoading: workloadLoading } = useQuery(
    orpc.workload.get.queryOptions({ input: { weekStart, weekEnd } })
  );
  const { data: currentRota } = useQuery(orpc.rota.getCurrent.queryOptions());
  const { data: overlaySchedules } = useQuery(
    orpc.overlays.list.queryOptions({ input: {} })
  );

  const onCallCount = data?.currentSchedule?.assignments?.length ?? 0;

  // KPI card definitions — values resolved once data arrives
  const kpiCards = [
    {
      title: "Active Staff",
      value: data?.activeStaff,
      sub: "active staff members",
      icon: Users,
      color: "text-blue-500",
      bg: "bg-blue-500/10",
      href: "/staff",
    },
    {
      title: "On Leave Today",
      value: data?.onLeaveToday,
      sub: "approved leave today",
      icon: CalendarOff,
      color: "text-red-500",
      bg: "bg-red-500/10",
      href: "/leave",
    },
    {
      title: "On Call Today",
      value: onCallCount,
      sub: "staff assigned on call",
      icon: CalendarClock,
      color: "text-blue-500",
      bg: "bg-blue-500/10",
      href: "/rota",
    },
    {
      title: "Active Incidents",
      value: data?.activeIncidents,
      sub: "unresolved incidents",
      icon: AlertTriangle,
      color: "text-rose-600",
      bg: "bg-rose-500/10",
      href: "/incidents",
    },
    {
      title: "Open Work Items",
      value: data?.openWorkItems,
      sub: "items in progress",
      icon: ClipboardCheck,
      color: "text-indigo-500",
      bg: "bg-indigo-500/10",
      href: "/work",
    },
    {
      title: "Pending PRs",
      value: data?.pendingPRs,
      sub: "awaiting approval",
      icon: ShoppingCart,
      color: "text-amber-500",
      bg: "bg-amber-500/10",
      href: "/procurement",
    },
    {
      title: "Overdue Changes",
      value: data?.overdueChanges,
      sub: "temp changes past removal date",
      icon: Wrench,
      color: "text-orange-500",
      bg: "bg-orange-500/10",
      href: "/changes",
    },
    {
      title: "Overdue Work",
      value: data?.overdueWorkItems,
      sub: "past due date",
      icon: AlertCircle,
      color: "text-red-500",
      bg: "bg-red-500/10",
      href: "/work",
    },
  ] as const;

  const readinessCfg =
    readiness?.readinessStatus
      ? READINESS_CONFIG[
          readiness.readinessStatus as keyof typeof READINESS_CONFIG
        ]
      : null;

  return (
    <>
      <Header fixed>
        <div className="ms-auto flex items-center gap-2">
          <NotificationBell />
          <ThemeSwitch />
        </div>
      </Header>

      <Main>
        {/* Page heading */}
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
              <LayoutDashboard className="size-6" />
              DCS Ops Center
            </h1>
            <p className="text-sm text-muted-foreground">
              Data Centre Services — operational overview
            </p>
          </div>

          {/* Ops Readiness traffic light */}
          {readinessLoading ? (
            <Skeleton className="h-9 w-52 rounded-full" />
          ) : readinessCfg ? (
            <Link
              to="/ops-readiness"
              className={`inline-flex items-center gap-2 rounded-full border px-4 py-1.5 text-sm font-medium ring-2 ${readinessCfg.ring} hover:opacity-80 transition-opacity`}
            >
              <span
                className={`size-2.5 rounded-full ${readinessCfg.dot} animate-pulse`}
              />
              <span className={readinessCfg.text}>{readinessCfg.label}</span>
            </Link>
          ) : null}
        </div>

        {/* KPI grid */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {kpiCards.map((card) => (
            <Link key={card.title} to={card.href}>
              <Card className="hover:border-primary/50 transition-colors cursor-pointer">
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium">
                    {card.title}
                  </CardTitle>
                  <div className={`rounded-xl p-1.5 ${card.bg}`}>
                    <card.icon className={`size-4 ${card.color}`} />
                  </div>
                </CardHeader>
                <CardContent>
                  {isLoading ? (
                    <>
                      <Skeleton className="h-8 w-16 mb-1" />
                      <Skeleton className="h-3 w-28" />
                    </>
                  ) : (
                    <>
                      <div className="text-2xl font-bold">
                        {card.value ?? 0}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {card.sub}
                      </p>
                    </>
                  )}
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>

        {/* Bottom section: Recent Activity + Readiness detail */}
        <div className="mt-6 grid gap-6 lg:grid-cols-3">
          {/* Recent Activity feed — takes 2 columns */}
          <Card className="lg:col-span-2">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Recent Activity</CardTitle>
            </CardHeader>
            <CardContent className="space-y-0 divide-y">
              {activityLoading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="flex items-start gap-3 py-3">
                    <Skeleton className="size-8 rounded-full shrink-0" />
                    <div className="flex-1 space-y-1.5">
                      <Skeleton className="h-3.5 w-48" />
                      <Skeleton className="h-3 w-24" />
                    </div>
                  </div>
                ))
              ) : !activity?.length ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  No recent activity.
                </p>
              ) : (
                activity.slice(0, 8).map((entry) => (
                  <div key={entry.id} className="flex items-start gap-3 py-3">
                    {/* Avatar circle with initials */}
                    <div className="size-8 rounded-full bg-muted flex items-center justify-center text-xs font-semibold shrink-0">
                      {entry.actorName
                        ?.split(" ")
                        .map((n) => n[0])
                        .join("")
                        .slice(0, 2)
                        .toUpperCase() ?? "?"}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm leading-snug">
                        <span className="font-medium">{entry.actorName}</span>{" "}
                        <span className="text-muted-foreground">
                          {friendlyAction(
                            entry.action,
                            entry.resourceType ?? ""
                          )}
                        </span>
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {format(new Date(entry.createdAt), "dd MMM HH:mm")}
                      </p>
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          {/* Readiness detail panel */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                {readinessCfg ? (
                  <readinessCfg.icon
                    className={`size-4 ${readinessCfg.text}`}
                  />
                ) : (
                  <AlertOctagon className="size-4 text-muted-foreground" />
                )}
                Ops Readiness
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {readinessLoading ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-5 w-full" />
                ))
              ) : readiness ? (
                <>
                  <ReadinessRow
                    label="On-Call coverage"
                    ok={readiness.onCallComplete}
                  />
                  <ReadinessRow
                    label="Critical incidents"
                    ok={readiness.criticalIncidents === 0}
                    detail={
                      readiness.criticalIncidents > 0
                        ? `${readiness.criticalIncidents} open`
                        : "None"
                    }
                  />
                  <ReadinessRow
                    label="High-priority overdue work"
                    ok={readiness.highOverdueWork === 0}
                    detail={
                      readiness.highOverdueWork > 0
                        ? `${readiness.highOverdueWork} items`
                        : "None"
                    }
                  />
                  <ReadinessRow
                    label="Overdue changes"
                    ok={readiness.overdueChanges === 0}
                    detail={
                      readiness.overdueChanges > 0
                        ? `${readiness.overdueChanges} pending removal`
                        : "None"
                    }
                  />
                  <Link
                    to="/ops-readiness"
                    className="mt-2 block text-center text-xs font-medium text-primary hover:underline"
                  >
                    View full readiness report →
                  </Link>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Readiness data unavailable.
                </p>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Active Cycles + Workload Imbalance widgets */}
        <div className="mt-6 grid gap-6 lg:grid-cols-2">

          {/* Active Cycles */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <RefreshCw className="size-4 text-indigo-500" />
                Active Cycles
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-0 divide-y">
              {cyclesLoading ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="py-3 space-y-1.5">
                    <Skeleton className="h-3.5 w-40" />
                    <Skeleton className="h-2 w-full rounded-full" />
                    <Skeleton className="h-3 w-28" />
                  </div>
                ))
              ) : !cycles?.length ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  No active cycles.
                </p>
              ) : (
                cycles.map((cycle) => {
                  const total = cycle.cycleWorkItems?.length ?? 0;
                  const done = cycle.cycleWorkItems?.filter(
                    (cwi) => cwi.workItem?.status === "done"
                  ).length ?? 0;
                  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
                  return (
                    <div key={cycle.id} className="py-3">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-medium truncate max-w-[60%]">
                          {cycle.name}
                        </span>
                        <span className="text-xs text-muted-foreground shrink-0 capitalize">
                          {cycle.period}
                        </span>
                      </div>
                      <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                        <div
                          className="h-full rounded-full bg-indigo-500 transition-all"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <div className="flex items-center justify-between mt-1">
                        <span className="text-xs text-muted-foreground">
                          {done}/{total} items · {pct}%
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {format(new Date(cycle.startDate), "d MMM")} –{" "}
                          {format(new Date(cycle.endDate), "d MMM")}
                        </span>
                      </div>
                    </div>
                  );
                })
              )}
            </CardContent>
          </Card>

          {/* Workload Imbalance */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <BarChart2 className="size-4 text-amber-500" />
                Workload Imbalance
                <span className="ml-auto text-xs font-normal text-muted-foreground">
                  {weekStart} – {weekEnd}
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {workloadLoading ? (
                <div className="grid grid-cols-2 gap-4">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <Skeleton key={i} className="h-6 w-full" />
                  ))}
                </div>
              ) : !workload?.length ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  No workload data for this week.
                </p>
              ) : (
                <div className="grid grid-cols-2 gap-x-6 gap-y-1">
                  <div>
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-red-600 dark:text-red-400">
                      Overloaded
                    </p>
                    {workload.filter((e) => e.loadLevel === "overloaded").length === 0 ? (
                      <p className="text-xs text-muted-foreground">None</p>
                    ) : (
                      workload
                        .filter((e) => e.loadLevel === "overloaded")
                        .map((e) => (
                          <div key={e.staff.id} className="flex items-center justify-between py-0.5">
                            <span className="text-sm truncate">{e.staff.name}</span>
                            <span className="ml-2 shrink-0 rounded-full bg-red-100 px-1.5 py-0.5 text-xs font-medium text-red-700 dark:bg-red-900/30 dark:text-red-400">
                              {e.loadScore}
                            </span>
                          </div>
                        ))
                    )}
                  </div>
                  <div>
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-amber-600 dark:text-amber-400">
                      Low Load
                    </p>
                    {workload.filter((e) => e.loadLevel === "low").length === 0 ? (
                      <p className="text-xs text-muted-foreground">None</p>
                    ) : (
                      workload
                        .filter((e) => e.loadLevel === "low")
                        .map((e) => (
                          <div key={e.staff.id} className="flex items-center justify-between py-0.5">
                            <span className="text-sm truncate">{e.staff.name}</span>
                            <span className="ml-2 shrink-0 rounded-full bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                              {e.openWorkItems}
                            </span>
                          </div>
                        ))
                    )}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

        </div>

        {/* On-Call ACK + Operational Overlays */}
        <div className="mt-6 grid gap-6 lg:grid-cols-2">

          {/* On-Call Acknowledgement Status */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <CalendarClock className="size-4 text-blue-500" />
                On-Call ACK — This Week
              </CardTitle>
            </CardHeader>
            <CardContent>
              {!currentRota ? (
                <p className="py-4 text-center text-sm text-muted-foreground">
                  No roster published for this week.
                </p>
              ) : (
                <div className="space-y-2">
                  {(["lead_engineer", "asn_support", "core_support", "enterprise_support"] as const).map((role) => {
                    const assignment = currentRota.assignments.find((a) => a.role === role);
                    const acked = !!(assignment as Record<string, unknown> | undefined)?.acknowledgedAt;
                    const roleLabels: Record<string, string> = {
                      lead_engineer: "Lead Engineer",
                      asn_support: "ASN Support",
                      core_support: "Core Support",
                      enterprise_support: "Enterprise Support",
                    };
                    return (
                      <div key={role} className="flex items-center justify-between text-sm">
                        <div>
                          <span className="font-medium">{roleLabels[role]}</span>
                          {assignment?.staffProfile?.user?.name && (
                            <span className="text-muted-foreground ml-2 text-xs">
                              {assignment.staffProfile.user.name}
                            </span>
                          )}
                        </div>
                        {!assignment ? (
                          <span className="text-xs text-muted-foreground italic">Unassigned</span>
                        ) : acked ? (
                          <span className="flex items-center gap-1 text-xs font-medium text-blue-600 dark:text-blue-400">
                            <CheckCircle2 className="size-3.5" /> Acknowledged
                          </span>
                        ) : (
                          <span className="text-xs font-medium text-amber-600 dark:text-amber-400">
                            Pending ACK
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Operational Overlays — current quarter */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <ClipboardList className="size-4 text-purple-500" />
                Operational Overlays
              </CardTitle>
            </CardHeader>
            <CardContent>
              {!overlaySchedules || overlaySchedules.length === 0 ? (
                <p className="py-4 text-center text-sm text-muted-foreground">
                  No operational overlays scheduled.
                </p>
              ) : (
                <div className="space-y-3">
                  {overlaySchedules.slice(0, 3).map((schedule) => {
                    const s = schedule as unknown as {
                      overlayType?: { name: string };
                      quarter: string;
                      year: string;
                      assignments: Array<{
                        staffProfile?: { user?: { name?: string } };
                        externalLabel?: string;
                      }>;
                      tasks?: Array<{ status: string }>;
                    };
                    const totalTasks = s.tasks?.length ?? 0;
                    const doneTasks = s.tasks?.filter((t) => t.status === "completed").length ?? 0;
                    const pct = totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0;
                    return (
                      <div key={schedule.id} className="space-y-1">
                        <div className="flex items-center justify-between text-sm">
                          <span className="font-medium truncate max-w-[60%]">
                            {s.overlayType?.name ?? "Overlay"}
                          </span>
                          <span className="text-xs text-muted-foreground shrink-0">
                            {s.quarter} {s.year}
                          </span>
                        </div>
                        {s.assignments?.length > 0 && (
                          <p className="text-xs text-muted-foreground">
                            {s.assignments
                              .map((a) => a.staffProfile?.user?.name ?? a.externalLabel ?? "—")
                              .join(", ")}
                          </p>
                        )}
                        <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                          <div
                            className="h-full rounded-full bg-purple-500 transition-all"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {doneTasks}/{totalTasks} tasks · {pct}%
                        </p>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

        </div>
      </Main>
    </>
  );
}

// ── Readiness row sub-component ────────────────────────────────────────────

function ReadinessRow({
  label,
  ok,
  detail,
}: {
  label: string;
  ok: boolean;
  detail?: string;
}) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span
        className={`flex items-center gap-1 font-medium ${
          ok
            ? "text-blue-600 dark:text-blue-400"
            : "text-red-600 dark:text-red-400"
        }`}
      >
        {ok ? (
          <CheckCircle className="size-3.5" />
        ) : (
          <XCircle className="size-3.5" />
        )}
        {detail ?? (ok ? "OK" : "Issue")}
      </span>
    </div>
  );
}
