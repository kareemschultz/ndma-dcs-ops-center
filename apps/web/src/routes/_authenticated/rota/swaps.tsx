import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { format, parseISO } from "date-fns";
import { ArrowLeftRight, CheckCircle, Plus, XCircle } from "lucide-react";
import { Button } from "@ndma-dcs-staff-portal/ui/components/button";
import { Skeleton } from "@ndma-dcs-staff-portal/ui/components/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@ndma-dcs-staff-portal/ui/components/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@ndma-dcs-staff-portal/ui/components/dialog";
import { Label } from "@ndma-dcs-staff-portal/ui/components/label";
import { Textarea } from "@ndma-dcs-staff-portal/ui/components/textarea";
import { Header } from "@/components/layout/header";
import { Main } from "@/components/layout/main";
import { SchedulingTabs } from "@/components/layout/scheduling-tabs";
import { ThemeSwitch } from "@/components/theme-switch";
import { orpc, queryClient } from "@/utils/orpc";

export const Route = createFileRoute("/_authenticated/rota/swaps")({
  component: SwapsPage,
});

type SwapStatus = "pending" | "approved" | "rejected" | "cancelled";

const ROLE_LABELS: Record<string, string> = {
  lead_engineer: "Lead Engineer",
  asn_support: "ASN Support",
  core_support: "Core Support",
  enterprise_support: "Enterprise Support",
};

const STATUS_COLORS: Record<SwapStatus, string> = {
  pending: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  approved: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300",
  rejected: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
  cancelled: "bg-muted text-muted-foreground",
};

type SwapItem = {
  id: string;
  status: string;
  reason?: string | null;
  createdAt: string;
  requester?: { user?: { name?: string } } | null;
  target?: { user?: { name?: string } } | null;
  assignment?: {
    role: string;
    schedule?: { weekStart?: string } | null;
  } | null;
};

