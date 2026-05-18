import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import { Pencil, Plus, Wallet } from "lucide-react";
import { toast } from "sonner";

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
import { Header } from "@/components/layout/header";
import { Main } from "@/components/layout/main";
import { ThemeSwitch } from "@/components/theme-switch";
import { LeaveSubNav } from "@/components/layout/leave-sub-nav";
import { getLeaveTypeDisplayName } from "@/lib/leave-types";
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

type BalanceRow = {
  id: string;
  leaveTypeId: string;
  leaveTypeName: string;
  contractYearStart: string;
  contractYearEnd: string;
  entitlement: number;
  carriedOver: number;
  adjustment: number;
};

type LeaveTypeLite = { id: string; name: string; defaultAnnualAllowance?: number | null };

// ---------------------------------------------------------------------------
// Adjust / Create Balance Dialog
// ---------------------------------------------------------------------------

function BalanceDialog({
  staffProfileId,
  existing,
  leaveTypes,
  onClose,
}: {
  staffProfileId: string;
  existing: BalanceRow | null;
  leaveTypes: LeaveTypeLite[];
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  // NDMA contracts renew annually — default to the current calendar year.
  const thisYear = new Date().getFullYear();
  const [form, setForm] = useState({
    leaveTypeId: existing?.leaveTypeId ?? "",
    contractYearStart: existing?.contractYearStart ?? `${thisYear}-01-01`,
    contractYearEnd: existing?.contractYearEnd ?? `${thisYear}-12-31`,
    entitlement: existing?.entitlement ?? 0,
    carriedOver: existing?.carriedOver ?? 0,
    adjustment: existing?.adjustment ?? 0,
  });

  const mutation = useMutation(
    orpc.leave.balances.adjust.mutationOptions({
      onSuccess: () => {
        toast.success(existing ? "Leave balance updated" : "Leave balance added");
        queryClient.invalidateQueries({ queryKey: orpc.leave.balances.getByStaff.key() });
        onClose();
      },
      onError: (err: Error) => toast.error(err.message ?? "Failed to save balance"),
    }),
  );

  function handleSave() {
    if (!form.leaveTypeId) {
      toast.error("Leave type is required");
      return;
    }
    if (!form.contractYearStart || !form.contractYearEnd) {
      toast.error("Contract year start and end are required");
      return;
    }
    mutation.mutate({
      staffProfileId,
      leaveTypeId: form.leaveTypeId,
      contractYearStart: form.contractYearStart,
      contractYearEnd: form.contractYearEnd,
      entitlement: form.entitlement,
      carriedOver: form.carriedOver,
      adjustment: form.adjustment,
    });
  }

  return (
    <DialogContent className="sm:max-w-md">
      <DialogHeader>
        <DialogTitle>{existing ? "Adjust Leave Balance" : "Add Leave Balance"}</DialogTitle>
        <DialogDescription>
          {existing
            ? `Update the ${existing.leaveTypeName} entitlement for this contract year.`
            : "Create a leave balance entry for this staff member and contract year."}
        </DialogDescription>
      </DialogHeader>
      <div className="space-y-4 py-2">
        <div className="space-y-1.5">
          <Label>Leave Type</Label>
          <Select
            value={form.leaveTypeId}
            onValueChange={(v) => setForm((f) => ({ ...f, leaveTypeId: v ?? "" }))}
            disabled={Boolean(existing)}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select leave type…" />
            </SelectTrigger>
            <SelectContent>
              {leaveTypes.map((lt) => (
                <SelectItem key={lt.id} value={lt.id}>
                  {getLeaveTypeDisplayName(lt.name)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Contract Year Start</Label>
            <Input
              type="date"
              value={form.contractYearStart}
              disabled={Boolean(existing)}
              onChange={(e) => setForm((f) => ({ ...f, contractYearStart: e.target.value }))}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Contract Year End</Label>
            <Input
              type="date"
              value={form.contractYearEnd}
              onChange={(e) => setForm((f) => ({ ...f, contractYearEnd: e.target.value }))}
            />
          </div>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div className="space-y-1.5">
            <Label>Entitlement</Label>
            <Input
              type="number"
              step="0.5"
              value={form.entitlement}
              onChange={(e) =>
                setForm((f) => ({ ...f, entitlement: Number(e.target.value) || 0 }))
              }
            />
          </div>
          <div className="space-y-1.5">
            <Label>Carried Over</Label>
            <Input
              type="number"
              step="0.5"
              value={form.carriedOver}
              onChange={(e) =>
                setForm((f) => ({ ...f, carriedOver: Number(e.target.value) || 0 }))
              }
            />
          </div>
          <div className="space-y-1.5">
            <Label>Adjustment</Label>
            <Input
              type="number"
              step="0.5"
              value={form.adjustment}
              onChange={(e) =>
                setForm((f) => ({ ...f, adjustment: Number(e.target.value) || 0 }))
              }
            />
          </div>
        </div>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onClose} disabled={mutation.isPending}>
          Cancel
        </Button>
        <Button onClick={handleSave} disabled={mutation.isPending}>
          {mutation.isPending ? "Saving…" : existing ? "Save Changes" : "Add Balance"}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

function BalancesPage() {
  const [selectedStaffId, setSelectedStaffId] = useState<string>("");
  const [editBalance, setEditBalance] = useState<BalanceRow | null>(null);
  const [addOpen, setAddOpen] = useState(false);

  const { data: staffData, isLoading: staffLoading } = useQuery(
    orpc.staff.list.queryOptions({ input: { limit: 200, offset: 0 } }),
  );
  const staffList: StaffListItem[] = staffData ?? [];

  const { data: leaveTypesData } = useQuery(orpc.leave.types.list.queryOptions());
  const leaveTypes: LeaveTypeLite[] = leaveTypesData ?? [];

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
      // The server enriches each balance with `effectiveEntitlement` (the
      // explicit entitlement, or a role-based 28/45-day default for Annual
      // Leave when none is recorded) and `remaining` = allowance − used.
      return {
        id: b.id,
        leaveTypeId: b.leaveTypeId,
        leaveTypeName: b.leaveType?.name ?? "—",
        leaveTypeCode: b.leaveType?.code ?? "",
        contractYearStart: b.contractYearStart,
        contractYearEnd: b.contractYearEnd,
        entitlement: b.effectiveEntitlement ?? b.entitlement,
        carriedOver: b.carriedOver,
        adjustment: b.adjustment,
        used: b.used,
        remaining: b.remaining ?? (b.entitlement + b.carriedOver + b.adjustment - b.used),
        isSynthetic: b.isSynthetic ?? false,
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
          <Button
            size="sm"
            onClick={() => setAddOpen(true)}
            disabled={!effectiveStaffId}
          >
            <Plus className="mr-1.5 h-4 w-4" />
            Add Balance
          </Button>
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
                <TableHead className="text-right">Taken</TableHead>
                <TableHead className="text-right">Remaining</TableHead>
                <TableHead className="w-16 text-right">Actions</TableHead>
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
              ) : !effectiveStaffId ? (
                <TableRow>
                  <TableCell
                    colSpan={8}
                    className="py-12 text-center text-muted-foreground"
                  >
                    Select a staff member to view their leave balances.
                  </TableCell>
                </TableRow>
              ) : rows.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={8}
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
                      {r.isSynthetic && (
                        <span
                          className="ml-1 text-[10px] uppercase text-muted-foreground"
                          title="Role-based default — no explicit balance recorded yet."
                        >
                          (default)
                        </span>
                      )}
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
                          r.remaining > 0
                            ? "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200"
                            : "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200"
                        }`}
                      >
                        {r.remaining}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="icon"
                        variant="ghost"
                        className="size-7"
                        onClick={() =>
                          setEditBalance({
                            id: r.isSynthetic ? "" : r.id,
                            leaveTypeId: r.leaveTypeId,
                            leaveTypeName: r.leaveTypeName,
                            contractYearStart: r.contractYearStart,
                            contractYearEnd: r.contractYearEnd,
                            entitlement: r.entitlement,
                            carriedOver: r.carriedOver,
                            adjustment: r.adjustment,
                          })
                        }
                        title={
                          r.isSynthetic
                            ? "Record an explicit balance (currently a role-based default)"
                            : "Adjust balance"
                        }
                      >
                        <Pencil className="size-3.5" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </Main>

      <Dialog open={addOpen} onOpenChange={(v) => { if (!v) setAddOpen(false); }}>
        {addOpen && effectiveStaffId && (
          <BalanceDialog
            staffProfileId={effectiveStaffId}
            existing={null}
            leaveTypes={leaveTypes}
            onClose={() => setAddOpen(false)}
          />
        )}
      </Dialog>

      <Dialog open={Boolean(editBalance)} onOpenChange={(v) => { if (!v) setEditBalance(null); }}>
        {editBalance && effectiveStaffId && (
          <BalanceDialog
            staffProfileId={effectiveStaffId}
            existing={editBalance}
            leaveTypes={leaveTypes}
            onClose={() => setEditBalance(null)}
          />
        )}
      </Dialog>
    </>
  );
}
