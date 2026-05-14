// /advances — Advance Requests list
// Drop-in from design handoff/screens-new.jsx:623 (AdvancesScreen).
// Status tabs, KPI strip, advance table with Excel/PDF export per row.

import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import { useState } from "react";
import {
  Banknote,
  CheckCircle2,
  Clock,
  CreditCard,
  Download,
  FileSpreadsheet,
  FileText,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@ndma-dcs-staff-portal/ui/components/button";
import { Card, CardContent } from "@ndma-dcs-staff-portal/ui/components/card";
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
import { PageHeader } from "@/components/layout/page-header";
import { ThemeSwitch } from "@/components/theme-switch";
import { orpc } from "@/utils/orpc";

export const Route = createFileRoute("/_authenticated/advances/")({
  component: AdvancesPage,
});

type AdvanceStatus = "pending" | "partial" | "cleared";

const STATUS_LABELS: Record<AdvanceStatus, string> = {
  pending: "Pending",
  partial: "Partial",
  cleared: "Cleared",
};

const STATUS_CLASSES: Record<AdvanceStatus, string> = {
  pending: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
  partial: "bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300",
  cleared: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300",
};

function getInitials(name?: string | null) {
  if (!name) return "?";
  return name.split(" ").map((s) => s[0]).slice(0, 2).join("").toUpperCase();
}

function fmtMoney(amount: string | number) {
  const n = typeof amount === "string" ? Number(amount) : amount;
  if (!Number.isFinite(n)) return "—";
  return `GYD ${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtDateShort(d?: string | null) {
  if (!d) return "—";
  return format(parseISO(d), "d MMM");
}

function AdvancesPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<"all" | AdvanceStatus>("all");
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);

  const { data: advances, isLoading } = useQuery(
    orpc.advances.list.queryOptions({ input: { limit: 200, offset: 0 } }),
  );
  const { data: stats } = useQuery(orpc.advances.stats.queryOptions());

  const deleteMutation = useMutation(
    orpc.advances.delete.mutationOptions({
      onSuccess: async () => {
        toast.success("Advance deleted");
        await queryClient.invalidateQueries({ queryKey: orpc.advances.list.key() });
        await queryClient.invalidateQueries({ queryKey: orpc.advances.stats.key() });
      },
      onError: (e: Error) => toast.error(e.message ?? "Failed to delete advance"),
    }),
  );

  const list = advances ?? [];
  const filtered = tab === "all" ? list : list.filter((a) => a.status === tab);

  const counts = {
    all: list.length,
    pending: list.filter((a) => a.status === "pending").length,
    partial: list.filter((a) => a.status === "partial").length,
    cleared: list.filter((a) => a.status === "cleared").length,
  };

  function handleDelete(id: string) {
    if (!confirm("Delete this advance request? This cannot be undone.")) return;
    deleteMutation.mutate({ id });
  }

  return (
    <>
      <Header fixed>
        <div className="flex items-center gap-2">
          <CreditCard className="size-4 text-muted-foreground" />
          <span className="text-sm font-medium">Advance Requests</span>
        </div>
        <div className="ms-auto flex items-center gap-2">
          <ThemeSwitch />
        </div>
      </Header>

      <Main>
        <PageHeader
          eyebrow="Procurement"
          title="Advance Requests"
          description="Cash advances for field operations, site visits, and travel. Approved advances generate NDMA Excel and DCS PDF requisitions."
          actions={
            <Button size="sm" onClick={() => navigate({ to: "/advances/new" })}>
              <Plus className="mr-1.5 size-4" />
              New Advance
            </Button>
          }
          tabs={[
            { value: "all", label: "All", count: counts.all },
            { value: "pending", label: "Pending", count: counts.pending },
            { value: "partial", label: "Partial", count: counts.partial },
            { value: "cleared", label: "Cleared", count: counts.cleared },
          ]}
          activeTab={tab}
          onTabChange={(v) => setTab(v as "all" | AdvanceStatus)}
        />

        {/* KPI strip */}
        <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
          <Card>
            <CardContent className="flex items-center gap-3 p-4">
              <div className="rounded-md bg-primary/10 p-2 text-primary">
                <CreditCard className="size-5" />
              </div>
              <div>
                <div className="text-xs uppercase tracking-wider text-muted-foreground">
                  Total requests
                </div>
                <div className="text-xl font-bold tabular-nums">{stats?.total ?? 0}</div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex items-center gap-3 p-4">
              <div className="rounded-md bg-amber-100 p-2 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
                <Clock className="size-5" />
              </div>
              <div>
                <div className="text-xs uppercase tracking-wider text-muted-foreground">
                  Pending clearance
                </div>
                <div className="text-xl font-bold tabular-nums text-amber-700 dark:text-amber-400">
                  {stats?.pending ?? 0}
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex items-center gap-3 p-4">
              <div className="rounded-md bg-blue-100 p-2 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">
                <Banknote className="size-5" />
              </div>
              <div>
                <div className="text-xs uppercase tracking-wider text-muted-foreground">
                  Total disbursed
                </div>
                <div className="text-base font-bold tabular-nums">
                  {fmtMoney(stats?.totalDisbursed ?? 0)}
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex items-center gap-3 p-4">
              <div className="rounded-md bg-blue-100 p-2 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">
                <CheckCircle2 className="size-5" />
              </div>
              <div>
                <div className="text-xs uppercase tracking-wider text-muted-foreground">
                  Cleared
                </div>
                <div className="text-xl font-bold tabular-nums">{stats?.cleared ?? 0}</div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Table */}
        <div className="rounded-xl border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Requested By</TableHead>
                <TableHead>Ref</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead>Purpose</TableHead>
                <TableHead>Requested</TableHead>
                <TableHead>Due</TableHead>
                <TableHead>Cleared</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-32 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 9 }).map((_, j) => (
                      <TableCell key={j}>
                        <Skeleton className="h-4 w-full" />
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="py-12 text-center text-muted-foreground">
                    No advance requests in this category.
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((row) => {
                  const status = row.status as AdvanceStatus;
                  const name = row.staffProfile?.user?.name ?? "—";
                  return (
                    <TableRow
                      key={row.id}
                      className="cursor-pointer"
                      onClick={() => navigate({ to: "/advances/$advanceId", params: { advanceId: row.id } })}
                    >
                      <TableCell>
                        <div className="flex items-center gap-2.5">
                          <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-blue-100 text-xs font-bold text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">
                            {getInitials(name)}
                          </div>
                          <div className="min-w-0">
                            <div className="truncate text-sm font-medium">{name}</div>
                            <div className="truncate text-xs text-muted-foreground">
                              {row.staffProfile?.department?.name ?? ""}
                            </div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">
                        {row.refNumber}
                      </TableCell>
                      <TableCell className="text-right font-mono font-semibold tabular-nums">
                        {fmtMoney(row.totalAmount)}
                      </TableCell>
                      <TableCell className="max-w-[220px]">
                        <span
                          className="block truncate text-xs"
                          title={row.purpose}
                        >
                          {row.purpose}
                        </span>
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {fmtDateShort(row.dateRequested)}
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {fmtDateShort(row.expectedClearance)}
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {fmtDateShort(row.actualClearance)}
                      </TableCell>
                      <TableCell>
                        <span
                          className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ${STATUS_CLASSES[status]}`}
                        >
                          {STATUS_LABELS[status]}
                        </span>
                      </TableCell>
                      <TableCell
                        className="text-right"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="relative inline-flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-7"
                            title="Edit"
                            onClick={() =>
                              navigate({
                                to: "/advances/$advanceId",
                                params: { advanceId: row.id },
                              })
                            }
                          >
                            <Pencil className="size-3.5" />
                          </Button>
                          <div className="relative">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="size-7"
                              title="Export"
                              onClick={() => setMenuOpenId(menuOpenId === row.id ? null : row.id)}
                            >
                              <Download className="size-3.5" />
                            </Button>
                            {menuOpenId === row.id && (
                              <div
                                className="absolute right-0 top-full z-30 mt-1 w-52 rounded-xl border bg-popover py-1 text-popover-foreground shadow-xl"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <button
                                  type="button"
                                  onClick={() => {
                                    setMenuOpenId(null);
                                    toast.info("Excel export coming soon");
                                  }}
                                  className="flex w-full items-center gap-2.5 px-3 py-2 text-sm hover:bg-accent"
                                >
                                  <FileSpreadsheet className="size-3.5 text-muted-foreground" />
                                  Excel (NDMA format)
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setMenuOpenId(null);
                                    toast.info("PDF export coming soon");
                                  }}
                                  className="flex w-full items-center gap-2.5 px-3 py-2 text-sm hover:bg-accent"
                                >
                                  <FileText className="size-3.5 text-muted-foreground" />
                                  PDF (DCS branded)
                                </button>
                              </div>
                            )}
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-7 text-muted-foreground hover:text-destructive"
                            title="Delete"
                            onClick={() => handleDelete(row.id)}
                            disabled={deleteMutation.isPending}
                          >
                            <Trash2 className="size-3.5" />
                          </Button>
                        </div>
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
