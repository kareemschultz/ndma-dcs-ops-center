// /attendance/roll-call — Daily Roll-Call
//
// Mark and review today's attendance for all staff, grouped by department.
// Drop-in from the design handoff prototype, adapted to the project's
// attendance status enum: Workday | Restday | Absent | Leave | Holiday.

import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import {
  Calendar,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Search,
  Users,
} from "lucide-react";
import { toast } from "sonner";

import { Avatar, AvatarFallback } from "@ndma-dcs-staff-portal/ui/components/avatar";
import { Badge } from "@ndma-dcs-staff-portal/ui/components/badge";
import { Button } from "@ndma-dcs-staff-portal/ui/components/button";
import { Card, CardContent } from "@ndma-dcs-staff-portal/ui/components/card";
import { Input } from "@ndma-dcs-staff-portal/ui/components/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@ndma-dcs-staff-portal/ui/components/select";
import { Skeleton } from "@ndma-dcs-staff-portal/ui/components/skeleton";

import { AttendanceSubNav } from "@/components/layout/attendance-sub-nav";
import { Header } from "@/components/layout/header";
import { Main } from "@/components/layout/main";
import { ThemeSwitch } from "@/components/theme-switch";
import { orpc } from "@/utils/orpc";

export const Route = createFileRoute("/_authenticated/attendance/roll-call")({
  component: RollCallPage,
});

// ─── Types ────────────────────────────────────────────────────────────────────

type AttendanceStatus = "Workday" | "Restday" | "Absent" | "Leave" | "Holiday";

const STATUS_OPTIONS: { value: AttendanceStatus; short: string; label: string }[] = [
  { value: "Workday", short: "P", label: "Workday" },
  { value: "Restday", short: "R", label: "Restday" },
  { value: "Leave", short: "L", label: "Leave" },
  { value: "Holiday", short: "H", label: "Holiday" },
  { value: "Absent", short: "X", label: "Absent" },
];

// Active button style per status (no green palette).
const STATUS_ACTIVE_CLASS: Record<AttendanceStatus, string> = {
  Workday: "bg-blue-600 text-white border-blue-600",
  Restday: "bg-slate-600 text-white border-slate-600",
  Leave: "bg-violet-600 text-white border-violet-600",
  Holiday: "bg-purple-700 text-white border-purple-700",
  Absent: "bg-red-600 text-white border-red-600",
};

const STATUS_PILL_CLASS: Record<AttendanceStatus, string> = {
  Workday: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  Restday: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  Leave: "bg-violet-100 text-violet-800 dark:bg-violet-900/30 dark:text-violet-200",
  Holiday: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-200",
  Absent: "bg-red-100 text-red-900 font-semibold dark:bg-red-900/40 dark:text-red-200",
};

// ─── Types from server ────────────────────────────────────────────────────────

interface StaffItem {
  id: string;
  employeeId: string;
  jobTitle: string;
  departmentId: string;
  user?: { name?: string | null; email?: string | null } | null;
  department?: { id: string; name: string } | null;
}

