import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Clock3, SortAsc, SortDesc } from "lucide-react";
import { format, parseISO } from "date-fns";

import { Badge } from "@ndma-dcs-staff-portal/ui/components/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@ndma-dcs-staff-portal/ui/components/card";
import { Skeleton } from "@ndma-dcs-staff-portal/ui/components/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@ndma-dcs-staff-portal/ui/components/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@ndma-dcs-staff-portal/ui/components/table";

import { Header } from "@/components/layout/header";
import { Main } from "@/components/layout/main";
import { ThemeSwitch } from "@/components/theme-switch";
import { useTeamFilter } from "@/lib/team-filter";
import { orpc } from "@/utils/orpc";

export const Route = createFileRoute("/_authenticated/attendance/")({
  component: AttendancePage,
});

function formatTime(value?: string | null) {
  if (!value) return "—";
  try {
    return format(new Date(`1970-01-01T${value}`), "HH:mm");
  } catch {
    return value;
  }
}

function minutesLate(clockIn?: string | null): number | null {
  if (!clockIn) return null;
  const parts = clockIn.split(":");
  const h = parseInt(parts[0] ?? "0", 10);
  const m = parseInt(parts[1] ?? "0", 10);
  const totalMins = h * 60 + m;
  const grace = 8 * 60 + 15; // 8:15
  return totalMins > grace ? totalMins - grace : null;
}

function AttendancePage() {
  const [tab, setTab] = useState("lateness");
  const [sortKey, setSortKey] = useState<"late" | "days">("late");
  const { team } = useTeamFilter();

  const { data: latenessRows, isLoading: latenessLoading } = useQuery(
    orpc.attendanceTime.lateness.list.queryOptions({
      input: { team: team === "All" ? undefined : team },
    }),
  );
  const { data: logs, isLoading: logsLoading } = useQuery(
    orpc.attendanceTime.logs.list.queryOptions({
      input: { team: team === "All" ? undefined : team, limit: 300 },
    }),
  );

  const sortedLateness = useMemo(() => {
    const rows = [...(latenessRows ?? [])];
    return rows.sort((a, b) => {
      if (sortKey === "days") return (b.daysLate ?? 0) - (a.daysLate ?? 0);
      return String(b.totalTimeLate ?? "").localeCompare(String(a.totalTimeLate ?? ""));
    });
  }, [latenessRows, sortKey]);

  return (
    <>
      <Header fixed>
        <div className="flex items-center gap-2">
          <Clock3 className="size-4 text-muted-foreground" />
          <span className="text-sm font-medium">Attendance &amp; Time</span>
        </div>
        <div className="ms-auto flex items-center gap-2">
          <ThemeSwitch />
        </div>
      </Header>

      <Main className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Attendance &amp; Time</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manager lateness trends and staff clock-in/out logs by department.
          </p>
        </div>

        <Tabs value={tab} onValueChange={setTab} className="space-y-4">
          <TabsList variant="line" className="justify-start">
            <TabsTrigger value="lateness">Lateness Dashboard</TabsTrigger>
            <TabsTrigger value="timesheets">Clock Logs</TabsTrigger>
          </TabsList>

          <TabsContent value="lateness" className="space-y-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
                <CardTitle className="text-base">Quarterly Lateness</CardTitle>
                <div className="flex items-center gap-2">
                  <button
                    className={`inline-flex items-center gap-1 rounded-md border px-3 py-1.5 text-xs ${sortKey === "late" ? "bg-primary text-primary-foreground" : ""}`}
                    onClick={() => setSortKey("late")}
                  >
                    <SortAsc className="size-3.5" />
                    Total Time Late
                  </button>
                  <button
                    className={`inline-flex items-center gap-1 rounded-md border px-3 py-1.5 text-xs ${sortKey === "days" ? "bg-primary text-primary-foreground" : ""}`}
                    onClick={() => setSortKey("days")}
                  >
                    <SortDesc className="size-3.5" />
                    Days Late
                  </button>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Staff</TableHead>
                      <TableHead>Year</TableHead>
                      <TableHead>Month</TableHead>
                      <TableHead>Total Time Late</TableHead>
                      <TableHead>Days Late</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {latenessLoading ? (
                      Array.from({ length: 4 }).map((_, i) => (
                        <TableRow key={i}>
                          {Array.from({ length: 5 }).map((_, j) => (
                            <TableCell key={j}>
                              <Skeleton className="h-4 w-full" />
                            </TableCell>
                          ))}
                        </TableRow>
                      ))
                    ) : sortedLateness.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">
                          No lateness records found.
                        </TableCell>
                      </TableRow>
                    ) : (
                      sortedLateness.map((row) => (
                        <TableRow key={row.id}>
                          <TableCell className="font-medium">
                            {row.staffProfile?.user?.name ?? "—"}
                          </TableCell>
                          <TableCell>{row.year}</TableCell>
                          <TableCell>{row.month}</TableCell>
                          <TableCell className="font-mono">{row.totalTimeLate}</TableCell>
                          <TableCell>
                            <Badge variant="outline">{row.daysLate}</Badge>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="timesheets" className="space-y-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Daily Clock Logs</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Staff</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Clock In</TableHead>
                      <TableHead>Late (mins)</TableHead>
                      <TableHead>Clock Out</TableHead>
                      <TableHead>Work Hours</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {logsLoading ? (
                      Array.from({ length: 6 }).map((_, i) => (
                        <TableRow key={i}>
                          {Array.from({ length: 7 }).map((_, j) => (
                            <TableCell key={j}>
                              <Skeleton className="h-4 w-full" />
                            </TableCell>
                          ))}
                        </TableRow>
                      ))
                    ) : !logs?.length ? (
                      <TableRow>
                        <TableCell colSpan={7} className="py-10 text-center text-muted-foreground">
                          No attendance logs found.
                        </TableCell>
                      </TableRow>
                    ) : (
                      logs.map((row) => {
                        const late = minutesLate(row.clockIn);
                        return (
                        <TableRow key={row.id}>
                          <TableCell className="font-medium">
                            {row.staffProfile?.user?.name ?? "—"}
                          </TableCell>
                          <TableCell>{row.date ? format(parseISO(row.date), "dd MMM yyyy") : "—"}</TableCell>
                          <TableCell>{formatTime(row.clockIn)}</TableCell>
                          <TableCell>
                            {late !== null
                              ? <span className="font-mono text-amber-600 dark:text-amber-400">{late} min</span>
                              : <span className="text-muted-foreground">—</span>}
                          </TableCell>
                          <TableCell>{formatTime(row.clockOut)}</TableCell>
                          <TableCell className="font-mono">{row.workHours ?? "—"}</TableCell>
                          <TableCell>
                            <Badge variant="outline">{row.status}</Badge>
                          </TableCell>
                        </TableRow>
                        );
                      })
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </Main>
    </>
  );
}
