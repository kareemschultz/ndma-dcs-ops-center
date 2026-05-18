import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { Shield, ChevronDown, ChevronRight } from "lucide-react";
import { Skeleton } from "@ndma-dcs-staff-portal/ui/components/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@ndma-dcs-staff-portal/ui/components/table";
import { DataPagination, usePagination } from "@/components/data-pagination";
import { Header } from "@/components/layout/header";
import { Main } from "@/components/layout/main";
import { ThemeSwitch } from "@/components/theme-switch";
import { orpc } from "@/utils/orpc";
import { requireResource } from "@/lib/route-guard";

export const Route = createFileRoute("/_authenticated/audit/")({
  beforeLoad: ({ context }) => requireResource(context, "audit"),
  component: AuditPage,
});

const MODULE_OPTIONS = [
  { value: "", label: "All Modules" },
  { value: "work", label: "Work" },
  { value: "incidents", label: "Incidents" },
  { value: "staff", label: "Staff" },
  { value: "leave", label: "Leave" },
  { value: "rota", label: "On-Call Roster" },
  { value: "procurement", label: "Procurement" },
  { value: "compliance", label: "Compliance" },
  { value: "access", label: "Access" },
  { value: "contracts", label: "Contracts" },
];

function ModuleBadge({ module }: { module: string }) {
  const map: Record<string, string> = {
    work: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
    leave: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
    incidents: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
    staff: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300",
    procurement: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
    rota: "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300",
    compliance: "bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300",
    access: "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300",
    import: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  };
  return (
    <span className={`inline-flex items-center rounded-lg px-2 py-0.5 text-xs font-medium capitalize ${map[module] ?? "bg-muted text-muted-foreground"}`}>
      {module}
    </span>
  );
}

function DiffViewer({ before, after }: { before?: unknown; after?: unknown }) {
  if (!before && !after) return null;
  return (
    <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
      {before != null && (
        <div>
          <p className="text-muted-foreground mb-1">Before</p>
          <pre className="rounded-lg bg-red-50 dark:bg-red-900/20 p-2 overflow-auto max-h-32 text-red-700 dark:text-red-300">
            {JSON.stringify(before, null, 2)}
          </pre>
        </div>
      )}
      {after != null && (
        <div>
          <p className="text-muted-foreground mb-1">After</p>
          <pre className="rounded-lg bg-blue-50 dark:bg-blue-900/20 p-2 overflow-auto max-h-32 text-blue-700 dark:text-blue-300">
            {JSON.stringify(after, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}

function AuditRow({ log }: { log: any }) {
  const [expanded, setExpanded] = useState(false);
  const hasDiff = log.beforeValue || log.afterValue;

  return (
    <>
      <TableRow
        className={hasDiff ? "cursor-pointer" : ""}
        onClick={() => hasDiff && setExpanded((v) => !v)}
      >
        <TableCell className="text-muted-foreground text-xs whitespace-nowrap">
          {format(new Date(log.createdAt), "dd MMM yyyy, HH:mm:ss")}
        </TableCell>
        <TableCell className="font-medium text-sm">{log.actorName ?? "System"}</TableCell>
        <TableCell>
          <span className="font-mono text-xs bg-muted rounded-lg px-1.5 py-0.5">{log.action}</span>
        </TableCell>
        <TableCell><ModuleBadge module={log.module} /></TableCell>
        <TableCell className="text-muted-foreground text-xs">{log.resourceType}</TableCell>
        <TableCell className="text-muted-foreground text-xs">
          {log.actorRole}
        </TableCell>
        <TableCell>
          {hasDiff && (
            <span className="text-muted-foreground">
              {expanded ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
            </span>
          )}
        </TableCell>
      </TableRow>
      {expanded && hasDiff && (
        <TableRow>
          <TableCell colSpan={7} className="bg-muted/30">
            <DiffViewer before={log.beforeValue} after={log.afterValue} />
          </TableCell>
        </TableRow>
      )}
    </>
  );
}

function AuditPage() {
  const [module, setModule] = useState("");
  const [limit, setLimit] = useState(50);

  const { data, isLoading } = useQuery(
    orpc.audit.list.queryOptions({
      input: { module: module || undefined, limit, offset: 0 },
    })
  );

  const pagination = usePagination(data ?? [], 25);

  return (
    <>
      <Header fixed>
        <div className="flex items-center gap-2">
          <Shield className="size-4 text-muted-foreground" />
          <span className="text-sm font-medium">Audit Log</span>
        </div>
        <div className="ms-auto flex items-center gap-2">
          <ThemeSwitch />
        </div>
      </Header>

      <Main>
        <div className="mb-6">
          <h1 className="text-2xl font-bold tracking-tight">Audit Log</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Complete audit trail of all system actions and changes.
          </p>
        </div>

        <div className="mb-4 flex flex-wrap gap-3">
          <select
            value={module}
            onChange={(e) => setModule(e.target.value)}
            className="rounded-xl border bg-background px-3 py-1.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          >
            {MODULE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>

          <select
            value={limit}
            onChange={(e) => setLimit(Number(e.target.value))}
            className="rounded-xl border bg-background px-3 py-1.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option value={50}>Last 50</option>
            <option value={100}>Last 100</option>
            <option value={200}>Last 200</option>
          </select>
        </div>

        <p className="mb-3 text-xs text-muted-foreground">
          Click a row with changes to expand the before/after diff.
        </p>

        <div className="rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Timestamp</TableHead>
                <TableHead>Actor</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Module</TableHead>
                <TableHead>Resource</TableHead>
                <TableHead>Role</TableHead>
                <TableHead className="w-8" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 7 }).map((_, j) => (
                      <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                    ))}
                  </TableRow>
                ))
              ) : !data?.length ? (
                <TableRow>
                  <TableCell colSpan={7} className="py-12 text-center text-muted-foreground">
                    No audit entries found.
                  </TableCell>
                </TableRow>
              ) : (
                pagination.pageItems.map((log) => (
                  <AuditRow key={log.id} log={log} />
                ))
              )}
            </TableBody>
          </Table>
          <div className="border-t px-2">
            <DataPagination
              page={pagination.page}
              pageCount={pagination.pageCount}
              total={pagination.total}
              rangeLabel={pagination.rangeLabel}
              onPageChange={pagination.setPage}
            />
          </div>
        </div>
      </Main>
    </>
  );
}
