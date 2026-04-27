import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  BookOpen,
  Calendar,
  CheckCircle2,
  GraduationCap,
  LayoutList,
  Tag,
  Ticket,
  Users,
} from "lucide-react";

import { Badge } from "@ndma-dcs-staff-portal/ui/components/badge";
import { Button } from "@ndma-dcs-staff-portal/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@ndma-dcs-staff-portal/ui/components/card";
import { Skeleton } from "@ndma-dcs-staff-portal/ui/components/skeleton";

import { Header } from "@/components/layout/header";
import { Main } from "@/components/layout/main";
import { ThemeSwitch } from "@/components/theme-switch";
import { orpc } from "@/utils/orpc";

export const Route = createFileRoute("/_authenticated/training/")({
  component: TrainingOverviewPage,
});

function TrainingOverviewPage() {
  const navigate = useNavigate();
  const { data: vouchers, isLoading: vouchersLoading } = useQuery(
    orpc.examVouchers.list.queryOptions({ input: { expiringWithinDays: 30 } }),
  );
  const { data: events, isLoading: eventsLoading } = useQuery(
    orpc.trainingEvents.list.queryOptions({ input: { limit: 5 } }),
  );
  const { data: inHouseLog, isLoading: logLoading } = useQuery(
    orpc.inHouseLog.list.queryOptions({ input: { limit: 5 } }),
  );
  const { data: catalog } = useQuery(orpc.certCatalog.list.queryOptions());

  const expiringVouchers =
    vouchers?.filter((v) => v.status === "unused" || v.status === "assigned") ?? [];

  return (
    <>
      <Header>
        <div className="flex items-center gap-2">
          <GraduationCap className="h-5 w-5" />
          <h1 className="text-xl font-semibold">Training &amp; Development</h1>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <ThemeSwitch />
        </div>
      </Header>

      <Main>
        <div className="mb-6">
          <p className="text-muted-foreground text-sm">
            Overview of training plans, exam schedules, vouchers, events, and in-house logs.
          </p>
        </div>

        {/* Quick-nav tiles */}
        <div className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
          {[
            { to: "/training/plan", icon: LayoutList, label: "Training Plan", color: "text-blue-600" },
            { to: "/training/exams", icon: Calendar, label: "Exam Schedule", color: "text-indigo-600" },
            { to: "/training/vouchers", icon: Ticket, label: "Vouchers", color: "text-amber-600" },
            { to: "/training/events", icon: Users, label: "Events", color: "text-green-600" },
            { to: "/training/in-house", icon: BookOpen, label: "In-House Log", color: "text-purple-600" },
            { to: "/training/catalog", icon: Tag, label: "Cert Catalog", color: "text-rose-600" },
          ].map((item) => (
            <Link key={item.to} to={item.to as string}>
              <Card className="hover:border-primary/50 cursor-pointer transition-colors">
                <CardContent className="flex flex-col items-center gap-2 p-4">
                  <item.icon className={`h-7 w-7 ${item.color}`} />
                  <span className="text-center text-xs font-medium">{item.label}</span>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          {/* Expiring Vouchers */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-base">
                <Ticket className="mr-2 inline h-4 w-4 text-amber-500" />
                Vouchers Expiring in 30 Days
              </CardTitle>
              <Button variant="ghost" size="sm" onClick={() => navigate({ to: "/training/vouchers" })}>
                View all
              </Button>
            </CardHeader>
            <CardContent>
              {vouchersLoading ? (
                <div className="space-y-2">
                  {[...Array(3)].map((_, i) => (
                    <Skeleton key={i} className="h-8 w-full" />
                  ))}
                </div>
              ) : expiringVouchers.length === 0 ? (
                <p className="text-muted-foreground py-4 text-center text-sm">
                  No vouchers expiring soon
                </p>
              ) : (
                <ul className="divide-border divide-y text-sm">
                  {expiringVouchers.slice(0, 5).map((v) => (
                    <li key={v.id} className="flex items-center justify-between py-2">
                      <div>
                        <p className="font-medium">{v.productName}</p>
                        <p className="text-muted-foreground text-xs">
                          #{v.voucherNumber} · expires {v.mustBeUsedBy}
                        </p>
                      </div>
                      <Badge variant={v.status === "unused" ? "destructive" : "secondary"}>
                        {v.status}
                      </Badge>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          {/* Recent Events */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-base">
                <Users className="mr-2 inline h-4 w-4 text-green-500" />
                Recent Training Events
              </CardTitle>
              <Button variant="ghost" size="sm" onClick={() => navigate({ to: "/training/events" })}>
                View all
              </Button>
            </CardHeader>
            <CardContent>
              {eventsLoading ? (
                <div className="space-y-2">
                  {[...Array(3)].map((_, i) => (
                    <Skeleton key={i} className="h-8 w-full" />
                  ))}
                </div>
              ) : !events?.length ? (
                <p className="text-muted-foreground py-4 text-center text-sm">No events recorded</p>
              ) : (
                <ul className="divide-border divide-y text-sm">
                  {events.slice(0, 5).map((e) => (
                    <li key={e.id} className="flex items-center justify-between py-2">
                      <div>
                        <p className="font-medium">{e.institution}</p>
                        <p className="text-muted-foreground text-xs">
                          {e.startDate} · {e.participants?.length ?? 0} participants
                        </p>
                      </div>
                      <span className="text-muted-foreground text-xs">${e.totalCost}</span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          {/* In-House Log */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-base">
                <BookOpen className="mr-2 inline h-4 w-4 text-purple-500" />
                Recent In-House Sessions
              </CardTitle>
              <Button variant="ghost" size="sm" onClick={() => navigate({ to: "/training/in-house" })}>
                View all
              </Button>
            </CardHeader>
            <CardContent>
              {logLoading ? (
                <div className="space-y-2">
                  {[...Array(3)].map((_, i) => (
                    <Skeleton key={i} className="h-8 w-full" />
                  ))}
                </div>
              ) : !inHouseLog?.length ? (
                <p className="text-muted-foreground py-4 text-center text-sm">No sessions recorded</p>
              ) : (
                <ul className="divide-border divide-y text-sm">
                  {inHouseLog.slice(0, 5).map((l) => (
                    <li key={l.id} className="flex items-center justify-between py-2">
                      <div>
                        <p className="font-medium">{l.trainingName}</p>
                        <p className="text-muted-foreground text-xs">
                          {l.staffProfile?.user?.name} · {l.date}
                        </p>
                      </div>
                      {l.assessmentCompleted && (
                        <CheckCircle2 className="h-4 w-4 text-green-500" />
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          {/* Cert Catalog Preview */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-base">
                <Tag className="mr-2 inline h-4 w-4 text-rose-500" />
                Certification Catalog
              </CardTitle>
              <Button variant="ghost" size="sm" onClick={() => navigate({ to: "/training/catalog" })}>
                View all
              </Button>
            </CardHeader>
            <CardContent>
              {!catalog?.length ? (
                <p className="text-muted-foreground py-4 text-center text-sm">
                  No certifications catalogued
                </p>
              ) : (
                <ul className="divide-border divide-y text-sm">
                  {catalog.slice(0, 5).map((c) => (
                    <li key={c.id} className="flex items-center justify-between py-2">
                      <div>
                        <p className="font-medium">{c.recommendedCert}</p>
                        <p className="text-muted-foreground text-xs">
                          {c.trainingArea} · {c.vendor ?? "—"}
                        </p>
                      </div>
                      {c.level && <Badge variant="outline">{c.level}</Badge>}
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </Main>
    </>
  );
}
