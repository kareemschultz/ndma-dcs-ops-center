import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { format, parseISO, isWithinInterval } from "date-fns";
import { LayoutDashboard, FileText, ScrollText, CalendarOff } from "lucide-react";
import { Skeleton } from "@ndma-dcs-staff-portal/ui/components/skeleton";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@ndma-dcs-staff-portal/ui/components/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@ndma-dcs-staff-portal/ui/components/table";
import { Header } from "@/components/layout/header";
import { Main } from "@/components/layout/main";
import { ThemeSwitch } from "@/components/theme-switch";
import { orpc } from "@/utils/orpc";

export const Route = createFileRoute("/_authenticated/hr/")({
  component: HRDashboardPage,
});

function daysUntil(dateStr: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = parseISO(dateStr);
  return Math.ceil((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

function DaysRemainingBadge({ dateStr }: { dateStr: string }) {
  const days = daysUntil(dateStr);
  let cls = "text-green-600 dark:text-green-400 font-medium";
  if (days < 30) cls = "text-red-600 dark:text-red-400 font-semibold";
  else if (days <= 60) cls = "text-amber-600 dark:text-amber-400 font-medium";
  return <span className={cls}>{days}d</span>;
}

// ── Section A: Pending Appraisals ────────────────────────────────────────────

function PendingAppraisals() {
  const { data, isLoading } = useQuery(
    orpc.appraisals.list.queryOptions({
      input: { status: "submitted", limit: 10, offset: 0 },
    })
  );

  return (
    <Card className="col-span-2">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <FileText className="size-4 text-amber-500" />
          Pending Appraisals
          {data && data.length > 0 && (
            <span className="ml-auto rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
              {data.length}
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Staff Name</TableHead>
                <TableHead>Period</TableHead>
                <TableHead>Submitted</TableHead>
                <TableHead className="w-24" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 4 }).map((_, j) => (
                      <TableCell key={j}>
                        <Skeleton className="h-4 w-full" />
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : !data?.length ? (
                <TableRow>
                  <TableCell colSpan={4} className="py-8 text-center text-sm text-muted-foreground">
                    No appraisals pending approval.
                  </TableCell>
                </TableRow>
              ) : (
                data.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell className="font-medium">
                      {a.staffProfile?.user?.name ?? "—"}
                      {a.staffProfile?.department && (
                        <p className="text-xs text-muted-foreground">
                          {a.staffProfile.department.name}
                        </p>
                      )}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {a.periodStart ? format(parseISO(a.periodStart), "MMM yyyy") : "—"}
                      {" – "}
                      {a.periodEnd ? format(parseISO(a.periodEnd), "MMM yyyy") : "—"}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {a.submittedAt
                        ? format(new Date(a.submittedAt), "d MMM yyyy")
                        : "—"}
                    </TableCell>
                    <TableCell>
                      <Link
                        to="/appraisals"
                        className="text-xs font-medium text-blue-600 hover:underline dark:text-blue-400"
                      >
                        Review
                      </Link>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Section B: Upcoming Contract Renewals ────────────────────────────────────

function ContractRenewals() {
  const { data, isLoading } = useQuery(
    orpc.contracts.getExpiringSoon.queryOptions({ input: { withinDays: 90 } })
  );

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <ScrollText className="size-4 text-blue-500" />
          Contract Renewals
          {data && data.length > 0 && (
            <span className="ml-auto rounded-full bg-blue-100 px-2 py-0.5 text-xs font-semibold text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">
              {data.length}
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full rounded-lg" />
            ))}
          </div>
        ) : !data?.length ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            No contracts expiring soon.
          </p>
        ) : (
          <div className="divide-y rounded-lg border">
            {data.map((c) => (
              <div key={c.id} className="flex items-center justify-between px-3 py-2.5">
                <div>
                  <p className="text-sm font-medium">
                    {c.staffProfile?.user?.name ?? "—"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {c.endDate ? format(parseISO(c.endDate), "d MMM yyyy") : "—"}
                  </p>
                </div>
                {c.endDate && <DaysRemainingBadge dateStr={c.endDate} />}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ── Section D: Staff on Leave Today ─────────────────────────────────────────

function StaffOnLeaveToday() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStr = today.toISOString().slice(0, 10);

  const { data, isLoading } = useQuery(
    orpc.leave.requests.list.queryOptions({
      input: { status: "approved", limit: 50 },
    })
  );

  const onLeaveToday = data?.filter((r) => {
    if (!r.startDate || !r.endDate) return false;
    try {
      return isWithinInterval(today, {
        start: parseISO(r.startDate),
        end: parseISO(r.endDate),
      });
    } catch {
      return false;
    }
  });

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <CalendarOff className="size-4 text-red-500" />
          On Leave Today
          <span className="ml-auto text-xs text-muted-foreground font-normal">
            {todayStr}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        {isLoading ? (
          <div className="flex flex-wrap gap-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-7 w-24 rounded-full" />
            ))}
          </div>
        ) : !onLeaveToday?.length ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            No staff on leave today.
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {onLeaveToday.map((r) => (
              <span
                key={r.id}
                className="inline-flex items-center rounded-full bg-red-100 px-3 py-1 text-xs font-medium text-red-700 dark:bg-red-900/40 dark:text-red-300"
              >
                {r.staffProfile?.user?.name ?? "—"}
              </span>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

function HRDashboardPage() {
  return (
    <>
      <Header fixed>
        <div className="flex items-center gap-2">
          <LayoutDashboard className="size-4 text-muted-foreground" />
          <span className="text-sm font-medium">HR Overview</span>
        </div>
        <div className="ms-auto flex items-center gap-2">
          <ThemeSwitch />
        </div>
      </Header>

      <Main>
        <div className="mb-6">
          <h1 className="text-2xl font-bold tracking-tight">Ataybia's PA Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-1">
            PA overview for DCS &amp; NOC staff appraisals, contracts, and leave at a glance.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* A: Full-width — Pending Appraisals */}
          <PendingAppraisals />

          {/* B: Contract Renewals */}
          <ContractRenewals />

          {/* D: On Leave Today */}
          <StaffOnLeaveToday />
        </div>
      </Main>
    </>
  );
}
