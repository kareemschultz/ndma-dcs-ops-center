// Self-service dashboard for rank-and-file `staff` users.
//
// The default dashboard (apps/web/src/routes/_authenticated/index.tsx) is an
// operations console — org-wide incidents, every open work item, the whole
// approval queue. A `staff` user should land on THEIR things instead: their
// leave balance, their pending requests, the work assigned to them, their
// appraisal status and notifications. This component renders that focused
// view; index.tsx branches to it when the signed-in role is `staff`.
//
// Every query here is already scoped server-side for the staff role
// (leave.requests.list, leave.balances.getByStaff, appraisals.getByStaff) or
// is narrowed by an explicit `assignedToId` / staffProfileId filter — this
// component never asks for data the user is not allowed to see.

import { useMemo } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import {
  ArrowRight, CalendarDays, ClipboardCheck, ClipboardList, Clock,
  GraduationCap, PalmtreeIcon, TreePalm,
} from "lucide-react";

import { Button } from "@ndma-dcs-staff-portal/ui/components/button";
import { Skeleton } from "@ndma-dcs-staff-portal/ui/components/skeleton";
import { orpc } from "@/utils/orpc";
import {
  effectiveLeaveStatus, EFFECTIVE_LEAVE_STATUS_LABELS, EFFECTIVE_LEAVE_STATUS_TONE,
} from "@/lib/leave-status";
import { getLeaveTypeDisplayName, isVisibleLeaveType } from "@/lib/leave-types";

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

function firstName(name?: string | null): string {
  return name?.split(" ")[0] ?? "there";
}

// ── Card wrapper (matches the ops dashboard's PanelCard) ────────────────────

function PanelCard({
  title, subtitle, action, children,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border bg-card">
      <div className="flex items-center justify-between gap-3 px-4 pt-3.5 pb-2.5">
        <div>
          <h3 className="text-[13px] font-semibold">{title}</h3>
          {subtitle && <p className="text-[12px] text-muted-foreground mt-0.5">{subtitle}</p>}
        </div>
        {action}
      </div>
      <div className="px-4 pb-4">{children}</div>
    </div>
  );
}

// A leave request as returned by orpc.leave.requests.list.
type LeaveRow = {
  id: string;
  startDate: string;
  endDate: string;
  totalDays: number;
  status: string;
  leaveTypeId: string;
  leaveType?: { name?: string | null } | null;
};

