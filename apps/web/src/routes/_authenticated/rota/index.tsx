import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import { CalendarClock, ArrowLeftRight, AlertTriangle, CheckCircle2, ClipboardList } from "lucide-react";
import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@ndma-dcs-staff-portal/ui/components/card";
import { Skeleton } from "@ndma-dcs-staff-portal/ui/components/skeleton";
import { Badge } from "@ndma-dcs-staff-portal/ui/components/badge";
import { Button } from "@ndma-dcs-staff-portal/ui/components/button";
import { Link } from "@tanstack/react-router";
import { Header } from "@/components/layout/header";
import { Main } from "@/components/layout/main";
import { SchedulingTabs } from "@/components/layout/scheduling-tabs";
import { ThemeSwitch } from "@/components/theme-switch";
import { useTeamFilter } from "@/lib/team-filter";
import { orpc } from "@/utils/orpc";

export const Route = createFileRoute("/_authenticated/rota/")({
  component: RotaPage,
});

const ROLE_LABELS: Record<string, string> = {
  lead_engineer: "Lead Engineer",
  asn_support: "ASN Support",
  core_support: "Core Support",
  enterprise_support: "Enterprise Support",
};

const ROLE_COLORS: Record<string, string> = {
  lead_engineer: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300",
  asn_support: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  core_support: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300",
  enterprise_support: "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300",
};

const REQUIRED_ROLES = ["lead_engineer", "asn_support", "core_support", "enterprise_support"] as const;

