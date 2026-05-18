// /leave/balances — Leave Balances (all staff)
//
// Multi-view page (see CLAUDE.md "Multi-View Pages Pattern"):
//   • Table       — compact: staff, dept, type, entitlement, taken, remaining,
//                   carry-over (one row per staff×leave-type), paginated.
//   • Cards       — one balance card per staff with a remaining-days bar.
//   • By Dept     — staff cards grouped by department.
//
// Shows EVERY active staff member — the server synthesises an Annual Leave row
// for anyone with no recorded balances so nobody is missing. Department (NOC /
// DCS) filtering uses the shared URL-backed team filter.

import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import {
  Columns3, LayoutGrid, List, Pencil, Search, Wallet,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@ndma-dcs-staff-portal/ui/components/button";
import { Card, CardContent } from "@ndma-dcs-staff-portal/ui/components/card";
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
import { DataPagination, usePagination } from "@/components/data-pagination";
import { DepartmentFilter } from "@/components/layout/department-filter";
import { Header } from "@/components/layout/header";
import { LeaveSubNav } from "@/components/layout/leave-sub-nav";
import { Main } from "@/components/layout/main";
import { PageHeader } from "@/components/layout/page-header";
import { ThemeSwitch } from "@/components/theme-switch";
import { getLeaveTypeDisplayName } from "@/lib/leave-types";
import { useTeamFilter } from "@/lib/team-filter";
import { orpc } from "@/utils/orpc";

export const Route = createFileRoute("/_authenticated/leave/balances")({
  component: BalancesPage,
});

type ViewMode = "table" | "cards" | "department";

// ── Types mirroring orpc.leave.balances.listAll output ─────────────────────

type EnrichedBalance = {
  id: string;
  leaveTypeId: string;
  entitlement: number;
  carriedOver: number;
  adjustment: number;
  used: number;
  contractYearStart: string;
  contractYearEnd: string;
  leaveType?: { name?: string | null; code?: string | null } | null;
  effectiveEntitlement: number;
  effectiveCarriedOver: number;
  allowsCarryOver: boolean;
  allowance: number;
  remaining: number;
  roleTier: "manager" | "staff";
  isSynthetic: boolean;
};

type StaffBalances = {
  staffProfileId: string;
  employeeId: string;
  staffName: string;
  departmentName: string | null;
  status: string;
  balances: EnrichedBalance[];
};

type LeaveTypeLite = { id: string; name: string };

// ── Remaining-tone helper — blue normal / amber low / red over ─────────────
//
// Consistent with LeaveBalanceBar on /leave: amber when ≥80% used, red when
// the staff member has taken more than their allowance.
function remainingTone(used: number, allowance: number) {
  const pct = allowance > 0 ? (used / allowance) * 100 : 0;
  const over = used > allowance;
  return {
    over,
    pct: Math.min(pct, 100),
    bar: over ? "bg-red-500" : pct >= 80 ? "bg-amber-500" : "bg-primary",
    text: over
      ? "text-red-600 dark:text-red-400"
      : pct >= 80
        ? "text-amber-600 dark:text-amber-400"
        : "text-primary",
  };
}

// ───────────────────────────────────────────────────────────────────────────
// Adjust / Create Balance Dialog
// ───────────────────────────────────────────────────────────────────────────

type EditTarget = {
  staffProfileId: string;
  staffName: string;
  balance: EnrichedBalance | null; // null = add new
};

function BalanceDialog({
  target,
  leaveTypes,
  onClose,
}: {
  target: EditTarget;
  leaveTypes: LeaveTypeLite[];
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const existing = target.balance;
  const isSynthetic = existing?.isSynthetic ?? false;
  // An existing-but-stored balance locks the type; synthetic/new can pick one.
  const lockType = Boolean(existing) && !isSynthetic;
  const thisYear = new Date().getFullYear();

  const [form, setForm] = useState({
    leaveTypeId: existing?.leaveTypeId ?? "",
    contractYearStart: existing?.contractYearStart ?? `${thisYear}-01-01`,
    contractYearEnd: existing?.contractYearEnd ?? `${thisYear}-12-31`,
    // For a synthetic row, pre-fill the role-based default so the manager
    // simply confirms it rather than typing from zero.
    entitlement: existing
      ? isSynthetic
        ? existing.effectiveEntitlement
        : existing.entitlement
      : 0,
    carriedOver: existing?.carriedOver ?? 0,
    adjustment: existing?.adjustment ?? 0,
  });

  const mutation = useMutation(
    orpc.leave.balances.adjust.mutationOptions({
      onSuccess: () => {
        toast.success(
          existing && !isSynthetic
            ? "Leave balance updated"
            : "Leave balance recorded",
        );
        queryClient.invalidateQueries({
          queryKey: orpc.leave.balances.listAll.key(),
        });
        queryClient.invalidateQueries({
          queryKey: orpc.leave.balances.getByStaff.key(),
        });
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
      staffProfileId: target.staffProfileId,
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
        <DialogTitle>
          {existing && !isSynthetic ? "Adjust Leave Balance" : "Record Leave Balance"}
        </DialogTitle>
        <DialogDescription>
          {isSynthetic
            ? `${target.staffName} currently has a role-based default — record an explicit entitlement for this contract year.`
            : existing
              ? `Update the ${getLeaveTypeDisplayName(existing.leaveType?.name ?? "")} entitlement for ${target.staffName}.`
              : `Create a leave balance entry for ${target.staffName} and contract year.`}
        </DialogDescription>
      </DialogHeader>
      <div className="space-y-4 py-2">
        <div className="space-y-1.5">
          <Label>Leave Type</Label>
          <Select
            value={form.leaveTypeId}
            onValueChange={(v) => setForm((f) => ({ ...f, leaveTypeId: v ?? "" }))}
            disabled={lockType}
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
              disabled={lockType}
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
          {mutation.isPending
            ? "Saving…"
            : existing && !isSynthetic
              ? "Save Changes"
              : "Record Balance"}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

// ── Remaining badge — emphasised figure used across views ──────────────────

function RemainingBadge({ remaining, used, allowance }: {
  remaining: number;
  used: number;
  allowance: number;
}) {
  const tone = remainingTone(used, allowance);
  return (
    <span
      className={`inline-flex items-baseline gap-1 font-mono font-semibold ${tone.text}`}
      title={`${used} of ${allowance} days taken`}
    >
      <span className="text-base tabular-nums">{tone.over ? 0 : remaining}</span>
      <span className="text-[10px] font-normal text-muted-foreground">/ {allowance}</span>
    </span>
  );
}

// ── Table view — one row per staff × leave type ────────────────────────────

type TableRowItem = EnrichedBalance & {
  staffProfileId: string;
  staffName: string;
  departmentName: string | null;
};

function BalancesTableView({
  rows,
  onEdit,
}: {
  rows: TableRowItem[];
  onEdit: (staffProfileId: string, staffName: string, b: EnrichedBalance) => void;
}) {
  return (
    <div className="overflow-hidden rounded-xl border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Staff Member</TableHead>
            <TableHead>Department</TableHead>
            <TableHead>Leave Type</TableHead>
            <TableHead className="text-right">Entitlement</TableHead>
            <TableHead className="text-right">Taken</TableHead>
            <TableHead className="text-right">Remaining</TableHead>
            <TableHead className="text-right">Carry-over</TableHead>
            <TableHead className="w-12 text-right">Edit</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 ? (
            <TableRow>
              <TableCell colSpan={8} className="py-12 text-center text-muted-foreground">
                No leave balances match the current filters.
              </TableCell>
            </TableRow>
          ) : (
            rows.map((r) => (
              <TableRow key={`${r.staffProfileId}-${r.id}`}>
                <TableCell className="font-medium">{r.staffName}</TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {r.departmentName ?? "—"}
                </TableCell>
                <TableCell>
                  <span>{getLeaveTypeDisplayName(r.leaveType?.name ?? "—")}</span>
                  {r.isSynthetic && (
                    <span
                      className="ml-1 text-[10px] uppercase text-muted-foreground"
                      title="Role-based default — no explicit balance recorded yet."
                    >
                      (default)
                    </span>
                  )}
                </TableCell>
                <TableCell className="text-right font-mono text-sm tabular-nums">
                  {r.effectiveEntitlement}
                </TableCell>
                <TableCell className="text-right font-mono text-sm tabular-nums">
                  {r.used}
                </TableCell>
                <TableCell className="text-right">
                  <RemainingBadge
                    remaining={r.remaining}
                    used={r.used}
                    allowance={r.allowance}
                  />
                </TableCell>
                <TableCell className="text-right font-mono text-sm tabular-nums text-muted-foreground">
                  {r.allowsCarryOver ? r.effectiveCarriedOver : "—"}
                </TableCell>
                <TableCell className="text-right">
                  <Button
                    size="icon"
                    variant="ghost"
                    className="size-7"
                    onClick={() => onEdit(r.staffProfileId, r.staffName, r)}
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
  );
}

// ── Staff balance card — used by Cards + By-Department views ────────────────

function StaffBalanceCard({
  staff,
  typeFilter,
  onEdit,
}: {
  staff: StaffBalances;
  typeFilter: string;
  onEdit: (staffProfileId: string, staffName: string, b: EnrichedBalance) => void;
}) {
  const balances = typeFilter
    ? staff.balances.filter((b) => b.leaveTypeId === typeFilter)
    : staff.balances;

  return (
    <Card className="overflow-hidden">
      <CardContent className="space-y-3 p-4">
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="font-semibold leading-tight">{staff.staffName}</div>
            <div className="text-xs text-muted-foreground">
              {staff.departmentName ?? "No department"}
            </div>
          </div>
        </div>
        {balances.length === 0 ? (
          <div className="rounded-lg border border-dashed py-4 text-center text-xs text-muted-foreground">
            No balances for this leave type.
          </div>
        ) : (
          <div className="space-y-2.5">
            {balances.map((b) => {
              const tone = remainingTone(b.used, b.allowance);
              return (
                <div
                  key={b.id}
                  className="space-y-1.5 rounded-lg border bg-card p-2.5"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium">
                      {getLeaveTypeDisplayName(b.leaveType?.name ?? "—")}
                      {b.isSynthetic && (
                        <span className="ml-1 text-[10px] uppercase text-muted-foreground">
                          (default)
                        </span>
                      )}
                    </span>
                    <button
                      type="button"
                      className="text-muted-foreground transition-colors hover:text-foreground"
                      onClick={() => onEdit(staff.staffProfileId, staff.staffName, b)}
                      title={
                        b.isSynthetic
                          ? "Record an explicit balance"
                          : "Adjust balance"
                      }
                    >
                      <Pencil className="size-3" />
                    </button>
                  </div>
                  <div className="flex items-baseline justify-between">
                    <span className="flex items-baseline gap-1">
                      <span className={`text-xl font-bold tabular-nums ${tone.text}`}>
                        {tone.over ? 0 : b.remaining}
                      </span>
                      <span className="text-[10px] text-muted-foreground">
                        days remaining
                      </span>
                    </span>
                    <span className="text-[11px] tabular-nums text-muted-foreground">
                      {b.used} of {b.allowance} taken
                    </span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className={`h-full rounded-full transition-all ${tone.bar}`}
                      style={{ width: `${tone.pct}%` }}
                    />
                  </div>
                  {b.allowsCarryOver && b.effectiveCarriedOver > 0 && (
                    <div className="text-[10px] text-muted-foreground">
                      Includes {b.effectiveCarriedOver} carried-over day(s)
                    </div>
                  )}
                  {tone.over && (
                    <div className="text-[10px] text-red-600 dark:text-red-400">
                      {b.used - b.allowance} day(s) over allowance
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ── View toggle options ────────────────────────────────────────────────────

const VIEW_OPTIONS: { mode: ViewMode; label: string; title: string; Icon: typeof List }[] = [
  { mode: "table",      label: "Table",      title: "Compact table",        Icon: List },
  { mode: "cards",      label: "Cards",      title: "Balance cards",        Icon: LayoutGrid },
  { mode: "department", label: "By Dept",    title: "Grouped by department", Icon: Columns3 },
];

// ───────────────────────────────────────────────────────────────────────────
// Page
// ───────────────────────────────────────────────────────────────────────────

function BalancesPage() {
  const [viewMode, setViewMode] = useState<ViewMode>("table");
  const [typeFilter, setTypeFilter] = useState<string>("");
  const [search, setSearch] = useState<string>("");
  const [yearFilter, setYearFilter] = useState<number>(new Date().getFullYear());
  const [editTarget, setEditTarget] = useState<EditTarget | null>(null);

  const { team } = useTeamFilter();

  const { data, isLoading } = useQuery(
    orpc.leave.balances.listAll.queryOptions({
      input: { team: team === "All" ? undefined : team },
    }),
  );
  const staffBalances: StaffBalances[] = (data ?? []) as StaffBalances[];

  const { data: leaveTypesData } = useQuery(orpc.leave.types.list.queryOptions());
  const leaveTypes: LeaveTypeLite[] = leaveTypesData ?? [];

  // Distinct leave types present across all staff balances (for the filter).
  const typeOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const s of staffBalances) {
      for (const b of s.balances) {
        if (b.leaveTypeId) {
          map.set(b.leaveTypeId, getLeaveTypeDisplayName(b.leaveType?.name ?? "—"));
        }
      }
    }
    return [...map.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [staffBalances]);

  // Years available — derived from balance contract years, current year always.
  const yearOptions = useMemo(() => {
    const set = new Set<number>([new Date().getFullYear()]);
    for (const s of staffBalances) {
      for (const b of s.balances) {
        if (b.contractYearStart) {
          set.add(parseISO(b.contractYearStart).getFullYear());
        }
      }
    }
    return [...set].sort((a, b) => b - a);
  }, [staffBalances]);

  // Apply search + year filter at staff level; keep balances within year.
  const filteredStaff = useMemo(() => {
    const q = search.trim().toLowerCase();
    return staffBalances
      .map((s) => ({
        ...s,
        balances: s.balances.filter(
          (b) =>
            !b.contractYearStart ||
            parseISO(b.contractYearStart).getFullYear() === yearFilter,
        ),
      }))
      .filter((s) => {
        if (q && !s.staffName.toLowerCase().includes(q)) return false;
        return true;
      });
  }, [staffBalances, search, yearFilter]);

  // Flattened rows for the table view (one per staff × leave type).
  const tableRows: TableRowItem[] = useMemo(() => {
    const out: TableRowItem[] = [];
    for (const s of filteredStaff) {
      for (const b of s.balances) {
        if (typeFilter && b.leaveTypeId !== typeFilter) continue;
        out.push({
          ...b,
          staffProfileId: s.staffProfileId,
          staffName: s.staffName,
          departmentName: s.departmentName,
        });
      }
    }
    return out;
  }, [filteredStaff, typeFilter]);

  const pagination = usePagination(tableRows, 25);

  // Department grouping for the By-Dept view.
  const byDepartment = useMemo(() => {
    const map = new Map<string, StaffBalances[]>();
    for (const s of filteredStaff) {
      const key = s.departmentName ?? "No department";
      const list = map.get(key) ?? [];
      list.push(s);
      map.set(key, list);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [filteredStaff]);

  // Summary stats — total staff covered + an annual-leave low-balance flag.
  const totalStaff = filteredStaff.length;
  const annualType = leaveTypes.find((t) =>
    t.name.toLowerCase().includes("annual"),
  );
  const lowAnnualCount = useMemo(() => {
    if (!annualType) return 0;
    return filteredStaff.filter((s) => {
      const b = s.balances.find((x) => x.leaveTypeId === annualType.id);
      if (!b || b.allowance <= 0) return false;
      return b.used / b.allowance >= 0.8;
    }).length;
  }, [filteredStaff, annualType]);

  function openEdit(staffProfileId: string, staffName: string, b: EnrichedBalance) {
    setEditTarget({ staffProfileId, staffName, balance: b });
  }

  return (
    <>
      <Header fixed>
        <div className="flex items-center gap-2">
          <Wallet className="size-4 text-muted-foreground" />
          <span className="text-sm font-medium">Leave Balances</span>
        </div>
        <div className="ms-auto flex items-center gap-2">
          <DepartmentFilter />
          <ThemeSwitch />
        </div>
      </Header>

      <LeaveSubNav />

      <Main className="space-y-6">
        <PageHeader
          eyebrow="People"
          title="Leave Balances"
          description="Leave taken vs remaining for every active staff member."
        />

        {/* Stats strip */}
        <div className="grid gap-3 sm:grid-cols-3">
          <Card><CardContent className="p-4">
            <div className="text-2xl font-bold tabular-nums">{totalStaff}</div>
            <div className="text-xs text-muted-foreground">
              Staff covered {team !== "All" ? `· ${team}` : ""}
            </div>
          </CardContent></Card>
          <Card><CardContent className="p-4">
            <div className="text-2xl font-bold tabular-nums">{tableRows.length}</div>
            <div className="text-xs text-muted-foreground">
              Balance entries · {yearFilter}
            </div>
          </CardContent></Card>
          <Card><CardContent className="p-4">
            <div className="text-2xl font-bold tabular-nums text-amber-600 dark:text-amber-400">
              {lowAnnualCount}
            </div>
            <div className="text-xs text-muted-foreground">
              Low annual balance (≥80% used)
            </div>
          </CardContent></Card>
        </div>

        {/* Toolbar — view toggle + filters */}
        <div className="flex flex-wrap items-center gap-3">
          {/* View-mode toggle */}
          <div className="inline-flex rounded-lg border p-0.5">
            {VIEW_OPTIONS.map(({ mode, label, title, Icon }) => (
              <button
                key={mode}
                type="button"
                title={title}
                onClick={() => setViewMode(mode)}
                className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors ${
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

          {/* Year selector */}
          <Select value={String(yearFilter)} onValueChange={(v) => setYearFilter(Number(v))}>
            <SelectTrigger className="w-[110px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {yearOptions.map((y) => (
                <SelectItem key={y} value={String(y)}>{y}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Leave-type filter */}
          <Select
            value={typeFilter || "_all"}
            onValueChange={(v) => setTypeFilter(v && v !== "_all" ? v : "")}
          >
            <SelectTrigger className="w-[170px]">
              <SelectValue placeholder="All Leave Types">
                {(v: unknown) =>
                  v && v !== "_all"
                    ? typeOptions.find((t) => t.id === v)?.name ?? "All Leave Types"
                    : "All Leave Types"}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="_all">All Leave Types</SelectItem>
              {typeOptions.map((t) => (
                <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Search box */}
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search staff…"
              className="h-9 w-[200px] pl-8"
            />
          </div>
        </div>

        {/* Active view */}
        {isLoading ? (
          <Skeleton className="h-64 w-full" />
        ) : viewMode === "table" ? (
          <>
            <BalancesTableView rows={pagination.pageItems} onEdit={openEdit} />
            <DataPagination
              page={pagination.page}
              pageCount={pagination.pageCount}
              total={pagination.total}
              rangeLabel={pagination.rangeLabel}
              onPageChange={pagination.setPage}
            />
          </>
        ) : viewMode === "cards" ? (
          filteredStaff.length === 0 ? (
            <div className="rounded-xl border py-16 text-center text-muted-foreground">
              No staff match the current filters.
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {filteredStaff.map((s) => (
                <StaffBalanceCard
                  key={s.staffProfileId}
                  staff={s}
                  typeFilter={typeFilter}
                  onEdit={openEdit}
                />
              ))}
            </div>
          )
        ) : byDepartment.length === 0 ? (
          <div className="rounded-xl border py-16 text-center text-muted-foreground">
            No staff match the current filters.
          </div>
        ) : (
          <div className="space-y-6">
            {byDepartment.map(([dept, staff]) => (
              <div key={dept} className="space-y-3">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-semibold">{dept}</h3>
                  <span className="rounded-full bg-muted px-2 py-0.5 text-xs tabular-nums text-muted-foreground">
                    {staff.length}
                  </span>
                </div>
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {staff.map((s) => (
                    <StaffBalanceCard
                      key={s.staffProfileId}
                      staff={s}
                      typeFilter={typeFilter}
                      onEdit={openEdit}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Adjust / record balance dialog */}
        <Dialog
          open={Boolean(editTarget)}
          onOpenChange={(v) => { if (!v) setEditTarget(null); }}
        >
          {editTarget && (
            <BalanceDialog
              target={editTarget}
              leaveTypes={leaveTypes}
              onClose={() => setEditTarget(null)}
            />
          )}
        </Dialog>
      </Main>
    </>
  );
}