interface AttendanceLogItem {
  id: number;
  staffId: string;
  date: string;
  status: AttendanceStatus;
  clockIn?: string | null;
  clockOut?: string | null;
  workHours?: string | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function todayString(): string {
  return new Date().toISOString().slice(0, 10);
}

function initialsFor(name: string | null | undefined, fallback: string): string {
  const source = (name && name.trim()) || fallback;
  const parts = source.trim().split(/\s+/);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return (parts[0]?.[0] ?? "?").toUpperCase();
  return ((parts[0]?.[0] ?? "") + (parts[parts.length - 1]?.[0] ?? "")).toUpperCase();
}

function formatLongDate(dateStr: string): string {
  // dateStr is "YYYY-MM-DD" — build a Date in local time
  const [y, m, d] = dateStr.split("-").map((n) => parseInt(n, 10));
  if (!y || !m || !d) return dateStr;
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function shiftDate(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split("-").map((n) => parseInt(n, 10));
  if (!y || !m || !d) return dateStr;
  const date = new Date(y, m - 1, d);
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

// ─── Row component ────────────────────────────────────────────────────────────

interface RollCallRowProps {
  staff: StaffItem;
  log: AttendanceLogItem | undefined;
  pendingStatus: AttendanceStatus | null;
  saving: boolean;
  onMark: (status: AttendanceStatus) => void;
}

function RollCallRow({ staff, log, pendingStatus, saving, onMark }: RollCallRowProps) {
  const status = pendingStatus ?? (log?.status as AttendanceStatus | undefined);
  const displayName = staff.user?.name ?? staff.employeeId ?? "—";
  const initials = initialsFor(staff.user?.name, staff.employeeId);

  return (
    <div className="flex flex-wrap items-center gap-3 bg-background px-4 py-2 transition-colors hover:bg-muted/50">
      <Avatar size="sm">
        <AvatarFallback>{initials}</AvatarFallback>
      </Avatar>

      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium">{displayName}</div>
        <div className="truncate text-xs text-muted-foreground">{staff.jobTitle}</div>
      </div>

      <div className="flex items-center gap-1.5">
        {status ? (
          <span
            className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_PILL_CLASS[status]}`}
          >
            {status}
          </span>
        ) : (
          <span className="text-xs font-medium text-amber-600 dark:text-amber-400">
            Unmarked
          </span>
        )}
        {saving && (
          <span className="text-xs text-muted-foreground">Saving…</span>
        )}
      </div>

      <div className="ml-auto flex flex-wrap items-center justify-end gap-1">
        {STATUS_OPTIONS.map((opt) => {
          const active = status === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              title={opt.label}
              disabled={saving}
              onClick={() => onMark(opt.value)}
              className={`inline-flex h-7 min-w-[2.25rem] items-center justify-center rounded-md border px-2 text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                active
                  ? STATUS_ACTIVE_CLASS[opt.value]
                  : "border-input text-muted-foreground hover:bg-muted"
              }`}
            >
              {opt.short}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── Department group ─────────────────────────────────────────────────────────

interface DeptGroupProps {
  deptName: string;
  staff: StaffItem[];
  logsByStaff: Map<string, AttendanceLogItem>;
  pending: Record<string, AttendanceStatus | undefined>;
  savingIds: Set<string>;
  onMark: (staffId: string, status: AttendanceStatus) => void;
}

function DeptGroup({
  deptName,
  staff,
  logsByStaff,
  pending,
  savingIds,
  onMark,
}: DeptGroupProps) {
  const [open, setOpen] = useState(true);

  const unmarked = staff.filter(
    (s) => !pending[s.id] && !logsByStaff.get(s.id),
  ).length;
  const present = staff.filter((s) => {
    const status = pending[s.id] ?? logsByStaff.get(s.id)?.status;
    return status === "Workday";
  }).length;

  return (
    <Card className="mb-3 overflow-hidden p-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2.5 bg-muted/40 px-4 py-2.5 text-left transition-colors hover:bg-muted/60"
      >
        <ChevronDown
          className={`size-3.5 text-muted-foreground transition-transform duration-200 ${
            open ? "" : "-rotate-90"
          }`}
        />
        <span className="text-sm font-semibold">{deptName}</span>
        <Badge variant="secondary">{staff.length} staff</Badge>
        {unmarked > 0 && (
          <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100 dark:bg-amber-900/30 dark:text-amber-300">
            {unmarked} unmarked
          </Badge>
        )}
        <span className="ml-auto text-xs text-muted-foreground">{present} present</span>
      </button>

      {open && (
        <CardContent className="divide-y divide-border p-0">
          {staff.map((s) => (
            <RollCallRow
              key={s.id}
              staff={s}
              log={logsByStaff.get(s.id)}
              pendingStatus={pending[s.id] ?? null}
              saving={savingIds.has(s.id)}
              onMark={(status) => onMark(s.id, status)}
            />
          ))}
        </CardContent>
      )}
    </Card>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

function RollCallPage() {
  const qc = useQueryClient();

  const [date, setDate] = useState<string>(todayString());
  const [search, setSearch] = useState("");
  const [bulkStatus, setBulkStatus] = useState<AttendanceStatus | "">("");
  const [savingIds, setSavingIds] = useState<Set<string>>(new Set());
  const [pending, setPending] = useState<Record<string, AttendanceStatus | undefined>>({});

  const staffQuery = useQuery(
    orpc.staff.list.queryOptions({ input: { limit: 500, offset: 0 } }),
  );
  const departmentsQuery = useQuery(orpc.staff.getDepartments.queryOptions());

  const logsQuery = useQuery(
    orpc.attendanceTime.logs.list.queryOptions({
      input: { from: date, to: date, limit: 500 },
    }),
  );

  const createMut = useMutation(orpc.attendanceTime.logs.create.mutationOptions());
  const updateMut = useMutation(orpc.attendanceTime.logs.update.mutationOptions());

  const staffList = (staffQuery.data ?? []) as StaffItem[];
  const departments = departmentsQuery.data ?? [];
  const logs = (logsQuery.data ?? []) as AttendanceLogItem[];

  const logsByStaff = useMemo(() => {
    const map = new Map<string, AttendanceLogItem>();
    for (const log of logs) map.set(log.staffId, log);
    return map;
  }, [logs]);

  // Reset transient pending state when date changes
  function changeDate(next: string) {
    setDate(next);
    setPending({});
    setSavingIds(new Set());
  }

  async function markOne(staffId: string, status: AttendanceStatus) {
    setSavingIds((s) => new Set(s).add(staffId));
    setPending((p) => ({ ...p, [staffId]: status }));

    const existing = logsByStaff.get(staffId);
    try {
      if (existing) {
        await updateMut.mutateAsync({ id: existing.id, status });
      } else {
        await createMut.mutateAsync({
          staffProfileId: staffId,
          date,
          status,
        });
      }
      await qc.invalidateQueries({ queryKey: orpc.attendanceTime.logs.list.key() });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to save";
      toast.error(msg);
      setPending((p) => {
        const next = { ...p };
        delete next[staffId];
        return next;
      });
    } finally {
      setSavingIds((s) => {
        const next = new Set(s);
        next.delete(staffId);
        return next;
      });
    }
  }

  async function markAllUnmarked() {
    if (!bulkStatus) {
      toast.error("Pick a bulk status first.");
      return;
    }
    const targets = filteredStaff.filter(
      (s) => !pending[s.id] && !logsByStaff.get(s.id),
    );
    if (targets.length === 0) {
      toast.info("Nothing to mark — all visible staff already have entries.");
      return;
    }
    for (const s of targets) {
      await markOne(s.id, bulkStatus);
    }
    toast.success(`Marked ${targets.length} staff as ${bulkStatus}.`);
  }

  // Filter + group
  const filteredStaff = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return staffList;
    return staffList.filter((s) => {
      const name = (s.user?.name ?? "").toLowerCase();
      const title = (s.jobTitle ?? "").toLowerCase();
      const empId = (s.employeeId ?? "").toLowerCase();
      return name.includes(q) || title.includes(q) || empId.includes(q);
    });
  }, [staffList, search]);

  const deptOrder = useMemo(() => {
    const order = new Map<string, string>();
    for (const d of departments) order.set(d.id, d.name);
    return order;
  }, [departments]);

  const groups = useMemo(() => {
    const byDept = new Map<string, StaffItem[]>();
    for (const s of filteredStaff) {
      const deptName = s.department?.name ?? deptOrder.get(s.departmentId) ?? "Unassigned";
      const arr = byDept.get(deptName) ?? [];
      arr.push(s);
      byDept.set(deptName, arr);
    }
    return Array.from(byDept.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([name, members]) => ({
        name,
        members: members.sort((a, b) =>
          (a.user?.name ?? a.employeeId).localeCompare(b.user?.name ?? b.employeeId),
        ),
      }));
  }, [filteredStaff, deptOrder]);

  // Stats
  const counts = useMemo(() => {
    const c = { Workday: 0, Restday: 0, Leave: 0, Holiday: 0, Absent: 0, unmarked: 0 };
    for (const s of staffList) {
      const status = pending[s.id] ?? logsByStaff.get(s.id)?.status;
      if (!status) c.unmarked++;
      else c[status as AttendanceStatus]++;
    }
    return { ...c, total: staffList.length };
  }, [staffList, logsByStaff, pending]);

  const isLoading = staffQuery.isLoading || logsQuery.isLoading;

  return (
    <>
      <Header fixed>
        <div className="flex items-center gap-2">
          <CheckCircle2 className="size-4 text-muted-foreground" />
          <span className="text-sm font-medium">Daily Roll-Call</span>
        </div>
        <div className="ms-auto flex items-center gap-2">
          <ThemeSwitch />
        </div>
      </Header>

      <AttendanceSubNav activeView="roll-call" />

      <Main className="space-y-6">
        {/* Title + actions */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Time &amp; Attendance
            </p>
            <h1 className="text-2xl font-bold tracking-tight">Daily Roll-Call</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Mark and review today's attendance for all staff, grouped by department.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Select
              value={bulkStatus || "__none__"}
              onValueChange={(v) => {
                const raw = String(v ?? "");
                setBulkStatus(raw === "__none__" || raw === "" ? "" : (raw as AttendanceStatus));
              }}
            >
              <SelectTrigger className="w-44">
                <SelectValue placeholder="— Bulk status —" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">— Bulk status —</SelectItem>
                {STATUS_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              size="sm"
              onClick={markAllUnmarked}
              disabled={!bulkStatus || isLoading}
            >
              Mark Unmarked
            </Button>
          </div>
        </div>

        {/* Date nav + search + stats */}
        <Card>
          <CardContent className="flex flex-wrap items-center gap-3 py-3">
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => changeDate(shiftDate(date, -1))}
                className="inline-flex size-7 items-center justify-center rounded-md border border-input transition-colors hover:bg-muted"
                aria-label="Previous day"
              >
                <ChevronLeft className="size-3.5" />
              </button>
              <div className="flex items-center gap-2 rounded-md border border-input bg-muted/40 px-3 py-1.5">
                <Calendar className="size-3.5 text-muted-foreground" />
                <span className="text-sm font-medium">{formatLongDate(date)}</span>
              </div>
              <button
                type="button"
                onClick={() => changeDate(shiftDate(date, 1))}
                className="inline-flex size-7 items-center justify-center rounded-md border border-input transition-colors hover:bg-muted"
                aria-label="Next day"
              >
                <ChevronRight className="size-3.5" />
              </button>
              <button
                type="button"
                onClick={() => changeDate(todayString())}
                className="inline-flex h-7 items-center rounded-md border border-input px-2.5 text-xs font-medium transition-colors hover:bg-muted"
              >
                Today
              </button>
              <Input
                type="date"
                value={date}
                onChange={(e) => changeDate(e.target.value)}
                className="ml-1 h-8 w-40"
              />
            </div>

            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search staff…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-8 w-56 pl-8"
              />
            </div>

            <div className="ml-auto flex divide-x divide-border overflow-hidden rounded-lg border border-border text-xs">
              {[
                { label: "Workday", value: counts.Workday, cls: "" },
                { label: "Restday", value: counts.Restday, cls: "" },
                { label: "Leave", value: counts.Leave, cls: "" },
                { label: "Holiday", value: counts.Holiday, cls: "" },
                {
                  label: "Absent",
                  value: counts.Absent,
                  cls: counts.Absent ? "text-red-600 dark:text-red-400 font-bold" : "",
                },
                {
                  label: "Unmarked",
                  value: counts.unmarked,
                  cls: counts.unmarked ? "text-amber-600 dark:text-amber-400" : "",
                },
                { label: "Total", value: counts.total, cls: "text-muted-foreground" },
              ].map((s) => (
                <div
                  key={s.label}
                  className="flex flex-col items-center bg-background px-3 py-1.5"
                >
                  <span className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">
                    {s.label}
                  </span>
                  <span className={`text-base font-semibold leading-tight tabular-nums ${s.cls}`}>
                    {s.value}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Department groups */}
        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Card key={i}>
                <CardContent className="space-y-2 py-4">
                  <Skeleton className="h-5 w-40" />
                  {Array.from({ length: 4 }).map((_, j) => (
                    <Skeleton key={j} className="h-9 w-full" />
                  ))}
                </CardContent>
              </Card>
            ))}
          </div>
        ) : groups.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center gap-2 py-12 text-center">
              <Users className="size-8 text-muted-foreground" />
              <p className="text-sm font-medium">
                No staff in this department for the selected date.
              </p>
              <p className="text-xs text-muted-foreground">
                Try clearing the search or picking a different day.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div>
            {groups.map((g) => (
              <DeptGroup
                key={g.name}
                deptName={g.name}
                staff={g.members}
                logsByStaff={logsByStaff}
                pending={pending}
                savingIds={savingIds}
                onMark={markOne}
              />
            ))}
          </div>
        )}
      </Main>
    </>
  );
}
