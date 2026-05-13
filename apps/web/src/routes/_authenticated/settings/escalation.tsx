import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  AlertTriangle,
  ArrowDown,
  Clock,
  Plus,
  Trash2,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { Button } from "@ndma-dcs-staff-portal/ui/components/button";
import { Input } from "@ndma-dcs-staff-portal/ui/components/input";
import { Textarea } from "@ndma-dcs-staff-portal/ui/components/textarea";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@ndma-dcs-staff-portal/ui/components/card";
import { Skeleton } from "@ndma-dcs-staff-portal/ui/components/skeleton";
import { Header } from "@/components/layout/header";
import { Main } from "@/components/layout/main";
import { ThemeSwitch } from "@/components/theme-switch";
import { orpc, queryClient } from "@/utils/orpc";

export const Route = createFileRoute("/_authenticated/settings/escalation")({
  component: EscalationSettingsPage,
});

// ── Types ──────────────────────────────────────────────────────────────────

type OnCallRole =
  | "lead_engineer"
  | "asn_support"
  | "core_support"
  | "enterprise_support";

const ON_CALL_ROLE_LABELS: Record<OnCallRole, string> = {
  lead_engineer: "Lead Engineer",
  asn_support: "ASN Support",
  core_support: "Core Support",
  enterprise_support: "Enterprise Support",
};

const ON_CALL_ROLES = Object.entries(ON_CALL_ROLE_LABELS) as [
  OnCallRole,
  string,
][];

// ── Helpers ────────────────────────────────────────────────────────────────

