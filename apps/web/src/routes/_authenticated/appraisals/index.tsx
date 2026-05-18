import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type ReactNode, useMemo } from "react";
import { useState } from "react";
import { differenceInDays, format, parseISO } from "date-fns";
import {
  AlertCircle,
  Activity,
  Award,
  BarChart3,
  CheckCircle2,
  Clock,
  ClipboardCheck,
  FileDown,
  FileText,
  GitPullRequest,
  Gauge,
  Info,
  Inbox,
  LayoutGrid,
  LineChart as LineChartIcon,
  List,
  Pencil,
  Plus,
  Send,
  ShieldCheck,
  TrendingUp,
  UserCheck,
  Building2,
} from "lucide-react";
import { exportAppraisalsExcel } from "@/utils/excel-export";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ReferenceLine,
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
import { PageHeader } from "@/components/layout/page-header";
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
  submittedAt?: string | null;
  reviewer?: { user?: { name?: string | null } | null } | null;
  staffProfile?: {
    user?: { name?: string | null } | null;
    department?: { id: string; name: string; code: string } | null;
  } | null;
  cycle?: { id: string; year: number; half: string } | null;
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

const STATUS_COLORS: Record<AppraisalStatus, string> = {
  draft: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  scheduled: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  in_progress: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  submitted: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  approved: "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300",
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
      <span
        className="tabular-nums font-semibold"
        title="Total score as a percentage of the maximum (100)."
      >
        {pct}%
      </span>
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
  const halfLabel = openCycle.half === "h1" ? "First Half" : "Second Half";
  return (
    <div className="flex items-center gap-3 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-200">
      <Info className="size-4 shrink-0" />
      <span className="flex-1">
        <strong>
          {openCycle.year} — {halfLabel} appraisal cycle is open.
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
  const staffList = (Array.isArray(staffData) ? staffData : []) as Array<{ id: string; employeeId?: string; user?: { name?: string | null } | null }>;

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
              <SelectTrigger>
                <SelectValue>
                  {form.staffProfileId
                    ? (() => { const s = staffList.find(s => s.id === form.staffProfileId); return s?.user?.name ?? s?.employeeId ?? "Unnamed"; })()
                    : "Select staff member…"}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {staffList.map((s) => (
                  <SelectItem key={s.id} value={s.id}>{s.user?.name ?? s.employeeId ?? "Unnamed"}</SelectItem>
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
                  <SelectItem key={c.id} value={c.id}>{c.half === "h1" ? "First Half" : "Second Half"} {c.year}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Reviewer / Supervisor</Label>
            <Select value={form.reviewerId} onValueChange={(v) => setForm((p) => ({ ...p, reviewerId: v ?? "" }))}>
              <SelectTrigger>
                <SelectValue>
                  {form.reviewerId
                    ? (() => { const s = staffList.find(s => s.id === form.reviewerId); return s?.user?.name ?? s?.employeeId ?? "Unnamed"; })()
                    : "Select reviewer…"}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">None</SelectItem>
                {staffList.map((s) => (
                  <SelectItem key={s.id} value={s.id}>{s.user?.name ?? s.employeeId ?? "Unnamed"}</SelectItem>
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

function getInitials(name?: string | null): string {
  if (!name) return "—";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
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

// ── Pipeline columns config ────────────────────────────────────────────────────
// Maps to the 5-stage Kanban from the design-handoff prototype.
// Note: the DB enum has no `manager_review` / `hr_processing` — we use the
// underlying workflow statuses (`in_progress`, `approved`) which represent
// those stages in the lifecycle (submit → submitted → in_progress (manager
// reviewing) → approved (manager done, awaiting HR) → completed (HR done)).
type PipelineStage = "draft" | "submitted" | "manager_review" | "hr_processing" | "complete";

type PipelineColumn = {
  key: PipelineStage;
  label: string;
  // Status values that should land in this column.
  matches: AppraisalStatus[];
  dotClass: string;
  badgeClass: string;
  iconColor: string;
};

const PIPELINE_COLUMNS: PipelineColumn[] = [
  {
    key: "draft",
    label: "Draft",
    matches: ["draft"],
    dotClass: "bg-slate-400",
    badgeClass: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
    iconColor: "text-slate-500",
  },
  {
    key: "submitted",
    label: "Submitted",
    matches: ["submitted"],
    dotClass: "bg-amber-500",
    badgeClass: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
    iconColor: "text-amber-600",
  },
  {
    key: "manager_review",
    label: "Manager Review",
    matches: ["in_progress"],
    dotClass: "bg-violet-500",
    badgeClass: "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300",
    iconColor: "text-violet-600",
  },
  {
    key: "hr_processing",
    label: "HR Processing",
    matches: ["approved"],
    dotClass: "bg-blue-500",
    badgeClass: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
    iconColor: "text-blue-600",
  },
  {
    key: "complete",
    label: "Complete",
    matches: ["completed"],
    dotClass: "bg-blue-700",
    badgeClass: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
    iconColor: "text-blue-700",
  },
];

function stageOf(status: string): PipelineStage | null {
  for (const col of PIPELINE_COLUMNS) {
    if ((col.matches as string[]).includes(status)) return col.key;
  }
  return null;
}

// ── Pipeline Kanban card ──────────────────────────────────────────────────────
function PipelineCard({
  row,
  onOpen,
}: {
  row: AppraisalListRow;
  onOpen: (id: string) => void;
}) {
  const name = row.staffProfile?.user?.name ?? "—";
  const dept = row.staffProfile?.department?.code ?? row.staffProfile?.department?.name ?? "—";
  const score = row.totalScore;
  const max = APPRAISAL_MAX;
  const pct = score != null ? Math.min(Math.round((score / max) * 100), 100) : null;

  const pctColor =
    pct == null
      ? "text-muted-foreground"
      : pct >= 70
        ? "text-blue-700 dark:text-blue-300"
        : pct >= 50
          ? "text-amber-600 dark:text-amber-400"
          : "text-red-600 dark:text-red-400";

  const barColor =
    pct == null
      ? "bg-muted"
      : pct >= 70
        ? "bg-blue-600"
        : pct >= 50
          ? "bg-amber-500"
          : "bg-red-500";

  const showScore = score != null && row.status !== "draft";

  return (
    <button
      type="button"
      onClick={() => onOpen(row.id)}
      className="block w-full rounded-xl border bg-card p-3 text-left transition-colors hover:border-primary/60 hover:shadow-sm"
    >
      <div className="mb-2 flex items-center gap-2">
        <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-blue-600 text-[10px] font-bold text-white">
          {getInitials(name)}
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[12.5px] font-semibold">{name}</div>
          <div className="truncate text-[11px] text-muted-foreground">{dept}</div>
        </div>
        <UrgencyBadge submittedAt={row.submittedAt} />
      </div>
      {showScore && pct != null ? (
        <div className="space-y-1">
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-muted-foreground tabular-nums">
              {score}/{max}
            </span>
            <span
              className={`font-semibold tabular-nums ${pctColor}`}
              title="Total score as a percentage of the maximum (100)."
            >
              {pct}%
            </span>
          </div>
          <div className="h-1 overflow-hidden rounded-full bg-muted">
            <div className={`h-full rounded-full ${barColor}`} style={{ width: `${pct}%` }} />
          </div>
        </div>
      ) : (
        <div className="text-[11px] italic text-muted-foreground">Ratings pending</div>
      )}
    </button>
  );
}

// ── Pipeline Kanban view (5 columns) ──────────────────────────────────────────
function PipelineView({
  rows,
  isLoading,
  onOpen,
  onNew,
}: {
  rows: AppraisalListRow[];
  isLoading: boolean;
  onOpen: (id: string) => void;
  onNew: () => void;
}) {
  const grouped = useMemo(() => {
    const out: Record<PipelineStage, AppraisalListRow[]> = {
      draft: [],
      submitted: [],
      manager_review: [],
      hr_processing: [],
      complete: [],
    };
    for (const row of rows) {
      const stage = stageOf(row.status);
      if (stage) out[stage].push(row);
    }
    return out;
  }, [rows]);

  if (isLoading) {
    return (
      <div className="flex gap-3 overflow-x-auto pb-4">
        {PIPELINE_COLUMNS.map((col) => (
          <div key={col.key} className="w-64 shrink-0 space-y-2">
            <Skeleton className="h-6 w-32" />
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-20 w-full rounded-xl" />
            ))}
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="flex gap-3 overflow-x-auto pb-4">
      {PIPELINE_COLUMNS.map((col) => {
        const colRows = grouped[col.key];
        return (
          <div key={col.key} className="w-64 shrink-0">
            <div className="sticky top-0 z-10 -mx-1 mb-2 flex items-center justify-between px-1 pb-2">
              <div className="flex items-center gap-1.5">
                <span className={`size-2 rounded-full ${col.dotClass}`} />
                <span className="text-[12.5px] font-semibold">{col.label}</span>
              </div>
              <span
                className={`inline-flex min-w-[1.5rem] items-center justify-center rounded-md px-1.5 py-0.5 text-[10.5px] font-semibold ${col.badgeClass}`}
              >
                {colRows.length}
              </span>
            </div>
            <div className="space-y-2">
              {colRows.map((row) => (
                <PipelineCard key={row.id} row={row} onOpen={onOpen} />
              ))}
              <button
                type="button"
                onClick={onNew}
                className="block w-full rounded-xl border-2 border-dashed border-muted-foreground/30 py-2.5 text-[12px] text-muted-foreground transition-colors hover:border-primary/60 hover:text-primary"
              >
                + Add
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Score helpers ─────────────────────────────────────────────────────────────
// totalScore is stored on a 0–100 scale (same scale ScoreBar renders as a %).
const APPRAISAL_MAX = 100;

/** Resolve an appraisal row's percentage — prefers explicit %, else derives
 * from totalScore. Always clamped to 0–100 so bad data can't print >100%. */
function rowPercentage(row: AppraisalListRow): number | null {
  const explicit = (row as { percentage?: number | null; percentageScore?: number | null }).percentage
    ?? (row as { percentageScore?: number | null }).percentageScore;
  if (typeof explicit === "number") return Math.min(Math.round(explicit), 100);
  if (typeof row.totalScore === "number") {
    return Math.min(Math.round((row.totalScore / APPRAISAL_MAX) * 100), 100);
  }
  return null;
}

const PERFORMANCE_BANDS = [
  { key: "exceptional", label: "Exceptional", range: "90-100%", min: 90, color: "#1d4ed8" },
  { key: "high", label: "High Performer", range: "80-89%", min: 80, color: "#3b82f6" },
  { key: "solid", label: "Solid", range: "70-79%", min: 70, color: "#60a5fa" },
  { key: "developing", label: "Developing", range: "60-69%", min: 60, color: "#f59e0b" },
  { key: "needs_dev", label: "Needs Development", range: "<60%", min: 0, color: "#ef4444" },
] as const;

function bandOf(pct: number): (typeof PERFORMANCE_BANDS)[number] {
  return PERFORMANCE_BANDS.find((b) => pct >= b.min) ?? PERFORMANCE_BANDS[PERFORMANCE_BANDS.length - 1];
}

// ── KPI tile ──────────────────────────────────────────────────────────────────
function KpiTile({
  label,
  value,
  sub,
  icon,
  tone,
  accent,
}: {
  label: string;
  value: string;
  sub?: ReactNode;
  icon: ReactNode;
  tone: string;
  accent: string;
}) {
  return (
    <Card className="relative overflow-hidden border-border/60">
      <span className={`absolute inset-y-0 left-0 w-1 ${accent}`} />
      <CardContent className="flex items-start gap-3 p-4 pl-5">
        <div className={`flex size-10 shrink-0 items-center justify-center rounded-xl ${tone}`}>
          {icon}
        </div>
        <div className="min-w-0">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            {label}
          </p>
          <p className="text-2xl font-bold leading-tight tabular-nums">{value}</p>
          {sub != null && <div className="mt-0.5 text-[11px] text-muted-foreground">{sub}</div>}
        </div>
      </CardContent>
    </Card>
  );
}

// ── KPI summary strip ─────────────────────────────────────────────────────────
function AppraisalKpiStrip({
  rows,
  isLoading,
  overdueFollowups,
  cycleLabel,
}: {
  rows: AppraisalListRow[];
  isLoading: boolean;
  overdueFollowups: number;
  cycleLabel: string;
}) {
  const stats = useMemo(() => {
    const total = rows.length;
    const scored = rows
      .map(rowPercentage)
      .filter((p): p is number => p != null);
    const avg = scored.length > 0 ? Math.round(scored.reduce((s, p) => s + p, 0) / scored.length) : null;
    const completed = rows.filter((r) => r.status === "completed" || r.status === "approved").length;
    const inProgress = rows.filter((r) => ["in_progress", "submitted"].includes(r.status)).length;
    const overdue = rows.filter((r) => r.status === "overdue").length;
    const highPerformers = scored.filter((p) => p >= 80).length;
    const needsDev = scored.filter((p) => p < 60).length;
    const completionRate = total > 0 ? Math.round((completed / total) * 100) : 0;
    return { total, avg, completed, inProgress, overdue, highPerformers, needsDev, completionRate };
  }, [rows]);

  if (isLoading) {
    return (
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-[88px] rounded-xl" />
        ))}
      </section>
    );
  }

  return (
    <section className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
      <KpiTile
        label="Total Appraisals"
        value={String(stats.total)}
        sub={cycleLabel}
        icon={<ClipboardCheck className="size-5 text-blue-600" />}
        tone="bg-blue-50 dark:bg-blue-950/40"
        accent="bg-blue-500"
      />
      <KpiTile
        label="Average Score"
        value={stats.avg != null ? `${stats.avg}%` : "—"}
        sub={stats.avg != null ? bandOf(stats.avg).label : "No scored appraisals"}
        icon={<Gauge className="size-5 text-indigo-600" />}
        tone="bg-indigo-50 dark:bg-indigo-950/40"
        accent="bg-indigo-500"
      />
      <KpiTile
        label="Completed"
        value={`${stats.completionRate}%`}
        sub={`${stats.completed} of ${stats.total} finalised`}
        icon={<CheckCircle2 className="size-5 text-blue-600" />}
        tone="bg-blue-50 dark:bg-blue-950/40"
        accent="bg-blue-500"
      />
      <KpiTile
        label="In Progress"
        value={String(stats.inProgress)}
        sub="Submitted / under review"
        icon={<Activity className="size-5 text-amber-600" />}
        tone="bg-amber-50 dark:bg-amber-950/40"
        accent="bg-amber-500"
      />
      <KpiTile
        label="High Performers"
        value={String(stats.highPerformers)}
        sub="Scored ≥ 80%"
        icon={<Award className="size-5 text-violet-600" />}
        tone="bg-violet-50 dark:bg-violet-950/40"
        accent="bg-violet-500"
      />
      <KpiTile
        label="Needs Attention"
        value={String(stats.needsDev + stats.overdue + overdueFollowups)}
        sub={`${stats.needsDev} <60% · ${stats.overdue} overdue · ${overdueFollowups} follow-up`}
        icon={<AlertCircle className="size-5 text-red-600" />}
        tone="bg-red-50 dark:bg-red-950/40"
        accent="bg-red-500"
      />
    </section>
  );
}

// ── Analytics view ────────────────────────────────────────────────────────────
const REPORT_CATEGORIES: { key: string; short: string }[] = [
  { key: "organisational_skills", short: "Organisation" },
  { key: "quality_of_work", short: "Quality" },
  { key: "dependability", short: "Dependability" },
  { key: "communication_skills", short: "Communication" },
  { key: "cooperation", short: "Cooperation" },
  { key: "initiative", short: "Initiative" },
  { key: "technical_skills", short: "Problem Solving" },
  { key: "attendance_punctuality", short: "Professionalism" },
];

function AnalyticsCard({
  title,
  subtitle,
  icon,
  children,
}: {
  title: string;
  subtitle: string;
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <Card className="border-border/60">
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2">
          <span className="flex size-7 items-center justify-center rounded-lg bg-blue-50 text-blue-600 dark:bg-blue-950/40">
            {icon}
          </span>
          <div>
            <CardTitle className="text-sm">{title}</CardTitle>
            <p className="text-[11px] text-muted-foreground">{subtitle}</p>
          </div>
        </div>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

function AnalyticsEmpty({ label }: { label: string }) {
  return (
    <div className="flex h-[280px] flex-col items-center justify-center text-center">
      <BarChart3 className="mb-2 size-8 text-muted-foreground/30" />
      <p className="text-sm text-muted-foreground">{label}</p>
    </div>
  );
}

function AnalyticsView({
  rows,
  isLoading,
}: {
  rows: AppraisalListRow[];
  isLoading: boolean;
}) {
  // Score distribution histogram — 10-point buckets.
  const distribution = useMemo(() => {
    const buckets = [
      { name: "0-49", min: 0, max: 49, count: 0, fill: "#ef4444" },
      { name: "50-59", min: 50, max: 59, count: 0, fill: "#f59e0b" },
      { name: "60-69", min: 60, max: 69, count: 0, fill: "#f59e0b" },
      { name: "70-79", min: 70, max: 79, count: 0, fill: "#60a5fa" },
      { name: "80-89", min: 80, max: 89, count: 0, fill: "#3b82f6" },
      { name: "90-100", min: 90, max: 100, count: 0, fill: "#1d4ed8" },
    ];
    for (const r of rows) {
      const pct = rowPercentage(r);
      if (pct == null) continue;
      const b = buckets.find((x) => pct >= x.min && pct <= x.max);
      if (b) b.count += 1;
    }
    return buckets;
  }, [rows]);

  // Average score by department.
  const byDepartment = useMemo(() => {
    const map = new Map<string, { sum: number; count: number }>();
    for (const r of rows) {
      const pct = rowPercentage(r);
      if (pct == null) continue;
      const dept = r.staffProfile?.department?.name ?? "Unassigned";
      const cur = map.get(dept) ?? { sum: 0, count: 0 };
      cur.sum += pct;
      cur.count += 1;
      map.set(dept, cur);
    }
    return [...map.entries()]
      .map(([name, v]) => ({ name, avg: Math.round(v.sum / v.count), count: v.count }))
      .sort((a, b) => b.avg - a.avg);
  }, [rows]);

  // Category-strength comparison — average rating per category across all rated appraisals.
  const categoryStrength = useMemo(() => {
    const sums = new Map<string, { sum: number; count: number }>();
    for (const r of rows) {
      const matrix = (r as { ratingMatrix?: Record<string, number> | null }).ratingMatrix;
      if (!matrix) continue;
      for (const c of REPORT_CATEGORIES) {
        const v = matrix[c.key];
        if (typeof v !== "number" || v <= 0) continue;
        const cur = sums.get(c.key) ?? { sum: 0, count: 0 };
        cur.sum += v;
        cur.count += 1;
        sums.set(c.key, cur);
      }
    }
    return REPORT_CATEGORIES.map((c) => {
      const v = sums.get(c.key);
      return { category: c.short, avg: v && v.count > 0 ? Number((v.sum / v.count).toFixed(2)) : 0 };
    });
  }, [rows]);
  const hasCategoryData = categoryStrength.some((c) => c.avg > 0);

  // Cycle-over-cycle trend.
  const cycleTrend = useMemo(() => {
    const map = new Map<string, { sum: number; count: number; sort: number }>();
    for (const r of rows) {
      const pct = rowPercentage(r);
      if (pct == null) continue;
      const cy = r.cycle;
      const label = cy
        ? `${cy.year} ${cy.half === "h1" ? "H1" : "H2"}`
        : r.year != null
          ? String(r.year)
          : "Unknown";
      const sort = cy ? cy.year * 10 + (cy.half === "h1" ? 1 : 2) : (r.year ?? 0) * 10;
      const cur = map.get(label) ?? { sum: 0, count: 0, sort };
      cur.sum += pct;
      cur.count += 1;
      map.set(label, cur);
    }
    return [...map.entries()]
      .map(([name, v]) => ({ name, avg: Math.round(v.sum / v.count), count: v.count, sort: v.sort }))
      .sort((a, b) => a.sort - b.sort);
  }, [rows]);

  const overallAvg = useMemo(() => {
    const scored = rows.map(rowPercentage).filter((p): p is number => p != null);
    return scored.length > 0 ? Math.round(scored.reduce((s, p) => s + p, 0) / scored.length) : 0;
  }, [rows]);

  // Performance band breakdown for the donut.
  const bandBreakdown = useMemo(() => {
    const counts = new Map<string, number>();
    for (const r of rows) {
      const pct = rowPercentage(r);
      if (pct == null) continue;
      const b = bandOf(pct);
      counts.set(b.key, (counts.get(b.key) ?? 0) + 1);
    }
    return PERFORMANCE_BANDS.map((b) => ({
      name: b.label,
      value: counts.get(b.key) ?? 0,
      fill: b.color,
    })).filter((b) => b.value > 0);
  }, [rows]);

  if (isLoading) {
    return (
      <div className="grid gap-4 lg:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-[340px] rounded-xl" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-2">
        <AnalyticsCard
          title="Score Distribution"
          subtitle="How appraisal scores spread across performance bands"
          icon={<BarChart3 className="size-4" />}
        >
          {distribution.some((b) => b.count > 0) ? (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={distribution} margin={{ top: 8, right: 8, left: -16, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                <XAxis dataKey="name" tick={chartTheme.axisTickSmall} />
                <YAxis allowDecimals={false} tick={chartTheme.axisTick} />
                <Tooltip
                  contentStyle={chartTheme.tooltipContent}
                  cursor={chartTheme.tooltipCursor}
                  formatter={(v) => [`${Number(v)} appraisal(s)`, "Count"]}
                />
                <Bar dataKey="count" radius={[6, 6, 0, 0]} barSize={44}>
                  {distribution.map((entry) => (
                    <Cell key={entry.name} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <AnalyticsEmpty label="No scored appraisals in this selection." />
          )}
        </AnalyticsCard>

        <AnalyticsCard
          title="Average Score by Department"
          subtitle="Mean appraisal percentage per department"
          icon={<Building2 className="size-4" />}
        >
          {byDepartment.length > 0 ? (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart
                data={byDepartment}
                layout="vertical"
                margin={{ top: 4, right: 28, left: 4, bottom: 4 }}
              >
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="var(--border)" />
                <XAxis type="number" domain={[0, 100]} tick={chartTheme.axisTick} />
                <YAxis
                  type="category"
                  dataKey="name"
                  width={120}
                  tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                />
                <Tooltip
                  contentStyle={chartTheme.tooltipContent}
                  cursor={chartTheme.tooltipCursor}
                  formatter={(v, _n, p) => [
                    `${Number(v)}% avg · ${(p?.payload as { count?: number })?.count ?? 0} appraisal(s)`,
                    "Score",
                  ]}
                />
                <ReferenceLine x={overallAvg} stroke="#1d4ed8" strokeDasharray="4 4" />
                <Bar dataKey="avg" radius={[0, 6, 6, 0]} barSize={20}>
                  {byDepartment.map((entry) => (
                    <Cell key={entry.name} fill={entry.avg >= overallAvg ? "#3b82f6" : "#93c5fd"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <AnalyticsEmpty label="No department scores available yet." />
          )}
        </AnalyticsCard>

        <AnalyticsCard
          title="Category Strength Profile"
          subtitle="Average rating (1–5) across the 8 evaluation categories"
          icon={<Activity className="size-4" />}
        >
          {hasCategoryData ? (
            <ResponsiveContainer width="100%" height={300}>
              <RadarChart data={categoryStrength} outerRadius="70%">
                <PolarGrid stroke="var(--border)" />
                <PolarAngleAxis
                  dataKey="category"
                  tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                />
                <PolarRadiusAxis
                  domain={[0, 5]}
                  tickCount={6}
                  tick={{ fontSize: 9, fill: "var(--muted-foreground)" }}
                />
                <Radar
                  name="Avg rating"
                  dataKey="avg"
                  stroke="#2563eb"
                  fill="#3b82f6"
                  fillOpacity={0.45}
                />
                <Tooltip
                  contentStyle={chartTheme.tooltipContent}
                  formatter={(v) => [`${Number(v)} / 5`, "Avg rating"]}
                />
              </RadarChart>
            </ResponsiveContainer>
          ) : (
            <AnalyticsEmpty label="No category ratings recorded yet." />
          )}
        </AnalyticsCard>

        <AnalyticsCard
          title="Cycle-over-Cycle Trend"
          subtitle="Average score progression across appraisal cycles"
          icon={<LineChartIcon className="size-4" />}
        >
          {cycleTrend.length > 1 ? (
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={cycleTrend} margin={{ top: 8, right: 16, left: -16, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                <XAxis dataKey="name" tick={chartTheme.axisTickSmall} />
                <YAxis domain={[0, 100]} tick={chartTheme.axisTick} />
                <Tooltip
                  contentStyle={chartTheme.tooltipContent}
                  formatter={(v, _n, p) => [
                    `${Number(v)}% · ${(p?.payload as { count?: number })?.count ?? 0} appraisal(s)`,
                    "Avg score",
                  ]}
                />
                <Line
                  type="monotone"
                  dataKey="avg"
                  stroke="#2563eb"
                  strokeWidth={2.5}
                  dot={{ r: 4, fill: "#2563eb" }}
                  activeDot={{ r: 6 }}
                />
              </LineChart>
            </ResponsiveContainer>
          ) : cycleTrend.length === 1 ? (
            <div className="flex h-[280px] flex-col items-center justify-center gap-1 text-center">
              <Gauge className="mb-1 size-8 text-blue-500/40" />
              <p className="text-3xl font-bold tabular-nums text-blue-700 dark:text-blue-300">
                {cycleTrend[0].avg}%
              </p>
              <p className="text-sm text-muted-foreground">
                {cycleTrend[0].name} average — one cycle, no trend yet
              </p>
            </div>
          ) : (
            <AnalyticsEmpty label="No cycle data available yet." />
          )}
        </AnalyticsCard>
      </div>

      <AnalyticsCard
        title="Performance Band Mix"
        subtitle="Share of appraisals in each performance band"
        icon={<Award className="size-4" />}
      >
        {bandBreakdown.length > 0 ? (
          <div className="grid gap-4 sm:grid-cols-[260px_1fr] sm:items-center">
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie
                  data={bandBreakdown}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  innerRadius={52}
                  outerRadius={86}
                  paddingAngle={2}
                >
                  {bandBreakdown.map((entry) => (
                    <Cell key={entry.name} fill={entry.fill} />
                  ))}
                </Pie>
                <Tooltip contentStyle={chartTheme.tooltipContent} />
              </PieChart>
            </ResponsiveContainer>
            <div className="space-y-1.5">
              {PERFORMANCE_BANDS.map((b) => {
                const found = bandBreakdown.find((x) => x.name === b.label);
                const count = found?.value ?? 0;
                const total = bandBreakdown.reduce((s, x) => s + x.value, 0);
                const pct = total > 0 ? Math.round((count / total) * 100) : 0;
                return (
                  <div key={b.key} className="flex items-center gap-3">
                    <span className="size-3 shrink-0 rounded-sm" style={{ background: b.color }} />
                    <span className="w-36 text-sm">{b.label}</span>
                    <span className="text-xs text-muted-foreground">{b.range}</span>
                    <div className="ml-auto flex items-center gap-2">
                      <div className="h-1.5 w-24 overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full"
                          style={{ width: `${pct}%`, background: b.color }}
                        />
                      </div>
                      <span className="w-14 text-right text-sm font-semibold tabular-nums">
                        {count} ({pct}%)
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <AnalyticsEmpty label="No scored appraisals to band yet." />
        )}
      </AnalyticsCard>
    </div>
  );
}

function AppraisalsPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { team } = useTeamFilter();
  const [tab, setTab] = useState("pipeline");
  const [showCreate, setShowCreate] = useState(false);
  const [cycleFilter, setCycleFilter] = useState<string>("all");
  const { data: session } = authClient.useSession();

  const { data: cyclesData } = useQuery(orpc.appraisalCycles.list.queryOptions());
  const cycles =
    (cyclesData as
      | Array<{ id: string; status: string; year: number; half: string }>
      | undefined) ?? [];
  const selectedCycle = cycles.find((c) => c.id === cycleFilter);

  const { data: trackerRows, isLoading: trackerLoading } = useQuery(
    orpc.appraisals.tracker.list.queryOptions({
      input: { team: team === "All" ? undefined : team },
    }),
  );

  const { data: appraisals, isLoading: appraisalsLoading } = useQuery(
    orpc.appraisals.list.queryOptions({
      input: {
        team: team === "All" ? undefined : team,
        cycleId: cycleFilter !== "all" ? cycleFilter : undefined,
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

  // Pipeline data must be filtered by selected cycle client-side because
  // workflow.list does not accept a cycleId filter.
  const allPipelineRows = (pipelineRows ?? []) as AppraisalListRow[];
  const pipelineRowsFiltered = useMemo(() => {
    if (cycleFilter === "all") return allPipelineRows;
    return allPipelineRows.filter((r) => r.cycle?.id === cycleFilter);
  }, [allPipelineRows, cycleFilter]);

  // Stats strip counts derived from pipeline rows (5 stage buckets).
  const stageCounts = useMemo(() => {
    const counts: Record<PipelineStage, number> = {
      draft: 0,
      submitted: 0,
      manager_review: 0,
      hr_processing: 0,
      complete: 0,
    };
    for (const r of pipelineRowsFiltered) {
      const s = stageOf(r.status);
      if (s) counts[s] += 1;
    }
    return counts;
  }, [pipelineRowsFiltered]);

  useMutation(
    orpc.appraisals.workflow.submit.mutationOptions({
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
      ? Math.min(
          Math.round(
            scoredRows.reduce((sum, appraisal) => sum + (appraisal.totalScore ?? 0), 0) /
              scoredRows.length,
          ),
          100,
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

  function handleOpenAppraisal(id: string) {
    navigate({ to: "/appraisals/$appraisalId", params: { appraisalId: id } });
  }

  // Build year+half dropdown options from real cycles.
  const cycleOptions = useMemo(() => {
    // Sort by year desc, then h2 before h1 (most recent first).
    const sorted = [...cycles].sort((a, b) => {
      if (a.year !== b.year) return b.year - a.year;
      return a.half === b.half ? 0 : a.half === "h2" ? -1 : 1;
    });
    return sorted;
  }, [cycles]);

  return (
    <>
      <Header fixed>
        <div className="flex items-center gap-2">
          <ClipboardCheck className="size-4 text-muted-foreground" />
          <span className="text-sm text-muted-foreground">Performance</span>
          <span className="text-muted-foreground">/</span>
          <span className="text-sm font-medium">Appraisals</span>
        </div>
        <div className="ms-auto flex items-center gap-2">
          <ThemeSwitch />
        </div>
      </Header>

      <Main className="space-y-6">
        <PageHeader
          eyebrow="Performance"
          title="Appraisals"
          description="Manage the full appraisal lifecycle — from submission through HR processing to completion."
          actions={
            <>
              <Select value={cycleFilter} onValueChange={(v) => setCycleFilter(v ?? "all")}>
                <SelectTrigger className="h-8 w-[200px]">
                  <SelectValue>
                    {selectedCycle
                      ? `${selectedCycle.year} — ${selectedCycle.half === "h1" ? "First Half" : "Second Half"}`
                      : "All cycles"}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All cycles</SelectItem>
                  {cycleOptions.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.year} — {c.half === "h1" ? "First Half" : "Second Half"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button variant="outline" size="sm" onClick={() => navigate({ to: "/appraisals/inbox" })}>
                <Inbox className="mr-1.5 size-3.5" />
                Inbox
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => exportAppraisalsExcel(appraisals ?? [], `Appraisals_${new Date().toISOString().slice(0, 10)}.xlsx`)}
                disabled={!appraisals?.length}
              >
                <FileDown className="mr-1.5 size-3.5" />
                Export Excel
              </Button>
              <Button size="sm" onClick={() => setShowCreate(true)}>
                <Plus className="mr-1.5 size-3.5" />
                New Appraisal
              </Button>
            </>
          }
        />

        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex flex-wrap gap-2">
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

        {/* KPI summary tiles — cycle-aware appraisal metrics */}
        <AppraisalKpiStrip
          rows={rows}
          isLoading={appraisalsLoading}
          overdueFollowups={followupStats.overdue}
          cycleLabel={
            selectedCycle
              ? `${selectedCycle.year} ${selectedCycle.half === "h1" ? "First Half" : "Second Half"}`
              : "All cycles"
          }
        />

        {/* Pipeline stats strip — 5 stage buckets that match the Kanban columns */}
        <section className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          {pipelineLoading
            ? Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-20 rounded-xl" />
              ))
            : PIPELINE_COLUMNS.map((col) => {
                const Icon =
                  col.key === "draft"
                    ? FileText
                    : col.key === "submitted"
                      ? Send
                      : col.key === "manager_review"
                        ? UserCheck
                        : col.key === "hr_processing"
                          ? Building2
                          : CheckCircle2;
                return (
                  <button
                    key={col.key}
                    type="button"
                    onClick={() => setTab("pipeline")}
                    className="rounded-xl border bg-card p-4 text-left transition-colors hover:border-primary/60"
                  >
                    <div className="mb-2 flex items-center justify-between">
                      <Icon className={`size-4 ${col.iconColor}`} />
                      <span
                        className={`inline-flex min-w-[1.5rem] items-center justify-center rounded-md px-1.5 py-0.5 text-[10.5px] font-semibold ${col.badgeClass}`}
                      >
                        {stageCounts[col.key]}
                      </span>
                    </div>
                    <div className="text-[20px] font-bold tabular-nums leading-none">
                      {stageCounts[col.key]}
                    </div>
                    <div className="mt-0.5 text-[11px] text-muted-foreground">{col.label}</div>
                  </button>
                );
              })}
        </section>

        <Tabs value={tab} onValueChange={setTab} className="space-y-4">
          <TabsList variant="line" className="justify-start">
            <TabsTrigger value="pipeline">
              <GitPullRequest className="mr-1.5 size-3.5" />
              Pipeline
            </TabsTrigger>
            <TabsTrigger value="records">
              <List className="mr-1.5 size-3.5" />
              All
            </TabsTrigger>
            <TabsTrigger value="analytics">
              <LineChartIcon className="mr-1.5 size-3.5" />
              Analytics
            </TabsTrigger>
            <TabsTrigger value="tracker">
              <BarChart3 className="mr-1.5 size-3.5" />
              Tracker
            </TabsTrigger>
            <TabsTrigger value="followups">
              Follow-ups{followupStats.overdue > 0 ? ` (${followupStats.overdue} overdue)` : ""}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="pipeline">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Appraisal Pipeline</CardTitle>
              </CardHeader>
              <CardContent>
                <PipelineView
                  rows={pipelineRowsFiltered}
                  isLoading={pipelineLoading}
                  onOpen={handleOpenAppraisal}
                  onNew={() => setShowCreate(true)}
                />
              </CardContent>
            </Card>
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

          <TabsContent value="analytics">
            <AnalyticsView rows={rows} isLoading={appraisalsLoading} />
          </TabsContent>

          <TabsContent value="tracker">
            <div className="space-y-6">
              {/* Tracker totals row */}
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

              {/* Tracker KPI cards */}
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
            </div>
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
