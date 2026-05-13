import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Plus, RefreshCw } from "lucide-react";
import { format } from "date-fns";
import { Button } from "@ndma-dcs-staff-portal/ui/components/button";
import { Skeleton } from "@ndma-dcs-staff-portal/ui/components/skeleton";
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

export const Route = createFileRoute("/_authenticated/incidents/")({
  component: IncidentsPage,
});

type IncidentSeverity = "sev1" | "sev2" | "sev3" | "sev4";
type IncidentStatus =
  | "detected"
  | "investigating"
  | "identified"
  | "mitigating"
  | "resolved"
  | "post_mortem"
  | "closed";

const SEV_COLORS: Record<IncidentSeverity, string> = {
  sev1: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300 font-bold",
  sev2: "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300",
  sev3: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  sev4: "bg-muted text-muted-foreground",
};

const STATUS_COLORS: Record<IncidentStatus, string> = {
  detected: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
  investigating: "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300",
  identified: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  mitigating: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300",
  resolved: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  post_mortem: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  closed: "bg-muted text-muted-foreground",
};

const STATUS_OPTIONS = [
  { value: "", label: "All Statuses" },
  { value: "detected", label: "Detected" },
  { value: "investigating", label: "Investigating" },
  { value: "identified", label: "Identified" },
  { value: "mitigating", label: "Mitigating" },
  { value: "resolved", label: "Resolved" },
  { value: "post_mortem", label: "Post-Mortem" },
  { value: "closed", label: "Closed" },
];

const SEV_OPTIONS = [
  { value: "", label: "All Severities" },
  { value: "sev1", label: "Sev1 — Critical" },
  { value: "sev2", label: "Sev2 — High" },
  { value: "sev3", label: "Sev3 — Medium" },
  { value: "sev4", label: "Sev4 — Low" },
];

const STATUS_LABELS: Record<IncidentStatus, string> = {
  detected: "Detected",
  investigating: "Investigating",
  identified: "Identified",
  mitigating: "Mitigating",
  resolved: "Resolved",
  post_mortem: "Post-Mortem",
  closed: "Closed",
};

const SEV_LABELS: Record<IncidentSeverity, string> = {
  sev1: "Sev1 — Critical",
  sev2: "Sev2 — High",
  sev3: "Sev3 — Medium",
  sev4: "Sev4 — Low",
};

function SeverityBadge({ severity }: { severity: string }) {
  const cls = SEV_COLORS[severity as IncidentSeverity] ?? "bg-muted text-muted-foreground";
  const label = SEV_LABELS[severity as IncidentSeverity] ?? severity.toUpperCase();
  return (
    <span className={`inline-flex items-center rounded-lg px-2 py-0.5 text-xs font-medium ${cls}`}>
      {label}
    </span>
  );
}

function IncidentStatusBadge({ status }: { status: string }) {
  const cls = STATUS_COLORS[status as IncidentStatus] ?? "bg-muted text-muted-foreground";
  const label = STATUS_LABELS[status as IncidentStatus] ?? status.replace("_", " ");
  return (
    <span className={`inline-flex items-center rounded-lg px-2 py-0.5 text-xs font-medium ${cls}`}>
      {label}
    </span>
  );
}

function IncidentsPage() {
  const [status, setStatus] = useState("");
  const [severity, setSeverity] = useState("");

  const { data, isLoading, refetch } = useQuery(
    orpc.incidents.list.queryOptions({
      input: {
        status: (status as IncidentStatus) || undefined,
        severity: (severity as IncidentSeverity) || undefined,
        limit: 100,
        offset: 0,
      },
    })
  );

  const { data: stats } = useQuery(orpc.incidents.stats.queryOptions());
  const { data: active } = useQuery(orpc.incidents.getActive.queryOptions());

  return (
    <>
      <Header fixed>
        <div className="flex items-center gap-2">
          <AlertTriangle className="size-4 text-muted-foreground" />
          <span className="text-sm font-medium">Incidents</span>
        </div>
        <div className="ms-auto flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={() => refetch()} title="Refresh">
            <RefreshCw className="size-4" />
          </Button>
          <ThemeSwitch />
          <Link to="/incidents/new">
            <Button size="sm" variant="destructive">
              <Plus className="size-4 mr-1" />
              Declare Incident
            </Button>
          </Link>
        </div>
      </Header>

      <Main>
        <div className="mb-6">
          <h1 className="text-2xl font-bold tracking-tight">Incidents</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Declare, track, and resolve operational incidents.
          </p>
        </div>

        {/* Stats */}
        {stats && (
          <div className="mb-4 flex flex-wrap gap-4 text-sm">
            <span className="text-muted-foreground">
              <strong className="text-foreground">{stats.total}</strong> total
            </span>
            <span className="text-red-600">
              <strong>{stats.bySeverity?.sev1 ?? 0}</strong> Sev1
            </span>
            <span className="text-orange-600">
              <strong>{stats.bySeverity?.sev2 ?? 0}</strong> Sev2
            </span>
            {active && active.length > 0 && (
              <span className="flex items-center gap-1 font-semibold text-red-600">
                <span className="relative flex size-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                  <span className="relative inline-flex rounded-full size-2 bg-red-500" />
                </span>
                {active.length} active
              </span>
            )}
            {typeof stats.mttrMinutes === "number" && stats.mttrMinutes > 0 && (
              <span className="text-muted-foreground">
                MTTR: <strong className="text-foreground">{Math.round(stats.mttrMinutes)} min</strong>
              </span>
            )}
          </div>
        )}

        {/* Filters */}
        <div className="mb-4 flex flex-wrap gap-3">
          <select
            value={severity}
            onChange={(e) => setSeverity(e.target.value)}
            className="rounded-xl border bg-background px-3 py-1.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          >
            {SEV_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>

          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="rounded-xl border bg-background px-3 py-1.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          >
            {STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>

        <div className="rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Title</TableHead>
                <TableHead>Severity</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Commander</TableHead>
                <TableHead>Detected</TableHead>
                <TableHead>Resolved</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 6 }).map((_, j) => (
                      <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                    ))}
                  </TableRow>
                ))
              ) : !data?.length ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-12 text-center text-muted-foreground">
                    No incidents found.{" "}
                    <Link to="/incidents/new" className="underline">
                      Declare one
                    </Link>
                  </TableCell>
                </TableRow>
              ) : (
                data.map((inc) => (
                  <TableRow key={inc.id}>
                    <TableCell>
                      <Link
                        to="/incidents/$incidentId"
                        params={{ incidentId: inc.id }}
                        className="font-medium hover:underline"
                      >
                        {inc.title}
                      </Link>
                      {inc.impactSummary && (
                        <p className="text-xs text-muted-foreground truncate max-w-xs mt-0.5">
                          {inc.impactSummary}
                        </p>
                      )}
                    </TableCell>
                    <TableCell>
                      <SeverityBadge severity={inc.severity} />
                    </TableCell>
                    <TableCell>
                      <IncidentStatusBadge status={inc.status} />
                    </TableCell>
                    <TableCell>
                      {inc.commander?.user?.name ?? (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-xs">
                      {inc.detectedAt
                        ? format(new Date(inc.detectedAt), "dd MMM, HH:mm")
                        : "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-xs">
                      {inc.resolvedAt
                        ? format(new Date(inc.resolvedAt), "dd MMM, HH:mm")
                        : <span className="text-red-500">Ongoing</span>}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </Main>
    </>
  );
}
