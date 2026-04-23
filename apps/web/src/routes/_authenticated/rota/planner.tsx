import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { format, parseISO } from "date-fns";
import { CalendarClock, Plus, Send, ChevronDown, ChevronUp, PencilLine, Trash2, RotateCcw } from "lucide-react";
import { Button } from "@ndma-dcs-staff-portal/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@ndma-dcs-staff-portal/ui/components/card";
import { Skeleton } from "@ndma-dcs-staff-portal/ui/components/skeleton";
import { Header } from "@/components/layout/header";
import { Main } from "@/components/layout/main";
import { SchedulingTabs } from "@/components/layout/scheduling-tabs";
import { ThemeSwitch } from "@/components/theme-switch";
import { orpc, queryClient } from "@/utils/orpc";

export const Route = createFileRoute("/_authenticated/rota/planner")({
  component: PlannerPage,
});

type OnCallRole = "lead_engineer" | "asn_support" | "core_support" | "enterprise_support";

const REQUIRED_ROLES: OnCallRole[] = [
  "lead_engineer",
  "asn_support",
  "core_support",
  "enterprise_support",
];

const ROLE_LABELS: Record<OnCallRole, string> = {
  lead_engineer: "Lead Engineer",
  asn_support: "ASN Support",
  core_support: "Core Support",
  enterprise_support: "Enterprise Support",
};

const ROLE_COLORS: Record<OnCallRole, string> = {
  lead_engineer: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300",
  asn_support: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  core_support: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300",
  enterprise_support: "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300",
};

// ── Role assignment row ────────────────────────────────────────────────────
function RoleAssignRow({
  role,
  scheduleId,
  currentAssignment,
}: {
  role: OnCallRole;
  scheduleId: string;
  currentAssignment?: { id: string; staffProfileId: string; staffProfile?: { user?: { name: string } } };
}) {
  const { data: eligibleStaff, isLoading } = useQuery(
    orpc.rota.getEligibleStaff.queryOptions({ input: { role } })
  );

  const assignMutation = useMutation(
    orpc.rota.assign.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: orpc.rota.list.key() });
        toast.success(`${ROLE_LABELS[role]} assigned`);
      },
      onError: (err) => toast.error(err.message),
    })
  );

  const removeMutation = useMutation(
    orpc.rota.removeAssignment.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: orpc.rota.list.key() });
        queryClient.invalidateQueries({ queryKey: orpc.rota.getCurrent.key() });
        toast.success(`${ROLE_LABELS[role]} cleared`);
      },
      onError: (err) => toast.error(err.message),
    })
  );

  const staffList = eligibleStaff
    ? (eligibleStaff as Array<{
        staffProfiles?: { id: string; user?: { name: string } };
        id?: string;
        user?: { name: string };
      }>).map((item) => {
        // getEligibleStaff for lead_engineer returns { id, user, ... }
        // For dept-based roles it returns { staffProfiles: {...}, departments: {...} }
        if ("staffProfiles" in item && item.staffProfiles) {
          return { id: item.staffProfiles.id, name: item.staffProfiles.user?.name ?? "Unknown" };
        }
        return { id: item.id ?? "", name: item.user?.name ?? "Unknown" };
      })
    : [];

  return (
    <div className="flex items-center gap-3 py-2.5 border-b last:border-0">
      <span
        className={`inline-flex items-center rounded-lg px-2 py-0.5 text-xs font-medium shrink-0 w-40 justify-center ${ROLE_COLORS[role]}`}
      >
        {ROLE_LABELS[role]}
      </span>

      <div className="flex-1">
        {isLoading ? (
          <Skeleton className="h-8 w-full" />
        ) : (
          <select
            className="w-full rounded-xl border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            value={currentAssignment?.staffProfileId ?? ""}
            onChange={(e) => {
              if (!e.target.value) return;
              assignMutation.mutate({
                scheduleId,
                staffProfileId: e.target.value,
                role,
              });
            }}
          >
            <option value="">— Select staff —</option>
            {staffList.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        )}
      </div>

      <div className="flex items-center gap-2 shrink-0">
        {currentAssignment && (
          <span className="text-xs text-green-600 dark:text-green-400">Assigned</span>
        )}
        {currentAssignment && (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-7 w-7 p-0 text-red-600 hover:text-red-700"
            title="Clear assignment"
            disabled={removeMutation.isPending}
            onClick={() => removeMutation.mutate({ assignmentId: currentAssignment.id })}
          >
            <Trash2 className="size-3.5" />
          </Button>
        )}
      </div>
    </div>
  );
}

