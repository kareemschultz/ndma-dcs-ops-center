import { useMemo, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import {
  AlertCircle,
  ArrowLeft,
  BarChart3,
  CheckCircle2,
  ClipboardCheck,
  FileDown,
  FileSpreadsheet,
  Plus,
  Send,
  Trash2,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@ndma-dcs-staff-portal/ui/components/button";
import { Input } from "@ndma-dcs-staff-portal/ui/components/input";
import { Label } from "@ndma-dcs-staff-portal/ui/components/label";
import { Skeleton } from "@ndma-dcs-staff-portal/ui/components/skeleton";
import { Textarea } from "@ndma-dcs-staff-portal/ui/components/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@ndma-dcs-staff-portal/ui/components/dialog";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@ndma-dcs-staff-portal/ui/components/tabs";

import { Header } from "@/components/layout/header";
import { Main } from "@/components/layout/main";
import { ThemeSwitch } from "@/components/theme-switch";
import { orpc } from "@/utils/orpc";
import { authClient } from "@/lib/auth-client";
import { exportOfficialAppraisalExcel } from "@/utils/excel-export";
import { exportOfficialAppraisalPDF } from "@/utils/pdf-export";

export const Route = createFileRoute("/_authenticated/appraisals/$appraisalId")({
  component: AppraisalEditPage,
});

// ─── Official form structure ──────────────────────────────────────────────────

type CategoryKey =
  | "organisational_skills"
  | "quality_of_work"
  | "dependability"
  | "communication_skills"
  | "cooperation"
  | "initiative"
  | "technical_skills"
  | "attendance_punctuality";

const CATEGORIES: { key: CategoryKey; label: string; question: string }[] = [
  {
    key: "organisational_skills",
    label: "Organisational Skills",
    question: "How well does the employee organise his/her work?",
  },
  {
    key: "quality_of_work",
    label: "Quality of Work",
    question:
      "Does the employee produce effective work of a professional quality in a timely fashion?",
  },
  {
    key: "dependability",
    label: "Dependability",
    question: "How dependable is this employee?",
  },
  {
    key: "communication_skills",
    label: "Communication Skills",
    question:
      "How well does the employee communicate with others in and outside the organisation?",
  },
  {
    key: "cooperation",
    label: "Cooperation",
    question:
      "How well does the employee assist, motivate and cooperate with team workers?",
  },
  {
    key: "initiative",
    label: "Initiative",
    question:
      "How well does the employee take action to accomplish programme goals and objectives?",
  },
  {
    key: "technical_skills",
    label: "Problem Solving",
    question: "How well does the employee identify and solve problems?",
  },
  {
    key: "attendance_punctuality",
    label: "Overall Professionalism",
    question: "To what extent does the employee exhibit overall professionalism?",
  },
];

const RATING_LABELS: Record<number, string> = {
  5: "Excellent",
  4: "Good",
  3: "Acceptable",
  2: "Needs Improvement",
  1: "Unsatisfactory",
};

const INCREMENT_TABLE = [
  { lo: 0, hi: 60, inc: 1 },
  { lo: 61, hi: 70, inc: 2 },
  { lo: 71, hi: 80, inc: 3 },
  { lo: 81, hi: 90, inc: 4 },
  { lo: 91, hi: 100, inc: 5 },
];

function getIncrement(pct: number): number {
  return INCREMENT_TABLE.find(({ hi }) => pct <= hi)?.inc ?? 5;
}

type AppraisalStatus =
  | "draft"
  | "in_progress"
  | "submitted"
  | "approved"
  | "rejected"
  | "completed"
  | "overdue";

const STATUS_STYLES: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  in_progress: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  submitted: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  approved: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  completed: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  rejected: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
  overdue: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
};

function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`inline-flex items-center rounded-lg px-2.5 py-0.5 text-xs font-medium capitalize ${
        STATUS_STYLES[status] ?? "bg-muted text-muted-foreground"
      }`}
    >
      {status.replace(/_/g, " ")}
    </span>
  );
}

// ─── 5-button rating selector (Excellent…Unsatisfactory) ────────────────────────

