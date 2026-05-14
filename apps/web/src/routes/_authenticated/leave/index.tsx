// /leave — Leave Management
// Replaces: apps/web/src/routes/_authenticated/leave/index.tsx
//
// Changes from original:
//   • Replace native <select> for status filter with shadcn <Select>
//   • Leave balance cards → horizontal progress bars (used/remaining ratio)
//     coloured by urgency: >80% used = amber, >100% = red
//   • Add leave type filter pills to request list
//   • Stats strip with mini context (pending count this month)

import { useMemo, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import { CalendarOff, CheckCircle, FileDown, Plus, Trash2, XCircle } from "lucide-react";
import { exportLeaveExcel } from "@/utils/excel-export";
import { toast } from "sonner";

import { Button } from "@ndma-dcs-staff-portal/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@ndma-dcs-staff-portal/ui/components/card";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@ndma-dcs-staff-portal/ui/components/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@ndma-dcs-staff-portal/ui/components/select";
import { Skeleton } from "@ndma-dcs-staff-portal/ui/components/skeleton";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@ndma-dcs-staff-portal/ui/components/table";
import { Header } from "@/components/layout/header";
import { LeaveViolationsBadge } from "@/components/leave-violations-badge";
import { Main } from "@/components/layout/main";
import { ThemeSwitch } from "@/components/theme-switch";
import { useTeamFilter } from "@/lib/team-filter";
import {
  getLeaveTypeDisplayName, isVisibleLeaveType, sortLeaveTypesByCanonicalOrder,
} from "@/lib/leave-types";
import { orpc, queryClient } from "@/utils/orpc";

export const Route = createFileRoute("/_authenticated/leave/")({
  component: LeavePage,
});

type LeaveStatus = "pending" | "approved" | "rejected" | "cancelled";

const STATUS_COLORS: Record<LeaveStatus, string> = {
  pending:   "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  approved:  "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  rejected:  "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
  cancelled: "bg-muted text-muted-foreground",
};
const STATUS_LABELS: Record<LeaveStatus, string> = {
  pending: "Pending", approved: "Approved", rejected: "Rejected", cancelled: "Cancelled",
};

function LeaveStatusBadge({ status }: { status: string }) {
  const cls   = STATUS_COLORS[status as LeaveStatus] ?? "bg-muted text-muted-foreground";
  const label = STATUS_LABELS[status as LeaveStatus] ?? status;
  return <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ${cls}`}>{label}</span>;
}

// ── Leave balance bar ──────────────────────────────────────────────────────────
// Shows used/available as a proportional bar, coloured by urgency

function LeaveBalanceBar({ label, used, allowance }: { label: string; used: number; allowance: number }) {
  const pct = allowance > 0 ? Math.min((used / allowance) * 100, 100) : 0;
  const over = used > allowance;
  const barCls = over         ? "bg-red-500"
               : pct >= 80    ? "bg-amber-500"
               : "bg-primary";
  const textCls = over        ? "text-red-600 dark:text-red-400"
                : pct >= 80   ? "text-amber-600 dark:text-amber-400"
                : "";
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium">{label}</span>
        <span className={`tabular-nums font-semibold ${textCls}`}>{used} / {allowance} days</span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
        <div className={`h-full rounded-full transition-all ${barCls}`} style={{ width: `${pct}%` }} />
      </div>
      <div className="text-xs text-muted-foreground">
        {over ? <span className="text-red-600 dark:text-red-400">{used - allowance} days over</span>
              : <span>{allowance - used} days remaining</span>}
      </div>
    </div>
  );
}

function LeavePage() {
  const [activeTab,        setActiveTab]        = useState<"all" | "pending">("all");
  const [statusFilter,     setStatusFilter]     = useState<LeaveStatus | "">("");
  const [typeFilter,       setTypeFilter]       = useState<string>("");
  const [deleteTarget,     setDeleteTarget]     = useState<{ id: string; name: string } | null>(null);
  const navigate = useNavigate();
  const { team } = useTeamFilter();

  const { data: currentStaff } = useQuery(orpc.staff.me.queryOptions());

  const { data, isLoading } = useQuery(
    orpc.leave.requests.list.queryOptions({
      input: {
        status: activeTab === "pending" ? "pending" : (statusFilter || undefined),
        limit: 100, offset: 0,
        team: team === "All" ? undefined : team,
      },
    }),
  );

  const { data: leaveBalances } = useQuery({
    ...orpc.leave.balances.getByStaff.queryOptions({
      input: { staffProfileId: currentStaff?.id ?? "" },
    }),
    enabled: Boolean(currentStaff?.id),
  });

  const { data: leaveTypes } = useQuery(orpc.leave.types.list.queryOptions());

  const approveMutation = useMutation(
    orpc.leave.requests.approve.mutationOptions({
      onSuccess: () => { toast.success("Leave approved"); queryClient.invalidateQueries({ queryKey: orpc.leave.requests.list.key() }); },
      onError: (e: Error) => toast.error(e.message),
    }),
  );
  const rejectMutation = useMutation(
    orpc.leave.requests.reject.mutationOptions({
      onSuccess: () => { toast.success("Leave rejected"); queryClient.invalidateQueries({ queryKey: orpc.leave.requests.list.key() }); },
      onError: (e: Error) => toast.error(e.message),
    }),
  );
  const deleteMutation = useMutation(
    orpc.leave.requests.delete.mutationOptions({
      onSuccess: () => {
        toast.success("Leave request deleted");
        queryClient.invalidateQueries({ queryKey: orpc.leave.requests.list.key() });
        setDeleteTarget(null);
      },
      onError: (e: Error) => toast.error(e.message),
    }),
  );

  const visibleTypes = useMemo(
    () => (leaveTypes ?? []).filter((lt) => isVisibleLeaveType(lt.name)).sort(sortLeaveTypesByCanonicalOrder),
    [leaveTypes],
  );

  // Build balance cards
  const balanceRows = useMemo(() => {
    if (!leaveBalances || !visibleTypes.length) return [];
    return visibleTypes.map((lt) => {
      const bal = leaveBalances.find((b) => b.leaveTypeId === lt.id);
      const used      = bal ? (bal.used ?? 0) : 0;
      const allowance = bal ? ((bal.entitlement ?? lt.defaultAnnualAllowance ?? 0) + (bal.carriedOver ?? 0) + (bal.adjustment ?? 0)) : (lt.defaultAnnualAllowance ?? 0);
      return { label: getLeaveTypeDisplayName(lt.name), used, allowance };
    });
  }, [leaveBalances, visibleTypes]);

  // Filtered requests
  const rows = useMemo(() => {
    let list = data ?? [];
    if (typeFilter) list = list.filter((r) => r.leaveTypeId === typeFilter);
    return list;
  }, [data, typeFilter]);

  const pendingCount = useMemo(() => (data ?? []).filter((r) => r.status === "pending").length, [data]);

  return (
    <>
      <Header fixed>
        <div className="flex items-center gap-2">
          <CalendarOff className="size-4 text-muted-foreground" />
          <span className="text-sm font-medium">Leave Management</span>
        </div>
        <div className="ms-auto flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => exportLeaveExcel(data ?? [], `Leave_Requests_${new Date().toISOString().slice(0, 10)}.xlsx`)}
            disabled={!data?.length}
          >
            <FileDown className="mr-1 size-4" />
            Export Excel
          </Button>
          <ThemeSwitch />
          {/* [FIX] useNavigate instead of <Link><Button> (Button has no asChild in Base UI) */}
          <Button size="sm" onClick={() => navigate({ to: "/leave/new" })}>
            <Plus className="mr-1 size-4" />Request Leave
          </Button>
        </div>
      </Header>

      <Main className="space-y-6">
        {/* Page heading + stats */}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Leave Management</h1>
            <p className="mt-1 text-sm text-muted-foreground">Submit and manage team leave requests.</p>
          </div>
          {pendingCount > 0 && (
            <span className="inline-flex items-center gap-1.5 rounded-lg bg-amber-100 px-3 py-1.5 text-sm font-medium text-amber-800 dark:bg-amber-900/40 dark:text-amber-200">
              {pendingCount} request{pendingCount > 1 ? "s" : ""} pending approval
            </span>
          )}
        </div>

        {/* Leave balances — horizontal bars */}
        {currentStaff && balanceRows.length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold">
                Your Leave Balances — {currentStaff.user?.name}
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {balanceRows.map((b) => (
                <LeaveBalanceBar key={b.label} label={b.label} used={b.used} allowance={b.allowance} />
              ))}
            </CardContent>
          </Card>
        )}

        {/* Tabs + filters */}
        <div className="space-y-3">
          <div className="flex items-center gap-3 border-b">
            {(["all", "pending"] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 ${
                  activeTab === tab
                    ? "border-primary text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                {tab === "all" ? "All Requests" : `Pending Approval${pendingCount ? ` (${pendingCount})` : ""}`}
              </button>
            ))}
          </div>

          {/* Filter row — shadcn Select replaces native <select> */}
          <div className="flex flex-wrap gap-2">
            <Select value={statusFilter || "_all"} onValueChange={(v) => setStatusFilter(v === "_all" ? "" : v as LeaveStatus)}>
              <SelectTrigger className="w-[150px]"><SelectValue placeholder="All Statuses" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="_all">All Statuses</SelectItem>
                {(["pending","approved","rejected","cancelled"] as LeaveStatus[]).map((s) => (
                  <SelectItem key={s} value={s}>{STATUS_LABELS[s]}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Type filter pills */}
            <div className="flex flex-wrap gap-1.5">
              <button
                onClick={() => setTypeFilter("")}
                className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${!typeFilter ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80"}`}
              >
                All types
              </button>
              {visibleTypes.map((lt) => (
                <button
                  key={lt.id}
                  onClick={() => setTypeFilter(lt.id === typeFilter ? "" : lt.id)}
                  className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${typeFilter === lt.id ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80"}`}
                >
                  {getLeaveTypeDisplayName(lt.name)}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Requests table */}
        {isLoading ? (
          <Skeleton className="h-48 w-full" />
        ) : (
          <div className="overflow-hidden rounded-xl border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Staff Member</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Dates</TableHead>
                  <TableHead>Days</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Violations</TableHead>
                  <TableHead>Approver</TableHead>
                  <TableHead className="w-32">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="py-12 text-center text-muted-foreground">
                      No leave requests found.
                    </TableCell>
                  </TableRow>
                ) : rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">{r.staffProfile?.user?.name ?? "—"}</TableCell>
                    <TableCell>{getLeaveTypeDisplayName(r.leaveType?.name ?? "")}</TableCell>
                    <TableCell className="font-mono text-xs">
                      {format(parseISO(r.startDate), "d MMM")} – {format(parseISO(r.endDate), "d MMM yyyy")}
                    </TableCell>
                    <TableCell><span className="tabular-nums font-medium">{r.totalDays}</span></TableCell>
                    <TableCell><LeaveStatusBadge status={r.status} /></TableCell>
                    <TableCell><LeaveViolationsBadge violations={r.violations} /></TableCell>
                    <TableCell className="text-sm">{r.approvedBy?.name ?? "—"}</TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        {r.status === "pending" && (
                          <>
                            <Button size="icon" variant="ghost" className="size-7 text-blue-600 hover:text-blue-700"
                              onClick={() => approveMutation.mutate({ id: r.id })}
                              disabled={approveMutation.isPending}
                            >
                              <CheckCircle className="size-4" />
                            </Button>
                            <Button size="icon" variant="ghost" className="size-7 text-red-500 hover:text-red-600"
                              onClick={() => rejectMutation.mutate({ id: r.id, rejectionReason: "" })}
                              disabled={rejectMutation.isPending}
                            >
                              <XCircle className="size-4" />
                            </Button>
                          </>
                        )}
                        <Button
                          size="icon" variant="ghost"
                          className="size-7 text-destructive hover:text-destructive/80"
                          onClick={() => setDeleteTarget({ id: r.id, name: r.staffProfile?.user?.name ?? r.id })}
                          title="Delete leave request"
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        {/* Delete confirm dialog */}
        <Dialog open={Boolean(deleteTarget)} onOpenChange={(v) => { if (!v) setDeleteTarget(null); }}>
          <DialogContent className="sm:max-w-sm">
            <DialogHeader>
              <DialogTitle>Delete Leave Request</DialogTitle>
              <DialogDescription>
                Are you sure you want to permanently delete the leave request for{" "}
                <span className="font-medium">{deleteTarget?.name}</span>? This cannot be undone.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => setDeleteTarget(null)} disabled={deleteMutation.isPending}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                disabled={deleteMutation.isPending}
                onClick={() => { if (deleteTarget) deleteMutation.mutate({ id: deleteTarget.id }); }}
              >
                {deleteMutation.isPending ? "Deleting…" : "Delete"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </Main>
    </>
  );
}
