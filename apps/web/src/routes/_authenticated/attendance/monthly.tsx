// /attendance/monthly — Monthly Attendance Grid
//
// Org-wide attendance heatmap: one row per staff, one column per day of the
// selected month. All data sourced from `orpc.attendanceTime.logs.list` filtered
// by from/to of the selected month. Sticky left column + sticky header.
//
// Status glyphs (single character per cell):
//   Workday  → "P" (blue)
//   Restday  → blank / grey
//   Absent   → "X" (red, bold)
//   Leave    → "A" (violet)
//   Holiday  → "★" (violet bg)

import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { CalendarDays } from "lucide-react";

import { Card, CardContent } from "@ndma-dcs-staff-portal/ui/components/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@ndma-dcs-staff-portal/ui/components/select";
import { Skeleton } from "@ndma-dcs-staff-portal/ui/components/skeleton";

import { Header } from "@/components/layout/header";
import { Main } from "@/components/layout/main";
import { ThemeSwitch } from "@/components/theme-switch";
import { orpc } from "@/utils/orpc";

export const Route = createFileRoute("/_authenticated/attendance/monthly")({
  component: MonthlyGridPage,
});

// ─── Types ────────────────────────────────────────────────────────────────────

type AttendanceStatus = "Workday" | "Restday" | "Absent" | "Leave" | "Holiday";

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const DOW_SHORT = ["S", "M", "T", "W", "T", "F", "S"];

// Per DESIGN_HANDOFF.md §10 — Attendance cell color tokens.
// (Map the 5 logged statuses → handoff cell classes. No green Tailwind classes.)
const ATT_STATUS_CLASSES: Record<AttendanceStatus, string> = {
  Workday:
    "bg-blue-50 text-blue-800 dark:bg-blue-950/40 dark:text-blue-200",
  Restday:
    "bg-slate-100/60 text-slate-500 dark:bg-slate-800/30 dark:text-slate-400",
  Absent:
    "bg-red-100 text-red-900 font-bold dark:bg-red-950/50 dark:text-red-200",
  Leave:
    "bg-violet-50 text-violet-800 dark:bg-violet-950/40 dark:text-violet-200",
  Holiday:
    "bg-violet-100 text-violet-900 dark:bg-violet-950/40 dark:text-violet-200",
};

