import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Zap,
  Plus,
  Trash2,
  Power,
  PowerOff,
  ChevronDown,
  ChevronUp,
  Clock,
  CheckCircle2,
  XCircle,
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@ndma-dcs-staff-portal/ui/components/dialog";
import { Header } from "@/components/layout/header";
import { Main } from "@/components/layout/main";
import { ThemeSwitch } from "@/components/theme-switch";
import { orpc, queryClient } from "@/utils/orpc";

export const Route = createFileRoute(
  "/_authenticated/settings/automation",
)({
  component: AutomationSettingsPage,
});

// ── Constants ──────────────────────────────────────────────────────────────

const MODULE_LABELS: Record<string, string> = {
  work: "Work Items",
  incident: "Incidents",
  leave: "Leave",
  temp_changes: "Temp Changes",
  procurement: "Procurement",
  rota: "Roster",
};

const MODULE_EVENTS: Record<string, string[]> = {
  work: ["created", "status_changed", "assigned", "overdue"],
  incident: ["created", "status_changed", "resolved"],
  leave: ["requested", "approved", "rejected"],
  temp_changes: ["created", "overdue", "removed"],
  procurement: ["submitted", "approved", "rejected"],
  rota: ["published", "swap_approved"],
};

const OPERATORS = [
  { value: "eq", label: "equals" },
  { value: "neq", label: "not equals" },
  { value: "gt", label: "greater than" },
  { value: "lt", label: "less than" },
  { value: "contains", label: "contains" },
  { value: "not_contains", label: "does not contain" },
];

type Condition = {
  field: string;
  operator: "eq" | "neq" | "gt" | "lt" | "contains" | "not_contains";
  value: string;
};

type Action = {
  type: "notify_in_app" | "notify_role";
  title: string;
  body: string;
  recipientField?: string;
  role?: string;
  linkUrl?: string;
};

type RuleFormData = {
  name: string;
  description: string;
  enabled: boolean;
  triggerModule: string;
  triggerEvent: string;
  conditions: Condition[];
  actions: Action[];
};

const emptyForm = (): RuleFormData => ({
  name: "",
  description: "",
  enabled: true,
  triggerModule: "work",
  triggerEvent: "created",
  conditions: [],
  actions: [
    {
      type: "notify_in_app",
      title: "",
      body: "",
      recipientField: "assignedToId",
    },
  ],
});

// ── Stats Banner ───────────────────────────────────────────────────────────

