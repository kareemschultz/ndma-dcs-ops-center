import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  CalendarRange,
  CheckCircle2,
  Circle,
  Plus,
  RefreshCw,
  Target,
} from "lucide-react";
import { format, parseISO } from "date-fns";
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
import { Header } from "@/components/layout/header";
import { Main } from "@/components/layout/main";
import { ThemeSwitch } from "@/components/theme-switch";
import { orpc } from "@/utils/orpc";
import { departmentOptionLabel } from "@/lib/departments";

export const Route = createFileRoute("/_authenticated/cycles/")({
  component: CyclesPage,
});

// ── Types ───────────────────────────────────────────────────────────────────

type CycleStatus = "draft" | "active" | "completed" | "cancelled";

// ── Helpers ────────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<
  CycleStatus,
  { label: string; className: string; dotClass: string }
> = {
  active: {
    label: "Active",
    className: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
    dotClass: "bg-blue-500",
  },
  draft: {
    label: "Draft",
    className: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
    dotClass: "bg-gray-400",
  },
  completed: {
    label: "Completed",
    className: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
    dotClass: "bg-blue-500",
  },
  cancelled: {
    label: "Cancelled",
    className: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
    dotClass: "bg-red-400",
  },
};

const PERIOD_LABELS: Record<string, string> = {
  weekly: "Weekly",
  fortnightly: "Fortnightly",
  monthly: "Monthly",
  quarterly: "Quarterly",
  custom: "Custom",
};

function StatusBadge({ status }: { status: CycleStatus }) {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.draft;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${cfg.className}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${cfg.dotClass}`} />
      {cfg.label}
    </span>
  );
}

function ProgressBar({ value }: { value: number }) {
  const pct = Math.min(100, Math.max(0, value));
  const color =
    pct === 100
      ? "bg-blue-500"
      : pct >= 60
        ? "bg-blue-500"
        : pct >= 30
          ? "bg-amber-500"
          : "bg-gray-300";

  return (
    <div className="w-full">
      <div className="mb-1 flex justify-between text-xs text-muted-foreground">
        <span>Completion</span>
        <span>{pct}%</span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={`h-full rounded-full transition-all ${color}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

// ── Status Filter ──────────────────────────────────────────────────────────

const STATUS_FILTERS: { value: CycleStatus | ""; label: string }[] = [
  { value: "", label: "All" },
  { value: "active", label: "Active" },
  { value: "draft", label: "Draft" },
  { value: "completed", label: "Completed" },
  { value: "cancelled", label: "Cancelled" },
];

// ── Cycle Card ──────────────────────────────────────────────────────────────

type CycleRow = {
  id: string;
  name: string;
  description: string | null;
  period: string;
  status: CycleStatus;
  startDate: string;
  endDate: string;
  department: { name: string } | null;
  cycleWorkItems: { workItem: { id: string; status: string } }[];
};

function CycleCard({ cycle }: { cycle: CycleRow }) {
  const items = cycle.cycleWorkItems.map((cwi) => cwi.workItem);
  const total = items.length;
  const done = items.filter((i) => i.status === "done").length;
  const completionRate = total > 0 ? Math.round((done / total) * 100) : 0;

  const byStatus: Record<string, number> = {};
  for (const item of items) {
    byStatus[item.status] = (byStatus[item.status] ?? 0) + 1;
  }

  return (
    <Link to="/cycles/$cycleId" params={{ cycleId: cycle.id }} className="block">
    <Card className="flex flex-col gap-0 transition-shadow hover:shadow-md cursor-pointer">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <CardTitle className="truncate text-base">{cycle.name}</CardTitle>
            {cycle.description && (
              <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                {cycle.description}
              </p>
            )}
          </div>
          <StatusBadge status={cycle.status} />
        </div>
      </CardHeader>

      <CardContent className="flex flex-1 flex-col gap-4">
        {/* Meta row */}
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <CalendarRange className="h-3 w-3" />
            {PERIOD_LABELS[cycle.period] ?? cycle.period}
          </span>
          {cycle.department && (
            <span className="flex items-center gap-1">
              <Target className="h-3 w-3" />
              {cycle.department.name}
            </span>
          )}
          <span>
            {format(parseISO(cycle.startDate), "d MMM")} →{" "}
            {format(parseISO(cycle.endDate), "d MMM yyyy")}
          </span>
        </div>

        {/* Progress */}
        <ProgressBar value={completionRate} />

        {/* Counts */}
        <div className="flex items-center gap-3 text-xs">
          <span className="flex items-center gap-1 text-muted-foreground">
            <Circle className="h-3 w-3" />
            {total} item{total !== 1 ? "s" : ""}
          </span>
          <span className="flex items-center gap-1 text-blue-600">
            <CheckCircle2 className="h-3 w-3" />
            {done} done
          </span>
          {(byStatus["blocked"] ?? 0) > 0 && (
            <span className="text-red-500">
              {byStatus["blocked"]} blocked
            </span>
          )}
          {(byStatus["in_progress"] ?? 0) > 0 && (
            <span className="text-blue-600">
              {byStatus["in_progress"]} in progress
            </span>
          )}
        </div>

        {/* Spacer to keep card heights consistent */}
        <div className="mt-auto" />
      </CardContent>
    </Card>
    </Link>
  );
}

// ── Loading Skeleton ────────────────────────────────────────────────────────

function CycleSkeleton() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <Card key={i} className="p-4">
          <Skeleton className="mb-2 h-5 w-3/4" />
          <Skeleton className="mb-4 h-4 w-full" />
          <Skeleton className="mb-2 h-3 w-1/2" />
          <Skeleton className="h-2 w-full rounded-full" />
        </Card>
      ))}
    </div>
  );
}

