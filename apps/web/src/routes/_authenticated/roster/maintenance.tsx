import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Wrench } from "lucide-react";
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
import { orpc, queryClient } from "@/utils/orpc";

export const Route = createFileRoute("/_authenticated/roster/maintenance")({
  component: RosterMaintenancePage,
});

function RosterMaintenancePage() {
  const [departmentId, setDepartmentId] = useState("all");
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [quarter, setQuarter] = useState("Q1");
  const [maintenanceType, setMaintenanceType] = useState<"cleaning_server_room" | "routine_maintenance_dcs" | "fire_detection_test">("cleaning_server_room");
  const [staffProfileId, setStaffProfileId] = useState("");
  const [notes, setNotes] = useState("");

  const { data: maintenance } = useQuery(orpc.roster.maintenance.list.queryOptions({ input: {} }));
  const { data: departments } = useQuery(orpc.departments.list.queryOptions());
  const { data: staff } = useQuery(orpc.staff.list.queryOptions({ input: { limit: 200, offset: 0 } }));

  const create = useMutation(
    orpc.roster.maintenance.create.mutationOptions({
      onSuccess: async () => {
        toast.success("Maintenance assignment created");
        await queryClient.invalidateQueries({ queryKey: orpc.roster.maintenance.list.key() });
      },
      onError: (error: Error) => toast.error(error.message),
    }),
  );

  function submit(e: React.FormEvent) {
    e.preventDefault();
    create.mutate({
      departmentId: departmentId === "all" ? undefined : departmentId,
      year: Number(year),
      quarter,
      maintenanceType,
      staffProfileId: staffProfileId || undefined,
      notes: notes || undefined,
    });
  }

  return (
    <>
      <Header fixed>
        <div className="flex items-center gap-2">
          <Wrench className="size-4 text-muted-foreground" />
          <span className="text-sm font-medium">Roster Maintenance</span>
        </div>
        <div className="ms-auto flex items-center gap-2">
          <ThemeSwitch />
        </div>
      </Header>

      <Main className="space-y-6">
        <SchedulingTabs scope="noc" />

        <div>
          <h1 className="text-2xl font-bold tracking-tight">Maintenance Assignments</h1>
          <p className="text-sm text-muted-foreground">Quarterly maintenance coverage and ownership.</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Create Assignment</CardTitle>
          </CardHeader>
          <CardContent>
            <form className="grid gap-4 md:grid-cols-2" onSubmit={submit}>
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
                <Label htmlFor="year">Year</Label>
                <Input id="year" type="number" min="2020" max="2100" value={year} onChange={(e) => setYear(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Quarter</Label>
                <Select value={quarter} onValueChange={(value) => setQuarter(value ?? "Q1")}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Q1">Q1</SelectItem>
                    <SelectItem value="Q2">Q2</SelectItem>
                    <SelectItem value="Q3">Q3</SelectItem>
                    <SelectItem value="Q4">Q4</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Maintenance Type</Label>
                <Select value={maintenanceType} onValueChange={(value) => setMaintenanceType((value as typeof maintenanceType | null) ?? "cleaning_server_room")}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cleaning_server_room">Cleaning Server Room</SelectItem>
                    <SelectItem value="routine_maintenance_dcs">Routine Maintenance DCS</SelectItem>
                    <SelectItem value="fire_detection_test">Fire Detection Test</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Staff Member</Label>
                <Select value={staffProfileId} onValueChange={(value) => setStaffProfileId(value ?? "")}>
                  <SelectTrigger>
                    <SelectValue placeholder="Optional" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Unassigned</SelectItem>
                    {(staff ?? []).map((member) => (
                      <SelectItem key={member.id} value={member.id}>
                        {member.user?.name ?? member.id}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5 md:col-span-2">
                <Label htmlFor="notes">Notes</Label>
                <Textarea id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
              </div>
              <div className="md:col-span-2">
                <Button type="submit" disabled={create.isPending}>
                  {create.isPending ? "Creating..." : "Create Assignment"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Current Assignments</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {(maintenance ?? []).map((item) => (
              <div key={item.id} className="rounded-lg border px-3 py-3 text-sm">
                <div className="font-medium">{item.maintenanceType}</div>
                <div className="text-xs text-muted-foreground">
                  {item.quarter} {item.year} • {item.department?.name ?? "All departments"} • {item.staffProfile?.user?.name ?? "Unassigned"}
                </div>
                {item.notes && <div className="mt-1 text-xs text-muted-foreground">{item.notes}</div>}
              </div>
            ))}
            {(maintenance ?? []).length === 0 && (
              <p className="text-sm text-muted-foreground">No maintenance assignments found.</p>
            )}
          </CardContent>
        </Card>
      </Main>
    </>
  );
}
