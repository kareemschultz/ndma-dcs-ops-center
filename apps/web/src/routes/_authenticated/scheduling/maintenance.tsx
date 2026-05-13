// /scheduling/maintenance — Quarterly Maintenance Tasks
// Replaces: apps/web/src/routes/_authenticated/scheduling/maintenance.tsx
//
// ⚠️  BUG FIX: Old file called orpc.roster.maintenance.* — correct router is
//     orpc.scheduling.maintenance.* (see fix notes below marked [FIX])
//
// Design changes from original:
//   • Tasks are PRIMARY content — grouped by quarter in collapsible sections
//   • Create form is SECONDARY — accessed via "Add Task" button → Dialog
//   • Status badge colours: pending=muted, in_progress=amber, complete=blue, deferred=red
//   • Each task shows assigned staff as initials chips + completion date

import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import { CheckCircle2, ChevronDown, ChevronRight, Plus, Wrench } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@ndma-dcs-staff-portal/ui/components/button";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@ndma-dcs-staff-portal/ui/components/dialog";
import { Input } from "@ndma-dcs-staff-portal/ui/components/input";
import { Label } from "@ndma-dcs-staff-portal/ui/components/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@ndma-dcs-staff-portal/ui/components/select";
import { Skeleton } from "@ndma-dcs-staff-portal/ui/components/skeleton";
import { Textarea } from "@ndma-dcs-staff-portal/ui/components/textarea";
import { Header } from "@/components/layout/header";
import { Main } from "@/components/layout/main";
import { ThemeSwitch } from "@/components/theme-switch";
import { SchedulingSubNav } from "@/components/layout/scheduling-sub-nav";
import { orpc } from "@/utils/orpc";  // [FIX] use orpc.scheduling.maintenance.*

export const Route = createFileRoute("/_authenticated/scheduling/maintenance")({
  component: SchedulingMaintenancePage,
});

// ── Types ──────────────────────────────────────────────────────────────────────

type CompletionStatus = "pending" | "in_progress" | "complete" | "deferred";

type MaintenanceTask = {
  id: string; year: number; quarter: number; taskName: string;
  assignedStaffIds: string[]; completionStatus: CompletionStatus;
  completionDate: string | null; completionNotes: string | null;
};

// ── Status badge ───────────────────────────────────────────────────────────────

