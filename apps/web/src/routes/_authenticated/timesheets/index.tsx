// /timesheets — Full timesheet management
//
// Features:
//  • List all timesheets with status badges + total hours
//  • Expand any row to view/add/delete individual entries (date, hours, category, description)
//  • Per-status actions: Submit (draft), Approve/Reject (submitted)
//  • Edit timesheet metadata (draft only)
//  • Create new timesheet dialog
//  • Filter by status + team
//  • Reject dialog with required reason field

import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import { useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  ClipboardList,
  Pencil,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { Header } from "@/components/layout/header";
import { Main } from "@/components/layout/main";
import { ThemeSwitch } from "@/components/theme-switch";
import { orpc } from "@/utils/orpc";
import { Badge } from "@ndma-dcs-staff-portal/ui/components/badge";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@ndma-dcs-staff-portal/ui/components/select";
import { Skeleton } from "@ndma-dcs-staff-portal/ui/components/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@ndma-dcs-staff-portal/ui/components/table";
import { Textarea } from "@ndma-dcs-staff-portal/ui/components/textarea";

export const Route = createFileRoute("/_authenticated/timesheets/")({
  component: TimesheetsPage,
});

// ─── Types ────────────────────────────────────────────────────────────────────

type TimesheetStatus = "draft" | "submitted" | "approved" | "rejected" | "closed";

const STATUS_LABEL: Record<TimesheetStatus, string> = {
  draft: "Draft",
  submitted: "Pending Review",
  approved: "Approved",
  rejected: "Rejected",
  closed: "Closed",
};

const STATUS_CLASS: Record<TimesheetStatus, string> = {
  draft: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  submitted: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
  approved: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  rejected: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
  closed: "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400",
};

const ENTRY_CATEGORIES = [
  "Regular",
  "Overtime",
  "On-Call",
  "Training",
  "Administrative",
  "Incident Response",
  "Maintenance",
  "Other",
] as const;

// ─── Create Timesheet Dialog ──────────────────────────────────────────────────

function CreateTimesheetDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const { data: staff } = useQuery(
    orpc.staff.list.queryOptions({ input: { limit: 200, offset: 0 } }),
  );
  const [form, setForm] = useState({
    staffProfileId: "",
    title: "",
    periodStart: "",
    periodEnd: "",
  });

  const mutation = useMutation(
    orpc.timesheets.create.mutationOptions({
      onSuccess: async () => {
        toast.success("Timesheet created");
        await queryClient.invalidateQueries({
          queryKey: orpc.timesheets.list.key(),
        });
        onOpenChange(false);
        setForm({ staffProfileId: "", title: "", periodStart: "", periodEnd: "" });
      },
      onError: (error: Error) =>
        toast.error(error.message ?? "Failed to create timesheet"),
    }),
  );

  function submit() {
    if (
      !form.staffProfileId ||
      !form.title ||
      !form.periodStart ||
      !form.periodEnd
    ) {
      toast.error("All fields are required.");
      return;
    }
    mutation.mutate({
      staffProfileId: form.staffProfileId,
      title: form.title,
      periodStart: form.periodStart,
      periodEnd: form.periodEnd,
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>New Timesheet</DialogTitle>
          <DialogDescription>
            Create a timesheet record for a staff member.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>Staff Member</Label>
            <Select
              value={form.staffProfileId}
              onValueChange={(v) =>
                setForm((c) => ({ ...c, staffProfileId: v ?? "" }))
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Select staff member" />
              </SelectTrigger>
              <SelectContent>
                {staff?.map((person) => (
                  <SelectItem key={person.id} value={person.id}>
                    {person.user?.name ?? person.id}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ts-title">Title</Label>
            <Input
              id="ts-title"
              value={form.title}
              onChange={(e) =>
                setForm((c) => ({ ...c, title: e.target.value }))
              }
              placeholder="e.g. April Operations"
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="ts-start">Period Start</Label>
              <Input
                id="ts-start"
                type="date"
                value={form.periodStart}
                onChange={(e) =>
                  setForm((c) => ({ ...c, periodStart: e.target.value }))
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ts-end">Period End</Label>
              <Input
                id="ts-end"
                type="date"
                value={form.periodEnd}
                onChange={(e) =>
                  setForm((c) => ({ ...c, periodEnd: e.target.value }))
                }
              />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={mutation.isPending}
          >
            Cancel
          </Button>
          <Button onClick={submit} disabled={mutation.isPending}>
            {mutation.isPending ? "Saving…" : "Create Timesheet"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Edit Timesheet Dialog ────────────────────────────────────────────────────

function EditTimesheetDialog({
  timesheet,
  onClose,
}: {
  timesheet: { id: string; title: string; periodStart: string; periodEnd: string };
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    title: timesheet.title,
    periodStart: timesheet.periodStart,
    periodEnd: timesheet.periodEnd,
  });

  const mutation = useMutation(
    orpc.timesheets.update.mutationOptions({
      onSuccess: async () => {
        toast.success("Timesheet updated");
        await queryClient.invalidateQueries({
          queryKey: orpc.timesheets.list.key(),
        });
        onClose();
      },
      onError: (e: Error) => toast.error(e.message),
    }),
  );

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit Timesheet</DialogTitle>
          <DialogDescription>
            Only draft timesheets can be edited.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="edit-title">Title</Label>
            <Input
              id="edit-title"
              value={form.title}
              onChange={(e) => setForm((c) => ({ ...c, title: e.target.value }))}
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="edit-start">Period Start</Label>
              <Input
                id="edit-start"
                type="date"
                value={form.periodStart}
                onChange={(e) =>
                  setForm((c) => ({ ...c, periodStart: e.target.value }))
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-end">Period End</Label>
              <Input
                id="edit-end"
                type="date"
                value={form.periodEnd}
                onChange={(e) =>
                  setForm((c) => ({ ...c, periodEnd: e.target.value }))
                }
              />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={mutation.isPending}>
            Cancel
          </Button>
          <Button
            onClick={() =>
              mutation.mutate({ id: timesheet.id, ...form })
            }
            disabled={mutation.isPending}
          >
            {mutation.isPending ? "Saving…" : "Save Changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Add Entry Dialog ─────────────────────────────────────────────────────────

function AddEntryDialog({
  timesheetId,
  onClose,
}: {
  timesheetId: string;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    workDate: new Date().toISOString().slice(0, 10),
    hours: "",
    category: "Regular",
    description: "",
  });

  const mutation = useMutation(
    orpc.timesheets.addEntry.mutationOptions({
      onSuccess: async () => {
        toast.success("Entry added");
        await queryClient.invalidateQueries({
          queryKey: orpc.timesheets.list.key(),
        });
        onClose();
      },
      onError: (e: Error) => toast.error(e.message),
    }),
  );

  function submit() {
    const hours = parseFloat(form.hours);
    if (!form.workDate || isNaN(hours) || hours < 0.25) {
      toast.error("Valid date and hours (≥ 0.25) required.");
      return;
    }
    mutation.mutate({
      timesheetId,
      workDate: form.workDate,
      hours,
      category: form.category,
      description: form.description || undefined,
    });
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add Entry</DialogTitle>
          <DialogDescription>Record hours worked for a specific day.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="entry-date">Date</Label>
              <Input
                id="entry-date"
                type="date"
                value={form.workDate}
                onChange={(e) => setForm((c) => ({ ...c, workDate: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="entry-hours">Hours</Label>
              <Input
                id="entry-hours"
                type="number"
                step="0.25"
                min="0.25"
                max="24"
                placeholder="e.g. 8"
                value={form.hours}
                onChange={(e) => setForm((c) => ({ ...c, hours: e.target.value }))}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Category</Label>
            <Select
              value={form.category}
              onValueChange={(v) => setForm((c) => ({ ...c, category: v ?? "Regular" }))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ENTRY_CATEGORIES.map((cat) => (
                  <SelectItem key={cat} value={cat}>
                    {cat}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="entry-desc">Description (optional)</Label>
            <Textarea
              id="entry-desc"
              rows={2}
              placeholder="What was worked on…"
              value={form.description}
              onChange={(e) => setForm((c) => ({ ...c, description: e.target.value }))}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={mutation.isPending}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={mutation.isPending}>
            {mutation.isPending ? "Adding…" : "Add Entry"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Reject Dialog ────────────────────────────────────────────────────────────

function RejectDialog({
  timesheetId,
  onClose,
}: {
  timesheetId: string;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [reason, setReason] = useState("");

  const mutation = useMutation(
    orpc.timesheets.reject.mutationOptions({
      onSuccess: async () => {
        toast.success("Timesheet rejected");
        await queryClient.invalidateQueries({
          queryKey: orpc.timesheets.list.key(),
        });
        onClose();
      },
      onError: (e: Error) => toast.error(e.message),
    }),
  );

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Reject Timesheet</DialogTitle>
          <DialogDescription>Provide a reason for rejection.</DialogDescription>
        </DialogHeader>

        <div className="py-2 space-y-1.5">
          <Label htmlFor="reject-reason">Reason</Label>
          <Textarea
            id="reject-reason"
            rows={3}
            placeholder="Explain why this timesheet is being rejected…"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={mutation.isPending}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            disabled={mutation.isPending || !reason.trim()}
            onClick={() => mutation.mutate({ id: timesheetId, reason: reason.trim() })}
          >
            {mutation.isPending ? "Rejecting…" : "Reject"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Expanded Entries Panel ───────────────────────────────────────────────────

function EntriesPanel({
  timesheet,
}: {
  timesheet: {
    id: string;
    status: string;
    entries?: Array<{
      id: string;
      workDate: string;
      hours: string | number | null;
      category: string;
      description: string | null;
    }> | null;
  };
}) {
  const queryClient = useQueryClient();
  const [addOpen, setAddOpen] = useState(false);
  const isDraft = timesheet.status === "draft";

  const removeMutation = useMutation(
    orpc.timesheets.removeEntry.mutationOptions({
      onSuccess: async () => {
        toast.success("Entry removed");
        await queryClient.invalidateQueries({
          queryKey: orpc.timesheets.list.key(),
        });
      },
      onError: (e: Error) => toast.error(e.message),
    }),
  );

  const entries = timesheet.entries ?? [];

  return (
    <div className="bg-muted/30 border-t px-4 py-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
          Time Entries ({entries.length})
        </span>
        {isDraft && (
          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setAddOpen(true)}>
            <Plus className="size-3 mr-1" />
            Add Entry
          </Button>
        )}
      </div>

      {entries.length === 0 ? (
        <p className="text-sm text-muted-foreground py-2">
          No entries yet.{isDraft ? " Add entries using the button above." : ""}
        </p>
      ) : (
        <div className="rounded-md border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/60 border-b">
                <th className="text-left px-3 py-1.5 text-xs font-medium text-muted-foreground">Date</th>
                <th className="text-left px-3 py-1.5 text-xs font-medium text-muted-foreground">Hours</th>
                <th className="text-left px-3 py-1.5 text-xs font-medium text-muted-foreground">Category</th>
                <th className="text-left px-3 py-1.5 text-xs font-medium text-muted-foreground">Description</th>
                {isDraft && <th className="w-8 px-2 py-1.5" />}
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                <tr key={entry.id} className="border-b last:border-0 hover:bg-muted/20">
                  <td className="px-3 py-2 font-mono text-xs">
                    {entry.workDate ? format(parseISO(entry.workDate), "dd MMM yyyy") : "—"}
                  </td>
                  <td className="px-3 py-2 font-semibold">{entry.hours ?? "—"}</td>
                  <td className="px-3 py-2">
                    <span className="text-xs bg-primary/10 text-primary rounded px-1.5 py-0.5">
                      {entry.category}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-muted-foreground text-xs max-w-xs truncate">
                    {entry.description || "—"}
                  </td>
                  {isDraft && (
                    <td className="px-2 py-2">
                      <button
                        className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                        disabled={removeMutation.isPending}
                        onClick={() => {
                          if (confirm("Remove this entry?")) {
                            removeMutation.mutate({ id: entry.id });
                          }
                        }}
                      >
                        <X className="size-3.5" />
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {addOpen && (
        <AddEntryDialog timesheetId={timesheet.id} onClose={() => setAddOpen(false)} />
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

function TimesheetsPage() {
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [teamFilter, setTeamFilter] = useState<string>("all");
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [editTimesheet, setEditTimesheet] = useState<{
    id: string;
    title: string;
    periodStart: string;
    periodEnd: string;
  } | null>(null);
  const [rejectId, setRejectId] = useState<string | null>(null);

  const { data, isLoading } = useQuery(
    orpc.timesheets.list.queryOptions({
      input: {
        status: statusFilter !== "all" ? (statusFilter as TimesheetStatus) : undefined,
        team:
          teamFilter !== "all"
            ? (teamFilter as "DCS" | "NOC")
            : undefined,
      },
    }),
  );

  const submitMutation = useMutation(
    orpc.timesheets.submit.mutationOptions({
      onSuccess: async () => {
        toast.success("Timesheet submitted for review");
        await queryClient.invalidateQueries({
          queryKey: orpc.timesheets.list.key(),
        });
      },
      onError: (e: Error) => toast.error(e.message),
    }),
  );

  const approveMutation = useMutation(
    orpc.timesheets.approve.mutationOptions({
      onSuccess: async () => {
        toast.success("Timesheet approved");
        await queryClient.invalidateQueries({
          queryKey: orpc.timesheets.list.key(),
        });
      },
      onError: (e: Error) => toast.error(e.message),
    }),
  );

  function toggleExpand(id: string) {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  const timesheets = data ?? [];

  return (
    <>
      <Header fixed>
        <div className="flex items-center gap-2">
          <ClipboardList className="size-4 text-muted-foreground" />
          <span className="text-sm font-medium">Timesheets</span>
        </div>
        <div className="ms-auto flex items-center gap-2">
          <ThemeSwitch />
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="mr-1.5 size-4" />
            New Timesheet
          </Button>
        </div>
      </Header>

      <Main>
        <div className="mb-6">
          <h1 className="text-2xl font-bold tracking-tight">Timesheets</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Track period submissions, time entries, and approvals for operational work.
          </p>
        </div>

        {/* Filters */}
        <div className="mb-4 flex flex-wrap gap-3">
          <div className="flex flex-col gap-1">
            <span className="text-xs text-muted-foreground">Status</span>
            <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v ?? "all")}>
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="draft">Draft</SelectItem>
                <SelectItem value="submitted">Pending Review</SelectItem>
                <SelectItem value="approved">Approved</SelectItem>
                <SelectItem value="rejected">Rejected</SelectItem>
                <SelectItem value="closed">Closed</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs text-muted-foreground">Team</span>
            <Select value={teamFilter} onValueChange={(v) => setTeamFilter(v ?? "all")}>
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All teams</SelectItem>
                <SelectItem value="DCS">DCS</SelectItem>
                <SelectItem value="NOC">NOC</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="rounded-xl border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8" />
                <TableHead>Staff</TableHead>
                <TableHead>Period</TableHead>
                <TableHead>Title</TableHead>
                <TableHead className="text-right">Hours</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 7 }).map((_, j) => (
                      <TableCell key={j}>
                        <Skeleton className="h-4 w-full" />
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : timesheets.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={7}
                    className="py-12 text-center text-muted-foreground"
                  >
                    No timesheets found.
                  </TableCell>
                </TableRow>
              ) : (
                timesheets.flatMap((row) => {
                  const isExpanded = expandedIds.has(row.id);
                  const status = row.status as TimesheetStatus;
                  const entryCount = row.entries?.length ?? 0;

                  return [
                    <TableRow
                      key={row.id}
                      className="cursor-pointer hover:bg-muted/40"
                      onClick={() => toggleExpand(row.id)}
                    >
                      {/* Expand toggle */}
                      <TableCell className="w-8 pr-0">
                        {isExpanded ? (
                          <ChevronDown className="size-4 text-muted-foreground" />
                        ) : (
                          <ChevronRight className="size-4 text-muted-foreground" />
                        )}
                      </TableCell>

                      <TableCell className="font-medium">
                        {row.staffProfile?.user?.name ?? "—"}
                        <div className="text-xs text-muted-foreground">
                          {row.staffProfile?.department?.name}
                        </div>
                      </TableCell>

                      <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                        {row.periodStart
                          ? format(parseISO(row.periodStart), "dd MMM")
                          : "—"}
                        {" – "}
                        {row.periodEnd
                          ? format(parseISO(row.periodEnd), "dd MMM yyyy")
                          : "—"}
                      </TableCell>

                      <TableCell>
                        <span className="font-medium">{row.title}</span>
                        <span className="ml-2 text-xs text-muted-foreground">
                          ({entryCount} {entryCount === 1 ? "entry" : "entries"})
                        </span>
                      </TableCell>

                      <TableCell className="text-right font-mono text-sm">
                        {row.totalHours ?? "0.00"}h
                      </TableCell>

                      <TableCell>
                        <span
                          className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_CLASS[status] ?? ""}`}
                        >
                          {STATUS_LABEL[status] ?? status}
                        </span>
                      </TableCell>

                      <TableCell
                        className="text-right"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="flex items-center justify-end gap-1.5">
                          {/* Draft: Edit + Submit */}
                          {status === "draft" && (
                            <>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 px-2 text-xs"
                                onClick={() =>
                                  setEditTimesheet({
                                    id: row.id,
                                    title: row.title,
                                    periodStart: row.periodStart ?? "",
                                    periodEnd: row.periodEnd ?? "",
                                  })
                                }
                              >
                                <Pencil className="size-3 mr-1" />
                                Edit
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 px-2 text-xs"
                                disabled={
                                  submitMutation.isPending || entryCount === 0
                                }
                                onClick={() => submitMutation.mutate({ id: row.id })}
                              >
                                Submit
                              </Button>
                            </>
                          )}

                          {/* Submitted: Approve + Reject */}
                          {status === "submitted" && (
                            <>
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 px-2 text-xs text-blue-700 border-blue-300 hover:bg-blue-50"
                                disabled={approveMutation.isPending}
                                onClick={() =>
                                  approveMutation.mutate({ id: row.id })
                                }
                              >
                                Approve
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 px-2 text-xs text-destructive border-destructive/30 hover:bg-destructive/5"
                                onClick={() => setRejectId(row.id)}
                              >
                                Reject
                              </Button>
                            </>
                          )}

                          {/* Rejected: note */}
                          {status === "rejected" && row.reviewNotes && (
                            <span
                              className="text-xs text-muted-foreground max-w-32 truncate"
                              title={row.reviewNotes}
                            >
                              {row.reviewNotes}
                            </span>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>,

                    // Expanded entries panel
                    ...(isExpanded
                      ? [
                          <TableRow key={`${row.id}-entries`}>
                            <TableCell colSpan={7} className="p-0 border-0">
                              <EntriesPanel timesheet={row} />
                            </TableCell>
                          </TableRow>,
                        ]
                      : []),
                  ];
                })
              )}
            </TableBody>
          </Table>
        </div>

        {/* Summary strip */}
        {!isLoading && timesheets.length > 0 && (
          <div className="mt-3 flex gap-4 text-xs text-muted-foreground">
            <span>{timesheets.length} total</span>
            <span>
              {timesheets.filter((t) => t.status === "submitted").length} pending review
            </span>
            <span>
              {timesheets.filter((t) => t.status === "approved").length} approved
            </span>
          </div>
        )}
      </Main>

      {/* Dialogs */}
      <CreateTimesheetDialog open={createOpen} onOpenChange={setCreateOpen} />

      {editTimesheet && (
        <EditTimesheetDialog
          timesheet={editTimesheet}
          onClose={() => setEditTimesheet(null)}
        />
      )}

      {rejectId && (
        <RejectDialog
          timesheetId={rejectId}
          onClose={() => setRejectId(null)}
        />
      )}
    </>
  );
}
