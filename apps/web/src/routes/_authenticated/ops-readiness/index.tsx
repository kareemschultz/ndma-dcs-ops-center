import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  MonitorDot,
  CheckCircle,
  AlertTriangle,
  XCircle,
  CalendarClock,
  AlertCircle,
  ClipboardCheck,
  Wrench,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@ndma-dcs-staff-portal/ui/components/card";
import { Skeleton } from "@ndma-dcs-staff-portal/ui/components/skeleton";
import { Header } from "@/components/layout/header";
import { Main } from "@/components/layout/main";
import { ThemeSwitch } from "@/components/theme-switch";
import { orpc } from "@/utils/orpc";

export const Route = createFileRoute("/_authenticated/ops-readiness/")({
  component: OpsReadinessPage,
});

const TRAFFIC_LIGHT = {
  green: {
    label: "Operational",
    description: "All systems are go. No critical issues.",
    color: "text-blue-600",
    bg: "bg-blue-50 dark:bg-blue-900/20 border-blue-200",
    icon: CheckCircle,
  },
  amber: {
    label: "Watch Required",
    description: "Minor issues need attention before they escalate.",
    color: "text-amber-600",
    bg: "bg-amber-50 dark:bg-amber-900/20 border-amber-200",
    icon: AlertTriangle,
  },
  red: {
    label: "Action Required",
    description: "Multiple issues require immediate attention.",
    color: "text-red-600",
    bg: "bg-red-50 dark:bg-red-900/20 border-red-200",
    icon: XCircle,
  },
};

function ReadinessCheck({
  ok,
  label,
  detail,
  href,
  icon: Icon,
}: {
  ok: boolean;
  label: string;
  detail: string;
  href: string;
  icon: React.ElementType;
}) {
  return (
    <Link to={href}>
      <div
        className={`rounded-xl border p-4 flex items-start gap-3 hover:border-primary/50 transition-colors cursor-pointer ${
          ok ? "" : "border-red-200 bg-red-50/50 dark:bg-red-900/10"
        }`}
      >
        <Icon
          className={`size-5 mt-0.5 shrink-0 ${ok ? "text-blue-600" : "text-red-500"}`}
        />
        <div>
          <p className="text-sm font-medium">{label}</p>
          <p className="text-xs text-muted-foreground mt-0.5">{detail}</p>
        </div>
        <div className="ms-auto">
          {ok ? (
            <CheckCircle className="size-4 text-blue-500" />
          ) : (
            <XCircle className="size-4 text-red-500" />
          )}
        </div>
      </div>
    </Link>
  );
}

function OpsReadinessPage() {
  const { data, isLoading } = useQuery(orpc.dashboard.opsReadiness.queryOptions());

  const status = data?.readinessStatus ?? "green";
  const traffic = TRAFFIC_LIGHT[status as keyof typeof TRAFFIC_LIGHT];
  const TrafficIcon = traffic.icon;

  return (
    <>
      <Header fixed>
        <div className="flex items-center gap-2">
          <MonitorDot className="size-4 text-muted-foreground" />
          <span className="text-sm font-medium">Ops Readiness</span>
        </div>
        <div className="ms-auto flex items-center gap-2">
          <ThemeSwitch />
        </div>
      </Header>

      <Main>
        <div className="mb-6">
          <h1 className="text-2xl font-bold tracking-tight">Operational Readiness</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Composite health check across on-call coverage, incidents, work, and changes.
          </p>
        </div>

        {isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-24 w-full" />
            <div className="grid grid-cols-2 gap-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-20 w-full" />
              ))}
            </div>
          </div>
        ) : (
          <>
            {/* Traffic light card */}
            <div
              className={`rounded-lg border p-6 mb-6 flex items-center gap-4 ${traffic.bg}`}
            >
              <TrafficIcon className={`size-10 shrink-0 ${traffic.color}`} />
              <div>
                <p className={`text-xl font-bold ${traffic.color}`}>{traffic.label}</p>
                <p className="text-sm text-muted-foreground mt-1">{traffic.description}</p>
              </div>
            </div>

            {/* Individual checks */}
            <div className="space-y-2">
              <ReadinessCheck
                ok={data?.onCallComplete ?? false}
                label="On-Call Coverage"
                detail={
                  data?.onCallComplete
                    ? "All 4 roles filled for this week"
                    : "Missing assignments for this week's schedule"
                }
                href="/rota"
                icon={CalendarClock}
              />

              <ReadinessCheck
                ok={(data?.criticalIncidents ?? 0) === 0}
                label="Critical Incidents"
                detail={
                  (data?.criticalIncidents ?? 0) === 0
                    ? "No unresolved Sev1/Sev2 incidents"
                    : `${data?.criticalIncidents} Sev1/Sev2 incident(s) unresolved`
                }
                href="/incidents"
                icon={AlertCircle}
              />

              <ReadinessCheck
                ok={(data?.highOverdueWork ?? 0) <= 2}
                label="High-Priority Work"
                detail={
                  (data?.highOverdueWork ?? 0) === 0
                    ? "No overdue high/critical priority work items"
                    : `${data?.highOverdueWork} high/critical work items are overdue`
                }
                href="/work"
                icon={ClipboardCheck}
              />

              <ReadinessCheck
                ok={(data?.overdueChanges ?? 0) === 0}
                label="Temporary Changes"
                detail={
                  (data?.overdueChanges ?? 0) === 0
                    ? "No overdue temporary changes"
                    : `${data?.overdueChanges} change(s) past their remove-by date`
                }
                href="/changes"
                icon={Wrench}
              />
            </div>
          </>
        )}
      </Main>
    </>
  );
}
