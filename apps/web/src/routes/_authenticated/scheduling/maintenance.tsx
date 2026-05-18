// /scheduling/maintenance — Quarterly Maintenance Tasks
// Replaces: apps/web/src/routes/_authenticated/scheduling/maintenance.tsx
//
// ⚠️  BUG FIX: Old file called orpc.roster.maintenance.* — correct router is
//     orpc.scheduling.maintenance.* (see fix notes below marked [FIX])
//
// Multi-view page (see CLAUDE.md "Multi-View Pages Pattern"):
//   • Quarters — tasks grouped by quarter in collapsible sections (the default)
//   • Board    — kanban grouped by completion status
//   • List     — compact paginated table of every task
//
// Design changes from original:
//   • Create form is SECONDARY — accessed via "Add Task" button → Dialog
//   • Status badge colours: pending=muted, in_progress=amber, complete=blue, deferred=red
//   • Each task shows assigned staff as initials chips + completion date

import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import {
  CheckCircle2, ChevronDown, ChevronRight, Columns3, LayoutGrid, List,
  Pencil, Plus, Trash2, Wrench,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@ndma-dcs-staff-portal/ui/components/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@ndma-dcs-staff-portal/ui/components/dialog";
import { Input } from "@ndma-dcs-staff-portal/ui/components/input";
import { Label } from "@ndma-dcs-staff-portal/ui/components/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@ndma-dcs-staff-portal/ui/components/select";
import { Skeleton } from "@ndma-dcs-staff-portal/ui/components/skeleton";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@ndma-dcs-staff-portal/ui/components/table";
import { Textarea } from "@ndma-dcs-staff-portal/ui/components/textarea";
import { DataPagination, usePagination } from "@/components/data-pagination";
import { StatusLegend } from "@/components/status-legend";
import { Header } from "@/components/layout/header";
import { Main } from "@/components/layout/main";
import { ThemeSwitch } from "@/components/theme-switch";
import { SchedulingSubNav } from "@/components/layout/scheduling-sub-nav";
import { TONES } from "@/lib/status-colors";
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
// Colours sourced from the central status-color system so a hue means the same
// thing across the app: pending=neutral, in_progress=amber, complete=blue,
// deferred=red.

type ViewMode = "quarters" | "board" | "list";

const STATUS_ORDER: CompletionStatus[] = ["pending", "in_progress", "complete", "deferred"];

const STATUS_META: Record<CompletionStatus, { label: string; tone: typeof TONES.amber }> = {
  pending:     { label: "Pending",     tone: TONES.neutral },
  in_progress: { label: "In progress", tone: TONES.amber },
  complete:    { label: "Complete",    tone: TONES.blue },
  deferred:    { label: "Deferred",    tone: TONES.red },
};

const STATUS_LEGEND = STATUS_ORDER.map((s) => ({
  label: STATUS_META[s].label,
  tone: STATUS_META[s].tone,
}));

const VIEW_OPTIONS: { mode: ViewMode; label: string; Icon: typeof List }[] = [
  { mode: "quarters", label: "Quarters", Icon: LayoutGrid },
  { mode: "board",    label: "Board",    Icon: Columns3 },
  { mode: "list",     label: "List",     Icon: List },
];

function StatusBadge({ status }: { status: CompletionStatus }) {
  const meta = STATUS_META[status] ?? STATUS_META.pending;
  return (
    <span className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-[11px] font-medium ${meta.tone.badge}`}>
      <span className={`size-1.5 rounded-full ${meta.tone.dot}`} aria-hidden />
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

// ── Add / Edit Task Dialog ─────────────────────────────────────────────────────

type AddForm = {
  taskName: string; quarter: string; year: string;
  completionStatus: CompletionStatus; completionNotes: string;
  assignedStaffIds: string[];
};

function AddTaskDialog({
  open, onOpenChange, defaultYear, defaultQuarter, staffList, editTask,
}: {
  open: boolean; onOpenChange: (v: boolean) => void;
  defaultYear: number; defaultQuarter: number;
  staffList: Array<{ id: string; employeeId?: string; user?: { name?: string | null } | null }>;
  editTask?: MaintenanceTask | null;
}) {
  const queryClient = useQueryClient();
  const isEditing = Boolean(editTask);

  const [form, setForm] = useState<AddForm>({
    taskName:         editTask?.taskName ?? "",
    quarter:          String(editTask?.quarter ?? defaultQuarter),
    year:             String(editTask?.year ?? defaultYear),
    completionStatus: editTask?.completionStatus ?? "pending",
    completionNotes:  editTask?.completionNotes ?? "",
    assignedStaffIds: editTask?.assignedStaffIds ?? [],
  });

  // Reset form when dialog opens (or editTask changes)
  useEffect(() => {
    if (open) {
      setForm({
        taskName:         editTask?.taskName ?? "",
        quarter:          String(editTask?.quarter ?? defaultQuarter),
        year:             String(editTask?.year ?? defaultYear),
        completionStatus: editTask?.completionStatus ?? "pending",
        completionNotes:  editTask?.completionNotes ?? "",
        assignedStaffIds: editTask?.assignedStaffIds ?? [],
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editTask?.id]);

  // [FIX] Use orpc.scheduling.maintenance.upsert (not orpc.roster.maintenance.create)
  const mutation = useMutation(
    orpc.scheduling.maintenance.upsert.mutationOptions({
      onSuccess: () => {
        toast.success(isEditing ? "Task updated" : "Task created");
        queryClient.invalidateQueries({ queryKey: orpc.scheduling.maintenance.list.key() });
        onOpenChange(false);
        setForm({ taskName: "", quarter: String(defaultQuarter), year: String(defaultYear), completionStatus: "pending", completionNotes: "", assignedStaffIds: [] });
      },
      onError: (err: Error) => toast.error(err.message ?? "Failed to save task"),
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
          <DialogTitle>{isEditing ? "Edit Maintenance Task" : "Add Maintenance Task"}</DialogTitle>
          <DialogDescription>
            {isEditing ? "Update the task details below." : "Fill in the details to add a new maintenance task."}
          </DialogDescription>
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
                const name = s.user?.name ?? s.employeeId ?? "Unnamed";
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
              {mutation.isPending ? "Saving…" : isEditing ? "Save changes" : "Create task"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── Delete Confirm Dialog ──────────────────────────────────────────────────────

function DeleteTaskDialog({
  task, onClose,
}: {
  task: MaintenanceTask | null;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const deleteMutation = useMutation(
    orpc.scheduling.maintenance.delete.mutationOptions({
      onSuccess: () => {
        toast.success("Task deleted");
        queryClient.invalidateQueries({ queryKey: orpc.scheduling.maintenance.list.key() });
        onClose();
      },
      onError: (err: Error) => toast.error(err.message ?? "Failed to delete task"),
    }),
  );

  return (
    <Dialog open={Boolean(task)} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Delete Task</DialogTitle>
          <DialogDescription>
            Are you sure you want to permanently delete &ldquo;{task?.taskName}&rdquo;? This cannot be undone.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} disabled={deleteMutation.isPending}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            disabled={deleteMutation.isPending}
            onClick={() => { if (task) deleteMutation.mutate({ id: task.id }); }}
          >
            {deleteMutation.isPending ? "Deleting…" : "Delete"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Quarter section ────────────────────────────────────────────────────────────

function QuarterSection({ quarter, year, tasks, staffById, defaultOpen, onEdit, onDelete }: {
  quarter: number; year: number;
  tasks: MaintenanceTask[];
  staffById: Record<string, { user?: { name?: string | null } | null }>;
  defaultOpen: boolean;
  onEdit: (task: MaintenanceTask) => void;
  onDelete: (task: MaintenanceTask) => void;
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
                <span
                  className={`mt-1.5 size-2.5 shrink-0 rounded-full ${STATUS_META[task.completionStatus]?.tone.dot ?? TONES.neutral.dot}`}
                  aria-hidden
                />

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

                {/* Edit + Delete actions */}
                <div className="flex shrink-0 items-center gap-1">
                  <Button
                    size="icon" variant="ghost"
                    className="size-7 text-muted-foreground hover:text-foreground"
                    onClick={() => onEdit(task)}
                    title="Edit task"
                  >
                    <Pencil className="size-3.5" />
                  </Button>
                  <Button
                    size="icon" variant="ghost"
                    className="size-7 text-destructive hover:text-destructive/80"
                    onClick={() => onDelete(task)}
                    title="Delete task"
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

// ── Board view — kanban grouped by completion status ──────────────────────────

function BoardView({ tasks, staffById, onEdit, onDelete }: {
  tasks: MaintenanceTask[];
  staffById: Record<string, { user?: { name?: string | null } | null }>;
  onEdit: (task: MaintenanceTask) => void;
  onDelete: (task: MaintenanceTask) => void;
}) {
  return (
    <div className="flex gap-4 overflow-x-auto pb-2">
      {STATUS_ORDER.map((status) => {
        const meta = STATUS_META[status];
        const colTasks = tasks.filter((t) => t.completionStatus === status);
        return (
          <section
            key={status}
            aria-label={`${meta.label} tasks`}
            className="flex w-72 shrink-0 flex-col rounded-xl border bg-muted/20"
          >
            <header className={`flex items-center gap-2 rounded-t-xl border-b px-3 py-2.5 ${meta.tone.bg}`}>
              <span className={`size-2 rounded-full ${meta.tone.dot}`} aria-hidden />
              <h3 className={`text-sm font-semibold ${meta.tone.text}`}>{meta.label}</h3>
              <span className="ml-auto rounded-full bg-background/70 px-2 py-0.5 text-xs font-medium tabular-nums">
                {colTasks.length}
              </span>
            </header>
            <div className="flex flex-col gap-2 p-2.5">
              {colTasks.length === 0 ? (
                <p className="px-1 py-6 text-center text-xs text-muted-foreground">No tasks</p>
              ) : (
                colTasks.map((task) => (
                  <article
                    key={task.id}
                    className={`rounded-lg border-l-4 bg-background p-3 shadow-sm ${meta.tone.border}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-sm font-medium leading-snug">{task.taskName}</span>
                      <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-muted-foreground">
                        Q{task.quarter}
                      </span>
                    </div>
                    {task.completionDate && (
                      <p className="mt-1 font-mono text-[11px] text-muted-foreground">
                        {format(parseISO(task.completionDate), "d MMM yyyy")}
                      </p>
                    )}
                    {task.completionNotes && (
                      <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{task.completionNotes}</p>
                    )}
                    {task.assignedStaffIds.length > 0 && (
                      <div className="mt-2 flex flex-wrap items-center gap-1">
                        {task.assignedStaffIds.map((id) => (
                          <StaffInitialsChip key={id} name={staffById[id]?.user?.name} />
                        ))}
                      </div>
                    )}
                    <div className="mt-2 flex items-center justify-end gap-1 border-t pt-1.5">
                      <Button
                        size="icon" variant="ghost"
                        className="size-7 text-muted-foreground hover:text-foreground"
                        onClick={() => onEdit(task)}
                        aria-label={`Edit ${task.taskName}`}
                      >
                        <Pencil className="size-3.5" />
                      </Button>
                      <Button
                        size="icon" variant="ghost"
                        className="size-7 text-destructive hover:text-destructive/80"
                        onClick={() => onDelete(task)}
                        aria-label={`Delete ${task.taskName}`}
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                  </article>
                ))
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}

