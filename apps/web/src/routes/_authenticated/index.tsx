import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { format, getISOWeek } from "date-fns";
import {
  AlertTriangle,
  ArrowRight,
  CalendarDays,
  ClipboardCheck,
  Clock,
  GraduationCap,
  PalmtreeIcon,
  Sun,
  Wrench,
  Zap,
} from "lucide-react";

import { Button } from "@ndma-dcs-staff-portal/ui/components/button";
import { Skeleton } from "@ndma-dcs-staff-portal/ui/components/skeleton";
import { Header } from "@/components/layout/header";
import { Main } from "@/components/layout/main";
import { ThemeSwitch } from "@/components/theme-switch";
import { NotificationBell } from "@/components/notification-bell";
import { orpc } from "@/utils/orpc";
import { authClient } from "@/lib/auth-client";

export const Route = createFileRoute("/_authenticated/")({
  component: DashboardPage,
});

// ── helpers ────────────────────────────────────────────────────────────────

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

function firstName(name?: string | null): string {
  return name?.split(" ")[0] ?? "there";
}

function initials(name?: string | null): string {
  if (!name) return "?";
  return name
    .split(" ")
    .map((s) => s[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

// Severity pill — P1 / P2 / P3 / P4
function SevBadge({ sev }: { sev: string | null }) {
  const cfg: Record<string, { cls: string; label: string }> = {
    sev1: { cls: "bg-red-600 text-white", label: "P1" },
    sev2: { cls: "bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-300", label: "P2" },
    sev3: { cls: "bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300", label: "P3" },
    sev4: { cls: "bg-muted text-muted-foreground", label: "P4" },
  };
  const c = cfg[sev ?? "sev4"] ?? cfg["sev4"];
  return (
    <span className={`inline-flex items-center justify-center rounded h-5 min-w-[26px] px-1 text-[11px] font-semibold font-mono ${c.cls}`}>
      {c.label}
    </span>
  );
}

// Status chip
function StatusChip({ status }: { status: string }) {
  const map: Record<string, string> = {
    detected: "bg-muted text-muted-foreground",
    investigating: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200",
    identified: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200",
    mitigating: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-brand-200",
    resolved: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-brand-200",
  };
  const cls = map[status] ?? "bg-muted text-muted-foreground";
  return (
    <span className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium ${cls}`}>
      <span className="h-1.5 w-1.5 rounded-full bg-current opacity-80" />
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}

// Health dot for service health
function HealthDot({ ok }: { ok: boolean }) {
  return (
    <span className={`inline-block h-2 w-2 rounded-full shrink-0 ${ok ? "bg-blue-500" : "bg-amber-500"}`} />
  );
}

// Avatar circle with initials
function Avatar({ name, size = 28 }: { name?: string | null; size?: number }) {
  const colors = [
    "bg-blue-700",
    "bg-violet-700",
    "bg-rose-700",
    "bg-amber-700",
    "bg-teal-700",
    "bg-indigo-700",
  ];
  const hash = (name ?? "?").charCodeAt(0) % colors.length;
  return (
    <span
      className={`inline-flex items-center justify-center rounded-full text-white font-medium shrink-0 ${colors[hash]}`}
      style={{ width: size, height: size, fontSize: Math.max(10, size * 0.36) }}
      title={name ?? undefined}
    >
      {initials(name)}
    </span>
  );
}

// Mini sparkline (pure SVG, no Recharts)
function Sparkline({
  values,
  color,
  width = 56,
  height = 20,
}: {
  values: number[];
  color: string;
  width?: number;
  height?: number;
}) {
  if (values.length < 2) return null;
  const max = Math.max(...values);
  const min = Math.min(...values);
  const range = max - min || 1;
  const step = width / (values.length - 1);
  const pts = values
    .map((v, i) => `${i * step},${height - ((v - min) / range) * height}`)
    .join(" ");
  const area = `0,${height} ${pts} ${width},${height}`;
  return (
    <svg width={width} height={height} className="overflow-visible">
      <polygon points={area} fill={color} opacity="0.12" />
      <polyline
        points={pts}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// Risk chip for temp changes
function RiskBadge({ risk }: { risk: string | null }) {
  const map: Record<string, string> = {
    critical: "bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-300",
    high:     "bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-300",
    medium:   "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200",
    low:      "bg-muted text-muted-foreground",
  };
  const cls = map[risk ?? "low"] ?? map["low"];
  return (
    <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-[11px] font-medium ${cls}`}>
      {risk ?? "Low"} risk
    </span>
  );
}

// ── KPI button in hero strip ──────────────────────────────────────────────

function HeroKpi({
  label,
  value,
  sub,
  onClick,
  loading,
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
        <div className="tabular-nums text-[26px] font-semibold mt-0.5">
          {value ?? 0}
        </div>
      )}
      <div className="tabular-nums text-[11.5px] text-brand-200 mt-0.5">{sub}</div>
    </button>
  );
}