function SwapTable({
  data,
  isLoading,
  showActions,
  onApprove,
  onReject,
  pendingIds,
}: {
  data: SwapItem[] | undefined;
  isLoading: boolean;
  showActions?: boolean;
  onApprove?: (id: string) => void;
  onReject?: (id: string) => void;
  pendingIds?: Set<string>;
}) {
  if (isLoading) {
    return (
      <div className="rounded-xl border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Requester</TableHead>
              <TableHead>Target</TableHead>
              <TableHead>Week</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Reason</TableHead>
              <TableHead>Submitted</TableHead>
              <TableHead>Status</TableHead>
              {showActions && <TableHead>Actions</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {Array.from({ length: 4 }).map((_, i) => (
              <TableRow key={i}>
                {Array.from({ length: showActions ? 8 : 7 }).map((_, j) => (
                  <TableCell key={j}>
                    <Skeleton className="h-4 w-full" />
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    );
  }

  return (
    <div className="rounded-xl border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Requester</TableHead>
            <TableHead>Target</TableHead>
            <TableHead>Week</TableHead>
            <TableHead>Role</TableHead>
            <TableHead>Reason</TableHead>
            <TableHead>Submitted</TableHead>
            <TableHead>Status</TableHead>
            {showActions && <TableHead>Actions</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {!data?.length ? (
            <TableRow>
              <TableCell
                colSpan={showActions ? 8 : 7}
                className="py-12 text-center text-muted-foreground"
              >
                No swap requests found.
              </TableCell>
            </TableRow>
          ) : (
            data.map((swap) => {
              const isPending = pendingIds?.has(swap.id);
              return (
                <TableRow key={swap.id}>
                  <TableCell className="font-medium">
                    {swap.requester?.user?.name ?? "—"}
                  </TableCell>
                  <TableCell>{swap.target?.user?.name ?? "—"}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {swap.assignment?.schedule?.weekStart
                      ? format(parseISO(swap.assignment.schedule.weekStart), "dd MMM yyyy")
                      : "—"}
                  </TableCell>
                  <TableCell>
                    {swap.assignment?.role
                      ? ROLE_LABELS[swap.assignment.role] ?? swap.assignment.role
                      : "—"}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground max-w-xs truncate">
                    {swap.reason ?? "—"}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {format(parseISO(swap.createdAt), "dd MMM yyyy")}
                  </TableCell>
                  <TableCell>
                    <span
                      className={`inline-flex items-center rounded-lg px-2 py-0.5 text-xs font-medium ${
                        STATUS_COLORS[swap.status as SwapStatus] ?? ""
                      }`}
                    >
                      {swap.status}
                    </span>
                  </TableCell>
                  {showActions && (
                    <TableCell>
                      {swap.status === "pending" && (
                        <div className="flex gap-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-green-600 hover:text-green-700 h-7"
                            disabled={isPending}
                            onClick={() => onApprove?.(swap.id)}
                            title="Approve swap"
                          >
                            <CheckCircle className="size-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-red-600 hover:text-red-700 h-7"
                            disabled={isPending}
                            onClick={() => onReject?.(swap.id)}
                            title="Reject swap"
                          >
                            <XCircle className="size-4" />
                          </Button>
                        </div>
                      )}
                    </TableCell>
                  )}
                </TableRow>
              );
            })
          )}
        </TableBody>
      </Table>
    </div>
  );
}

// ── Request Swap Dialog ────────────────────────────────────────────────────

function RequestSwapDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const [scheduleId, setScheduleId] = useState("");
  const [assignmentId, setAssignmentId] = useState("");
  const [targetStaffProfileId, setTargetStaffProfileId] = useState("");
  const [reason, setReason] = useState("");

  // Published schedules only (has assignments to swap)
  const { data: schedules } = useQuery(orpc.rota.list.queryOptions());
  const publishedSchedules =
    schedules?.filter((s) => s.status === "published") ?? [];

  const selectedSchedule = publishedSchedules.find((s) => s.id === scheduleId);
  const assignments = selectedSchedule?.assignments ?? [];

  const { data: staffList } = useQuery(
    orpc.staff.list.queryOptions({ input: { limit: 200, offset: 0 } })
  );

  const mutation = useMutation(
    orpc.rota.swap.request.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: orpc.rota.swap.list.key() });
        toast.success("Swap request submitted");
        setScheduleId("");
        setAssignmentId("");
        setTargetStaffProfileId("");
        setReason("");
        onOpenChange(false);
      },
      onError: (err) => toast.error(err.message),
    })
  );

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!assignmentId || !targetStaffProfileId) {
      toast.error("Select an assignment and a target staff member.");
      return;
    }
    mutation.mutate({
      assignmentId,
      targetStaffProfileId,
      reason: reason || undefined,
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Request On-Call Swap</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 py-2">
          {/* Pick schedule */}
          <div className="space-y-1.5">
            <Label>Week (Published Schedule)</Label>
            <select
              value={scheduleId}
              onChange={(e) => {
                setScheduleId(e.target.value);
                setAssignmentId("");
              }}
              className="w-full rounded-xl border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="">Select week…</option>
              {publishedSchedules.map((s) => (
                <option key={s.id} value={s.id}>
                  {format(parseISO(s.weekStart), "dd MMM")} –{" "}
                  {format(parseISO(s.weekEnd), "dd MMM yyyy")}
                </option>
              ))}
            </select>
            {publishedSchedules.length === 0 && (
              <p className="text-xs text-muted-foreground">
                No published schedules available for swapping.
              </p>
            )}
          </div>

          {/* Pick assignment */}
          {scheduleId && (
            <div className="space-y-1.5">
              <Label>Assignment to Swap</Label>
              <select
                value={assignmentId}
                onChange={(e) => setAssignmentId(e.target.value)}
                className="w-full rounded-xl border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="">Select assignment…</option>
                {assignments.map((a) => (
                  <option key={a.id} value={a.id}>
                    {ROLE_LABELS[a.role] ?? a.role} —{" "}
                    {(a as { staffProfile?: { user?: { name?: string } } }).staffProfile?.user?.name ?? "Unassigned"}
                  </option>
                ))}
              </select>
              {assignments.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  No assignments in this schedule.
                </p>
              )}
            </div>
          )}

          {/* Pick target staff */}
          <div className="space-y-1.5">
            <Label>Swap With</Label>
            <select
              value={targetStaffProfileId}
              onChange={(e) => setTargetStaffProfileId(e.target.value)}
              className="w-full rounded-xl border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="">Select staff member…</option>
              {staffList?.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.user?.name ?? s.id}
                </option>
              ))}
            </select>
          </div>

          {/* Reason */}
          <div className="space-y-1.5">
            <Label htmlFor="swap-reason">Reason (optional)</Label>
            <Textarea
              id="swap-reason"
              placeholder="e.g. Annual leave, medical appointment…"
              rows={2}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={!assignmentId || !targetStaffProfileId || mutation.isPending}
            >
              {mutation.isPending ? "Submitting…" : "Submit Swap Request"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function SwapsPage() {
  const [activeTab, setActiveTab] = useState<"pending" | "all">("pending");
  const [inFlightIds, setInFlightIds] = useState<Set<string>>(new Set());
  const [showRequest, setShowRequest] = useState(false);

  const { data: pendingSwaps, isLoading: pendingLoading } = useQuery(
    orpc.rota.swap.list.queryOptions({ input: { status: "pending" as const } })
  );

  const { data: allSwaps, isLoading: allLoading } = useQuery(
    orpc.rota.swap.list.queryOptions({ input: {} })
  );

  const reviewMutation = useMutation(
    orpc.rota.swap.review.mutationOptions({
      onSuccess: (_, vars) => {
        const action = (vars as { action: string }).action;
        queryClient.invalidateQueries({ queryKey: orpc.rota.swap.list.key() });
        queryClient.invalidateQueries({ queryKey: orpc.rota.getCurrent.key() });
        toast.success(`Swap ${action === "approve" ? "approved" : "rejected"}`);
        setInFlightIds((prev) => {
          const next = new Set(prev);
          next.delete((vars as { swapId: string }).swapId);
          return next;
        });
      },
      onError: (err, vars) => {
        toast.error(err.message);
        setInFlightIds((prev) => {
          const next = new Set(prev);
          next.delete((vars as { swapId: string }).swapId);
          return next;
        });
      },
    })
  );

  function handleReview(swapId: string, action: "approve" | "reject") {
    setInFlightIds((prev) => new Set(prev).add(swapId));
    reviewMutation.mutate({ swapId, action });
  }

  const tabs = [
    {
      key: "pending" as const,
      label: "Pending Requests",
      badge: pendingSwaps?.length,
    },
    { key: "all" as const, label: "All Swaps" },
  ];

  return (
    <>
      <RequestSwapDialog open={showRequest} onOpenChange={setShowRequest} />

      <Header fixed>
        <div className="flex items-center gap-2">
          <ArrowLeftRight className="size-4 text-muted-foreground" />
          <span className="text-sm font-medium">Swap Requests</span>
        </div>
        <div className="ms-auto flex items-center gap-2">
          <Button size="sm" onClick={() => setShowRequest(true)}>
            <Plus className="size-3.5 mr-1.5" />
            Request Swap
          </Button>
          <ThemeSwitch />
        </div>
      </Header>

      <Main>
        <SchedulingTabs scope="dcs" />

        <div className="mb-6">
          <h1 className="text-2xl font-bold tracking-tight">On-Call Swap Requests</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Review and action swap requests between on-call staff.
          </p>
        </div>

        {/* Tabs */}
        <div className="mb-4 flex gap-1 border-b">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`px-4 py-2 text-sm font-medium transition-colors ${
                activeTab === tab.key
                  ? "border-b-2 border-primary text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {tab.label}
              {tab.badge != null && tab.badge > 0 && (
                <span className="ml-2 inline-flex size-5 items-center justify-center rounded-full bg-amber-500 text-[10px] font-semibold text-white">
                  {tab.badge}
                </span>
              )}
            </button>
          ))}
        </div>

        {activeTab === "pending" && (
          <SwapTable
            data={pendingSwaps as SwapItem[] | undefined}
            isLoading={pendingLoading}
            showActions
            pendingIds={inFlightIds}
            onApprove={(id) => handleReview(id, "approve")}
            onReject={(id) => handleReview(id, "reject")}
          />
        )}

        {activeTab === "all" && (
          <SwapTable
            data={allSwaps as SwapItem[] | undefined}
            isLoading={allLoading}
          />
        )}
      </Main>
    </>
  );
}
