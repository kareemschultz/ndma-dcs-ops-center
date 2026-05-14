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
  FileDown,
  FileSpreadsheet,
  Send,
  Eraser,
  PenLine,
} from "lucide-react";
import { exportAppraisalPDF } from "@/utils/pdf-export";
import * as XLSX from "xlsx";
import { toast } from "sonner";
import { Button } from "@ndma-dcs-staff-portal/ui/components/button";
import { Textarea } from "@ndma-dcs-staff-portal/ui/components/textarea";
import { Input } from "@ndma-dcs-staff-portal/ui/components/input";
import { Label } from "@ndma-dcs-staff-portal/ui/components/label";
import { Skeleton } from "@ndma-dcs-staff-portal/ui/components/skeleton";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@ndma-dcs-staff-portal/ui/components/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
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

const RATING_LABELS: Record<number, string> = {
  5: "Excellent",
  4: "Good",
  3: "Acceptable",
  2: "Needs Improvement",
  1: "Unsatisfactory",
};

// Increment table per DESIGN_HANDOFF.md §11: pct≤60→1, ≤70→2, ≤80→3, ≤90→4, >90→5
const INCREMENT_TABLE: { lo: number; hi: number; inc: number }[] = [
  { lo: 0, hi: 60, inc: 1 },
  { lo: 61, hi: 70, inc: 2 },
  { lo: 71, hi: 80, inc: 3 },
  { lo: 81, hi: 90, inc: 4 },
  { lo: 91, hi: 100, inc: 5 },
];

function getIncrement(pct: number): number {
  const row = INCREMENT_TABLE.find(({ hi }) => pct <= hi);
  return row?.inc ?? 5;
}

type AppraisalStatus =
  | "draft"
  | "scheduled"
  | "in_progress"
  | "submitted"
  | "approved"
  | "rejected"
  | "completed"
  | "overdue";

type SignatureRole =
  | "employee"
  | "manager_director"
  | "hr_manager"
  | "deputy_gm"
  | "gm";

const SIGNATURE_ROLES: { role: SignatureRole; label: string; subtitle: string }[] = [
  { role: "employee", label: "Employee", subtitle: "Confirms appraisal contents." },
  { role: "manager_director", label: "Manager / Director", subtitle: "Reviewing supervisor." },
  { role: "hr_manager", label: "HR Manager", subtitle: "HR validation." },
  { role: "deputy_gm", label: "Deputy General Manager", subtitle: "Senior approval." },
  { role: "gm", label: "General Manager", subtitle: "Final endorsement." },
];

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

// ─── Rating toggle (1-5 buttons) ─────────────────────────────────────────────

