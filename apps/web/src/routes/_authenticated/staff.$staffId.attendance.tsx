// /staff/$staffId/attendance — Per-staff Attendance Card
//
// Drop-in from design handoff prototype `StaffAttendanceCardScreen`.
// Renders:
//   - Header: staff name + dept, year/month selectors, back button
//   - Hero: KPI strip (workdays, present, absent, leave, lateness, holidays) + YTD rate
//   - Year-at-a-glance: 12 month mini-calendars (heatmap)
//   - Monthly breakdown table
//   - Selected-month detail (one cell per day with status glyph)
//   - Side panel: leave history for the selected year
//
// All data comes from oRPC procedures — no mock data, no seeded state.

import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { ArrowLeft, CalendarDays, Clock3, Printer, Users } from "lucide-react";

import { Button } from "@ndma-dcs-staff-portal/ui/components/button";
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
import { orpc } from "@/utils/orpc";

export const Route = createFileRoute("/_authenticated/staff/$staffId/attendance")({
  component: StaffAttendanceCardPage,
});

// ─── Constants ────────────────────────────────────────────────────────────────

type AttStatus = "Workday" | "Restday" | "Absent" | "Leave" | "Holiday";

const MLONG = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
] as const;
const MSHORT = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
] as const;
const DOW = ["S", "M", "T", "W", "T", "F", "S"];

// Map status → small swatch background classes for the heatmap cells. Use the
// project palette (no green — blue / amber / red / violet).
const STATUS_SWATCH: Record<AttStatus, string> = {
  Workday: "bg-blue-200 dark:bg-blue-800",
  Restday: "bg-muted",
  Leave: "bg-violet-200 dark:bg-violet-800",
  Absent: "bg-red-300 dark:bg-red-800",
  Holiday: "bg-violet-300 dark:bg-violet-700",
};

// Map status → text-tinted label classes for the detail grid (no green).
const STATUS_TEXT: Record<AttStatus, string> = {
  Workday: "text-blue-700 dark:text-blue-200",
  Restday: "text-muted-foreground",
  Leave: "text-violet-700 dark:text-violet-200",
  Absent: "text-red-700 dark:text-red-200",
  Holiday: "text-violet-700 dark:text-violet-200",
};

