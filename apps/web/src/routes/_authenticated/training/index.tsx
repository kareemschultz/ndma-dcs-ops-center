import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  BookOpen,
  CalendarDays,
  ClipboardList,
  GraduationCap,
  Tag,
  Ticket,
  Users,
} from "lucide-react";

import { Button } from "@ndma-dcs-staff-portal/ui/components/button";
import { Card, CardContent } from "@ndma-dcs-staff-portal/ui/components/card";
import { Header } from "@/components/layout/header";
import { Main } from "@/components/layout/main";
import { ThemeSwitch } from "@/components/theme-switch";
import { TrainingSubNav } from "@/components/layout/training-sub-nav";
import { orpc } from "@/utils/orpc";

export const Route = createFileRoute("/_authenticated/training/")({
  component: TrainingHubPage,
});

/**
 * Action cards — each one tells the user exactly what they would do here and
 * where it takes them. The wording is task-first ("I want to…") on purpose.
 */
const ACTIONS = [
  {
    to: "/training/plan",
    Icon: ClipboardList,
    title: "Plan future training",
    blurb:
      "Set the training areas each staff member should cover this year, with a target quarter and status.",
    accent: "text-blue-600 bg-blue-50 dark:bg-blue-950/40",
  },
  {
    to: "/training/events",
    Icon: Users,
    title: "Schedule a training event",
    blurb:
      "Record an external course or workshop — institution, dates, cost breakdown, and who attended.",
    accent: "text-indigo-600 bg-indigo-50 dark:bg-indigo-950/40",
  },
  {
    to: "/training/in-house",
    Icon: BookOpen,
    title: "Log an in-house session",
    blurb:
      "Record training delivered internally to a staff member — knowledge-sharing, on-the-job sessions, NOC walkthroughs.",
    accent: "text-violet-600 bg-violet-50 dark:bg-violet-950/40",
  },
  {
    to: "/training/vouchers",
    Icon: Ticket,
    title: "Track exam vouchers",
    blurb:
      "Add purchased exam vouchers, assign them to staff, and watch their must-use-by dates so none expire unused.",
    accent: "text-amber-600 bg-amber-50 dark:bg-amber-950/40",
  },
  {
    to: "/training/exams",
    Icon: CalendarDays,
    title: "Manage exam bookings",
    blurb:
      "See which staff have an exam to sit, mark exams as booked, and record pass / fail results.",
    accent: "text-blue-600 bg-blue-50 dark:bg-blue-950/40",
  },
  {
    to: "/training/catalog",
    Icon: Tag,
    title: "Maintain the certification catalog",
    blurb:
      "The reference list of recommended certifications per training area — used when building training plans.",
    accent: "text-rose-600 bg-rose-50 dark:bg-rose-950/40",
  },
] as const;

