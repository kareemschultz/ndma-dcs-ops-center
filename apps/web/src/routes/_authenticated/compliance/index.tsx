// /compliance — Compliance Hub
// NEW FILE: apps/web/src/routes/_authenticated/compliance/index.tsx
//
// Currently the compliance hub does not exist as a standalone page.
// This provides a proper overview hub with summary numbers per compliance area.
//
// Routes in the compliance group:
//   /compliance          ← this hub (new)
//   /compliance/ppe      ← PPE Matrix (existing)
//   /compliance/training ← Training Records (existing)
//   /compliance/items    ← Compliance Items (existing)

import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AlertCircle, BookOpen, CheckCircle2, HardHat, Shield } from "lucide-react";

import { Button } from "@ndma-dcs-staff-portal/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@ndma-dcs-staff-portal/ui/components/card";
import { Skeleton } from "@ndma-dcs-staff-portal/ui/components/skeleton";
import { Header } from "@/components/layout/header";
import { Main } from "@/components/layout/main";
import { ThemeSwitch } from "@/components/theme-switch";
import { orpc } from "@/utils/orpc";

export const Route = createFileRoute("/_authenticated/compliance/")({
  component: ComplianceHubPage,
});

// ── Compliance health card ─────────────────────────────────────────────────────

function ComplianceCard({
  icon: Icon,
  title,
  total,
  issueCount,
  issueLabel,
  route,
  isLoading,
  healthScore,
}: {
  icon: React.FC<React.SVGProps<SVGSVGElement>>;
  title: string;
  total: number;
  issueCount: number;
  issueLabel: string;
  route: string;
  isLoading: boolean;
  healthScore?: number; // 0-100
}) {
  const navigate = useNavigate();
  const pct = healthScore ?? (total > 0 ? Math.round(((total - issueCount) / total) * 100) : 100);
  const barCls = pct >= 90 ? "bg-primary" : pct >= 70 ? "bg-amber-500" : "bg-red-500";
  const issueCls = issueCount > 0
    ? "text-amber-700 dark:text-amber-300"
    : "text-muted-foreground";

  return (
    <Card className={issueCount > 0 ? "border-amber-200 dark:border-amber-900" : ""}>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="flex items-center gap-2 text-sm font-semibold">
          <Icon className="size-4 text-muted-foreground" />
          {title}
        </CardTitle>
        <Button variant="ghost" size="sm" className="text-xs" onClick={() => navigate({ to: route })}>
          View
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading ? (
          <Skeleton className="h-12 w-full" />
        ) : (
          <>
            {/* Health score */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Compliance rate</span>
                <span className="font-semibold tabular-nums">{pct}%</span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                <div className={`h-full rounded-full transition-all ${barCls}`} style={{ width: `${pct}%` }} />
              </div>
            </div>

            {/* Counts */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <CheckCircle2 className="size-3.5 text-primary" />
                <span>{total - issueCount} of {total} compliant</span>
              </div>
              {issueCount > 0 && (
                <div className={`flex items-center gap-1 text-sm font-medium ${issueCls}`}>
                  <AlertCircle className="size-3.5" />
                  {issueCount} {issueLabel}
                </div>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────

function ComplianceHubPage() {
  // PPE matrix — correct path: orpc.ppe.issuances.matrix.list (not orpc.ppe.matrix.list)
  const { data: ppeItems, isLoading: ppeLoading } = useQuery(
    orpc.ppe.issuances.matrix.list.queryOptions({ input: {} }),
  );

  // Training compliance — orpc.compliance.training.list
  const { data: trainingCompliance, isLoading: trainingLoading } = useQuery(
    orpc.compliance.training.list.queryOptions({ input: {} }),
  );

  // Policy acknowledgements — orpc.compliance.policyAck.list (not policyAcknowledgements)
  const { data: policyAck, isLoading: policyLoading } = useQuery(
    orpc.compliance.policyAck.list.queryOptions({ input: {} }),
  );

  // Derive counts
  const ppeTotal   = ppeItems?.length ?? 0;
  const ppeIssues  = ppeItems?.filter((p) => p.status === "lost" || p.status === "damaged" || p.status === "not_issued").length ?? 0;

  const trainingTotal  = trainingCompliance?.length ?? 0;
  const trainingIssues = trainingCompliance?.filter((t) => t.status === "expired" || t.status === "expiring_soon").length ?? 0;

  const policyTotal  = policyAck?.length ?? 0;
  const policyPending = policyAck?.filter((p) => !p.acknowledgedAt).length ?? 0;

  // Overall health (simple average)
  const overallPct = (() => {
    const scores = [
      ppeTotal    > 0 ? Math.round(((ppeTotal    - ppeIssues)    / ppeTotal)    * 100) : 100,
      trainingTotal > 0 ? Math.round(((trainingTotal - trainingIssues) / trainingTotal) * 100) : 100,
      policyTotal > 0 ? Math.round(((policyTotal  - policyPending) / policyTotal)  * 100) : 100,
    ];
    return Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
  })();

  const overallCls = overallPct >= 90 ? "text-primary" : overallPct >= 70 ? "text-amber-600 dark:text-amber-400" : "text-red-600 dark:text-red-400";

  return (
    <>
      <Header fixed>
        <div className="flex items-center gap-2">
          <Shield className="size-4 text-muted-foreground" />
          <span className="text-sm font-medium">Compliance</span>
        </div>
        <div className="ms-auto flex items-center gap-2"><ThemeSwitch /></div>
      </Header>

      <Main className="space-y-6">
        {/* Header + overall score */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Compliance</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              PPE, training records, and policy acknowledgements across the organisation.
            </p>
          </div>
          <div className="flex flex-col items-end">
            <span className={`text-4xl font-bold tabular-nums ${overallCls}`}>{overallPct}%</span>
            <span className="text-xs text-muted-foreground">overall compliance</span>
          </div>
        </div>

        {/* Overall health bar */}
        <div className="space-y-1.5">
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>Overall compliance health</span>
            <span className="font-medium">{overallPct}%</span>
          </div>
          <div className="h-2.5 w-full overflow-hidden rounded-full bg-muted">
            <div
              className={`h-full rounded-full transition-all ${overallPct >= 90 ? "bg-primary" : overallPct >= 70 ? "bg-amber-500" : "bg-red-500"}`}
              style={{ width: `${overallPct}%` }}
            />
          </div>
        </div>

        {/* Compliance area cards */}
        <div className="grid gap-4 md:grid-cols-3">
          <ComplianceCard
            icon={HardHat}
            title="PPE Status"
            total={ppeTotal}
            issueCount={ppeIssues}
            issueLabel="items requiring attention"
            route="/compliance/ppe"
            isLoading={ppeLoading}
          />
          <ComplianceCard
            icon={BookOpen}
            title="Training Records"
            total={trainingTotal}
            issueCount={trainingIssues}
            issueLabel="expiring / expired"
            route="/compliance/training"
            isLoading={trainingLoading}
          />
          <ComplianceCard
            icon={Shield}
            title="Policy Acknowledgements"
            total={policyTotal}
            issueCount={policyPending}
            issueLabel="pending acknowledgement"
            route="/compliance/items"
            isLoading={policyLoading}
          />
        </div>
      </Main>
    </>
  );
}
