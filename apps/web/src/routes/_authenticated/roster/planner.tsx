import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { CalendarRange, Plus, Save } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@ndma-dcs-staff-portal/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@ndma-dcs-staff-portal/ui/components/card";
import { Input } from "@ndma-dcs-staff-portal/ui/components/input";
import { Label } from "@ndma-dcs-staff-portal/ui/components/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@ndma-dcs-staff-portal/ui/components/select";
import { Textarea } from "@ndma-dcs-staff-portal/ui/components/textarea";

import { Header } from "@/components/layout/header";
import { Main } from "@/components/layout/main";
import { SchedulingTabs } from "@/components/layout/scheduling-tabs";
import { ThemeSwitch } from "@/components/theme-switch";
import { orpc } from "@/utils/orpc";

export const Route = createFileRoute("/_authenticated/roster/planner")({
  component: RosterPlannerPage,
});

function RosterPlannerPage() {
  const queryClient = useQueryClient();
  const [monthKey, setMonthKey] = useState(new Date().toISOString().slice(0, 7));
  const [departmentId, setDepartmentId] = useState("all");
  const [notes, setNotes] = useState("");
  const [selectedScheduleId, setSelectedScheduleId] = useState("");
  const [shiftDate, setShiftDate] = useState(`${new Date().toISOString().slice(0, 10)}`);
  const [shiftType, setShiftType] = useState<"day" | "swing" | "night">("day");
  const [staffProfileId, setStaffProfileId] = useState("");
  const [assignmentNotes, setAssignmentNotes] = useState("");

  const { data: schedules } = useQuery(orpc.roster.list.queryOptions({ input: {} }));
  const { data: departments } = useQuery(orpc.departments.list.queryOptions());
  const { data: staff } = useQuery(orpc.staff.list.queryOptions({ input: { limit: 200, offset: 0 } }));

  const currentSchedules = useMemo(() => schedules ?? [], [schedules]);
  const selectedSchedule = currentSchedules.find((schedule) => schedule.id === selectedScheduleId) ?? currentSchedules[0];

  const createSchedule = useMutation(
    orpc.roster.create.mutationOptions({
      onSuccess: async () => {
        toast.success("Roster schedule created");
        await queryClient.invalidateQueries({ queryKey: orpc.roster.list.key() });
      },
      onError: (error: Error) => toast.error(error.message),
    }),
  );

  const assign = useMutation(
    orpc.roster.assign.mutationOptions({
      onSuccess: async () => {
        toast.success("Assignment saved");
        await queryClient.invalidateQueries({ queryKey: orpc.roster.list.key() });
        await queryClient.invalidateQueries({ queryKey: orpc.roster.getCurrent.key() });
      },
      onError: (error: Error) => toast.error(error.message),
    }),
  );

  function submitSchedule(e: React.FormEvent) {
    e.preventDefault();
    if (!monthKey) {
      toast.error("Select a month before creating a schedule.");
      return;
    }
    createSchedule.mutate({
      monthKey,
      departmentId: departmentId === "all" ? undefined : departmentId,
      notes: notes || undefined,
    });
  }

  function submitAssignment(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedSchedule) {
      toast.error("Create or select a schedule first.");
      return;
    }
    if (!shiftDate) {
      toast.error("Select a shift date.");
      return;
    }
    if (!staffProfileId) {
      toast.error("Select a staff member.");
      return;
    }
    assign.mutate({
      scheduleId: selectedSchedule.id,
      shiftDate,
      shiftType,
      staffProfileId,
      notes: assignmentNotes || undefined,
    });
  }

  return (
    <>
      <Header fixed>
        <div className="flex items-center gap-2">
          <CalendarRange className="size-4 text-muted-foreground" />
          <span className="text-sm font-medium">Roster Planner</span>
        </div>
        <div className="ms-auto flex items-center gap-2">
          <ThemeSwitch />
        </div>
      </Header>

      <Main className="space-y-6">
        <SchedulingTabs scope="noc" />

        <div>
          <h1 className="text-2xl font-bold tracking-tight">Planner</h1>
          <p className="text-sm text-muted-foreground">
            Create monthly rosters and assign staff to day, swing, and night shifts.
          </p>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Create Schedule</CardTitle>
            </CardHeader>
            <CardContent>
              <form className="space-y-4" onSubmit={submitSchedule}>
                <div className="space-y-1.5">
                  <Label htmlFor="monthKey">Month Key</Label>
                  <Input
                    id="monthKey"
                    type="month"
                    value={monthKey}
                    onChange={(e) => setMonthKey(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Department</Label>
                  <Select value={departmentId} onValueChange={(value) => setDepartmentId(value ?? "all")}>
                    <SelectTrigger>
                      <SelectValue placeholder="All departments" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All departments</SelectItem>
                      {(departments ?? []).map((department) => (
                        <SelectItem key={department.id} value={department.id}>
                          {department.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="notes">Notes</Label>
                  <Textarea
                    id="notes"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Coverage rules, maintenance, special events..."
                  />
                </div>
                <Button type="submit" disabled={createSchedule.isPending}>
                  <Plus className="mr-1.5 size-3.5" />
                  {createSchedule.isPending ? "Creating..." : "Create Schedule"}
                </Button>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Assign Shift</CardTitle>
            </CardHeader>
            <CardContent>
              <form className="space-y-4" onSubmit={submitAssignment}>
                <div className="space-y-1.5">
                  <Label>Schedule</Label>
                  <Select value={selectedScheduleId} onValueChange={(value) => setSelectedScheduleId(value ?? "")}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select schedule" />
                    </SelectTrigger>
                    <SelectContent>
                      {currentSchedules.map((schedule) => (
                        <SelectItem key={schedule.id} value={schedule.id}>
                          {schedule.monthKey} ({schedule.status})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="shiftDate">Shift Date</Label>
                    <Input
                      id="shiftDate"
                      type="date"
                      value={shiftDate}
                      onChange={(e) => setShiftDate(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Shift Type</Label>
                    <Select value={shiftType} onValueChange={(value) => setShiftType((value as "day" | "swing" | "night" | null) ?? "day")}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="day">Day</SelectItem>
                        <SelectItem value="swing">Swing</SelectItem>
                        <SelectItem value="night">Night</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label>Staff Member</Label>
                  <Select value={staffProfileId} onValueChange={(value) => setStaffProfileId(value ?? "")}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select staff" />
                    </SelectTrigger>
                    <SelectContent>
                      {(staff ?? []).map((member) => (
                        <SelectItem key={member.id} value={member.id}>
                          {member.user?.name ?? member.id}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="assignmentNotes">Notes</Label>
                  <Textarea
                    id="assignmentNotes"
                    value={assignmentNotes}
                    onChange={(e) => setAssignmentNotes(e.target.value)}
                    placeholder="Reason for assignment..."
                  />
                </div>
                <Button type="submit" disabled={assign.isPending || !selectedSchedule}>
                  <Save className="mr-1.5 size-3.5" />
                  {assign.isPending ? "Saving..." : "Save Assignment"}
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Existing Schedules</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {currentSchedules.map((schedule) => (
              <button
                key={schedule.id}
                type="button"
                onClick={() => setSelectedScheduleId(schedule.id)}
                className={`w-full rounded-lg border px-3 py-2 text-left text-sm hover:bg-accent ${
                  selectedSchedule?.id === schedule.id ? "border-primary" : ""
                }`}
              >
                <div className="font-medium">{schedule.monthKey}</div>
                <div className="text-xs text-muted-foreground">
                  {schedule.department?.name ?? "All departments"} • {schedule.status} • {schedule.assignments.length} assignments
                </div>
              </button>
            ))}
            {currentSchedules.length === 0 && (
              <p className="text-sm text-muted-foreground">No schedules created yet.</p>
            )}
          </CardContent>
        </Card>
      </Main>
    </>
  );
}
