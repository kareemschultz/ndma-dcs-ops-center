import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { requireResource } from "@/lib/route-guard";
import { Shield, Plus, Pencil, PowerOff } from "lucide-react";
import { toast } from "sonner";

import { Header } from "@/components/layout/header";
import { Main } from "@/components/layout/main";
import { ThemeSwitch } from "@/components/theme-switch";
import { authClient } from "@/lib/auth-client";
import { orpc } from "@/utils/orpc";
import { Skeleton } from "@ndma-dcs-staff-portal/ui/components/skeleton";
import { Button } from "@ndma-dcs-staff-portal/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@ndma-dcs-staff-portal/ui/components/dialog";
import { Input } from "@ndma-dcs-staff-portal/ui/components/input";
import { Label } from "@ndma-dcs-staff-portal/ui/components/label";
import { Textarea } from "@ndma-dcs-staff-portal/ui/components/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@ndma-dcs-staff-portal/ui/components/table";

export const Route = createFileRoute(
  "/_authenticated/settings/department-assignments",
)({
  beforeLoad: ({ context }) => requireResource(context, "settings"),
  component: DepartmentAssignmentsPage,
});

type StaffRow = {
  id: string;
  name: string;
  employeeId: string;
  department?: { id: string; name: string; code: string } | null;
};

type DepartmentRow = {
  id: string;
  name: string;
  code: string;
};

type AssignmentRow = {
  id: string;
  staffProfileId: string;
  departmentId: string;
  role: "manager" | "pa" | "team_lead" | "supervisor";
  isActive: boolean;
  note: string | null;
  staffProfile?: { user?: { name: string | null } | null; employeeId?: string | null; department?: DepartmentRow | null } | null;
  department?: DepartmentRow | null;
};

