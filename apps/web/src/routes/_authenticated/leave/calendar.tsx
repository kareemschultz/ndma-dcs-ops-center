import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  format,
  parseISO,
  isWithinInterval,
  startOfWeek,
  addDays,
  addMonths,
  subMonths,
  getDay,
} from "date-fns";
import {
  CalendarOff,
  ChevronLeft,
  ChevronRight,
  Download,
} from "lucide-react";
import { Button } from "@ndma-dcs-staff-portal/ui/components/button";
import { Skeleton } from "@ndma-dcs-staff-portal/ui/components/skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@ndma-dcs-staff-portal/ui/components/card";
import { Header } from "@/components/layout/header";
import { Main } from "@/components/layout/main";
import { ThemeSwitch } from "@/components/theme-switch";
import { useTeamFilter } from "@/lib/team-filter";
import { orpc } from "@/utils/orpc";

export const Route = createFileRoute("/_authenticated/leave/calendar")({
  component: LeaveCalendarPage,
});

// ── Colour palette for staff chips ─────────────────────────────────────────

const CHIP_COLORS = [
  "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300",
  "bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300",
  "bg-teal-100 text-teal-800 dark:bg-teal-900/40 dark:text-teal-300",
  "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
  "bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-300",
  "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-300",
];

const DOT_COLORS = [
  "bg-blue-500",
  "bg-purple-500",
  "bg-teal-500",
  "bg-amber-500",
  "bg-rose-500",
  "bg-indigo-500",
];

// ── Helpers ─────────────────────────────────────────────────────────────────

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function truncateName(name: string, maxLen = 10): string {
  return name.length > maxLen ? name.slice(0, maxLen - 1) + "…" : name;
}

// Build the 6-row × 7-col grid (Mon–Sun) for a given month
function buildCalendarGrid(year: number, month: number): Date[][] {
  const firstDay = startOfMonth(new Date(year, month, 1));
  const lastDay = endOfMonth(firstDay);
  // Get the Monday that starts the calendar grid
  const gridStart = startOfWeek(firstDay, { weekStartsOn: 1 });
  // Build 6 weeks (42 days)
  const weeks: Date[][] = [];
  let current = gridStart;
  for (let w = 0; w < 6; w++) {
    const week: Date[] = [];
    for (let d = 0; d < 7; d++) {
      week.push(current);
      current = addDays(current, 1);
    }
    weeks.push(week);
    // Stop after the month ends and we've finished the row
    if (current > lastDay && w >= 4) break;
  }
  return weeks;
}

// ── Leave request type ──────────────────────────────────────────────────────

interface LeaveRequest {
  id: string;
  staffProfile?: { user?: { name?: string | null } | null } | null;
  startDate: string;
  endDate: string;
  totalDays: number;
  leaveType?: { name: string } | null;
}

// ── Calendar page ───────────────────────────────────────────────────────────

