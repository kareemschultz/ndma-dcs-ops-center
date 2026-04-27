import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BarChart2, Plus, RefreshCw, Trophy } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@ndma-dcs-staff-portal/ui/components/badge";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@ndma-dcs-staff-portal/ui/components/tabs";
import { Header } from "@/components/layout/header";
import { Main } from "@/components/layout/main";
import { ThemeSwitch } from "@/components/theme-switch";
import { orpc } from "@/utils/orpc";

export const Route = createFileRoute("/_authenticated/noc-performance/")({
  component: NocPerformancePage,
});

const CURRENT_YEAR = new Date().getFullYear();
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

// ── UpsertMetricsDialog ────────────────────────────────────────────────────

interface MetricsFormState {
  staffId: string;
  mt: string;
  ittIncident: string;
  ittProblem: string;
  daysDayShift: string;
  daysSwingShift: string;
  daysNightShift: string;
  noccc: string;
  nct: string;
  ma: string;
}

const defaultMetricsForm = (): MetricsFormState => ({
  staffId: "",
  mt: "0",
  ittIncident: "0",
  ittProblem: "0",
  daysDayShift: "0",
  daysSwingShift: "0",
  daysNightShift: "0",
  noccc: "0",
  nct: "0",
  ma: "0",
});

function UpsertMetricsDialog({
  open,
  onClose,
  year,
  month,
}: {
  open: boolean;
  onClose: () => void;
  year: number;
  month: number;
}) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<MetricsFormState>(defaultMetricsForm);

  const staffQuery = useQuery(orpc.staff.list.queryOptions({ input: { limit: 200, offset: 0 } }));
  const staffList = staffQuery.data ?? [];

  const upsertMutation = useMutation(
    orpc.nocPerformance.metrics.upsert.mutationOptions({
      onSuccess: () => {
        toast.success("Metrics saved.");
        queryClient.invalidateQueries({ queryKey: orpc.nocPerformance.metrics.list.key() });
        setForm(defaultMetricsForm());
        onClose();
      },
      onError: (err) => {
        toast.error(err.message ?? "Failed to save metrics.");
      },
    }),
  );

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.staffId) {
      toast.error("Please select a staff member.");
      return;
    }
    upsertMutation.mutate({
      staffId: form.staffId,
      year,
      month,
      mt: Number(form.mt),
      ittIncident: Number(form.ittIncident),
      ittProblem: Number(form.ittProblem),
      daysDayShift: Number(form.daysDayShift),
      daysSwingShift: Number(form.daysSwingShift),
      daysNightShift: Number(form.daysNightShift),
      noccc: Number(form.noccc),
      nct: Number(form.nct),
      ma: Number(form.ma),
    });
  }

  const field = (label: string, key: keyof MetricsFormState) => (
    <div className="space-y-1">
      <Label>{label}</Label>
      <Input
        type="number"
        min={0}
        value={form[key]}
        onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
      />
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Record Monthly Metrics</DialogTitle>
          <DialogDescription>
            Enter performance metrics for {MONTHS[(month - 1) % 12]} {year}.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1">
            <Label>Staff Member</Label>
            <Select
              value={form.staffId}
              onValueChange={(v) => setForm((f) => ({ ...f, staffId: v ?? "" }))}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select staff..." />
              </SelectTrigger>
              <SelectContent>
                {staffList.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.user?.name ?? s.id}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {field("Missed Ticket NC (MT)", "mt")}
            {field("ITT Incidents", "ittIncident")}
            {field("ITT Problems", "ittProblem")}
            {field("NOC Core Compliance (NOCCC)", "noccc")}
            {field("NOC Tickets Closed (NCT)", "nct")}
            {field("Missed Alarm NC (MA)", "ma")}
            {field("Days Day Shift", "daysDayShift")}
            {field("Days Swing Shift", "daysSwingShift")}
            {field("Days Night Shift", "daysNightShift")}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={upsertMutation.isPending}>
              {upsertMutation.isPending ? "Saving..." : "Save Metrics"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── MonthlyMetricsTab ──────────────────────────────────────────────────────

function MonthlyMetricsTab({ year, month }: { year: number; month: number }) {
  const [showAdd, setShowAdd] = useState(false);

  const { data, isLoading } = useQuery(
    orpc.nocPerformance.metrics.list.queryOptions({
      input: { year, month },
    }),
  );

  const rows = data ?? [];

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button size="sm" onClick={() => setShowAdd(true)}>
          <Plus className="h-4 w-4 mr-1" />
          Record Metrics
        </Button>
      </div>

      {isLoading ? (
        <Skeleton className="h-48 w-full" />
      ) : rows.length === 0 ? (
        <div className="rounded-lg border p-8 text-center text-muted-foreground">
          No metrics recorded for {MONTHS[(month - 1) % 12]} {year}.
        </div>
      ) : (
        <div className="rounded-lg border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Staff</TableHead>
                <TableHead className="text-center">MT</TableHead>
                <TableHead className="text-center">ITT Incident</TableHead>
                <TableHead className="text-center">ITT Problem</TableHead>
                <TableHead className="text-center">NOCCC</TableHead>
                <TableHead className="text-center">NCT</TableHead>
                <TableHead className="text-center">MA</TableHead>
                <TableHead className="text-center">Day Shifts</TableHead>
                <TableHead className="text-center">Swing Shifts</TableHead>
                <TableHead className="text-center">Night Shifts</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="font-medium">{row.staffName ?? row.staffId}</TableCell>
                  <TableCell className="text-center">
                    {row.mt > 0 ? (
                      <Badge variant="destructive">{row.mt}</Badge>
                    ) : (
                      <span className="text-muted-foreground">0</span>
                    )}
                  </TableCell>
                  <TableCell className="text-center">{row.ittIncident}</TableCell>
                  <TableCell className="text-center">{row.ittProblem}</TableCell>
                  <TableCell className="text-center">
                    <Badge variant="secondary">{row.noccc}</Badge>
                  </TableCell>
                  <TableCell className="text-center">
                    <Badge variant="secondary">{row.nct}</Badge>
                  </TableCell>
                  <TableCell className="text-center">
                    {row.ma > 0 ? (
                      <Badge variant="destructive">{row.ma}</Badge>
                    ) : (
                      <span className="text-muted-foreground">0</span>
                    )}
                  </TableCell>
                  <TableCell className="text-center">{row.daysDayShift}</TableCell>
                  <TableCell className="text-center">{row.daysSwingShift}</TableCell>
                  <TableCell className="text-center">{row.daysNightShift}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <UpsertMetricsDialog
        open={showAdd}
        onClose={() => setShowAdd(false)}
        year={year}
        month={month}
      />
    </div>
  );
}

// ── EomTab ─────────────────────────────────────────────────────────────────

const EOM_CATEGORIES = [
  { label: "Overall Best", nameKey: "overallBestName" as const },
  { label: "Second Best", nameKey: "secondBestName" as const },
  { label: "Most Incident Tickets", nameKey: "mostIncidentTicketsName" as const },
  { label: "Most Problem Tickets", nameKey: "mostProblemTicketsName" as const },
  { label: "Most NOC Tickets Closed", nameKey: "mostNocTicketsClosedName" as const },
  { label: "Least Alarm Non-Compliance", nameKey: "leastAlarmNonComplianceName" as const },
  { label: "Least Ticket Non-Compliance", nameKey: "leastTicketNonComplianceName" as const },
];

type EomData = {
  id: string;
  year: number;
  month: number;
  overallBestName: string | null;
  secondBestName: string | null;
  mostIncidentTicketsName: string | null;
  mostProblemTicketsName: string | null;
  mostNocTicketsClosedName: string | null;
  leastAlarmNonComplianceName: string | null;
  leastTicketNonComplianceName: string | null;
  computedAt: Date;
};

function EomTab({ year, month }: { year: number; month: number }) {
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery(
    orpc.nocPerformance.eom.get.queryOptions({ input: { year, month } }),
  );

  const eom = data as EomData | null | undefined;

  const computeMutation = useMutation(
    orpc.nocPerformance.eom.compute.mutationOptions({
      onSuccess: () => {
        toast.success("Employee of the Month computed.");
        queryClient.invalidateQueries({ queryKey: orpc.nocPerformance.eom.get.key() });
      },
      onError: (err) => {
        toast.error(err.message ?? "Failed to compute EOM.");
      },
    }),
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Awards computed automatically from monthly metrics.
        </p>
        <Button
          size="sm"
          variant="outline"
          onClick={() => computeMutation.mutate({ year, month })}
          disabled={computeMutation.isPending}
        >
          <RefreshCw className="h-4 w-4 mr-1" />
          {computeMutation.isPending ? "Computing..." : "Compute Now"}
        </Button>
      </div>

      {isLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : !eom ? (
        <div className="rounded-lg border p-8 text-center text-muted-foreground">
          <Trophy className="mx-auto h-10 w-10 mb-3 opacity-30" />
          <p>No EOM data for {MONTHS[(month - 1) % 12]} {year}.</p>
          <p className="text-xs mt-1">Click "Compute Now" after entering monthly metrics.</p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {EOM_CATEGORIES.map(({ label, nameKey }) => {
            const name = eom[nameKey];
            return (
              <div
                key={nameKey}
                className="rounded-lg border p-4 flex flex-col gap-1"
              >
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  {label}
                </p>
                <p className="text-base font-semibold">
                  {name ?? <span className="text-muted-foreground italic">—</span>}
                </p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── TicketActivityTab ──────────────────────────────────────────────────────

function TicketActivityTab({ year, month }: { year: number; month: number }) {
  const { data, isLoading } = useQuery(
    orpc.nocPerformance.tickets.list.queryOptions({ input: { year, month } }),
  );

  const rows = data ?? [];

  const typeColors: Record<string, string> = {
    incident: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200",
    problem: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200",
    work_order: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200",
  };

  return (
    <div className="space-y-4">
      {isLoading ? (
        <Skeleton className="h-48 w-full" />
      ) : rows.length === 0 ? (
        <div className="rounded-lg border p-8 text-center text-muted-foreground">
          No ticket activity recorded for {MONTHS[(month - 1) % 12]} {year}.
        </div>
      ) : (
        <div className="rounded-lg border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Ticket ID</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Actor</TableHead>
                <TableHead>Duplicate</TableHead>
                <TableHead>Notes</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="font-mono text-sm">{row.ticketId}</TableCell>
                  <TableCell>
                    <span
                      className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${typeColors[row.type] ?? ""}`}
                    >
                      {row.type.replace("_", " ")}
                    </span>
                  </TableCell>
                  <TableCell>
                    <Badge variant={row.action === "closed" ? "default" : "secondary"}>
                      {row.action}
                    </Badge>
                  </TableCell>
                  <TableCell>{row.actorName ?? "—"}</TableCell>
                  <TableCell>
                    {row.isDuplicate ? (
                      <Badge variant="destructive">Duplicate</Badge>
                    ) : (
                      <span className="text-muted-foreground text-xs">No</span>
                    )}
                  </TableCell>
                  <TableCell className="max-w-xs truncate text-muted-foreground text-sm">
                    {row.notes ?? "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

// ── NocPerformancePage ─────────────────────────────────────────────────────

function NocPerformancePage() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);

  return (
    <>
      <Header fixed>
        <div className="flex items-center gap-2">
          <BarChart2 className="h-5 w-5 text-muted-foreground" />
          <span className="font-semibold">NOC Performance</span>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <ThemeSwitch />
        </div>
      </Header>

      <Main>
        <div className="mb-6 flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Year</Label>
            <Select
              value={String(year)}
              onValueChange={(v) => setYear(Number(v ?? CURRENT_YEAR))}
            >
              <SelectTrigger className="w-28">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[CURRENT_YEAR - 1, CURRENT_YEAR, CURRENT_YEAR + 1].map((y) => (
                  <SelectItem key={y} value={String(y)}>
                    {y}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Month</Label>
            <Select
              value={String(month)}
              onValueChange={(v) => setMonth(Number(v ?? 1))}
            >
              <SelectTrigger className="w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MONTHS.map((name, idx) => (
                  <SelectItem key={idx + 1} value={String(idx + 1)}>
                    {name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <Tabs defaultValue="metrics">
          <TabsList>
            <TabsTrigger value="metrics">Monthly Metrics</TabsTrigger>
            <TabsTrigger value="eom">EOM Awards</TabsTrigger>
            <TabsTrigger value="tickets">Ticket Activity</TabsTrigger>
          </TabsList>

          <TabsContent value="metrics" className="mt-4">
            <MonthlyMetricsTab year={year} month={month} />
          </TabsContent>

          <TabsContent value="eom" className="mt-4">
            <EomTab year={year} month={month} />
          </TabsContent>

          <TabsContent value="tickets" className="mt-4">
            <TicketActivityTab year={year} month={month} />
          </TabsContent>
        </Tabs>
      </Main>
    </>
  );
}