// ── Schedule card ──────────────────────────────────────────────────────────
function ScheduleCard({
  schedule,
}: {
  schedule: {
    id: string;
    weekStart: string;
    weekEnd: string;
    status: string;
    notes?: string | null;
    assignments: Array<{
      id: string;
      role: string;
      staffProfileId: string;
      staffProfile?: { user?: { name: string } };
    }>;
  };
}) {
  const [expanded, setExpanded] = useState(false);

  const rolesFilledCount = REQUIRED_ROLES.filter((r) =>
    schedule.assignments.some((a) => a.role === r)
  ).length;

  const isDraft = schedule.status === "draft";
  const canPublish = isDraft && rolesFilledCount === 4;

  const publishMutation = useMutation(
    orpc.rota.publish.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: orpc.rota.list.key() });
        queryClient.invalidateQueries({ queryKey: orpc.rota.getCurrent.key() });
        toast.success("Schedule published");
        setExpanded(false);
      },
      onError: (err) => toast.error(err.message),
    })
  );

  const reopenMutation = useMutation(
    orpc.rota.reopen.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: orpc.rota.list.key() });
        queryClient.invalidateQueries({ queryKey: orpc.rota.getCurrent.key() });
        toast.success("Schedule reopened as draft");
      },
      onError: (err) => toast.error(err.message),
    })
  );

  return (
    <div className="rounded-xl border">
      {/* Header row */}
      <div className="flex items-center gap-3 px-4 py-3">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium">
            {format(parseISO(schedule.weekStart), "dd MMM")} –{" "}
            {format(parseISO(schedule.weekEnd), "dd MMM yyyy")}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {rolesFilledCount} / 4 roles filled
          </p>
        </div>

        <span
          className={`inline-flex items-center rounded-lg px-2 py-0.5 text-xs font-medium shrink-0 ${
            schedule.status === "published"
              ? "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300"
              : "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300"
          }`}
        >
          {schedule.status}
        </span>

        {schedule.status === "published" && (
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs gap-1 shrink-0"
            disabled={reopenMutation.isPending}
            onClick={() => reopenMutation.mutate({ scheduleId: schedule.id })}
            title="Reopen this published schedule for editing"
          >
            <RotateCcw className="size-3" />
            Reopen
          </Button>
        )}

        {isDraft && (
          <div className="flex items-center gap-2 shrink-0">
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs gap-1"
              onClick={() => setExpanded(true)}
            >
              <PencilLine className="size-3" />
              Edit
            </Button>
            {canPublish && (
              <Button
                size="sm"
                className="h-7 text-xs gap-1"
                disabled={publishMutation.isPending}
                onClick={() => publishMutation.mutate({ scheduleId: schedule.id })}
              >
                <Send className="size-3" />
                Publish
              </Button>
            )}
            <Button
              size="sm"
              variant="ghost"
              className="h-7 w-7 p-0"
              onClick={() => setExpanded((v) => !v)}
              title={expanded ? "Collapse" : "Assign roles"}
            >
              {expanded ? (
                <ChevronUp className="size-3.5" />
              ) : (
                <ChevronDown className="size-3.5" />
              )}
            </Button>
          </div>
        )}
      </div>

      {/* Expanded role assignment panel */}
      {expanded && isDraft && (
        <div className="border-t px-4 py-3 bg-muted/30">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
            Assign Roles
          </p>
          {REQUIRED_ROLES.map((role) => (
            <RoleAssignRow
              key={role}
              role={role}
              scheduleId={schedule.id}
              currentAssignment={schedule.assignments.find(
                (a) => a.role === role
              ) as { id: string; staffProfileId: string; staffProfile?: { user?: { name: string } } } | undefined}
            />
          ))}
        </div>
      )}

      {schedule.status === "published" && (
        <div className="border-t bg-blue-50/60 px-4 py-3 text-xs text-blue-800 dark:bg-blue-950/20 dark:text-blue-200">
          Published schedules are locked for staff view. Use Reopen to create a draft version and continue editing.
        </div>
      )}
    </div>
  );
}

