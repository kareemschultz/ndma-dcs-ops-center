import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { format } from "date-fns";
import { ShoppingCart, Plus, RefreshCw, CheckCircle, XCircle, FileDown } from "lucide-react";
import { exportProcurementExcel } from "@/utils/excel-export";
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
} from "@ndma-dcs-staff-portal/ui/components/dialog";
import { Header } from "@/components/layout/header";
import { Main } from "@/components/layout/main";
import { ThemeSwitch } from "@/components/theme-switch";
import { orpc, queryClient } from "@/utils/orpc";

export const Route = createFileRoute("/_authenticated/procurement/")({
  component: ProcurementPage,
});

type PRStatus =
  | "draft"
  | "submitted"
  | "under_review"
  | "approved"
  | "rejected"
  | "ordered"
  | "received"
  | "cancelled";

type PRPriority = "low" | "medium" | "high" | "urgent";

const STATUS_COLORS: Record<PRStatus, string> = {
  draft: "bg-muted text-muted-foreground",
  submitted: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  under_review: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  approved: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  rejected: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
  ordered: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300",
  received: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  cancelled: "bg-muted text-muted-foreground line-through",
};

const PRIORITY_COLORS: Record<PRPriority, string> = {
  low: "bg-muted text-muted-foreground",
  medium: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  high: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  urgent: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
};

const STATUS_LABELS: Record<PRStatus, string> = {
  draft: "Draft",
  submitted: "Submitted",
  under_review: "Under Review",
  approved: "Approved",
  rejected: "Rejected",
  ordered: "Ordered",
  received: "Received",
  cancelled: "Cancelled",
};

const PRIORITY_LABELS: Record<PRPriority, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
  urgent: "Urgent",
};

function PRStatusBadge({ status }: { status: string }) {
  const cls = STATUS_COLORS[status as PRStatus] ?? "bg-muted text-muted-foreground";
  const label = STATUS_LABELS[status as PRStatus] ?? status.replace("_", " ");
  return (
    <span className={`inline-flex items-center rounded-lg px-2 py-0.5 text-xs font-medium ${cls}`}>
      {label}
    </span>
  );
}

function PriorityBadge({ priority }: { priority: string }) {
  const cls = PRIORITY_COLORS[priority as PRPriority] ?? "bg-muted text-muted-foreground";
  const label = PRIORITY_LABELS[priority as PRPriority] ?? priority;
  return (
    <span className={`inline-flex items-center rounded-lg px-2 py-0.5 text-xs font-medium ${cls}`}>
      {label}
    </span>
  );
}

