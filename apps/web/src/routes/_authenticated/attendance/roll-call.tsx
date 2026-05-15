// /attendance/roll-call — Daily Roll Call
//
// Mark attendance for all staff for a selected date using the 10-status
// attendanceDaily router. Grouped by department.

import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import { CheckSquare, RefreshCw, Users } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@ndma-dcs-staff-portal/ui/components/badge";
import { Button } from "@ndma-dcs-staff-portal/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@ndma-dcs-staff-portal/ui/components/card";
import { Input } from "@ndma-dcs-staff-portal/ui/components/input";
import { Skeleton } from "@ndma-dcs-staff-portal/ui/components/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@ndma-dcs-staff-portal/ui/components/select";

import { AttendanceSubNav } from "@/components/layout/attendance-sub-nav";
import { Header } from "@/components/layout/header";
import { Main } from "@/components/layout/main";
import { ThemeSwitch } from "@/components/theme-switch";
import { orpc } from "@/utils/orpc";

export const Route = createFileRoute("/_authenticated/attendance/roll-call")({
  component: RollCallPage,
});

// ─── Types ────────────────────────────────────────────────────────────────────

type AttendanceDailyStatus =
  | "on_site"
  | "wfh"
  | "late"
  | "half_day"
  | "annual_leave"
  | "sick"
  | "compassionate"
  | "maternity_paternity"
  | "absent"
  | "holiday";

interface StatusOption {
  value: AttendanceDailyStatus;
  label: string;
  glyph: string;
  pillClass: string;
  activeClass: string;
}

const STATUS_OPTIONS: StatusOption[] = [
  {
    value: "on_site",
    label: "On Site",
    glyph: "P",
    pillClass: "bg-blue-50 text-blue-800 dark:bg-blue-950/40 dark:text-blue-200",
    activeClass: "ring-2 ring-blue-500 bg-blue-50 text-blue-800 dark:bg-blue-950/40 dark:text-blue-200",
  },
  {
    value: "wfh",
    label: "WFH",
    glyph: "W",
    pillClass: "bg-blue-100/60 text-blue-600 dark:bg-blue-900/30 dark:text-blue-300",
    activeClass: "ring-2 ring-blue-400 bg-blue-100/60 text-blue-600 dark:bg-blue-900/30 dark:text-blue-300",
  },
  {
    value: "late",
    label: "Late",
    glyph: "L",
    pillClass: "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-200",
    activeClass: "ring-2 ring-amber-500 bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-200",
  },
  {
    value: "half_day",
    label: "Half Day",
    glyph: "½",
    pillClass: "bg-indigo-50 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-200",
    activeClass: "ring-2 ring-indigo-500 bg-indigo-50 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-200",
  },
  {
    value: "annual_leave",
    label: "Annual Leave",
    glyph: "A",
    pillClass: "bg-violet-50 text-violet-800 dark:bg-violet-950/40 dark:text-violet-200",
    activeClass: "ring-2 ring-violet-500 bg-violet-50 text-violet-800 dark:bg-violet-950/40 dark:text-violet-200",
  },
  {
    value: "sick",
    label: "Sick",
    glyph: "S",
    pillClass: "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-200",
    activeClass: "ring-2 ring-red-500 bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-200",
  },
  {
    value: "compassionate",
    label: "Compassionate",
    glyph: "C",
    pillClass: "bg-purple-100 text-purple-800 dark:bg-purple-950/40 dark:text-purple-200",
    activeClass: "ring-2 ring-purple-500 bg-purple-100 text-purple-800 dark:bg-purple-950/40 dark:text-purple-200",
  },
  {
    value: "maternity_paternity",
    label: "Mat/Pat",
    glyph: "M",
    pillClass: "bg-pink-100 text-pink-800 dark:bg-pink-950/40 dark:text-pink-200",
    activeClass: "ring-2 ring-pink-500 bg-pink-100 text-pink-800 dark:bg-pink-950/40 dark:text-pink-200",
  },
  {
    value: "absent",
    label: "Absent",
    glyph: "X",
    pillClass: "bg-red-100 text-red-900 font-bold dark:bg-red-950/50 dark:text-red-200",
    activeClass: "ring-2 ring-red-700 bg-red-100 text-red-900 font-bold dark:bg-red-950/50 dark:text-red-200",
  },
  {
    value: "holiday",
    label: "Holiday",
    glyph: "★",
    pillClass: "bg-violet-100 text-violet-900 dark:bg-violet-950/40 dark:text-violet-200",
    activeClass: "ring-2 ring-violet-600 bg-violet-100 text-violet-900 dark:bg-violet-950/40 dark:text-violet-200",
  },
];

