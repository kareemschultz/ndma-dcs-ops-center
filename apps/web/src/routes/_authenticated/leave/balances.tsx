import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import { Wallet } from "lucide-react";

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
import { Header } from "@/components/layout/header";
import { Main } from "@/components/layout/main";
import { ThemeSwitch } from "@/components/theme-switch";
import { LeaveSubNav } from "@/components/layout/leave-sub-nav";
import { orpc } from "@/utils/orpc";

export const Route = createFileRoute("/_authenticated/leave/balances")({
  component: BalancesPage,
});

type StaffListItem = {
  id: string;
  employeeId: string;
  user?: { name?: string | null } | null;
};

function staffLabel(s: StaffListItem | undefined): string {
  if (!s) return "—";
  return s.user?.name ?? s.employeeId;
}

function BalancesPage() {
  const [selectedStaffId, setSelectedStaffId] = useState<string>("");

  const { data: staffData, isLoading: staffLoading } = useQuery(
    orpc.staff.list.queryOptions({ input: { limit: 200, offset: 0 } }),
  );
  const staffList: StaffListItem[] = staffData ?? [];

  // Default to the first staff member once the list loads.
  const effectiveStaffId = selectedStaffId || staffList[0]?.id || "";

  const { data: balances, isLoading: balancesLoading } = useQuery({
    ...orpc.leave.balances.getByStaff.queryOptions({
      input: { staffProfileId: effectiveStaffId },
    }),
    enabled: Boolean(effectiveStaffId),
  });

  const rows = useMemo(() => {
    return (balances ?? []).map((b) => {
      const available =
        b.entitlement + b.carriedOver + b.adjustment - b.used;
      return {
        id: b.id,
        leaveTypeName: b.leaveType?.name ?? "—",
        leaveTypeCode: b.leaveType?.code ?? "",
        contractYearStart: b.contractYearStart,
        contractYearEnd: b.contractYearEnd,
        entitlement: b.entitlement,
        carriedOver: b.carriedOver,
        adjustment: b.adjustment,
        used: b.used,
        available,
      };
    });
  }, [balances]);

  const isLoading = staffLoading || (Boolean(effectiveStaffId) && balancesLoading);

  return (
    <>
      <Header>
        <div className="flex items-center gap-2">
          <Wallet className="h-5 w-5" />
          <h1 className="text-lg font-semibold">Leave Balances</h1>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <ThemeSwitch />
        </div>
      </Header>

      <LeaveSubNav />
      <Main>
        <div className="mb-4 flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Staff
            </label>
            <Select
              value={effectiveStaffId || undefined}
              onValueChange={(v) => setSelectedStaffId(v ?? "")}
            >
              <SelectTrigger className="w-[260px]">
                <SelectValue>
                  {effectiveStaffId
                    ? staffLabel(staffList.find((s) => s.id === effectiveStaffId))
                    : staffLoading
                      ? "Loading…"
                      : "Select staff…"}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {staffList.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {staffLabel(s)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Leave Type</TableHead>
                <TableHead>Contract Year</TableHead>
                <TableHead className="text-right">Entitlement</TableHead>
                <TableHead className="text-right">Carried Over</TableHead>
                <TableHead className="text-right">Adjustment</TableHead>
                <TableHead className="text-right">Used</TableHead>
                <TableHead className="text-right">Available</TableHead>
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
              ) : !effectiveStaffId ? (
                <TableRow>
                  <TableCell
                    colSpan={7}
                    className="py-12 text-center text-muted-foreground"
                  >
                    Select a staff member to view their leave balances.
                  </TableCell>
                </TableRow>
              ) : rows.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={7}
                    className="py-12 text-center text-muted-foreground"
                  >
                    No leave balances recorded for this staff member.
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>
                      <span className="font-medium">{r.leaveTypeName}</span>
                      {r.leaveTypeCode && (
                        <p className="text-xs text-muted-foreground">
                          {r.leaveTypeCode}
                        </p>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {r.contractYearStart && r.contractYearEnd
                        ? `${format(parseISO(r.contractYearStart), "d MMM yyyy")} – ${format(
                            parseISO(r.contractYearEnd),
                            "d MMM yyyy",
                          )}`
                        : "—"}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      {r.entitlement}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      {r.carriedOver}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      {r.adjustment}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      {r.used}
                    </TableCell>
                    <TableCell className="text-right">
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 font-mono text-sm font-medium ${
                          r.available > 0
                            ? "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200"
                            : "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200"
                        }`}
                      >
                        {r.available}
                      </span>
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
