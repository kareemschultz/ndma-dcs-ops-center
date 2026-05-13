import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type ReactNode } from "react";
import { useState } from "react";
import { differenceInDays, format, parseISO } from "date-fns";
import { AlertCircle, CheckCircle2, Clock, ClipboardCheck, Info, Inbox, LayoutGrid, Pencil, Plus, Send, ShieldCheck, TrendingUp } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { toast } from "sonner";

import { Badge } from "@ndma-dcs-staff-portal/ui/components/badge";
import { Button } from "@ndma-dcs-staff-portal/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@ndma-dcs-staff-portal/ui/components/card";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@ndma-dcs-staff-portal/ui/components/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@ndma-dcs-staff-portal/ui/components/table";

import { Header } from "@/components/layout/header";
import { Main } from "@/components/layout/main";
import { ThemeSwitch } from "@/components/theme-switch";
import { chartTheme } from "@/lib/chart-theme";
import { useTeamFilter } from "@/lib/team-filter";
import { orpc, queryClient } from "@/utils/orpc";
import { authClient } from "@/lib/auth-client";

export const Route = createFileRoute("/_authenticated/appraisals/")({
  component: AppraisalsPage,
});

type AppraisalStatus =
  | "draft"
  | "scheduled"
  | "in_progress"
  | "submitted"
  | "approved"
  | "rejected"
  | "completed"
  | "overdue";

type AppraisalListRow = {
  id: string;
  staffProfileId: string;
  reviewerId: string | null;
  year: number | null;
  period: string | null;
  totalScore: number | null;
  status: string;
  periodStart: string | null;
  periodEnd: string | null;
  reviewer?: { user?: { name?: string | null } | null } | null;
  staffProfile?: {
    user?: { name?: string | null } | null;
    department?: { id: string; name: string; code: string } | null;
  } | null;
};

type TrackerRow = {
  id: number;
  departmentId: string | null;
  departmentName: string;
  departmentCode: string;
  year: number;
  period: string;
  totalCount: number;
  draftCount: number;
  scheduledCount: number;
  inProgressCount: number;
  submittedCount: number;
  approvedCount: number;
  rejectedCount: number;
  completedCount: number;
  overdueCount: number;
};

type AppraisalKpiSummary = {
  totalEvaluations: number;
  averageScore: number | null;
  completionRate: number;
  pendingCount: number;
  approvedCount: number;
  processedCount: number;
  completedCount: number;
  overdueCount: number;
  dueSoonFollowups: number;
  overdueFollowups: number;
  scoreBands: { label: string; count: number }[];
  statusBreakdown: { status: string; count: number }[];
  cycleBreakdown: {
    year: number | null;
    period: string | null;
    total: number;
    completed: number;
    averageScore: number | null;
  }[];
};

const STATUS_ORDER: AppraisalStatus[] = [
  "draft",
  "scheduled",
  "in_progress",
  "submitted",
  "approved",
  "rejected",
  "completed",
  "overdue",
];

const STATUS_COLORS: Record<AppraisalStatus, string> = {
  draft: "bg-muted text-muted-foreground",
  scheduled: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  in_progress: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300",
  submitted: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  approved: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  rejected: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
  completed: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  overdue: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
};

const KPI_STATUS_COLORS: Record<string, string> = {
  Draft: "#94a3b8",
  Pending_Approval: "#f59e0b",
  Approved_By_Manager: "#3b82f6",
  Processed_By_PA: "#8b5cf6",
  Completed: "#3b82f6",
  Rejected: "#ef4444",
  Overdue: "#ef4444",
  Other: "#64748b",
};

const SCORE_BAND_COLORS: Record<string, string> = {
  "90-100": "#2563eb",
  "80-89": "#3b82f6",
  "70-79": "#f59e0b",
  "Below 70": "#ef4444",
  "No Score": "#94a3b8",
};