const STATUS_GLYPH: Record<AttendanceStatus, string> = {
  Workday: "P",
  Restday: "",
  Absent: "X",
  Leave: "A",
  Holiday: "★",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function daysInMonth(year: number, month1: number): number {
  // month1 is 1-12
  return new Date(year, month1, 0).getDate();
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

function isoDate(year: number, month1: number, day: number): string {
  return `${year}-${pad2(month1)}-${pad2(day)}`;
}

function dowFor(year: number, month1: number, day: number): number {
  return new Date(year, month1 - 1, day).getDay();
}

// ─── Page ─────────────────────────────────────────────────────────────────────

function MonthlyGridPage() {
  const now = new Date();
  const [year, setYear] = useState<number>(now.getFullYear());
  const [month, setMonth] = useState<number>(now.getMonth() + 1); // 1-12

  const numDays = daysInMonth(year, month);
  const from = isoDate(year, month, 1);
  const to = isoDate(year, month, numDays);

  const staffQuery = useQuery(
    orpc.staff.list.queryOptions({ input: { limit: 200, offset: 0 } }),
  );

  const logsQuery = useQuery(
    orpc.attendanceTime.logs.list.queryOptions({
      input: { from, to, limit: 500 },
    }),
  );

  const isLoading = staffQuery.isLoading || logsQuery.isLoading;

  // Build O(1) lookup: { [staffId]: { [yyyy-mm-dd]: status } }
  const grid = useMemo(() => {
    const map: Record<string, Record<string, AttendanceStatus>> = {};
    for (const log of logsQuery.data ?? []) {
      const staffId = log.staffId;
      const date = log.date;
      if (!staffId || !date) continue;
      if (!map[staffId]) map[staffId] = {};
      map[staffId][date] = log.status as AttendanceStatus;
    }
    return map;
  }, [logsQuery.data]);

  const staffList = staffQuery.data ?? [];

  const yearOptions = [now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1];

  return (
    <>
      <Header fixed>
        <div className="flex items-center gap-2">
          <CalendarDays className="size-4 text-muted-foreground" />
          <span className="text-sm font-medium">Monthly Attendance Grid</span>
        </div>
        <div className="ms-auto flex items-center gap-2">
          <ThemeSwitch />
        </div>
      </Header>

      <Main className="space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">
              Monthly Attendance Grid
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Org-wide attendance heatmap — all staff as rows, each day as a column.
            </p>
          </div>

          <div className="flex items-end gap-2">
            <div className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">Month</span>
              <Select
                value={String(month)}
                onValueChange={(v) => v != null && setMonth(Number(v))}
              >
                <SelectTrigger className="w-36">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MONTH_NAMES.map((name, idx) => (
                    <SelectItem key={name} value={String(idx + 1)}>
                      {name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">Year</span>
              <Select
                value={String(year)}
                onValueChange={(v) => v != null && setYear(Number(v))}
              >
                <SelectTrigger className="w-24">
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
            </div>
          </div>
        </div>

        {/* Legend */}
        <div className="flex flex-wrap items-center gap-2 rounded-md border bg-card px-3 py-2 text-xs">
          <span className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground mr-1">
            Legend
          </span>
          {(Object.keys(ATT_STATUS_CLASSES) as AttendanceStatus[]).map((s) => (
            <span
              key={s}
              className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-bold ${ATT_STATUS_CLASSES[s]}`}
            >
              <span className="inline-block w-3 text-center">
                {STATUS_GLYPH[s] || "·"}
              </span>
              {s}
            </span>
          ))}
          <span className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium bg-muted text-muted-foreground">
            · No log
          </span>
        </div>

        <Card>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="space-y-2 p-4">
                {Array.from({ length: 8 }).map((_, i) => (
                  <Skeleton key={i} className="h-8 w-full" />
                ))}
              </div>
            ) : staffList.length === 0 ? (
              <div className="py-10 text-center text-sm text-muted-foreground">
                No staff records found.
              </div>
            ) : (
              <div className="overflow-auto">
                <table className="border-collapse text-[11px] min-w-max">
                  <thead className="sticky top-0 z-10">
                    <tr className="bg-muted/80 backdrop-blur border-b-2">
                      <th className="sticky left-0 z-20 bg-muted/80 px-3 py-2.5 text-left text-[11px] font-semibold text-foreground min-w-[200px] border-r-2">
                        Staff
                      </th>
                      {Array.from({ length: numDays }, (_, i) => {
                        const d = i + 1;
                        const dow = dowFor(year, month, d);
                        const isWeekend = dow === 0 || dow === 6;
                        return (
                          <th
                            key={d}
                            className={`w-8 min-w-[30px] py-1.5 text-center font-semibold border-r ${
                              isWeekend
                                ? "bg-muted/60 text-muted-foreground"
                                : "text-muted-foreground"
                            }`}
                          >
                            <div className="text-[8px] uppercase">
                              {DOW_SHORT[dow]}
                            </div>
                            <div>{d}</div>
                          </th>
                        );
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {staffList.map((s: {
                      id: string;
                      user?: { name?: string } | null;
                      department?: { name?: string } | null;
                    }) => {
                      const row = grid[s.id] ?? {};
                      const name = s.user?.name ?? s.id;
                      const dept = s.department?.name ?? "";
                      return (
                        <tr
                          key={s.id}
                          className="border-b hover:bg-muted/40"
                        >
                          <td className="sticky left-0 z-10 bg-card px-3 py-1.5 border-r-2 min-w-[200px]">
                            <div className="flex flex-col leading-tight">
                              <span className="font-medium text-[12px] whitespace-nowrap">
                                {name}
                              </span>
                              {dept && (
                                <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                                  {dept}
                                </span>
                              )}
                            </div>
                          </td>
                          {Array.from({ length: numDays }, (_, i) => {
                            const d = i + 1;
                            const dow = dowFor(year, month, d);
                            const isWeekend = dow === 0 || dow === 6;
                            const date = isoDate(year, month, d);
                            const st = row[date];
                            const cellCls = st
                              ? ATT_STATUS_CLASSES[st]
                              : isWeekend
                                ? "bg-muted/40 text-muted-foreground"
                                : "bg-transparent text-muted-foreground/40";
                            const glyph = st
                              ? STATUS_GLYPH[st]
                              : isWeekend
                                ? ""
                                : "·";
                            return (
                              <td
                                key={d}
                                className="p-0.5 border-r"
                              >
                                <div
                                  className={`w-full h-6 rounded flex items-center justify-center text-[10px] font-bold ${cellCls}`}
                                  title={st ? `${date} — ${st}` : date}
                                >
                                  {glyph}
                                </div>
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </Main>
    </>
  );
}