// ── New Cycle Dialog ────────────────────────────────────────────────────────

const newCycleSchema = z.object({
  name: z.string().min(1, "Name is required"),
  description: z.string().optional(),
  period: z.enum(["weekly", "fortnightly", "monthly", "quarterly", "custom"]),
  departmentId: z.string().optional(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date"),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date"),
});

type NewCycleFormValues = z.infer<typeof newCycleSchema>;

function NewCycleDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const queryClient = useQueryClient();

  const { data: departments } = useQuery(orpc.staff.getDepartments.queryOptions());

  const { register, handleSubmit, reset, setValue, watch, formState: { errors } } =
    useForm<NewCycleFormValues>({
      resolver: zodResolver(newCycleSchema),
      defaultValues: { period: "monthly" },
    });

  const mutation = useMutation(
    orpc.cycles.create.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: orpc.cycles.list.key() });
        reset();
        onOpenChange(false);
      },
    }),
  );

  const onSubmit = (values: NewCycleFormValues) => {
    mutation.mutate({
      name: values.name,
      description: values.description || undefined,
      period: values.period,
      departmentId: values.departmentId || undefined,
      startDate: values.startDate,
      endDate: values.endDate,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New Cycle</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="cycle-name">Name</Label>
            <Input id="cycle-name" placeholder="Q2 2026 Infrastructure Sprint" {...register("name")} />
            {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="cycle-desc">Description</Label>
            <Textarea id="cycle-desc" placeholder="Goals for this cycle…" rows={2} {...register("description")} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Period</Label>
              <Select
                defaultValue="monthly"
                onValueChange={(v) => setValue("period", v as NewCycleFormValues["period"])}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(["weekly", "fortnightly", "monthly", "quarterly", "custom"] as const).map((p) => (
                    <SelectItem key={p} value={p}>{PERIOD_LABELS[p]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Department</Label>
              <Select onValueChange={(v: string | null) => setValue("departmentId", v === "_none" || !v ? undefined : v)}>
                <SelectTrigger>
                  <SelectValue placeholder="All departments" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="_none">All departments</SelectItem>
                  {departments?.map((d) => (
                    <SelectItem key={d.id} value={d.id}>{departmentOptionLabel(d)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="cycle-start">Start Date</Label>
              <Input id="cycle-start" type="date" {...register("startDate")} />
              {errors.startDate && <p className="text-xs text-destructive">{errors.startDate.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cycle-end">End Date</Label>
              <Input id="cycle-end" type="date" {...register("endDate")} />
              {errors.endDate && <p className="text-xs text-destructive">{errors.endDate.message}</p>}
            </div>
          </div>

          {mutation.error && (
            <p className="text-xs text-destructive">
              {(mutation.error as Error).message || "Failed to create cycle"}
            </p>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? "Creating…" : "Create Cycle"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── Page ────────────────────────────────────────────────────────────────────

function CyclesPage() {
  const [statusFilter, setStatusFilter] = useState<CycleStatus | "">("");
  const [newCycleOpen, setNewCycleOpen] = useState(false);

  const { data: cycles, isLoading, refetch, isFetching } = useQuery(
    orpc.cycles.list.queryOptions({
      input: {
        status: statusFilter || undefined,
        limit: 50,
      },
    }),
  );

  const activeCycles = cycles?.filter((c) => c.status === "active") ?? [];
  const draftCycles = cycles?.filter((c) => c.status === "draft") ?? [];
  const completedCycles = cycles?.filter((c) => c.status === "completed") ?? [];

  const totalItems = cycles?.reduce(
    (sum, c) => sum + c.cycleWorkItems.length,
    0,
  ) ?? 0;
  const totalDone = cycles?.reduce(
    (sum, c) =>
      sum + c.cycleWorkItems.filter((cwi) => cwi.workItem.status === "done").length,
    0,
  ) ?? 0;

  return (
    <>
      <NewCycleDialog open={newCycleOpen} onOpenChange={setNewCycleOpen} />
      <Header>
        <div className="flex items-center gap-2">
          <CalendarRange className="h-5 w-5 text-primary" />
          <h1 className="text-lg font-semibold">Cycles</h1>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => refetch()}
            disabled={isFetching}
            title="Refresh"
          >
            <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
          </Button>
          <ThemeSwitch />
          <Button size="sm" onClick={() => setNewCycleOpen(true)}>
            <Plus className="mr-1 h-4 w-4" />
            New Cycle
          </Button>
        </div>
      </Header>

      <Main>
        {/* Summary cards */}
        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Card className="p-4">
            <p className="text-xs text-muted-foreground">Total Cycles</p>
            <p className="mt-1 text-2xl font-bold">{cycles?.length ?? "—"}</p>
          </Card>
          <Card className="p-4">
            <p className="text-xs text-muted-foreground">Active</p>
            <p className="mt-1 text-2xl font-bold text-blue-600">
              {activeCycles.length}
            </p>
          </Card>
          <Card className="p-4">
            <p className="text-xs text-muted-foreground">Work Items Tracked</p>
            <p className="mt-1 text-2xl font-bold">{totalItems}</p>
          </Card>
          <Card className="p-4">
            <p className="text-xs text-muted-foreground">Overall Done</p>
            <p className="mt-1 text-2xl font-bold text-blue-600">
              {totalItems > 0
                ? `${Math.round((totalDone / totalItems) * 100)}%`
                : "—"}
            </p>
          </Card>
        </div>

        {/* Filters */}
        <div className="mb-4 flex flex-wrap gap-2">
          {STATUS_FILTERS.map((f) => (
            <Button
              key={f.value}
              variant={statusFilter === f.value ? "default" : "outline"}
              size="sm"
              onClick={() => setStatusFilter(f.value)}
            >
              {f.label}
              {f.value !== "" && cycles && (
                <Badge
                  variant="secondary"
                  className="ml-1.5 rounded-full px-1.5 py-0 text-xs"
                >
                  {cycles.filter((c) => c.status === f.value).length}
                </Badge>
              )}
            </Button>
          ))}
        </div>

        {/* Content */}
        {isLoading ? (
          <CycleSkeleton />
        ) : !cycles || cycles.length === 0 ? (
          <Card className="py-16 text-center">
            <CardContent>
              <CalendarRange className="mx-auto mb-3 h-10 w-10 text-muted-foreground/40" />
              <p className="font-medium text-muted-foreground">
                {statusFilter ? "No cycles match this filter" : "No cycles yet"}
              </p>
              {!statusFilter && (
                <p className="mt-1 text-sm text-muted-foreground">
                  Create a cycle to start tracking work progress over time.
                </p>
              )}
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-6">
            {/* Active cycles first */}
            {activeCycles.length > 0 && (
              <section>
                <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                  <span className="h-2 w-2 rounded-full bg-blue-500" />
                  Active ({activeCycles.length})
                </h2>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {activeCycles.map((c) => (
                    <CycleCard key={c.id} cycle={c as CycleRow} />
                  ))}
                </div>
              </section>
            )}

            {/* Draft cycles */}
            {draftCycles.length > 0 && (
              <section>
                <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                  <span className="h-2 w-2 rounded-full bg-gray-400" />
                  Draft ({draftCycles.length})
                </h2>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {draftCycles.map((c) => (
                    <CycleCard key={c.id} cycle={c as CycleRow} />
                  ))}
                </div>
              </section>
            )}

            {/* Completed cycles */}
            {completedCycles.length > 0 && (
              <section>
                <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                  <span className="h-2 w-2 rounded-full bg-blue-500" />
                  Completed ({completedCycles.length})
                </h2>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {completedCycles.map((c) => (
                    <CycleCard key={c.id} cycle={c as CycleRow} />
                  ))}
                </div>
              </section>
            )}
          </div>
        )}
      </Main>
    </>
  );
}