const STATUS_MAP = new Map<AttendanceDailyStatus, StatusOption>(
  STATUS_OPTIONS.map((o) => [o.value, o]),
);

const PRESENT_STATUSES: ReadonlySet<AttendanceDailyStatus> = new Set([
  "on_site", "wfh", "late", "half_day",
]);

// ─── Status Pill ──────────────────────────────────────────────────────────────

function StatusPill({ status }: { status: AttendanceDailyStatus }) {
  const opt = STATUS_MAP.get(status);
  if (!opt) return null;
  return (
    <span
      className={`inline-flex h-6 min-w-[24px] items-center justify-center rounded-full px-1.5 text-xs font-semibold ${opt.pillClass}`}
    >
      {opt.glyph}
    </span>
  );
}

// ─── Staff Row ────────────────────────────────────────────────────────────────

interface StaffRowProps {
  staffId: string;
  name: string;
  currentStatus: AttendanceDailyStatus | null;
  pending: boolean;
  onMark: (staffId: string, status: AttendanceDailyStatus) => void;
}

function StaffRow({ staffId, name, currentStatus, pending, onMark }: StaffRowProps) {
  return (
    <div className="flex items-center gap-2 py-2 border-b last:border-0">
      {/* Name */}
      <div className="w-40 shrink-0 truncate text-sm font-medium">{name}</div>

      {/* Current status pill */}
      <div className="w-8 shrink-0">
        {currentStatus ? <StatusPill status={currentStatus} /> : <span className="text-xs text-muted-foreground">—</span>}
      </div>

      {/* Quick-mark buttons */}
      <div className="flex flex-wrap gap-1 min-w-0">
        {STATUS_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            disabled={pending}
            title={opt.label}
            onClick={() => onMark(staffId, opt.value)}
            className={`inline-flex h-6 min-w-[24px] items-center justify-center rounded-full px-1.5 text-xs font-semibold transition-all ${
              currentStatus === opt.value ? opt.activeClass : "bg-muted/50 text-muted-foreground hover:bg-muted"
            } disabled:opacity-50`}
          >
            {opt.glyph}
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Department Group ─────────────────────────────────────────────────────────

interface StaffEntry {
  id: string;
  name: string;
}

interface DeptGroupProps {
  deptName: string;
  staff: StaffEntry[];
  logsByStaff: Map<string, AttendanceDailyStatus>;
  pendingSet: Set<string>;
  onMark: (staffId: string, status: AttendanceDailyStatus) => void;
}

function DeptGroup({ deptName, staff, logsByStaff, pendingSet, onMark }: DeptGroupProps) {
  const presentCount = staff.filter((s) => {
    const st = logsByStaff.get(s.id);
    return st ? PRESENT_STATUSES.has(st) : false;
  }).length;

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold">{deptName}</CardTitle>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>{presentCount} present</span>
            <span>/</span>
            <span>{staff.length} total</span>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        {staff.map((s) => (
          <StaffRow
            key={s.id}
            staffId={s.id}
            name={s.name}
            currentStatus={logsByStaff.get(s.id) ?? null}
            pending={pendingSet.has(s.id)}
            onMark={onMark}
          />
        ))}
      </CardContent>
    </Card>
  );
}

// ─── Stats Strip ──────────────────────────────────────────────────────────────

interface StatsStripProps {
  logsByStaff: Map<string, AttendanceDailyStatus>;
  totalStaff: number;
}

function StatsStrip({ logsByStaff, totalStaff }: StatsStripProps) {
  const counts: Record<AttendanceDailyStatus, number> = {
    on_site: 0, wfh: 0, late: 0, half_day: 0,
    annual_leave: 0, sick: 0, compassionate: 0, maternity_paternity: 0,
    absent: 0, holiday: 0,
  };
  for (const s of logsByStaff.values()) {
    counts[s]++;
  }
  const marked = logsByStaff.size;
  const unmarked = Math.max(0, totalStaff - marked);

  const stats = [
    { label: "On Site", count: counts.on_site, cls: "text-blue-700 dark:text-blue-300" },
    { label: "WFH", count: counts.wfh, cls: "text-blue-500 dark:text-blue-400" },
    { label: "Late", count: counts.late, cls: "text-amber-700 dark:text-amber-300" },
    { label: "Half Day", count: counts.half_day, cls: "text-indigo-700 dark:text-indigo-300" },
    { label: "AL", count: counts.annual_leave, cls: "text-violet-700 dark:text-violet-300" },
    { label: "Sick", count: counts.sick, cls: "text-red-600 dark:text-red-300" },
    { label: "Absent", count: counts.absent, cls: "text-red-800 dark:text-red-200 font-bold" },
    { label: "Unmarked", count: unmarked, cls: "text-muted-foreground" },
    { label: "Total", count: totalStaff, cls: "font-semibold" },
  ];

  return (
    <div className="rounded-lg border bg-card px-4 py-3 flex flex-wrap gap-4 text-sm">
      {stats.map((s) => (
        <div key={s.label} className="flex flex-col items-center">
          <span className={`text-xl font-bold leading-none ${s.cls}`}>{s.count}</span>
          <span className="text-xs text-muted-foreground mt-0.5">{s.label}</span>
        </div>
      ))}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

function RollCallPage() {
  const today = new Date().toISOString().slice(0, 10);
  const [date, setDate] = useState(today);
  const [bulkStatus, setBulkStatus] = useState<AttendanceDailyStatus>("on_site");
  const [pendingSet, setPendingSet] = useState<Set<string>>(new Set());

  const qc = useQueryClient();

  // Fetch all active staff
  const staffQuery = useQuery(
    orpc.staff.list.queryOptions({ input: { limit: 500, offset: 0 } }),
  );

  // Fetch attendance rows for selected date
  const logsQuery = useQuery(
    orpc.attendanceDaily.list.queryOptions({ input: { date } }),
  );

  const upsertMut = useMutation(
    orpc.attendanceDaily.upsert.mutationOptions({
      onSuccess: async () => {
        await qc.invalidateQueries({ queryKey: orpc.attendanceDaily.list.key() });
      },
      onError: (e: Error) => toast.error(e.message),
    }),
  );

  const setDayRespectLeaveMut = useMutation(
    orpc.attendanceDaily.setDayRespectLeave.mutationOptions({
      onSuccess: async (data) => {
        await qc.invalidateQueries({ queryKey: orpc.attendanceDaily.list.key() });
        toast.success(
          `Set day respect leave: ${data.matched} matched, ${data.upserted} marked`,
        );
      },
      onError: (e: Error) => toast.error(e.message),
    }),
  );

  // Build map: staffProfileId -> status
  const logsByStaff = useMemo(() => {
    const map = new Map<string, AttendanceDailyStatus>();
    for (const row of logsQuery.data ?? []) {
      map.set(row.staffProfileId, row.status as AttendanceDailyStatus);
    }
    return map;
  }, [logsQuery.data]);

  // Group staff by department
  const staffAll = staffQuery.data ?? [];

  const deptGroups = useMemo(() => {
    const groups = new Map<string, { deptId: string; deptName: string; staff: StaffEntry[] }>();
    for (const s of staffAll) {
      const deptId = s.departmentId ?? "unknown";
      const deptName = s.department?.name ?? "No Department";
      if (!groups.has(deptId)) {
        groups.set(deptId, { deptId, deptName, staff: [] });
      }
      groups.get(deptId)!.staff.push({
        id: s.id,
        name: s.user?.name ?? s.employeeId ?? "Unnamed",
      });
    }
    return [...groups.values()].sort((a, b) => a.deptName.localeCompare(b.deptName));
  }, [staffAll]);

  async function markOne(staffId: string, status: AttendanceDailyStatus) {
    setPendingSet((prev) => new Set([...prev, staffId]));
    try {
      await upsertMut.mutateAsync({ staffProfileId: staffId, date, status });
    } finally {
      setPendingSet((prev) => {
        const next = new Set(prev);
        next.delete(staffId);
        return next;
      });
    }
  }

  async function markUnmarked() {
    const unmarkedIds = staffAll
      .filter((s) => !logsByStaff.has(s.id))
      .map((s) => s.id);
    if (unmarkedIds.length === 0) {
      toast.info("All staff are already marked.");
      return;
    }
    for (const staffId of unmarkedIds) {
      await markOne(staffId, bulkStatus);
    }
    toast.success(`Marked ${unmarkedIds.length} staff as ${bulkStatus}`);
  }

  const isLoading = staffQuery.isLoading || logsQuery.isLoading;

  return (
    <>
      <Header fixed>
        <div className="flex items-center gap-2">
          <CheckSquare className="size-4 text-muted-foreground" />
          <span className="text-sm font-medium">Daily Roll Call</span>
        </div>
        <div className="ms-auto flex items-center gap-2">
          <ThemeSwitch />
        </div>
      </Header>

      <AttendanceSubNav activeView="roll-call" />

      <Main className="space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Daily Roll Call</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Mark daily attendance for all staff.
            </p>
          </div>

          {/* Date picker */}
          <div className="flex items-center gap-2">
            <Input
              type="date"
              className="w-40"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>
        </div>

        {/* Stats strip */}
        {!isLoading && (
          <StatsStrip logsByStaff={logsByStaff} totalStaff={staffAll.length} />
        )}

        {/* Bulk actions */}
        <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-card px-4 py-3">
          <Users className="size-4 text-muted-foreground shrink-0" />
          <span className="text-sm font-medium shrink-0">Bulk:</span>
          <Select
            value={bulkStatus}
            onValueChange={(v) => v && setBulkStatus(v as AttendanceDailyStatus)}
          >
            <SelectTrigger className="w-40 h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATUS_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.glyph} {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            size="sm"
            variant="outline"
            className="h-8 text-xs"
            onClick={markUnmarked}
            disabled={upsertMut.isPending || isLoading}
          >
            Mark Unmarked
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-8 text-xs gap-1.5"
            onClick={() => setDayRespectLeaveMut.mutate({ date })}
            disabled={setDayRespectLeaveMut.isPending || isLoading}
          >
            <RefreshCw className="size-3.5" />
            Set Day (Respect Leave)
          </Button>
        </div>

        {/* Status legend */}
        <div className="flex flex-wrap gap-2 text-xs">
          {STATUS_OPTIONS.map((opt) => (
            <span key={opt.value} className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 ${opt.pillClass}`}>
              <span className="font-bold">{opt.glyph}</span>
              {opt.label}
            </span>
          ))}
        </div>

        {/* Loading */}
        {isLoading ? (
          <div className="space-y-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-40 w-full rounded-xl" />
            ))}
          </div>
        ) : (
          <div className="space-y-4">
            {deptGroups.map((grp) => (
              <DeptGroup
                key={grp.deptId}
                deptName={grp.deptName}
                staff={grp.staff}
                logsByStaff={logsByStaff}
                pendingSet={pendingSet}
                onMark={markOne}
              />
            ))}
            {deptGroups.length === 0 && (
              <div className="py-12 text-center text-muted-foreground">
                No staff found.
              </div>
            )}
          </div>
        )}
      </Main>
    </>
  );
}