// Short status glyphs for in-cell display.
const STATUS_GLYPH: Record<AttStatus, string> = {
  Workday: "P",
  Restday: "·",
  Leave: "L",
  Absent: "X",
  Holiday: "★",
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

type AttendanceLogRow = {
  id: number;
  date: string;
  status: AttStatus;
  clockIn: string | null;
  clockOut: string | null;
  workHours: string | null;
};

type LeaveRequestRow = {
  id: string;
  startDate: string;
  endDate: string;
  totalDays: number;
  status: "pending" | "approved" | "rejected" | "cancelled";
  reason: string | null;
  leaveType?: { name?: string | null; code?: string | null } | null;
};

type MonthSummary = {
  monthIdx: number;
  daysInMonth: number;
  firstDayOfWeek: number;
  byDay: Record<number, AttStatus | null>;
  present: number;
  absent: number;
  leave: number;
  holiday: number;
  workdays: number;
  rate: number;
};

function buildMonthSummary(
  year: number,
  monthIdx: number,
  logsByDate: Map<string, AttendanceLogRow>,
): MonthSummary {
  const daysInMonth = new Date(year, monthIdx + 1, 0).getDate();
  const firstDayOfWeek = new Date(year, monthIdx, 1).getDay();
  const byDay: Record<number, AttStatus | null> = {};

  let present = 0;
  let absent = 0;
  let leave = 0;
  let holiday = 0;
  let workdays = 0;

  for (let d = 1; d <= daysInMonth; d++) {
    const iso = `${year}-${String(monthIdx + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    const log = logsByDate.get(iso);
    if (log) {
      byDay[d] = log.status;
      switch (log.status) {
        case "Workday":
          present++;
          workdays++;
          break;
        case "Absent":
          absent++;
          workdays++;
          break;
        case "Leave":
          leave++;
          break;
        case "Holiday":
          holiday++;
          break;
        case "Restday":
          // not counted
          break;
      }
    } else {
      byDay[d] = null;
    }
  }

  const rate = workdays > 0 ? Math.round((present / workdays) * 100) : 0;

  return {
    monthIdx,
    daysInMonth,
    firstDayOfWeek,
    byDay,
    present,
    absent,
    leave,
    holiday,
    workdays,
    rate,
  };
}

function rateColor(rate: number): string {
  if (rate >= 95) return "text-blue-700 dark:text-blue-300";
  if (rate >= 85) return "text-amber-700 dark:text-amber-300";
  return "text-red-700 dark:text-red-300";
}

function rateBar(rate: number): string {
  if (rate >= 95) return "bg-blue-600";
  if (rate >= 85) return "bg-amber-500";
  return "bg-red-500";
}

function leaveStatusBadge(status: LeaveRequestRow["status"]): string {
  switch (status) {
    case "approved":
      return "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300";
    case "pending":
      return "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300";
    case "rejected":
      return "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300";
    case "cancelled":
    default:
      return "bg-muted text-muted-foreground";
  }
}

// ─── Page ────────────────────────────────────────────────────────────────────

function StaffAttendanceCardPage() {
  const { staffId } = Route.useParams();
  const navigate = useNavigate();

  const [year, setYear] = useState<number>(new Date().getFullYear());
  const [activeMonth, setActiveMonth] = useState<number | null>(
    new Date().getMonth(),
  );

  const fromISO = `${year}-01-01`;
  const toISO = `${year}-12-31`;

  // Staff profile (header + dept).
  const profileQuery = useQuery(
    orpc.staff.get.queryOptions({ input: { id: staffId } }),
  );

  // Attendance logs for the whole year (limit 500 — enough for one staff member).
  const logsQuery = useQuery(
    orpc.attendanceTime.logs.list.queryOptions({
      input: {
        staffProfileId: staffId,
        from: fromISO,
        to: toISO,
        limit: 500,
      },
    }),
  );

  // Leave history for the side panel.
  const leaveQuery = useQuery(
    orpc.leave.requests.list.queryOptions({
      input: {
        staffProfileId: staffId,
        from: fromISO,
        to: toISO,
        limit: 200,
      },
    }),
  );

  // Index logs by ISO date for O(1) lookup.
  const logsByDate = useMemo(() => {
    const m = new Map<string, AttendanceLogRow>();
    for (const row of (logsQuery.data ?? []) as AttendanceLogRow[]) {
      m.set(row.date, row);
    }
    return m;
  }, [logsQuery.data]);

  // 12-month summaries.
  const yearData = useMemo<MonthSummary[]>(
    () => MLONG.map((_, mi) => buildMonthSummary(year, mi, logsByDate)),
    [year, logsByDate],
  );

  // Totals (YTD).
  const totals = useMemo(
    () =>
      yearData.reduce(
        (acc, m) => ({
          present: acc.present + m.present,
          absent: acc.absent + m.absent,
          leave: acc.leave + m.leave,
          holiday: acc.holiday + m.holiday,
          workdays: acc.workdays + m.workdays,
        }),
        { present: 0, absent: 0, leave: 0, holiday: 0, workdays: 0 },
      ),
    [yearData],
  );

  // Lateness count from the matching `Workday` rows that have a late-style
  // clock-in. We don't have a dedicated "late" status in the enum, so for now
  // derive a rough proxy from clockIn >= 09:00. Real lateness lives in the
  // `lateness_records` quarterly grid — but we surface it here as a hint.
  const latenessCount = useMemo(() => {
    let n = 0;
    for (const row of (logsQuery.data ?? []) as AttendanceLogRow[]) {
      if (row.status !== "Workday" || !row.clockIn) continue;
      const [h, m] = row.clockIn.split(":").map(Number);
      const mins = (h ?? 0) * 60 + (m ?? 0);
      if (mins >= 9 * 60) n++;
    }
    return n;
  }, [logsQuery.data]);

  const ytdRate =
    totals.workdays > 0
      ? Math.round((totals.present / totals.workdays) * 100)
      : 0;

  const isLoading = profileQuery.isLoading || logsQuery.isLoading;

  // Loading state
  if (isLoading) {
    return (
      <>
        <Header fixed>
          <div className="flex items-center gap-2">
            <Users className="size-4 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">
              Staff · Attendance Card
            </span>
          </div>
        </Header>
        <Main>
          <Skeleton className="mb-3 h-8 w-72" />
          <Skeleton className="mb-6 h-28 w-full rounded-xl" />
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {Array.from({ length: 12 }).map((_, i) => (
              <Skeleton key={i} className="h-44 w-full rounded-xl" />
            ))}
          </div>
        </Main>
      </>
    );
  }

  if (profileQuery.error || !profileQuery.data) {
    return (
      <Main>
        <p className="text-muted-foreground">Staff profile not found.</p>
        <Button
          variant="outline"
          className="mt-4"
          onClick={() => navigate({ to: "/staff" })}
        >
          Back to Directory
        </Button>
      </Main>
    );
  }

  const profile = profileQuery.data;
  const staffName = profile.user?.name ?? "Unknown";
  const departmentName = profile.department?.name ?? "—";
  const jobTitle = profile.jobTitle ?? "";

  const yearOptions = Array.from({ length: 5 }, (_, i) => year - 2 + i);

  return (
    <>
      <Header fixed>
        <div className="flex items-center gap-2">
          <Users className="size-4 text-muted-foreground" />
          <span
            role="link"
            tabIndex={0}
            className="cursor-pointer text-sm text-muted-foreground hover:text-foreground"
            onClick={() => navigate({ to: "/staff" })}
            onKeyDown={(e) => {
              if (e.key === "Enter") navigate({ to: "/staff" });
            }}
          >
            Staff
          </span>
          <span className="text-muted-foreground">/</span>
          <span
            role="link"
            tabIndex={0}
            className="cursor-pointer text-sm text-muted-foreground hover:text-foreground"
            onClick={() =>
              navigate({ to: "/staff/$staffId", params: { staffId } })
            }
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                navigate({ to: "/staff/$staffId", params: { staffId } });
              }
            }}
          >
            {staffName}
          </span>
          <span className="text-muted-foreground">/</span>
          <span className="text-sm font-medium">Attendance Card</span>
        </div>

        <div className="ms-auto flex items-center gap-2 print:hidden">
          <Button
            variant="outline"
            size="sm"
            onClick={() => window.print()}
          >
            <Printer className="mr-1.5 size-3.5" />
            Print
          </Button>
        </div>
      </Header>

      <Main>
        {/* Title + back */}
        <div className="mb-5 flex flex-wrap items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={() =>
              navigate({ to: "/staff/$staffId", params: { staffId } })
            }
            aria-label="Back to staff profile"
          >
            <ArrowLeft className="size-4" />
          </Button>
          <div className="flex flex-1 items-center gap-4">
            <div className="flex size-12 items-center justify-center rounded-full bg-muted text-lg font-bold">
              {staffName[0] ?? "?"}
            </div>
            <div className="min-w-0">
              <h1 className="truncate text-xl font-bold">
                {staffName} — Attendance Card
              </h1>
              <p className="truncate text-sm text-muted-foreground">
                {jobTitle ? `${jobTitle} · ` : ""}
                {departmentName}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Select
              value={String(year)}
              onValueChange={(v) => setYear(Number(v))}
            >
              <SelectTrigger className="w-28">
                <SelectValue placeholder="Year" />
              </SelectTrigger>
              <SelectContent>
                {yearOptions.map((y) => (
                  <SelectItem key={y} value={String(y)}>
                    {y}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={activeMonth === null ? "all" : String(activeMonth)}
              onValueChange={(v) =>
                setActiveMonth(v === "all" ? null : Number(v))
              }
            >
              <SelectTrigger className="w-36">
                <SelectValue placeholder="Month" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All months</SelectItem>
                {MLONG.map((m, i) => (
                  <SelectItem key={m} value={String(i)}>
                    {m}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Hero / KPI strip */}
        <div className="mb-6 rounded-xl border p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
                {[
                  { label: "Workdays", value: totals.workdays },
                  {
                    label: "Present",
                    value: totals.present,
                    cls: "text-blue-700 dark:text-blue-300",
                  },
                  {
                    label: "Absent",
                    value: totals.absent,
                    cls: totals.absent ? "text-red-600 dark:text-red-300" : "",
                  },
                  {
                    label: "Leave",
                    value: totals.leave,
                    cls: "text-violet-600 dark:text-violet-300",
                  },
                  {
                    label: "Lateness",
                    value: latenessCount,
                    cls: latenessCount
                      ? "text-amber-600 dark:text-amber-300"
                      : "",
                  },
                  {
                    label: "Holidays",
                    value: totals.holiday,
                    cls: "text-violet-700 dark:text-violet-300",
                  },
                ].map((kpi) => (
                  <div
                    key={kpi.label}
                    className="rounded-lg bg-muted/40 px-2 py-3 text-center"
                  >
                    <div
                      className={`text-xl font-bold tabular-nums ${kpi.cls ?? ""}`}
                    >
                      {kpi.value}
                    </div>
                    <div className="mt-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                      {kpi.label}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="shrink-0 text-right">
              <div
                className={`text-4xl font-bold tabular-nums leading-none ${rateColor(ytdRate)}`}
              >
                {ytdRate}%
              </div>
              <div className="mt-1 text-xs text-muted-foreground">
                Attendance rate · YTD
              </div>
            </div>
          </div>
        </div>

        {/* Main grid: heatmap on the left, leave history on the right */}
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="space-y-6 lg:col-span-2">
            {/* Year at a glance — 12 mini calendars */}
            <section>
              <div className="mb-3 flex items-center gap-2">
                <CalendarDays className="size-4 text-muted-foreground" />
                <h2 className="font-semibold">Year at a Glance — {year}</h2>
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                {yearData.map((m) => {
                  const isActive = activeMonth === m.monthIdx;
                  return (
                    <button
                      type="button"
                      key={m.monthIdx}
                      onClick={() =>
                        setActiveMonth(isActive ? null : m.monthIdx)
                      }
                      className={`rounded-xl border p-3 text-left transition-all hover:border-blue-300 ${
                        isActive
                          ? "border-blue-600 ring-1 ring-blue-200 dark:ring-blue-800"
                          : ""
                      }`}
                    >
                      <div className="mb-2 flex items-center justify-between">
                        <span className="text-xs font-semibold">
                          {MSHORT[m.monthIdx]}
                        </span>
                        <div className="flex gap-1.5 text-[9px] tabular-nums">
                          <span className="text-blue-600 dark:text-blue-300">
                            P:{m.present}
                          </span>
                          <span className="text-red-500 dark:text-red-300">
                            A:{m.absent}
                          </span>
                          <span className="text-violet-500 dark:text-violet-300">
                            L:{m.leave}
                          </span>
                        </div>
                      </div>
                      <div className="grid grid-cols-7 gap-px">
                        {DOW.map((d, i) => (
                          <div
                            key={`dow-${i}`}
                            className="text-center text-[7px] font-medium text-muted-foreground"
                          >
                            {d}
                          </div>
                        ))}
                        {Array.from({ length: m.firstDayOfWeek }, (_, i) => (
                          <div key={`empty-${i}`} />
                        ))}
                        {Array.from({ length: m.daysInMonth }, (_, i) => {
                          const day = i + 1;
                          const st = m.byDay[day];
                          const bg = st ? STATUS_SWATCH[st] : "bg-transparent";
                          return (
                            <div
                              key={day}
                              className={`flex h-3.5 items-center justify-center rounded-[2px] ${bg}`}
                            >
                              {st === "Holiday" ? (
                                <span className="text-[6px] font-bold">★</span>
                              ) : null}
                            </div>
                          );
                        })}
                      </div>
                      <div className="mt-2">
                        <div className="h-1 overflow-hidden rounded-full bg-muted">
                          <div
                            className={`h-full rounded-full ${rateBar(m.rate)}`}
                            style={{ width: `${m.rate}%` }}
                          />
                        </div>
                        <div className="mt-0.5 text-right text-[9px] tabular-nums text-muted-foreground">
                          {m.workdays > 0 ? `${m.rate}%` : "—"}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </section>

            {/* Selected-month detail grid */}
            {activeMonth !== null ? (
              <SelectedMonthDetail
                year={year}
                summary={yearData[activeMonth]!}
                logsByDate={logsByDate}
              />
            ) : null}

            {/* Monthly breakdown table */}
            <section>
              <div className="mb-3 flex items-center gap-2">
                <Clock3 className="size-4 text-muted-foreground" />
                <h2 className="font-semibold">Monthly Breakdown</h2>
              </div>
              <div className="overflow-x-auto rounded-xl border">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/40 text-left">
                      <th className="px-3 py-2 font-medium text-muted-foreground">
                        Month
                      </th>
                      <th className="px-3 py-2 font-medium text-muted-foreground">
                        Present
                      </th>
                      <th className="px-3 py-2 font-medium text-muted-foreground">
                        Absent
                      </th>
                      <th className="px-3 py-2 font-medium text-muted-foreground">
                        Leave
                      </th>
                      <th className="px-3 py-2 font-medium text-muted-foreground">
                        Holiday
                      </th>
                      <th className="px-3 py-2 font-medium text-muted-foreground">
                        Workdays
                      </th>
                      <th className="px-3 py-2 font-medium text-muted-foreground">
                        Rate
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {yearData.map((m) => (
                      <tr
                        key={m.monthIdx}
                        className={`cursor-pointer hover:bg-muted/30 ${
                          activeMonth === m.monthIdx ? "bg-muted/30" : ""
                        }`}
                        onClick={() =>
                          setActiveMonth(
                            activeMonth === m.monthIdx ? null : m.monthIdx,
                          )
                        }
                      >
                        <td className="px-3 py-2 font-medium">
                          {MLONG[m.monthIdx]}
                        </td>
                        <td className="px-3 py-2 font-mono tabular-nums text-blue-700 dark:text-blue-300">
                          {m.present}
                        </td>
                        <td
                          className={`px-3 py-2 font-mono tabular-nums ${
                            m.absent
                              ? "font-semibold text-red-600 dark:text-red-300"
                              : "text-muted-foreground"
                          }`}
                        >
                          {m.absent}
                        </td>
                        <td className="px-3 py-2 font-mono tabular-nums text-violet-600 dark:text-violet-300">
                          {m.leave}
                        </td>
                        <td className="px-3 py-2 font-mono tabular-nums text-muted-foreground">
                          {m.holiday}
                        </td>
                        <td className="px-3 py-2 font-mono tabular-nums">
                          {m.workdays}
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-2">
                            <div className="h-1.5 w-20 overflow-hidden rounded-full bg-muted">
                              <div
                                className={`h-full rounded-full ${rateBar(m.rate)}`}
                                style={{ width: `${m.rate}%` }}
                              />
                            </div>
                            <span
                              className={`w-10 text-right font-mono text-xs font-semibold tabular-nums ${rateColor(m.rate)}`}
                            >
                              {m.workdays > 0 ? `${m.rate}%` : "—"}
                            </span>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </div>

          {/* Side: leave history */}
          <aside className="space-y-4">
            <div className="rounded-xl border p-4">
              <h3 className="mb-3 text-sm font-semibold">
                Leave History — {year}
              </h3>
              {leaveQuery.isLoading ? (
                <div className="space-y-2">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <Skeleton key={i} className="h-10 w-full rounded-lg" />
                  ))}
                </div>
              ) : (leaveQuery.data ?? []).length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No leave requests on record for this year.
                </p>
              ) : (
                <ul className="space-y-2">
                  {((leaveQuery.data ?? []) as LeaveRequestRow[]).map((r) => (
                    <li
                      key={r.id}
                      className="rounded-lg border px-3 py-2 text-xs"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium">
                          {r.leaveType?.name ?? r.leaveType?.code ?? "Leave"}
                        </span>
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${leaveStatusBadge(
                            r.status,
                          )}`}
                        >
                          {r.status}
                        </span>
                      </div>
                      <div className="mt-1 text-muted-foreground">
                        {r.startDate} → {r.endDate} · {r.totalDays}d
                      </div>
                      {r.reason ? (
                        <div className="mt-1 line-clamp-2 text-muted-foreground">
                          {r.reason}
                        </div>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="rounded-xl border p-4 text-xs">
              <h3 className="mb-2 text-sm font-semibold">Legend</h3>
              <ul className="space-y-1.5">
                {(["Workday", "Restday", "Absent", "Leave", "Holiday"] as AttStatus[]).map(
                  (s) => (
                    <li key={s} className="flex items-center gap-2">
                      <span
                        className={`inline-flex size-3 items-center justify-center rounded-[2px] ${STATUS_SWATCH[s]}`}
                      >
                        {s === "Holiday" ? (
                          <span className="text-[7px] font-bold">★</span>
                        ) : null}
                      </span>
                      <span className="text-muted-foreground">{s}</span>
                    </li>
                  ),
                )}
              </ul>
            </div>
          </aside>
        </div>
      </Main>
    </>
  );
}

// ─── Selected-month detail grid ───────────────────────────────────────────────

function SelectedMonthDetail({
  year,
  summary,
  logsByDate,
}: {
  year: number;
  summary: MonthSummary;
  logsByDate: Map<string, AttendanceLogRow>;
}) {
  const monthName = MLONG[summary.monthIdx];

  return (
    <section>
      <div className="mb-3 flex items-center gap-2">
        <CalendarDays className="size-4 text-muted-foreground" />
        <h2 className="font-semibold">
          {monthName} {year} — Daily Detail
        </h2>
      </div>
      <div className="rounded-xl border p-4">
        <div className="grid grid-cols-7 gap-1 text-xs">
          {DOW.map((d, i) => (
            <div
              key={`dow-${i}`}
              className="py-1 text-center font-medium text-muted-foreground"
            >
              {d}
            </div>
          ))}
          {Array.from({ length: summary.firstDayOfWeek }, (_, i) => (
            <div key={`pad-${i}`} />
          ))}
          {Array.from({ length: summary.daysInMonth }, (_, i) => {
            const day = i + 1;
            const status = summary.byDay[day];
            const iso = `${year}-${String(summary.monthIdx + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
            const log = logsByDate.get(iso);
            const bg = status ? STATUS_SWATCH[status] : "bg-muted/30";
            const txt = status ? STATUS_TEXT[status] : "text-muted-foreground";
            return (
              <div
                key={day}
                className={`flex h-16 flex-col justify-between rounded-md border p-1.5 ${bg}`}
                title={
                  status
                    ? `${iso} · ${status}${log?.clockIn ? ` · in ${log.clockIn}` : ""}${log?.clockOut ? ` · out ${log.clockOut}` : ""}`
                    : iso
                }
              >
                <div className="flex items-center justify-between">
                  <span className={`text-xs font-semibold ${txt}`}>{day}</span>
                  {status ? (
                    <span className={`text-[10px] font-bold ${txt}`}>
                      {STATUS_GLYPH[status]}
                    </span>
                  ) : null}
                </div>
                {log?.clockIn ? (
                  <div className="text-[9px] font-mono leading-tight text-muted-foreground">
                    {log.clockIn}
                    {log.clockOut ? `–${log.clockOut}` : ""}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