function RatingToggle({
  value,
  onChange,
  disabled,
}: {
  value: number | null | undefined;
  onChange: (value: number) => void;
  disabled?: boolean;
}) {
  return (
    <div className="inline-flex gap-1">
      {[1, 2, 3, 4, 5].map((v) => {
        const active = value === v;
        return (
          <button
            key={v}
            type="button"
            disabled={disabled}
            onClick={() => onChange(v)}
            title={RATING_LABELS[v]}
            className={`w-7 h-7 rounded-md text-xs font-semibold tabular-nums transition-colors
              ${
                active
                  ? "bg-primary text-primary-foreground border border-primary"
                  : "bg-card border border-input text-foreground hover:border-primary hover:text-primary"
              }
              ${disabled ? "opacity-60 cursor-not-allowed" : "cursor-pointer"}`}
          >
            {v}
          </button>
        );
      })}
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
  maxItems,
}: {
  label: string;
  items: string[];
  onChange: (items: string[]) => void;
  readOnly: boolean;
  minItems?: number;
  maxItems?: number;
}) {
  function update(index: number, value: string) {
    const next = [...items];
    next[index] = value;
    onChange(next);
  }

  function addItem() {
    if (maxItems && items.length >= maxItems) return;
    onChange([...items, ""]);
  }

  function removeItem(index: number) {
    if (minItems && items.length <= minItems) return;
    onChange(items.filter((_, i) => i !== index));
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label className="text-sm font-semibold">
          {label}
          {(minItems || maxItems) && !readOnly && (
            <span className="ml-1 text-muted-foreground font-normal">
              ({minItems ? `minimum ${minItems}` : ""}
              {minItems && maxItems ? ", " : ""}
              {maxItems ? `maximum ${maxItems}` : ""})
            </span>
          )}
        </Label>
      </div>
      {items.length === 0 && readOnly && (
        <p className="text-sm text-muted-foreground italic">None recorded.</p>
      )}
      {items.map((item, i) => (
        <div key={i} className="flex gap-2 items-start">
          <span className="text-xs text-muted-foreground font-semibold w-4 pt-2.5">{i + 1}.</span>
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
                placeholder={`${label} ${i + 1}…`}
              />
            )}
          </div>
          {!readOnly && (!minItems || items.length > minItems) && (
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
      {!readOnly && (!maxItems || items.length < maxItems) && (
        <Button variant="outline" size="sm" onClick={addItem} className="mt-1">
          <Plus className="size-4 mr-1.5" />
          Add {label.replace(/s$/, "")}
        </Button>
      )}
    </div>
  );
}

// ─── Responsibilities editor ──────────────────────────────────────────────────

type Responsibility = { seq: number; title: string; description: string; rating: number | null };

function ResponsibilitiesEditor({
  items,
  onChange,
  readOnly,
}: {
  items: Responsibility[];
  onChange: (items: Responsibility[]) => void;
  readOnly: boolean;
}) {
  function update(index: number, patch: Partial<Responsibility>) {
    onChange(items.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  }
  function addRow() {
    if (items.length >= 5) return;
    onChange([
      ...items,
      { seq: items.length + 1, title: "", description: "", rating: null },
    ]);
  }
  function removeRow(index: number) {
    if (items.length <= 1) return;
    onChange(items.filter((_, i) => i !== index).map((r, i) => ({ ...r, seq: i + 1 })));
  }

  return (
    <div className="space-y-3">
      {items.map((r, i) => (
        <div key={i} className="rounded-lg border bg-card p-3 space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground font-semibold w-4">{i + 1}.</span>
            <div className="flex-1">
              {readOnly ? (
                <p className="text-sm font-medium">
                  {r.title || <span className="text-muted-foreground italic">Empty</span>}
                </p>
              ) : (
                <Input
                  value={r.title}
                  onChange={(e) => update(i, { title: e.target.value })}
                  placeholder={`Responsibility ${i + 1}…`}
                />
              )}
            </div>
            <RatingToggle
              value={r.rating}
              onChange={(v) => update(i, { rating: v })}
              disabled={readOnly}
            />
            <span className="tabular-nums w-6 text-right text-sm font-semibold text-muted-foreground">
              {r.rating ?? "—"}
            </span>
            {!readOnly && items.length > 1 && (
              <Button
                variant="ghost"
                size="icon"
                className="size-8 text-muted-foreground hover:text-destructive"
                onClick={() => removeRow(i)}
                title="Remove"
              >
                <Trash2 className="size-4" />
              </Button>
            )}
          </div>
          {!readOnly && (
            <Textarea
              value={r.description}
              onChange={(e) => update(i, { description: e.target.value })}
              placeholder="Optional details / context"
              rows={2}
              className="text-sm"
            />
          )}
          {readOnly && r.description && (
            <p className="text-sm text-muted-foreground whitespace-pre-wrap">{r.description}</p>
          )}
        </div>
      ))}
      {!readOnly && items.length < 5 && (
        <Button variant="outline" size="sm" onClick={addRow}>
          <Plus className="size-4 mr-1.5" />
          Add Responsibility
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

  // Query — getDetail returns appraisal + responsibilities + achievements + goals + signatures + ratings
  const { data: appraisal, isLoading, isError } = useQuery(
    orpc.appraisals.getDetail.queryOptions({ input: { id: appraisalId } })
  );

  // Local form state — seeded from appraisal when loaded
  const [ratings, setRatings] = useState<Partial<Record<RatingKey, number>>>({});
  const [responsibilities, setResponsibilities] = useState<Responsibility[]>([
    { seq: 1, title: "", description: "", rating: null },
    { seq: 2, title: "", description: "", rating: null },
    { seq: 3, title: "", description: "", rating: null },
    { seq: 4, title: "", description: "", rating: null },
    { seq: 5, title: "", description: "", rating: null },
  ]);
  const [achievements, setAchievements] = useState<string[]>(["", "", ""]);
  const [goals, setGoals] = useState<string[]>(["", "", ""]);
  const [staffFeedback, setStaffFeedback] = useState("");
  const [supervisorComments, setSupervisorComments] = useState("");
  const [seeded, setSeeded] = useState(false);

  // Reject dialog state
  const [showRejectDialog, setShowRejectDialog] = useState(false);
  const [rejectReason, setRejectReason] = useState("");

  // Active tab
  const [activeTab, setActiveTab] = useState<string>("info");

  // Seed local state from fetched appraisal once
  if (appraisal && !seeded) {
    const matrix = appraisal.ratingMatrix as Record<string, number> | null | undefined;
    if (matrix) {
      const seededRatings: Partial<Record<RatingKey, number>> = {};
      for (const cat of RATING_CATEGORIES) {
        if (typeof matrix[cat.key] === "number") {
          seededRatings[cat.key] = matrix[cat.key] as number;
        }
      }
      setRatings(seededRatings);
    }

    // Responsibilities (from sub-table) + ratings table
    const respRows = (appraisal.responsibilities as Array<{ seq: number; title: string; description: string | null }> | undefined) ?? [];
    const ratingsRows = (appraisal.ratings as Array<{ kind: string; responsibilitySeq: number | null; rating: number }> | undefined) ?? [];
    const respRatingsBySeq = new Map<number, number>();
    for (const rr of ratingsRows) {
      if (rr.kind === "responsibility" && rr.responsibilitySeq != null) {
        respRatingsBySeq.set(rr.responsibilitySeq, rr.rating);
      }
    }
    if (respRows.length > 0) {
      const seededResp: Responsibility[] = respRows.map((r) => ({
        seq: r.seq,
        title: r.title,
        description: r.description ?? "",
        rating: respRatingsBySeq.get(r.seq) ?? null,
      }));
      // Pad up to at least 5 rows for an editable form
      while (seededResp.length < 5) {
        seededResp.push({ seq: seededResp.length + 1, title: "", description: "", rating: null });
      }
      setResponsibilities(seededResp);
    }

    // Achievements — could be subtable rows OR a JSONB string[] on the parent record
    const achRows = appraisal.achievements as
      | Array<{ text: string; seq?: number }>
      | string[]
      | null
      | undefined;
    if (Array.isArray(achRows) && achRows.length > 0) {
      const arr =
        typeof achRows[0] === "string"
          ? (achRows as string[])
          : (achRows as Array<{ text: string }>).map((a) => a.text);
      setAchievements(arr.length >= 3 ? arr : [...arr, ...Array(3 - arr.length).fill("")]);
    }

    const goalRows = appraisal.goals as
      | Array<{ text: string; seq?: number }>
      | string[]
      | null
      | undefined;
    if (Array.isArray(goalRows) && goalRows.length > 0) {
      const arr =
        typeof goalRows[0] === "string"
          ? (goalRows as string[])
          : (goalRows as Array<{ text: string }>).map((g) => g.text);
      setGoals(arr.length >= 3 ? arr : [...arr, ...Array(3 - arr.length).fill("")]);
    }

    setStaffFeedback(appraisal.staffFeedback ?? "");
    setSupervisorComments(appraisal.supervisorComments ?? "");
    setSeeded(true);
  }

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: orpc.appraisals.getDetail.key() });
    queryClient.invalidateQueries({ queryKey: orpc.appraisals.get.key() });
    queryClient.invalidateQueries({ queryKey: orpc.appraisals.list.key() });
  }

  // Mutations
  const saveDraftMutation = useMutation(
    orpc.appraisals.update.mutationOptions({
      onSuccess: () => {
        invalidate();
        toast.success("Draft saved.");
      },
      onError: (err) => toast.error(err.message ?? "Failed to save draft."),
    })
  );

  const saveRatingsMutation = useMutation(
    orpc.appraisals.setRatings.mutationOptions({
      onSuccess: () => {
        invalidate();
        toast.success("Ratings saved.");
      },
      onError: (err) => toast.error(err.message ?? "Failed to save ratings."),
    })
  );

  const setResponsibilitiesMutation = useMutation(
    orpc.appraisals.setResponsibilities.mutationOptions({
      onSuccess: () => {
        invalidate();
        toast.success("Responsibilities saved.");
      },
      onError: (err) => toast.error(err.message ?? "Failed to save responsibilities."),
    })
  );

  const setAchievementsMutation = useMutation(
    orpc.appraisals.setAchievements.mutationOptions({
      onSuccess: () => {
        invalidate();
        toast.success("Achievements saved.");
      },
      onError: (err) => toast.error(err.message ?? "Failed to save achievements."),
    })
  );

  const setGoalsMutation = useMutation(
    orpc.appraisals.setGoals.mutationOptions({
      onSuccess: () => {
        invalidate();
        toast.success("Goals saved.");
      },
      onError: (err) => toast.error(err.message ?? "Failed to save goals."),
    })
  );

  const submitMutation = useMutation(
    orpc.appraisals.submit.mutationOptions({
      onSuccess: () => {
        invalidate();
        toast.success("Appraisal submitted for approval.");
      },
      onError: (err) => toast.error(err.message ?? "Failed to submit appraisal."),
    })
  );

  const approveMutation = useMutation(
    orpc.appraisals.approve.mutationOptions({
      onSuccess: () => {
        invalidate();
        toast.success("Appraisal approved.");
      },
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

  const signMutation = useMutation(
    orpc.appraisals.sign.mutationOptions({
      onSuccess: () => {
        invalidate();
        toast.success("Signature recorded.");
      },
      onError: (err) => toast.error(err.message ?? "Failed to sign."),
    })
  );

  // ─── Handlers ───────────────────────────────────────────────────────────────

  function handleSaveDraft() {
    if (!appraisal) return;
    saveDraftMutation.mutate({
      id: appraisal.id,
      achievements: achievements.filter((a) => a.trim()),
      goals: goals.filter((g) => g.trim()),
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
      achievements: achievements.filter((a) => a.trim()),
      goals: goals.filter((g) => g.trim()),
      staffFeedback: staffFeedback || undefined,
      supervisorComments: supervisorComments || undefined,
    });
  }

  function handleSaveResponsibilities() {
    if (!appraisal) return;
    const filled = responsibilities
      .filter((r) => r.title.trim())
      .map((r, i) => ({
        seq: i + 1,
        title: r.title.trim(),
        description: r.description.trim() || undefined,
      }));
    if (filled.length === 0) {
      toast.error("Please add at least one responsibility.");
      return;
    }
    setResponsibilitiesMutation.mutate({
      appraisalId: appraisal.id,
      responsibilities: filled,
    });
  }

  function handleSaveAchievements() {
    if (!appraisal) return;
    const filled = achievements.map((a) => a.trim()).filter(Boolean);
    if (filled.length < 3) {
      toast.error("Please add at least 3 achievements.");
      return;
    }
    setAchievementsMutation.mutate({
      appraisalId: appraisal.id,
      achievements: filled,
    });
  }

  function handleSaveGoals() {
    if (!appraisal) return;
    const filled = goals.map((g) => g.trim()).filter(Boolean);
    if (filled.length < 3) {
      toast.error("Please add at least 3 goals.");
      return;
    }
    setGoalsMutation.mutate({
      appraisalId: appraisal.id,
      goals: filled,
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

  function handleSign(role: SignatureRole) {
    if (!appraisal) return;
    signMutation.mutate({
      appraisalId: appraisal.id,
      role,
      signatureSvg: undefined,
    });
  }

  // ─── Derived state ───────────────────────────────────────────────────────────

  const status = appraisal?.status as AppraisalStatus | undefined;
  const isReadOnly = status === "approved" || status === "completed";
  const canEdit =
    status === "draft" || status === "in_progress" || status === "rejected";
  const canSubmit = canEdit;
  const canApproveReject = isManager && status === "submitted";

  // Live computed scores
  const generalRatingValues = RATING_CATEGORIES.map((c) => ratings[c.key]).filter(
    (v): v is number => typeof v === "number"
  );
  const generalScore = generalRatingValues.reduce((a, b) => a + b, 0); // out of 40
  const respScore = responsibilities.reduce((s, r) => s + (r.rating ?? 0), 0); // out of 25
  const totalScore = generalScore + respScore; // out of 65
  const percentage = Math.round((totalScore / 65) * 100);
  const increment = getIncrement(percentage);

  // ─── Exports ───────────────────────────────────────────────────────────────

  function exportToExcel() {
    if (!appraisal) return;
    const staffName =
      (appraisal.staffProfile as { user?: { name?: string | null } | null } | null)?.user?.name ?? "Unknown";
    const reviewerName =
      (appraisal.reviewer as { user?: { name?: string | null } | null } | null)?.user?.name ?? "—";
    const departmentName =
      (appraisal.staffProfile as { department?: { name: string } | null } | null)?.department?.name ?? "—";

    const wb = XLSX.utils.book_new();

    // Sheet 1: Summary
    const summaryRows: (string | number)[][] = [
      ["NDMA · DCS — Staff Appraisal"],
      [],
      ["Employee", staffName],
      ["Department", departmentName],
      ["Reviewer", reviewerName],
      ["Period", appraisal.period ?? ""],
      ["Type of Review", appraisal.typeOfReview ?? ""],
      ["Status", appraisal.status],
      [],
      ["General Performance", `${generalScore} / 40`],
      ["Core Responsibilities", `${respScore} / 25`],
      ["Total Score", `${totalScore} / 65`],
      ["Percentage", `${percentage}%`],
      ["Salary Increment", `${increment}%`],
    ];
    const wsSummary = XLSX.utils.aoa_to_sheet(summaryRows);
    XLSX.utils.book_append_sheet(wb, wsSummary, "Summary");

    // Sheet 2: Ratings
    const ratingRows: (string | number)[][] = [["Category", "Rating", "Label"]];
    for (const cat of RATING_CATEGORIES) {
      const v = ratings[cat.key];
      ratingRows.push([cat.label, v ?? "", v ? RATING_LABELS[v] : ""]);
    }
    ratingRows.push([]);
    ratingRows.push(["Responsibility", "Rating", "Label"]);
    for (const r of responsibilities.filter((x) => x.title.trim())) {
      ratingRows.push([r.title, r.rating ?? "", r.rating ? RATING_LABELS[r.rating] : ""]);
    }
    const wsRatings = XLSX.utils.aoa_to_sheet(ratingRows);
    XLSX.utils.book_append_sheet(wb, wsRatings, "Ratings");

    // Sheet 3: Development
    const devRows: (string | number)[][] = [["Section", "Content"]];
    devRows.push(["Achievements", achievements.filter((a) => a.trim()).join("\n")]);
    devRows.push(["Goals", goals.filter((g) => g.trim()).join("\n")]);
    devRows.push(["Staff Feedback", staffFeedback]);
    devRows.push(["Supervisor Comments", supervisorComments]);
    const wsDev = XLSX.utils.aoa_to_sheet(devRows);
    XLSX.utils.book_append_sheet(wb, wsDev, "Development");

    XLSX.writeFile(wb, `Appraisal_${staffName.replace(/\s+/g, "_")}.xlsx`, { bookType: "xlsx" });
  }

  function exportToPDF() {
    if (!appraisal) return;
    const matrix = appraisal.ratingMatrix as Record<string, number> | null | undefined;
    const { responsibilities: _resp, ratings: _r, signatures: _s, ...rest } = appraisal;
    exportAppraisalPDF({
      ...rest,
      staffProfile: appraisal.staffProfile as Parameters<typeof exportAppraisalPDF>[0]["staffProfile"],
      reviewer: appraisal.reviewer as Parameters<typeof exportAppraisalPDF>[0]["reviewer"],
      cycle: appraisal.cycle as Parameters<typeof exportAppraisalPDF>[0]["cycle"],
      ratings: matrix
        ? Object.entries(matrix).map(([category, score]) => ({ category, score }))
        : [],
      achievements: achievements
        .filter((a) => a.trim())
        .map((text, seq) => ({ text, seq })),
      goals: goals.filter((g) => g.trim()).map((text, seq) => ({ text, seq })),
      responsibilities: responsibilities
        .filter((r) => r.title.trim())
        .map((r) => ({ text: r.title, seq: r.seq })),
    });
  }

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
          <div className="max-w-5xl mx-auto space-y-6">
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
          <div className="max-w-5xl mx-auto flex flex-col items-center gap-4 py-20 text-center">
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
  const designation =
    (appraisal.staffProfile as { jobTitle?: string | null } | null)?.jobTitle ?? "—";

  const periodLabel =
    appraisal.periodStart && appraisal.periodEnd
      ? `${format(parseISO(appraisal.periodStart), "d MMM yyyy")} – ${format(parseISO(appraisal.periodEnd), "d MMM yyyy")}`
      : "—";

  const signatures =
    (appraisal.signatures as
      | Array<{ role: SignatureRole; signedAt: string | Date | null; signer?: { user?: { name?: string | null } | null } | null }>
      | undefined) ?? [];
  const signatureByRole = new Map<SignatureRole, (typeof signatures)[number]>();
  for (const s of signatures) signatureByRole.set(s.role, s);

  return (
    <>
      <Header fixed>
        <div className="flex items-center gap-2">
          <ClipboardCheck className="size-4 text-muted-foreground" />
          <span className="text-sm font-medium">Appraisal Detail</span>
        </div>
        <div className="ms-auto flex items-center gap-2">
          {/* Live score in header */}
          <div className="hidden md:flex items-center gap-4 px-3 mr-1">
            <div className="text-right">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Score</div>
              <div
                className={`text-sm font-bold tabular-nums ${
                  percentage >= 90
                    ? "text-blue-700 dark:text-blue-400"
                    : percentage >= 70
                      ? "text-amber-600 dark:text-amber-400"
                      : "text-red-600 dark:text-red-400"
                }`}
              >
                {totalScore}/65 <span className="text-xs font-normal text-muted-foreground">({percentage}%)</span>
              </div>
            </div>
            <div className="text-right">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Increment</div>
              <div className="text-sm font-bold text-blue-700 dark:text-blue-400">{increment}%</div>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={exportToExcel}>
            <FileSpreadsheet className="size-4 mr-1.5" />
            Export Excel
          </Button>
          <Button variant="outline" size="sm" onClick={exportToPDF}>
            <FileDown className="size-4 mr-1.5" />
            Export PDF
          </Button>
          <ThemeSwitch />
        </div>
      </Header>

      <Main>
        <div className="max-w-5xl mx-auto space-y-6 pb-16">
          {/* Back link + status */}
          <div className="flex items-center gap-3">
            <Link
              to="/appraisals"
              className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowLeft className="size-4" />
              Back to Appraisals
            </Link>
            <StatusBadge status={appraisal.status} />
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

          {/* Title strip */}
          <div className="rounded-xl border bg-card p-6 shadow-sm">
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
              <div>
                <h1 className="text-2xl font-bold tracking-tight">{staffName}</h1>
                <p className="text-sm text-muted-foreground mt-1">
                  {designation} · {departmentName}
                </p>
              </div>
              <div className="text-right text-sm">
                <p className="text-muted-foreground text-xs uppercase tracking-wide">Period</p>
                <p className="font-medium">{periodLabel}</p>
              </div>
            </div>
          </div>

          {/* ── Tabs ──────────────────────────────────────────────────────── */}
          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as string)}>
            <TabsList className="mb-4">
              <TabsTrigger value="info">1. Employee Info</TabsTrigger>
              <TabsTrigger value="ratings">2–4. Ratings</TabsTrigger>
              <TabsTrigger value="dev">5–7. Development</TabsTrigger>
              <TabsTrigger value="finalize">8–9. Finalize</TabsTrigger>
            </TabsList>

            {/* ── Tab 1: Employee Information ─────────────────────────────── */}
            <TabsContent value="info" className="space-y-6">
              <div className="rounded-xl border bg-card shadow-sm">
                <div className="border-b px-6 py-4">
                  <h2 className="font-semibold">Employee Information</h2>
                  <p className="text-sm text-muted-foreground mt-0.5">
                    Auto-populated from staff profile — read-only.
                  </p>
                </div>
                <div className="px-6 py-5 grid grid-cols-2 sm:grid-cols-3 gap-x-8 gap-y-4 text-sm">
                  <div>
                    <p className="text-xs uppercase tracking-wide text-muted-foreground mb-0.5">
                      Full Name
                    </p>
                    <p className="font-medium">{staffName}</p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-wide text-muted-foreground mb-0.5">
                      Designation
                    </p>
                    <p className="font-medium">{designation}</p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-wide text-muted-foreground mb-0.5">
                      Department
                    </p>
                    <p className="font-medium">{departmentName}</p>
                  </div>
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

              <div className="rounded-xl border bg-card shadow-sm">
                <div className="border-b px-6 py-4">
                  <h2 className="font-semibold">Rating Scale</h2>
                  <p className="text-sm text-muted-foreground mt-0.5">
                    Reference this scale when assigning scores in the next tab.
                  </p>
                </div>
                <div className="px-6 py-5 flex flex-wrap gap-2">
                  {[5, 4, 3, 2, 1].map((n) => (
                    <span
                      key={n}
                      className={`inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-semibold ${
                        n === 5
                          ? "bg-blue-600 text-white"
                          : n === 4
                            ? "bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-900/40 dark:text-blue-300 dark:border-blue-800"
                            : n === 3
                              ? "bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-900"
                              : n === 2
                                ? "bg-orange-50 text-orange-700 border border-orange-200 dark:bg-orange-900/30 dark:text-orange-300 dark:border-orange-900"
                                : "bg-red-50 text-red-700 border border-red-200 dark:bg-red-900/30 dark:text-red-300 dark:border-red-900"
                      }`}
                    >
                      <span className="w-5 h-5 rounded flex items-center justify-center bg-white/30 text-[11px] font-bold">
                        {n}
                      </span>
                      {RATING_LABELS[n]}
                    </span>
                  ))}
                </div>
              </div>
            </TabsContent>

            {/* ── Tab 2: Ratings (sections 2-4) ───────────────────────────── */}
            <TabsContent value="ratings" className="space-y-6">
              {/* Section 3: General Performance */}
              <div className="rounded-xl border bg-card shadow-sm">
                <div className="border-b px-6 py-4 flex items-center justify-between">
                  <div>
                    <h2 className="font-semibold">General Performance Categories</h2>
                    <p className="text-sm text-muted-foreground mt-0.5">
                      Rate each category 1 (Unsatisfactory) → 5 (Excellent).
                    </p>
                  </div>
                  <span className="rounded-lg border bg-muted/40 px-3 py-1 text-sm font-semibold tabular-nums">
                    {generalScore} / 40
                  </span>
                </div>
                <div className="px-6 py-4 space-y-0">
                  {RATING_CATEGORIES.map((cat, i) => (
                    <div
                      key={cat.key}
                      className={`flex items-center gap-4 py-3 ${
                        i < RATING_CATEGORIES.length - 1 ? "border-b border-border/50" : ""
                      }`}
                    >
                      <span className="flex-1 text-sm font-medium">{cat.label}</span>
                      <RatingToggle
                        value={ratings[cat.key] ?? null}
                        onChange={(v) =>
                          setRatings((prev) => ({ ...prev, [cat.key]: v }))
                        }
                        disabled={isReadOnly}
                      />
                      <span className="tabular-nums w-6 text-right text-sm font-semibold text-muted-foreground">
                        {ratings[cat.key] ?? "—"}
                      </span>
                    </div>
                  ))}
                </div>
                <div className="border-t px-6 py-3 flex items-center justify-between">
                  <span className="text-sm font-medium">General Score</span>
                  <span className="rounded-lg border bg-muted/40 px-3 py-1 text-sm font-semibold tabular-nums">
                    {generalScore} / 40
                  </span>
                </div>
              </div>

              {/* Section 4: Core Responsibilities */}
              <div className="rounded-xl border bg-card shadow-sm">
                <div className="border-b px-6 py-4 flex items-center justify-between">
                  <div>
                    <h2 className="font-semibold">Core Responsibilities</h2>
                    <p className="text-sm text-muted-foreground mt-0.5">
                      Describe each responsibility and rate performance (up to 5).
                    </p>
                  </div>
                  <span className="rounded-lg border bg-muted/40 px-3 py-1 text-sm font-semibold tabular-nums">
                    {respScore} / 25
                  </span>
                </div>
                <div className="px-6 py-4">
                  <ResponsibilitiesEditor
                    items={responsibilities}
                    onChange={setResponsibilities}
                    readOnly={isReadOnly}
                  />
                </div>
                <div className="border-t px-6 py-3 flex items-center justify-between">
                  <span className="text-sm font-medium">Responsibilities Score</span>
                  <span className="rounded-lg border bg-muted/40 px-3 py-1 text-sm font-semibold tabular-nums">
                    {respScore} / 25
                  </span>
                </div>
              </div>

              {canEdit && (
                <div className="flex flex-wrap gap-3">
                  <Button
                    variant="secondary"
                    onClick={handleSaveRatings}
                    disabled={saveRatingsMutation.isPending}
                  >
                    {saveRatingsMutation.isPending ? "Saving…" : "Save Ratings"}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={handleSaveResponsibilities}
                    disabled={setResponsibilitiesMutation.isPending}
                  >
                    {setResponsibilitiesMutation.isPending
                      ? "Saving…"
                      : "Save Responsibilities"}
                  </Button>
                </div>
              )}
            </TabsContent>

            {/* ── Tab 3: Development (sections 5-7) ────────────────────────── */}
            <TabsContent value="dev" className="space-y-6">
              {/* Section 5: Summary & development feedback */}
              <div className="rounded-xl border bg-card shadow-sm">
                <div className="border-b px-6 py-4">
                  <h2 className="font-semibold">Summary &amp; Development</h2>
                  <p className="text-sm text-muted-foreground mt-0.5">
                    Self-assessment and supervisor feedback.
                  </p>
                </div>
                <div className="px-6 py-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label
                      htmlFor="staff-feedback"
                      className="text-xs uppercase tracking-wide text-muted-foreground font-semibold"
                    >
                      Staff Self-Assessment
                    </Label>
                    {isReadOnly ? (
                      <p className="text-sm whitespace-pre-wrap min-h-[5rem]">
                        {staffFeedback || (
                          <span className="text-muted-foreground italic">None recorded.</span>
                        )}
                      </p>
                    ) : (
                      <Textarea
                        id="staff-feedback"
                        rows={4}
                        placeholder="How the staff member assesses their own performance…"
                        value={staffFeedback}
                        onChange={(e) => setStaffFeedback(e.target.value)}
                      />
                    )}
                  </div>
                  <div className="space-y-1.5">
                    <Label
                      htmlFor="supervisor-comments"
                      className="text-xs uppercase tracking-wide text-muted-foreground font-semibold"
                    >
                      Supervisor Comments
                    </Label>
                    {isReadOnly && !isManager ? (
                      <p className="text-sm whitespace-pre-wrap min-h-[5rem]">
                        {supervisorComments || (
                          <span className="text-muted-foreground italic">None recorded.</span>
                        )}
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
                  </div>
                </div>
              </div>

              {/* Section 6: Achievements */}
              <div className="rounded-xl border bg-card shadow-sm">
                <div className="border-b px-6 py-4">
                  <h2 className="font-semibold">Achievements</h2>
                  <p className="text-sm text-muted-foreground mt-0.5">
                    List the key achievements during this appraisal period.
                  </p>
                </div>
                <div className="px-6 py-5">
                  <DynamicList
                    label="Achievements"
                    items={achievements}
                    onChange={setAchievements}
                    readOnly={isReadOnly}
                    minItems={3}
                    maxItems={5}
                  />
                </div>
                {canEdit && (
                  <div className="border-t px-6 py-3 flex justify-end">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={handleSaveAchievements}
                      disabled={setAchievementsMutation.isPending}
                    >
                      {setAchievementsMutation.isPending ? "Saving…" : "Save Achievements"}
                    </Button>
                  </div>
                )}
              </div>

              {/* Section 7: Goals */}
              <div className="rounded-xl border bg-card shadow-sm">
                <div className="border-b px-6 py-4">
                  <h2 className="font-semibold">Goals &amp; Performance Indicators</h2>
                  <p className="text-sm text-muted-foreground mt-0.5">
                    Goals for the next appraisal period.
                  </p>
                </div>
                <div className="px-6 py-5">
                  <DynamicList
                    label="Goals"
                    items={goals}
                    onChange={setGoals}
                    readOnly={isReadOnly}
                    minItems={3}
                    maxItems={5}
                  />
                </div>
                {canEdit && (
                  <div className="border-t px-6 py-3 flex justify-end">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={handleSaveGoals}
                      disabled={setGoalsMutation.isPending}
                    >
                      {setGoalsMutation.isPending ? "Saving…" : "Save Goals"}
                    </Button>
                  </div>
                )}
              </div>
            </TabsContent>

            {/* ── Tab 4: Finalize (sections 8-9) ──────────────────────────── */}
            <TabsContent value="finalize" className="space-y-6">
              {/* Section 8: Score Summary */}
              <div className="rounded-xl border bg-card shadow-sm">
                <div className="border-b px-6 py-4">
                  <h2 className="font-semibold">Score Summary</h2>
                  <p className="text-sm text-muted-foreground mt-0.5">
                    Auto-calculated from ratings — updates as you change scores.
                  </p>
                </div>
                <div className="px-6 py-5 space-y-3">
                  <div className="rounded-xl border overflow-hidden">
                    {[
                      { label: "General Performance (8 × 5)", val: generalScore, max: 40 },
                      { label: "Core Responsibilities (5 × 5)", val: respScore, max: 25 },
                    ].map((row) => (
                      <div
                        key={row.label}
                        className="flex items-center justify-between px-4 py-3 border-b border-border/60"
                      >
                        <span className="text-sm">{row.label}</span>
                        <div className="flex items-center gap-3">
                          <div className="w-32 h-1.5 rounded-full bg-muted overflow-hidden">
                            <div
                              className="h-full rounded-full bg-blue-500"
                              style={{ width: `${(row.val / row.max) * 100}%` }}
                            />
                          </div>
                          <span className="tabular-nums text-sm font-semibold w-16 text-right">
                            {row.val} / {row.max}
                          </span>
                        </div>
                      </div>
                    ))}
                    <div className="flex items-center justify-between px-4 py-3.5 bg-muted/40 border-b font-semibold">
                      <span>Total Score</span>
                      <span className="tabular-nums">{totalScore} / 65</span>
                    </div>
                    <div className="flex items-center justify-between px-4 py-3 border-b border-border/60">
                      <span className="text-sm">Percentage</span>
                      <div className="flex-1 ml-4 max-w-md">
                        <ScoreBar score={percentage} />
                      </div>
                    </div>
                    <div className="flex items-center justify-between px-4 py-3">
                      <span className="text-sm">Salary Increment</span>
                      <span className="inline-flex items-center rounded-lg px-2.5 py-0.5 text-xs font-semibold bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">
                        {increment}%
                      </span>
                    </div>
                  </div>
                  {/* Increment table */}
                  <div className="text-xs">
                    <p className="text-xs uppercase tracking-wide text-muted-foreground font-semibold mb-2">
                      Increment Table
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {INCREMENT_TABLE.map((row) => {
                        const active = percentage <= row.hi && percentage >= row.lo;
                        return (
                          <span
                            key={row.inc}
                            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 font-semibold border tabular-nums
                              ${
                                active
                                  ? "bg-blue-600 text-white border-blue-600"
                                  : "bg-card border-input text-muted-foreground"
                              }`}
                          >
                            {row.lo === 0 ? `≤${row.hi}` : `${row.lo}–${row.hi}`}% → {row.inc}%
                          </span>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>

              {/* Section 9: Signatures */}
              <div className="rounded-xl border bg-card shadow-sm">
                <div className="border-b px-6 py-4">
                  <h2 className="font-semibold">Signatures</h2>
                  <p className="text-sm text-muted-foreground mt-0.5">
                    Five-step sign-off: Employee → Manager / Director → HR → Deputy GM → GM.
                  </p>
                </div>
                <div className="px-6 py-5 space-y-3">
                  {SIGNATURE_ROLES.map((s) => {
                    const sig = signatureByRole.get(s.role);
                    const signed = !!sig?.signedAt;
                    const signerName = sig?.signer?.user?.name ?? null;
                    return (
                      <div
                        key={s.role}
                        className="rounded-xl border p-4 flex items-center gap-4"
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold">{s.label}</span>
                            {signed && (
                              <span className="inline-flex items-center gap-1 rounded-md bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 px-2 py-0.5 text-[11px] font-semibold">
                                <CheckCircle2 className="size-3" />
                                Signed
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5">{s.subtitle}</p>
                          {signed && (
                            <p className="text-xs text-muted-foreground mt-1">
                              {signerName ?? "—"} ·{" "}
                              {sig?.signedAt
                                ? format(new Date(sig.signedAt), "d MMM yyyy")
                                : "—"}
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          {signed ? (
                            <Button
                              variant="outline"
                              size="sm"
                              disabled
                              title="Already signed"
                            >
                              <Eraser className="size-4 mr-1.5" />
                              Clear
                            </Button>
                          ) : (
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() => handleSign(s.role)}
                              disabled={signMutation.isPending}
                            >
                              <PenLine className="size-4 mr-1.5" />
                              Sign
                            </Button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </TabsContent>
          </Tabs>

          {/* ── Action buttons ─────────────────────────────────────────────── */}
          <div className="flex flex-wrap gap-3 sticky bottom-0 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 -mx-2 px-2 py-3 border-t">
            {canEdit && (
              <Button
                variant="outline"
                onClick={handleSaveDraft}
                disabled={saveDraftMutation.isPending}
              >
                {saveDraftMutation.isPending ? "Saving…" : "Save Draft"}
              </Button>
            )}
            {canSubmit && (
              <Button onClick={handleSubmit} disabled={submitMutation.isPending}>
                <Send className="size-4 mr-2" />
                {submitMutation.isPending ? "Submitting…" : "Submit for Approval"}
              </Button>
            )}
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
                <Button variant="destructive" onClick={() => setShowRejectDialog(true)}>
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
            <DialogDescription>
              The staff member will be notified and can revise and resubmit.
            </DialogDescription>
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