function RotaPage() {
  const [showMyOnCall, setShowMyOnCall] = useState(false);
  const { team } = useTeamFilter();
  const { data: current, isLoading: loadingCurrent } = useQuery(
    orpc.rota.getCurrent.queryOptions()
  );
  const { data: upcoming } = useQuery(orpc.rota.getUpcoming.queryOptions());
  const { data: pendingSwaps } = useQuery(
    orpc.rota.swap.list.queryOptions({ input: { status: "pending" as const } })
  );
  const { data: importWarnings } = useQuery(
    orpc.rota.listImportWarnings.queryOptions({ input: { status: "pending" } })
  );
  const { data: overlaySchedules } = useQuery(
    orpc.overlays.list.queryOptions({ input: {} })
  );
  const { data: currentStaff } = useQuery(orpc.staff.me.queryOptions());

  const currentAssignments = useMemo(() => {
    if (!current || team === "NOC") return [];
    if (!showMyOnCall || !currentStaff?.id) return current.assignments;
    return current.assignments.filter((assignment) => assignment.staffProfileId === currentStaff.id);
  }, [current, currentStaff?.id, showMyOnCall, team]);

  const upcomingSchedules = useMemo(() => {
    if (team === "NOC") return [];
    if (!showMyOnCall || !currentStaff?.id) return upcoming ?? [];
    return (upcoming ?? []).map((schedule) => ({
      ...schedule,
      assignments: schedule.assignments.filter((assignment) => assignment.staffProfileId === currentStaff.id),
    }));
  }, [currentStaff?.id, upcoming, showMyOnCall, team]);

  const pendingSwapsVisible = useMemo(() => {
    if (team === "NOC") return [];
    if (!showMyOnCall || !currentStaff?.id) return pendingSwaps ?? [];
    return (pendingSwaps ?? []).filter(
      (swap) =>
        swap.requester?.id === currentStaff.id ||
        swap.target?.id === currentStaff.id ||
        swap.assignment?.staffProfileId === currentStaff.id,
    );
  }, [currentStaff?.id, pendingSwaps, showMyOnCall, team]);

  return (
    <>
      <Header fixed>
        <div className="flex items-center gap-2">
          <CalendarClock className="size-4 text-muted-foreground" />
          <span className="text-sm font-medium">On-Call Roster</span>
        </div>
        <div className="ms-auto flex items-center gap-2">
          <ThemeSwitch />
        </div>
      </Header>

      <Main>
        <SchedulingTabs scope="dcs" />

        <div className="mb-6">
          <h1 className="text-2xl font-bold tracking-tight">On-Call Roster</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Current and upcoming on-call assignments.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Link to="/rota/planner">
            <Button size="sm">Edit Roster</Button>
          </Link>
          <Link to="/rota/planner">
            <Button variant="outline" size="sm">
              <CalendarClock className="mr-1.5 size-3.5" />
              Planner
            </Button>
          </Link>
          <Link to="/rota/swaps">
            <Button variant="outline" size="sm">
              <ArrowLeftRight className="mr-1.5 size-3.5" />
              Swaps
            </Button>
          </Link>
          <Button
            variant={showMyOnCall ? "default" : "outline"}
            size="sm"
            onClick={() => setShowMyOnCall((value) => !value)}
          >
            My On-Call
          </Button>
        </div>

        {/* Current Week */}
        <div className="mb-8">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
            This Week
          </h2>

          {loadingCurrent ? (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-20 w-full rounded-lg" />
              ))}
            </div>
          ) : !current || team === "NOC" ? (
            <div className="rounded-xl border border-dashed p-8 text-center text-muted-foreground text-sm">
              {team === "NOC"
                ? "Switch the department filter to DCS to view on-call assignments."
                : "No published schedule for this week."}
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                {REQUIRED_ROLES.map((role) => {
                  const assignment = currentAssignments.find((a) => a.role === role);
                  const acknowledged = !!(assignment as Record<string, unknown>)?.acknowledgedAt;
                  return (
                    <Card key={role} className="p-3">
                      <CardContent className="p-0">
                        <div className="flex items-start justify-between mb-2">
                          <span
                            className={`inline-flex items-center rounded-lg px-2 py-0.5 text-xs font-medium ${ROLE_COLORS[role]}`}
                          >
                            {ROLE_LABELS[role]}
                          </span>
                          {assignment && (
                            acknowledged ? (
                              <CheckCircle2 className="size-3.5 text-green-500 mt-0.5" />
                            ) : (
                              <span className="text-xs text-amber-500 font-medium">Pending ACK</span>
                            )
                          )}
                        </div>
                        <p className="font-semibold text-sm">
                          {assignment?.staffProfile?.user?.name ?? (
                            <span className="text-muted-foreground italic">Unassigned</span>
                          )}
                        </p>
                        {assignment?.staffProfile?.department && (
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {assignment.staffProfile.department.name}
                          </p>
                        )}
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                {format(parseISO(current.weekStart), "dd MMM")} –{" "}
                {format(parseISO(current.weekEnd), "dd MMM yyyy")}
              </p>
            </>
          )}
        </div>

        {/* Upcoming Schedules */}
        {upcomingSchedules && upcomingSchedules.length > 0 && team !== "NOC" && (
          <div className="mb-8">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
              Upcoming Weeks
            </h2>
            <div className="space-y-2">
              {upcomingSchedules.map((schedule) => (
                <div
                  key={schedule.id}
                  className="rounded-xl border px-4 py-3 flex items-center justify-between"
                >
                  <div>
                    <p className="text-sm font-medium">
                      Week of {format(parseISO(schedule.weekStart), "dd MMM yyyy")}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {schedule.assignments.length} / 4 roles filled
                    </p>
                  </div>
                  <span className="text-xs bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300 rounded-lg px-2 py-0.5">
                    Published
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Pending Swaps */}
        {pendingSwapsVisible && pendingSwapsVisible.length > 0 && team !== "NOC" && (
          <div className="mb-8">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-2">
              <ArrowLeftRight className="size-3.5" />
              Pending Swap Requests ({pendingSwapsVisible.length})
            </h2>
            <div className="space-y-2">
              {pendingSwapsVisible.map((swap) => (
                <div key={swap.id} className="rounded-xl border px-4 py-3">
                  <p className="text-sm">
                    <span className="font-medium">{swap.requester?.user?.name}</span>
                    {" → "}
                    <span className="font-medium">{swap.target?.user?.name}</span>
                  </p>
                  {swap.assignment && (
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {swap.assignment.schedule?.weekStart &&
                        format(parseISO(swap.assignment.schedule.weekStart), "dd MMM")}
                      {" — "}
                      {ROLE_LABELS[swap.assignment.role] ?? swap.assignment.role}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Import Warnings — flagged ambiguous entries from legacy spreadsheet */}
        {importWarnings && importWarnings.length > 0 && (
          <div className="mb-8">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-2">
              <AlertTriangle className="size-3.5 text-amber-500" />
              Import Warnings ({importWarnings.length})
            </h2>
            <div className="space-y-2">
              {importWarnings.map((w) => {
                const warn = w as unknown as { role: string; rawValue: string; weekStart: string; weekEnd: string };
                return (
                <div key={w.id} className="rounded-xl border border-amber-200 bg-amber-50 dark:bg-amber-950/20 px-4 py-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-medium">
                        {ROLE_LABELS[warn.role] ?? warn.role}
                        {" — "}
                        <span className="text-amber-700 dark:text-amber-400">&ldquo;{warn.rawValue}&rdquo;</span>
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Week {warn.weekStart} – {warn.weekEnd}
                      </p>
                    </div>
                    <Badge variant="outline" className="text-amber-600 border-amber-300 shrink-0">
                      Needs Review
                    </Badge>
                  </div>
                </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Operational Overlays — quarterly duties */}
        {overlaySchedules && overlaySchedules.length > 0 && (
          <div>
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-2">
              <ClipboardList className="size-3.5" />
              Operational Overlays
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {overlaySchedules.slice(0, 4).map((schedule) => {
                const s = schedule as unknown as {
                  overlayType?: { name: string };
                  quarter: string;
                  year: string;
                  assignments: Array<{
                    staffProfile?: { user?: { name?: string } };
                    externalLabel?: string;
                  }>;
                  tasks?: unknown[];
                };
                return (
                <Card key={schedule.id}>
                  <CardHeader className="pb-2 pt-4 px-4">
                    <CardTitle className="text-sm font-medium">
                      {s.overlayType?.name}
                      <span className="text-muted-foreground font-normal ml-1">
                        {s.quarter} {s.year}
                      </span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="px-4 pb-4">
                    {s.assignments?.length ? (
                      <div className="flex flex-wrap gap-1">
                        {s.assignments.map((a, i) => (
                          <span key={i} className="text-xs bg-muted px-2 py-0.5 rounded-full">
                            {a.staffProfile?.user?.name ?? a.externalLabel ?? "—"}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground italic">No assignees</p>
                    )}
                    <p className="text-xs text-muted-foreground mt-2">
                      {s.tasks?.length ?? 0} tasks
                    </p>
                  </CardContent>
                </Card>
                );
              })}
            </div>
          </div>
        )}
      </Main>
    </>
  );
}