function LeaveCalendarPage() {
  const today = new Date();
  const [viewDate, setViewDate] = useState(new Date(today.getFullYear(), today.getMonth(), 1));
  const { team } = useTeamFilter();

  const { data, isLoading } = useQuery(
    orpc.leave.requests.list.queryOptions({
      input: {
        status: "approved",
        limit: 200,
        offset: 0,
        team: team === "All" ? undefined : team,
      },
    })
  );

  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const monthLabel = format(viewDate, "MMMM yyyy");
  const monthStart = startOfMonth(viewDate);
  const monthEnd = endOfMonth(viewDate);

  // Build a stable color map: staff name → color index
  const staffColorMap = new Map<string, number>();
  const requests: LeaveRequest[] = (data ?? []) as LeaveRequest[];

  requests.forEach((req) => {
    const name = req.staffProfile?.user?.name ?? "Unknown";
    if (!staffColorMap.has(name)) {
      staffColorMap.set(name, staffColorMap.size % CHIP_COLORS.length);
    }
  });

  // Filter to only requests that overlap with this month
  const monthRequests = requests.filter((req) => {
    try {
      const start = parseISO(req.startDate);
      const end = parseISO(req.endDate);
      return start <= monthEnd && end >= monthStart;
    } catch {
      return false;
    }
  });

  // Get staff on leave for a given day
  const getStaffOnDay = (day: Date): LeaveRequest[] => {
    return monthRequests.filter((req) => {
      try {
        const start = parseISO(req.startDate);
        const end = parseISO(req.endDate);
        return isWithinInterval(day, { start, end });
      } catch {
        return false;
      }
    });
  };

  const weeks = buildCalendarGrid(year, month);
  const dayNames = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

  // Legend: unique staff on leave this month
  const legendStaff = Array.from(
    new Map(
      monthRequests.map((req) => {
        const name = req.staffProfile?.user?.name ?? "Unknown";
        return [name, req];
      })
    ).entries()
  );

  const isCurrentMonth = (day: Date) =>
    day.getMonth() === month && day.getFullYear() === year;

  const isToday = (day: Date) =>
    format(day, "yyyy-MM-dd") === format(today, "yyyy-MM-dd");

  return (
    <>
      <Header fixed>
        <div className="flex items-center gap-2">
          <CalendarOff className="size-4 text-muted-foreground" />
          <span className="text-sm font-medium">Team Leave Calendar</span>
        </div>
        <div className="ms-auto flex items-center gap-2 print:hidden">
          <Button variant="outline" size="sm" onClick={() => window.print()}>
            <Download className="mr-1.5 size-3.5" />
            Export PDF
          </Button>
          <ThemeSwitch />
        </div>
      </Header>

      <Main>
        <div className="mb-6 flex items-center justify-between flex-wrap gap-2">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Team Leave Calendar</h1>
            <p className="text-sm text-muted-foreground mt-1">
              View approved leave across the team by month.
            </p>
          </div>
        </div>

        {/* Month navigation */}
        <div className="flex items-center justify-between mb-4">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setViewDate(subMonths(viewDate, 1))}
          >
            <ChevronLeft className="size-4" />
            Prev
          </Button>
          <h2 className="text-lg font-semibold">{monthLabel}</h2>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setViewDate(addMonths(viewDate, 1))}
          >
            Next
            <ChevronRight className="size-4" />
          </Button>
        </div>

        {/* Calendar grid */}
        {isLoading ? (
          <div className="grid grid-cols-7 gap-px border rounded-lg overflow-hidden">
            {dayNames.map((d) => (
              <div
                key={d}
                className="bg-muted/50 px-2 py-1.5 text-center text-xs font-medium text-muted-foreground"
              >
                {d}
              </div>
            ))}
            {Array.from({ length: 35 }).map((_, i) => (
              <div key={i} className="min-h-[90px] bg-background p-1.5">
                <Skeleton className="h-4 w-6 mb-1" />
                <Skeleton className="h-5 w-full mb-1" />
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-lg border overflow-hidden">
            {/* Day name header */}
            <div className="grid grid-cols-7 divide-x bg-muted/30">
              {dayNames.map((d) => (
                <div
                  key={d}
                  className="px-2 py-2 text-center text-xs font-semibold text-muted-foreground"
                >
                  {d}
                </div>
              ))}
            </div>
            {/* Calendar rows */}
            <div className="divide-y">
              {weeks.map((week, wi) => (
                <div key={wi} className="grid grid-cols-7 divide-x">
                  {week.map((day, di) => {
                    const staffToday = getStaffOnDay(day);
                    const inMonth = isCurrentMonth(day);
                    const todayMark = isToday(day);
                    return (
                      <div
                        key={di}
                        className={`min-h-[90px] p-1.5 ${
                          inMonth ? "bg-background" : "bg-muted/20"
                        } ${todayMark ? "ring-1 ring-inset ring-primary" : ""}`}
                      >
                        <p
                          className={`text-xs font-medium mb-1 w-6 h-6 flex items-center justify-center rounded-full ${
                            todayMark
                              ? "bg-primary text-primary-foreground"
                              : inMonth
                                ? "text-foreground"
                                : "text-muted-foreground/50"
                          }`}
                        >
                          {format(day, "d")}
                        </p>
                        <div className="flex flex-col gap-0.5">
                          {staffToday.slice(0, 3).map((req) => {
                            const name = req.staffProfile?.user?.name ?? "Unknown";
                            const colorIdx = staffColorMap.get(name) ?? 0;
                            return (
                              <div
                                key={req.id}
                                title={`${name} — ${req.leaveType?.name ?? "Leave"}`}
                                className={`flex items-center gap-1 rounded-lg px-1 py-0.5 text-[10px] font-medium truncate ${CHIP_COLORS[colorIdx]}`}
                              >
                                <span className="shrink-0 font-semibold">
                                  {getInitials(name)}
                                </span>
                                <span className="truncate">{truncateName(name)}</span>
                              </div>
                            );
                          })}
                          {staffToday.length > 3 && (
                            <span className="text-[10px] text-muted-foreground pl-1">
                              +{staffToday.length - 3} more
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Legend / people on leave this month */}
        <div className="mt-6">
          <h3 className="text-sm font-semibold mb-3">
            Staff on approved leave in {monthLabel}
          </h3>
          {isLoading ? (
            <div className="flex flex-wrap gap-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-7 w-36 rounded-full" />
              ))}
            </div>
          ) : legendStaff.length === 0 ? (
            <Card>
              <CardContent className="py-10 text-center text-sm text-muted-foreground">
                No approved leave this month.
              </CardContent>
            </Card>
          ) : (
            <div className="flex flex-wrap gap-2">
              {legendStaff.map(([name, req]) => {
                const colorIdx = staffColorMap.get(name) ?? 0;
                return (
                  <div
                    key={name}
                    className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium`}
                  >
                    <span
                      className={`size-2 rounded-full shrink-0 ${DOT_COLORS[colorIdx]}`}
                    />
                    <span>{name}</span>
                    <span className="text-muted-foreground font-normal">
                      {format(parseISO(req.startDate), "dd MMM")}–
                      {format(parseISO(req.endDate), "dd MMM")}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </Main>
    </>
  );
}
