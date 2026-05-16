// MonthlyGrid — per-staff × per-day attendance grid for a selected month.
//
// Extracted from the old /attendance/monthly route so it can be hosted as a
// view mode inside /attendance/roll-call (Roll-Call page → Daily | Monthly).
// Uses the 10-status attendanceDaily.listRange router.

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format, getDaysInMonth, parseISO } from "date-fns";

import { Skeleton } from "@ndma-dcs-staff-portal/ui/components/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@ndma-dcs-staff-portal/ui/components/select";

import { TONES, ATTENDANCE_STATUS_TONE } from "@/lib/status-colors";
import { orpc } from "@/utils/orpc";

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

const STATUS_GLYPH: Record<AttendanceDailyStatus, string> = {
  on_site: "P",
  wfh: "W",
  late: "L",
  half_day: "½",
  annual_leave: "A",
  sick: "S",
  compassionate: "C",
  maternity_paternity: "M",
  absent: "X",
  holiday: "★",
};

const STATUS_LABEL: Record<AttendanceDailyStatus, string> = {
  on_site: "On Site",
  wfh: "WFH",
  late: "Late",
  half_day: "Half Day",
  annual_leave: "Annual Leave",
  sick: "Sick",
  compassionate: "Compassionate",
  maternity_paternity: "Mat/Pat",
  absent: "Absent",
  holiday: "Holiday",
};

// Colours from the central status-color system (@/lib/status-colors).
function statusBadge(status: AttendanceDailyStatus): string {
  return TONES[ATTENDANCE_STATUS_TONE[status] ?? "neutral"].badge;
}

const PRESENT_STATUSES: ReadonlySet<AttendanceDailyStatus> = new Set([
  "on_site",
  "wfh",
  "late",
  "half_day",
]);

const STATUS_ORDER = Object.keys(STATUS_GLYPH) as AttendanceDailyStatus[];

function Cell({ status }: { status: AttendanceDailyStatus | null }) {
  if (!status) {
    return (
      <td className="border-r last:border-r-0 px-0 py-0 w-8 min-w-[2rem] text-center">
        <span className="text-xs text-muted-foreground/40">·</span>
      </td>
    );
  }
  return (
    <td className="border-r last:border-r-0 px-0 py-0 w-8 min-w-[2rem] text-center">
      <span
        className={`inline-flex size-6 items-center justify-center rounded text-[11px] font-semibold ${statusBadge(status)}`}
        title={STATUS_LABEL[status]}
      >
        {STATUS_GLYPH[status]}
      </span>
    </td>
  );
}

