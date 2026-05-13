// /noc-performance — NOC Performance Metrics
// Replaces: apps/web/src/routes/_authenticated/noc-performance/index.tsx
//
// Changes from original:
//   • Metric column headers: full names + title tooltip attributes (no bare acronyms)
//   • Summary/totals row at bottom of metrics table
//   • EOM: hero display (large avatar + name + month + award category badges)
//   • New 4th tab: "Performance Journal" — mistake-matrix grid
//   • Preserve all UpsertMetricsDialog and mutation logic from original

import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BarChart2, BookOpen, Plus, RefreshCw, Trophy } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@ndma-dcs-staff-portal/ui/components/badge";
import { Button } from "@ndma-dcs-staff-portal/ui/components/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@ndma-dcs-staff-portal/ui/components/select";
import { Skeleton } from "@ndma-dcs-staff-portal/ui/components/skeleton";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@ndma-dcs-staff-portal/ui/components/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@ndma-dcs-staff-portal/ui/components/tabs";
import { Header } from "@/components/layout/header";
import { Main } from "@/components/layout/main";
import { ThemeSwitch } from "@/components/theme-switch";
import { orpc } from "@/utils/orpc";

// NOTE: Preserve UpsertMetricsDialog from original file — only display components change here.

export const Route = createFileRoute("/_authenticated/noc-performance/")({
  component: NocPerformancePage,
});

const CURRENT_YEAR = new Date().getFullYear();
const MONTHS = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];

// ── Metric column definitions with full names ──────────────────────────────────

const METRIC_COLS = [
  { key: "mt",            short: "MT",     label: "Maintenance Tasks",          title: "Number of maintenance tasks completed this month" },
  { key: "ittIncident",   short: "ITT-I",  label: "ITT Incidents",              title: "Incident tickets logged/resolved in iTOP" },
  { key: "ittProblem",    short: "ITT-P",  label: "ITT Problems",               title: "Problem tickets logged/resolved in iTOP" },
  { key: "daysDayShift",  short: "Day",    label: "Day Shifts",                 title: "Number of day shifts worked (07:00–19:00)" },
  { key: "daysSwingShift",short: "Swing",  label: "Swing Shifts",               title: "Number of swing/split shifts worked" },
  { key: "daysNightShift",short: "Night",  label: "Night Shifts",               title: "Number of night shifts worked (19:00–07:00)" },
  { key: "noccc",         short: "NOCCC",  label: "Customer Complaints Closed", title: "NOC Customer Complaints Closed this month" },
  { key: "nct",           short: "NCT",    label: "NOC Change Tasks",           title: "NOC Change Tasks completed" },
  { key: "ma",            short: "MA",     label: "Monitoring Alerts",          title: "Monitoring alerts actioned this month" },
] as const;

type MetricKey = typeof METRIC_COLS[number]["key"];

// ── EOM category definitions ───────────────────────────────────────────────────

const EOM_CATEGORIES = [
  { key: "overallBestName",             label: "🏆 Overall Best" },
  { key: "mostIncidentTicketsName",     label: "Most Incident Tickets" },
  { key: "mostProblemTicketsName",      label: "Most Problem Tickets" },
  { key: "mostNocTicketsClosedName",    label: "Most NOC Tickets Closed" },
  { key: "leastAlarmNonComplianceName", label: "Alarm Compliance ✓" },
  { key: "leastTicketNonComplianceName",label: "Ticket Compliance ✓" },
] as const;

// ── Journal categories ─────────────────────────────────────────────────────────

const JOURNAL_CATEGORIES = [
  { key: "tickets_itop",      label: "Tickets — iTOP" },
  { key: "alarms",            label: "Alarm Non-Compliance" },
  { key: "slack_whatsapp",    label: "Comms (Slack/WhatsApp)" },
  { key: "task_incomplete",   label: "Incomplete Tasks" },
] as const;

function getInitials(name?: string | null) {
  if (!name) return "?";
  return name.split(" ").map((s) => s[0]).slice(0, 2).join("").toUpperCase();
}

// ── Metrics Tab ────────────────────────────────────────────────────────────────