// ── List view — compact paginated table of every task ─────────────────────────

function ListView({ tasks, staffById, onEdit, onDelete }: {
  tasks: MaintenanceTask[];
  staffById: Record<string, { user?: { name?: string | null } | null }>;
  onEdit: (task: MaintenanceTask) => void;
  onDelete: (task: MaintenanceTask) => void;
}) {
  const sorted = useMemo(
    () => [...tasks].sort((a, b) => a.quarter - b.quarter || a.taskName.localeCompare(b.taskName)),
    [tasks],
  );
  const pagination = usePagination(sorted, 15);

  if (tasks.length === 0) {
    return (
      <div className="rounded-lg border border-dashed py-16 text-center text-sm text-muted-foreground">
        No maintenance tasks for this year yet.
      </div>
    );
  }

  return (
    <>
      <div className="overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead scope="col" className="w-16">Quarter</TableHead>
              <TableHead scope="col">Task</TableHead>
              <TableHead scope="col" className="w-36">Status</TableHead>
              <TableHead scope="col">Assigned</TableHead>
              <TableHead scope="col" className="w-32">Completed</TableHead>
              <TableHead scope="col" className="w-20 text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {pagination.pageItems.map((task) => (
              <TableRow key={task.id}>
                <TableCell className="font-mono font-semibold">Q{task.quarter}</TableCell>
                <TableCell>
                  <span className="font-medium">{task.taskName}</span>
                  {task.completionNotes && (
                    <p className="mt-0.5 text-xs text-muted-foreground">{task.completionNotes}</p>
                  )}
                </TableCell>
                <TableCell><StatusBadge status={task.completionStatus} /></TableCell>
                <TableCell>
                  {task.assignedStaffIds.length === 0 ? (
                    <span className="text-xs italic text-muted-foreground">Unassigned</span>
                  ) : (
                    <div className="flex flex-wrap items-center gap-1">
                      {task.assignedStaffIds.map((id) => (
                        <StaffInitialsChip key={id} name={staffById[id]?.user?.name} />
                      ))}
                    </div>
                  )}
                </TableCell>
                <TableCell className="font-mono text-xs text-muted-foreground">
                  {task.completionDate ? format(parseISO(task.completionDate), "d MMM yyyy") : "—"}
                </TableCell>
                <TableCell>
                  <div className="flex items-center justify-end gap-1">
                    <Button
                      size="icon" variant="ghost"
                      className="size-7 text-muted-foreground hover:text-foreground"
                      onClick={() => onEdit(task)}
                      aria-label={`Edit ${task.taskName}`}
                    >
                      <Pencil className="size-3.5" />
                    </Button>
                    <Button
                      size="icon" variant="ghost"
                      className="size-7 text-destructive hover:text-destructive/80"
                      onClick={() => onDelete(task)}
                      aria-label={`Delete ${task.taskName}`}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <DataPagination
        page={pagination.page}
        pageCount={pagination.pageCount}
        total={pagination.total}
        rangeLabel={pagination.rangeLabel}
        onPageChange={pagination.setPage}
        className="mt-2"
      />
    </>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────

function SchedulingMaintenancePage() {
  const currentYear = new Date().getFullYear();
  const currentQ    = Math.ceil((new Date().getMonth() + 1) / 3);
  const [year, setYear]           = useState(currentYear);
  const [viewMode, setViewMode]   = useState<ViewMode>("quarters");
  const [addOpen, setAddOpen]     = useState(false);
  const [editTask, setEditTask]   = useState<MaintenanceTask | null>(null);
  const [deleteTask, setDeleteTask] = useState<MaintenanceTask | null>(null);

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

  const allTasks = (tasks ?? []) as MaintenanceTask[];

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
          <div className="flex flex-wrap items-center gap-2">
            {/* View-mode toggle */}
            <div
              className="inline-flex rounded-lg border p-0.5"
              role="group"
              aria-label="Maintenance view mode"
            >
              {VIEW_OPTIONS.map(({ mode, label, Icon }) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setViewMode(mode)}
                  aria-pressed={viewMode === mode}
                  className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 ${
                    viewMode === mode
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Icon className="size-3.5" />
                  {label}
                </button>
              ))}
            </div>
            <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
              <SelectTrigger className="w-[100px]" aria-label="Year"><SelectValue /></SelectTrigger>
              <SelectContent>
                {[currentYear - 1, currentYear, currentYear + 1].map((y) => (
                  <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button onClick={() => { setEditTask(null); setAddOpen(true); }}>
              <Plus className="size-4 mr-1" /> Add task
            </Button>
          </div>
        </div>

        {/* Status legend */}
        <div className="px-6 pb-3">
          <StatusLegend label="Status" items={STATUS_LEGEND} />
        </div>

        <div className="space-y-3 px-6 pb-6">
          {isLoading ? (
            Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-12 w-full rounded-lg" />)
          ) : viewMode === "quarters" ? (
            [1, 2, 3, 4].map((q) => (
              <QuarterSection
                key={q}
                quarter={q}
                year={year}
                tasks={allTasks.filter((t) => t.quarter === q)}
                staffById={staffById}
                defaultOpen={q === currentQ}
                onEdit={(task) => { setEditTask(task); setAddOpen(true); }}
                onDelete={(task) => setDeleteTask(task)}
              />
            ))
          ) : viewMode === "board" ? (
            <BoardView
              tasks={allTasks}
              staffById={staffById}
              onEdit={(task) => { setEditTask(task); setAddOpen(true); }}
              onDelete={(task) => setDeleteTask(task)}
            />
          ) : (
            <ListView
              tasks={allTasks}
              staffById={staffById}
              onEdit={(task) => { setEditTask(task); setAddOpen(true); }}
              onDelete={(task) => setDeleteTask(task)}
            />
          )}
        </div>
      </Main>

      <AddTaskDialog
        open={addOpen}
        onOpenChange={(v) => { setAddOpen(v); if (!v) setEditTask(null); }}
        defaultYear={year}
        defaultQuarter={currentQ}
        staffList={staffList}
        editTask={editTask}
      />

      <DeleteTaskDialog
        task={deleteTask}
        onClose={() => setDeleteTask(null)}
      />
    </>
  );
}