export function MonthlyGrid() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1); // 1-12

  const daysInMonth = getDaysInMonth(new Date(year, month - 1));
  const from = `${year}-${String(month).padStart(2, "0")}-01`;
  const to = `${year}-${String(month).padStart(2, "0")}-${String(daysInMonth).padStart(2, "0")}`;
  const dayNumbers = Array.from({ length: daysInMonth }, (_, i) => i + 1);

  const staffQuery = useQuery(
    orpc.staff.list.queryOptions({ input: { limit: 500, offset: 0 } }),
  );
  const logsQuery = useQuery(
    orpc.attendanceDaily.listRange.queryOptions({ input: { from, to } }),
  );

  const isLoading = staffQuery.isLoading || logsQuery.isLoading;

  // Build grid: staffId -> day -> status
  const grid = useMemo(() => {
    const map = new Map<string, Map<number, AttendanceDailyStatus>>();
    for (const row of logsQuery.data ?? []) {
      const staffId = row.staffProfileId;
      const day = parseInt(row.date.slice(8, 10), 10);
      if (!map.has(staffId)) map.set(staffId, new Map());
      map.get(staffId)!.set(day, row.status as AttendanceDailyStatus);
    }
    return map;
  }, [logsQuery.data]);

  const staffAll = staffQuery.data ?? [];
  const sortedStaff = useMemo(
    () =>
      [...staffAll].sort((a, b) =>
        (a.user?.name ?? a.employeeId ?? "").localeCompare(
          b.user?.name ?? b.employeeId ?? "",
        ),
      ),
    [staffAll],
  );

  const yearOptions = [now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1];
  const monthOptions = [
    { value: 1, label: "January" },
    { value: 2, label: "February" },
    { value: 3, label: "March" },
    { value: 4, label: "April" },
    { value: 5, label: "May" },
    { value: 6, label: "June" },
    { value: 7, label: "July" },
    { value: 8, label: "August" },
    { value: 9, label: "September" },
    { value: 10, label: "October" },
    { value: 11, label: "November" },
    { value: 12, label: "December" },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Per-staff daily attendance grid for the selected month.
        </p>
        <div className="flex items-center gap-2">
          <Select value={String(year)} onValueChange={(v) => v && setYear(Number(v))}>
            <SelectTrigger className="w-24 h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {yearOptions.map((y) => (
                <SelectItem key={y} value={String(y)}>
                  {y}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={String(month)} onValueChange={(v) => v && setMonth(Number(v))}>
            <SelectTrigger className="w-36 h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {monthOptions.map((m) => (
                <SelectItem key={m.value} value={String(m.value)}>
                  {m.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-2 text-xs">
        {STATUS_ORDER.map((s) => (
          <span
            key={s}
            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 ${statusBadge(s)}`}
          >
            <span className="font-bold">{STATUS_GLYPH[s]}</span>
            {STATUS_LABEL[s]}
          </span>
        ))}
      </div>

      {isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-8 w-full" />
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-7 w-full" />
          ))}
        </div>
      ) : (
        <div className="rounded-xl border overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="border-b bg-muted/40">
                <th className="sticky left-0 z-10 bg-muted/60 px-3 py-2 text-left font-medium min-w-[10rem] border-r">
                  Staff
                </th>
                {dayNumbers.map((d) => {
                  const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
                  const dow = format(parseISO(dateStr), "EEE");
                  const isWeekend = dow === "Sat" || dow === "Sun";
                  return (
                    <th
                      key={d}
                      className={`w-8 min-w-[2rem] px-0 py-1 text-center font-normal border-r ${
                        isWeekend ? "text-muted-foreground/50" : "text-muted-foreground"
                      }`}
                    >
                      <div>{d}</div>
                      <div className="text-[10px]">{dow}</div>
                    </th>
                  );
                })}
                <th className="sticky right-0 z-10 bg-muted/60 w-8 min-w-[2rem] px-1 py-2 text-center font-medium border-l">
                  P
                </th>
                <th className="sticky right-0 z-10 bg-muted/60 w-8 min-w-[2rem] px-1 py-2 text-center font-medium">
                  A
                </th>
              </tr>
            </thead>
            <tbody>
              {sortedStaff.map((s) => {
                const staffMap = grid.get(s.id) ?? new Map();
                let presentCount = 0;
                let absentCount = 0;
                for (const [, st] of staffMap) {
                  if (PRESENT_STATUSES.has(st)) presentCount++;
                  if (st === "absent") absentCount++;
                }
                return (
                  <tr
                    key={s.id}
                    className="border-b last:border-0 hover:bg-muted/20 transition-colors"
                  >
                    <td className="sticky left-0 z-10 bg-background px-3 py-1.5 font-medium border-r truncate max-w-[10rem]">
                      {s.user?.name ?? s.employeeId ?? "Unnamed"}
                    </td>
                    {dayNumbers.map((d) => (
                      <Cell key={d} status={staffMap.get(d) ?? null} />
                    ))}
                    <td className="sticky right-0 z-10 bg-background border-l px-1 py-1.5 text-center font-semibold text-blue-700 dark:text-blue-300">
                      {presentCount > 0 ? presentCount : ""}
                    </td>
                    <td className="sticky right-0 z-10 bg-background px-1 py-1.5 text-center font-semibold text-red-700 dark:text-red-300">
                      {absentCount > 0 ? absentCount : ""}
                    </td>
                  </tr>
                );
              })}
              {sortedStaff.length === 0 && (
                <tr>
                  <td
                    colSpan={daysInMonth + 3}
                    className="py-10 text-center text-muted-foreground"
                  >
                    No staff found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