function delayLabel(minutes: number): string {
  if (minutes === 0) return "Immediately";
  if (minutes < 60) return `After ${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `After ${h}h` : `After ${h}h ${m}min`;
}

// ── Add-step inline form ────────────────────────────────────────────────────

function AddStepForm({
  policyId,
  nextOrder,
  onDone,
}: {
  policyId: string;
  nextOrder: number;
  onDone: () => void;
}) {
  const [delayMinutes, setDelayMinutes] = useState("0");
  const [role, setRole] = useState<OnCallRole>("lead_engineer");

  const addStep = useMutation(
    orpc.escalation.steps.add.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({
          queryKey: orpc.escalation.policies.list.key(),
        });
        toast.success("Step added");
        onDone();
      },
      onError: (err) => toast.error(err.message),
    })
  );

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    addStep.mutate({
      policyId,
      stepOrder: nextOrder,
      delayMinutes: Number(delayMinutes),
      notifyOnCallRole: role,
    });
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="mt-2 flex flex-wrap items-end gap-2 rounded-xl border border-dashed p-3 bg-muted/30"
    >
      <div className="flex flex-col gap-1">
        <label className="text-xs text-muted-foreground">Delay (minutes)</label>
        <Input
          type="number"
          min={0}
          value={delayMinutes}
          onChange={(e) => setDelayMinutes(e.target.value)}
          className="w-28 h-8 text-sm"
          required
        />
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-xs text-muted-foreground">Notify role</label>
        <select
          value={role}
          onChange={(e) => setRole(e.target.value as OnCallRole)}
          className="h-8 rounded-xl border bg-background px-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
        >
          {ON_CALL_ROLES.map(([val, label]) => (
            <option key={val} value={val}>
              {label}
            </option>
          ))}
        </select>
      </div>

      <Button
        type="submit"
        size="sm"
        disabled={addStep.isPending}
        className="h-8"
      >
        {addStep.isPending ? "Adding…" : "Add Step"}
      </Button>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        className="h-8"
        onClick={onDone}
      >
        Cancel
      </Button>
    </form>
  );
}

// ── Policy card ────────────────────────────────────────────────────────────

function PolicyCard({ policy }: { policy: PolicyWithSteps }) {
  const [addingStep, setAddingStep] = useState(false);
  const [expanded, setExpanded] = useState(true);

  const deletePolicyMutation = useMutation(
    orpc.escalation.policies.delete.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({
          queryKey: orpc.escalation.policies.list.key(),
        });
        toast.success("Policy deleted");
      },
      onError: (err) => toast.error(err.message),
    })
  );

  const deleteStepMutation = useMutation(
    orpc.escalation.steps.delete.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({
          queryKey: orpc.escalation.policies.list.key(),
        });
        toast.success("Step removed");
      },
      onError: (err) => toast.error(err.message),
    })
  );

  const nextOrder = (policy.steps?.length ?? 0) + 1;

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <CardTitle className="text-base">{policy.name}</CardTitle>
              <span
                className={`inline-flex items-center rounded-lg px-2 py-0.5 text-xs font-medium ${
                  policy.isActive
                    ? "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                {policy.isActive ? "Active" : "Inactive"}
              </span>
              {policy.service && (
                <span className="text-xs text-muted-foreground rounded-lg px-2 py-0.5 bg-muted">
                  Service: {policy.service.name}
                </span>
              )}
              {policy.department && (
                <span className="text-xs text-muted-foreground rounded-lg px-2 py-0.5 bg-muted">
                  Dept: {policy.department.name}
                </span>
              )}
            </div>
            {policy.description && (
              <p className="text-sm text-muted-foreground mt-1">
                {policy.description}
              </p>
            )}
            <p className="text-xs text-muted-foreground mt-0.5">
              {policy.steps?.length ?? 0} step
              {(policy.steps?.length ?? 0) !== 1 ? "s" : ""}
            </p>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            <Button
              size="sm"
              variant="ghost"
              className="h-7 w-7 p-0"
              onClick={() => setExpanded((v) => !v)}
              title={expanded ? "Collapse" : "Expand"}
            >
              {expanded ? (
                <ChevronUp className="size-4" />
              ) : (
                <ChevronDown className="size-4" />
              )}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 w-7 p-0 text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/40"
              disabled={deletePolicyMutation.isPending}
              onClick={() => {
                if (
                  confirm(
                    `Delete policy "${policy.name}"? This will also delete all its steps.`
                  )
                ) {
                  deletePolicyMutation.mutate({ id: policy.id });
                }
              }}
              title="Delete policy"
            >
              <Trash2 className="size-4" />
            </Button>
          </div>
        </div>
      </CardHeader>

      {expanded && (
        <CardContent>
          {/* Steps list */}
          {!policy.steps?.length ? (
            <p className="text-sm text-muted-foreground mb-3">
              No steps configured yet.
            </p>
          ) : (
            <div className="space-y-0 mb-3">
              {policy.steps.map((step, idx) => (
                <div key={step.id}>
                  <div className="flex items-start gap-3 py-2">
                    <div className="size-6 rounded-full bg-muted flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">
                      {step.stepOrder}
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-medium">
                        {step.notifyOnCallRole
                          ? ON_CALL_ROLE_LABELS[
                              step.notifyOnCallRole as OnCallRole
                            ] ?? step.notifyOnCallRole
                          : "Specific staff"}
                      </p>
                      <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                        <Clock className="size-3" />
                        {delayLabel(step.delayMinutes)}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 w-6 p-0 text-muted-foreground hover:text-red-600"
                      disabled={deleteStepMutation.isPending}
                      onClick={() =>
                        deleteStepMutation.mutate({ stepId: step.id })
                      }
                      title="Delete step"
                    >
                      <Trash2 className="size-3" />
                    </Button>
                  </div>
                  {idx < (policy.steps?.length ?? 0) - 1 && (
                    <div className="ml-3">
                      <ArrowDown className="size-3.5 text-muted-foreground" />
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Add step */}
          {addingStep ? (
            <AddStepForm
              policyId={policy.id}
              nextOrder={nextOrder}
              onDone={() => setAddingStep(false)}
            />
          ) : (
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs"
              onClick={() => setAddingStep(true)}
            >
              <Plus className="size-3 mr-1" />
              Add Step
            </Button>
          )}
        </CardContent>
      )}
    </Card>
  );
}

// ── New policy form ─────────────────────────────────────────────────────────

function CreatePolicyForm({ onDone }: { onDone: () => void }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [isActive, setIsActive] = useState(true);

  const createMutation = useMutation(
    orpc.escalation.policies.create.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({
          queryKey: orpc.escalation.policies.list.key(),
        });
        toast.success("Policy created");
        onDone();
      },
      onError: (err) => toast.error(err.message),
    })
  );

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    createMutation.mutate({ name, description: description || undefined, isActive });
  }

  return (
    <Card className="border-primary/50">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">New Escalation Policy</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Name</label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Critical Incident Escalation"
              required
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium">
              Description{" "}
              <span className="text-muted-foreground font-normal">(optional)</span>
            </label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe when this policy applies…"
              rows={2}
            />
          </div>

          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
              className="rounded-lg border-input"
            />
            <span className="text-sm">Active (enable this policy)</span>
          </label>

          <div className="flex gap-2">
            <Button type="submit" disabled={createMutation.isPending}>
              {createMutation.isPending ? "Creating…" : "Create Policy"}
            </Button>
            <Button type="button" variant="ghost" onClick={onDone}>
              Cancel
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

// ── Inferred type helper ───────────────────────────────────────────────────

type PolicyWithSteps = NonNullable<
  Awaited<ReturnType<typeof orpc.escalation.policies.list.call>>
>[number];

// ── Main page ──────────────────────────────────────────────────────────────

function EscalationSettingsPage() {
  const [showCreateForm, setShowCreateForm] = useState(false);

  const { data: policies, isLoading } = useQuery(
    orpc.escalation.policies.list.queryOptions()
  );

  return (
    <>
      <Header fixed>
        <div className="flex items-center gap-2">
          <AlertTriangle className="size-4 text-muted-foreground" />
          <span className="text-sm font-medium">Escalation Policies</span>
        </div>
        <div className="ms-auto flex items-center gap-2">
          <ThemeSwitch />
          {!showCreateForm && (
            <Button size="sm" onClick={() => setShowCreateForm(true)}>
              <Plus className="size-4 mr-1" />
              New Policy
            </Button>
          )}
        </div>
      </Header>

      <Main>
        <div className="mb-6">
          <h1 className="text-2xl font-bold tracking-tight">
            Escalation Policies
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Configure timed escalation steps for on-call and incident response.
            Steps fire when no acknowledgement is received within the delay
            window.
          </p>
        </div>

        <div className="space-y-4 max-w-2xl">
          {/* Create form */}
          {showCreateForm && (
            <CreatePolicyForm onDone={() => setShowCreateForm(false)} />
          )}

          {/* Policy list */}
          {isLoading ? (
            Array.from({ length: 2 }).map((_, i) => (
              <Card key={i}>
                <CardHeader className="pb-2">
                  <Skeleton className="h-5 w-48" />
                  <Skeleton className="h-3 w-32 mt-1" />
                </CardHeader>
                <CardContent className="space-y-2">
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-3/4" />
                </CardContent>
              </Card>
            ))
          ) : !policies?.length ? (
            <div className="rounded-xl border border-dashed p-8 text-center">
              <AlertTriangle className="size-8 mx-auto mb-2 text-muted-foreground" />
              <p className="font-medium text-sm">No policies configured</p>
              <p className="text-xs text-muted-foreground mt-1">
                Create a policy above and add escalation steps to it.
              </p>
            </div>
          ) : (
            policies.map((policy) => (
              <PolicyCard key={policy.id} policy={policy} />
            ))
          )}
        </div>
      </Main>
    </>
  );
}