// ── New schedule form ──────────────────────────────────────────────────────
function NewScheduleForm({ onClose }: { onClose: () => void }) {
  const [weekStart, setWeekStart] = useState("");
  const [notes, setNotes] = useState("");

  const createMutation = useMutation(
    orpc.rota.create.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: orpc.rota.list.key() });
        toast.success("Draft schedule created");
        onClose();
      },
      onError: (err) => toast.error(err.message),
    })
  );

  return (
    <Card className="mb-6">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Roster Planning Wizard</CardTitle>
        <p className="text-sm text-muted-foreground mt-1">
          Create a draft, then use the role selectors below to add or replace staff.
        </p>
      </CardHeader>
      <CardContent>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!weekStart) return;
            createMutation.mutate({ weekStart, notes: notes || undefined });
          }}
          className="flex flex-wrap items-end gap-3"
        >
          <div>
            <label className="block text-xs font-medium mb-1 text-muted-foreground">
              Week Start (Monday)
            </label>
            <input
              type="date"
              value={weekStart}
              onChange={(e) => setWeekStart(e.target.value)}
              required
              className="rounded-xl border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <div className="flex-1 min-w-48">
            <label className="block text-xs font-medium mb-1 text-muted-foreground">
              Notes (optional)
            </label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Training week — check availability"
              className="w-full rounded-xl border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <div className="flex gap-2">
            <Button type="submit" size="sm" disabled={createMutation.isPending}>
              {createMutation.isPending ? "Creating..." : "Create Draft"}
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={onClose}>
              Cancel
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────
function PlannerPage() {
  const [showNewForm, setShowNewForm] = useState(false);

  const { data: schedules, isLoading } = useQuery(orpc.rota.list.queryOptions());

  const drafts = schedules?.filter((s) => s.status === "draft") ?? [];
  const published = schedules?.filter((s) => s.status === "published") ?? [];

  return (
    <>
      <Header fixed>
        <div className="flex items-center gap-2">
          <CalendarClock className="size-4 text-muted-foreground" />
          <span className="text-sm font-medium">Roster Planner</span>
        </div>
        <div className="ms-auto flex items-center gap-2">
          <ThemeSwitch />
          {!showNewForm && (
            <Button size="sm" onClick={() => setShowNewForm(true)}>
              <Plus className="size-4 mr-1" />
              Plan Roster
            </Button>
          )}
        </div>
      </Header>

      <Main>
        <SchedulingTabs scope="dcs" />

        <div className="mb-6">
          <h1 className="text-2xl font-bold tracking-tight">Roster Planner</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Create draft schedules, assign on-call roles, replace staff, and publish for the team.
          </p>
        </div>

        {showNewForm && <NewScheduleForm onClose={() => setShowNewForm(false)} />}

        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full rounded-xl" />
            ))}
          </div>
        ) : !schedules?.length ? (
          <div className="rounded-xl border border-dashed p-12 text-center text-muted-foreground text-sm">
            No schedules yet. Create your first draft above.
          </div>
        ) : (
          <>
            {/* Draft schedules */}
            {drafts.length > 0 && (
              <div className="mb-6">
                <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                  Drafts ({drafts.length})
                </h2>
                <div className="space-y-2">
                  {drafts.map((s) => (
                    <ScheduleCard key={s.id} schedule={s as Parameters<typeof ScheduleCard>[0]["schedule"]} />
                  ))}
                </div>
              </div>
            )}

            {/* Published schedules */}
            {published.length > 0 && (
              <div>
                <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                  Published ({published.length})
                </h2>
                <div className="space-y-2">
                  {published.map((s) => (
                    <ScheduleCard key={s.id} schedule={s as Parameters<typeof ScheduleCard>[0]["schedule"]} />
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </Main>
    </>
  );
}
