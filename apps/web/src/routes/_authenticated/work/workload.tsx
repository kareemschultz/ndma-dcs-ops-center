import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  AlertCircle,
  CalendarOff,
  ChevronLeft,
  ChevronRight,
  Loader2,
  RefreshCw,
  Users,
} from "lucide-react";
import { format, startOfWeek, endOfWeek, addWeeks, subWeeks } from "date-fns";
import { Button } from "@ndma-dcs-staff-portal/ui/components/button";
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
import { orpc } from "@/utils/orpc";

export const Route = createFileRoute("/_authenticated/work/workload")({
  component: WorkloadPage,
});

// ── Types ───────────────────────────────────────────────────────────────────

type LoadLevel = "low" | "medium" | "high" | "overloaded";

type WorkloadEntry = {
  staff: {
    id: string;
    name: string;
    email: string;
    department: string | null;
  };
  openWorkItems: number;
  overdueWorkItems: number;
  onCallRole: string | null;
  onLeave: boolean;
  overdueChanges: number;
  loadScore: number;
  loadLevel: LoadLevel;
};

// ── Helpers ────────────────────────────────────────────────────────────────

const LOAD_CONFIG: Record<
  LoadLevel,
  { label: string; bg: string; text: string; border: string; bar: string }
> = {
  low: {
    label: "Low",
    bg: "bg-blue-50 dark:bg-blue-950/20",
    text: "text-blue-700 dark:text-blue-300",
    border: "border-blue-200 dark:border-blue-800",
    bar: "bg-blue-400",
  },
  medium: {
    label: "Medium",
    bg: "bg-amber-50 dark:bg-amber-950/20",
    text: "text-amber-700 dark:text-amber-300",
    border: "border-amber-200 dark:border-amber-800",
    bar: "bg-amber-400",
  },
  high: {
    label: "High",
    bg: "bg-orange-50 dark:bg-orange-950/20",
    text: "text-orange-700 dark:text-orange-300",
    border: "border-orange-200 dark:border-orange-800",
    bar: "bg-orange-400",
  },
  overloaded: {
    label: "Overloaded",
    bg: "bg-red-50 dark:bg-red-950/20",
    text: "text-red-700 dark:text-red-300",
    border: "border-red-200 dark:border-red-800",
    bar: "bg-red-500",
  },
};

// Max score for bar width normalization (overloaded threshold is 12)
const MAX_SCORE_DISPLAY = 20;

function formatISODate(date: Date) {
  return date.toISOString().slice(0, 10);
}

// ── Engineer Card ──────────────────────────────────────────────────────────