// ── ScoreBar ──────────────────────────────────────────────────────────────────
function ScoreBar({ score }: { score: number | null | undefined }) {
  if (score == null) return <span className="text-muted-foreground">—</span>;
  const pct = Math.min(score, 100);
  return (
    <div className="space-y-0.5">
      <span className="tabular-nums font-semibold">{score}%</span>
      <div className="h-1.5 w-20 overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

// ── CycleBanner ───────────────────────────────────────────────────────────────
function CycleBanner() {
  const { data: cycles } = useQuery(orpc.appraisalCycles.list.queryOptions());
  const openCycle = (cycles as Array<{ status: string; year: number; half: string; closedAt?: string | null }> | undefined)?.find(
    (c) => c.status === "open",
  );
  if (!openCycle) return null;
  const daysLeft = openCycle.closedAt
    ? differenceInDays(new Date(openCycle.closedAt), new Date())
    : null;
  return (
    <div className="flex items-center gap-3 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-200">
      <Info className="size-4 shrink-0" />
      <span className="flex-1">
        <strong>
          {openCycle.half} {openCycle.year} appraisal cycle is open.
        </strong>
        {daysLeft != null && daysLeft > 3 && (
          <span className="ml-1 text-blue-600 dark:text-blue-400">Closes in {daysLeft} days.</span>
        )}
        {daysLeft != null && daysLeft <= 3 && (
          <span className="ml-1 font-bold text-red-600 dark:text-red-400"> Closing imminently!</span>
        )}
      </span>
    </div>
  );
}

// ── UrgencyBadge ──────────────────────────────────────────────────────────────
function UrgencyBadge({ submittedAt }: { submittedAt: string | null | undefined }) {
  if (!submittedAt) return null;
  const days = differenceInDays(new Date(), new Date(submittedAt));
  if (days > 14)
    return (
      <span className="inline-flex items-center gap-1 rounded-md bg-red-100 px-2 py-0.5 text-[10px] font-bold text-red-700 dark:bg-red-900/40 dark:text-red-300">
        <AlertCircle className="size-3" /> Overdue {days}d
      </span>
    );
  if (days > 7)
    return (
      <span className="rounded-md bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
        Waiting {days}d
      </span>
    );
  return null;
}

// ── FollowupsTab ──────────────────────────────────────────────────────────────
type FollowupRow = {
  id: string;
  appraisalId: string;
  type: "three_month" | "six_month" | "custom";
  status: "pending" | "done";
  dueDate?: string | null;
  completedAt?: string | null;
  appraisal?: {
    year?: number | null;
    period?: string | null;
    staffProfile?: { user?: { name?: string | null } | null } | null;
    reviewer?: { user?: { name?: string | null } | null } | null;
  } | null;
};

function followupUrgency(row: FollowupRow): "overdue" | "soon" | "upcoming" | "done" {
  if (row.status === "done") return "done";
  if (!row.dueDate) return "upcoming";
  const days = differenceInDays(parseISO(row.dueDate), new Date());
  if (days < 0) return "overdue";
  if (days <= 7) return "soon";
  return "upcoming";
}

const URGENCY_STYLE = {
  overdue: { badge: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300", label: "Overdue", icon: AlertCircle },
  soon: { badge: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300", label: "Due soon", icon: Clock },
  upcoming: { badge: "bg-muted text-muted-foreground", label: "Upcoming", icon: Clock },
  done: { badge: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300", label: "Done", icon: CheckCircle2 },
};

function FollowupsTab() {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery(
    orpc.appraisals.listFollowups.queryOptions({ input: {} }),
  );
  const markDone = useMutation(
    orpc.appraisals.completeFollowup.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: orpc.appraisals.listFollowups.key() });
      },
    }),
  );

  const rows = (data ?? []) as FollowupRow[];
  const pending = rows.filter((r) => r.status === "pending");
  const completed = rows.filter((r) => r.status === "done");

  if (isLoading) return <Skeleton className="h-48 w-full" />;

  return (
    <div className="space-y-6">
      {/* Summary strip */}
      <div className="flex flex-wrap gap-3">
        {[
          { label: "Overdue", count: rows.filter((r) => followupUrgency(r) === "overdue").length, cls: "border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/20" },
          { label: "Due ≤7 days", count: rows.filter((r) => followupUrgency(r) === "soon").length, cls: "border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/20" },
          { label: "Upcoming", count: rows.filter((r) => followupUrgency(r) === "upcoming").length, cls: "border-border bg-muted/30" },
          { label: "Completed", count: rows.filter((r) => followupUrgency(r) === "done").length, cls: "border-blue-200 bg-blue-50 dark:border-blue-900 dark:bg-blue-950/20" },
        ].map((s) => (
          <div key={s.label} className={`flex flex-col rounded-xl border px-5 py-2.5 ${s.cls}`}>
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{s.label}</span>
            <span className="text-xl font-bold tabular-nums">{s.count}</span>
          </div>
        ))}
      </div>

      {/* Pending */}
      {pending.length === 0 ? (
        <div className="flex flex-col items-center rounded-lg border border-dashed py-10 text-center">
          <CheckCircle2 className="mb-2 size-8 opacity-30" />
          <p className="font-medium">All follow-ups complete</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Staff Member</TableHead>
                <TableHead>Reviewer</TableHead>
                <TableHead>Period</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Due Date</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-28" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {pending.map((row) => {
                const urgency = followupUrgency(row);
                const { badge, label, icon: UrgIcon } = URGENCY_STYLE[urgency];
                const daysText = row.dueDate
                  ? (() => {
                      const d = differenceInDays(parseISO(row.dueDate), new Date());
                      return d < 0 ? `${Math.abs(d)}d overdue` : d === 0 ? "Today" : `${d}d`;
                    })()
                  : null;
                return (
                  <TableRow key={row.id}>
                    <TableCell className="font-medium">
                      {row.appraisal?.staffProfile?.user?.name ?? "—"}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {row.appraisal?.reviewer?.user?.name ?? "—"}
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {row.appraisal?.period ?? (row.appraisal?.year != null ? String(row.appraisal.year) : "—")}
                    </TableCell>
                    <TableCell>
                      <span className="rounded-md bg-muted px-2 py-0.5 text-xs font-medium">
                        {row.type === "three_month" ? "3-month" : row.type === "six_month" ? "6-month" : "Custom"}
                      </span>
                    </TableCell>
                    <TableCell>
                      {row.dueDate ? (
                        <div className="space-y-0.5">
                          <div className="font-mono text-xs">{format(parseISO(row.dueDate), "d MMM yyyy")}</div>
                          {daysText && (
                            <div className={`text-[10px] font-medium ${urgency === "overdue" ? "text-red-600 dark:text-red-400" : urgency === "soon" ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground"}`}>
                              {daysText}
                            </div>
                          )}
                        </div>
                      ) : "—"}
                    </TableCell>
                    <TableCell>
                      <span className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium ${badge}`}>
                        <UrgIcon className="size-3" />
                        {label}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => markDone.mutate({ id: row.id })}
                        disabled={markDone.isPending}
                      >
                        Mark done
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Completed */}
      {completed.length > 0 && (
        <details className="group">
          <summary className="cursor-pointer list-none text-sm text-muted-foreground hover:text-foreground">
            ▸ Show {completed.length} completed
          </summary>
          <div className="mt-2 overflow-hidden rounded-lg border">
            <Table>
              <TableBody>
                {completed.map((row) => {
                  const { badge, label } = URGENCY_STYLE[followupUrgency(row)];
                  return (
                    <TableRow key={row.id} className="opacity-60">
                      <TableCell className="font-medium">{row.appraisal?.staffProfile?.user?.name ?? "—"}</TableCell>
                      <TableCell className="font-mono text-xs">{row.type === "three_month" ? "3-month" : row.type === "six_month" ? "6-month" : "Custom"}</TableCell>
                      <TableCell>{row.completedAt ? format(parseISO(row.completedAt as string), "d MMM yyyy") : "—"}</TableCell>
                      <TableCell><span className={`rounded-md px-2 py-0.5 text-xs font-medium ${badge}`}>{label}</span></TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </details>
      )}
    </div>
  );
}

const REVIEW_CHAIN = {
  manager: "Sachin Ramsuran",
  pa: "Ataybia Williams",
};

// ── CreateAppraisalDialog ─────────────────────────────────────────────────────
function CreateAppraisalDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data: staffData } = useQuery(
    orpc.staff.list.queryOptions({ input: { limit: 200, offset: 0 } }),
  );
  const { data: cyclesData } = useQuery(orpc.appraisalCycles.list.queryOptions());
  const [form, setForm] = useState({
    staffProfileId: "",
    cycleId: "",
    reviewerId: "",
    periodStart: "",
    periodEnd: "",
    typeOfReview: "",
    scheduledDate: "",
    location: "",
  });

  const mutation = useMutation(
    orpc.appraisals.create.mutationOptions({
      onSuccess: async () => {
        toast.success("Appraisal created successfully.");
        await queryClient.invalidateQueries({ queryKey: orpc.appraisals.list.key() });
        onClose();
        setForm({ staffProfileId: "", cycleId: "", reviewerId: "", periodStart: "", periodEnd: "", typeOfReview: "", scheduledDate: "", location: "" });
      },
      onError: (e: Error) => toast.error(e.message),
    }),
  );

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.staffProfileId || !form.periodStart || !form.periodEnd) {
      toast.error("Staff member, period start and period end are required.");
      return;
    }
    mutation.mutate({
      staffProfileId: form.staffProfileId,
      cycleId: form.cycleId || undefined,
      reviewerId: form.reviewerId || undefined,
      periodStart: form.periodStart,
      periodEnd: form.periodEnd,
      typeOfReview: form.typeOfReview || undefined,
      scheduledDate: form.scheduledDate || undefined,
      location: form.location || undefined,
    });
  }

  const openCycles = (cyclesData as Array<{ id: string; status: string; year: number; half: string }> | undefined)?.filter((c) => c.status === "open") ?? [];
  const allCycles = (cyclesData as Array<{ id: string; status: string; year: number; half: string }> | undefined) ?? [];
  const staffList = (Array.isArray(staffData) ? staffData : []) as Array<{ id: string; user?: { name?: string | null } | null }>;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Create Appraisal</DialogTitle>
          <DialogDescription>
            Create a new appraisal record. The record starts in draft status.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 pt-1">
          <div className="space-y-1.5">
            <Label>Staff Member *</Label>
            <Select value={form.staffProfileId} onValueChange={(v) => setForm((p) => ({ ...p, staffProfileId: v ?? "" }))}>
              <SelectTrigger><SelectValue placeholder="Select staff member…" /></SelectTrigger>
              <SelectContent>
                {staffList.map((s) => (
                  <SelectItem key={s.id} value={s.id}>{s.user?.name ?? s.id}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Period Start *</Label>
              <Input type="date" value={form.periodStart} onChange={(e) => setForm((p) => ({ ...p, periodStart: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Period End *</Label>
              <Input type="date" value={form.periodEnd} onChange={(e) => setForm((p) => ({ ...p, periodEnd: e.target.value }))} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Appraisal Cycle</Label>
            <Select value={form.cycleId} onValueChange={(v) => setForm((p) => ({ ...p, cycleId: v ?? "" }))}>
              <SelectTrigger><SelectValue placeholder="None (standalone)" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="">None</SelectItem>
                {(openCycles.length > 0 ? openCycles : allCycles).map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.half} {c.year}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Reviewer / Supervisor</Label>
            <Select value={form.reviewerId} onValueChange={(v) => setForm((p) => ({ ...p, reviewerId: v ?? "" }))}>
              <SelectTrigger><SelectValue placeholder="Select reviewer…" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="">None</SelectItem>
                {staffList.map((s) => (
                  <SelectItem key={s.id} value={s.id}>{s.user?.name ?? s.id}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Type of Review</Label>
              <Select value={form.typeOfReview} onValueChange={(v) => setForm((p) => ({ ...p, typeOfReview: v ?? "" }))}>
                <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Not specified</SelectItem>
                  <SelectItem value="annual">Annual</SelectItem>
                  <SelectItem value="mid_year">Mid-Year</SelectItem>
                  <SelectItem value="probation">Probation</SelectItem>
                  <SelectItem value="performance_improvement">Performance Improvement</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Scheduled Date</Label>
              <Input type="date" value={form.scheduledDate} onChange={(e) => setForm((p) => ({ ...p, scheduledDate: e.target.value }))} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Location</Label>
            <Input placeholder="e.g. Conference Room A, Video Call" value={form.location} onChange={(e) => setForm((p) => ({ ...p, location: e.target.value }))} />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? "Creating…" : "Create Appraisal"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function formatPeriod(appraisal: AppraisalListRow) {
  if (appraisal.period) return appraisal.period;
  if (appraisal.periodStart && appraisal.periodEnd) {
    return `${format(new Date(appraisal.periodStart), "d MMM yyyy")} - ${format(new Date(appraisal.periodEnd), "d MMM yyyy")}`;
  }
  if (appraisal.year) return String(appraisal.year);
  return "—";
}

function StatCard({
  title,
  value,
  icon,
  tone,
}: {
  title: string;
  value: string;
  icon: ReactNode;
  tone: string;
}) {
  return (
    <Card className="border-border/60">
      <CardContent className="flex items-center gap-3 p-4">
        <div className={`flex size-10 items-center justify-center rounded-xl ${tone}`}>{icon}</div>
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">{title}</p>
          <p className="text-2xl font-bold leading-none">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function AppraisalsPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { team } = useTeamFilter();
  const [tab, setTab] = useState("records");
  const [showCreate, setShowCreate] = useState(false);
  const { data: session } = authClient.useSession();

  const { data: trackerRows, isLoading: trackerLoading } = useQuery(
    orpc.appraisals.tracker.list.queryOptions({
      input: { team: team === "All" ? undefined : team },
    }),
  );

  const { data: appraisals, isLoading: appraisalsLoading } = useQuery(
    orpc.appraisals.list.queryOptions({
      input: {
        team: team === "All" ? undefined : team,
        limit: 200,
        offset: 0,
      },
    }),
  );
  const { data: pipelineRows, isLoading: pipelineLoading } = useQuery(
    orpc.appraisals.workflow.list.queryOptions({
      input: { team: team === "All" ? undefined : team },
    }),
  );
  const { data: kpiData, isLoading: kpiLoading } = useQuery(
    orpc.appraisals.kpis.summary.queryOptions({
      input: { team: team === "All" ? undefined : team },
    }),
  );
  const { data: followups } = useQuery(
    orpc.appraisals.listFollowups.queryOptions({ input: {} }),
  );
  const followupStats = {
    overdue: (followups ?? []).filter((f) => {
      const row = f as FollowupRow;
      return row.status === "pending" && row.dueDate != null && new Date(row.dueDate) < new Date();
    }).length,
  };

  const submitWorkflow = useMutation(
    orpc.appraisals.workflow.submit.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries({ queryKey: orpc.appraisals.workflow.list.key() });
        await queryClient.invalidateQueries({ queryKey: orpc.appraisals.list.key() });
      },
    }),
  );
  const approveWorkflow = useMutation(
    orpc.appraisals.workflow.approve.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries({ queryKey: orpc.appraisals.workflow.list.key() });
        await queryClient.invalidateQueries({ queryKey: orpc.appraisals.list.key() });
      },
    }),
  );
  const processWorkflow = useMutation(
    orpc.appraisals.workflow.process.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries({ queryKey: orpc.appraisals.workflow.list.key() });
        await queryClient.invalidateQueries({ queryKey: orpc.appraisals.list.key() });
      },
    }),
  );

  const rows = (appraisals ?? []) as AppraisalListRow[];
  const tracker = (trackerRows ?? []) as TrackerRow[];
  const kpis = kpiData as AppraisalKpiSummary | undefined;

  const totals = tracker.reduce(
    (acc, row) => ({
      totalCount: acc.totalCount + row.totalCount,
      draftCount: acc.draftCount + row.draftCount,
      scheduledCount: acc.scheduledCount + row.scheduledCount,
      inProgressCount: acc.inProgressCount + row.inProgressCount,
      submittedCount: acc.submittedCount + row.submittedCount,
      approvedCount: acc.approvedCount + row.approvedCount,
      rejectedCount: acc.rejectedCount + row.rejectedCount,
      completedCount: acc.completedCount + row.completedCount,
      overdueCount: acc.overdueCount + row.overdueCount,
    }),
    {
      totalCount: 0,
      draftCount: 0,
      scheduledCount: 0,
      inProgressCount: 0,
      submittedCount: 0,
      approvedCount: 0,
      rejectedCount: 0,
      completedCount: 0,
      overdueCount: 0,
    },
  );

  const scoredRows = rows.filter((appraisal) => typeof appraisal.totalScore === "number");
  const averageScore =
    scoredRows.length > 0
      ? Math.round(
          scoredRows.reduce((sum, appraisal) => sum + (appraisal.totalScore ?? 0), 0) /
            scoredRows.length,
        )
      : null;
  const statusChartData = (kpis?.statusBreakdown ?? []).map((item) => ({
    name: item.status.replaceAll("_", " "),
    count: item.count,
    fill: KPI_STATUS_COLORS[item.status] ?? KPI_STATUS_COLORS.Other,
  }));
  const scoreBandChartData = (kpis?.scoreBands ?? []).map((item) => ({
    name: item.label,
    count: item.count,
    fill: SCORE_BAND_COLORS[item.label] ?? "#64748b",
  }));
  const cycleChartData = (kpis?.cycleBreakdown ?? []).map((item) => ({
    name: item.period ?? (item.year != null ? String(item.year) : "Unknown"),
    total: item.total,
    completed: item.completed,
    averageScore: item.averageScore ?? 0,
  }));

  return (
    <>
      <Header fixed>
        <div className="flex items-center gap-2">
          <ClipboardCheck className="size-4 text-muted-foreground" />
          <span className="text-sm font-medium">Appraisals</span>
        </div>
        <div className="ms-auto flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => navigate({ to: "/appraisals/inbox" })}>
            <Inbox className="mr-1.5 size-3.5" />
            Inbox
          </Button>
          <Button size="sm" onClick={() => setShowCreate(true)}>
            <Plus className="mr-1.5 size-3.5" />
            New Appraisal
          </Button>
          <ThemeSwitch />
        </div>
      </Header>

      <Main className="space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Appraisals</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Browse appraisal history by team, then open a staff detail view for the full evaluation trail.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Badge variant="outline" className="border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900/60 dark:bg-blue-950/40 dark:text-blue-300">
                Manager: {session?.user?.name ?? REVIEW_CHAIN.manager}
              </Badge>
              <Badge variant="outline" className="border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-900/60 dark:bg-violet-950/40 dark:text-violet-300">
                PA: {REVIEW_CHAIN.pa}
              </Badge>
            </div>
          </div>
        </div>

        <CycleBanner />

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
          {kpiLoading ? (
            Array.from({ length: 6 }).map((_, index) => (
              <Skeleton key={index} className="h-24 rounded-2xl" />
            ))
          ) : (
            <>
              <StatCard
                title="Total Evaluations"
                value={(kpis?.totalEvaluations ?? rows.length).toString()}
                icon={<LayoutGrid className="size-4 text-blue-600" />}
                tone="bg-blue-50 dark:bg-blue-950/40"
              />
              <StatCard
                title="Average Score"
                value={kpis?.averageScore != null ? `${kpis.averageScore}%` : "—"}
                icon={<TrendingUp className="size-4 text-blue-600" />}
                tone="bg-blue-50 dark:bg-blue-950/40"
              />
              <StatCard
                title="Completion Rate"
                value={`${kpis?.completionRate ?? 0}%`}
                icon={<ClipboardCheck className="size-4 text-indigo-600" />}
                tone="bg-indigo-50 dark:bg-indigo-950/40"
              />
              <StatCard
                title="Pending Approval"
                value={(kpis?.pendingCount ?? 0).toString()}
                icon={<Send className="size-4 text-amber-600" />}
                tone="bg-amber-50 dark:bg-amber-950/40"
              />
              <StatCard
                title="Follow-ups Due Soon"
                value={(kpis?.dueSoonFollowups ?? 0).toString()}
                icon={<ShieldCheck className="size-4 text-violet-600" />}
                tone="bg-violet-50 dark:bg-violet-950/40"
              />
              <StatCard
                title="Overdue Follow-ups"
                value={(kpis?.overdueFollowups ?? 0).toString()}
                icon={<ClipboardCheck className="size-4 text-red-600" />}
                tone="bg-red-50 dark:bg-red-950/40"
              />
            </>
          )}
        </section>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {trackerLoading ? (
            Array.from({ length: 4 }).map((_, index) => (
              <Skeleton key={index} className="h-24 rounded-2xl" />
            ))
          ) : (
            <>
              <StatCard
                title="Total Evaluations"
                value={totals.totalCount.toString()}
                icon={<LayoutGrid className="size-4 text-blue-600" />}
                tone="bg-blue-50 dark:bg-blue-950/40"
              />
              <StatCard
                title="Approved / Completed"
                value={(totals.approvedCount + totals.completedCount).toString()}
                icon={<TrendingUp className="size-4 text-blue-600" />}
                tone="bg-blue-50 dark:bg-blue-950/40"
              />
              <StatCard
                title="Submitted"
                value={totals.submittedCount.toString()}
                icon={<ClipboardCheck className="size-4 text-amber-600" />}
                tone="bg-amber-50 dark:bg-amber-950/40"
              />
              <StatCard
                title="Overdue"
                value={totals.overdueCount.toString()}
                icon={<ClipboardCheck className="size-4 text-red-600" />}
                tone="bg-red-50 dark:bg-red-950/40"
              />
            </>
          )}
        </section>

        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Tracked Teams</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {tracker.length > 0 ? (
                  tracker.map((row) => (
                    <Badge key={`${row.departmentCode}-${row.year}-${row.period}`} variant="outline">
                      {row.departmentCode} {row.year}
                    </Badge>
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground">No tracker rows available yet.</p>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Average Total Score</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold">{averageScore != null ? `${averageScore}%` : "—"}</p>
              <p className="text-sm text-muted-foreground">Across the filtered appraisal set.</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Current Filter</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm font-medium">
                {team === "All" ? "All teams" : `${team} only`}
              </p>
              <p className="text-sm text-muted-foreground">
                Showing appraisal records returned by the Hono API.
              </p>
            </CardContent>
          </Card>
        </div>

        <Tabs value={tab} onValueChange={setTab} className="space-y-4">
          <TabsList variant="line" className="justify-start">
            <TabsTrigger value="insights">KPI Insights</TabsTrigger>
            <TabsTrigger value="records">Records</TabsTrigger>
            <TabsTrigger value="pipeline">Approval Pipeline</TabsTrigger>
            <TabsTrigger value="followups">
              Follow-ups{followupStats.overdue > 0 ? ` (${followupStats.overdue} overdue)` : ""}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="insights">
            <div className="grid gap-4 xl:grid-cols-3">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Workflow Status Mix</CardTitle>
                </CardHeader>
                <CardContent>
                  {!statusChartData.length ? (
                    <p className="py-12 text-center text-sm text-muted-foreground">No appraisal status data yet.</p>
                  ) : (
                    <ResponsiveContainer width="100%" height={280}>
                      <PieChart>
                        <Pie data={statusChartData} dataKey="count" nameKey="name" cx="50%" cy="50%" outerRadius={90} label>
                          {statusChartData.map((entry) => (
                            <Cell key={entry.name} fill={entry.fill} />
                          ))}
                        </Pie>
                        <Tooltip contentStyle={chartTheme.tooltipContent} />
                        <Legend iconType="circle" iconSize={8} />
                      </PieChart>
                    </ResponsiveContainer>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Score Bands</CardTitle>
                </CardHeader>
                <CardContent>
                  {!scoreBandChartData.length ? (
                    <p className="py-12 text-center text-sm text-muted-foreground">No score data yet.</p>
                  ) : (
                    <ResponsiveContainer width="100%" height={280}>
                      <BarChart data={scoreBandChartData} margin={{ top: 4, right: 8, left: -12, bottom: 4 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} />
                        <XAxis dataKey="name" tick={chartTheme.axisTick} />
                        <YAxis allowDecimals={false} tick={chartTheme.axisTick} />
                        <Tooltip contentStyle={chartTheme.tooltipContent} />
                        <Bar dataKey="count" radius={[6, 6, 0, 0]}>
                          {scoreBandChartData.map((entry) => (
                            <Cell key={entry.name} fill={entry.fill} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Cycle Completion</CardTitle>
                </CardHeader>
                <CardContent>
                  {!cycleChartData.length ? (
                    <p className="py-12 text-center text-sm text-muted-foreground">No cycle data yet.</p>
                  ) : (
                    <ResponsiveContainer width="100%" height={280}>
                      <BarChart data={cycleChartData} margin={{ top: 4, right: 16, left: -12, bottom: 4 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} />
                        <XAxis dataKey="name" tick={chartTheme.axisTick} />
                        <YAxis allowDecimals={false} tick={chartTheme.axisTick} />
                        <Tooltip contentStyle={chartTheme.tooltipContent} />
                        <Legend iconType="circle" iconSize={8} />
                        <Bar dataKey="total" name="Total" fill="#cbd5e1" radius={[6, 6, 0, 0]} />
                        <Bar dataKey="completed" name="Completed" fill="#3b82f6" radius={[6, 6, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="records">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Appraisal Records</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Staff Member</TableHead>
                  <TableHead>Team</TableHead>
                  <TableHead>Year</TableHead>
                  <TableHead>Period</TableHead>
                  <TableHead>Total Score</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Reviewer</TableHead>
                  <TableHead className="w-28" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {appraisalsLoading ? (
                  Array.from({ length: 5 }).map((_, rowIndex) => (
                    <TableRow key={rowIndex}>
                      {Array.from({ length: 8 }).map((_, cellIndex) => (
                        <TableCell key={cellIndex}>
                          <Skeleton className="h-4 w-full" />
                        </TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="py-12 text-center text-muted-foreground">
                      No appraisal records found for this filter.
                    </TableCell>
                  </TableRow>
                ) : (
                  rows.map((appraisal) => (
                    <TableRow key={appraisal.id}>
                      <TableCell className="font-medium">
                        {appraisal.staffProfile?.user?.name ?? "—"}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {appraisal.staffProfile?.department?.name ?? "—"}
                      </TableCell>
                      <TableCell>{appraisal.year ?? "—"}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{formatPeriod(appraisal)}</TableCell>
                      <TableCell>
                        <ScoreBar score={appraisal.totalScore} />
                      </TableCell>
                      <TableCell>
                        <span
                          className={`inline-flex items-center rounded-lg px-2 py-0.5 text-xs font-medium ${
                            STATUS_COLORS[appraisal.status as AppraisalStatus] ?? STATUS_COLORS.draft
                          }`}
                        >
                          {appraisal.status.replace("_", " ")}
                        </span>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {appraisal.reviewer?.user?.name ?? "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-7"
                            title="Open appraisal detail"
                            onClick={() => navigate({ to: "/appraisals/$appraisalId", params: { appraisalId: appraisal.id } })}
                          >
                            <Pencil className="size-3.5" />
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => navigate({ to: "/appraisals/staff/$staffProfileId", params: { staffProfileId: appraisal.staffProfileId } })}
                          >
                            Staff
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="pipeline">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Approval Pipeline</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {pipelineLoading ? (
                  Array.from({ length: 4 }).map((_, index) => (
                    <Skeleton key={index} className="h-20 rounded-xl" />
                  ))
                ) : !pipelineRows?.length ? (
                  <p className="text-sm text-muted-foreground">No appraisals in the approval pipeline.</p>
                ) : (
                  (pipelineRows ?? []).map((row: AppraisalListRow) => (
                    <div key={row.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-4">
                      <div>
                        <p className="font-medium">{row.staffProfile?.user?.name ?? "—"}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <p className="text-sm text-muted-foreground">{formatPeriod(row)} · {row.status}</p>
                          <UrgencyBadge submittedAt={(row as AppraisalListRow & { submittedAt?: string | null }).submittedAt} />
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {(row.status === "Draft" || row.status === "draft") && (
                          <Button size="sm" onClick={() => submitWorkflow.mutate({ id: row.id })}>
                            <Send className="mr-1.5 size-3.5" />
                            Submit for Approval
                          </Button>
                        )}
                        {row.status === "submitted" && (
                          <Button size="sm" onClick={() => approveWorkflow.mutate({ id: row.id })}>
                            <ShieldCheck className="mr-1.5 size-3.5" />
                            Approve
                          </Button>
                        )}
                        {row.status === "approved" && (
                          <Button size="sm" onClick={() => processWorkflow.mutate({ id: row.id })}>
                            <Inbox className="mr-1.5 size-3.5" />
                            Export &amp; Send to HR
                          </Button>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="followups">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Appraisal Follow-ups</CardTitle>
              </CardHeader>
              <CardContent>
                <FollowupsTab />
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </Main>

      <CreateAppraisalDialog open={showCreate} onClose={() => setShowCreate(false)} />
    </>
  );
}