// ── Card wrapper ──────────────────────────────────────────────────────────

function PanelCard({
  title,
  subtitle,
  action,
  children,
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

// ── Dashboard page ─────────────────────────────────────────────────────────

function DashboardPage() {
  const navigate = useNavigate();
  const { data: session } = authClient.useSession();
  const userName = session?.user?.name;

  const currentYear  = new Date().getFullYear();
  const currentMonth = new Date().getMonth() + 1;
  const currentWeekNum = getISOWeek(new Date());
  const todayStr     = format(new Date(), "yyyy-MM-dd");
  const todayDisplay = format(new Date(), "EEEE d MMMM");

  // Core dashboard data
  const { data, isLoading } = useQuery(orpc.dashboard.main.queryOptions());

  // Active incidents (unresolved, up to 5 for the panel)
  const { data: incidentsList, isLoading: incLoading } = useQuery(
    orpc.incidents.list.queryOptions({ input: { limit: 5, offset: 0 } }),
  );

  // Temp changes — upcoming / active (for changes panel)
  const { data: changesList } = useQuery(
    orpc.tempChanges.list.queryOptions({ input: { limit: 5, offset: 0 } }),
  );

  // Pending leave requests (for "pending your approval")
  const { data: pendingLeave } = useQuery(
    orpc.leave.requests.list.queryOptions({ input: { status: "pending", limit: 10 } }),
  );

  // Services list (no input needed)
  const { data: servicesList } = useQuery(
    orpc.services.list.queryOptions(),
  );

  // DCS on-call this week
  const { data: dcsWeeks } = useQuery(
    orpc.scheduling.dcsOnCall.list.queryOptions({ input: { year: currentYear } }),
  );
  const currentWeek = dcsWeeks?.find((w) => w.weekNum === currentWeekNum);

  // NOC shifts today
  const { data: nocShifts } = useQuery(
    orpc.scheduling.nocShifts.list.queryOptions({ input: { year: currentYear, month: currentMonth } }),
  );
  const todayNocShifts = nocShifts?.filter((s) => s.shiftDate === todayStr) ?? [];
  const nocOnDay   = todayNocShifts.filter((s) => s.shiftType === "Day Shift").length;
  const nocOnNight = todayNocShifts.filter((s) => s.shiftType === "Night Shift").length;

  // Active incidents (unresolved)
  const activeIncidents = incidentsList?.filter(
    (i) => !["resolved", "post_mortem", "closed"].includes(i.status),
  ) ?? [];

  // Upcoming / active changes
  const upcomingChanges = changesList?.filter(
    (c) => !["removed", "cancelled"].includes(c.status),
  ).slice(0, 3) ?? [];

  // Pending approval items
  const pendingItems = (pendingLeave ?? []).slice(0, 4).map((lr) => ({
    kind: "Leave" as const,
    title: lr.staffProfileId,
    time: format(new Date(lr.startDate), "d MMM"),
  }));

  // Sparkline dummy values per service (deterministic from name)
  function sparkValues(name: string): number[] {
    const seed = name.charCodeAt(0) % 5;
    return Array.from({ length: 14 }, (_, i) => 5 + ((i + seed) % 5));
  }

  const p1Count = activeIncidents.filter((i) => i.severity === "sev1").length;
  const p2Count = activeIncidents.filter((i) => i.severity === "sev2").length;
  const p3Count = activeIncidents.filter((i) => i.severity === "sev3").length;

  return (
    <>
      <Header fixed>
        <div className="ms-auto flex items-center gap-2">
          <NotificationBell />
          <ThemeSwitch />
        </div>
      </Header>

      <Main className="p-0 max-w-none @7xl/content:max-w-none">
        {/* ── Hero strip ── */}
        <section className="relative overflow-hidden border-b bg-gradient-to-br from-brand-800 via-brand-700 to-brand-900 text-white">
          {/* Grid overlay */}
          <div
            className="absolute inset-0 opacity-60"
            style={{
              backgroundImage:
                "linear-gradient(to right,rgba(255,255,255,0.05) 1px,transparent 1px),linear-gradient(to bottom,rgba(255,255,255,0.05) 1px,transparent 1px)",
              backgroundSize: "24px 24px",
            }}
          />
          {/* Ambient glow */}
          <div className="absolute -right-20 -top-20 h-64 w-64 rounded-full bg-gold-400/20 blur-3xl" />
          <div className="relative px-6 py-7">
            <div className="flex items-start justify-between gap-6 flex-wrap">
              <div className="min-w-0">
                {/* Live indicator */}
                <div className="flex items-center gap-2 text-[11.5px] uppercase tracking-widest text-brand-200 font-medium">
                  <span className="relative inline-flex">
                    <span className="h-1.5 w-1.5 rounded-full bg-gold-400" />
                    <span className="absolute inset-0 h-1.5 w-1.5 rounded-full bg-gold-400 animate-ping opacity-75" />
                  </span>
                  <span>
                    Live operations · {todayDisplay} · {format(new Date(), "HH:mm")} AST
                  </span>
                </div>
                {/* Greeting */}
                <h1 className="mt-2 text-[28px] font-semibold tracking-tight">
                  {getGreeting()}, {firstName(userName)}.
                </h1>
                {/* Shift context */}
                <p className="mt-1 text-[14px] text-brand-100 max-w-xl">
                  {currentWeek ? (
                    <>
                      On-call schedule is set for W{currentWeekNum}.{" "}
                      {p1Count > 0 || p2Count > 0 ? (
                        <>
                          {p1Count > 0 && <span className="font-medium text-white">{p1Count} P1</span>}
                          {p1Count > 0 && p2Count > 0 && " and "}
                          {p2Count > 0 && <span className="font-medium text-white">{p2Count} P2</span>}
                          {" "}
                          {p1Count + p2Count === 1 ? "incident needs" : "incidents need"} attention.
                        </>
                      ) : (
                        "No critical incidents at this time."
                      )}
                    </>
                  ) : (
                    "Check the scheduling module to confirm on-call coverage for this week."
                  )}
                </p>
              </div>
              {/* Action buttons */}
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
                  onClick={() => navigate({ to: "/incidents" })}
                >
                  <Zap className="size-3.5" />
                  Incident board
                </Button>
              </div>
            </div>

            {/* KPI strip */}
            <div className="mt-6 grid grid-cols-2 md:grid-cols-4 gap-3 max-w-4xl">
              <HeroKpi
                label="Open incidents"
                value={isLoading ? undefined : data?.activeIncidents}
                sub={
                  (p1Count + p2Count + p3Count) > 0
                    ? `${p1Count > 0 ? `${p1Count} P1` : ""}${p1Count > 0 && p2Count > 0 ? " · " : ""}${p2Count > 0 ? `${p2Count} P2` : ""}${p3Count > 0 ? ` · ${p3Count} P3` : ""}`.trim()
                    : "No active incidents"
                }
                onClick={() => navigate({ to: "/incidents" })}
                loading={isLoading}
              />
              <HeroKpi
                label="Open work"
                value={isLoading ? undefined : data?.openWorkItems}
                sub={`${data?.overdueWorkItems ?? 0} overdue`}
                onClick={() => navigate({ to: "/work" })}
                loading={isLoading}
              />
              <HeroKpi
                label="Changes in flight"
                value={isLoading ? undefined : upcomingChanges.length}
                sub={`${data?.overdueChanges ?? 0} awaiting removal`}
                onClick={() => navigate({ to: "/changes" })}
                loading={isLoading}
              />
              <HeroKpi
                label="On shift now"
                value={`${nocOnDay + nocOnNight}`}
                sub={`${nocOnDay} day · ${nocOnNight} night`}
                onClick={() => navigate({ to: "/scheduling" })}
                loading={false}
              />
            </div>
          </div>
        </section>

        {/* ── Main content grid ── */}
        <div className="px-6 py-6 grid grid-cols-12 gap-5">
          {/* ── Left column ── */}
          <div className="col-span-12 lg:col-span-4 space-y-5">
            {/* Your day */}
            <PanelCard title="Your day" subtitle={todayDisplay}>
              <div className="space-y-3">
                <div className="flex items-start gap-3">
                  <div className="h-9 w-9 rounded-md bg-blue-50 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 flex items-center justify-center shrink-0">
                    <Sun className="size-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-[13px] font-medium">DCS Operations</div>
                    <div className="text-[11.5px] text-muted-foreground">
                      {currentWeek
                        ? `W${currentWeekNum} on-call schedule active`
                        : "No schedule this week"}
                    </div>
                  </div>
                  <span className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-brand-200">
                    <span className="h-1.5 w-1.5 rounded-full bg-current opacity-80" />
                    Active
                  </span>
                </div>

                <div className="flex items-start gap-3">
                  <div className="h-9 w-9 rounded-md bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 flex items-center justify-center shrink-0">
                    <AlertTriangle className="size-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-[13px] font-medium">
                      {activeIncidents.length > 0
                        ? `${activeIncidents.length} active incident${activeIncidents.length > 1 ? "s" : ""}`
                        : "No active incidents"}
                    </div>
                    <div className="text-[11.5px] text-muted-foreground">
                      {p1Count > 0 ? `${p1Count} P1 · ` : ""}
                      {p2Count > 0 ? `${p2Count} P2 · ` : ""}
                      {p3Count > 0 ? `${p3Count} P3` : activeIncidents.length === 0 ? "All clear" : ""}
                    </div>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className="h-9 w-9 rounded-md bg-muted text-muted-foreground flex items-center justify-center shrink-0">
                    <Wrench className="size-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-[13px] font-medium">Upcoming changes</div>
                    <div className="text-[11.5px] text-muted-foreground">
                      {upcomingChanges.length} in the next 7 days
                    </div>
                  </div>
                </div>
              </div>
            </PanelCard>

            {/* Pending your approval */}
            <PanelCard
              title="Pending your approval"
              subtitle={`${pendingItems.length} item${pendingItems.length !== 1 ? "s" : ""}`}
              action={
                <button
                  className="text-[11.5px] text-primary hover:underline"
                  onClick={() => navigate({ to: "/leave" })}
                >
                  View all
                </button>
              }
            >
              {pendingItems.length === 0 ? (
                <p className="text-[12.5px] text-muted-foreground py-2">
                  No pending approvals.
                </p>
              ) : (
                <ul className="divide-y divide-border">
                  {pendingItems.map((p, i) => (
                    <li key={i} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
                      <span className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium bg-amber-50 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300">
                        {p.kind}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="text-[12.5px] font-medium truncate">Leave request</div>
                        <div className="text-[11px] text-muted-foreground">From {p.time}</div>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => navigate({ to: "/leave" })}
                      >
                        Review
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </PanelCard>

            {/* Quick links */}
            <PanelCard title="Quick links">
              <div className="grid grid-cols-2 gap-2">
                {[
                  { label: "Submit timesheet", icon: Clock,          to: "/timesheets" },
                  { label: "My leave balance", icon: PalmtreeIcon,   to: "/leave" },
                  { label: "My appraisal",     icon: ClipboardCheck, to: "/appraisals" },
                  { label: "Training plan",    icon: GraduationCap,  to: "/training" },
                ] .map((q) => (
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

          {/* ── Center column — live ops ── */}
          <div className="col-span-12 lg:col-span-5 space-y-5">
            {/* Active incidents */}
            <PanelCard
              title="Active incidents"
              subtitle="P1–P3 or breaching SLA"
              action={
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => navigate({ to: "/incidents" })}
                >
                  All incidents
                  <ArrowRight className="size-3.5" />
                </Button>
              }
            >
              {incLoading ? (
                <div className="space-y-2">
                  {[0, 1, 2].map((i) => (
                    <Skeleton key={i} className="h-10 w-full" />
                  ))}
                </div>
              ) : activeIncidents.length === 0 ? (
                <p className="text-[12.5px] text-muted-foreground py-3 text-center">
                  No active incidents.
                </p>
              ) : (
                <ul className="divide-y divide-border">
                  {activeIncidents.slice(0, 5).map((inc) => (
                    <li
                      key={inc.id}
                      className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0 cursor-pointer hover:bg-muted/40 -mx-1 px-1 rounded transition-colors"
                      onClick={() => navigate({ to: "/incidents/$incidentId", params: { incidentId: inc.id } })}
                    >
                      <SevBadge sev={inc.severity} />
                      <div className="flex-1 min-w-0">
                        <div className="text-[12.5px] font-medium truncate">{inc.title}</div>
                        <div className="text-[11px] text-muted-foreground font-mono">
                          {inc.id.slice(0, 8)}…
                          {inc.detectedAt && ` · ${format(new Date(inc.detectedAt), "HH:mm")}`}
                        </div>
                      </div>
                      <StatusChip status={inc.status} />
                    </li>
                  ))}
                </ul>
              )}
            </PanelCard>

            {/* Service health */}
            <PanelCard
              title="Service health"
              subtitle="Registered services"
              action={
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => navigate({ to: "/services" })}
                >
                  Services
                  <ArrowRight className="size-3.5" />
                </Button>
              }
            >
              {!servicesList || servicesList.length === 0 ? (
                <p className="text-[12.5px] text-muted-foreground py-3 text-center">
                  No services registered.
                </p>
              ) : (
                <div className="grid grid-cols-2 gap-x-4 gap-y-2.5">
                  {servicesList.slice(0, 8).map((svc) => {
                    // Determine if this service has an active incident
                    const hasIncident = activeIncidents.some((inc) =>
                      inc.title.toLowerCase().includes(svc.name.toLowerCase().split(" ")[0])
                    );
                    return (
                      <div key={svc.id} className="flex items-center gap-2.5 py-1.5">
                        <HealthDot ok={!hasIncident} />
                        <div className="flex-1 min-w-0">
                          <div className="text-[12.5px] font-medium truncate">{svc.name}</div>
                          <div className="text-[10.5px] text-muted-foreground">
                            {hasIncident ? "Incident active" : "Operational"}
                          </div>
                        </div>
                        <Sparkline
                          values={sparkValues(svc.name)}
                          color={hasIncident ? "#d97706" : "#3b82f6"}
                        />
                      </div>
                    );
                  })}
                </div>
              )}
            </PanelCard>
          </div>

          {/* ── Right rail ── */}
          <div className="col-span-12 lg:col-span-3 space-y-5">
            {/* On-Call this week */}
            <PanelCard
              title="On-call this week"
              action={
                <button
                  className="text-[11.5px] text-primary hover:underline"
                  onClick={() => navigate({ to: "/scheduling" })}
                >
                  Roster
                </button>
              }
            >
              {!currentWeek ? (
                <p className="text-[12.5px] text-muted-foreground">
                  Week {currentWeekNum} not assigned.
                </p>
              ) : (
                <ul className="space-y-2.5">
                  {(
                    [
                      { label: "Lead", person: currentWeek.leadEngineer },
                      { label: "ASN", person: currentWeek.asnSupport },
                      { label: "Enterprise", person: currentWeek.enterpriseSupport },
                      { label: "CORE", person: currentWeek.coreSupport },
                    ] as Array<{ label: string; person: { user?: { name?: string | null } | null } | null }>
                  ).map((r) => (
                    <li key={r.label} className="flex items-center gap-2">
                      <Avatar name={r.person?.user?.name} size={26} />
                      <div className="flex-1 min-w-0">
                        <div className="text-[12.5px] font-medium truncate">
                          {r.person?.user?.name ?? "Unassigned"}
                        </div>
                        <div className="text-[11px] text-muted-foreground">{r.label}</div>
                      </div>
                      {r.label === "Lead" && (
                        <span className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium bg-blue-50 text-blue-800 dark:bg-blue-900/40 dark:text-brand-200">
                          <span className="h-1.5 w-1.5 rounded-full bg-current opacity-80" />
                          Lead
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </PanelCard>

            {/* Upcoming changes */}
            <PanelCard
              title="Upcoming changes"
              subtitle="Next 7 days"
              action={
                <button
                  className="text-[11.5px] text-primary hover:underline"
                  onClick={() => navigate({ to: "/changes" })}
                >
                  All
                </button>
              }
            >
              {upcomingChanges.length === 0 ? (
                <p className="text-[12.5px] text-muted-foreground">No upcoming changes.</p>
              ) : (
                <ul className="space-y-2.5">
                  {upcomingChanges.map((c) => (
                    <li
                      key={c.id}
                      className="rounded-md border border-border p-2.5 hover:bg-muted/40 cursor-pointer transition-colors"
                      onClick={() => navigate({ to: "/changes/$changeId", params: { changeId: c.id } })}
                    >
                      <div className="flex items-center gap-1.5 mb-1">
                        <span className="font-mono text-[10.5px] text-muted-foreground">
                          {c.id.slice(0, 8)}…
                        </span>
                        <RiskBadge risk={c.riskLevel} />
                      </div>
                      <div className="text-[12.5px] font-medium leading-tight">{c.title}</div>
                      {c.implementationDate && (
                        <div className="text-[10.5px] text-muted-foreground mt-1">
                          {format(new Date(c.implementationDate), "EEE d MMM")}
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </PanelCard>

            {/* NOC shift summary */}
            <PanelCard
              title="NOC shift now"
              subtitle={`${nocOnDay} day · ${nocOnNight} night`}
              action={
                <button
                  className="text-[11.5px] text-primary hover:underline"
                  onClick={() => navigate({ to: "/scheduling/noc-shifts" })}
                >
                  Grid
                </button>
              }
            >
              <div className="grid grid-cols-2 gap-2">
                {[
                  { label: "Day 07–19",  count: nocOnDay,   cls: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-brand-200" },
                  { label: "Night 19–07",count: nocOnNight, cls: "bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-200" },
                  { label: "On leave",   count: todayNocShifts.filter((s) => ["Annual Leave", "Sick Leave", "Maternity Leave"].includes(s.shiftType)).length, cls: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200" },
                  { label: "Off",        count: todayNocShifts.filter((s) => s.shiftType === "Off").length, cls: "bg-muted text-muted-foreground" },
                ].map((s) => (
                  <div
                    key={s.label}
                    className={`flex items-center justify-between rounded-lg px-2.5 py-2 ${s.cls}`}
                  >
                    <span className="text-[11.5px] font-medium">{s.label}</span>
                    <span className="tabular-nums text-[18px] font-semibold">{s.count}</span>
                  </div>
                ))}
              </div>
            </PanelCard>
          </div>
        </div>
      </Main>
    </>
  );
}