const STATUS_OPTIONS = [
  { value: "", label: "All Statuses" },
  { value: "draft", label: "Draft" },
  { value: "submitted", label: "Submitted" },
  { value: "under_review", label: "Under Review" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
  { value: "ordered", label: "Ordered" },
  { value: "received", label: "Received" },
  { value: "cancelled", label: "Cancelled" },
];

// ── PR Details Dialog ──────────────────────────────────────────────────────

function PRDetailsDialog({
  prId,
  open,
  onOpenChange,
}: {
  prId: string | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { data: pr, isLoading } = useQuery({
    ...orpc.procurement.get.queryOptions({ input: { id: prId ?? "" } }),
    enabled: !!prId && open,
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{pr?.title ?? "Purchase Requisition"}</DialogTitle>
        </DialogHeader>
        {isLoading ? (
          <div className="space-y-2 py-4">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
          </div>
        ) : pr ? (
          <div className="space-y-5 py-2">
            {/* Meta */}
            <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
              <div>
                <p className="text-xs text-muted-foreground">Status</p>
                <PRStatusBadge status={pr.status} />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Priority</p>
                <PriorityBadge priority={pr.priority} />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Department</p>
                <p className="font-medium">{(pr as any).department?.name ?? "—"}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Requested By</p>
                <p className="font-medium">
                  {(pr as any).requestedBy?.user?.name ?? "—"}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Submitted</p>
                <p className="font-medium">
                  {pr.createdAt ? format(new Date(pr.createdAt), "dd MMM yyyy") : "—"}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Total Value</p>
                <p className="font-medium font-mono">
                  {pr.totalEstimatedCost
                    ? `GHS ${Number(pr.totalEstimatedCost).toLocaleString("en-GH", { minimumFractionDigits: 2 })}`
                    : "—"}
                </p>
              </div>
            </div>

            {pr.description && (
              <div>
                <p className="text-xs text-muted-foreground mb-1">Description</p>
                <p className="text-sm">{pr.description}</p>
              </div>
            )}

            {(pr as any).justification && (
              <div>
                <p className="text-xs text-muted-foreground mb-1">Justification</p>
                <p className="text-sm">{(pr as any).justification}</p>
              </div>
            )}

            {/* Line Items */}
            {(pr as any).lineItems?.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                  Line Items
                </p>
                <div className="rounded-lg border overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50">
                      <tr>
                        <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">Description</th>
                        <th className="text-right px-3 py-2 text-xs font-medium text-muted-foreground">Qty</th>
                        <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">Unit</th>
                        <th className="text-right px-3 py-2 text-xs font-medium text-muted-foreground">Unit Cost</th>
                        <th className="text-right px-3 py-2 text-xs font-medium text-muted-foreground">Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {(pr as any).lineItems.map((item: any) => (
                        <tr key={item.id}>
                          <td className="px-3 py-2">{item.description}</td>
                          <td className="px-3 py-2 text-right">{item.quantity}</td>
                          <td className="px-3 py-2 text-muted-foreground">{item.unit || "—"}</td>
                          <td className="px-3 py-2 text-right font-mono">
                            {Number(item.unitCost).toLocaleString("en-GH", { minimumFractionDigits: 2 })}
                          </td>
                          <td className="px-3 py-2 text-right font-mono font-medium">
                            {(Number(item.unitCost) * item.quantity).toLocaleString("en-GH", { minimumFractionDigits: 2 })}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Approvals */}
            {(pr as any).approvals?.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                  Approval History
                </p>
                <div className="space-y-1.5">
                  {(pr as any).approvals.map((a: any) => (
                    <div key={a.id} className="flex items-center gap-2 text-sm">
                      <span
                        className={`text-xs font-medium ${
                          a.decision === "approved"
                            ? "text-blue-600"
                            : a.decision === "rejected"
                            ? "text-red-600"
                            : "text-muted-foreground"
                        }`}
                      >
                        {a.decision ?? "pending"}
                      </span>
                      <span className="text-muted-foreground">—</span>
                      <span>{a.approver?.user?.name ?? "Unknown"}</span>
                      {a.notes && (
                        <span className="text-muted-foreground text-xs">({a.notes})</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <p className="text-muted-foreground py-4">PR not found.</p>
        )}
      </DialogContent>
    </Dialog>
  );
}

function PRTable({
  data,
  isLoading,
  onApprove,
  onReject,
  onView,
  showActions,
}: {
  data: any[] | undefined;
  isLoading: boolean;
  onApprove?: (id: string) => void;
  onReject?: (id: string) => void;
  onView?: (id: string) => void;
  showActions?: boolean;
}) {
  if (isLoading) {
    return (
      <div className="rounded-xl border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Title</TableHead>
              <TableHead>Department</TableHead>
              <TableHead>Priority</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Total (GHS)</TableHead>
              <TableHead>Date</TableHead>
              {showActions && <TableHead>Actions</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {Array.from({ length: 4 }).map((_, i) => (
              <TableRow key={i}>
                {Array.from({ length: showActions ? 7 : 6 }).map((_, j) => (
                  <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
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
            <TableHead>Title</TableHead>
            <TableHead>Department</TableHead>
            <TableHead>Priority</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Total (GHS)</TableHead>
            <TableHead>Submitted</TableHead>
            {showActions && <TableHead>Actions</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {!data?.length ? (
            <TableRow>
              <TableCell colSpan={showActions ? 7 : 6} className="py-12 text-center text-muted-foreground">
                No purchase requisitions found.
              </TableCell>
            </TableRow>
          ) : (
            data.map((pr) => (
              <TableRow key={pr.id}>
                <TableCell>
                  <button
                    type="button"
                    className="font-medium hover:underline text-left"
                    onClick={() => onView?.(pr.id)}
                  >
                    {pr.title}
                  </button>
                  {pr.vendorName && (
                    <p className="text-xs text-muted-foreground mt-0.5">Vendor: {pr.vendorName}</p>
                  )}
                </TableCell>
                <TableCell>{pr.department?.name ?? "—"}</TableCell>
                <TableCell>
                  <PriorityBadge priority={pr.priority} />
                </TableCell>
                <TableCell>
                  <PRStatusBadge status={pr.status} />
                </TableCell>
                <TableCell className="font-mono text-sm">
                  {pr.totalEstimatedCost
                    ? Number(pr.totalEstimatedCost).toLocaleString("en-GH", {
                        minimumFractionDigits: 2,
                      })
                    : "—"}
                </TableCell>
                <TableCell className="text-muted-foreground text-xs">
                  {pr.createdAt ? format(new Date(pr.createdAt), "dd MMM yyyy") : "—"}
                </TableCell>
                {showActions && (
                  <TableCell>
                    {pr.status === "submitted" && (
                      <div className="flex gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-blue-600 hover:text-blue-700 h-7"
                          onClick={() => onApprove?.(pr.id)}
                        >
                          <CheckCircle className="size-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-red-600 hover:text-red-700 h-7"
                          onClick={() => onReject?.(pr.id)}
                        >
                          <XCircle className="size-4" />
                        </Button>
                      </div>
                    )}
                  </TableCell>
                )}
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}

function ProcurementPage() {
  const [status, setStatus] = useState<PRStatus | "">("");
  const [activeTab, setActiveTab] = useState<"all" | "mine" | "pending">("all");
  const [viewPrId, setViewPrId] = useState<string | null>(null);

  const { data: allPRs, isLoading: allLoading, refetch } = useQuery(
    orpc.procurement.list.queryOptions({
      input: { status: status || undefined, limit: 100, offset: 0 },
    })
  );

  const { data: myPRs, isLoading: myLoading } = useQuery(
    orpc.procurement.getMyRequests.queryOptions()
  );

  const { data: pendingApprovals, isLoading: pendingLoading } = useQuery(
    orpc.procurement.getPendingApprovals.queryOptions()
  );

  const { data: stats } = useQuery(orpc.procurement.stats.queryOptions());

  const approveMutation = useMutation(
    orpc.procurement.approve.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: orpc.procurement.list.key() });
        queryClient.invalidateQueries({ queryKey: orpc.procurement.getPendingApprovals.key() });
        toast.success("PR approved");
      },
      onError: (err) => toast.error(err.message),
    })
  );

  const rejectMutation = useMutation(
    orpc.procurement.reject.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: orpc.procurement.list.key() });
        queryClient.invalidateQueries({ queryKey: orpc.procurement.getPendingApprovals.key() });
        toast.success("PR rejected");
      },
      onError: (err) => toast.error(err.message),
    })
  );

  return (
    <>
      <PRDetailsDialog
        prId={viewPrId}
        open={!!viewPrId}
        onOpenChange={(open) => !open && setViewPrId(null)}
      />

      <Header fixed>
        <div className="flex items-center gap-2">
          <ShoppingCart className="size-4 text-muted-foreground" />
          <span className="text-sm font-medium">Purchase Requisitions</span>
        </div>
        <div className="ms-auto flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={() => refetch()} title="Refresh">
            <RefreshCw className="size-4" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => exportProcurementExcel(allPRs ?? [], `Procurement_${new Date().toISOString().slice(0, 10)}.xlsx`)}
            disabled={!allPRs?.length}
          >
            <FileDown className="size-4 mr-1" />
            Export
          </Button>
          <ThemeSwitch />
          <Link to="/procurement/new">
            <Button size="sm">
              <Plus className="size-4 mr-1" />
              New PR
            </Button>
          </Link>
        </div>
      </Header>

      <Main>
        <div className="mb-6">
          <h1 className="text-2xl font-bold tracking-tight">Purchase Requisitions</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Submit and track procurement requests through the approval pipeline.
          </p>
        </div>

        {/* Stats */}
        {stats && (
          <div className="mb-4 flex flex-wrap gap-4 text-sm">
            <span className="text-muted-foreground">
              <strong className="text-foreground">{stats.total}</strong> total
            </span>
            <span className="text-amber-600">
              <strong>{stats.byStatus?.submitted ?? 0}</strong> pending approval
            </span>
            <span className="text-blue-600">
              <strong>{stats.byStatus?.approved ?? 0}</strong> approved
            </span>
            {stats.totalValue && Number(stats.totalValue) > 0 && (
              <span className="text-muted-foreground">
                Total value:{" "}
                <strong className="text-foreground">
                  GHS {Number(stats.totalValue).toLocaleString("en-GH", { minimumFractionDigits: 2 })}
                </strong>
              </span>
            )}
          </div>
        )}

        {/* Tabs */}
        <div className="mb-4 flex gap-1 border-b">
          {(["all", "mine", "pending"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 text-sm font-medium transition-colors ${
                activeTab === tab
                  ? "border-b-2 border-primary text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {tab === "all" && "All PRs"}
              {tab === "mine" && "My Requests"}
              {tab === "pending" && (
                <>
                  Pending Approval
                  {pendingApprovals && pendingApprovals.length > 0 && (
                    <span className="ml-2 inline-flex size-5 items-center justify-center rounded-full bg-amber-500 text-[10px] font-semibold text-white">
                      {pendingApprovals.length}
                    </span>
                  )}
                </>
              )}
            </button>
          ))}
        </div>

        {/* Status filter for All tab */}
        {activeTab === "all" && (
          <div className="mb-4">
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as PRStatus | "")}
              className="rounded-xl border bg-background px-3 py-1.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            >
              {STATUS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
        )}

        {/* Table content */}
        {activeTab === "all" && (
          <PRTable data={allPRs} isLoading={allLoading} onView={setViewPrId} />
        )}
        {activeTab === "mine" && (
          <PRTable data={myPRs} isLoading={myLoading} onView={setViewPrId} />
        )}
        {activeTab === "pending" && (
          <PRTable
            data={pendingApprovals}
            isLoading={pendingLoading}
            showActions
            onView={setViewPrId}
            onApprove={(id) => approveMutation.mutate({ id, notes: "Approved" })}
            onReject={(id) => rejectMutation.mutate({ id, notes: "Rejected" })}
          />
        )}
      </Main>
    </>
  );
}