function RatingSelector({
  value,
  onChange,
  disabled,
}: {
  value: number;
  onChange: (v: number) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {[5, 4, 3, 2, 1].map((n) => {
        const active = value === n;
        return (
          <button
            key={n}
            type="button"
            disabled={disabled}
            onClick={() => onChange(active ? 0 : n)}
            className={`rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition-colors
              ${
                active
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-input bg-card text-muted-foreground hover:border-primary hover:text-primary"
              }
              ${disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer"}`}
          >
            <span className="tabular-nums">{n}</span>
            <span className="ml-1 hidden sm:inline">{RATING_LABELS[n]}</span>
          </button>
        );
      })}
    </div>
  );
}

// ─── Section card shell ─────────────────────────────────────────────────────────

function SectionCard({
  title,
  description,
  badge,
  children,
}: {
  title: string;
  description?: string;
  badge?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border bg-card shadow-sm">
      <div className="flex items-center justify-between gap-4 border-b px-6 py-4">
        <div>
          <h2 className="font-semibold">{title}</h2>
          {description && (
            <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>
          )}
        </div>
        {badge}
      </div>
      <div className="px-6 py-5">{children}</div>
    </div>
  );
}

// ─── Form state ─────────────────────────────────────────────────────────────────

type Responsibility = { title: string; rating: number };
type Goal = { goal: string; indicator: string };

