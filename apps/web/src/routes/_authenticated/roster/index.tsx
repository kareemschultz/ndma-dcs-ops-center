import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { ArrowLeftRight, CalendarDays, CalendarRange } from "lucide-react";
import { useMemo, useState } from "react";

import { Badge } from "@ndma-dcs-staff-portal/ui/components/badge";
import { Button } from "@ndma-dcs-staff-portal/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@ndma-dcs-staff-portal/ui/components/card";
import { Input } from "@ndma-dcs-staff-portal/ui/components/input";
import { Skeleton } from "@ndma-dcs-staff-portal/ui/components/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@ndma-dcs-staff-portal/ui/components/table";

import { Header } from "@/components/layout/header";
import { Main } from "@/components/layout/main";
import { SchedulingTabs } from "@/components/layout/scheduling-tabs";
import { ThemeSwitch } from "@/components/theme-switch";
import { useTeamFilter } from "@/lib/team-filter";
import { orpc } from "@/utils/orpc";

export const Route = createFileRoute("/_authenticated/roster/")({
  component: NocShiftsPage,
});

type NocShift = {
  id: number;
  staffId: string;
  shiftDate: string;
  shiftType: "12hr Day" | "12hr Night" | "Off" | "Annual Leave" | "Sick Leave";
  notes: string | null;
  staffProfile?: {
    user?: { name?: string | null } | null;
    department?: { code?: string | null; name?: string | null } | null;
  } | null;
};

function shiftTone(shiftType: string) {
  switch (shiftType) {
    case "12hr Day":
      return "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900/40 dark:bg-emerald-950/40 dark:text-emerald-300";
    case "12hr Night":
      return "border-slate-200 bg-slate-100 text-slate-800 dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-200";
    case "Off":
      return "border-muted bg-muted text-muted-foreground";
    case "Annual Leave":
      return "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/40 dark:text-amber-300";
    case "Sick Leave":
      return "border-red-200 bg-red-50 text-red-800 dark:border-red-900/40 dark:bg-red-950/40 dark:text-red-300";
    default:
      return "border-border bg-background text-foreground";
  }
}

