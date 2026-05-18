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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@ndma-dcs-staff-portal/ui/components/dialog";
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
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);

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
        setDeleteTargetId(null);
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
    setDeleteTargetId(id);
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

        {/* KPI strip — prototype shape: label top-left, icon top-right, value below */}
        <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
          {[
            { label: "Total requests", value: stats?.total ?? 0, Icon: CreditCard, tone: "" },
            { label: "Pending clearance", value: stats?.pending ?? 0, Icon: Clock, tone: "text-amber-700 dark:text-amber-400" },
            { label: "Total disbursed", value: fmtMoney(stats?.totalDisbursed ?? 0), Icon: Banknote, tone: "" },
            { label: "Cleared", value: stats?.cleared ?? 0, Icon: CheckCircle2, tone: "" },
          ].map((kpi) => (
            <Card key={kpi.label}>
              <CardContent className="p-3">
                <div className="flex items-start justify-between gap-2">
                  <span className="text-[10.5px] uppercase tracking-wider text-muted-foreground">
                    {kpi.label}
                  </span>
                  <kpi.Icon className="size-3.5 text-muted-foreground" />
                </div>
                <div className={`mt-1 text-[22px] font-semibold tabular-nums ${kpi.tone}`}>
                  {kpi.value}
                </div>
              </CardContent>
            </Card>
          ))}
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

      <Dialog
        open={deleteTargetId !== null}
        onOpenChange={(o) => { if (!o) setDeleteTargetId(null); }}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete Advance Request</DialogTitle>
            <DialogDescription>
              Permanently delete this advance request? This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => setDeleteTargetId(null)}
              disabled={deleteMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={deleteMutation.isPending}
              onClick={() => {
                if (deleteTargetId) deleteMutation.mutate({ id: deleteTargetId });
              }}
            >
              {deleteMutation.isPending ? "Deleting…" : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