function LeaveStatusBadge({ status, endDate }: { status: string; endDate: string }) {
  const eff = effectiveLeaveStatus(status, endDate);
  const tone = EFFECTIVE_LEAVE_STATUS_TONE[eff];
  return (
    <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-medium ${tone.badge}`}>
      {EFFECTIVE_LEAVE_STATUS_LABELS[eff]}
    </span>
  );
}

export function StaffDashboard({ userName }: { userName?: string | null }) {
  const navigate = useNavigate();
  const currentYear = new Date().getFullYear();
  const todayDisplay = format(new Date(), "EEEE d MMMM");

  // The caller's own staff profile — drives the scoped balance / work queries.
  const { data: me, isLoading: meLoading } = useQuery(orpc.staff.me.queryOptions());
  const staffProfileId = me?.id;

  // My leave requests — leave.requests.list scopes to the caller for `staff`.
  const { data: myLeave, isLoading: leaveLoading } = useQuery(
    orpc.leave.requests.list.queryOptions({ input: { limit: 200 } }),
  );

  // My leave balances.
  const { data: leaveBalances } = useQuery({
    ...orpc.leave.balances.getByStaff.queryOptions({
      input: { staffProfileId: staffProfileId ?? "" },
    }),
    enabled: Boolean(staffProfileId),
  });

  // My leave types (for balance bar labels).
  const { data: leaveTypes } = useQuery(orpc.leave.types.list.queryOptions());

  // Work assigned to me — explicit assignedToId filter, no org-wide list.
  const { data: myWork, isLoading: workLoading } = useQuery({
    ...orpc.work.list.queryOptions({
      input: { assignedToId: staffProfileId ?? "", limit: 100 },
    }),
    enabled: Boolean(staffProfileId),
  });

  // My appraisals.
  const { data: myAppraisals } = useQuery({
    ...orpc.appraisals.getByStaff.queryOptions({
      input: { staffProfileId: staffProfileId ?? "" },
    }),
    enabled: Boolean(staffProfileId),
  });

  // ── Derived figures ──────────────────────────────────────────────────────

  const leaveRows = (myLeave ?? []) as LeaveRow[];
  const pendingLeave = leaveRows.filter((r) => r.status === "pending");
  const upcomingLeave = leaveRows
    .filter((r) => r.status === "approved" && parseISO(r.endDate) >= new Date())
    .sort((a, b) => a.startDate.localeCompare(b.startDate))
    .slice(0, 4);

  // Annual-leave balance gets top billing — the figure staff most want.
  const annualBalance = useMemo(() => {
    const annualType = (leaveTypes ?? []).find((t) =>
      t.name.toLowerCase().includes("annual"),
    );
    if (!annualType || !leaveBalances) return null;
    const bal = leaveBalances.find((b) => b.leaveTypeId === annualType.id);
    if (!bal) return null;
    const allowance = bal.allowance ?? annualType.defaultAnnualAllowance ?? 0;
    return { used: bal.used ?? 0, allowance, remaining: Math.max(allowance - (bal.used ?? 0), 0) };
  }, [leaveBalances, leaveTypes]);

  const balanceBars = useMemo(() => {
    if (!leaveBalances || !leaveTypes) return [];
    return (leaveTypes ?? [])
      .filter((t) => isVisibleLeaveType(t.name))
      .map((t) => {
        const bal = leaveBalances.find((b) => b.leaveTypeId === t.id);
        const used = bal?.used ?? 0;
        const allowance = bal?.allowance ?? t.defaultAnnualAllowance ?? 0;
        return { label: getLeaveTypeDisplayName(t.name), used, allowance };
      })
      .filter((b) => b.allowance > 0)
      .slice(0, 4);
  }, [leaveBalances, leaveTypes]);

  const workItems = (myWork ?? []) as Array<{
    id: string; title: string; status: string; priority: string | null; dueDate: string | null;
  }>;
  const openWork = workItems.filter(
    (w) => !["completed", "cancelled"].includes(w.status),
  );
  const overdueWork = openWork.filter(
    (w) => w.dueDate && parseISO(w.dueDate) < new Date(),
  );

  const latestAppraisal = (myAppraisals ?? [])[0] as
    | { id: string; status: string; cycle?: { name?: string | null } | null }
    | undefined;

  // ── KPI tile ─────────────────────────────────────────────────────────────

  function HeroKpi({
    label, value, sub, onClick, loading,
  }: {
    label: string;
    value?: number | string;
    sub: string;
    onClick?: () => void;
    loading?: boolean;
  }) {
    return (
      <button
        onClick={onClick}
        className="text-left rounded-xl bg-white/10 hover:bg-white/15 border border-white/10 backdrop-blur p-3.5 transition-colors"
      >
        <div className="text-[10.5px] uppercase tracking-wider text-brand-200 font-medium">
          {label}
        </div>
        {loading ? (
          <div className="mt-0.5 h-7 w-12 rounded bg-white/20 animate-pulse" />
        ) : (
          <div className="tabular-nums text-[26px] font-semibold mt-0.5">{value ?? 0}</div>
        )}
        <div className="tabular-nums text-[11.5px] text-brand-200 mt-0.5">{sub}</div>
      </button>
    );
  }

  return (
    <>
      {/* ── Hero strip — personal, not ops ── */}
      <section className="relative overflow-hidden border-b bg-gradient-to-br from-brand-800 via-brand-700 to-brand-900 text-white">
        <div
          className="absolute inset-0 opacity-60"
          style={{
            backgroundImage:
              "linear-gradient(to right,rgba(255,255,255,0.05) 1px,transparent 1px),linear-gradient(to bottom,rgba(255,255,255,0.05) 1px,transparent 1px)",
            backgroundSize: "24px 24px",
          }}
        />
        <div className="absolute -right-20 -top-20 h-64 w-64 rounded-full bg-gold-400/20 blur-3xl" />
        <div className="relative px-6 py-7">
          <div className="flex items-start justify-between gap-6 flex-wrap">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-[11.5px] uppercase tracking-widest text-brand-200 font-medium">
                <span className="h-1.5 w-1.5 rounded-full bg-gold-400" />
                <span>Your portal · {todayDisplay}</span>
              </div>
              <h1 className="mt-2 text-[28px] font-semibold tracking-tight">
                {getGreeting()}, {firstName(userName)}.
              </h1>
              <p className="mt-1 text-[14px] text-brand-100 max-w-xl">
                {pendingLeave.length > 0 ? (
                  <>
                    You have{" "}
                    <span className="font-medium text-white">
                      {pendingLeave.length} leave request
                      {pendingLeave.length > 1 ? "s" : ""}
                    </span>{" "}
                    awaiting approval.
                  </>
                ) : openWork.length > 0 ? (
                  <>
                    You have{" "}
                    <span className="font-medium text-white">
                      {openWork.length} open work item{openWork.length > 1 ? "s" : ""}
                    </span>
                    {overdueWork.length > 0 && (
                      <>
                        {" "}—{" "}
                        <span className="font-medium text-white">
                          {overdueWork.length} overdue
                        </span>
                      </>
                    )}
                    .
                  </>
                ) : (
                  "Everything is up to date. Have a great day."
                )}
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Button
                variant="outline"
                size="sm"
                className="bg-white/10 border-white/20 text-white hover:bg-white/20 hover:text-white"
                onClick={() => navigate({ to: "/scheduling" })}
              >
                <CalendarDays className="size-3.5" />
                My schedule
              </Button>
              <Button
                size="sm"
                className="bg-gold-500 hover:bg-gold-400 text-stone-900 font-medium border-0"
                onClick={() => navigate({ to: "/leave/new" })}
              >
                <TreePalm className="size-3.5" />
                Request leave
              </Button>
            </div>
          </div>

          {/* KPI strip — all "my" figures */}
          <div className="mt-6 grid grid-cols-2 md:grid-cols-4 gap-3 max-w-4xl">
            <HeroKpi
              label="Leave remaining"
              value={annualBalance ? `${annualBalance.remaining}` : "—"}
              sub={annualBalance ? `of ${annualBalance.allowance} annual days` : "no balance set"}
              onClick={() => navigate({ to: "/leave/balances" })}
              loading={meLoading}
            />
            <HeroKpi
              label="Pending requests"
              value={leaveLoading ? undefined : pendingLeave.length}
              sub={pendingLeave.length > 0 ? "awaiting approval" : "none pending"}
              onClick={() => navigate({ to: "/leave" })}
              loading={leaveLoading}
            />
            <HeroKpi
              label="My open work"
              value={workLoading ? undefined : openWork.length}
              sub={`${overdueWork.length} overdue`}
              onClick={() => navigate({ to: "/work" })}
              loading={workLoading}
            />
            <HeroKpi
              label="My appraisal"
              value={
                latestAppraisal
                  ? latestAppraisal.status.charAt(0).toUpperCase() +
                    latestAppraisal.status.slice(1)
                  : "—"
              }
              sub={latestAppraisal?.cycle?.name ?? "no cycle yet"}
              onClick={() => navigate({ to: "/appraisals" })}
              loading={false}
            />
          </div>
        </div>
      </section>

      {/* ── Main content grid ── */}
      <div className="px-6 py-6 grid grid-cols-12 gap-5">
        {/* ── Left column ── */}
        <div className="col-span-12 lg:col-span-4 space-y-5">
          {/* My leave balances */}
          <PanelCard
            title="My leave balances"
            subtitle={`${currentYear}`}
            action={
              <button
                className="text-[11.5px] text-primary hover:underline"
                onClick={() => navigate({ to: "/leave/balances" })}
              >
                Details
              </button>
            }
          >
            {balanceBars.length === 0 ? (
              <p className="text-[12.5px] text-muted-foreground py-2">
                No leave balances recorded yet.
              </p>
            ) : (
              <div className="space-y-3">
                {balanceBars.map((b) => {
                  const pct = b.allowance > 0 ? Math.min((b.used / b.allowance) * 100, 100) : 0;
                  const remaining = Math.max(b.allowance - b.used, 0);
                  const barCls =
                    b.used > b.allowance ? "bg-red-500" : pct >= 80 ? "bg-amber-500" : "bg-primary";
                  return (
                    <div key={b.label} className="space-y-1">
                      <div className="flex items-center justify-between text-[12px]">
                        <span className="font-medium">{b.label}</span>
                        <span className="tabular-nums text-muted-foreground">
                          <span className="font-semibold text-foreground">{remaining}</span> left
                          {" · "}
                          {b.used}/{b.allowance} used
                        </span>
                      </div>
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                        <div className={`h-full rounded-full ${barCls}`} style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </PanelCard>

          {/* Quick links */}
          <PanelCard title="Quick actions">
            <div className="grid grid-cols-2 gap-2">
              {[
                { label: "Request leave",   icon: PalmtreeIcon,   to: "/leave/new" as const },
                { label: "My timesheet",    icon: Clock,          to: "/timesheets" as const },
                { label: "My appraisal",    icon: ClipboardCheck, to: "/appraisals" as const },
                { label: "My training",     icon: GraduationCap,  to: "/training" as const },
              ].map((q) => (
                <button
                  key={q.label}
                  onClick={() => navigate({ to: q.to })}
                  className="flex items-center gap-2 px-2.5 h-9 rounded-md border border-border hover:border-primary/50 text-[12.5px] text-left transition-colors"
                >
                  <q.icon className="size-3.5 text-primary shrink-0" />
                  <span className="truncate">{q.label}</span>
                </button>
              ))}
            </div>
          </PanelCard>
        </div>

        {/* ── Center column — my work ── */}
        <div className="col-span-12 lg:col-span-5 space-y-5">
          <PanelCard
            title="My work items"
            subtitle="Assigned to you"
            action={
              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigate({ to: "/work" })}
              >
                All my work
                <ArrowRight className="size-3.5" />
              </Button>
            }
          >
            {workLoading ? (
              <div className="space-y-2">
                {[0, 1, 2].map((i) => <Skeleton key={i} className="h-10 w-full" />)}
              </div>
            ) : openWork.length === 0 ? (
              <div className="py-8 text-center">
                <ClipboardList className="mx-auto mb-2 size-7 opacity-30" />
                <p className="text-[12.5px] text-muted-foreground">
                  No open work items assigned to you.
                </p>
              </div>
            ) : (
              <ul className="divide-y divide-border">
                {openWork.slice(0, 6).map((w) => {
                  const overdue = w.dueDate && parseISO(w.dueDate) < new Date();
                  return (
                    <li
                      key={w.id}
                      className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0 cursor-pointer hover:bg-muted/40 -mx-1 px-1 rounded transition-colors"
                      onClick={() =>
                        navigate({ to: "/work/$workItemId", params: { workItemId: w.id } })
                      }
                    >
                      <div className="flex-1 min-w-0">
                        <div className="text-[12.5px] font-medium truncate">{w.title}</div>
                        <div className="text-[11px] text-muted-foreground">
                          {w.status.replace(/_/g, " ")}
                          {w.dueDate && (
                            <>
                              {" · "}
                              <span className={overdue ? "text-red-600 dark:text-red-400 font-medium" : ""}>
                                due {format(parseISO(w.dueDate), "d MMM")}
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                      {w.priority && (
                        <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[11px] font-medium bg-muted text-muted-foreground capitalize">
                          {w.priority}
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </PanelCard>

          {/* My leave requests */}
          <PanelCard
            title="My leave requests"
            subtitle="Recent and upcoming"
            action={
              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigate({ to: "/leave" })}
              >
                All my leave
                <ArrowRight className="size-3.5" />
              </Button>
            }
          >
            {leaveLoading ? (
              <div className="space-y-2">
                {[0, 1].map((i) => <Skeleton key={i} className="h-10 w-full" />)}
              </div>
            ) : leaveRows.length === 0 ? (
              <div className="py-8 text-center">
                <TreePalm className="mx-auto mb-2 size-7 opacity-30" />
                <p className="text-[12.5px] text-muted-foreground">
                  You have no leave requests.
                </p>
                <Button
                  size="sm"
                  className="mt-3"
                  onClick={() => navigate({ to: "/leave/new" })}
                >
                  Request leave
                </Button>
              </div>
            ) : (
              <ul className="divide-y divide-border">
                {[...pendingLeave, ...upcomingLeave]
                  .filter((r, i, arr) => arr.findIndex((x) => x.id === r.id) === i)
                  .slice(0, 5)
                  .map((r) => (
                    <li key={r.id} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
                      <div className="flex-1 min-w-0">
                        <div className="text-[12.5px] font-medium truncate">
                          {getLeaveTypeDisplayName(r.leaveType?.name ?? "Leave")}
                        </div>
                        <div className="text-[11px] text-muted-foreground font-mono">
                          {format(parseISO(r.startDate), "d MMM")} –{" "}
                          {format(parseISO(r.endDate), "d MMM yyyy")} · {r.totalDays}d
                        </div>
                      </div>
                      <LeaveStatusBadge status={r.status} endDate={r.endDate} />
                    </li>
                  ))}
              </ul>
            )}
          </PanelCard>
        </div>

        {/* ── Right rail — my appraisal & upcoming leave ── */}
        <div className="col-span-12 lg:col-span-3 space-y-5">
          <PanelCard
            title="My appraisal"
            action={
              <button
                className="text-[11.5px] text-primary hover:underline"
                onClick={() => navigate({ to: "/appraisals" })}
              >
                Open
              </button>
            }
          >
            {!latestAppraisal ? (
              <p className="text-[12.5px] text-muted-foreground py-2">
                No appraisal on record yet.
              </p>
            ) : (
              <div className="space-y-1.5">
                <div className="text-[13px] font-medium">
                  {latestAppraisal.cycle?.name ?? "Appraisal"}
                </div>
                <span className="inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-brand-200 capitalize">
                  {latestAppraisal.status.replace(/_/g, " ")}
                </span>
              </div>
            )}
          </PanelCard>

          <PanelCard title="Upcoming leave" subtitle="Approved time off">
            {upcomingLeave.length === 0 ? (
              <p className="text-[12.5px] text-muted-foreground py-2">
                No upcoming leave booked.
              </p>
            ) : (
              <ul className="space-y-2.5">
                {upcomingLeave.map((r) => (
                  <li key={r.id} className="rounded-md border border-border p-2.5">
                    <div className="text-[12.5px] font-medium leading-tight">
                      {getLeaveTypeDisplayName(r.leaveType?.name ?? "Leave")}
                    </div>
                    <div className="text-[10.5px] text-muted-foreground mt-1 font-mono">
                      {format(parseISO(r.startDate), "EEE d MMM")} –{" "}
                      {format(parseISO(r.endDate), "EEE d MMM")}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </PanelCard>
        </div>
      </div>
    </>
  );
}
