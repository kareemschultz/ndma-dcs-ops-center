import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { differenceInDays, format, parseISO } from "date-fns";
import {
  ArrowLeft,
  CalendarCheck,
  CalendarClock,
  CheckCircle2,
  FileText,
  Pencil,
  Plus,
  Trash2,
  TrendingUp,
} from "lucide-react";
import { toast } from "sonner";

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
import { Textarea } from "@ndma-dcs-staff-portal/ui/components/textarea";

import { Header } from "@/components/layout/header";
import { Main } from "@/components/layout/main";
import { ThemeSwitch } from "@/components/theme-switch";
import { orpc } from "@/utils/orpc";

export const Route = createFileRoute("/_authenticated/contracts/$contractId")({
  component: ContractDetailPage,
});

type CareerPlan = {
  id: string;
  staffId: string;
  targetYear: number;
  plannedRole: string;
  conditions?: string | null;
  status: "pending" | "achieved" | "missed";
};

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    active: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
    expiring_soon: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
    expired: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
    renewed: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
    terminated: "bg-muted text-muted-foreground",
  };
  const label = status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${map[status] ?? "bg-muted text-muted-foreground"}`}>
      {label}
    </span>
  );
}

function LifecycleDateRow({
  label,
  date,
  icon,
}: {
  label: string;
  date?: string | null;
  icon: React.ReactNode;
}) {
  const daysAway = date ? differenceInDays(parseISO(date), new Date()) : null;
  const urgency =
    daysAway === null
      ? "text-muted-foreground"
      : daysAway < 0
        ? "text-red-600"
        : daysAway <= 30
          ? "text-amber-600"
          : "text-muted-foreground";

  return (
    <div className="flex items-center gap-3 py-2.5 border-b last:border-0">
      <span className="text-muted-foreground">{icon}</span>
      <span className="flex-1 text-sm">{label}</span>
      {date ? (
        <div className="text-right">
          <p className="text-sm font-medium">{format(parseISO(date), "d MMM yyyy")}</p>
          {daysAway !== null && (
            <p className={`text-xs ${urgency}`}>
              {daysAway < 0 ? `${Math.abs(daysAway)}d overdue` : daysAway === 0 ? "Today" : `in ${daysAway}d`}
            </p>
          )}
        </div>
      ) : (
        <span className="text-xs text-muted-foreground">Not set</span>
      )}
    </div>
  );
}

function CareerPlanRow({
  plan,
  onEdit,
  onDelete,
}: {
  plan: CareerPlan;
  onEdit: (plan: CareerPlan) => void;
  onDelete: (id: string) => void;
}) {
  const statusColors = {
    pending: "bg-muted text-muted-foreground",
    achieved: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
    missed: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
  };
  return (
    <div className="flex items-start gap-3 py-2.5 border-b last:border-0">
      <div className="flex-1">
        <p className="text-sm font-medium">{plan.targetYear}: {plan.plannedRole}</p>
        {plan.conditions && (
          <p className="text-xs text-muted-foreground mt-0.5">{plan.conditions}</p>
        )}
      </div>
      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${statusColors[plan.status]}`}>
        {plan.status.charAt(0).toUpperCase() + plan.status.slice(1)}
      </span>
      <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-foreground" onClick={() => onEdit(plan)} title="Edit entry">
        <Pencil className="h-3.5 w-3.5" />
      </Button>
      <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-red-600" onClick={() => onDelete(plan.id)} title="Delete entry">
        <Trash2 className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}