function NocShiftsPage() {
  const [monthKey, setMonthKey] = useState(new Date().toISOString().slice(0, 7));
  const [showMyShifts, setShowMyShifts] = useState(false);
  const { team } = useTeamFilter();

  const { data: departments } = useQuery(orpc.departments.list.queryOptions());
  const { data: staff, isLoading: staffLoading } = useQuery(
    orpc.staff.list.queryOptions({
      input: { limit: 500, offset: 0, team: team === "All" ? "NOC" : team === "DCS" ? "DCS" : "NOC" },
    }),
  );
  const { data: shifts, isLoading: shiftsLoading } = useQuery(
    orpc.nocShifts.list.queryOptions({
      input: { monthKey, team: team === "All" ? "NOC" : team === "DCS" ? "DCS" : "NOC" },
    }),
  );
  const { data: currentStaff } = useQuery(orpc.staff.me.queryOptions());

  const nocDepartmentId = departments?.find((department) => department.code === "NOC")?.id;
  const nocStaff = useMemo(
    () =>
      (staff ?? []).filter((member) => {
        if (nocDepartmentId) return member.departmentId === nocDepartmentId;
        return member.department?.code === "NOC";
      }),
    [staff, nocDepartmentId],
  );

  const visibleStaff = useMemo(() => {
    if (team === "DCS") {
      return [];
    }
    if (showMyShifts && currentStaff?.id) {
      return nocStaff.filter((member) => member.id === currentStaff.id);
    }
    return nocStaff;
  }, [currentStaff?.id, nocStaff, showMyShifts, team]);

  const daysInMonth = useMemo(() => {
    const [yearText = "1970", monthText = "01"] = monthKey.split("-");
    return new Date(Number(yearText), Number(monthText), 0).getDate();
  }, [monthKey]);

  const shiftsByStaff = useMemo(() => {
    const map = new Map<string, Map<string, NocShift>>();
    for (const shift of (shifts ?? []) as NocShift[]) {
      const byDate = map.get(shift.staffId) ?? new Map<string, NocShift>();
      byDate.set(shift.shiftDate, shift);
      map.set(shift.staffId, byDate);
    }
    return map;
  }, [shifts]);

  return (
    <>
      <Header fixed>
        <div className="flex items-center gap-2">
          <CalendarDays className="size-4 text-muted-foreground" />
          <span className="text-sm font-medium">Scheduling & Rosters</span>
        </div>
        <div className="ms-auto flex items-center gap-2">
          <ThemeSwitch />
        </div>
      </Header>

      <Main className="space-y-6">
        <SchedulingTabs scope="noc" />

        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">NOC Shifts</h1>
            <p className="text-sm text-muted-foreground">
              Monthly 12-hour shift coverage for NOC staff. DCS on-call remains separate.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Link to="/roster/planner">
              <Button size="sm">
                <CalendarRange className="mr-1.5 size-3.5" />
                Edit Roster
              </Button>
            </Link>
            <Link to="/roster/planner">
              <Button variant="outline" size="sm">
                <CalendarRange className="mr-1.5 size-3.5" />
                Planner
              </Button>
            </Link>
            <Link to="/roster/swaps">
              <Button variant="outline" size="sm">
                <ArrowLeftRight className="mr-1.5 size-3.5" />
                Swaps
              </Button>
            </Link>
            <Button
              variant={showMyShifts ? "default" : "outline"}
              size="sm"
              onClick={() => setShowMyShifts((value) => !value)}
            >
              My Shifts
            </Button>
          </div>
        </div>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-4">
            <CardTitle className="text-base">Monthly Grid</CardTitle>
            <div className="w-full max-w-40">
              <Input
                type="month"
                value={monthKey}
                onChange={(event) => setMonthKey(event.target.value)}
              />
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {staffLoading || shiftsLoading ? (
              <div className="space-y-3 p-4">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            ) : visibleStaff.length === 0 ? (
              <div className="p-8 text-center text-sm text-muted-foreground">
                {team === "DCS"
                  ? "Switch the department filter to NOC to view shift assignments."
                  : "No NOC staff were found in the directory."}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="sticky left-0 z-10 min-w-56 bg-background">
                        Staff Member
                      </TableHead>
                      {Array.from({ length: daysInMonth }, (_, index) => index + 1).map((day) => (
                        <TableHead key={day} className="min-w-24 text-center">
                          <div className="text-xs font-medium">{day}</div>
                          <div className="text-[10px] text-muted-foreground">
                            {format(new Date(Number(monthKey.slice(0, 4)), Number(monthKey.slice(5, 7)) - 1, day), "EEE")}
                          </div>
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {visibleStaff.map((member) => (
                      <TableRow key={member.id}>
                        <TableCell className="sticky left-0 z-10 min-w-56 bg-background align-top">
                          <div className="font-medium">{member.user?.name ?? member.id}</div>
                          <div className="text-xs text-muted-foreground">
                            {member.employeeId} • {member.department?.code ?? "NOC"}
                          </div>
                        </TableCell>
                        {Array.from({ length: daysInMonth }, (_, index) => index + 1).map((day) => {
                          const date = `${monthKey}-${String(day).padStart(2, "0")}`;
                          const shift = shiftsByStaff.get(member.id)?.get(date) ?? null;
                          return (
                            <TableCell key={date} className="align-top">
                              {shift ? (
                                <div className={`rounded-lg border px-2 py-1 text-center text-xs font-medium ${shiftTone(shift.shiftType)}`}>
                                  <div>{shift.shiftType}</div>
                                  {shift.notes ? (
                                    <div className="mt-1 line-clamp-2 text-[10px] font-normal opacity-80">
                                      {shift.notes}
                                    </div>
                                  ) : null}
                                </div>
                              ) : (
                                <div className="rounded-lg border border-dashed px-2 py-2 text-center text-xs text-muted-foreground">
                                  —
                                </div>
                              )}
                            </TableCell>
                          );
                        })}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Active NOC Staff</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold">{visibleStaff.length}</p>
              <p className="text-sm text-muted-foreground">Filtered to the NOC department only.</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Month</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold">{monthKey}</p>
              <p className="text-sm text-muted-foreground">Shift entries loaded from `noc_shifts`.</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Coverage Types</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              {["12hr Day", "12hr Night", "Off", "Annual Leave", "Sick Leave"].map((shiftType) => (
                <Badge key={shiftType} variant="outline" className="rounded-full">
                  {shiftType}
                </Badge>
              ))}
            </CardContent>
          </Card>
        </div>
      </Main>
    </>
  );
}