const STATUS_META: Record<CompletionStatus, { label: string; className: string }> = {
  pending:     { label: "Pending",     className: "bg-muted text-muted-foreground" },
  in_progress: { label: "In progress", className: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200" },
  complete:    { label: "Complete",    className: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200" },
  deferred:    { label: "Deferred",    className: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200" },
};

function StatusBadge({ status }: { status: CompletionStatus }) {
  const meta = STATUS_META[status] ?? STATUS_META.pending;
  return (
    <span className={`rounded px-2 py-0.5 text-[11px] font-medium ${meta.className}`}>
      {meta.label}
    </span>
  );
}

function StaffInitialsChip({ name }: { name: string | null | undefined }) {
  if (!name) return null;
  const abbr = name.split(" ").map((s) => s[0]).slice(0, 2).join("").toUpperCase();
  return (
    <span
      title={name}
      className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-blue-100 text-[10px] font-bold text-blue-800 dark:bg-blue-900/40 dark:text-blue-200"
    >
      {abbr}
    </span>
  );
}

// ── Add Task Dialog ────────────────────────────────────────────────────────────

type AddForm = {
  taskName: string; quarter: string; year: string;
  completionStatus: CompletionStatus; completionNotes: string;
  assignedStaffIds: string[];
};

function AddTaskDialog({
  open, onOpenChange, defaultYear, defaultQuarter, staffList,
}: {
  open: boolean; onOpenChange: (v: boolean) => void;
  defaultYear: number; defaultQuarter: number;
  staffList: Array<{ id: string; user?: { name?: string | null } | null }>;
}) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<AddForm>({
    taskName: "", quarter: String(defaultQuarter), year: String(defaultYear),
    completionStatus: "pending", completionNotes: "", assignedStaffIds: [],
  });

  // [FIX] Use orpc.scheduling.maintenance.upsert (not orpc.roster.maintenance.create)
  const mutation = useMutation(
    orpc.scheduling.maintenance.upsert.mutationOptions({
      onSuccess: () => {
        toast.success("Task created");
        queryClient.invalidateQueries({ queryKey: orpc.scheduling.maintenance.list.key() });
        onOpenChange(false);
        setForm((f) => ({ ...f, taskName: "", completionNotes: "", assignedStaffIds: [] }));
      },
      onError: (err: Error) => toast.error(err.message ?? "Failed to create task"),
    }),
  );

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.taskName.trim()) { toast.error("Task name is required"); return; }
    mutation.mutate({
      year:              Number(form.year),
      quarter:           Number(form.quarter),
      taskName:          form.taskName.trim(),
      assignedStaffIds:  form.assignedStaffIds,
      completionStatus:  form.completionStatus,
      completionNotes:   form.completionNotes || undefined,
    });
  }

  const toggleStaff = (id: string) =>
    setForm((f) => ({
      ...f,
      assignedStaffIds: f.assignedStaffIds.includes(id)
        ? f.assignedStaffIds.filter((s) => s !== id)
        : [...f.assignedStaffIds, id],
    }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add Maintenance Task</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="taskName">Task name *</Label>
            <Input
              id="taskName" required
              value={form.taskName}
              onChange={(e) => setForm((f) => ({ ...f, taskName: e.target.value }))}
              placeholder="e.g. UPS Battery Inspection"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Quarter</Label>
              <Select value={form.quarter} onValueChange={(v) => setForm((f) => ({ ...f, quarter: v ?? f.quarter }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {[1,2,3,4].map((q) => <SelectItem key={q} value={String(q)}>Q{q}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select
                value={form.completionStatus}
                onValueChange={(v) => setForm((f) => ({ ...f, completionStatus: v as CompletionStatus }))}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(STATUS_META) as CompletionStatus[]).map((s) => (
                    <SelectItem key={s} value={s}>{STATUS_META[s].label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Assign staff</Label>
            <div className="flex flex-wrap gap-1.5 rounded-md border p-2 min-h-[40px]">
              {staffList.length === 0 && (
                <span className="text-sm text-muted-foreground">Loading staff…</span>
              )}
              {staffList.map((s) => {
                const name = s.user?.name ?? s.id;
                const selected = form.assignedStaffIds.includes(s.id);
                return (
                  <button
                    key={s.id} type="button"
                    onClick={() => toggleStaff(s.id)}
                    className={[
                      "rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors",
                      selected
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground hover:bg-muted/80",
                    ].join(" ")}
                  >
                    {name}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="notes">Notes (optional)</Label>
            <Textarea
              id="notes" rows={2}
              value={form.completionNotes}
              onChange={(e) => setForm((f) => ({ ...f, completionNotes: e.target.value }))}
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={mutation.isPending}>
              Cancel
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? "Saving…" : "Create task"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── Quarter section ────────────────────────────────────────────────────────────

function QuarterSection({ quarter, year, tasks, staffById, defaultOpen }: {
  quarter: number; year: number;
  tasks: MaintenanceTask[];
  staffById: Record<string, { user?: { name?: string | null } | null }>;
  defaultOpen: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const done  = tasks.filter((t) => t.completionStatus === "complete").length;
  const total = tasks.length;

  return (
    <div className="overflow-hidden rounded-lg border">
      {/* Section header */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-3 bg-muted/40 px-4 py-3 hover:bg-muted/60 transition-colors"
      >
        {open ? <ChevronDown className="size-4 text-muted-foreground shrink-0" /> : <ChevronRight className="size-4 text-muted-foreground shrink-0" />}
        <span className="font-semibold">Q{quarter} {year}</span>

        {/* Inline progress bar */}
        <div className="flex flex-1 items-center gap-2 mx-2">
          <div className="flex-1 h-1.5 rounded-full bg-border overflow-hidden max-w-32">
            <div
              className="h-full rounded-full bg-primary transition-all"
              style={{ width: total ? `${(done / total) * 100}%` : "0%" }}
            />
          </div>
          <span className="text-xs text-muted-foreground tabular-nums">{done}/{total} done</span>
        </div>

        {/* Status summary chips */}
        <div className="ml-auto flex gap-1.5 shrink-0">
          {done === total && total > 0 && (
            <span className="flex items-center gap-1 rounded px-2 py-0.5 text-[11px] font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200">
              <CheckCircle2 className="size-3" /> All complete
            </span>
          )}
          {tasks.some((t) => t.completionStatus === "in_progress") && (
            <span className="rounded px-2 py-0.5 text-[11px] font-medium bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200">
              In progress
            </span>
          )}
          {total === 0 && (
            <span className="rounded px-2 py-0.5 text-[11px] font-medium bg-muted text-muted-foreground">No tasks</span>
          )}
        </div>
      </button>

      {/* Task list */}
      {open && (
        <div className="divide-y">
          {total === 0 ? (
            <div className="px-4 py-6 text-center text-sm text-muted-foreground">
              No tasks for Q{quarter} yet.
            </div>
          ) : (
            tasks.map((task) => (
              <div key={task.id} className="flex items-start gap-3 px-4 py-3">
                {/* Status dot */}
                <span className={[
                  "mt-1 size-2 shrink-0 rounded-full",
                  task.completionStatus === "complete"    ? "bg-primary" :
                  task.completionStatus === "in_progress" ? "bg-amber-500" :
                  task.completionStatus === "deferred"    ? "bg-red-500" :
                  "bg-muted-foreground/30",
                ].join(" ")} />

                <div className="flex-1 min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{task.taskName}</span>
                    <StatusBadge status={task.completionStatus} />
                    {task.completionDate && (
                      <span className="font-mono text-xs text-muted-foreground">
                        {format(parseISO(task.completionDate), "d MMM yyyy")}
                      </span>
                    )}
                  </div>

                  {task.completionNotes && (
                    <p className="text-sm text-muted-foreground">{task.completionNotes}</p>
                  )}

                  {task.assignedStaffIds.length > 0 && (
                    <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                      {task.assignedStaffIds.map((id) => (
                        <StaffInitialsChip key={id} name={staffById[id]?.user?.name} />
                      ))}
                      <span className="text-xs text-muted-foreground">
                        {task.assignedStaffIds
                          .map((id) => staffById[id]?.user?.name ?? id)
                          .join(", ")}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────

function SchedulingMaintenancePage() {
  const currentYear = new Date().getFullYear();
  const currentQ    = Math.ceil((new Date().getMonth() + 1) / 3);
  const [year, setYear]     = useState(currentYear);
  const [addOpen, setAddOpen] = useState(false);

  // [FIX] Use orpc.scheduling.maintenance.list (was orpc.roster.maintenance.list)
  const { data: tasks, isLoading } = useQuery(
    orpc.scheduling.maintenance.list.queryOptions({ input: { year } }),
  );

  // [FIX] Use orpc.staff.list for staff picker
  const { data: staffData } = useQuery(
    orpc.staff.list.queryOptions({ input: { limit: 200, offset: 0 } }),
  );
  const staffList = staffData ?? [];
  const staffById: Record<string, { user?: { name?: string | null } | null }> =
    Object.fromEntries(staffList.map((s) => [s.id, s]));

  return (
    <>
      <Header fixed>
        <div className="flex items-center gap-2">
          <Wrench className="size-4 text-muted-foreground" />
          <span className="text-sm font-medium">Maintenance Planner</span>
        </div>
        <div className="ms-auto flex items-center gap-2">
          <ThemeSwitch />
        </div>
      </Header>

      <Main className="p-0">
        <SchedulingSubNav activeView="maintenance" />

        <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-4">
          <div className="space-y-0.5">
            <h1 className="text-xl font-bold tracking-tight">Quarterly Maintenance</h1>
            <p className="text-sm text-muted-foreground">
              Recurring inspections, tests, and operational tasks.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
              <SelectTrigger className="w-[100px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                {[currentYear - 1, currentYear, currentYear + 1].map((y) => (
                  <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button onClick={() => setAddOpen(true)}>
              <Plus className="size-4 mr-1" /> Add task
            </Button>
          </div>
        </div>

        <div className="space-y-3 px-6 pb-6">
          {isLoading ? (
            Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-12 w-full rounded-lg" />)
          ) : (
            [1, 2, 3, 4].map((q) => (
              <QuarterSection
                key={q}
                quarter={q}
                year={year}
                tasks={(tasks ?? []).filter((t) => t.quarter === q) as MaintenanceTask[]}
                staffById={staffById}
                defaultOpen={q === currentQ}
              />
            ))
          )}
        </div>
      </Main>

      <AddTaskDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        defaultYear={year}
        defaultQuarter={currentQ}
        staffList={staffList}
      />
    </>
  );
}
