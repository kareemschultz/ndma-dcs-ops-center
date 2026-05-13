import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import {
  ArrowLeft,
  CalendarRange,
  CheckCircle2,
  Circle,
  Pencil,
  Plus,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@ndma-dcs-staff-portal/ui/components/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@ndma-dcs-staff-portal/ui/components/card";
import { Badge } from "@ndma-dcs-staff-portal/ui/components/badge";
import { Skeleton } from "@ndma-dcs-staff-portal/ui/components/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@ndma-dcs-staff-portal/ui/components/dialog";
import { Input } from "@ndma-dcs-staff-portal/ui/components/input";
import { Label } from "@ndma-dcs-staff-portal/ui/components/label";
import { Textarea } from "@ndma-dcs-staff-portal/ui/components/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@ndma-dcs-staff-portal/ui/components/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@ndma-dcs-staff-portal/ui/components/table";
import { Header } from "@/components/layout/header";
import { Main } from "@/components/layout/main";
import { ThemeSwitch } from "@/components/theme-switch";
import { orpc } from "@/utils/orpc";

export const Route = createFileRoute("/_authenticated/cycles/$cycleId")({
  component: CycleDetailPage,
});

// ── Constants ─────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  active: {
    label: "Active",
    className:
      "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  },
  draft: {
    label: "Draft",
    className:
      "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
  },
  completed: {
    label: "Completed",
    className:
      "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  },
  cancelled: {
    label: "Cancelled",
    className:
      "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
  },
};

const WORK_ITEM_STATUS_COLORS: Record<string, string> = {
  backlog: "bg-muted text-muted-foreground",
  todo: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
  in_progress:
    "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  review:
    "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300",
  blocked:
    "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300",
  done: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
};

const PERIOD_LABELS: Record<string, string> = {
  weekly: "Weekly",
  fortnightly: "Fortnightly",
  monthly: "Monthly",
  quarterly: "Quarterly",
  custom: "Custom",
};

// ── Edit Dialog ────────────────────────────────────────────────────────────

type CycleData = {
  id: string;
  name: string;
  description: string | null;
  status: string;
  period: string;
  startDate: string;
  endDate: string;
  department: { name: string } | null;
};

function EditCycleDialog({
  cycle,
  open,
  onOpenChange,
}: {
  cycle: CycleData;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    name: cycle.name,
    description: cycle.description ?? "",
    status: cycle.status,
    startDate: cycle.startDate,
    endDate: cycle.endDate,
  });

  const mutation = useMutation(
    orpc.cycles.update.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: orpc.cycles.get.key() });
        queryClient.invalidateQueries({ queryKey: orpc.cycles.list.key() });
        toast.success("Cycle updated");
        onOpenChange(false);
      },
      onError: (err) => toast.error(err.message),
    }),
  );

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    mutation.mutate({
      id: cycle.id,
      name: form.name,
      description: form.description || undefined,
      status: form.status as "draft" | "active" | "completed" | "cancelled",
      startDate: form.startDate,
      endDate: form.endDate,
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit Cycle</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="ec-name">Name</Label>
            <Input
              id="ec-name"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ec-desc">Description</Label>
            <Textarea
              id="ec-desc"
              value={form.description}
              onChange={(e) =>
                setForm((f) => ({ ...f, description: e.target.value }))
              }
              rows={2}
              placeholder="Goals for this cycle…"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Status</Label>
            <Select
              value={form.status}
              onValueChange={(v) =>
                setForm((f) => ({ ...f, status: v ?? f.status }))
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="draft">Draft</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="ec-start">Start Date</Label>
              <Input
                id="ec-start"
                type="date"
                value={form.startDate}
                onChange={(e) =>
                  setForm((f) => ({ ...f, startDate: e.target.value }))
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ec-end">End Date</Label>
              <Input
                id="ec-end"
                type="date"
                value={form.endDate}
                onChange={(e) =>
                  setForm((f) => ({ ...f, endDate: e.target.value }))
                }
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? "Saving…" : "Save Changes"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── Add Work Item Dialog ────────────────────────────────────────────────────

function AddWorkItemDialog({
  cycleId,
  alreadyInCycle,
  open,
  onOpenChange,
}: {
  cycleId: string;
  alreadyInCycle: string[];
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState("");

  const { data: workItems } = useQuery(
    orpc.work.list.queryOptions({ input: { limit: 200, offset: 0 } }),
  );

  const mutation = useMutation(
    orpc.cycles.addWorkItem.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: orpc.cycles.get.key() });
        queryClient.invalidateQueries({ queryKey: orpc.cycles.list.key() });
        toast.success("Work item added to cycle");
        setSelectedId("");
        onOpenChange(false);
      },
      onError: (err) => toast.error(err.message),
    }),
  );

  const available =
    workItems?.filter((w) => !alreadyInCycle.includes(w.id)) ?? [];

  const filtered = search
    ? available.filter((w) =>
        w.title.toLowerCase().includes(search.toLowerCase()),
      )
    : available;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add Work Item to Cycle</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <Input
            placeholder="Search work items…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <div className="max-h-64 overflow-y-auto rounded-lg border divide-y">
            {filtered.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                {search
                  ? "No matching work items"
                  : "All work items are already in this cycle"}
              </p>
            ) : (
              filtered.map((w) => (
                <button
                  key={w.id}
                  type="button"
                  onClick={() => setSelectedId(w.id)}
                  className={`w-full text-left px-3 py-2.5 text-sm transition-colors hover:bg-muted ${
                    selectedId === w.id ? "bg-primary/10" : ""
                  }`}
                >
                  <span className="font-medium">{w.title}</span>
                  <span
                    className={`ml-2 inline-flex items-center rounded px-1.5 py-0.5 text-xs ${
                      WORK_ITEM_STATUS_COLORS[w.status] ??
                      "bg-muted text-muted-foreground"
                    }`}
                  >
                    {w.status.replace("_", " ")}
                  </span>
                </button>
              ))
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={!selectedId || mutation.isPending}
            onClick={() =>
              mutation.mutate({ cycleId, workItemId: selectedId })
            }
          >
            {mutation.isPending ? "Adding…" : "Add to Cycle"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────

function CycleDetailPage() {
  const { cycleId } = Route.useParams();
  const queryClient = useQueryClient();
  const [showEdit, setShowEdit] = useState(false);
  const [showAddItem, setShowAddItem] = useState(false);

  const { data: cycle, isLoading } = useQuery(
    orpc.cycles.get.queryOptions({ input: { id: cycleId } }),
  );

  const removeMutation = useMutation(
    orpc.cycles.removeWorkItem.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: orpc.cycles.get.key() });
        queryClient.invalidateQueries({ queryKey: orpc.cycles.list.key() });
        toast.success("Work item removed from cycle");
      },
      onError: (err) => toast.error(err.message),
    }),
  );

  if (isLoading) {
    return (
      <>
        <Header fixed>
          <Skeleton className="h-5 w-40" />
        </Header>
        <Main>
          <Skeleton className="h-8 w-64 mb-2" />
          <Skeleton className="h-4 w-48 mb-6" />
          <Skeleton className="h-40 w-full rounded-xl" />
        </Main>
      </>
    );
  }

  if (!cycle) {
    return (
      <Main>
        <p className="text-muted-foreground">Cycle not found.</p>
      </Main>
    );
  }

  const items = cycle.cycleWorkItems.map((cwi) => cwi.workItem);
  const total = items.length;
  const done = items.filter((i) => i.status === "done").length;
  const completionPct =
    total > 0 ? Math.round((done / total) * 100) : 0;
  const alreadyInCycle = items.map((i) => i.id);
  const statusCfg = STATUS_CONFIG[cycle.status] ?? STATUS_CONFIG.draft;

  return (
    <>
      <EditCycleDialog
        cycle={cycle as CycleData}
        open={showEdit}
        onOpenChange={setShowEdit}
      />
      <AddWorkItemDialog
        cycleId={cycleId}
        alreadyInCycle={alreadyInCycle}
        open={showAddItem}
        onOpenChange={setShowAddItem}
      />

      <Header fixed>
        <Link
          to="/cycles"
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="size-4" />
          Cycles
        </Link>
        <div className="ms-auto flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowEdit(true)}
          >
            <Pencil className="size-3.5 mr-1.5" />
            Edit
          </Button>
          <ThemeSwitch />
        </div>
      </Header>

      <Main>
        {/* Heading */}
        <div className="mb-6">
          <div className="flex items-start gap-3 flex-wrap">
            <div className="flex-1 min-w-0">
              <h1 className="text-2xl font-bold tracking-tight">
                {cycle.name}
              </h1>
              {cycle.description && (
                <p className="text-sm text-muted-foreground mt-1">
                  {cycle.description}
                </p>
              )}
            </div>
            <span
              className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium ${statusCfg.className}`}
            >
              {statusCfg.label}
            </span>
          </div>
        </div>

        {/* Meta + Progress */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-6">
          <Card className="p-4">
            <p className="text-xs text-muted-foreground">Period</p>
            <p className="mt-1 font-semibold">
              {PERIOD_LABELS[cycle.period] ?? cycle.period}
            </p>
          </Card>
          <Card className="p-4">
            <p className="text-xs text-muted-foreground">Dates</p>
            <p className="mt-1 font-semibold text-sm">
              {format(parseISO(cycle.startDate), "d MMM")} –{" "}
              {format(parseISO(cycle.endDate), "d MMM yyyy")}
            </p>
          </Card>
          <Card className="p-4">
            <p className="text-xs text-muted-foreground">Department</p>
            <p className="mt-1 font-semibold">
              {cycle.department?.name ?? "All"}
            </p>
          </Card>
          <Card className="p-4">
            <p className="text-xs text-muted-foreground">Completion</p>
            <div className="mt-1 flex items-center gap-2">
              <span className="text-2xl font-bold">{completionPct}%</span>
              <span className="text-xs text-muted-foreground">
                {done}/{total} done
              </span>
            </div>
            <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
              <div
                className={`h-full rounded-full ${
                  completionPct === 100 ? "bg-blue-500" : "bg-blue-500"
                }`}
                style={{ width: `${completionPct}%` }}
              />
            </div>
          </Card>
        </div>

        {/* Work Items */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">
                Work Items
                {total > 0 && (
                  <Badge variant="secondary" className="ml-2">
                    {total}
                  </Badge>
                )}
              </CardTitle>
              <Button size="sm" onClick={() => setShowAddItem(true)}>
                <Plus className="size-3.5 mr-1.5" />
                Add Item
              </Button>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {total === 0 ? (
              <div className="py-12 text-center text-sm text-muted-foreground">
                <CalendarRange className="mx-auto mb-3 size-8 opacity-30" />
                <p>No work items in this cycle yet.</p>
                <Button
                  size="sm"
                  variant="outline"
                  className="mt-3"
                  onClick={() => setShowAddItem(true)}
                >
                  <Plus className="size-3.5 mr-1.5" />
                  Add Work Item
                </Button>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Title</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Assigned To</TableHead>
                    <TableHead className="w-10" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell>
                        <Link
                          to="/work/$workItemId"
                          params={{ workItemId: item.id }}
                          className="font-medium hover:underline"
                        >
                          {item.title}
                        </Link>
                      </TableCell>
                      <TableCell>
                        <span
                          className={`inline-flex items-center gap-1 rounded-lg px-2 py-0.5 text-xs font-medium ${
                            WORK_ITEM_STATUS_COLORS[item.status] ??
                            "bg-muted text-muted-foreground"
                          }`}
                        >
                          {item.status === "in_progress" && (
                            <Circle className="size-2.5 fill-blue-400 text-blue-400" />
                          )}
                          {item.status === "done" && (
                            <CheckCircle2 className="size-2.5" />
                          )}
                          {item.status.replace("_", " ")}
                        </span>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {(
                          item as unknown as {
                            assignedTo?: { user?: { name: string } };
                          }
                        ).assignedTo?.user?.name ?? "—"}
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-7 text-muted-foreground hover:text-destructive"
                          title="Remove from cycle"
                          onClick={() =>
                            removeMutation.mutate({
                              cycleId,
                              workItemId: item.id,
                            })
                          }
                          disabled={removeMutation.isPending}
                        >
                          <X className="size-3.5" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </Main>
    </>
  );
}