function EngineerCard({ entry }: { entry: WorkloadEntry }) {
  const cfg = LOAD_CONFIG[entry.loadLevel];
  const barPct = Math.min(
    100,
    Math.round((entry.loadScore / MAX_SCORE_DISPLAY) * 100),
  );

  return (
    <Card className={`border ${cfg.border} ${cfg.bg} transition-shadow hover:shadow-md`}>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <CardTitle className="truncate text-sm font-semibold">
              {entry.staff.name}
            </CardTitle>
            <p className="truncate text-xs text-muted-foreground">
              {entry.staff.department ?? "No department"}
            </p>
          </div>
          <span
            className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${cfg.text} ${cfg.bg}`}
          >
            {cfg.label}
          </span>
        </div>
      </CardHeader>

      <CardContent className="space-y-3">
        {/* Load bar */}
        <div>
          <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
            <span>Load score</span>
            <span className={`font-semibold ${cfg.text}`}>{entry.loadScore}</span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-black/10 dark:bg-white/10">
            <div
              className={`h-full rounded-full transition-all ${cfg.bar}`}
              style={{ width: `${barPct}%` }}
            />
          </div>
        </div>

        {/* Metrics grid */}
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="rounded-xl bg-background/60 px-2 py-1.5">
            <p className="text-muted-foreground">Open items</p>
            <p className="font-semibold">{entry.openWorkItems}</p>
          </div>
          <div className="rounded-xl bg-background/60 px-2 py-1.5">
            <p className="text-muted-foreground">Overdue</p>
            <p
              className={`font-semibold ${entry.overdueWorkItems > 0 ? "text-red-600" : ""}`}
            >
              {entry.overdueWorkItems}
            </p>
          </div>
          {entry.onCallRole && (
            <div className="col-span-2 rounded-xl bg-blue-100/60 px-2 py-1.5 dark:bg-blue-900/20">
              <p className="text-muted-foreground">On-call role</p>
              <p className="font-semibold capitalize text-blue-700 dark:text-blue-300">
                {entry.onCallRole}
              </p>
            </div>
          )}
          {entry.onLeave && (
            <div className="col-span-2 rounded-xl bg-amber-100/60 px-2 py-1.5 dark:bg-amber-900/20">
              <p className="font-medium text-amber-700 dark:text-amber-300">
                On approved leave this week
              </p>
            </div>
          )}
          {entry.overdueChanges > 0 && (
            <div className="col-span-2 rounded-xl bg-orange-100/60 px-2 py-1.5 dark:bg-orange-900/20">
              <p className="text-muted-foreground">Overdue temp changes</p>
              <p className="font-semibold text-orange-700 dark:text-orange-300">
                {entry.overdueChanges}
              </p>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ── Loading Skeleton ────────────────────────────────────────────────────────

function WorkloadSkeleton() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {Array.from({ length: 8 }).map((_, i) => (
        <Card key={i} className="p-4">
          <Skeleton className="mb-2 h-4 w-2/3" />
          <Skeleton className="mb-4 h-3 w-1/3" />
          <Skeleton className="mb-2 h-2 w-full rounded-full" />
          <div className="grid grid-cols-2 gap-2">
            <Skeleton className="h-12 rounded-xl" />
            <Skeleton className="h-12 rounded-xl" />
          </div>
        </Card>
      ))}
    </div>
  );
}

// ── Page ────────────────────────────────────────────────────────────────────

function WorkloadPage() {
  const [weekOffset, setWeekOffset] = useState(0);

  const baseDate = addWeeks(new Date(), weekOffset);
  const weekStart = startOfWeek(baseDate, { weekStartsOn: 1 }); // Monday
  const weekEnd = endOfWeek(baseDate, { weekStartsOn: 1 }); // Sunday

  const weekStartStr = formatISODate(weekStart);
  const weekEndStr = formatISODate(weekEnd);
  const isCurrentWeek = weekOffset === 0;

  const { data: entries, isLoading, refetch, isFetching } = useQuery(
    orpc.workload.get.queryOptions({
      input: {
        weekStart: weekStartStr,
        weekEnd: weekEndStr,
      },
    }),
  );

  // Summary stats
  const overloaded = entries?.filter((e) => e.loadLevel === "overloaded").length ?? 0;
  const onLeave = entries?.filter((e) => e.onLeave).length ?? 0;
  const onCall = entries?.filter((e) => e.onCallRole !== null).length ?? 0;
  const avgScore =
    entries && entries.length > 0
      ? Math.round(
          entries.reduce((sum, e) => sum + e.loadScore, 0) / entries.length,
        )
      : 0;

  // Group by load level for section rendering
  const overloadedEntries = entries?.filter((e) => e.loadLevel === "overloaded") ?? [];
  const highEntries = entries?.filter((e) => e.loadLevel === "high") ?? [];
  const mediumEntries = entries?.filter((e) => e.loadLevel === "medium") ?? [];
  const lowEntries = entries?.filter((e) => e.loadLevel === "low") ?? [];

  return (
    <>
      <Header>
        <div className="flex items-center gap-2">
          <Activity className="h-5 w-5 text-primary" />
          <h1 className="text-lg font-semibold">Team Workload</h1>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => refetch()}
            disabled={isFetching}
            title="Refresh"
          >
            <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
          </Button>
          <ThemeSwitch />
        </div>
      </Header>

      <Main>
        {/* Week navigator */}
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="icon"
              onClick={() => setWeekOffset((o) => o - 1)}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <div className="text-center">
              <p className="text-sm font-semibold">
                {format(weekStart, "d MMM")} — {format(weekEnd, "d MMM yyyy")}
              </p>
              {isCurrentWeek && (
                <p className="text-xs text-primary">Current Week</p>
              )}
            </div>
            <Button
              variant="outline"
              size="icon"
              onClick={() => setWeekOffset((o) => o + 1)}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
            {!isCurrentWeek && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setWeekOffset(0)}
                className="text-xs"
              >
                Today
              </Button>
            )}
          </div>
        </div>

        {/* Summary cards */}
        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Card className="p-4">
            <p className="text-xs text-muted-foreground">Team Members</p>
            <p className="mt-1 text-2xl font-bold">{entries?.length ?? "—"}</p>
          </Card>
          <Card className="p-4">
            <p className="text-xs text-muted-foreground">Overloaded</p>
            <p className={`mt-1 text-2xl font-bold ${overloaded > 0 ? "text-red-600" : "text-blue-600"}`}>
              {isLoading ? "—" : overloaded}
            </p>
          </Card>
          <Card className="p-4">
            <p className="text-xs text-muted-foreground">On Leave</p>
            <p className="mt-1 text-2xl font-bold text-amber-600">
              {isLoading ? "—" : onLeave}
            </p>
          </Card>
          <Card className="p-4">
            <p className="text-xs text-muted-foreground">Avg Load Score</p>
            <p className="mt-1 text-2xl font-bold">{isLoading ? "—" : avgScore}</p>
          </Card>
        </div>

        {/* Legend */}
        <div className="mb-4 flex flex-wrap gap-3 text-xs text-muted-foreground">
          <span className="font-medium">Load score:</span>
          {Object.entries(LOAD_CONFIG).map(([level, cfg]) => (
            <span key={level} className="flex items-center gap-1">
              <span className={`h-2 w-2 rounded-full ${cfg.bar}`} />
              {cfg.label}
              {level === "low" && " (0)"}
              {level === "medium" && " (1–5)"}
              {level === "high" && " (6–12)"}
              {level === "overloaded" && " (>12)"}
            </span>
          ))}
          <span className="ml-2 border-l pl-2">
            Factors: open items ×1 · overdue ×3 · on-call +5 · overdue changes ×2 · on leave +2
          </span>
        </div>

        {/* Content */}
        {isLoading ? (
          <WorkloadSkeleton />
        ) : !entries || entries.length === 0 ? (
          <Card className="py-16 text-center">
            <CardContent>
              <Users className="mx-auto mb-3 h-10 w-10 text-muted-foreground/40" />
              <p className="font-medium text-muted-foreground">No staff data available</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-6">
            {overloadedEntries.length > 0 && (
              <section>
                <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-red-600 uppercase tracking-wide">
                  <AlertCircle className="h-4 w-4" />
                  Overloaded ({overloadedEntries.length})
                </h2>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                  {overloadedEntries.map((e) => (
                    <EngineerCard key={e.staff.id} entry={e} />
                  ))}
                </div>
              </section>
            )}

            {highEntries.length > 0 && (
              <section>
                <h2 className="mb-3 text-sm font-semibold text-orange-600 uppercase tracking-wide">
                  High Load ({highEntries.length})
                </h2>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                  {highEntries.map((e) => (
                    <EngineerCard key={e.staff.id} entry={e} />
                  ))}
                </div>
              </section>
            )}

            {mediumEntries.length > 0 && (
              <section>
                <h2 className="mb-3 text-sm font-semibold text-amber-600 uppercase tracking-wide">
                  Medium Load ({mediumEntries.length})
                </h2>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                  {mediumEntries.map((e) => (
                    <EngineerCard key={e.staff.id} entry={e} />
                  ))}
                </div>
              </section>
            )}

            {lowEntries.length > 0 && (
              <section>
                <h2 className="mb-3 text-sm font-semibold text-blue-600 uppercase tracking-wide">
                  Low Load ({lowEntries.length})
                </h2>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                  {lowEntries.map((e) => (
                    <EngineerCard key={e.staff.id} entry={e} />
                  ))}
                </div>
              </section>
            )}
          </div>
        )}
      </Main>
    </>
  );
}
