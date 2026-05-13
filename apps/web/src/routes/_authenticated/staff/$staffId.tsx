import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import { useState } from "react";
import {
  ArrowLeft,
  Building2,
  Calendar,
  Clock3,
  Download,
  HardHat,
  Key,
  ListChecks,
  Mail,
  Pencil,
  Shield,
  ShieldCheck,
  Users,
  BookOpen,
  TrendingUp,
  FileText,
  HeartHandshake,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@ndma-dcs-staff-portal/ui/components/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@ndma-dcs-staff-portal/ui/components/dialog";
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
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
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
// Main page
// ---------------------------------------------------------------------------

function StaffProfilePage() {
  const { staffId } = Route.useParams();
  const [editOpen, setEditOpen] = useState(false);

  const { data: profile, isLoading, error } = useQuery(
    orpc.staff.get.queryOptions({ input: { id: staffId } }),
  );

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
        <div className="mb-6 flex items-center gap-3">
          <Link to="/staff">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="size-4" />
            </Button>
          </Link>
          <div className="flex items-center gap-4">
            <div className="flex size-16 items-center justify-center rounded-full bg-muted text-2xl font-bold">
              {profile.user?.name?.[0] ?? "?"}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-bold">{profile.user?.name}</h1>
                <StaffStatusBadge status={profile.status} />
                <Button
                  variant="outline"
                  size="sm"
                  className="ml-1 h-7 gap-1.5 px-2 text-xs"
                  onClick={() => setEditOpen(true)}
                >
                  <Pencil className="size-3" />
                  Edit
                </Button>
              </div>
              <p className="text-muted-foreground">{profile.jobTitle}</p>
            </div>
          </div>
        </div>

        <Tabs defaultValue="overview" className="space-y-6">
          <TabsList className="flex flex-wrap gap-1">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="career">Career Path</TabsTrigger>
            <TabsTrigger value="appraisals">Appraisals</TabsTrigger>
            <TabsTrigger value="operational">Operational HR</TabsTrigger>
            <TabsTrigger value="policy">Policy & Compliance</TabsTrigger>
            <TabsTrigger value="access">Access</TabsTrigger>
          </TabsList>

          {/* ----------------------------------------------------------------
              Overview Tab
          ---------------------------------------------------------------- */}
        <TabsContent value="overview" className="space-y-6">
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
                    ) : (
                      <p className="text-sm text-muted-foreground">No emergency contacts saved yet.</p>
                    )}
                  </div>
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
        }}
      />
    </>
  );
}