function StatsBanner() {
  const { data: stats } = useQuery(
    orpc.automation.stats.queryOptions(),
  );

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
      {[
        { label: "Total Rules", value: stats?.total ?? "—" },
        { label: "Enabled", value: stats?.enabled ?? "—", color: "text-blue-600" },
        { label: "Disabled", value: stats?.disabled ?? "—", color: "text-muted-foreground" },
        { label: "Fires (24h)", value: stats?.firesLast24h ?? "—" },
      ].map(({ label, value, color }) => (
        <Card key={label}>
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className={`text-2xl font-bold mt-0.5 ${color ?? ""}`}>
              {String(value)}
            </p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ── Rule Form ──────────────────────────────────────────────────────────────

function RuleForm({
  initial,
  onSave,
  onCancel,
  saving,
}: {
  initial: RuleFormData;
  onSave: (data: RuleFormData) => void;
  onCancel: () => void;
  saving: boolean;
}) {
  const [form, setForm] = useState<RuleFormData>(initial);

  const setField = <K extends keyof RuleFormData>(
    key: K,
    value: RuleFormData[K],
  ) => setForm((f) => ({ ...f, [key]: value }));

  const addCondition = () =>
    setField("conditions", [
      ...form.conditions,
      { field: "", operator: "eq", value: "" },
    ]);

  const updateCondition = (i: number, patch: Partial<Condition>) =>
    setField(
      "conditions",
      form.conditions.map((c, idx) => (idx === i ? { ...c, ...patch } : c)),
    );

  const removeCondition = (i: number) =>
    setField(
      "conditions",
      form.conditions.filter((_, idx) => idx !== i),
    );

  const addAction = () =>
    setField("actions", [
      ...form.actions,
      { type: "notify_in_app", title: "", body: "", recipientField: "" },
    ]);

  const updateAction = (i: number, patch: Partial<Action>) =>
    setField(
      "actions",
      form.actions.map((a, idx) => (idx === i ? { ...a, ...patch } : a)),
    );

  const removeAction = (i: number) =>
    setField(
      "actions",
      form.actions.filter((_, idx) => idx !== i),
    );

  const availableEvents = MODULE_EVENTS[form.triggerModule] ?? [];

  return (
    <div className="space-y-5">
      {/* Basic info */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1 block">
            Rule Name
          </label>
          <Input
            value={form.name}
            onChange={(e) => setField("name", e.target.value)}
            placeholder="e.g. Notify on overdue work item"
          />
        </div>
        <div className="flex items-end gap-2">
          <Button
            size="sm"
            variant={form.enabled ? "default" : "outline"}
            onClick={() => setField("enabled", !form.enabled)}
            type="button"
          >
            {form.enabled ? (
              <Power className="size-3.5 mr-1" />
            ) : (
              <PowerOff className="size-3.5 mr-1" />
            )}
            {form.enabled ? "Enabled" : "Disabled"}
          </Button>
        </div>
      </div>

      <div>
        <label className="text-xs font-medium text-muted-foreground mb-1 block">
          Description (optional)
        </label>
        <Textarea
          value={form.description}
          onChange={(e) => setField("description", e.target.value)}
          rows={2}
          placeholder="What does this rule do?"
        />
      </div>

      {/* Trigger */}
      <div>
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
          When (Trigger)
        </p>
        <div className="flex gap-2">
          <select
            className="flex h-9 rounded-xl border border-input bg-background px-3 py-1 text-sm flex-1"
            value={form.triggerModule}
            onChange={(e) => {
              const mod = e.target.value;
              const firstEvent = MODULE_EVENTS[mod]?.[0] ?? "";
              setForm((f) => ({
                ...f,
                triggerModule: mod,
                triggerEvent: firstEvent,
              }));
            }}
          >
            {Object.entries(MODULE_LABELS).map(([val, label]) => (
              <option key={val} value={val}>
                {label}
              </option>
            ))}
          </select>

          <select
            className="flex h-9 rounded-xl border border-input bg-background px-3 py-1 text-sm flex-1"
            value={form.triggerEvent}
            onChange={(e) => setField("triggerEvent", e.target.value)}
          >
            {availableEvents.map((ev) => (
              <option key={ev} value={ev}>
                {ev.replace(/_/g, " ")}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Conditions */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            Conditions (all must match)
          </p>
          <Button size="sm" variant="outline" onClick={addCondition} type="button">
            <Plus className="size-3 mr-1" />
            Add condition
          </Button>
        </div>
        {form.conditions.length === 0 && (
          <p className="text-xs text-muted-foreground italic">
            No conditions — rule fires on every matching event.
          </p>
        )}
        <div className="space-y-2">
          {form.conditions.map((cond, i) => (
            <div key={i} className="flex gap-2 items-center">
              <Input
                className="flex-1"
                placeholder="field (e.g. priority)"
                value={cond.field}
                onChange={(e) => updateCondition(i, { field: e.target.value })}
              />
              <select
                className="flex h-9 rounded-xl border border-input bg-background px-2 py-1 text-sm"
                value={cond.operator}
                onChange={(e) =>
                  updateCondition(i, {
                    operator: e.target.value as Condition["operator"],
                  })
                }
              >
                {OPERATORS.map((op) => (
                  <option key={op.value} value={op.value}>
                    {op.label}
                  </option>
                ))}
              </select>
              <Input
                className="flex-1"
                placeholder="value"
                value={cond.value}
                onChange={(e) => updateCondition(i, { value: e.target.value })}
              />
              <Button
                size="icon"
                variant="ghost"
                onClick={() => removeCondition(i)}
                type="button"
              >
                <Trash2 className="size-3.5" />
              </Button>
            </div>
          ))}
        </div>
      </div>

      {/* Actions */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            Actions
          </p>
          <Button size="sm" variant="outline" onClick={addAction} type="button">
            <Plus className="size-3 mr-1" />
            Add action
          </Button>
        </div>
        <div className="space-y-3">
          {form.actions.map((action, i) => (
            <div
              key={i}
              className="border rounded-xl p-3 space-y-2 bg-muted/30"
            >
              <div className="flex gap-2 items-center">
                <select
                  className="flex h-9 rounded-xl border border-input bg-background px-2 py-1 text-sm"
                  value={action.type}
                  onChange={(e) =>
                    updateAction(i, { type: e.target.value as Action["type"] })
                  }
                >
                  <option value="notify_in_app">Notify user (in-app)</option>
                  <option value="notify_role">Notify role (in-app)</option>
                </select>
                {form.actions.length > 1 && (
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => removeAction(i)}
                    type="button"
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                )}
              </div>

              {action.type === "notify_in_app" && (
                <Input
                  placeholder="Recipient field (e.g. assignedToId)"
                  value={action.recipientField ?? ""}
                  onChange={(e) =>
                    updateAction(i, { recipientField: e.target.value })
                  }
                />
              )}
              {action.type === "notify_role" && (
                <Input
                  placeholder="Role (e.g. manager, admin)"
                  value={action.role ?? ""}
                  onChange={(e) =>
                    updateAction(i, { role: e.target.value })
                  }
                />
              )}

              <Input
                placeholder="Title (use {{field}} for payload values)"
                value={action.title}
                onChange={(e) => updateAction(i, { title: e.target.value })}
              />
              <Textarea
                rows={2}
                placeholder="Body (use {{field}} for payload values)"
                value={action.body}
                onChange={(e) => updateAction(i, { body: e.target.value })}
              />
              <Input
                placeholder="Link URL (optional, supports {{id}})"
                value={action.linkUrl ?? ""}
                onChange={(e) =>
                  updateAction(i, { linkUrl: e.target.value || undefined })
                }
              />
            </div>
          ))}
        </div>
      </div>

      <div className="flex gap-2 pt-2">
        <Button
          size="sm"
          onClick={() => onSave(form)}
          disabled={saving || !form.name || form.actions.length === 0}
        >
          {saving ? "Saving…" : "Save Rule"}
        </Button>
        <Button size="sm" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

// ── Rule Card ──────────────────────────────────────────────────────────────

function RuleCard({
  rule,
}: {
  rule: {
    id: string;
    name: string;
    description: string | null;
    enabled: boolean;
    triggerModule: string;
    triggerEvent: string;
    fireCount: number;
    lastFiredAt: Date | null;
    conditions: unknown;
    actions: unknown;
    createdById: string | null;
    createdAt: Date;
    updatedAt: Date;
  };
}) {
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);

  const toggle = useMutation({
    ...orpc.automation.toggle.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: orpc.automation.list.key() });
      queryClient.invalidateQueries({ queryKey: orpc.automation.stats.key() });
    },
  });

  const remove = useMutation({
    ...orpc.automation.delete.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: orpc.automation.list.key() });
      queryClient.invalidateQueries({ queryKey: orpc.automation.stats.key() });
      toast.success("Rule deleted");
      setConfirmDeleteOpen(false);
    },
  });

  const update = useMutation({
    ...orpc.automation.update.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: orpc.automation.list.key() });
      setEditing(false);
      toast.success("Rule updated");
    },
  });

  const handleToggle = () => {
    toggle.mutate({ id: rule.id, enabled: !rule.enabled });
  };

  const handleDelete = () => {
    setConfirmDeleteOpen(true);
  };

  const handleSave = (data: RuleFormData) => {
    update.mutate({
      id: rule.id,
      name: data.name,
      description: data.description || undefined,
      enabled: data.enabled,
      triggerModule: data.triggerModule as
        | "work"
        | "incident"
        | "leave"
        | "temp_changes"
        | "procurement"
        | "rota",
      triggerEvent: data.triggerEvent,
      conditions: data.conditions as Array<{
        field: string;
        operator: "eq" | "neq" | "gt" | "lt" | "contains" | "not_contains";
        value: unknown;
      }>,
      actions: data.actions as Array<{
        type: "notify_in_app" | "notify_role";
        title: string;
        body: string;
        recipientField?: string;
        role?: string;
        linkUrl?: string;
      }>,
    });
  };

  const formInitial: RuleFormData = {
    name: rule.name,
    description: rule.description ?? "",
    enabled: rule.enabled,
    triggerModule: rule.triggerModule,
    triggerEvent: rule.triggerEvent,
    conditions: (rule.conditions as Condition[]) ?? [],
    actions: (rule.actions as Action[]) ?? [],
  };

  return (
    <>
    <Card className={rule.enabled ? "" : "opacity-60"}>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <CardTitle className="text-sm font-semibold">{rule.name}</CardTitle>
              <span
                className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                  rule.enabled
                    ? "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                {rule.enabled ? "Enabled" : "Disabled"}
              </span>
              <span className="text-xs text-muted-foreground">
                {MODULE_LABELS[rule.triggerModule] ?? rule.triggerModule} →{" "}
                <span className="font-mono">{rule.triggerEvent}</span>
              </span>
            </div>
            {rule.description && (
              <p className="text-xs text-muted-foreground mt-0.5">
                {rule.description}
              </p>
            )}
          </div>

          <div className="flex items-center gap-1 shrink-0">
            <Button
              size="icon"
              variant="ghost"
              onClick={handleToggle}
              disabled={toggle.isPending}
              title={rule.enabled ? "Disable rule" : "Enable rule"}
            >
              {rule.enabled ? (
                <PowerOff className="size-3.5" />
              ) : (
                <Power className="size-3.5" />
              )}
            </Button>
            <Button
              size="icon"
              variant="ghost"
              onClick={handleDelete}
              disabled={remove.isPending}
            >
              <Trash2 className="size-3.5" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              onClick={() => setExpanded((v) => !v)}
            >
              {expanded ? (
                <ChevronUp className="size-3.5" />
              ) : (
                <ChevronDown className="size-3.5" />
              )}
            </Button>
          </div>
        </div>

        <div className="flex gap-4 mt-2">
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <Zap className="size-3" />
            {rule.fireCount} fires
          </span>
          {rule.lastFiredAt && (
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <Clock className="size-3" />
              Last:{" "}
              {new Date(rule.lastFiredAt).toLocaleString("en-GB", {
                dateStyle: "short",
                timeStyle: "short",
              })}
            </span>
          )}
        </div>
      </CardHeader>

      {expanded && (
        <CardContent className="pt-0">
          {editing ? (
            <RuleForm
              initial={formInitial}
              onSave={handleSave}
              onCancel={() => setEditing(false)}
              saving={update.isPending}
            />
          ) : (
            <div className="space-y-3">
              <ConditionsSummary
                conditions={(rule.conditions as Condition[]) ?? []}
              />
              <ActionsSummary actions={(rule.actions as Action[]) ?? []} />
              <Button
                size="sm"
                variant="outline"
                onClick={() => setEditing(true)}
              >
                Edit Rule
              </Button>
            </div>
          )}
        </CardContent>
      )}
    </Card>

    <Dialog
      open={confirmDeleteOpen}
      onOpenChange={(o) => { if (!o) setConfirmDeleteOpen(false); }}
    >
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Delete Automation Rule</DialogTitle>
          <DialogDescription>
            Permanently delete the rule{" "}
            <span className="font-medium text-foreground">{rule.name}</span>?
            It will stop firing immediately. This cannot be undone.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            onClick={() => setConfirmDeleteOpen(false)}
            disabled={remove.isPending}
          >
            Cancel
          </Button>
          <Button
            variant="destructive"
            disabled={remove.isPending}
            onClick={() => remove.mutate({ id: rule.id })}
          >
            {remove.isPending ? "Deleting…" : "Delete"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </>
  );
}

function ConditionsSummary({ conditions }: { conditions: Condition[] }) {
  if (conditions.length === 0) {
    return (
      <p className="text-xs text-muted-foreground italic">
        No conditions — fires on every event.
      </p>
    );
  }
  return (
    <div>
      <p className="text-xs font-medium mb-1">Conditions (all must match):</p>
      <ul className="space-y-0.5">
        {conditions.map((c, i) => (
          <li key={i} className="text-xs text-muted-foreground font-mono">
            {c.field}{" "}
            <span className="text-foreground">
              {OPERATORS.find((o) => o.value === c.operator)?.label ??
                c.operator}
            </span>{" "}
            &quot;{String(c.value)}&quot;
          </li>
        ))}
      </ul>
    </div>
  );
}

function ActionsSummary({ actions }: { actions: Action[] }) {
  return (
    <div>
      <p className="text-xs font-medium mb-1">Actions:</p>
      <ul className="space-y-0.5">
        {actions.map((a, i) => (
          <li key={i} className="text-xs text-muted-foreground">
            <span className="font-medium text-foreground">
              {a.type === "notify_in_app" ? "Notify user" : "Notify role"}
            </span>{" "}
            — &quot;{a.title}&quot;
          </li>
        ))}
      </ul>
    </div>
  );
}

// ── Log Row ────────────────────────────────────────────────────────────────

function RecentLogs({ ruleId }: { ruleId: string }) {
  const { data: logs } = useQuery(
    orpc.automation.getLogs.queryOptions({
      input: { ruleId, limit: 10 },
    }),
  );

  if (!logs || logs.length === 0) {
    return (
      <p className="text-xs text-muted-foreground italic">No logs yet.</p>
    );
  }

  return (
    <div className="space-y-1">
      {logs.map((log) => (
        <div
          key={log.id}
          className="flex items-center gap-2 text-xs text-muted-foreground"
        >
          {log.success ? (
            <CheckCircle2 className="size-3 text-blue-500 shrink-0" />
          ) : (
            <XCircle className="size-3 text-red-500 shrink-0" />
          )}
          <span>
            {new Date(log.firedAt).toLocaleString("en-GB", {
              dateStyle: "short",
              timeStyle: "short",
            })}
          </span>
          {log.error && (
            <span className="text-red-500 truncate">{log.error}</span>
          )}
        </div>
      ))}
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────

function AutomationSettingsPage() {
  const [showForm, setShowForm] = useState(false);

  const { data: rules, isLoading } = useQuery(
    orpc.automation.list.queryOptions({ input: {} }),
  );

  const create = useMutation({
    ...orpc.automation.create.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: orpc.automation.list.key() });
      queryClient.invalidateQueries({ queryKey: orpc.automation.stats.key() });
      setShowForm(false);
      toast.success("Automation rule created");
    },
    onError: (err) => toast.error(err.message),
  });

  const handleCreate = (data: RuleFormData) => {
    create.mutate({
      name: data.name,
      description: data.description || undefined,
      enabled: data.enabled,
      triggerModule: data.triggerModule as
        | "work"
        | "incident"
        | "leave"
        | "temp_changes"
        | "procurement"
        | "rota",
      triggerEvent: data.triggerEvent,
      conditions: data.conditions as Array<{
        field: string;
        operator: "eq" | "neq" | "gt" | "lt" | "contains" | "not_contains";
        value: unknown;
      }>,
      actions: data.actions as Array<{
        type: "notify_in_app" | "notify_role";
        title: string;
        body: string;
        recipientField?: string;
        role?: string;
        linkUrl?: string;
      }>,
    });
  };

  return (
    <>
      <Header fixed>
        <div className="flex items-center gap-2">
          <Zap className="size-4 text-muted-foreground" />
          <span className="text-sm font-medium">Automation Rules</span>
        </div>
        <div className="ms-auto flex items-center gap-2">
          <ThemeSwitch />
          {!showForm && (
            <Button size="sm" onClick={() => setShowForm(true)}>
              <Plus className="size-4 mr-1" />
              New Rule
            </Button>
          )}
        </div>
      </Header>

      <Main>
        <div className="mb-6">
          <h1 className="text-2xl font-bold tracking-tight">
            Automation Rules
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Trigger in-app notifications and actions when events occur across
            modules. Use <code className="text-xs bg-muted px-1 rounded-lg">{"{{field}}"}</code>{" "}
            placeholders in titles and bodies to include event data.
          </p>
        </div>

        <StatsBanner />

        {showForm && (
          <Card className="mb-4">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">New Automation Rule</CardTitle>
            </CardHeader>
            <CardContent>
              <RuleForm
                initial={emptyForm()}
                onSave={handleCreate}
                onCancel={() => setShowForm(false)}
                saving={create.isPending}
              />
            </CardContent>
          </Card>
        )}

        {isLoading && (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full rounded-lg" />
            ))}
          </div>
        )}

        {!isLoading && rules && rules.length === 0 && !showForm && (
          <div className="text-center py-12 text-muted-foreground">
            <Zap className="size-8 mx-auto mb-3 opacity-30" />
            <p className="text-sm font-medium">No automation rules yet</p>
            <p className="text-xs mt-1">
              Create a rule to automatically send notifications when events
              happen.
            </p>
          </div>
        )}

        <div className="space-y-3">
          {rules?.map((rule) => (
            <RuleCard key={rule.id} rule={rule} />
          ))}
        </div>

        {rules && rules.length > 0 && (
          <p className="text-xs text-muted-foreground mt-4">
            Tip: Use fields like <code className="bg-muted px-1 rounded-lg">assignedToId</code>,{" "}
            <code className="bg-muted px-1 rounded-lg">title</code>,{" "}
            <code className="bg-muted px-1 rounded-lg">priority</code>,{" "}
            <code className="bg-muted px-1 rounded-lg">status</code> in conditions
            and action bodies — these match the fields on the event payload.
          </p>
        )}
      </Main>

      {/* Suppress unused import */}
      {false && <RecentLogs ruleId="" />}
    </>
  );
}
