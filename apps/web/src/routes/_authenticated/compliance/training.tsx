import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { format, parseISO, isPast } from "date-fns";
import { GraduationCap } from "lucide-react";
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
import { ComplianceSubNav } from "@/components/layout/compliance-sub-nav";
import { orpc } from "@/utils/orpc";

export const Route = createFileRoute("/_authenticated/compliance/training")({
  component: TrainingPage,
});

type TrainingStatus = "current" | "expiring_soon" | "expired" | "not_applicable";

function ComplianceStatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    current: { label: "Current", cls: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300" },
    expiring_soon: { label: "Expiring Soon", cls: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300" },
    expired: { label: "Expired", cls: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300 font-semibold" },
    not_started: { label: "Not Started", cls: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300" },
    not_applicable: { label: "N/A", cls: "bg-muted text-muted-foreground" },
  };
  const cfg = map[status] ?? { label: status, cls: "bg-muted text-muted-foreground" };
  return <span className={`inline-flex items-center rounded-lg px-2 py-0.5 text-xs font-medium ${cfg.cls}`}>{cfg.label}</span>;
}

function TrainingPage() {
  const [status, setStatus] = useState<TrainingStatus | "">("");

  const { data, isLoading } = useQuery(
    orpc.compliance.training.list.queryOptions({
      input: { status: status || undefined },
    })
  );

  return (
    <>
      <Header fixed>
        <div className="flex items-center gap-2">
          <GraduationCap className="size-4 text-muted-foreground" />
          <span className="text-sm font-medium">Training Records</span>
        </div>
        <div className="ms-auto flex items-center gap-2">
          <ThemeSwitch />
        </div>
      </Header>

      <ComplianceSubNav />
      <Main>
        <div className="mb-6">
          <h1 className="text-2xl font-bold tracking-tight">Training Records</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Track staff training completion, expiry dates, and compliance status.
          </p>
        </div>

        {data && (
          <div className="mb-4 flex flex-wrap gap-4 text-sm">
            <span className="text-muted-foreground">
              <strong className="text-foreground">{data.length}</strong> records
            </span>
            <span className="text-blue-600">
              <strong>{data.filter((r) => r.status === "current").length}</strong> current
            </span>
            <span className="text-amber-600">
              <strong>{data.filter((r) => r.status === "expiring_soon").length}</strong> expiring
            </span>
            <span className="text-red-600">
              <strong>{data.filter((r) => r.status === "expired").length}</strong> expired
            </span>
          </div>
        )}

        <div className="mb-4 flex flex-wrap gap-3">
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as TrainingStatus | "")}
            className="rounded-xl border bg-background px-3 py-1.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="">All Statuses</option>
            <option value="current">Current</option>
            <option value="expiring_soon">Expiring Soon</option>
            <option value="expired">Expired</option>
            <option value="not_applicable">Not Applicable</option>
          </select>
        </div>

        <div className="overflow-x-auto rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Staff Member</TableHead>
                <TableHead>Training</TableHead>
                <TableHead>Provider</TableHead>
                <TableHead>Completed</TableHead>
                <TableHead>Expiry</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 6 }).map((_, j) => (
                      <TableCell key={j}>
                        <Skeleton className="h-4 w-full" />
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : !data?.length ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-12 text-center text-muted-foreground">
                    No training records found.
                  </TableCell>
                </TableRow>
              ) : (
                data.map((record) => {
                  const isExpired =
                    record.expiryDate && isPast(parseISO(record.expiryDate));
                  return (
                    <TableRow key={record.id}>
                      <TableCell className="font-medium">
                        {record.staffProfile?.user?.name ?? "—"}
                      </TableCell>
                      <TableCell className="text-sm">{record.trainingName}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {record.provider ?? "—"}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {record.completedDate
                          ? format(parseISO(record.completedDate), "dd MMM yyyy")
                          : "—"}
                      </TableCell>
                      <TableCell
                        className={`text-xs ${isExpired ? "text-red-600 font-medium" : "text-muted-foreground"}`}
                      >
                        {record.expiryDate
                          ? format(parseISO(record.expiryDate), "dd MMM yyyy")
                          : "—"}
                        {isExpired && " ⚠️"}
                      </TableCell>
                      <TableCell>
                        <ComplianceStatusBadge status={record.status} />
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </Main>
    </>
  );
}
