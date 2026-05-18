import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { differenceInDays, format, parseISO } from "date-fns";
import { useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  Building2,
  Calendar,
  CalendarDays,
  ChevronDown,
  ChevronRight,
  Clock3,
  Download,
  HardHat,
  Key,
  ListChecks,
  Mail,
  Pencil,
  Phone,
  Shield,
  ShieldCheck,
  Users,
  BookOpen,
  TrendingUp,
  FileText,
  HeartHandshake,
  UserCheck,
  UserX,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@ndma-dcs-staff-portal/ui/components/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@ndma-dcs-staff-portal/ui/components/dialog";
import { FormerTag, isFormerStatus } from "@/components/former-tag";
import { Input } from "@ndma-dcs-staff-portal/ui/components/input";
import { Label } from "@ndma-dcs-staff-portal/ui/components/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@ndma-dcs-staff-portal/ui/components/select";
import { Separator } from "@ndma-dcs-staff-portal/ui/components/separator";
import { Skeleton } from "@ndma-dcs-staff-portal/ui/components/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@ndma-dcs-staff-portal/ui/components/tabs";

import { Header } from "@/components/layout/header";
import { Main } from "@/components/layout/main";
import { orpc } from "@/utils/orpc";

export const Route = createFileRoute("/_authenticated/staff/$staffId")({
  component: StaffProfilePage,
});

type EditProfileForm = {
  jobTitle: string;
  employmentType: "full_time" | "part_time" | "contract" | "temporary";
  status: "active" | "inactive" | "on_leave" | "terminated";
  emergencyContactName: string;
  emergencyContactPhone: string;
  nextAppraisalDate: string;
  notes: string;
};

// ---------------------------------------------------------------------------
// Badge helpers
// ---------------------------------------------------------------------------

function StaffStatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; className: string }> = {
    active: { label: "Active", className: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300" },
    inactive: { label: "Inactive", className: "bg-muted text-muted-foreground" },
    on_leave: { label: "On Leave", className: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300" },
    terminated: { label: "Terminated", className: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300" },
  };
  const cfg = map[status] ?? { label: status, className: "bg-muted text-muted-foreground" };
  return <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${cfg.className}`}>{cfg.label}</span>;
}

function EmploymentTypeBadge({ type }: { type: string }) {
  const labels: Record<string, string> = {
    full_time: "Full Time",
    part_time: "Part Time",
    contract: "Contract",
    temporary: "Temporary",
  };
  return (
    <span className="inline-flex items-center rounded-lg bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">
      {labels[type] ?? type}
    </span>
  );
}

function CareerPlanStatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; className: string }> = {
    active: { label: "Active", className: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300" },
    paused: { label: "Paused", className: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300" },
    completed: { label: "Completed", className: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300" },
  };
  const cfg = map[status] ?? { label: status, className: "bg-muted text-muted-foreground" };
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${cfg.className}`}>{cfg.label}</span>;
}

function JournalEntryTypeBadge({ type }: { type: string }) {
  const map: Record<string, { label: string; className: string }> = {
    note: { label: "Note", className: "bg-muted text-muted-foreground" },
    achievement: { label: "Achievement", className: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300" },
    concern: { label: "Concern", className: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300" },
    amendment: { label: "Amendment", className: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300" },
  };
  const cfg = map[type] ?? { label: type, className: "bg-muted text-muted-foreground" };
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${cfg.className}`}>{cfg.label}</span>;
}

function PromotionRecommendationStatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; className: string }> = {
    draft: { label: "Draft", className: "bg-muted text-muted-foreground" },
    submitted: { label: "Submitted", className: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300" },
    approved: { label: "Approved", className: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300" },
    rejected: { label: "Rejected", className: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300" },
    withdrawn: { label: "Withdrawn", className: "bg-muted text-muted-foreground" },
  };
  const cfg = map[status] ?? { label: status, className: "bg-muted text-muted-foreground" };
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${cfg.className}`}>{cfg.label}</span>;
}

function AppraisalStatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; className: string }> = {
    draft: { label: "Draft", className: "bg-muted text-muted-foreground" },
    scheduled: { label: "Scheduled", className: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300" },
    in_progress: { label: "In Progress", className: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300" },
    submitted: { label: "Submitted", className: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300" },
    approved: { label: "Approved", className: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300" },
    rejected: { label: "Rejected", className: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300" },
    completed: { label: "Completed", className: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300" },
    overdue: { label: "Overdue", className: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300" },
  };
  const cfg = map[status] ?? { label: status, className: "bg-muted text-muted-foreground" };
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${cfg.className}`}>{cfg.label}</span>;
}

// ---------------------------------------------------------------------------
// Edit Profile Dialog
// ---------------------------------------------------------------------------

function EditProfileDialog({
  open,
  onOpenChange,
  staffId,
  initial,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  staffId: string;
  initial: EditProfileForm;
}) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<EditProfileForm>(initial);

  const mutation = useMutation(
    orpc.staff.update.mutationOptions({
      onSuccess: () => {
        toast.success("Profile updated");
        queryClient.invalidateQueries({ queryKey: orpc.staff.get.key() });
        onOpenChange(false);
      },
      onError: (err: Error) => {
        toast.error(err.message ?? "Failed to update profile");
      },
    }),
  );

  function handleSave() {
    mutation.mutate({
      id: staffId,
      jobTitle: form.jobTitle || undefined,
      employmentType: form.employmentType || undefined,
      status: form.status || undefined,
      emergencyContactName: form.emergencyContactName || undefined,
      emergencyContactPhone: form.emergencyContactPhone || undefined,
      nextAppraisalDate: form.nextAppraisalDate || undefined,
      notes: form.notes || undefined,
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit Profile</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="ep-jobTitle">Job Title</Label>
            <Input
              id="ep-jobTitle"
              value={form.jobTitle}
              onChange={(e) => setForm((f) => ({ ...f, jobTitle: e.target.value }))}
              placeholder="e.g. Systems Engineer"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="ep-employmentType">Employment Type</Label>
              <Select
                value={form.employmentType}
                onValueChange={(v) => setForm((f) => ({ ...f, employmentType: v as EditProfileForm["employmentType"] }))}
              >
                <SelectTrigger id="ep-employmentType">
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="full_time">Full Time</SelectItem>
                  <SelectItem value="part_time">Part Time</SelectItem>
                  <SelectItem value="contract">Contract</SelectItem>
                  <SelectItem value="temporary">Temporary</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="ep-status">Status</Label>
              <Select
                value={form.status}
                onValueChange={(v) => setForm((f) => ({ ...f, status: v as EditProfileForm["status"] }))}
              >
                <SelectTrigger id="ep-status">
                  <SelectValue placeholder="Select status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                  <SelectItem value="on_leave">On Leave</SelectItem>
                  <SelectItem value="terminated">Terminated</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <Separator />
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Emergency Contact</p>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="ep-ec-name">Contact Name</Label>
              <Input
                id="ep-ec-name"
                value={form.emergencyContactName}
                onChange={(e) => setForm((f) => ({ ...f, emergencyContactName: e.target.value }))}
                placeholder="Jane Doe"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ep-ec-phone">Contact Phone</Label>
              <Input
                id="ep-ec-phone"
                value={form.emergencyContactPhone}
                onChange={(e) => setForm((f) => ({ ...f, emergencyContactPhone: e.target.value }))}
                placeholder="+592 xxx xxxx"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ep-appraisal">Next Appraisal Date</Label>
            <Input
              id="ep-appraisal"
              type="date"
              value={form.nextAppraisalDate}
              onChange={(e) => setForm((f) => ({ ...f, nextAppraisalDate: e.target.value }))}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ep-notes">Notes</Label>
            <textarea
              id="ep-notes"
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              placeholder="Internal notes about this staff member..."
              rows={3}
              className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={mutation.isPending}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={mutation.isPending}>
            {mutation.isPending ? "Saving..." : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Career Path Tab
// ---------------------------------------------------------------------------

function CareerPathTab({ staffProfileId }: { staffProfileId: string }) {
  // Career plans list — filter client-side to this staff member
  const { data: allPlans, isLoading: plansLoading } = useQuery(
    orpc.hrDocs.careerPath.list.queryOptions(),
  );

  // Performance journal for this staff member
  const { data: journalEntries, isLoading: journalLoading } = useQuery(
    orpc.hrDocs.performanceJournal.list.queryOptions({ input: { staffProfileId } }),
  );

  // Promotion recommendations — filter client-side
  const { data: allRecommendations, isLoading: recsLoading } = useQuery(
    orpc.hrDocs.promotionRecommendations.list.queryOptions(),
  );

  const plan = allPlans?.find((p) => p.staffProfileId === staffProfileId) ?? null;
  const recommendations = allRecommendations?.filter((r) => r.staffProfileId === staffProfileId) ?? [];

  // Group journal entries by year
  const journalByYear = (journalEntries ?? []).reduce<Record<string, typeof journalEntries>>((acc, entry) => {
    if (!entry) return acc;
    const year = entry.entryDate.slice(0, 4);
    if (!acc[year]) acc[year] = [];
    acc[year]!.push(entry);
    return acc;
  }, {});
  const journalYears = Object.keys(journalByYear).sort((a, b) => Number(b) - Number(a));

  if (plansLoading || journalLoading || recsLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-32 w-full rounded-xl" />
        <Skeleton className="h-48 w-full rounded-xl" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Career Plan */}
      <div className="rounded-xl border p-5 space-y-4">
        <div className="flex items-center gap-2">
          <TrendingUp className="size-4 text-muted-foreground" />
          <h2 className="font-semibold">Career Plan</h2>
        </div>

        {plan ? (
          <>
            <div className="flex flex-wrap gap-3 text-sm">
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">Current Level</p>
                <p className="font-medium">{plan.currentLevel}</p>
              </div>
              {plan.targetLevel && (
                <div>
                  <p className="text-xs text-muted-foreground mb-0.5">Target Level</p>
                  <p className="font-medium">{plan.targetLevel}</p>
                </div>
              )}
              {plan.currentTrack && (
                <div>
                  <p className="text-xs text-muted-foreground mb-0.5">Track</p>
                  <p className="font-medium">{plan.currentTrack}</p>
                </div>
              )}
              {plan.nextReviewDate && (
                <div>
                  <p className="text-xs text-muted-foreground mb-0.5">Next Review</p>
                  <p className="font-medium">{format(parseISO(plan.nextReviewDate), "d MMM yyyy")}</p>
                </div>
              )}
              <div className="ml-auto">
                <CareerPlanStatusBadge status={plan.status} />
              </div>
            </div>

            {plan.notes && (
              <div className="rounded-lg bg-muted/50 p-3 text-sm text-muted-foreground">
                {plan.notes}
              </div>
            )}

            {/* Year milestones */}
            {plan.years && plan.years.length > 0 && (
              <div className="space-y-3 pt-2">
                <h3 className="text-sm font-medium">Year Milestones</h3>
                <div className="relative space-y-4 pl-6 before:absolute before:left-2 before:top-0 before:h-full before:w-px before:bg-border">
                  {[...plan.years]
                    .sort((a, b) => a.yearNumber - b.yearNumber)
                    .map((yr) => (
                      <div key={yr.id} className="relative">
                        {/* Timeline dot */}
                        <span className="absolute -left-6 top-1 flex size-4 items-center justify-center rounded-full border bg-background text-[10px] font-bold">
                          {yr.yearNumber}
                        </span>
                        <div className="rounded-lg border p-3 space-y-1.5 text-sm">
                          <div className="flex items-center justify-between gap-2">
                            <p className="font-medium">Year {yr.yearNumber}: {yr.title}</p>
                            <CareerPlanStatusBadge status={yr.status} />
                          </div>
                          {yr.goals && yr.goals.length > 0 && (
                            <ul className="list-disc pl-4 text-muted-foreground space-y-0.5">
                              {yr.goals.map((g, i) => (
                                <li key={i}>{g}</li>
                              ))}
                            </ul>
                          )}
                          {yr.prerequisites && yr.prerequisites.length > 0 && (
                            <div className="text-xs text-muted-foreground">
                              <span className="font-medium">Prerequisites: </span>
                              {yr.prerequisites.join(", ")}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            )}
          </>
        ) : (
          <p className="text-sm text-muted-foreground">No career plan on record.</p>
        )}
      </div>

      {/* Promotion Recommendations */}
      <div className="rounded-xl border p-5 space-y-3">
        <div className="flex items-center gap-2">
          <FileText className="size-4 text-muted-foreground" />
          <h2 className="font-semibold">Promotion Recommendations</h2>
        </div>

        {recommendations.length === 0 ? (
          <p className="text-sm text-muted-foreground">No promotion recommendations on record.</p>
        ) : (
          <div className="space-y-2">
            {recommendations.map((rec) => (
              <div
                key={rec.id}
                className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm"
              >
                <div>
                  <p className="font-medium">
                    {rec.reason ?? "Promotion recommendation"}
                  </p>
                  {rec.submittedAt && (
                    <p className="text-xs text-muted-foreground">
                      Submitted {format(new Date(rec.submittedAt), "d MMM yyyy")}
                    </p>
                  )}
                  {!rec.submittedAt && (
                    <p className="text-xs text-muted-foreground">
                      Created {format(new Date(rec.createdAt), "d MMM yyyy")}
                    </p>
                  )}
                </div>
                <PromotionRecommendationStatusBadge status={rec.status} />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Performance Journal */}
      <div className="rounded-xl border p-5 space-y-4">
        <div className="flex items-center gap-2">
          <BookOpen className="size-4 text-muted-foreground" />
          <h2 className="font-semibold">Performance Journal</h2>
        </div>

        {journalYears.length === 0 ? (
          <p className="text-sm text-muted-foreground">No journal entries on record.</p>
        ) : (
          <div className="space-y-6">
            {journalYears.map((year) => (
              <div key={year}>
                <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {year}
                </p>
                <div className="relative space-y-3 pl-5 before:absolute before:left-1.5 before:top-0 before:h-full before:w-px before:bg-border">
                  {(journalByYear[year] ?? []).map((entry) => (
                    <div key={entry.id} className="relative">
                      <span className="absolute -left-5 top-1.5 size-3 rounded-full border bg-background" />
                      <div className="rounded-lg border p-3 text-sm space-y-1">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-xs text-muted-foreground">
                            {format(parseISO(entry.entryDate), "d MMM yyyy")}
                          </p>
                          <JournalEntryTypeBadge type={entry.entryType} />
                        </div>
                        <p className="text-foreground">{entry.body}</p>
                        {entry.visibleToStaff && (
                          <p className="text-xs text-muted-foreground italic">Visible to staff member</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Appraisals Tab
// ---------------------------------------------------------------------------

function AppraisalsTab({ staffProfileId }: { staffProfileId: string }) {
  const { data: appraisalList, isLoading } = useQuery(
    orpc.appraisals.getByStaff.queryOptions({ input: { staffProfileId } }),
  );

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-10 w-full rounded" />
        <Skeleton className="h-10 w-full rounded" />
        <Skeleton className="h-10 w-full rounded" />
      </div>
    );
  }

  if (!appraisalList || appraisalList.length === 0) {
    return (
      <div className="rounded-xl border p-8 text-center">
        <p className="text-sm text-muted-foreground">No appraisals on record.</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-muted/40">
            <th className="px-4 py-3 text-left font-medium text-muted-foreground">Period</th>
            <th className="px-4 py-3 text-left font-medium text-muted-foreground">Type of Review</th>
            <th className="px-4 py-3 text-left font-medium text-muted-foreground">Status</th>
            <th className="px-4 py-3 text-left font-medium text-muted-foreground">Score</th>
            <th className="px-4 py-3 text-right font-medium text-muted-foreground">Action</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {appraisalList.map((appraisal) => (
            <tr key={appraisal.id} className="hover:bg-muted/30 transition-colors">
              <td className="px-4 py-3">
                {format(parseISO(appraisal.periodStart), "d MMM yyyy")}
                {" — "}
                {format(parseISO(appraisal.periodEnd), "d MMM yyyy")}
              </td>
              <td className="px-4 py-3 text-muted-foreground">
                {appraisal.typeOfReview ?? "—"}
              </td>
              <td className="px-4 py-3">
                <AppraisalStatusBadge status={appraisal.status} />
              </td>
              <td className="px-4 py-3">
                {appraisal.percentageScore != null ? (
                  <span className="font-mono font-medium">{appraisal.percentageScore}%</span>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </td>
              <td className="px-4 py-3 text-right">
                <Link
                  to="/appraisals/$appraisalId"
                  params={{ appraisalId: appraisal.id }}
                  className="text-primary underline-offset-2 hover:underline text-xs font-medium"
                >
                  View
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Access Tab
// ---------------------------------------------------------------------------

const PRIVILEGE_COLORS: Record<string, string> = {
  admin: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200",
  operator: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200",
  read_only: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200",
  auditor: "bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-200",
  custom: "bg-muted text-muted-foreground",
  none: "bg-muted text-muted-foreground line-through",
};

function PrivilegePill({ level }: { level: string | null }) {
  if (!level) return <span className="text-xs text-muted-foreground">—</span>;
  return (
    <span
      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
        PRIVILEGE_COLORS[level] ?? PRIVILEGE_COLORS.custom
      }`}
    >
      {level.replace(/_/g, " ")}
    </span>
  );
}

function AccessTab({ staffProfileId }: { staffProfileId: string }) {
  const { data: rows, isLoading } = useQuery(
    orpc.accessRegistry.listByStaff.queryOptions({ input: { staffId: staffProfileId } }),
  );

  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </div>
    );
  }

  if (!rows || rows.length === 0) {
    return (
      <div className="rounded-xl border border-dashed py-12 text-center text-muted-foreground">
        <Shield className="mx-auto mb-3 h-8 w-8 opacity-50" />
        <p className="font-medium text-foreground">No platform accounts</p>
        <p className="mt-1 text-sm">
          No service access registry entries found for this staff member.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {rows.length} platform account{rows.length !== 1 ? "s" : ""} registered
        </p>
        <Link to="/access/registry/$staffId" params={{ staffId: staffProfileId }}>
          <Button variant="outline" size="sm">
            <Key className="mr-1.5 size-3.5" />
            Full registry view
          </Button>
        </Link>
      </div>
      <div className="rounded-md border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Platform</th>
              <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Username</th>
              <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Privilege</th>
              <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Groups</th>
              <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b last:border-0">
                <td className="px-4 py-3 font-medium">
                  {r.platform?.name ?? <span className="text-muted-foreground">—</span>}
                </td>
                <td className="px-4 py-3 font-mono text-xs">
                  {r.accountUsername ?? <span className="text-muted-foreground">—</span>}
                </td>
                <td className="px-4 py-3">
                  <PrivilegePill level={r.privilegeLevel} />
                </td>
                <td className="px-4 py-3 max-w-xs">
                  {r.privilegeGroups && r.privilegeGroups.length > 0 ? (
                    <div className="flex flex-wrap gap-1">
                      {r.privilegeGroups.map((g) => (
                        <span key={g} className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
                          {g}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                      r.accountActive
                        ? "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200"
                        : "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200"
                    }`}
                  >
                    {r.accountActive ? "Active" : "Inactive"}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Alerts banner helpers + Main page
// ---------------------------------------------------------------------------

function daysUntilNextBirthday(birthdayStr: string): number {
  const today = new Date();
  const bday = parseISO(birthdayStr);
  // Set birthday to this year
  const thisYear = new Date(today.getFullYear(), bday.getMonth(), bday.getDate());
  const nextYear = new Date(today.getFullYear() + 1, bday.getMonth(), bday.getDate());
  const diff = differenceInDays(thisYear, today);
  if (diff < 0) {
    return differenceInDays(nextYear, today);
  }
  return diff;
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------
// Attendance Tab
// ---------------------------------------------------------------------------

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

const ATT_GLYPH: Record<AttendanceDailyStatus, string> = {
  on_site: "P", wfh: "W", late: "L", half_day: "½",
  annual_leave: "A", sick: "S", compassionate: "C",
  maternity_paternity: "M", absent: "X", holiday: "★",
};

const ATT_LABEL: Record<AttendanceDailyStatus, string> = {
  on_site: "On Site", wfh: "WFH", late: "Late", half_day: "Half Day",
  annual_leave: "Annual Leave", sick: "Sick", compassionate: "Compassionate",
  maternity_paternity: "Mat/Pat", absent: "Absent", holiday: "Holiday",
};

const ATT_CELL_CLASS: Record<AttendanceDailyStatus, string> = {
  on_site: "bg-blue-50 text-blue-800 dark:bg-blue-950/40 dark:text-blue-200",
  wfh: "bg-blue-100/60 text-blue-600 dark:bg-blue-900/30 dark:text-blue-300",
  late: "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-200",
  half_day: "bg-indigo-50 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-200",
  annual_leave: "bg-violet-50 text-violet-800 dark:bg-violet-950/40 dark:text-violet-200",
  sick: "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-200",
  compassionate: "bg-purple-100 text-purple-800 dark:bg-purple-950/40 dark:text-purple-200",
  maternity_paternity: "bg-pink-100 text-pink-800 dark:bg-pink-950/40 dark:text-pink-200",
  absent: "bg-red-100 text-red-900 font-bold dark:bg-red-950/50 dark:text-red-200",
  holiday: "bg-violet-100 text-violet-900 dark:bg-violet-950/40 dark:text-violet-200",
};

const ATT_MONTH_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];
const ATT_STATUSES = Object.keys(ATT_GLYPH) as AttendanceDailyStatus[];

function AttendanceTab({ staffProfileId }: { staffProfileId: string }) {
  const currentYear = new Date().getFullYear();
  const [attYear, setAttYear] = useState(currentYear);

  const cardQuery = useQuery(
    orpc.attendanceDaily.getCard.queryOptions({
      input: { staffProfileId, year: attYear },
    }),
  );

  const breakdownQuery = useQuery(
    orpc.attendanceDaily.getMonthlyBreakdown.queryOptions({
      input: { staffProfileId, year: attYear },
    }),
  );

  const isLoading = cardQuery.isLoading || breakdownQuery.isLoading;

  const dayMap = new Map<string, AttendanceDailyStatus>();
  for (const row of cardQuery.data ?? []) {
    dayMap.set(row.date, row.status as AttendanceDailyStatus);
  }

  const kpis = { on_site: 0, wfh: 0, absent: 0, leave: 0, late: 0, holiday: 0 };
  for (const row of cardQuery.data ?? []) {
    const s = row.status as AttendanceDailyStatus;
    if (s === "on_site") kpis.on_site++;
    else if (s === "wfh") kpis.wfh++;
    else if (s === "absent") kpis.absent++;
    else if (s === "annual_leave" || s === "sick" || s === "compassionate" || s === "maternity_paternity") kpis.leave++;
    else if (s === "late") kpis.late++;
    else if (s === "holiday") kpis.holiday++;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <CalendarDays className="size-4 text-muted-foreground" />
          <h2 className="font-semibold">Attendance Card</h2>
        </div>
        <Select
          value={String(attYear)}
          onValueChange={(v) => v && setAttYear(Number(v))}
        >
          <SelectTrigger className="w-24 h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {[currentYear - 1, currentYear].map((y) => (
              <SelectItem key={y} value={String(y)}>{y}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          <Skeleton className="h-24 w-full rounded-xl" />
          <Skeleton className="h-48 w-full rounded-xl" />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
            {[
              { label: "On Site", value: kpis.on_site, cls: "text-blue-700 dark:text-blue-300" },
              { label: "WFH", value: kpis.wfh, cls: "text-blue-500 dark:text-blue-400" },
              { label: "Absent", value: kpis.absent, cls: "text-red-700 dark:text-red-300" },
              { label: "Leave", value: kpis.leave, cls: "text-violet-700 dark:text-violet-300" },
              { label: "Late", value: kpis.late, cls: "text-amber-700 dark:text-amber-300" },
              { label: "Holiday", value: kpis.holiday, cls: "text-purple-700 dark:text-purple-300" },
            ].map((k) => (
              <div key={k.label} className="rounded-xl border p-3 text-center">
                <p className={`text-2xl font-bold ${k.cls}`}>{k.value}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{k.label}</p>
              </div>
            ))}
          </div>

          <div className="rounded-xl border p-4 space-y-3">
            <h3 className="text-sm font-medium text-muted-foreground">Year Heatmap</h3>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
              {ATT_MONTH_NAMES.map((mLabel, mIdx) => {
                const m = mIdx + 1;
                const daysInM = new Date(attYear, m, 0).getDate();
                return (
                  <div key={m} className="space-y-1">
                    <p className="text-xs font-medium text-muted-foreground">{mLabel}</p>
                    <div className="flex flex-wrap gap-0.5">
                      {Array.from({ length: daysInM }, (_, d) => {
                        const dateStr = `${attYear}-${String(m).padStart(2, "0")}-${String(d + 1).padStart(2, "0")}`;
                        const status = dayMap.get(dateStr);
                        return (
                          <span
                            key={d}
                            title={status ? `${dateStr}: ${ATT_LABEL[status]}` : dateStr}
                            className={`inline-flex size-4 items-center justify-center rounded-sm text-[8px] font-bold ${
                              status ? ATT_CELL_CLASS[status] : "bg-muted/30 text-muted-foreground/20"
                            }`}
                          >
                            {status ? ATT_GLYPH[status] : "·"}
                          </span>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="flex flex-wrap gap-1.5 pt-2 border-t">
              {ATT_STATUSES.map((s) => (
                <span key={s} className={`inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-medium ${ATT_CELL_CLASS[s]}`}>
                  {ATT_GLYPH[s]} {ATT_LABEL[s]}
                </span>
              ))}
            </div>
          </div>

          <div className="rounded-xl border overflow-hidden">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b bg-muted/40">
                  <th className="px-3 py-2 text-left font-medium">Month</th>
                  <th className="px-2 py-2 text-center font-medium text-blue-700">P</th>
                  <th className="px-2 py-2 text-center font-medium text-blue-500">W</th>
                  <th className="px-2 py-2 text-center font-medium text-amber-700">L</th>
                  <th className="px-2 py-2 text-center font-medium text-indigo-700">½</th>
                  <th className="px-2 py-2 text-center font-medium text-violet-700">A</th>
                  <th className="px-2 py-2 text-center font-medium text-red-600">S</th>
                  <th className="px-2 py-2 text-center font-medium text-red-900">X</th>
                  <th className="px-2 py-2 text-center font-medium text-violet-900">★</th>
                  <th className="px-2 py-2 text-center font-medium text-muted-foreground">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {(breakdownQuery.data ?? []).map((row) => (
                  <tr key={String(row.month)} className="hover:bg-muted/20 transition-colors">
                    <td className="px-3 py-1.5 font-medium">{String(row.monthLabel)}</td>
                    <td className="px-2 py-1.5 text-center">{Number(row.on_site) || "—"}</td>
                    <td className="px-2 py-1.5 text-center">{Number(row.wfh) || "—"}</td>
                    <td className="px-2 py-1.5 text-center">{Number(row.late) || "—"}</td>
                    <td className="px-2 py-1.5 text-center">{Number(row.half_day) || "—"}</td>
                    <td className="px-2 py-1.5 text-center">{Number(row.annual_leave) || "—"}</td>
                    <td className="px-2 py-1.5 text-center">{Number(row.sick) || "—"}</td>
                    <td className="px-2 py-1.5 text-center">{Number(row.absent) || "—"}</td>
                    <td className="px-2 py-1.5 text-center">{Number(row.holiday) || "—"}</td>
                    <td className="px-2 py-1.5 text-center text-muted-foreground">
                      {Number(row.working) || "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------

function profileInitials(name?: string | null): string {
  if (!name) return "?";
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

function StaffProfilePage() {
  const { staffId } = Route.useParams();
  const [editOpen, setEditOpen] = useState(false);
  const [dismissedAlerts, setDismissedAlerts] = useState<Set<string>>(new Set());
  const [advancesOpen, setAdvancesOpen] = useState(false);
  const [lifecycleOpen, setLifecycleOpen] = useState(false);
  const lifecycleQc = useQueryClient();

  const { data: profile, isLoading, error } = useQuery(
    orpc.staff.get.queryOptions({ input: { id: staffId } }),
  );

  function onLifecycleDone() {
    lifecycleQc.invalidateQueries({ queryKey: orpc.staff.get.key() });
    lifecycleQc.invalidateQueries({ queryKey: orpc.staff.list.key() });
    setLifecycleOpen(false);
  }
  const deactivateMutation = useMutation(
    orpc.staff.deactivate.mutationOptions({
      onSuccess: () => {
        toast.success("Staff member marked as former staff.");
        onLifecycleDone();
      },
      onError: (e) => toast.error(e.message),
    }),
  );
  const reactivateMutation = useMutation(
    orpc.staff.reactivate.mutationOptions({
      onSuccess: () => {
        toast.success("Staff member reactivated.");
        onLifecycleDone();
      },
      onError: (e) => toast.error(e.message),
    }),
  );

  const { data: staffContracts } = useQuery(
    orpc.contracts.list.queryOptions({ input: { staffProfileId: staffId, limit: 10 } }),
  );

  const { data: attendanceYear } = useQuery(
    orpc.attendanceDaily.getCard.queryOptions({
      input: { staffProfileId: staffId, year: new Date().getFullYear() },
    }),
  );

  const attendanceYtd = (() => {
    const rows = attendanceYear ?? [];
    const recorded = rows.filter((r) => r.status !== "holiday").length;
    if (recorded === 0) return null;
    const present = rows.filter(
      (r) => r.status === "on_site" || r.status === "wfh" || r.status === "late" || r.status === "half_day",
    ).length;
    return Math.round((present / recorded) * 100);
  })();

  const { data: staffAdvances, isLoading: advancesLoading } = useQuery({
    ...orpc.advances.list.queryOptions({ input: { staffProfileId: staffId, limit: 5 } }),
    enabled: advancesOpen,
  });

  function dismissAlert(key: string) {
    setDismissedAlerts((prev) => new Set([...prev, key]));
  }

  if (isLoading) {
    return (
      <>
        <Header fixed>
          <div className="flex items-center gap-2">
            <Users className="size-4 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">Staff Directory</span>
          </div>
        </Header>
        <Main>
          <Skeleton className="mb-4 h-8 w-48" />
          <Skeleton className="mb-2 h-4 w-64" />
          <Skeleton className="h-4 w-48" />
        </Main>
      </>
    );
  }

  if (error || !profile) {
    return (
      <Main>
        <p className="text-muted-foreground">Staff profile not found.</p>
        <Link to="/staff">
          <Button variant="outline" className="mt-4">
            Back to Directory
          </Button>
        </Link>
      </Main>
    );
  }

  return (
    <>
      <Header fixed>
        <div className="flex items-center gap-2">
          <Users className="size-4 text-muted-foreground" />
          <Link to="/staff" className="text-sm text-muted-foreground hover:text-foreground">
            Staff Directory
          </Link>
          <span className="text-muted-foreground">/</span>
          <span className="text-sm font-medium">{profile.user?.name}</span>
        </div>
        <div className="ms-auto flex items-center gap-2 print:hidden">
          <Button variant="outline" size="sm" onClick={() => window.print()}>
            <Download className="mr-1.5 size-3.5" />
            Export PDF
          </Button>
        </div>
      </Header>

      <Main>
        {/* Back link / breadcrumb */}
        <div className="mb-4 flex items-center justify-between gap-3">
          <Link
            to="/staff"
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-4" />
            Directory
          </Link>
          <div className="flex items-center gap-2">
            {isFormerStatus(profile.status) ? (
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={() => setLifecycleOpen(true)}
              >
                <UserCheck className="size-3.5" />
                Reactivate
              </Button>
            ) : (
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 text-red-600 hover:text-red-700"
                onClick={() => setLifecycleOpen(true)}
              >
                <UserX className="size-3.5" />
                Deactivate
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => setEditOpen(true)}
            >
              <Pencil className="size-3.5" />
              Edit
            </Button>
          </div>
        </div>

        {/* Deactivate / Reactivate confirmation */}
        <Dialog open={lifecycleOpen} onOpenChange={setLifecycleOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>
                {isFormerStatus(profile.status)
                  ? "Reactivate staff member"
                  : "Mark as former staff"}
              </DialogTitle>
              <DialogDescription>
                {isFormerStatus(profile.status)
                  ? `${profile.user?.name ?? "This person"} will be returned to active employment and reappear in active staff lists.`
                  : `${profile.user?.name ?? "This person"} will be marked as former staff and hidden from active staff lists. Their historical records (leave, attendance, appraisals) are preserved.`}
              </DialogDescription>
            </DialogHeader>
            {!isFormerStatus(profile.status) && (
              <p className="text-xs text-muted-foreground">
                Marks this person as former staff. Their attendance, leave and
                appraisal history stay intact and they can be reactivated later.
              </p>
            )}
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setLifecycleOpen(false)}
                disabled={deactivateMutation.isPending || reactivateMutation.isPending}
              >
                Cancel
              </Button>
              {isFormerStatus(profile.status) ? (
                <Button
                  onClick={() => reactivateMutation.mutate({ id: staffId })}
                  disabled={reactivateMutation.isPending}
                >
                  {reactivateMutation.isPending ? "Reactivating…" : "Reactivate"}
                </Button>
              ) : (
                <Button
                  variant="destructive"
                  onClick={() => deactivateMutation.mutate({ id: staffId })}
                  disabled={deactivateMutation.isPending}
                >
                  {deactivateMutation.isPending ? "Updating…" : "Mark as former"}
                </Button>
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Header card */}
        <div className="mb-6 rounded-xl border p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="flex size-16 shrink-0 items-center justify-center rounded-full bg-primary/10 text-2xl font-bold text-primary">
                {profileInitials(profile.user?.name)}
              </div>
              <div>
                <h1 className="text-2xl font-bold">
                  {profile.user?.name}
                  {isFormerStatus(profile.status) && <FormerTag />}
                </h1>
                <p className="text-sm text-muted-foreground">
                  {profile.jobTitle}
                  {profile.department?.name ? ` · ${profile.department.name}` : ""}
                </p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <StaffStatusBadge status={profile.status} />
                  {profile.isTeamLead && (
                    <span className="inline-flex items-center rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
                      Team Lead
                    </span>
                  )}
                  {profile.isOnCallEligible && (
                    <span className="inline-flex items-center rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-medium text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">
                      On-Call
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="text-right">
              <p className="text-3xl font-bold text-blue-600 dark:text-blue-400">
                {attendanceYtd != null ? `${attendanceYtd}%` : "—"}
              </p>
              <p className="text-xs text-muted-foreground">attendance YTD</p>
              <Link
                to="/staff/$staffId"
                params={{ staffId }}
                hash="attendance"
                className="mt-1 inline-flex items-center gap-1 text-xs text-primary hover:underline"
              >
                View roll-call
                <ChevronRight className="size-3" />
              </Link>
            </div>
          </div>

          {/* Four-field row */}
          <div className="mt-5 grid grid-cols-2 gap-4 border-t pt-4 sm:grid-cols-4">
            <div>
              <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                Employee ID
              </p>
              <p className="mt-0.5 font-mono text-sm font-medium">{profile.employeeId}</p>
            </div>
            <div>
              <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                Department
              </p>
              <p className="mt-0.5 text-sm">{profile.department?.name ?? "—"}</p>
            </div>
            <div>
              <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                Team
              </p>
              <p className="mt-0.5 text-sm">{profile.isTeamLead ? "Team Lead" : "—"}</p>
            </div>
            <div>
              <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                Status
              </p>
              <p className="mt-0.5">
                <StaffStatusBadge status={profile.status} />
              </p>
            </div>
          </div>
        </div>

        <Tabs defaultValue="overview" className="space-y-6">
          <TabsList className="flex flex-wrap gap-1">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="career">Career Path</TabsTrigger>
            <TabsTrigger value="appraisals">Appraisals</TabsTrigger>
            <TabsTrigger value="attendance">Attendance</TabsTrigger>
            <TabsTrigger value="operational">Operational HR</TabsTrigger>
            <TabsTrigger value="policy">Policy & Compliance</TabsTrigger>
            <TabsTrigger value="access">Access</TabsTrigger>
          </TabsList>

          {/* ----------------------------------------------------------------
              Overview Tab
          ---------------------------------------------------------------- */}
          <TabsContent value="overview" className="space-y-6">
            {/* Alerts banners */}
            {(() => {
              const alerts: Array<{ key: string; color: "amber" | "red"; icon: React.ReactNode; text: string }> = [];

              // Birthday alert (within 14 days)
              const profileTyped = profile as typeof profile & { birthday?: string | null; emergencyContactName?: string | null; emergencyContactPhone?: string | null; nextAppraisalDate?: string | null; notes?: string | null };
              if (profileTyped.birthday) {
                const bdayDays = daysUntilNextBirthday(profileTyped.birthday);
                if (bdayDays <= 14 && !dismissedAlerts.has("birthday")) {
                  alerts.push({
                    key: "birthday",
                    color: "amber",
                    icon: <Calendar className="size-4 shrink-0" />,
                    text: bdayDays === 0
                      ? `Birthday today! — ${format(parseISO(profileTyped.birthday), "d MMM")}`
                      : `Birthday in ${bdayDays} day${bdayDays !== 1 ? "s" : ""} — ${format(parseISO(profileTyped.birthday), "d MMM")}`,
                  });
                }
              }

              // Contract expiry alert (within 30 days)
              if (staffContracts) {
                for (const c of staffContracts) {
                  if (c.endDate && (c.status === "active" || c.status === "expiring_soon")) {
                    const daysLeft = differenceInDays(parseISO(c.endDate), new Date());
                    if (daysLeft >= 0 && daysLeft <= 30 && !dismissedAlerts.has(`contract-${c.id}`)) {
                      alerts.push({
                        key: `contract-${c.id}`,
                        color: daysLeft < 14 ? "red" : "amber",
                        icon: <AlertTriangle className="size-4 shrink-0" />,
                        text: `Contract expiring in ${daysLeft} day${daysLeft !== 1 ? "s" : ""} — ${c.contractType}`,
                      });
                    }
                  }
                }
              }

              // Next appraisal alert (within 30 days)
              if (profileTyped.nextAppraisalDate && !dismissedAlerts.has("appraisal")) {
                const appraisalDays = differenceInDays(parseISO(profileTyped.nextAppraisalDate), new Date());
                if (appraisalDays >= 0 && appraisalDays <= 30) {
                  alerts.push({
                    key: "appraisal",
                    color: "amber",
                    icon: <FileText className="size-4 shrink-0" />,
                    text: `Appraisal due in ${appraisalDays} day${appraisalDays !== 1 ? "s" : ""} — ${format(parseISO(profileTyped.nextAppraisalDate), "d MMM yyyy")}`,
                  });
                }
              }

              if (alerts.length === 0) return null;

              return (
                <div className="space-y-2">
                  {alerts.map((alert) => (
                    <div
                      key={alert.key}
                      className={`flex items-center gap-2 rounded-lg border px-4 py-2.5 text-sm ${
                        alert.color === "red"
                          ? "border-red-300 bg-red-50 text-red-800 dark:bg-red-950/30 dark:text-red-200 dark:border-red-800"
                          : "border-amber-300 bg-amber-50 text-amber-800 dark:bg-amber-950/30 dark:text-amber-200 dark:border-amber-800"
                      }`}
                    >
                      {alert.icon}
                      <span className="flex-1">{alert.text}</span>
                      <button
                        type="button"
                        onClick={() => dismissAlert(alert.key)}
                        className="ml-2 opacity-60 hover:opacity-100"
                      >
                        <X className="size-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              );
            })()}

            <div className="grid gap-6 lg:grid-cols-3">
              <div className="lg:col-span-2 space-y-6">
                <div className="rounded-xl border p-5 space-y-4">
                  <h2 className="font-semibold">Employment Details</h2>

                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <p className="mb-1 text-xs text-muted-foreground">Employee ID</p>
                      <p className="font-mono font-medium">{profile.employeeId}</p>
                    </div>
                    <div>
                      <p className="mb-1 text-xs text-muted-foreground">Employment Type</p>
                      <EmploymentTypeBadge type={profile.employmentType} />
                    </div>
                    <div>
                      <p className="mb-1 text-xs text-muted-foreground">Start Date</p>
                      <p>{profile.startDate ? format(new Date(profile.startDate), "dd MMM yyyy") : "—"}</p>
                    </div>
                    <div>
                      <p className="mb-1 text-xs text-muted-foreground">Department</p>
                      <p className="flex items-center gap-1">
                        <Building2 className="size-3.5 text-muted-foreground" />
                        {profile.department?.name ?? "—"}
                      </p>
                    </div>
                  </div>

                  <Separator />

                  <div className="flex flex-wrap gap-3 text-sm">
                    {profile.isTeamLead && (
                      <span className="flex items-center gap-1 rounded-full border px-3 py-1 text-xs">
                        <ShieldCheck className="size-3.5 text-amber-500" />
                        Team Lead
                      </span>
                    )}
                    {profile.isLeadEngineerEligible && (
                      <span className="flex items-center gap-1 rounded-full border px-3 py-1 text-xs">
                        <ShieldCheck className="size-3.5 text-indigo-500" />
                        Lead Engineer Eligible
                      </span>
                    )}
                    {profile.isOnCallEligible && (
                      <span className="flex items-center gap-1 rounded-full border px-3 py-1 text-xs">
                        <Calendar className="size-3.5 text-blue-500" />
                        On-Call Eligible
                      </span>
                    )}
                  </div>
                </div>

                <div className="rounded-xl border p-5 space-y-4">
                  <div className="flex items-center justify-between gap-3">
                    <h2 className="font-semibold">Contact & Emergency</h2>
                    <span className="rounded-full border px-2.5 py-0.5 text-[11px] text-muted-foreground">
                      Self-service editable
                    </span>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="rounded-lg border bg-muted/20 p-4">
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">Phone Number</p>
                      <p className="mt-1 font-medium">{profile.phoneNumber ?? "—"}</p>
                    </div>
                    <div className="rounded-lg border bg-muted/20 p-4">
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">Emergency Contacts</p>
                      <p className="mt-1 font-medium">
                        {Array.isArray(profile.emergencyContacts) ? profile.emergencyContacts.length : 0} saved
                      </p>
                    </div>
                  </div>

                  {/* Single emergency contact (from new flat fields) */}
                  {(() => {
                    const p = profile as typeof profile & { emergencyContactName?: string | null; emergencyContactPhone?: string | null };
                    if (!p.emergencyContactName && !p.emergencyContactPhone) return null;
                    return (
                      <div className="flex items-start gap-3">
                        <Phone className="mt-0.5 size-4 text-muted-foreground" />
                        <div>
                          <p className="text-xs text-muted-foreground">Emergency Contact</p>
                          <p className="text-sm font-medium">
                            {p.emergencyContactName ?? "—"}
                            {p.emergencyContactPhone ? ` · ${p.emergencyContactPhone}` : ""}
                          </p>
                        </div>
                      </div>
                    );
                  })()}

                  <div className="space-y-2">
                    {(Array.isArray(profile.emergencyContacts) ? profile.emergencyContacts : []).length > 0 ? (
                      (profile.emergencyContacts as Array<{ name?: string; phone?: string; relation?: string }>).map(
                        (contact, index) => (
                          <div key={`${contact.name ?? "contact"}-${index}`} className="flex items-center gap-3 rounded-lg border px-3 py-2 text-sm">
                            <HeartHandshake className="size-4 text-muted-foreground" />
                            <div className="min-w-0 flex-1">
                              <p className="font-medium">{contact.name ?? "Emergency Contact"}</p>
                              <p className="text-xs text-muted-foreground">
                                {contact.phone ?? "—"}
                                {contact.relation ? ` • ${contact.relation}` : ""}
                              </p>
                            </div>
                          </div>
                        ),
                      )
                    ) : null}
                  </div>

                  {/* Notes */}
                  {(() => {
                    const p = profile as typeof profile & { notes?: string | null };
                    if (!p.notes) return null;
                    return (
                      <div className="rounded-lg bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
                        <p className="text-xs font-medium text-muted-foreground mb-1">Notes</p>
                        {p.notes}
                      </div>
                    );
                  })()}
                </div>

                {/* Advance Requests mini-panel */}
                <div className="rounded-xl border">
                  <button
                    type="button"
                    className="flex w-full items-center justify-between p-4 text-left"
                    onClick={() => setAdvancesOpen((o) => !o)}
                  >
                    <span className="font-semibold text-sm">Advance Requests</span>
                    {advancesOpen ? (
                      <ChevronDown className="size-4 text-muted-foreground" />
                    ) : (
                      <ChevronRight className="size-4 text-muted-foreground" />
                    )}
                  </button>
                  {advancesOpen && (
                    <div className="border-t px-4 py-4 space-y-3">
                      {advancesLoading ? (
                        <div className="space-y-2">
                          {[1, 2].map((i) => (
                            <Skeleton key={i} className="h-10 w-full" />
                          ))}
                        </div>
                      ) : !staffAdvances || staffAdvances.length === 0 ? (
                        <p className="text-sm text-muted-foreground">No advance requests on file.</p>
                      ) : (
                        <div className="divide-y rounded-lg border overflow-hidden">
                          {staffAdvances.map((adv) => (
                            <div key={adv.id} className="flex items-center justify-between px-3 py-2 text-sm hover:bg-muted/30">
                              <div className="min-w-0">
                                <p className="font-medium truncate">{adv.purpose}</p>
                                <p className="text-xs text-muted-foreground">
                                  {adv.dateRequested ? format(parseISO(adv.dateRequested), "d MMM yyyy") : "—"}
                                </p>
                              </div>
                              <div className="flex items-center gap-3 ml-3 shrink-0">
                                <span className="font-mono text-sm">${Number(adv.totalAmount ?? 0).toLocaleString()}</span>
                                <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                                  adv.status === "cleared"
                                    ? "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300"
                                    : adv.status === "partial"
                                    ? "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300"
                                    : "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300"
                                }`}>
                                  {adv.status === "cleared" ? "Cleared" : adv.status === "partial" ? "Partial" : "Pending"}
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                      <Link to="/advances" className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
                        View all advances
                        <ChevronRight className="size-3" />
                      </Link>
                    </div>
                  )}
                </div>

                <div className="rounded-xl border p-5">
                  <h2 className="mb-4 font-semibold">Operational HR</h2>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Link
                      to="/hr/ppe"
                      className="flex items-center gap-3 rounded-xl border px-3 py-2 text-sm hover:bg-accent"
                    >
                      <HardHat className="size-4 text-muted-foreground" />
                      PPE & Tools
                    </Link>
                    <Link
                      to="/timesheets"
                      className="flex items-center gap-3 rounded-xl border px-3 py-2 text-sm hover:bg-accent"
                    >
                      <Clock3 className="size-4 text-muted-foreground" />
                      Timesheets & Lateness
                    </Link>
                    <Link
                      to="/timesheets"
                      className="flex items-center gap-3 rounded-xl border px-3 py-2 text-sm hover:bg-accent"
                    >
                      <ListChecks className="size-4 text-muted-foreground" />
                      Timesheets
                    </Link>
                    <Link
                      to="/policy"
                      className="flex items-center gap-3 rounded-xl border px-3 py-2 text-sm hover:bg-accent"
                    >
                      <FileText className="size-4 text-muted-foreground" />
                      Policies & Forms
                    </Link>
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <div className="rounded-xl border p-4 space-y-3 text-sm">
                  <h3 className="font-semibold">Account</h3>
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Mail className="size-3.5 shrink-0" />
                    <span>{profile.user?.email ?? "—"}</span>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Role:{" "}
                    <span className="capitalize">
                      {(profile.user as Record<string, unknown>)?.role as string ?? "—"}
                    </span>
                  </div>
                </div>

                <div className="rounded-xl border p-4 text-sm">
                  <h3 className="font-semibold mb-2">Quick Links</h3>
                  <div className="space-y-1.5">
                    <Link to="/roster" className="block text-muted-foreground hover:text-foreground">
                      → Roster Schedule
                    </Link>
                    <Link to="/leave" className="block text-muted-foreground hover:text-foreground">
                      → Leave Records
                    </Link>
                    <Link to="/access" className="block text-muted-foreground hover:text-foreground">
                      → Platform Accounts
                    </Link>
                    <Link to="/import" className="block text-muted-foreground hover:text-foreground">
                      → Bulk Import
                    </Link>
                  </div>
                </div>
              </div>
            </div>
          </TabsContent>

          {/* ----------------------------------------------------------------
              Career Path Tab
          ---------------------------------------------------------------- */}
          <TabsContent value="career" className="space-y-4">
            <CareerPathTab staffProfileId={staffId} />
          </TabsContent>

          {/* ----------------------------------------------------------------
              Appraisals Tab
          ---------------------------------------------------------------- */}
          <TabsContent value="appraisals" className="space-y-4">
            <AppraisalsTab staffProfileId={staffId} />
          </TabsContent>

          {/* ----------------------------------------------------------------
              Operational HR Tab
          ---------------------------------------------------------------- */}
          <TabsContent value="operational" className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <Link to="/hr/ppe" className="rounded-xl border p-4 hover:bg-accent">
                <h3 className="font-semibold">PPE & Tools</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  Issuance, due dates, and replacements.
                </p>
              </Link>
              <Link to="/timesheets" className="rounded-xl border p-4 hover:bg-accent">
                <h3 className="font-semibold">Attendance</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  Sick leave, lateness, WFH, and other exceptions.
                </p>
              </Link>
              <Link to="/timesheets" className="rounded-xl border p-4 hover:bg-accent">
                <h3 className="font-semibold">Timesheets</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  Work periods, entries, and approval status.
                </p>
              </Link>
            </div>
          </TabsContent>

          {/* ----------------------------------------------------------------
              Policy & Compliance Tab
          ---------------------------------------------------------------- */}
          <TabsContent value="policy" className="space-y-4">
            <div className="rounded-xl border p-5">
              <h2 className="font-semibold">Policy & Compliance</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Published policies, acknowledgements, leave records, and training compliance
                remain the primary controls for internal governance.
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <Link to="/leave">
                  <Button variant="outline" size="sm">
                    Leave Records
                  </Button>
                </Link>
                <Link to="/compliance/items">
                  <Button variant="outline" size="sm">
                    Compliance Items
                  </Button>
                </Link>
                <Link to="/compliance/training">
                  <Button variant="outline" size="sm">
                    Training Records
                  </Button>
                </Link>
              </div>
            </div>
          </TabsContent>

          {/* ----------------------------------------------------------------
              Attendance Tab
          ---------------------------------------------------------------- */}
          <TabsContent value="attendance">
            <AttendanceTab staffProfileId={staffId} />
          </TabsContent>

          {/* ----------------------------------------------------------------
              Access Tab
          ---------------------------------------------------------------- */}
          <TabsContent value="access" className="space-y-4">
            <AccessTab staffProfileId={staffId} />
          </TabsContent>
        </Tabs>
      </Main>

      <EditProfileDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        staffId={staffId}
        initial={{
          jobTitle: profile.jobTitle ?? "",
          employmentType: (profile.employmentType as EditProfileForm["employmentType"]) ?? "full_time",
          status: (profile.status as EditProfileForm["status"]) ?? "active",
          emergencyContactName: (profile as typeof profile & { emergencyContactName?: string | null }).emergencyContactName ?? "",
          emergencyContactPhone: (profile as typeof profile & { emergencyContactPhone?: string | null }).emergencyContactPhone ?? "",
          nextAppraisalDate: (profile as typeof profile & { nextAppraisalDate?: string | null }).nextAppraisalDate ?? "",
          notes: (profile as typeof profile & { notes?: string | null }).notes ?? "",
        }}
      />
    </>
  );
}
