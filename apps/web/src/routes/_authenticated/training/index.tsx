import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  BookOpen,
  Calendar,
  GraduationCap,
  LayoutList,
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
  component: TrainingOverviewPage,
});

const TILES = [
  { to: "/training/plan",     Icon: LayoutList, label: "Training Plan",  color: "text-blue-600" },
  { to: "/training/exams",    Icon: Calendar,   label: "Exam Schedule",  color: "text-indigo-600" },
  { to: "/training/vouchers", Icon: Ticket,     label: "Vouchers",       color: "text-amber-600" },
  { to: "/training/events",   Icon: Users,      label: "Events",         color: "text-blue-600" },
  { to: "/training/in-house", Icon: BookOpen,   label: "In-House Log",   color: "text-purple-600" },
  { to: "/training/catalog",  Icon: Tag,        label: "Cert Catalog",   color: "text-rose-600" },
] as const;

function TrainingOverviewPage() {
  const navigate = useNavigate();

  const { data: vouchers, isLoading: vLoading } = useQuery(
    orpc.examVouchers.list.queryOptions({ input: { expiringWithinDays: 60 } }),
  );
  const { data: events, isLoading: eLoading } = useQuery(
    orpc.trainingEvents.list.queryOptions({ input: { limit: 5 } }),
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

        {/* Summary strip */}
        <div className="flex divide-x border-b bg-muted/30">
          {[
            {
              label: "Vouchers expiring ≤30 days",
              value: vLoading ? "…" : String(expiring30.length),
              cls: expiring30.length > 0 ? "text-red-600 dark:text-red-400" : "",
            },
            {
              label: "Upcoming events",
              value: eLoading ? "…" : String(upcomingEvents.length),
              cls: "text-blue-600 dark:text-blue-400",
            },
            {
              label: "Certifications in catalog",
              value: catalog ? String(catalog.length) : "—",
              cls: "",
            },
          ].map((s) => (
            <div key={s.label} className="flex flex-col px-5 py-2.5 first:pl-6">
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{s.label}</span>
              <span className={`text-xl font-bold tabular-nums leading-tight ${s.cls}`}>{s.value}</span>
            </div>
          ))}
        </div>

        <div className="space-y-8 p-6">
          {/* Quick-nav tiles */}
          <div>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">Sections</h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              {TILES.map((item) => (
                <Link key={item.to} to={item.to as string}>
                  <Card className="cursor-pointer transition-colors hover:border-primary/50">
                    <CardContent className="flex flex-col items-center gap-2 p-4">
                      <item.Icon className={`size-7 ${item.color}`} />
                      <span className="text-center text-xs font-medium">{item.label}</span>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          </div>

          {/* Vouchers expiring soon alert */}
          {expiring30.length > 0 && (
            <div className="rounded-xl border border-red-200 bg-red-50/60 p-4 dark:border-red-900 dark:bg-red-950/20">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-semibold text-red-800 dark:text-red-200">
                    {expiring30.length} exam voucher{expiring30.length > 1 ? "s" : ""} expiring within 30 days
                  </h3>
                  <p className="mt-0.5 text-sm text-red-700 dark:text-red-300">
                    Unused vouchers will be lost — assign or schedule exams now.
                  </p>
                </div>
                <Button variant="outline" size="sm" onClick={() => navigate({ to: "/training/vouchers" })}>
                  View vouchers →
                </Button>
              </div>
              <ul className="mt-3 space-y-1">
                {expiring30.slice(0, 3).map((v) => (
                  <li key={v.id} className="flex items-center justify-between text-sm">
                    <span className="font-medium">
                      {v.assignedStaff?.user?.name ?? "Unassigned"} — {v.productName}
                    </span>
                    <span className="font-mono text-xs text-red-600 dark:text-red-400">
                      exp.{" "}
                      {v.mustBeUsedBy
                        ? new Date(v.mustBeUsedBy).toLocaleDateString("en-GB", { day: "numeric", month: "short" })
                        : "—"}
                    </span>
                  </li>
                ))}
                {expiring30.length > 3 && (
                  <li className="text-xs text-muted-foreground">+{expiring30.length - 3} more…</li>
                )}
              </ul>
            </div>
          )}

          {/* Upcoming events */}
          {upcomingEvents.length > 0 && (
            <div>
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-sm font-semibold">Upcoming Training Events</h2>
                <Button variant="ghost" size="sm" onClick={() => navigate({ to: "/training/events" })}>
                  View all
                </Button>
              </div>
              <div className="space-y-2">
                {upcomingEvents.slice(0, 4).map((e) => (
                  <div key={e.id} className="flex items-center gap-3 rounded-lg border p-3">
                    <Calendar className="size-4 shrink-0 text-muted-foreground" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium">{e.institution}</div>
                      <div className="text-xs text-muted-foreground">
                        {e.description} · {e.location ?? "TBD"}
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
