import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import {
  ArrowLeft,
  ClipboardCheck,
  Plus,
  Trash2,
  CheckCircle2,
  XCircle,
  AlertCircle,
  ChevronRight,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@ndma-dcs-staff-portal/ui/components/button";
import { Textarea } from "@ndma-dcs-staff-portal/ui/components/textarea";
import { Input } from "@ndma-dcs-staff-portal/ui/components/input";
import { Label } from "@ndma-dcs-staff-portal/ui/components/label";
import { Skeleton } from "@ndma-dcs-staff-portal/ui/components/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@ndma-dcs-staff-portal/ui/components/dialog";
import { Header } from "@/components/layout/header";
import { Main } from "@/components/layout/main";
import { ThemeSwitch } from "@/components/theme-switch";
import { orpc } from "@/utils/orpc";
import { authClient } from "@/lib/auth-client";

export const Route = createFileRoute("/_authenticated/appraisals/$appraisalId")({
  component: AppraisalDetailPage,
});

// ─── Types ───────────────────────────────────────────────────────────────────

type RatingKey =
  | "organisational_skills"
  | "quality_of_work"
  | "dependability"
  | "communication_skills"
  | "cooperation"
  | "initiative"
  | "technical_skills"
  | "attendance_punctuality";

const RATING_CATEGORIES: { key: RatingKey; label: string }[] = [
  { key: "organisational_skills", label: "Organisational Skills" },
  { key: "quality_of_work", label: "Quality of Work" },
  { key: "dependability", label: "Dependability" },
  { key: "communication_skills", label: "Communication Skills" },
  { key: "cooperation", label: "Cooperation" },
  { key: "initiative", label: "Initiative" },
  { key: "technical_skills", label: "Technical Skills" },
  { key: "attendance_punctuality", label: "Attendance & Punctuality" },
];

type AppraisalStatus =
  | "draft"
  | "scheduled"
  | "in_progress"
  | "submitted"
  | "approved"
  | "rejected"
  | "completed"
  | "overdue";

// ─── Status badge ─────────────────────────────────────────────────────────────

const STATUS_STYLES: Record<AppraisalStatus, string> = {
  draft: "bg-muted text-muted-foreground",
  scheduled: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  in_progress: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  submitted: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  approved: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  rejected: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
  completed: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  overdue: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
};

function StatusBadge({ status }: { status: string }) {
  const cls = STATUS_STYLES[status as AppraisalStatus] ?? "bg-muted text-muted-foreground";
  return (
    <span className={`inline-flex items-center rounded-lg px-2.5 py-0.5 text-xs font-medium capitalize ${cls}`}>
      {status.replace("_", " ")}
    </span>
  );
}

// ─── Score progress bar ───────────────────────────────────────────────────────

function ScoreBar({ score }: { score: number | null | undefined }) {
  if (score === null || score === undefined) {
    return <span className="text-sm text-muted-foreground">No ratings entered yet.</span>;
  }
  const color =
    score >= 80
      ? "bg-blue-500"
      : score >= 60
        ? "bg-amber-500"
        : "bg-red-500";
  return (
    <div className="flex items-center gap-3">
      <div className="flex-1 h-2.5 rounded-full bg-muted overflow-hidden">
        <div
          className={`h-full rounded-full ${color} transition-all`}
          style={{ width: `${score}%` }}
        />
      </div>
      <span
        className={`text-sm font-semibold tabular-nums ${
          score >= 80
            ? "text-blue-600 dark:text-blue-400"
            : score >= 60
              ? "text-amber-600 dark:text-amber-400"
              : "text-red-600 dark:text-red-400"
        }`}
      >
        {score}%
      </span>
    </div>
  );
}

// ─── Dynamic list editor ──────────────────────────────────────────────────────

function DynamicList({
  label,
  items,
  onChange,
  readOnly,
  minItems,
}: {
  label: string;
  items: string[];
  onChange: (items: string[]) => void;
  readOnly: boolean;
  minItems?: number;
}) {
  function update(index: number, value: string) {
    const next = [...items];
    next[index] = value;
    onChange(next);
  }

  function addItem() {
    onChange([...items, ""]);
  }

  function removeItem(index: number) {
    onChange(items.filter((_, i) => i !== index));
  }

  return (
    <div className="space-y-2">
      <Label className="text-sm font-semibold">
        {label}
        {minItems && !readOnly && (
          <span className="ml-1 text-muted-foreground font-normal">(minimum {minItems})</span>
        )}
      </Label>
      {items.length === 0 && readOnly && (
        <p className="text-sm text-muted-foreground italic">None recorded.</p>
      )}
      {items.map((item, i) => (
        <div key={i} className="flex gap-2 items-start">
          <div className="flex-1">
            {readOnly ? (
              <div className="flex items-start gap-2 text-sm py-1">
                <ChevronRight className="size-4 shrink-0 mt-0.5 text-muted-foreground" />
                <span>{item || <span className="text-muted-foreground italic">Empty</span>}</span>
              </div>
            ) : (
              <Input
                value={item}
                onChange={(e) => update(i, e.target.value)}
                placeholder={`${label} ${i + 1}`}
              />
            )}
          </div>
          {!readOnly && (
            <Button
              variant="ghost"
              size="icon"
              className="size-9 shrink-0 text-muted-foreground hover:text-destructive"
              onClick={() => removeItem(i)}
              title="Remove"
            >
              <Trash2 className="size-4" />
            </Button>
          )}
        </div>
      ))}
      {!readOnly && (
        <Button variant="outline" size="sm" onClick={addItem} className="mt-1">
          <Plus className="size-4 mr-1.5" />
          Add {label.slice(0, -1)}
        </Button>
      )}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

function AppraisalDetailPage() {
  const { appraisalId } = Route.useParams();
  const queryClient = useQueryClient();
  const { data: session } = authClient.useSession();

  const userRole = (session?.user as Record<string, unknown> | undefined)?.role as string | undefined;
  const isManager = !!userRole && ["admin", "hrAdminOps", "manager"].includes(userRole);

  // Query
  const { data: appraisal, isLoading, isError } = useQuery(
    orpc.appraisals.get.queryOptions({ input: { id: appraisalId } })
  );

  // Local form state — seeded from appraisal when loaded
  const [ratings, setRatings] = useState<Partial<Record<RatingKey, number>>>({});
  const [ratingsSeeded, setRatingsSeeded] = useState(false);

  const [achievements, setAchievements] = useState<string[]>([]);
  const [goals, setGoals] = useState<string[]>([]);
  const [staffFeedback, setStaffFeedback] = useState("");
  const [supervisorComments, setSupervisorComments] = useState("");
  const [formSeeded, setFormSeeded] = useState(false);

  // Reject dialog state
  const [showRejectDialog, setShowRejectDialog] = useState(false);
  const [rejectReason, setRejectReason] = useState("");

  // Seed local state from fetched appraisal
  if (appraisal && !ratingsSeeded) {
    const matrix = appraisal.ratingMatrix as Record<string, number> | null | undefined;
    if (matrix) {
      const seeded: Partial<Record<RatingKey, number>> = {};
      for (const cat of RATING_CATEGORIES) {
        if (typeof matrix[cat.key] === "number") {
          seeded[cat.key] = matrix[cat.key] as number;
        }
      }
      setRatings(seeded);
    }
    setRatingsSeeded(true);
  }

  if (appraisal && !formSeeded) {
    setAchievements(
      Array.isArray(appraisal.achievements) ? (appraisal.achievements as string[]) : []
    );
    setGoals(Array.isArray(appraisal.goals) ? (appraisal.goals as string[]) : []);
    setStaffFeedback(appraisal.staffFeedback ?? "");
    setSupervisorComments(appraisal.supervisorComments ?? "");
    setFormSeeded(true);
  }

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: orpc.appraisals.get.key() });
    queryClient.invalidateQueries({ queryKey: orpc.appraisals.list.key() });
  }

  // Mutations
  const saveDraftMutation = useMutation(
    orpc.appraisals.update.mutationOptions({
      onSuccess: () => { invalidate(); toast.success("Draft saved."); },
      onError: (err) => toast.error(err.message ?? "Failed to save draft."),
    })
  );

  const saveRatingsMutation = useMutation(
    orpc.appraisals.setRatings.mutationOptions({
      onSuccess: () => { invalidate(); toast.success("Ratings saved."); },
      onError: (err) => toast.error(err.message ?? "Failed to save ratings."),
    })
  );

  const submitMutation = useMutation(
    orpc.appraisals.submit.mutationOptions({
      onSuccess: () => { invalidate(); toast.success("Appraisal submitted for approval."); },
      onError: (err) => toast.error(err.message ?? "Failed to submit appraisal."),
    })
  );

  const approveMutation = useMutation(
    orpc.appraisals.approve.mutationOptions({
      onSuccess: () => { invalidate(); toast.success("Appraisal approved."); },
      onError: (err) => toast.error(err.message ?? "Failed to approve appraisal."),
    })
  );

  const rejectMutation = useMutation(
    orpc.appraisals.reject.mutationOptions({
      onSuccess: () => {
        invalidate();
        setShowRejectDialog(false);
        setRejectReason("");
        toast.success("Appraisal rejected.");
      },
      onError: (err) => toast.error(err.message ?? "Failed to reject appraisal."),
    })
  );

  // ─── Handlers ───────────────────────────────────────────────────────────────

  function handleSaveDraft() {
    if (!appraisal) return;
    saveDraftMutation.mutate({
      id: appraisal.id,
      achievements,
      goals,
      staffFeedback: staffFeedback || undefined,
      supervisorComments: supervisorComments || undefined,
    });
  }

  function handleSaveRatings() {
    if (!appraisal) return;
    const allFilled = RATING_CATEGORIES.every((c) => typeof ratings[c.key] === "number");
    if (!allFilled) {
      toast.error("Please rate all 8 categories before saving ratings.");
      return;
    }
    saveRatingsMutation.mutate({
      id: appraisal.id,
      ratingMatrix: ratings as Record<RatingKey, number>,
      achievements,
      goals,
      staffFeedback: staffFeedback || undefined,
      supervisorComments: supervisorComments || undefined,
    });
  }

  function handleSubmit() {
    if (!appraisal) return;
    if (achievements.filter((a) => a.trim()).length < 3) {
      toast.error("Please add at least 3 achievements before submitting.");
      return;
    }
    if (goals.filter((g) => g.trim()).length < 3) {
      toast.error("Please add at least 3 goals before submitting.");
      return;
    }
    submitMutation.mutate({
      id: appraisal.id,
      staffFeedback: staffFeedback || undefined,
      supervisorComments: supervisorComments || undefined,
    });
  }

  function handleApprove() {
    if (!appraisal) return;
    approveMutation.mutate({ id: appraisal.id });
  }

  function handleReject() {
    if (!rejectReason.trim()) {
      toast.error("Please provide a rejection reason.");
      return;
    }
    if (!appraisal) return;
    rejectMutation.mutate({ id: appraisal.id, rejectionReason: rejectReason.trim() });
  }

  // ─── Derived state ───────────────────────────────────────────────────────────

  const status = appraisal?.status as AppraisalStatus | undefined;
  const isReadOnly =
    status === "approved" || status === "completed";
  const canEdit =
    status === "draft" || status === "in_progress" || status === "rejected";
  const canSubmit = canEdit;
  const canApproveReject = isManager && status === "submitted";

  // Live computed score from local ratings
  const ratingValues = RATING_CATEGORIES.map((c) => ratings[c.key]).filter(
    (v): v is number => typeof v === "number"
  );
  const localScore =
    ratingValues.length === 8
      ? Math.round((ratingValues.reduce((a, b) => a + b, 0) / (8 * 5)) * 100)
      : appraisal?.percentageScore ?? null;

  // ─── Render ──────────────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <>
        <Header fixed>
          <div className="flex items-center gap-2">
            <ClipboardCheck className="size-4 text-muted-foreground" />
            <span className="text-sm font-medium">Appraisal Detail</span>
          </div>
          <div className="ms-auto flex items-center gap-2">
            <ThemeSwitch />
          </div>
        </Header>
        <Main>
          <div className="max-w-4xl mx-auto space-y-6">
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
            <span className="text-sm font-medium">Appraisal Detail</span>
          </div>
          <div className="ms-auto flex items-center gap-2">
            <ThemeSwitch />
          </div>
        </Header>
        <Main>
          <div className="max-w-4xl mx-auto flex flex-col items-center gap-4 py-20 text-center">
            <AlertCircle className="size-10 text-destructive" />
            <p className="text-lg font-semibold">Appraisal not found</p>
            <p className="text-sm text-muted-foreground">
              This appraisal does not exist or you don't have permission to view it.
            </p>
            <Button variant="outline" onClick={() => window.history.back()}>
              <ArrowLeft className="size-4 mr-2" />
              Go Back
            </Button>
          </div>
        </Main>
      </>
    );
  }

  const staffName =
    (appraisal.staffProfile as { user?: { name?: string | null } | null } | null)?.user?.name ?? "—";
  const reviewerName =
    (appraisal.reviewer as { user?: { name?: string | null } | null } | null)?.user?.name ?? "—";
  const departmentName =
    (appraisal.staffProfile as { department?: { name: string } | null } | null)?.department?.name ?? "—";

  const periodLabel =
    appraisal.periodStart && appraisal.periodEnd
      ? `${format(parseISO(appraisal.periodStart), "d MMM yyyy")} – ${format(parseISO(appraisal.periodEnd), "d MMM yyyy")}`
      : "—";

  return (
    <>
      <Header fixed>
        <div className="flex items-center gap-2">
          <ClipboardCheck className="size-4 text-muted-foreground" />
          <span className="text-sm font-medium">Appraisal Detail</span>
        </div>
        <div className="ms-auto flex items-center gap-2">
          <ThemeSwitch />
        </div>
      </Header>

      <Main>
        <div className="max-w-4xl mx-auto space-y-8 pb-16">
          {/* Back link */}
          <div className="flex items-center gap-2">
            <Link
              to="/appraisals"
              className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowLeft className="size-4" />
              Back to Appraisals
            </Link>
          </div>

          {/* Banners */}
          {(status === "approved" || status === "completed") && (
            <div className="flex items-center gap-3 rounded-xl border border-blue-200 bg-blue-50 dark:bg-blue-900/20 p-4 text-blue-800 dark:text-blue-300">
              <CheckCircle2 className="size-5 shrink-0" />
              <div>
                <p className="font-semibold">Appraisal Approved</p>
                {appraisal.approvedAt && (
                  <p className="text-sm mt-0.5">
                    Approved on {format(new Date(appraisal.approvedAt), "d MMM yyyy")}
                  </p>
                )}
              </div>
            </div>
          )}

          {status === "rejected" && (
            <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 dark:bg-red-900/20 p-4 text-red-800 dark:text-red-300">
              <XCircle className="size-5 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold">Appraisal Rejected</p>
                {appraisal.rejectionReason && (
                  <p className="text-sm mt-1">
                    <span className="font-medium">Reason: </span>
                    {appraisal.rejectionReason}
                  </p>
                )}
                <p className="text-sm mt-1 text-red-700 dark:text-red-400">
                  You may revise and resubmit this appraisal.
                </p>
              </div>
            </div>
          )}

          {/* Header card */}
          <div className="rounded-xl border bg-card p-6 shadow-sm">
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
              <div>
                <h1 className="text-2xl font-bold tracking-tight">{staffName}</h1>
                <p className="text-sm text-muted-foreground mt-1">{departmentName}</p>
              </div>
              <StatusBadge status={appraisal.status} />
            </div>

            <div className="mt-6 grid grid-cols-2 sm:grid-cols-3 gap-x-8 gap-y-4 text-sm">
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground mb-0.5">
                  Reviewer / Supervisor
                </p>
                <p className="font-medium">{reviewerName}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground mb-0.5">
                  Period
                </p>
                <p className="font-medium">{periodLabel}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground mb-0.5">
                  Location
                </p>
                <p className="font-medium">{appraisal.location ?? "—"}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground mb-0.5">
                  Type of Review
                </p>
                <p className="font-medium">{appraisal.typeOfReview ?? "—"}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground mb-0.5">
                  Submitted
                </p>
                <p className="font-medium">
                  {appraisal.submittedAt
                    ? format(new Date(appraisal.submittedAt), "d MMM yyyy")
                    : "—"}
                </p>
              </div>
            </div>
          </div>

          {/* Ratings grid */}
          <div className="rounded-xl border bg-card shadow-sm">
            <div className="border-b px-6 py-4">
              <h2 className="font-semibold">Performance Ratings</h2>
              <p className="text-sm text-muted-foreground mt-0.5">
                Rate each category from 1 (Poor) to 5 (Excellent).
              </p>
            </div>
            <div className="px-6 py-4 space-y-0">
              {/* Column headers */}
              <div className="flex items-center gap-4 pb-2 text-xs text-muted-foreground font-medium border-b">
                <span className="flex-1">Category</span>
                <div className="flex gap-6 pr-1">
                  {[1, 2, 3, 4, 5].map((v) => (
                    <span key={v} className="w-6 text-center">{v}</span>
                  ))}
                </div>
              </div>

              {RATING_CATEGORIES.map((cat, i) => (
                <div
                  key={cat.key}
                  className={`flex items-center gap-4 py-3 ${
                    i < RATING_CATEGORIES.length - 1 ? "border-b border-border/50" : ""
                  }`}
                >
                  <span className="flex-1 text-sm">{cat.label}</span>
                  <div className="flex gap-6 pr-1">
                    {[1, 2, 3, 4, 5].map((v) => (
                      <label key={v} className="flex items-center justify-center w-6 cursor-pointer">
                        <input
                          type="radio"
                          name={cat.key}
                          value={v}
                          checked={ratings[cat.key] === v}
                          disabled={isReadOnly}
                          onChange={() => {
                            if (!isReadOnly) {
                              setRatings((prev) => ({ ...prev, [cat.key]: v }));
                            }
                          }}
                          className="size-4 accent-primary cursor-pointer disabled:cursor-default"
                        />
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {/* Score bar */}
            <div className="border-t px-6 py-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium">Overall Score</span>
              </div>
              <ScoreBar score={localScore} />
            </div>
          </div>

          {/* Achievements */}
          <div className="rounded-xl border bg-card shadow-sm px-6 py-5">
            <DynamicList
              label="Achievements"
              items={achievements}
              onChange={setAchievements}
              readOnly={isReadOnly}
              minItems={3}
            />
          </div>

          {/* Goals */}
          <div className="rounded-xl border bg-card shadow-sm px-6 py-5">
            <DynamicList
              label="Goals"
              items={goals}
              onChange={setGoals}
              readOnly={isReadOnly}
              minItems={3}
            />
          </div>

          {/* Staff Feedback */}
          <div className="rounded-xl border bg-card shadow-sm px-6 py-5 space-y-2">
            <Label htmlFor="staff-feedback" className="text-sm font-semibold">
              Staff Feedback
            </Label>
            {isReadOnly ? (
              <p className="text-sm whitespace-pre-wrap">
                {appraisal.staffFeedback || <span className="text-muted-foreground italic">None recorded.</span>}
              </p>
            ) : (
              <Textarea
                id="staff-feedback"
                rows={4}
                placeholder="Your feedback on the appraisal period…"
                value={staffFeedback}
                onChange={(e) => setStaffFeedback(e.target.value)}
              />
            )}
          </div>

          {/* Supervisor Comments */}
          <div className="rounded-xl border bg-card shadow-sm px-6 py-5 space-y-2">
            <Label htmlFor="supervisor-comments" className="text-sm font-semibold">
              Supervisor Comments
            </Label>
            {isReadOnly && !isManager ? (
              <p className="text-sm whitespace-pre-wrap">
                {appraisal.supervisorComments || <span className="text-muted-foreground italic">None recorded.</span>}
              </p>
            ) : (
              <Textarea
                id="supervisor-comments"
                rows={4}
                placeholder="Supervisor's comments on the appraisal…"
                value={supervisorComments}
                onChange={(e) => setSupervisorComments(e.target.value)}
                disabled={isReadOnly && !isManager}
              />
            )}
            {!isManager && !isReadOnly && (
              <p className="text-xs text-muted-foreground">
                This field is typically filled by the reviewer / supervisor.
              </p>
            )}
          </div>

          {/* Action buttons */}
          <div className="flex flex-wrap gap-3">
            {/* Draft / in-progress / rejected actions */}
            {canEdit && (
              <>
                <Button
                  variant="outline"
                  onClick={handleSaveDraft}
                  disabled={saveDraftMutation.isPending}
                >
                  {saveDraftMutation.isPending ? "Saving…" : "Save Draft"}
                </Button>
                <Button
                  variant="secondary"
                  onClick={handleSaveRatings}
                  disabled={saveRatingsMutation.isPending}
                >
                  {saveRatingsMutation.isPending ? "Saving…" : "Save Ratings"}
                </Button>
              </>
            )}
            {canSubmit && (
              <Button
                onClick={handleSubmit}
                disabled={submitMutation.isPending}
              >
                {submitMutation.isPending ? "Submitting…" : "Submit for Approval"}
              </Button>
            )}

            {/* Manager approve/reject actions */}
            {canApproveReject && (
              <>
                <Button
                  className="bg-blue-600 hover:bg-blue-700 text-white"
                  onClick={handleApprove}
                  disabled={approveMutation.isPending}
                >
                  <CheckCircle2 className="size-4 mr-2" />
                  {approveMutation.isPending ? "Approving…" : "Approve"}
                </Button>
                <Button
                  variant="destructive"
                  onClick={() => setShowRejectDialog(true)}
                >
                  <XCircle className="size-4 mr-2" />
                  Reject
                </Button>
              </>
            )}
          </div>
        </div>
      </Main>

      {/* Reject dialog */}
      <Dialog open={showRejectDialog} onOpenChange={(open) => !open && setShowRejectDialog(false)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Reject Appraisal</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <Label htmlFor="reject-reason">Reason for rejection</Label>
            <Textarea
              id="reject-reason"
              rows={4}
              placeholder="Explain why this appraisal is being rejected…"
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowRejectDialog(false)}
              disabled={rejectMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleReject}
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