function SetLifecycleDatesDialog({
  contractId,
  open,
  onOpenChange,
}: {
  contractId: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({ renewalLetterDueDate: "", appraisal1DueDate: "", appraisal2DueDate: "" });

  const mutation = useMutation(
    orpc.contracts.setLifecycleDates.mutationOptions({
      onSuccess: () => {
        toast.success("Lifecycle dates saved.");
        queryClient.invalidateQueries({ queryKey: orpc.contracts.get.key() });
        onOpenChange(false);
      },
      onError: () => toast.error("Failed to save dates."),
    }),
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Set Lifecycle Dates</DialogTitle>
          <DialogDescription>
            Set the renewal letter and appraisal due dates for this contract.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <p className="text-sm text-muted-foreground">Leave fields blank to auto-compute from end date (3 months before end).</p>
          {(["renewalLetterDueDate", "appraisal1DueDate", "appraisal2DueDate"] as const).map((f) => (
            <div key={f} className="space-y-1">
              <Label>{f === "renewalLetterDueDate" ? "Renewal Letter Due" : f === "appraisal1DueDate" ? "Appraisal 1 Due" : "Appraisal 2 Due"}</Label>
              <Input type="date" value={form[f]} onChange={(e) => setForm((p) => ({ ...p, [f]: e.target.value }))} />
            </div>
          ))}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            onClick={() => mutation.mutate({
              id: contractId,
              renewalLetterDueDate: form.renewalLetterDueDate || undefined,
              appraisal1DueDate: form.appraisal1DueDate || undefined,
              appraisal2DueDate: form.appraisal2DueDate || undefined,
            })}
            disabled={mutation.isPending}
          >
            {mutation.isPending ? "Saving..." : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CareerPlanDialog({
  staffId,
  existing,
  open,
  onOpenChange,
}: {
  staffId: string;
  existing: CareerPlan | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const defaults = {
    targetYear: existing?.targetYear ?? new Date().getFullYear() + 1,
    plannedRole: existing?.plannedRole ?? "",
    conditions: existing?.conditions ?? "",
    status: (existing?.status ?? "pending") as CareerPlan["status"],
  };
  const [form, setForm] = useState(defaults);

  const mutation = useMutation(
    orpc.careerProgression.upsert.mutationOptions({
      onSuccess: () => {
        toast.success(existing ? "Career plan entry updated." : "Career plan entry saved.");
        queryClient.invalidateQueries({ queryKey: orpc.careerProgression.list.key() });
        onOpenChange(false);
      },
      onError: () => toast.error("Failed to save."),
    }),
  );

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        // Reset form when opening so edit values populate fresh.
        if (v) setForm(defaults);
        onOpenChange(v);
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{existing ? "Edit Career Plan Entry" : "Add Career Plan Entry"}</DialogTitle>
          <DialogDescription>
            Record a target role and year for this staff member. Entries are keyed by
            staff member and year — re-saving the same year updates the existing entry.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Target Year</Label>
              <Input
                type="number"
                value={form.targetYear}
                disabled={Boolean(existing)}
                onChange={(e) => setForm((p) => ({ ...p, targetYear: parseInt(e.target.value) || p.targetYear }))}
              />
            </div>
            <div className="space-y-1">
              <Label>Status</Label>
              <Select
                value={form.status}
                onValueChange={(v) => setForm((p) => ({ ...p, status: (v ?? "pending") as CareerPlan["status"] }))}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="achieved">Achieved</SelectItem>
                  <SelectItem value="missed">Missed</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1">
            <Label>Planned Role</Label>
            <Input value={form.plannedRole} onChange={(e) => setForm((p) => ({ ...p, plannedRole: e.target.value }))} placeholder="e.g. Senior ICT Engineer" />
          </div>
          <div className="space-y-1">
            <Label>Conditions (optional)</Label>
            <Textarea value={form.conditions ?? ""} onChange={(e) => setForm((p) => ({ ...p, conditions: e.target.value }))} rows={2} placeholder="e.g. Complete CCIE certification" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            disabled={!form.plannedRole.trim() || mutation.isPending}
            onClick={() => mutation.mutate({ staffId, targetYear: form.targetYear, plannedRole: form.plannedRole, conditions: form.conditions || undefined, status: form.status })}
          >
            {mutation.isPending ? "Saving..." : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ContractDetailPage() {
  const { contractId } = Route.useParams();
  const queryClient = useQueryClient();
  const [datesDialogOpen, setDatesDialogOpen] = useState(false);
  const [careerDialogOpen, setCareerDialogOpen] = useState(false);
  const [editCareerPlan, setEditCareerPlan] = useState<CareerPlan | null>(null);
  const [setOutcomeOpen, setSetOutcomeOpen] = useState(false);
  const [outcomeValue, setOutcomeValue] = useState<"renewed" | "not_renewed" | "left" | "terminated">("renewed");

  const { data: contract, isLoading } = useQuery(
    orpc.contracts.get.queryOptions({ input: { id: contractId } }),
  );

  const careerQuery = useQuery(
    orpc.careerProgression.list.queryOptions({
      input: { staffId: contract?.staffProfileId },
    }),
  );

  const submitToHRMutation = useMutation(
    orpc.contracts.submitToHR.mutationOptions({
      onSuccess: () => {
        toast.success("Marked as submitted to HR.");
        queryClient.invalidateQueries({ queryKey: orpc.contracts.get.key() });
      },
      onError: () => toast.error("Failed to update."),
    }),
  );

  const setOutcomeMutation = useMutation(
    orpc.contracts.setOutcome.mutationOptions({
      onSuccess: () => {
        toast.success("Outcome recorded.");
        queryClient.invalidateQueries({ queryKey: orpc.contracts.get.key() });
        setSetOutcomeOpen(false);
      },
      onError: () => toast.error("Failed to update."),
    }),
  );

  const deleteCareerPlanMutation = useMutation(
    orpc.careerProgression.delete.mutationOptions({
      onSuccess: () => {
        toast.success("Entry removed.");
        queryClient.invalidateQueries({ queryKey: orpc.careerProgression.list.key() });
      },
      onError: () => toast.error("Failed to delete."),
    }),
  );

  if (isLoading) {
    return (
      <>
        <Header>
          <div className="flex items-center gap-2">
            <Skeleton className="h-4 w-32" />
          </div>
          <ThemeSwitch />
        </Header>
        <Main>
          <div className="space-y-4 p-4">
            <Skeleton className="h-40 w-full" />
            <Skeleton className="h-40 w-full" />
          </div>
        </Main>
      </>
    );
  }

  if (!contract) {
    return (
      <>
        <Header>
          <Link to="/contracts" className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" /> Back
          </Link>
          <ThemeSwitch />
        </Header>
        <Main>
          <p className="p-4 text-sm text-muted-foreground">Contract not found.</p>
        </Main>
      </>
    );
  }

  const staffName = (contract as Record<string, unknown> & { staffProfile?: { user?: { name?: string | null } | null } | null }).staffProfile?.user?.name ?? "Unknown Staff";

  const c = contract as Record<string, unknown> & {
    renewalLetterDueDate?: string | null;
    appraisal1DueDate?: string | null;
    appraisal2DueDate?: string | null;
    submittedToHrAt?: string | null;
    renewalOutcome?: string | null;
  };

  const careerPlans = (careerQuery.data ?? []).filter(
    (p) => p.staffId === contract.staffProfileId,
  ) as CareerPlan[];

  return (
    <>
      <Header>
        <Link to="/contracts" className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Contracts
        </Link>
        <ThemeSwitch />
      </Header>

      <Main>
        <div className="mx-auto max-w-3xl space-y-6 p-4">
          {/* Header card */}
          <div className="rounded-lg border bg-card p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h1 className="text-xl font-semibold">{staffName}</h1>
                <p className="text-sm text-muted-foreground mt-0.5">{contract.contractType}</p>
              </div>
              <StatusBadge status={contract.status as string} />
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-muted-foreground text-xs">Start Date</p>
                <p className="font-medium">{contract.startDate ? format(parseISO(contract.startDate as string), "d MMM yyyy") : "—"}</p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs">End Date</p>
                <p className="font-medium">{contract.endDate ? format(parseISO(contract.endDate as string), "d MMM yyyy") : "Permanent"}</p>
              </div>
            </div>
          </div>

          {/* Lifecycle timeline */}
          <div className="rounded-lg border bg-card">
            <div className="flex items-center justify-between px-5 py-3 border-b">
              <h2 className="font-medium flex items-center gap-2">
                <CalendarClock className="h-4 w-4" /> Lifecycle Timeline
              </h2>
              <Button variant="outline" size="sm" onClick={() => setDatesDialogOpen(true)}>
                Set Dates
              </Button>
            </div>
            <div className="px-5 py-1">
              <LifecycleDateRow label="Appraisal 1 Due" date={c.appraisal1DueDate} icon={<CalendarCheck className="h-4 w-4" />} />
              <LifecycleDateRow label="Appraisal 2 Due" date={c.appraisal2DueDate} icon={<CalendarCheck className="h-4 w-4" />} />
              <LifecycleDateRow label="Renewal Letter Due" date={c.renewalLetterDueDate} icon={<FileText className="h-4 w-4" />} />
              <LifecycleDateRow
                label="Submitted to HR"
                date={c.submittedToHrAt ? c.submittedToHrAt.slice(0, 10) : null}
                icon={<CheckCircle2 className="h-4 w-4" />}
              />
            </div>

            <div className="px-5 py-3 border-t flex flex-wrap gap-2">
              {!c.submittedToHrAt && (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={submitToHRMutation.isPending}
                  onClick={() => submitToHRMutation.mutate({ id: contractId })}
                >
                  Mark Submitted to HR
                </Button>
              )}
              {!c.renewalOutcome && (
                <Button variant="outline" size="sm" onClick={() => setSetOutcomeOpen(true)}>
                  Record Outcome
                </Button>
              )}
              {c.renewalOutcome && (
                <span className="text-sm text-muted-foreground">
                  Outcome: <strong>{(c.renewalOutcome as string).replace(/_/g, " ")}</strong>
                </span>
              )}
            </div>
          </div>

          {/* Career progression */}
          <div className="rounded-lg border bg-card">
            <div className="flex items-center justify-between px-5 py-3 border-b">
              <h2 className="font-medium flex items-center gap-2">
                <TrendingUp className="h-4 w-4" /> Career Progression Plan
              </h2>
              <Button variant="outline" size="sm" onClick={() => setCareerDialogOpen(true)}>
                <Plus className="h-4 w-4 mr-1" /> Add Year
              </Button>
            </div>
            <div className="px-5 py-1">
              {careerQuery.isLoading ? (
                <Skeleton className="h-8 w-full my-2" />
              ) : careerPlans.length === 0 ? (
                <p className="py-4 text-sm text-muted-foreground">No career progression entries yet.</p>
              ) : (
                careerPlans
                  .sort((a, b) => a.targetYear - b.targetYear)
                  .map((p) => (
                    <CareerPlanRow
                      key={p.id}
                      plan={p}
                      onEdit={(plan) => setEditCareerPlan(plan)}
                      onDelete={(id) => deleteCareerPlanMutation.mutate({ id })}
                    />
                  ))
              )}
            </div>
          </div>
        </div>
      </Main>

      <SetLifecycleDatesDialog contractId={contractId} open={datesDialogOpen} onOpenChange={setDatesDialogOpen} />
      <CareerPlanDialog
        staffId={contract.staffProfileId as string}
        existing={null}
        open={careerDialogOpen}
        onOpenChange={setCareerDialogOpen}
      />
      <CareerPlanDialog
        staffId={contract.staffProfileId as string}
        existing={editCareerPlan}
        open={Boolean(editCareerPlan)}
        onOpenChange={(v) => { if (!v) setEditCareerPlan(null); }}
      />

      {/* Record outcome dialog */}
      <Dialog open={setOutcomeOpen} onOpenChange={setSetOutcomeOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Record Renewal Outcome</DialogTitle>
            <DialogDescription>
              Record the final outcome of this contract's renewal cycle.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <Label>Outcome</Label>
            <Select value={outcomeValue} onValueChange={(v) => setOutcomeValue(v as typeof outcomeValue)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="renewed">Renewed</SelectItem>
                <SelectItem value="not_renewed">Not Renewed</SelectItem>
                <SelectItem value="left">Left</SelectItem>
                <SelectItem value="terminated">Terminated</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSetOutcomeOpen(false)}>Cancel</Button>
            <Button
              disabled={setOutcomeMutation.isPending}
              onClick={() => setOutcomeMutation.mutate({ id: contractId, renewalOutcome: outcomeValue })}
            >
              {setOutcomeMutation.isPending ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