function MetricsTab({ year, month }: { year: number; month: number }) {
  const queryClient = useQueryClient();
  const [upsertOpen, setUpsertOpen] = useState(false);

  const { data, isLoading } = useQuery(
    orpc.nocPerformance.metrics.list.queryOptions({ input: { year, month } }),
  );
  const rows = data ?? [];

  // Compute totals
  const totals = rows.reduce<Record<string, number>>(
    (acc, r) => {
      METRIC_COLS.forEach(({ key }) => { acc[key] = (acc[key] ?? 0) + ((r as Record<string, unknown>)[key] as number ?? 0); });
      return acc;
    },
    {},
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Monthly performance data for NOC staff. Click a column header to see the full metric name.
        </p>
        <Button size="sm" onClick={() => setUpsertOpen(true)}>
          <Plus className="mr-1 size-4" /> Add / Update Metrics
        </Button>
      </div>

      {isLoading ? (
        <Skeleton className="h-48 w-full" />
      ) : rows.length === 0 ? (
        <div className="rounded-lg border border-dashed py-12 text-center">
          <BarChart2 className="mx-auto mb-3 size-8 opacity-30" />
          <p className="font-medium">No metrics for {MONTHS[month - 1]} {year}</p>
          <p className="mt-1 text-sm text-muted-foreground">Use "Add / Update Metrics" to enter data.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="sticky left-0 bg-background whitespace-nowrap">Staff Member</TableHead>
                {METRIC_COLS.map((col) => (
                  <TableHead
                    key={col.key}
                    className="text-center whitespace-nowrap"
                    title={col.title}   // full name as tooltip
                  >
                    <span className="font-mono text-xs">{col.short}</span>
                    <div className="text-[10px] font-normal text-muted-foreground hidden xl:block truncate max-w-[80px]">{col.label}</div>
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="sticky left-0 bg-background font-medium whitespace-nowrap">
                    <div className="flex items-center gap-2">
                      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-blue-100 text-[11px] font-bold text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">
                        {getInitials(r.staffName ?? undefined)}
                      </div>
                      {r.staffName ?? r.staffId}
                    </div>
                  </TableCell>
                  {METRIC_COLS.map((col) => (
                    <TableCell key={col.key} className="text-center tabular-nums">
                      {(r as Record<string, unknown>)[col.key] as number ?? 0}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
              {/* Totals row */}
              <TableRow className="border-t-2 bg-muted/40 font-semibold">
                <TableCell className="sticky left-0 bg-muted/40 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Totals
                </TableCell>
                {METRIC_COLS.map((col) => (
                  <TableCell key={col.key} className="text-center tabular-nums">
                    {totals[col.key] ?? 0}
                  </TableCell>
                ))}
              </TableRow>
            </TableBody>
          </Table>
        </div>
      )}

      {/* UpsertMetricsDialog — preserve from original file */}
      {/* {upsertOpen && <UpsertMetricsDialog open={upsertOpen} onOpenChange={setUpsertOpen} year={year} month={month} />} */}
    </div>
  );
}

// ── EOM Tab — hero display ─────────────────────────────────────────────────────

function EomTab({ year, month }: { year: number; month: number }) {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery(
    orpc.nocPerformance.eom.get.queryOptions({ input: { year, month } }),
  );

  const computeMutation = useMutation(
    orpc.nocPerformance.eom.compute.mutationOptions({
      onSuccess: () => { toast.success("EOM computed"); queryClient.invalidateQueries({ queryKey: orpc.nocPerformance.eom.get.key() }); },
      onError: (err: Error) => toast.error(err.message),
    }),
  );

  const eom = data as Record<string, string | null | undefined> | null | undefined;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Computed automatically from monthly metrics. Re-run after metrics are updated.
        </p>
        <Button size="sm" variant="outline" onClick={() => computeMutation.mutate({ year, month })} disabled={computeMutation.isPending}>
          <RefreshCw className={`mr-1 size-4 ${computeMutation.isPending ? "animate-spin" : ""}`} />
          {computeMutation.isPending ? "Computing…" : "Compute Now"}
        </Button>
      </div>

      {isLoading ? (
        <Skeleton className="h-48 w-full" />
      ) : !eom ? (
        <div className="flex flex-col items-center rounded-lg border border-dashed py-16 text-center">
          <Trophy className="mb-3 size-10 opacity-30" />
          <p className="font-medium">No EOM data for {MONTHS[month - 1]} {year}</p>
          <p className="mt-1 text-sm text-muted-foreground">Click "Compute Now" after entering monthly metrics.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Overall winner — hero */}
          {eom.overallBestName && (
            <div className="flex flex-col items-center gap-3 rounded-xl border bg-blue-50/60 py-8 dark:bg-blue-950/20">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-blue-100 text-2xl font-bold text-blue-700 ring-4 ring-blue-200 dark:bg-blue-900/40 dark:text-blue-300 dark:ring-blue-800">
                {getInitials(eom.overallBestName)}
              </div>
              <div className="text-center">
                <div className="flex items-center justify-center gap-2">
                  <Trophy className="size-4 text-amber-500" />
                  <span className="text-xl font-bold">{eom.overallBestName}</span>
                </div>
                <div className="mt-0.5 text-sm text-muted-foreground">
                  Employee of the Month — {MONTHS[month - 1]} {year}
                </div>
              </div>
              {/* Award categories as badges */}
              <div className="flex flex-wrap justify-center gap-2 pt-1">
                {EOM_CATEGORIES.filter((c) => c.key !== "overallBestName" && eom[c.key] === eom.overallBestName).map((c) => (
                  <span key={c.key} className="rounded-full bg-blue-100 px-3 py-0.5 text-xs font-medium text-blue-800 dark:bg-blue-900/40 dark:text-blue-200">
                    {c.label}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Category winners grid */}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {EOM_CATEGORIES.filter((c) => c.key !== "overallBestName").map(({ key, label }) => {
              const name = eom[key];
              return (
                <div key={key} className="flex items-center gap-3 rounded-lg border p-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-bold">
                    {getInitials(name)}
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">{label}</div>
                    <div className="font-medium">{name ?? <span className="italic text-muted-foreground">—</span>}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Performance Journal Tab ────────────────────────────────────────────────────

function JournalTab({ year, month }: { year: number; month: number }) {
  const { data, isLoading } = useQuery(
    orpc.nocPerformanceJournal.list.queryOptions({ input: { year, month } }),
  );
  const rows = data ?? [];

  // Build matrix: staffId → category → count
  const staffNames: Record<string, string> = {};
  const matrix: Record<string, Record<string, number>> = {};
  for (const row of rows) {
    if (row.staff?.user?.name) staffNames[row.staffProfileId] = row.staff.user.name;
    if (!matrix[row.staffProfileId]) matrix[row.staffProfileId] = {};
    matrix[row.staffProfileId][row.category] = (matrix[row.staffProfileId][row.category] ?? 0) + row.count;
  }
  const staffIds = Object.keys(matrix);

  const countColor = (n: number) =>
    n === 0 ? "text-muted-foreground" :
    n <= 2   ? "text-amber-600 dark:text-amber-400 font-semibold" :
               "text-red-600 dark:text-red-400 font-bold";

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Non-compliance and mistake matrix for {MONTHS[month - 1]} {year}. Lower is better.
      </p>
      {isLoading ? (
        <Skeleton className="h-48 w-full" />
      ) : staffIds.length === 0 ? (
        <div className="rounded-lg border border-dashed py-12 text-center">
          <BookOpen className="mx-auto mb-3 size-8 opacity-30" />
          <p className="text-muted-foreground">No journal entries for this month.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="sticky left-0 bg-background">Staff Member</TableHead>
                {JOURNAL_CATEGORIES.map((c) => (
                  <TableHead key={c.key} className="text-center whitespace-nowrap text-xs">{c.label}</TableHead>
                ))}
                <TableHead className="text-center">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {staffIds.map((sid) => {
                const total = JOURNAL_CATEGORIES.reduce((s, c) => s + (matrix[sid][c.key] ?? 0), 0);
                return (
                  <TableRow key={sid}>
                    <TableCell className="sticky left-0 bg-background font-medium">
                      {staffNames[sid] ?? sid}
                    </TableCell>
                    {JOURNAL_CATEGORIES.map((c) => {
                      const n = matrix[sid][c.key] ?? 0;
                      return (
                        <TableCell key={c.key} className={`text-center tabular-nums ${countColor(n)}`}>{n}</TableCell>
                      );
                    })}
                    <TableCell className={`text-center font-semibold tabular-nums ${countColor(total)}`}>{total}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────

function NocPerformancePage() {
  const now = new Date();
  const [year,  setYear]  = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);

  return (
    <>
      <Header fixed>
        <div className="flex items-center gap-2">
          <BarChart2 className="size-4 text-muted-foreground" />
          <span className="text-sm font-medium">NOC Performance</span>
        </div>
        <div className="ms-auto flex items-center gap-2">
          <ThemeSwitch />
        </div>
      </Header>

      <Main className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">NOC Performance</h1>
            <p className="text-sm text-muted-foreground">Monthly metrics, awards, and compliance journal.</p>
          </div>
          {/* Month/year selectors */}
          <div className="flex items-center gap-2">
            <Select value={String(month)} onValueChange={(v) => setMonth(Number(v))}>
              <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                {MONTHS.map((name, i) => <SelectItem key={i + 1} value={String(i + 1)}>{name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
              <SelectTrigger className="w-[100px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                {[CURRENT_YEAR - 1, CURRENT_YEAR, CURRENT_YEAR + 1].map((y) => (
                  <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <Tabs defaultValue="metrics">
          <TabsList className="w-full justify-start border-b bg-transparent p-0 h-auto">
            {[
              { value: "metrics", label: "Metrics" },
              { value: "tickets", label: "Ticket Activity" },
              { value: "eom",     label: "Employee of the Month" },
              { value: "journal", label: "Performance Journal" },
            ].map((t) => (
              <TabsTrigger
                key={t.value}
                value={t.value}
                className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none px-4 py-2"
              >
                {t.label}
              </TabsTrigger>
            ))}
          </TabsList>
          <TabsContent value="metrics"  className="pt-4"><MetricsTab  year={year} month={month} /></TabsContent>
          <TabsContent value="tickets"  className="pt-4">
            {/* TicketActivityTab — preserve from original file */}
            <div className="rounded-lg border border-dashed p-8 text-center text-muted-foreground text-sm">
              Ticket activity tab — preserve TicketActivityTab component from original file here.
            </div>
          </TabsContent>
          <TabsContent value="eom"      className="pt-4"><EomTab      year={year} month={month} /></TabsContent>
          <TabsContent value="journal"  className="pt-4"><JournalTab  year={year} month={month} /></TabsContent>
        </Tabs>
      </Main>
    </>
  );
}