function TrainingHubPage() {
  const navigate = useNavigate();

  const { data: vouchers, isLoading: vLoading } = useQuery(
    orpc.examVouchers.list.queryOptions({ input: { expiringWithinDays: 60 } }),
  );
  const { data: events, isLoading: eLoading } = useQuery(
    orpc.trainingEvents.list.queryOptions({ input: { limit: 50 } }),
  );
  const { data: catalog } = useQuery(orpc.certCatalog.list.queryOptions());

  // Vouchers already filtered to expiring ≤60 days; further split to ≤30
  const activeVouchers = (vouchers ?? []).filter(
    (v) => v.status === "unused" || v.status === "assigned",
  );
  const expiring30 = activeVouchers.filter((v) => {
    if (!v.mustBeUsedBy) return false;
    const d = Math.floor((new Date(v.mustBeUsedBy).getTime() - Date.now()) / 86_400_000);
    return d <= 30;
  });
  const upcomingEvents = (events ?? []).filter((e) => new Date(e.startDate) >= new Date());

  const KPIS = [
    {
      label: "Vouchers expiring ≤30 days",
      value: vLoading ? "…" : String(expiring30.length),
      cls: expiring30.length > 0 ? "text-red-600 dark:text-red-400" : "",
    },
    {
      label: "Upcoming training events",
      value: eLoading ? "…" : String(upcomingEvents.length),
      cls: "text-blue-600 dark:text-blue-400",
    },
    {
      label: "Certifications in catalog",
      value: catalog ? String(catalog.length) : "—",
      cls: "",
    },
  ];

  return (
    <>
      <Header fixed>
        <div className="flex items-center gap-2">
          <GraduationCap className="size-4 text-muted-foreground" />
          <span className="text-sm font-medium">Training &amp; Development</span>
        </div>
        <div className="ms-auto flex items-center gap-2">
          <ThemeSwitch />
        </div>
      </Header>

      <Main className="p-0">
        <TrainingSubNav active="/training" />

        <div className="space-y-8 p-6">
          {/* What this section is for */}
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Training Hub</h1>
            <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
              Everything DCS does to develop staff lives here — planning who needs what,
              scheduling courses and in-house sessions, managing exam vouchers, and recording
              exam results. Not sure where to go? Pick the card below that matches what you
              want to do.
            </p>
          </div>

          {/* KPI tiles */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {KPIS.map((k) => (
              <Card key={k.label}>
                <CardContent className="flex flex-col gap-1 p-4">
                  <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                    {k.label}
                  </span>
                  <span className={`text-2xl font-bold tabular-nums leading-tight ${k.cls}`}>
                    {k.value}
                  </span>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Vouchers expiring soon alert */}
          {expiring30.length > 0 && (
            <div className="rounded-xl border border-red-200 bg-red-50/60 p-4 dark:border-red-900 dark:bg-red-950/20">
              <div className="flex items-start justify-between gap-4">
                <div className="flex gap-3">
                  <AlertTriangle className="mt-0.5 size-5 shrink-0 text-red-600 dark:text-red-400" />
                  <div>
                    <h3 className="font-semibold text-red-800 dark:text-red-200">
                      {expiring30.length} exam voucher{expiring30.length > 1 ? "s" : ""} expiring
                      within 30 days
                    </h3>
                    <p className="mt-0.5 text-sm text-red-700 dark:text-red-300">
                      Unused vouchers are wasted money — assign them to staff or get the exams
                      booked now.
                    </p>
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => navigate({ to: "/training/vouchers" })}
                >
                  View vouchers
                </Button>
              </div>
              <ul className="mt-3 space-y-1 pl-8">
                {expiring30.slice(0, 3).map((v) => (
                  <li key={v.id} className="flex items-center justify-between text-sm">
                    <span className="font-medium">
                      {v.assignedStaff?.user?.name ?? "Unassigned"} — {v.productName}
                    </span>
                    <span className="font-mono text-xs text-red-600 dark:text-red-400">
                      exp.{" "}
                      {v.mustBeUsedBy
                        ? new Date(v.mustBeUsedBy).toLocaleDateString("en-GB", {
                            day: "numeric",
                            month: "short",
                          })
                        : "—"}
                    </span>
                  </li>
                ))}
                {expiring30.length > 3 && (
                  <li className="text-xs text-muted-foreground">
                    +{expiring30.length - 3} more…
                  </li>
                )}
              </ul>
            </div>
          )}

          {/* Action cards */}
          <div>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              What would you like to do?
            </h2>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {ACTIONS.map((a) => (
                <Card
                  key={a.to}
                  className="cursor-pointer transition-colors hover:border-primary/50"
                  onClick={() => navigate({ to: a.to })}
                >
                  <CardContent className="flex flex-col gap-3 p-5">
                    <div className={`flex size-10 items-center justify-center rounded-lg ${a.accent}`}>
                      <a.Icon className="size-5" />
                    </div>
                    <div>
                      <h3 className="font-semibold">{a.title}</h3>
                      <p className="mt-1 text-sm text-muted-foreground">{a.blurb}</p>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>

          {/* Upcoming events */}
          {upcomingEvents.length > 0 && (
            <div>
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                  Upcoming Training Events
                </h2>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => navigate({ to: "/training/events" })}
                >
                  View all
                </Button>
              </div>
              <div className="space-y-2">
                {upcomingEvents.slice(0, 4).map((e) => (
                  <div key={e.id} className="flex items-center gap-3 rounded-lg border p-3">
                    <CalendarDays className="size-4 shrink-0 text-muted-foreground" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium">{e.description}</div>
                      <div className="text-xs text-muted-foreground">
                        {e.institution} · {e.location ?? "Location TBD"}
                      </div>
                    </div>
                    <span className="font-mono text-xs text-muted-foreground">
                      {new Date(e.startDate).toLocaleDateString("en-GB", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </Main>
    </>
  );
}
