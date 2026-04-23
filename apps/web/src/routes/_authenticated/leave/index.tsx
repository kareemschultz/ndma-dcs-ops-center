import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import { CalendarOff, CheckCircle, Plus, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@ndma-dcs-staff-portal/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@ndma-dcs-staff-portal/ui/components/card";
import { Skeleton } from "@ndma-dcs-staff-portal/ui/components/skeleton";
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
import { useTeamFilter } from "@/lib/team-filter";
import {
  getLeaveTypeDisplayName,
  isVisibleLeaveType,
  sortLeaveTypesByCanonicalOrder,
} from "@/lib/leave-types";
import { orpc, queryClient } from "@/utils/orpc";

export const Route = createFileRoute("/_authenticated/leave/")({
  component: LeavePage,
});

type LeaveStatus = "pending" | "approved" | "rejected" | "cancelled";

const STATUS_COLORS: Record<LeaveStatus, string> = {
  pending: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  approved: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300",
  rejected: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
  cancelled: "bg-muted text-muted-foreground",
};

const STATUS_LABELS: Record<LeaveStatus, string> = {
  pending: "Pending",
  approved: "Approved",
  rejected: "Rejected",
  cancelled: "Cancelled",
};

function LeaveStatusBadge({ status }: { status: string }) {
  const cls = STATUS_COLORS[status as LeaveStatus] ?? "bg-muted text-muted-foreground";
  const label = STATUS_LABELS[status as LeaveStatus] ?? status;
  return (
    <span className={`inline-flex items-center rounded-lg px-2 py-0.5 text-xs font-medium ${cls}`}>
      {label}
    </span>
  );
}

function LeavePage() {
  const [activeTab, setActiveTab] = useState<"all" | "pending">("all");
  const [status, setStatus] = useState<LeaveStatus | "">("");
  const { team } = useTeamFilter();

  const { data: currentStaff } = useQuery(orpc.staff.me.queryOptions());
  const { data, isLoading } = useQuery(
    orpc.leave.requests.list.queryOptions({
      input: {
        status: activeTab === "pending" ? "pending" : (status as LeaveStatus) || undefined,
        limit: 100,
        offset: 0,
        team: team === "All" ? undefined : team,
      },
    }),
  );
  const { data: leaveBalances } = useQuery(
    {
      ...orpc.leave.balances.getByStaff.queryOptions({
        input: { staffProfileId: currentStaff?.id ?? "" },
      }),
      enabled: Boolean(currentStaff?.id),
    },
  );

  const { data: leaveTypes } = useQuery(orpc.leave.types.list.queryOptions());
  const visibleLeaveTypes = leaveTypes
    ?.filter((leaveType) => isVisibleLeaveType(leaveType.name))
    .slice()
    .sort(sortLeaveTypesByCanonicalOrder);

  const leaveBalanceCards = useMemo(() => {
    const rows = leaveBalances ?? [];
    const findLatest = (leaveTypeName: string) =>
      rows
        .filter((row) => row.leaveType?.name === leaveTypeName)
        .sort((a, b) => {
          const aDate = a.contractYearStart ? new Date(a.contractYearStart).getTime() : 0;
          const bDate = b.contractYearStart ? new Date(b.contractYearStart).getTime() : 0;
          return bDate - aDate;
        })[0] ?? null;

    const cards = [
      { key: "Annual Leave", label: "Annual / Vacation" },
      { key: "Sick Leave", label: "Sick" },
      { key: "Special", label: "Special" },
    ].map(({ key, label }) => {
      const row = findLatest(key);
      const allowance = row
        ? row.entitlement + row.carriedOver + row.adjustment
        : 0;
      const taken = row?.used ?? 0;
      return {
        key,
        label,
        taken,
        allowance,
        remaining: Math.max(0, allowance - taken),
      };
    });

    return cards;
  }, [leaveBalances]);

  const approveMutation = useMutation(
    orpc.leave.requests.approve.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: orpc.leave.requests.list.key() });
        toast.success("Leave request approved");
      },
      onError: (err) => toast.error(err.message),
    }),
  );

  const rejectMutation = useMutation(
    orpc.leave.requests.reject.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: orpc.leave.requests.list.key() });
        toast.success("Leave request rejected");
      },
      onError: (err) => toast.error(err.message),
    }),
  );

  return (
    <>
      <Header fixed>
        <div className="flex items-center gap-2">
          <CalendarOff className="size-4 text-muted-foreground" />
          <span className="text-sm font-medium">Leave Management</span>
        </div>
        <div className="ms-auto flex items-center gap-2">
          <ThemeSwitch />
          <Link to="/leave/new">
            <Button size="sm">
              <Plus className="mr-1 size-4" />
              Request Leave
            </Button>
          </Link>
        </div>
      </Header>

      <Main>
        <div className="mb-6">
          <h1 className="text-2xl font-bold tracking-tight">Leave Management</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Submit leave requests and manage team leave.
          </p>
        </div>

        {currentStaff && (
          <div className="mb-6">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold">Leave Balances</h2>
                <p className="text-sm text-muted-foreground">
                  Your annual, sick, and special leave usage versus allowance.
                </p>
              </div>
              <div className="rounded-full border px-3 py-1 text-xs text-muted-foreground">
                {currentStaff?.user?.name ?? "Current user"}
              </div>
            </div>
            <div className="grid gap-3 md:grid-cols-3">
              {leaveBalanceCards.map((card) => (
                <Card key={card.key} className="border-border/70">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">{card.label}</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-1.5">
                    <div className="text-2xl font-bold leading-none">{card.taken}</div>
                    <p className="text-xs text-muted-foreground">
                      of {card.allowance} days allowed this year
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Remaining: <span className="font-medium text-foreground">{card.remaining}</span>
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}

        {visibleLeaveTypes && visibleLeaveTypes.length > 0 && (
          <div className="mb-4 flex flex-wrap gap-2">
            {visibleLeaveTypes.map((leaveType) => (
              <span
                key={leaveType.id}
                className="rounded-full border px-3 py-1 text-xs font-medium"
              >
                {getLeaveTypeDisplayName(leaveType.name)} ({leaveType.defaultAnnualAllowance} days/yr)
              </span>
            ))}
          </div>
        )}

        <div className="mb-4 flex gap-1 border-b">
          {(["all", "pending"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 text-sm font-medium transition-colors ${
                activeTab === tab
                  ? "border-b-2 border-primary text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {tab === "all" ? "All Requests" : "Pending Approval"}
            </button>
          ))}
        </div>

        <div className="mb-4">
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as LeaveStatus | "")}
            className="rounded-xl border bg-background px-3 py-1.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="">All Statuses</option>
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </div>

        <div className="rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Staff Member</TableHead>
                <TableHead>Leave Type</TableHead>
                <TableHead>From</TableHead>
                <TableHead>To</TableHead>
                <TableHead>Days</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Reason</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 8 }).map((_, j) => (
                      <TableCell key={j}>
                        <Skeleton className="h-4 w-full" />
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : !data?.length ? (
                <TableRow>
                  <TableCell colSpan={8} className="py-12 text-center text-muted-foreground">
                    No leave requests found.{" "}
                    <Link to="/leave/new" className="underline">
                      Submit a request
                    </Link>
                  </TableCell>
                </TableRow>
              ) : (
                data.map((req) => (
                  <TableRow key={req.id}>
                    <TableCell className="font-medium">
                      {req.staffProfile?.user?.name ?? "—"}
                    </TableCell>
                    <TableCell>
                      {req.leaveType?.name ? getLeaveTypeDisplayName(req.leaveType.name) : "—"}
                    </TableCell>
                    <TableCell>{format(parseISO(req.startDate), "dd MMM yyyy")}</TableCell>
                    <TableCell>{format(parseISO(req.endDate), "dd MMM yyyy")}</TableCell>
                    <TableCell>{req.totalDays}</TableCell>
                    <TableCell>
                      <LeaveStatusBadge status={req.status} />
                    </TableCell>
                    <TableCell className="max-w-xs truncate text-xs text-muted-foreground">
                      {req.reason ?? "—"}
                    </TableCell>
                    <TableCell>
                      {req.status === "pending" && (
                        <div className="flex gap-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 text-green-600 hover:text-green-700"
                            onClick={() => approveMutation.mutate({ id: req.id })}
                          >
                            <CheckCircle className="size-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 text-red-600 hover:text-red-700"
                            onClick={() =>
                              rejectMutation.mutate({ id: req.id, rejectionReason: "Not approved" })
                            }
                          >
                            <XCircle className="size-4" />
                          </Button>
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </Main>
    </>
  );
}