function DepartmentAssignmentsPage() {
  const { data: session } = authClient.useSession();
  const role = (session?.user as Record<string, unknown> | undefined)?.role as string | undefined;
  const canRead =
    role === "admin" ||
    role === "hrAdminOps" ||
    role === "manager" ||
    role === "teamLead" ||
    role === "personalAssistant";
  const canEdit = role === "admin" || role === "hrAdminOps";

  const qc = useQueryClient();
  const { data: assignments, isLoading } = useQuery({
    ...orpc.departmentAssignments.list.queryOptions(),
    enabled: canRead,
  });
  const { data: staff } = useQuery({
    ...orpc.staff.list.queryOptions({ input: { limit: 500, offset: 0 } }),
    enabled: canEdit,
  });
  const { data: departments } = useQuery({
    ...orpc.departments.list.queryOptions(),
    enabled: canEdit,
  });

  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<AssignmentRow | null>(null);
  const [deactivateTarget, setDeactivateTarget] = useState<AssignmentRow | null>(null);

  const createMutation = useMutation(
    orpc.departmentAssignments.create.mutationOptions({
      onSuccess: async () => {
        await qc.invalidateQueries({ queryKey: orpc.departmentAssignments.list.key() });
        toast.success("Assignment created");
        setCreateOpen(false);
      },
      onError: (error: Error) => toast.error(error.message),
    }),
  );

  const updateMutation = useMutation(
    orpc.departmentAssignments.update.mutationOptions({
      onSuccess: async () => {
        await qc.invalidateQueries({ queryKey: orpc.departmentAssignments.list.key() });
        toast.success("Assignment updated");
        setEditTarget(null);
      },
      onError: (error: Error) => toast.error(error.message),
    }),
  );

  const deactivateMutation = useMutation(
    orpc.departmentAssignments.deactivate.mutationOptions({
      onSuccess: async () => {
        await qc.invalidateQueries({ queryKey: orpc.departmentAssignments.list.key() });
        toast.success("Assignment deactivated");
        setDeactivateTarget(null);
      },
      onError: (error: Error) => toast.error(error.message),
    }),
  );

  const staffRows = (staff ?? []) as unknown as StaffRow[];
  const departmentRows = (departments ?? []) as unknown as DepartmentRow[];
  const assignmentRows = (assignments ?? []) as unknown as AssignmentRow[];

  if (!canRead) {
    return (
      <>
        <Header fixed>
          <div className="flex items-center gap-2">
            <Shield className="size-4 text-muted-foreground" />
            <span className="text-sm font-medium">Department Assignments</span>
          </div>
          <div className="ms-auto flex items-center gap-2">
            <ThemeSwitch />
          </div>
        </Header>

        <Main>
          <div className="rounded-xl border border-dashed p-6 text-sm text-muted-foreground">
            This section is restricted to managers, team leads, PAs, HR / admin operations, and admins.
          </div>
        </Main>
      </>
    );
  }

  return (
    <>
      <Header fixed>
        <div className="flex items-center gap-2">
          <Shield className="size-4 text-muted-foreground" />
          <span className="text-sm font-medium">Department Assignments</span>
        </div>
        <div className="ms-auto flex items-center gap-2">
          <ThemeSwitch />
        </div>
      </Header>

      <Main>
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Department Assignments</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              DCS and NOC responsibility assignments for managers, PAs, supervisors, and team leads.
            </p>
          </div>
          {canEdit && (
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="mr-1 size-4" />
              Add Assignment
            </Button>
          )}
        </div>

        <div className="overflow-x-auto rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Staff</TableHead>
                <TableHead>Department</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Note</TableHead>
                {canEdit && <TableHead className="w-20">Actions</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading
                ? Array.from({ length: 4 }).map((_, index) => (
                    <TableRow key={index}>
                      {Array.from({ length: canEdit ? 6 : 5 }).map((__, cellIndex) => (
                        <TableCell key={cellIndex}>
                          <Skeleton className="h-4 w-full" />
                        </TableCell>
                      ))}
                    </TableRow>
                  ))
                : assignmentRows.length === 0
                  ? (
                    <TableRow>
                      <TableCell
                        colSpan={canEdit ? 6 : 5}
                        className="py-8 text-center text-muted-foreground"
                      >
                        No department assignments found.
                      </TableCell>
                    </TableRow>
                  )
                  : assignmentRows.map((assignment) => (
                    <TableRow key={assignment.id} className={!assignment.isActive ? "opacity-60" : ""}>
                      <TableCell className="font-medium">
                        {assignment.staffProfile?.user?.name ?? assignment.staffProfile?.employeeId ?? "Unnamed"}
                        <div className="text-xs text-muted-foreground">
                          {assignment.staffProfile?.employeeId ?? ""}
                        </div>
                      </TableCell>
                      <TableCell>
                        {assignment.department?.name ?? assignment.departmentId}
                        <div className="text-xs text-muted-foreground">
                          {assignment.department?.code ?? ""}
                        </div>
                      </TableCell>
                      <TableCell className="capitalize">{assignment.role.replace("_", " ")}</TableCell>
                      <TableCell>
                        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${assignment.isActive ? "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300" : "bg-muted text-muted-foreground"}`}>
                          {assignment.isActive ? "Active" : "Inactive"}
                        </span>
                      </TableCell>
                      <TableCell className="max-w-[16rem] truncate text-sm text-muted-foreground">
                        {assignment.note ?? "-"}
                      </TableCell>
                      {canEdit && (
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <Button
                              size="icon"
                              variant="ghost"
                              className="size-7"
                              onClick={() => setEditTarget(assignment)}
                            >
                              <Pencil className="size-3.5" />
                            </Button>
                            {assignment.isActive && (
                              <Button
                                size="icon"
                                variant="ghost"
                                className="size-7 text-destructive hover:text-destructive"
                                onClick={() => setDeactivateTarget(assignment)}
                              >
                                <PowerOff className="size-3.5" />
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
            </TableBody>
          </Table>
        </div>
      </Main>

          {canEdit && (
            <AssignmentDialog
              open={createOpen}
              title="Add Assignment"
          staff={staffRows}
          departments={departmentRows}
          onClose={() => setCreateOpen(false)}
          onSubmit={(values) => createMutation.mutate(values)}
          isLoading={createMutation.isPending}
        />
      )}

          {canEdit && editTarget && (
            <AssignmentDialog
              open
              title="Edit Assignment"
          staff={staffRows}
          departments={departmentRows}
          initial={editTarget}
          onClose={() => setEditTarget(null)}
          onSubmit={(values) => updateMutation.mutate({ id: editTarget.id, ...values })}
          isLoading={updateMutation.isPending}
        />
      )}

      <Dialog
        open={deactivateTarget !== null}
        onOpenChange={(o) => { if (!o) setDeactivateTarget(null); }}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Deactivate Assignment</DialogTitle>
            <DialogDescription>
              Deactivate the{" "}
              <span className="font-medium text-foreground">
                {deactivateTarget?.role.replace("_", " ")}
              </span>{" "}
              assignment for{" "}
              <span className="font-medium text-foreground">
                {deactivateTarget?.staffProfile?.user?.name
                  ?? deactivateTarget?.staffProfile?.employeeId
                  ?? "this staff member"}
              </span>
              ? The record is preserved but the assignment will no longer be
              active.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => setDeactivateTarget(null)}
              disabled={deactivateMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={deactivateMutation.isPending}
              onClick={() => {
                if (deactivateTarget) deactivateMutation.mutate({ id: deactivateTarget.id });
              }}
            >
              {deactivateMutation.isPending ? "Deactivating…" : "Deactivate"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

type AssignmentDialogProps = {
  open: boolean;
  title: string;
  staff: StaffRow[];
  departments: DepartmentRow[];
  initial?: AssignmentRow | null;
  onClose: () => void;
  onSubmit: (values: {
    staffProfileId: string;
    departmentId: string;
    role: "manager" | "pa" | "team_lead" | "supervisor";
    note?: string;
    isActive?: boolean;
  }) => void;
  isLoading: boolean;
};

function AssignmentDialog({
  open,
  title,
  staff,
  departments,
  initial,
  onClose,
  onSubmit,
  isLoading,
}: AssignmentDialogProps) {
  const [staffProfileId, setStaffProfileId] = useState(initial?.staffProfileId ?? staff[0]?.id ?? "");
  const [departmentId, setDepartmentId] = useState(initial?.departmentId ?? departments[0]?.id ?? "");
  const [role, setRole] = useState<"manager" | "pa" | "team_lead" | "supervisor">(initial?.role ?? "manager");
  const [note, setNote] = useState(initial?.note ?? "");

  useEffect(() => {
    if (!open) {
      return;
    }

    setStaffProfileId(initial?.staffProfileId ?? staff[0]?.id ?? "");
    setDepartmentId(initial?.departmentId ?? departments[0]?.id ?? "");
    setRole(initial?.role ?? "manager");
    setNote(initial?.note ?? "");
  }, [open, initial, staff, departments]);

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    onSubmit({
      staffProfileId,
      departmentId,
      role,
      note: note.trim() || undefined,
      isActive: initial?.isActive ?? true,
    });
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <form className="space-y-4 pt-2" onSubmit={handleSubmit}>
          <div className="space-y-1.5">
            <Label htmlFor="assignment-staff">Staff</Label>
            <select
              id="assignment-staff"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={staffProfileId}
              onChange={(event) => setStaffProfileId(event.target.value)}
              required
            >
              {staff.map((person) => (
                <option key={person.id} value={person.id}>
                  {person.name} ({person.employeeId})
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="assignment-dept">Department</Label>
            <select
              id="assignment-dept"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={departmentId}
              onChange={(event) => setDepartmentId(event.target.value)}
              required
            >
              {departments.map((department) => (
                <option key={department.id} value={department.id}>
                  {department.name} ({department.code})
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="assignment-role">Role</Label>
            <select
              id="assignment-role"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={role}
              onChange={(event) =>
                setRole(
                  event.target.value as
                    | "manager"
                    | "pa"
                    | "team_lead"
                    | "supervisor",
                )
              }
              required
            >
              <option value="manager">Manager</option>
              <option value="pa">PA</option>
              <option value="team_lead">Team Lead</option>
              <option value="supervisor">Supervisor</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="assignment-note">Note</Label>
            <Textarea
              id="assignment-note"
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="Optional note"
              rows={3}
            />
          </div>
          <DialogFooter className="pt-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={isLoading || !staffProfileId || !departmentId}>
              {isLoading ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