function AppraisalEditPage() {
  const { appraisalId } = Route.useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: session } = authClient.useSession();
  const userRole = (session?.user as Record<string, unknown> | undefined)
    ?.role as string | undefined;
  const isManager =
    !!userRole && ["admin", "hrAdminOps", "manager"].includes(userRole);

  const { data: appraisal, isLoading, isError } = useQuery(
    orpc.appraisals.getDetail.queryOptions({ input: { id: appraisalId } }),
  );

  // ── Form state ──
  const [seeded, setSeeded] = useState(false);
  const [ratings, setRatings] = useState<Record<CategoryKey, number>>({
    organisational_skills: 0,
    quality_of_work: 0,
    dependability: 0,
    communication_skills: 0,
    cooperation: 0,
    initiative: 0,
    technical_skills: 0,
    attendance_punctuality: 0,
  });
  const [categoryComments, setCategoryComments] = useState<
    Record<string, string>
  >({});
  const [responsibilities, setResponsibilities] = useState<Responsibility[]>([
    { title: "", rating: 0 },
    { title: "", rating: 0 },
    { title: "", rating: 0 },
    { title: "", rating: 0 },
    { title: "", rating: 0 },
  ]);
  const [respComment, setRespComment] = useState("");
  const [areasOfStrength, setAreasOfStrength] = useState("");
  const [improvementsMade, setImprovementsMade] = useState("");
  const [areasForDevelopment, setAreasForDevelopment] = useState("");
  const [developmentActions, setDevelopmentActions] = useState("");
  const [achievements, setAchievements] = useState<string[]>(["", "", ""]);
  const [goals, setGoals] = useState<Goal[]>([
    { goal: "", indicator: "" },
    { goal: "", indicator: "" },
    { goal: "", indicator: "" },
  ]);
  const [location, setLocation] = useState("");
  const [typeOfReview, setTypeOfReview] = useState("");
  const [tab, setTab] = useState("categories");
  const [showReject, setShowReject] = useState(false);
  const [rejectReason, setRejectReason] = useState("");

  // ── Seed once from server data ──
  if (appraisal && !seeded) {
    const matrix = appraisal.ratingMatrix as Record<string, number> | null;
    if (matrix) {
      setRatings((prev) => {
        const next = { ...prev };
        for (const cat of CATEGORIES) {
          if (typeof matrix[cat.key] === "number") next[cat.key] = matrix[cat.key];
        }
        return next;
      });
    }
    const cc = appraisal.categoryComments as Record<string, string> | null;
    if (cc) setCategoryComments(cc);

    const objectives = appraisal.objectives as
      | { title: string; rating?: number }[]
      | null;
    if (objectives && objectives.length > 0) {
      const seededResp: Responsibility[] = objectives.map((o) => ({
        title: o.title ?? "",
        rating: o.rating ?? 0,
      }));
      while (seededResp.length < 5) seededResp.push({ title: "", rating: 0 });
      setResponsibilities(seededResp.slice(0, 5));
    }
    setRespComment(appraisal.responsibilitiesComment ?? "");
    setAreasOfStrength(appraisal.areasOfStrength ?? "");
    setImprovementsMade(appraisal.improvementsMade ?? "");
    setAreasForDevelopment(appraisal.areasForDevelopment ?? "");
    setDevelopmentActions(appraisal.developmentActions ?? "");

    // getDetail overrides achievements/goals with sub-table rows ({ text }).
    const achRows = appraisal.achievements as
      | Array<{ text: string }>
      | string[]
      | null;
    const ach = (achRows ?? []).map((a) => (typeof a === "string" ? a : a.text));
    if (ach.length > 0) {
      setAchievements(ach.length >= 3 ? ach : [...ach, ...Array(3 - ach.length).fill("")]);
    }
    const goalRows = appraisal.goals as
      | Array<{ text: string }>
      | string[]
      | null;
    const goalArr = (goalRows ?? []).map((g) =>
      typeof g === "string" ? g : g.text,
    );
    const indicators = appraisal.goalIndicators as string[] | null;
    if (goalArr.length > 0) {
      const seededGoals: Goal[] = goalArr.map((g, i) => ({
        goal: g,
        indicator: indicators?.[i] ?? "",
      }));
      while (seededGoals.length < 3) seededGoals.push({ goal: "", indicator: "" });
      setGoals(seededGoals);
    }
    setLocation(appraisal.location ?? "");
    setTypeOfReview(appraisal.typeOfReview ?? "Biannually");
    setSeeded(true);
  }

  // ── Derived score ──
  const categoryTotal = useMemo(
    () => CATEGORIES.reduce((sum, c) => sum + (ratings[c.key] ?? 0), 0),
    [ratings],
  );
  const respTotal = useMemo(
    () => responsibilities.reduce((sum, r) => sum + r.rating, 0),
    [responsibilities],
  );
  const rawTotal = categoryTotal + respTotal;
  const percentage = Math.round((rawTotal / 65) * 100);
  const increment = getIncrement(percentage);

  // ── Mutations ──
  function invalidate() {
    queryClient.invalidateQueries({ queryKey: orpc.appraisals.getDetail.key() });
    queryClient.invalidateQueries({ queryKey: orpc.appraisals.list.key() });
    queryClient.invalidateQueries({ queryKey: orpc.appraisals.workflow.list.key() });
  }

  const saveMutation = useMutation(
    orpc.appraisals.setOfficialForm.mutationOptions({
      onSuccess: () => {
        invalidate();
        toast.success("Appraisal saved.");
      },
      onError: (e: Error) => toast.error(e.message ?? "Failed to save appraisal."),
    }),
  );
  const submitMutation = useMutation(
    orpc.appraisals.submit.mutationOptions({
      onSuccess: () => {
        invalidate();
        toast.success("Appraisal submitted for approval.");
      },
      onError: (e: Error) => toast.error(e.message ?? "Failed to submit."),
    }),
  );
  const approveMutation = useMutation(
    orpc.appraisals.approve.mutationOptions({
      onSuccess: () => {
        invalidate();
        toast.success("Appraisal approved.");
      },
      onError: (e: Error) => toast.error(e.message ?? "Failed to approve."),
    }),
  );
  const rejectMutation = useMutation(
    orpc.appraisals.reject.mutationOptions({
      onSuccess: () => {
        invalidate();
        setShowReject(false);
        setRejectReason("");
        toast.success("Appraisal rejected.");
      },
      onError: (e: Error) => toast.error(e.message ?? "Failed to reject."),
    }),
  );

  // ── Status / permissions ──
  const status = appraisal?.status as AppraisalStatus | undefined;
  const isReadOnly = status === "approved" || status === "completed";
  const canEdit =
    status === "draft" || status === "in_progress" || status === "rejected";
  const canApproveReject = isManager && status === "submitted";

  // ── Save handler ──
  function buildPayload() {
    return {
      id: appraisalId,
      location: location || undefined,
      typeOfReview: typeOfReview || undefined,
      ratingMatrix: ratings,
      categoryComments,
      responsibilities: responsibilities.map((r, i) => ({
        seq: i + 1,
        title: r.title.trim(),
        rating: r.rating,
      })),
      responsibilitiesComment: respComment || undefined,
      areasOfStrength: areasOfStrength || undefined,
      improvementsMade: improvementsMade || undefined,
      areasForDevelopment: areasForDevelopment || undefined,
      developmentActions: developmentActions || undefined,
      achievements: achievements.map((a) => a.trim()),
      goals: goals.map((g) => ({
        goal: g.goal.trim(),
        indicator: g.indicator.trim(),
      })),
    };
  }

  function handleSave() {
    saveMutation.mutate(buildPayload());
  }

  function handleSubmit() {
    if (achievements.filter((a) => a.trim()).length < 3) {
      toast.error("List at least 3 achievements before submitting.");
      return;
    }
    if (goals.filter((g) => g.goal.trim()).length < 3) {
      toast.error("List at least 3 goals before submitting.");
      return;
    }
    // Save first, then submit.
    saveMutation.mutate(buildPayload(), {
      onSuccess: () => submitMutation.mutate({ id: appraisalId }),
    });
  }

  // ── Exports ──
  function officialData() {
    return {
      employeeName: staffName,
      jobTitle: designation,
      supervisor: reviewerName,
      department: departmentName,
      location,
      typeOfReview,
      periodStart: appraisal?.periodStart ?? "",
      periodEnd: appraisal?.periodEnd ?? "",
      status: appraisal?.status ?? "",
      ratingMatrix: ratings,
      categoryComments,
      responsibilities: responsibilities.filter((r) => r.title.trim()),
      responsibilitiesComment: respComment,
      areasOfStrength,
      improvementsMade,
      areasForDevelopment,
      developmentActions,
      achievements: achievements.filter((a) => a.trim()),
      goals: goals.filter((g) => g.goal.trim()),
    };
  }

  // ── Loading / error states ──
  if (isLoading) {
    return (
      <>
        <Header fixed>
          <div className="flex items-center gap-2">
            <ClipboardCheck className="size-4 text-muted-foreground" />
            <span className="text-sm font-medium">Appraisal</span>
          </div>
          <div className="ms-auto">
            <ThemeSwitch />
          </div>
        </Header>
        <Main>
          <div className="mx-auto max-w-5xl space-y-6">
            <Skeleton className="h-8 w-64" />
            <Skeleton className="h-48 w-full" />
            <Skeleton className="h-64 w-full" />
          </div>
        </Main>
      </>
    );
  }

  if (isError || !appraisal) {
    return (
      <>
        <Header fixed>
          <div className="flex items-center gap-2">
            <ClipboardCheck className="size-4 text-muted-foreground" />
            <span className="text-sm font-medium">Appraisal</span>
          </div>
          <div className="ms-auto">
            <ThemeSwitch />
          </div>
        </Header>
        <Main>
          <div className="mx-auto flex max-w-5xl flex-col items-center gap-4 py-20 text-center">
            <AlertCircle className="size-10 text-destructive" />
            <p className="text-lg font-semibold">Appraisal not found</p>
            <Button variant="outline" onClick={() => navigate({ to: "/appraisals" })}>
              <ArrowLeft className="mr-2 size-4" />
              Back to Appraisals
            </Button>
          </div>
        </Main>
      </>
    );
  }

  const staffName =
    (appraisal.staffProfile as { user?: { name?: string | null } | null } | null)
      ?.user?.name ?? "—";
  const reviewerName =
    (appraisal.reviewer as { user?: { name?: string | null } | null } | null)
      ?.user?.name ?? "—";
  const departmentName =
    (appraisal.staffProfile as { department?: { name: string } | null } | null)
      ?.department?.name ?? "—";
  const designation =
    (appraisal.staffProfile as { jobTitle?: string | null } | null)?.jobTitle ??
    "—";
  const periodLabel =
    appraisal.periodStart && appraisal.periodEnd
      ? `${format(parseISO(appraisal.periodStart), "d MMM yyyy")} – ${format(parseISO(appraisal.periodEnd), "d MMM yyyy")}`
      : "—";

  return (
    <>
      <Header fixed>
        <div className="flex items-center gap-2">
          <ClipboardCheck className="size-4 text-muted-foreground" />
          <span className="text-sm text-muted-foreground">Appraisals</span>
          <span className="text-muted-foreground">/</span>
          <span className="text-sm font-medium">{staffName}</span>
        </div>
        <div className="ms-auto flex items-center gap-2">
          <div className="mr-1 hidden items-center gap-4 px-3 md:flex">
            <div className="text-right">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Score
              </div>
              <div
                className={`text-sm font-bold tabular-nums ${
                  percentage >= 81
                    ? "text-blue-700 dark:text-blue-400"
                    : percentage >= 61
                      ? "text-amber-600 dark:text-amber-400"
                      : "text-red-600 dark:text-red-400"
                }`}
              >
                {rawTotal}/65{" "}
                <span className="text-xs font-normal text-muted-foreground">
                  ({percentage}%)
                </span>
              </div>
            </div>
            <div className="text-right">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Increment
              </div>
              <div className="text-sm font-bold text-blue-700 dark:text-blue-400">
                {increment}%
              </div>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              navigate({
                to: "/appraisals/$appraisalId/report",
                params: { appraisalId },
              })
            }
          >
            <BarChart3 className="mr-1.5 size-4" />
            Report
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              exportOfficialAppraisalExcel(
                officialData(),
                `Appraisal_${staffName.replace(/\s+/g, "_")}.xlsx`,
              )
            }
          >
            <FileSpreadsheet className="mr-1.5 size-4" />
            Excel
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              exportOfficialAppraisalPDF(
                officialData(),
                `Appraisal_${staffName.replace(/\s+/g, "_")}.pdf`,
              )
            }
          >
            <FileDown className="mr-1.5 size-4" />
            PDF
          </Button>
          <ThemeSwitch />
        </div>
      </Header>

      <Main>
        <div className="mx-auto max-w-5xl space-y-6 pb-20">
          <div className="flex items-center gap-3">
            <Link
              to="/appraisals"
              className="flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              <ArrowLeft className="size-4" />
              Back to Appraisals
            </Link>
            <StatusBadge status={appraisal.status} />
          </div>

          {/* Approved / rejected banners */}
          {isReadOnly && (
            <div className="flex items-center gap-3 rounded-xl border border-blue-200 bg-blue-50 p-4 text-blue-800 dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-300">
              <CheckCircle2 className="size-5 shrink-0" />
              <div>
                <p className="font-semibold">Appraisal {appraisal.status}</p>
                {appraisal.approvedAt && (
                  <p className="mt-0.5 text-sm">
                    Approved on{" "}
                    {format(new Date(appraisal.approvedAt), "d MMM yyyy")} — this
                    record is locked.
                  </p>
                )}
              </div>
            </div>
          )}
          {status === "rejected" && (
            <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-red-800 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">
              <XCircle className="mt-0.5 size-5 shrink-0" />
              <div>
                <p className="font-semibold">Appraisal Rejected</p>
                {appraisal.rejectionReason && (
                  <p className="mt-1 text-sm">
                    <span className="font-medium">Reason: </span>
                    {appraisal.rejectionReason}
                  </p>
                )}
                <p className="mt-1 text-sm">You may revise and resubmit.</p>
              </div>
            </div>
          )}

          {/* Employee info strip */}
          <SectionCard
            title="Employee Information"
            description="Auto-populated from the staff profile."
          >
            <div className="grid grid-cols-2 gap-x-8 gap-y-4 text-sm sm:grid-cols-3">
              <Field label="Employee Name" value={staffName} />
              <Field label="Job Title" value={designation} />
              <Field label="Department" value={departmentName} />
              <Field label="Supervisor" value={reviewerName} />
              <Field label="Evaluation Period" value={periodLabel} />
              <div className="space-y-1.5">
                <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                  Location
                </Label>
                <Input
                  value={location}
                  disabled={isReadOnly}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder="e.g. 155 Crown Street, Queenstown"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                  Type of Review
                </Label>
                <Input
                  value={typeOfReview}
                  disabled={isReadOnly}
                  onChange={(e) => setTypeOfReview(e.target.value)}
                  placeholder="Biannually"
                />
              </div>
            </div>
          </SectionCard>

          <Tabs value={tab} onValueChange={setTab}>
            <TabsList variant="line" className="justify-start">
              <TabsTrigger value="categories">Rating Categories</TabsTrigger>
              <TabsTrigger value="responsibilities">
                Core Responsibilities
              </TabsTrigger>
              <TabsTrigger value="development">Summary &amp; Development</TabsTrigger>
              <TabsTrigger value="goals">Achievements &amp; Goals</TabsTrigger>
              <TabsTrigger value="score">Score</TabsTrigger>
            </TabsList>

            {/* ── Rating categories ─────────────────────────────────────────── */}
            <TabsContent value="categories" className="space-y-6 pt-2">
              <SectionCard
                title="Performance Rating Categories"
                description="Rate each category 1 (Unsatisfactory) → 5 (Excellent). Add a comment per category."
                badge={
                  <span className="rounded-lg border bg-muted/40 px-3 py-1 text-sm font-semibold tabular-nums">
                    {categoryTotal} / 40
                  </span>
                }
              >
                <div className="space-y-5">
                  {CATEGORIES.map((cat) => (
                    <div
                      key={cat.key}
                      className="space-y-2 border-b border-border/50 pb-5 last:border-0 last:pb-0"
                    >
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold">{cat.label}</p>
                          <p className="text-xs text-muted-foreground">
                            {cat.question}
                          </p>
                        </div>
                        <RatingSelector
                          value={ratings[cat.key]}
                          onChange={(v) =>
                            setRatings((p) => ({ ...p, [cat.key]: v }))
                          }
                          disabled={isReadOnly}
                        />
                      </div>
                      <Textarea
                        rows={2}
                        className="text-sm"
                        placeholder={`Comments on ${cat.label.toLowerCase()}…`}
                        value={categoryComments[cat.key] ?? ""}
                        disabled={isReadOnly}
                        onChange={(e) =>
                          setCategoryComments((p) => ({
                            ...p,
                            [cat.key]: e.target.value,
                          }))
                        }
                      />
                    </div>
                  ))}
                </div>
              </SectionCard>
            </TabsContent>

            {/* ── Core responsibilities ─────────────────────────────────────── */}
            <TabsContent value="responsibilities" className="space-y-6 pt-2">
              <SectionCard
                title="Core Responsibilities"
                description="The five most important responsibilities from the job description, each rated 1–5."
                badge={
                  <span className="rounded-lg border bg-muted/40 px-3 py-1 text-sm font-semibold tabular-nums">
                    {respTotal} / 25
                  </span>
                }
              >
                <div className="space-y-3">
                  {responsibilities.map((r, i) => (
                    <div
                      key={i}
                      className="flex flex-col gap-3 rounded-lg border bg-card p-3 sm:flex-row sm:items-center"
                    >
                      <span className="text-xs font-semibold text-muted-foreground sm:w-5">
                        {i + 1}.
                      </span>
                      <Input
                        className="flex-1"
                        placeholder={`Responsibility ${i + 1}…`}
                        value={r.title}
                        disabled={isReadOnly}
                        onChange={(e) =>
                          setResponsibilities((prev) =>
                            prev.map((x, j) =>
                              j === i ? { ...x, title: e.target.value } : x,
                            ),
                          )
                        }
                      />
                      <RatingSelector
                        value={r.rating}
                        onChange={(v) =>
                          setResponsibilities((prev) =>
                            prev.map((x, j) =>
                              j === i ? { ...x, rating: v } : x,
                            ),
                          )
                        }
                        disabled={isReadOnly}
                      />
                    </div>
                  ))}
                </div>
                <div className="mt-4 space-y-1.5">
                  <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                    Comments on Core Responsibilities
                  </Label>
                  <Textarea
                    rows={3}
                    value={respComment}
                    disabled={isReadOnly}
                    onChange={(e) => setRespComment(e.target.value)}
                    placeholder="Overall comments on the employee's delivery of core responsibilities…"
                  />
                </div>
              </SectionCard>
            </TabsContent>

            {/* ── Summary & development ─────────────────────────────────────── */}
            <TabsContent value="development" className="space-y-6 pt-2">
              <SectionCard
                title="Summary & Development"
                description="Summarise strengths, improvements and development planning."
              >
                <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                  <DevField
                    label="Areas of Strength"
                    value={areasOfStrength}
                    onChange={setAreasOfStrength}
                    disabled={isReadOnly}
                  />
                  <DevField
                    label="Improvements Made Over the Past Year"
                    value={improvementsMade}
                    onChange={setImprovementsMade}
                    disabled={isReadOnly}
                  />
                  <DevField
                    label="Areas for Development"
                    value={areasForDevelopment}
                    onChange={setAreasForDevelopment}
                    disabled={isReadOnly}
                  />
                  <DevField
                    label="Actions Planned to Address Development"
                    value={developmentActions}
                    onChange={setDevelopmentActions}
                    disabled={isReadOnly}
                  />
                </div>
              </SectionCard>
            </TabsContent>

            {/* ── Achievements & goals ──────────────────────────────────────── */}
            <TabsContent value="goals" className="space-y-6 pt-2">
              <SectionCard
                title="Key Achievements"
                description="List the employee's most important achievements this period (minimum 3, up to 5)."
              >
                <div className="space-y-2">
                  {achievements.map((a, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <span className="w-5 text-xs font-semibold text-muted-foreground">
                        {i + 1}.
                      </span>
                      <Input
                        className="flex-1"
                        placeholder={`Achievement ${i + 1}…`}
                        value={a}
                        disabled={isReadOnly}
                        onChange={(e) =>
                          setAchievements((prev) =>
                            prev.map((x, j) => (j === i ? e.target.value : x)),
                          )
                        }
                      />
                      {!isReadOnly && achievements.length > 3 && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-9 text-muted-foreground hover:text-destructive"
                          onClick={() =>
                            setAchievements((prev) =>
                              prev.filter((_, j) => j !== i),
                            )
                          }
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      )}
                    </div>
                  ))}
                  {!isReadOnly && achievements.length < 5 && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-1"
                      onClick={() => setAchievements((p) => [...p, ""])}
                    >
                      <Plus className="mr-1.5 size-4" />
                      Add Achievement
                    </Button>
                  )}
                </div>
              </SectionCard>

              <SectionCard
                title="Goals for Next Period"
                description="Each goal pairs with the measure/standard used to evaluate it (minimum 3, up to 5)."
              >
                <div className="space-y-3">
                  {goals.map((g, i) => (
                    <div
                      key={i}
                      className="rounded-lg border bg-card p-3"
                    >
                      <div className="mb-2 flex items-center justify-between">
                        <span className="text-xs font-semibold text-muted-foreground">
                          Goal {i + 1}
                        </span>
                        {!isReadOnly && goals.length > 3 && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-7 text-muted-foreground hover:text-destructive"
                            onClick={() =>
                              setGoals((prev) => prev.filter((_, j) => j !== i))
                            }
                          >
                            <Trash2 className="size-4" />
                          </Button>
                        )}
                      </div>
                      <div className="grid gap-2 sm:grid-cols-2">
                        <Input
                          placeholder="Goal to be accomplished…"
                          value={g.goal}
                          disabled={isReadOnly}
                          onChange={(e) =>
                            setGoals((prev) =>
                              prev.map((x, j) =>
                                j === i ? { ...x, goal: e.target.value } : x,
                              ),
                            )
                          }
                        />
                        <Input
                          placeholder="Performance indicator…"
                          value={g.indicator}
                          disabled={isReadOnly}
                          onChange={(e) =>
                            setGoals((prev) =>
                              prev.map((x, j) =>
                                j === i
                                  ? { ...x, indicator: e.target.value }
                                  : x,
                              ),
                            )
                          }
                        />
                      </div>
                    </div>
                  ))}
                  {!isReadOnly && goals.length < 5 && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        setGoals((p) => [...p, { goal: "", indicator: "" }])
                      }
                    >
                      <Plus className="mr-1.5 size-4" />
                      Add Goal
                    </Button>
                  )}
                </div>
              </SectionCard>
            </TabsContent>

            {/* ── Score ─────────────────────────────────────────────────────── */}
            <TabsContent value="score" className="space-y-6 pt-2">
              <SectionCard
                title="Score Summary"
                description="Auto-calculated — updates live as ratings change."
              >
                <div className="overflow-hidden rounded-xl border">
                  {[
                    {
                      label: "General Performance (8 categories × 5)",
                      val: categoryTotal,
                      max: 40,
                    },
                    {
                      label: "Core Responsibilities (5 × 5)",
                      val: respTotal,
                      max: 25,
                    },
                  ].map((row) => (
                    <div
                      key={row.label}
                      className="flex items-center justify-between border-b border-border/60 px-4 py-3"
                    >
                      <span className="text-sm">{row.label}</span>
                      <div className="flex items-center gap-3">
                        <div className="h-1.5 w-32 overflow-hidden rounded-full bg-muted">
                          <div
                            className="h-full rounded-full bg-blue-500"
                            style={{ width: `${(row.val / row.max) * 100}%` }}
                          />
                        </div>
                        <span className="w-16 text-right text-sm font-semibold tabular-nums">
                          {row.val} / {row.max}
                        </span>
                      </div>
                    </div>
                  ))}
                  <div className="flex items-center justify-between border-b bg-muted/40 px-4 py-3.5 font-semibold">
                    <span>Total Score</span>
                    <span className="tabular-nums">{rawTotal} / 65</span>
                  </div>
                  <div className="flex items-center justify-between border-b border-border/60 px-4 py-3">
                    <span className="text-sm">Percentage</span>
                    <span className="text-lg font-bold tabular-nums text-blue-700 dark:text-blue-400">
                      {percentage}%
                    </span>
                  </div>
                  <div className="flex items-center justify-between px-4 py-3">
                    <span className="text-sm">Salary Increment</span>
                    <span className="inline-flex items-center rounded-lg bg-blue-100 px-2.5 py-0.5 text-xs font-semibold text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">
                      {increment}%
                    </span>
                  </div>
                </div>

                <div className="mt-4">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Increment Table
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {INCREMENT_TABLE.map((row) => {
                      const active =
                        percentage >= row.lo && percentage <= row.hi;
                      return (
                        <span
                          key={row.inc}
                          className={`inline-flex items-center rounded-lg border px-3 py-1.5 text-xs font-semibold tabular-nums ${
                            active
                              ? "border-blue-600 bg-blue-600 text-white"
                              : "border-input bg-card text-muted-foreground"
                          }`}
                        >
                          {row.lo === 0 ? `≤${row.hi}` : `${row.lo}–${row.hi}`}% →{" "}
                          {row.inc}%
                        </span>
                      );
                    })}
                  </div>
                </div>
              </SectionCard>
            </TabsContent>
          </Tabs>

          {/* ── Sticky action bar ──────────────────────────────────────────── */}
          <div className="sticky bottom-0 -mx-2 flex flex-wrap gap-3 border-t bg-background/95 px-2 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/60">
            {canEdit && (
              <>
                <Button
                  variant="outline"
                  onClick={handleSave}
                  disabled={saveMutation.isPending}
                >
                  {saveMutation.isPending ? "Saving…" : "Save Draft"}
                </Button>
                <Button
                  onClick={handleSubmit}
                  disabled={saveMutation.isPending || submitMutation.isPending}
                >
                  <Send className="mr-2 size-4" />
                  {submitMutation.isPending ? "Submitting…" : "Save & Submit"}
                </Button>
              </>
            )}
            {canApproveReject && (
              <>
                <Button
                  className="bg-blue-600 text-white hover:bg-blue-700"
                  onClick={() => approveMutation.mutate({ id: appraisalId })}
                  disabled={approveMutation.isPending}
                >
                  <CheckCircle2 className="mr-2 size-4" />
                  {approveMutation.isPending ? "Approving…" : "Approve"}
                </Button>
                <Button
                  variant="destructive"
                  onClick={() => setShowReject(true)}
                >
                  <XCircle className="mr-2 size-4" />
                  Reject
                </Button>
              </>
            )}
          </div>
        </div>
      </Main>

      <Dialog
        open={showReject}
        onOpenChange={(o) => !o && setShowReject(false)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Reject Appraisal</DialogTitle>
            <DialogDescription>
              The staff member will be notified and can revise and resubmit.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label htmlFor="reject-reason">Reason for rejection</Label>
            <Textarea
              id="reject-reason"
              rows={4}
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="Explain why this appraisal is being rejected…"
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowReject(false)}
              disabled={rejectMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (!rejectReason.trim()) {
                  toast.error("Please provide a rejection reason.");
                  return;
                }
                rejectMutation.mutate({
                  id: appraisalId,
                  rejectionReason: rejectReason.trim(),
                });
              }}
              disabled={rejectMutation.isPending || !rejectReason.trim()}
            >
              {rejectMutation.isPending ? "Rejecting…" : "Confirm Rejection"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="mb-0.5 text-xs uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="font-medium">{value}</p>
    </div>
  );
}

function DevField({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </Label>
      <Textarea
        rows={4}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        placeholder={`${label}…`}
      />
    </div>
  );
}
