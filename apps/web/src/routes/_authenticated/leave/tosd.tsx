// /leave/tosd — Time Off & Sick Days register
//
// Multi-view page (see CLAUDE.md "Multi-View Pages Pattern"):
//   • Table     — flat register
//   • Board     — kanban grouped by TOSD type
//   • Analytics — charts: by type, by period, by staff
// Plus NOC/DCS department filter, type filter, and year (incl. "All years").

import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import { BarChart3, ClipboardList, Columns3, List, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";

import { Button } from "@ndma-dcs-staff-portal/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@ndma-dcs-staff-portal/ui/components/card";
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
import { DepartmentFilter } from "@/components/layout/department-filter";
import { Header } from "@/components/layout/header";
import { Main } from "@/components/layout/main";
import { ThemeSwitch } from "@/components/theme-switch";
import { LeaveSubNav } from "@/components/layout/leave-sub-nav";
import { useTeamFilter } from "@/lib/team-filter";
import { orpc } from "@/utils/orpc";

export const Route = createFileRoute("/_authenticated/leave/tosd")({
  component: TosdPage,
});

const NOC_DEPT = "Network Operations Centre";

const TOSD_TYPES = [
  "reported_sick", "medical", "absent", "time_off",
  "work_from_home", "lateness", "callout_legacy",
] as const;
type TosdType = (typeof TOSD_TYPES)[number];
type ViewMode = "table" | "board" | "analytics";

const TOSD_TYPE_LABELS: Record<TosdType, string> = {
  reported_sick: "Reported Sick",
  medical: "Medical",
  absent: "Absent",
  time_off: "Time Off",
  work_from_home: "Work From Home",
  lateness: "Lateness",
  callout_legacy: "Callout (Legacy)",
};

const TOSD_TYPE_COLORS: Record<TosdType, string> = {
  reported_sick: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200",
  medical: "bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-200",
  absent: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200",
  time_off: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200",
  work_from_home: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-200",
  lateness: "bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-200",
  callout_legacy: "bg-muted text-muted-foreground",
};
// Chart hex per type — categorical (no green, per CLAUDE.md design rules).
const TOSD_TYPE_HEX: Record<TosdType, string> = {
  reported_sick: "#ef4444",
  medical: "#a855f7",
  absent: "#f59e0b",
  time_off: "#3b82f6",
  work_from_home: "#2563eb",
  lateness: "#f97316",
  callout_legacy: "#94a3b8",
};

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

type TosdRow = {
  id: string;
  staffId: string;
  date: string;
  type: string;
  reasonText?: string | null;
  days?: string | null;
  hours?: string | null;
  staffProfile?: {
    user?: { name?: string | null } | null;
    department?: { name?: string | null } | null;
    status?: string | null;
  } | null;
};

// Historical records belong to people who have left NDMA — flag them gently.
function isFormerStaff(r: TosdRow): boolean {
  return r.staffProfile?.status === "inactive" || r.staffProfile?.status === "terminated";
}
function FormerTag() {
  return (
    <span className="ml-1.5 inline-flex items-center rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground align-middle">
      Former
    </span>
  );
}

type StaffListItem = {
  id: string;
  employeeId: string;
  user?: { name?: string | null } | null;
};

function tosdStaffName(r: TosdRow): string {
  return r.staffProfile?.user?.name ?? "—";
}
function num(v?: string | null): number {
  const n = v ? Number.parseFloat(v) : 0;
  return Number.isFinite(n) ? n : 0;
}

// ─── Add TOSD Record Dialog ────────────────────────────────────────────────────

type AddFormState = {
  staffId: string; date: string; type: TosdType;
  reasonText: string; days: string; hours: string;
};

function AddTosdDialog({
  open, onOpenChange, staffList,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  staffList: StaffListItem[];
}) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<AddFormState>({
    staffId: "", date: "", type: "reported_sick", reasonText: "", days: "", hours: "",
  });

  const mutation = useMutation(
    orpc.leave.tosd.create.mutationOptions({
      onSuccess: () => {
        toast.success("TOSD record added");
        queryClient.invalidateQueries({ queryKey: orpc.leave.tosd.list.key() });
        onOpenChange(false);
        setForm({ staffId: "", date: "", type: "reported_sick", reasonText: "", days: "", hours: "" });
      },
      onError: (err: Error) => toast.error(err.message ?? "Failed to add record"),
    }),
  );

  function handleSave() {
    if (!form.staffId || !form.date) {
      toast.error("Staff and date are required");
      return;
    }
    mutation.mutate({
      staffId: form.staffId,
      date: form.date,
      type: form.type,
      reasonText: form.reasonText || undefined,
      days: form.days || undefined,
      hours: form.hours || undefined,
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add TOSD Record</DialogTitle>
          <DialogDescription>
            Record a time-off, sick day, lateness or work-from-home entry for a staff member.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>Staff Member</Label>
            <Select value={form.staffId} onValueChange={(v) => setForm((f) => ({ ...f, staffId: v ?? "" }))}>
              <SelectTrigger>
                <SelectValue>
                  {form.staffId
                    ? (staffList.find((s) => s.id === form.staffId)?.user?.name ?? "Unnamed")
                    : "Select staff…"}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {staffList.map((s) => (
                  <SelectItem key={s.id} value={s.id}>{s.user?.name ?? s.employeeId}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Date</Label>
            <Input type="date" value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} />
          </div>
          <div className="space-y-1.5">
            <Label>Type</Label>
            <Select value={form.type} onValueChange={(v) => setForm((f) => ({ ...f, type: v as TosdType }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {TOSD_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>{TOSD_TYPE_LABELS[t]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Reason (optional)</Label>
            <Input
              value={form.reasonText}
              onChange={(e) => setForm((f) => ({ ...f, reasonText: e.target.value }))}
              placeholder="Brief explanation…"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Days</Label>
              <Input type="number" step="0.5" min="0" value={form.days}
                onChange={(e) => setForm((f) => ({ ...f, days: e.target.value }))} placeholder="0" />
            </div>
            <div className="space-y-1.5">
              <Label>Hours</Label>
              <Input type="number" step="0.5" min="0" value={form.hours}
                onChange={(e) => setForm((f) => ({ ...f, hours: e.target.value }))} placeholder="0" />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={mutation.isPending}>Cancel</Button>
          <Button onClick={handleSave} disabled={mutation.isPending}>
            {mutation.isPending ? "Saving…" : "Add Record"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Edit TOSD Record Dialog ───────────────────────────────────────────────────

function EditTosdDialog({ record, onClose }: { record: TosdRow; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    type: record.type as TosdType,
    reasonText: record.reasonText ?? "",
    days: record.days ?? "",
    hours: record.hours ?? "",
  });

  const mutation = useMutation(
    orpc.leave.tosd.update.mutationOptions({
      onSuccess: () => {
        toast.success("TOSD record updated");
        queryClient.invalidateQueries({ queryKey: orpc.leave.tosd.list.key() });
        onClose();
      },
      onError: (err: Error) => toast.error(err.message ?? "Failed to update record"),
    }),
  );

  return (
    <DialogContent className="sm:max-w-md">
      <DialogHeader>
        <DialogTitle>Edit TOSD Record</DialogTitle>
        <DialogDescription>
          Update the record for <span className="font-medium">{tosdStaffName(record)}</span>.
        </DialogDescription>
      </DialogHeader>
      <div className="space-y-4 py-2">
        <div className="space-y-1.5">
          <Label>Type</Label>
          <Select value={form.type} onValueChange={(v) => setForm((f) => ({ ...f, type: v as TosdType }))}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {TOSD_TYPES.map((t) => (
                <SelectItem key={t} value={t}>{TOSD_TYPE_LABELS[t]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Reason (optional)</Label>
          <Input value={form.reasonText}
            onChange={(e) => setForm((f) => ({ ...f, reasonText: e.target.value }))}
            placeholder="Brief explanation…" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Days</Label>
            <Input type="number" step="0.5" min="0" value={form.days}
              onChange={(e) => setForm((f) => ({ ...f, days: e.target.value }))} placeholder="0" />
          </div>
          <div className="space-y-1.5">
            <Label>Hours</Label>
            <Input type="number" step="0.5" min="0" value={form.hours}
              onChange={(e) => setForm((f) => ({ ...f, hours: e.target.value }))} placeholder="0" />
          </div>
        </div>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onClose} disabled={mutation.isPending}>Cancel</Button>
        <Button
          onClick={() => mutation.mutate({
            id: record.id, type: form.type,
            reasonText: form.reasonText || null,
            days: form.days || null, hours: form.hours || null,
          })}
          disabled={mutation.isPending}
        >
          {mutation.isPending ? "Saving…" : "Save Changes"}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

function TypeBadge({ type }: { type: string }) {
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
      TOSD_TYPE_COLORS[type as TosdType] ?? "bg-muted text-muted-foreground"
    }`}>
      {TOSD_TYPE_LABELS[type as TosdType] ?? type}
    </span>
  );
}

// ─── Table view ────────────────────────────────────────────────────────────────

function TosdTableView({
  rows, onEdit, onDelete,
}: {
  rows: TosdRow[];
  onEdit: (r: TosdRow) => void;
  onDelete: (r: TosdRow) => void;
}) {
  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Staff</TableHead>
            <TableHead>Date</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Reason</TableHead>
            <TableHead className="text-right">Days</TableHead>
            <TableHead className="text-right">Hours</TableHead>
            <TableHead className="w-24 text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 ? (
            <TableRow>
              <TableCell colSpan={7} className="py-12 text-center text-muted-foreground">
                No TOSD records found for the selected filters.
              </TableCell>
            </TableRow>
          ) : rows.map((r) => (
            <TableRow key={r.id}>
              <TableCell>
                <span className="font-medium">{tosdStaffName(r)}</span>
                {isFormerStaff(r) && <FormerTag />}
                {r.staffProfile?.department?.name && (
                  <p className="text-xs text-muted-foreground">{r.staffProfile.department.name}</p>
                )}
              </TableCell>
              <TableCell className="text-sm">
                {r.date ? format(parseISO(r.date), "d MMM yyyy") : "—"}
              </TableCell>
              <TableCell><TypeBadge type={r.type} /></TableCell>
              <TableCell className="text-sm text-muted-foreground">{r.reasonText ?? "—"}</TableCell>
              <TableCell className="text-right font-mono text-sm">{r.days ?? "—"}</TableCell>
              <TableCell className="text-right font-mono text-sm">{r.hours ?? "—"}</TableCell>
              <TableCell className="text-right">
                <div className="flex justify-end gap-1">
                  <Button size="icon" variant="ghost" className="size-7"
                    onClick={() => onEdit(r)} title="Edit record">
                    <Pencil className="size-3.5" />
                  </Button>
                  <Button size="icon" variant="ghost" className="size-7 text-destructive hover:text-destructive/80"
                    onClick={() => onDelete(r)} title="Delete record">
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

// ─── Board view — grouped by type ──────────────────────────────────────────────

function TosdBoardView({
  rows, onEdit, onDelete,
}: {
  rows: TosdRow[];
  onEdit: (r: TosdRow) => void;
  onDelete: (r: TosdRow) => void;
}) {
  return (
    <div className="flex gap-4 overflow-x-auto pb-2">
      {TOSD_TYPES.map((t) => {
        const items = rows.filter((r) => r.type === t);
        if (items.length === 0) return null;
        return (
          <div key={t} className="flex w-72 shrink-0 flex-col gap-2">
            <div className="flex items-center justify-between px-1">
              <TypeBadge type={t} />
              <span className="rounded-full bg-muted px-2 py-0.5 text-xs tabular-nums text-muted-foreground">
                {items.length}
              </span>
            </div>
            <div className="space-y-2">
              {items.map((r) => (
                <Card key={r.id}>
                  <CardContent className="space-y-1 p-3">
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-sm font-medium leading-tight">
                        {tosdStaffName(r)}{isFormerStaff(r) && <FormerTag />}
                      </span>
                      <div className="flex gap-0.5">
                        <Button size="icon" variant="ghost" className="size-6"
                          onClick={() => onEdit(r)} title="Edit">
                          <Pencil className="size-3" />
                        </Button>
                        <Button size="icon" variant="ghost" className="size-6 text-destructive hover:text-destructive/80"
                          onClick={() => onDelete(r)} title="Delete">
                          <Trash2 className="size-3" />
                        </Button>
                      </div>
                    </div>
                    <div className="font-mono text-xs text-muted-foreground">
                      {r.date ? format(parseISO(r.date), "d MMM yyyy") : "—"}
                      {r.days ? ` · ${r.days}d` : ""}{r.hours ? ` · ${r.hours}h` : ""}
                    </div>
                    {r.reasonText && <div className="text-xs text-muted-foreground">{r.reasonText}</div>}
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Analytics view — charts ───────────────────────────────────────────────────

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <Card><CardContent className="p-4">
      <div className="text-2xl font-bold tabular-nums">{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </CardContent></Card>
  );
}

function TosdAnalyticsView({ rows, year }: { rows: TosdRow[]; year: number | "all" }) {
  const byType = useMemo(() => {
    return TOSD_TYPES.map((t) => ({
      name: TOSD_TYPE_LABELS[t],
      value: rows.filter((r) => r.type === t).length,
      hex: TOSD_TYPE_HEX[t],
    })).filter((d) => d.value > 0);
  }, [rows]);

  // By period — months if a specific year is picked, else by year.
  const byPeriod = useMemo(() => {
    if (year === "all") {
      const m = new Map<string, number>();
      for (const r of rows) {
        const y = r.date.slice(0, 4);
        m.set(y, (m.get(y) ?? 0) + 1);
      }
      return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]))
        .map(([name, value]) => ({ name, value }));
    }
    return MONTHS.map((name, i) => ({
      name,
      value: rows.filter((r) => parseISO(r.date).getMonth() === i).length,
    }));
  }, [rows, year]);

  const byStaff = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of rows) {
      const k = tosdStaffName(r);
      m.set(k, (m.get(k) ?? 0) + 1);
    }
    return [...m.entries()]
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 12);
  }, [rows]);

  const sickDays = useMemo(
    () => rows.filter((r) => r.type === "reported_sick" || r.type === "medical")
      .reduce((s, r) => s + num(r.days), 0),
    [rows],
  );
  const timeOffHours = useMemo(
    () => rows.filter((r) => r.type === "time_off")
      .reduce((s, r) => s + num(r.hours) + num(r.days) * 8, 0),
    [rows],
  );
  const wfhCount = useMemo(() => rows.filter((r) => r.type === "work_from_home").length, [rows]);

  if (rows.length === 0) {
    return (
      <div className="rounded-xl border py-16 text-center text-muted-foreground">
        <BarChart3 className="mx-auto mb-2 size-8 opacity-40" />
        No TOSD records for the selected filters.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-4">
        <StatCard label="Total records" value={rows.length} />
        <StatCard label="Sick / medical days" value={sickDays} />
        <StatCard label="Time-off hours (incl. days×8)" value={timeOffHours} />
        <StatCard label="Work-from-home entries" value={wfhCount} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-1"><CardTitle className="text-sm">Records by type</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={byType}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} interval={0} angle={-15} textAnchor="end" height={50} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                  {byType.map((d) => <Cell key={d.name} fill={d.hex} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-1">
            <CardTitle className="text-sm">
              Records by {year === "all" ? "year" : "month"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={byPeriod}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="value" fill="#3b82f6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-1"><CardTitle className="text-sm">Records per staff (top 12)</CardTitle></CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={Math.max(byStaff.length * 32, 120)}>
            <BarChart data={byStaff} layout="vertical" margin={{ left: 20 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} />
              <YAxis type="category" dataKey="name" width={130} tick={{ fontSize: 11 }} />
              <Tooltip />
              <Bar dataKey="value" fill="#2563eb" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
}

const VIEW_OPTIONS: { mode: ViewMode; label: string; Icon: typeof List }[] = [
  { mode: "table",     label: "Table",     Icon: List },
  { mode: "board",     label: "Board",     Icon: Columns3 },
  { mode: "analytics", label: "Analytics", Icon: BarChart3 },
];

// ─── Main page ─────────────────────────────────────────────────────────────────

function TosdPage() {
  const [viewMode,       setViewMode]       = useState<ViewMode>("table");
  const [selectedStaffId, setSelectedStaffId] = useState<string>("");
  const [yearFilter,     setYearFilter]     = useState<number | "all">(new Date().getFullYear());
  const [typeFilter,     setTypeFilter]     = useState<string>("");
  const [addOpen,        setAddOpen]        = useState(false);
  const [editRecord,     setEditRecord]     = useState<TosdRow | null>(null);
  const [deleteTarget,   setDeleteTarget]   = useState<TosdRow | null>(null);
  const queryClient = useQueryClient();
  const { team } = useTeamFilter();

  const { data: staffData } = useQuery(
    orpc.staff.list.queryOptions({ input: { limit: 500, offset: 0 } }),
  );
  const staffList: StaffListItem[] = staffData ?? [];

  // Fetch the whole register once — small dataset; all filtering is client-side.
  const { data: allRows, isLoading } = useQuery(
    orpc.leave.tosd.list.queryOptions({ input: {} }),
  );

  const deleteMutation = useMutation(
    orpc.leave.tosd.delete.mutationOptions({
      onSuccess: () => {
        toast.success("TOSD record deleted");
        queryClient.invalidateQueries({ queryKey: orpc.leave.tosd.list.key() });
        setDeleteTarget(null);
      },
      onError: (err: Error) => toast.error(err.message ?? "Failed to delete record"),
    }),
  );

  const yearOptions = useMemo(() => {
    const set = new Set<number>([new Date().getFullYear()]);
    for (const r of (allRows ?? []) as TosdRow[]) set.add(parseISO(r.date).getFullYear());
    return [...set].sort((a, b) => b - a);
  }, [allRows]);

  const rows = useMemo(() => {
    let list = (allRows ?? []) as TosdRow[];
    if (selectedStaffId) list = list.filter((r) => r.staffId === selectedStaffId);
    if (typeFilter)      list = list.filter((r) => r.type === typeFilter);
    if (yearFilter !== "all") {
      list = list.filter((r) => parseISO(r.date).getFullYear() === yearFilter);
    }
    if (team !== "All") {
      list = list.filter((r) => {
        const isNoc = r.staffProfile?.department?.name === NOC_DEPT;
        return team === "NOC" ? isNoc : !isNoc;
      });
    }
    return list;
  }, [allRows, selectedStaffId, typeFilter, yearFilter, team]);

  return (
    <>
      <Header>
        <div className="flex items-center gap-2">
          <ClipboardList className="h-5 w-5" />
          <h1 className="text-lg font-semibold">Time Off & Sick Days</h1>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <DepartmentFilter />
          <Button onClick={() => setAddOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />Add Record
          </Button>
          <ThemeSwitch />
        </div>
      </Header>

      <LeaveSubNav />
      <Main className="space-y-4">
        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="inline-flex rounded-lg border p-0.5">
            {VIEW_OPTIONS.map(({ mode, label, Icon }) => (
              <button
                key={mode}
                onClick={() => setViewMode(mode)}
                className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors ${
                  viewMode === mode
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Icon className="size-3.5" />{label}
              </button>
            ))}
          </div>

          <Select value={selectedStaffId || "_all"}
            onValueChange={(v) => setSelectedStaffId(v && v !== "_all" ? v : "")}>
            <SelectTrigger className="w-[200px]"><SelectValue placeholder="All staff" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="_all">All staff</SelectItem>
              {staffList.map((s) => (
                <SelectItem key={s.id} value={s.id}>{s.user?.name ?? s.employeeId}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={String(yearFilter)}
            onValueChange={(v) => setYearFilter(v === "all" ? "all" : Number(v))}>
            <SelectTrigger className="w-[120px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All years</SelectItem>
              {yearOptions.map((y) => (
                <SelectItem key={y} value={String(y)}>{y}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Type filter pills — hidden in board view (board groups by type) */}
          {viewMode !== "board" && (
            <div className="flex flex-wrap gap-1.5">
              <button
                onClick={() => setTypeFilter("")}
                className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                  !typeFilter ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80"
                }`}
              >
                All types
              </button>
              {TOSD_TYPES.map((t) => (
                <button
                  key={t}
                  onClick={() => setTypeFilter(t === typeFilter ? "" : t)}
                  className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                    typeFilter === t ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80"
                  }`}
                >
                  {TOSD_TYPE_LABELS[t]}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Active view */}
        {isLoading ? (
          <Skeleton className="h-64 w-full" />
        ) : viewMode === "table" ? (
          <TosdTableView rows={rows} onEdit={setEditRecord} onDelete={setDeleteTarget} />
        ) : viewMode === "board" ? (
          <TosdBoardView rows={rows} onEdit={setEditRecord} onDelete={setDeleteTarget} />
        ) : (
          <TosdAnalyticsView rows={rows} year={yearFilter} />
        )}
      </Main>

      <AddTosdDialog open={addOpen} onOpenChange={setAddOpen} staffList={staffList} />

      <Dialog open={Boolean(editRecord)} onOpenChange={(v) => { if (!v) setEditRecord(null); }}>
        {editRecord && <EditTosdDialog record={editRecord} onClose={() => setEditRecord(null)} />}
      </Dialog>

      <Dialog open={Boolean(deleteTarget)} onOpenChange={(v) => { if (!v) setDeleteTarget(null); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete TOSD Record</DialogTitle>
            <DialogDescription>
              Permanently delete the{" "}
              <span className="font-medium">
                {deleteTarget ? (TOSD_TYPE_LABELS[deleteTarget.type as TosdType] ?? deleteTarget.type) : ""}
              </span>{" "}
              record for{" "}
              <span className="font-medium">{deleteTarget ? tosdStaffName(deleteTarget) : "this staff member"}</span>?
              This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDeleteTarget(null)} disabled={deleteMutation.isPending}>
              Cancel
            </Button>
            <Button variant="destructive" disabled={deleteMutation.isPending}
              onClick={() => { if (deleteTarget) deleteMutation.mutate({ id: deleteTarget.id }); }}>
              {deleteMutation.isPending ? "Deleting…" : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
