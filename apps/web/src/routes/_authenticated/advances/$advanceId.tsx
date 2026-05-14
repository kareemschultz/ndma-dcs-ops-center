// /advances/$advanceId — Advance Request detail
// Read-only view of the full advance with status actions (approve / clear).

import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import { useState } from "react";
import { ChevronLeft, CheckCircle2, CreditCard } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@ndma-dcs-staff-portal/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@ndma-dcs-staff-portal/ui/components/card";
import { Input } from "@ndma-dcs-staff-portal/ui/components/input";
import { Label } from "@ndma-dcs-staff-portal/ui/components/label";
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

export const Route = createFileRoute("/_authenticated/advances/$advanceId")({
  component: AdvanceDetailPage,
});

const STATUS_CLASSES: Record<string, string> = {
  pending: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
  partial: "bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300",
  cleared: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300",
};

const KIND_LABELS: Record<string, string> = {
  breakfast: "Breakfast",
  lunch: "Lunch",
  dinner: "Dinner",
  out_of_pocket: "Out of Pocket",
  miscellaneous: "Miscellaneous",
};

function fmtMoney(amount: string | number) {
  const n = typeof amount === "string" ? Number(amount) : amount;
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function AdvanceDetailPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { advanceId } = Route.useParams();
  const [clearanceDate, setClearanceDate] = useState(
    new Date().toISOString().slice(0, 10),
  );

  const { data, isLoading } = useQuery(
    orpc.advances.get.queryOptions({ input: { id: advanceId } }),
  );

  const approveMutation = useMutation(
    orpc.advances.approve.mutationOptions({
      onSuccess: async () => {
        toast.success("Advance approved");
        await queryClient.invalidateQueries({ queryKey: orpc.advances.get.key() });
        await queryClient.invalidateQueries({ queryKey: orpc.advances.list.key() });
      },
      onError: (e: Error) => toast.error(e.message ?? "Failed to approve"),
    }),
  );

  const clearMutation = useMutation(
    orpc.advances.clear.mutationOptions({
      onSuccess: async () => {
        toast.success("Advance cleared");
        await queryClient.invalidateQueries({ queryKey: orpc.advances.get.key() });
        await queryClient.invalidateQueries({ queryKey: orpc.advances.list.key() });
      },
      onError: (e: Error) => toast.error(e.message ?? "Failed to clear"),
    }),
  );

  if (isLoading) {
    return (
      <>
        <Header fixed>
          <div className="flex items-center gap-2">
            <CreditCard className="size-4 text-muted-foreground" />
            <span className="text-sm font-medium">Advance Details</span>
          </div>
          <div className="ms-auto">
            <ThemeSwitch />
          </div>
        </Header>
        <Main>
          <Skeleton className="h-96 w-full" />
        </Main>
      </>
    );
  }

  if (!data) {
    return (
      <>
        <Header fixed>
          <div className="flex items-center gap-2">
            <CreditCard className="size-4 text-muted-foreground" />
            <span className="text-sm font-medium">Advance Details</span>
          </div>
          <div className="ms-auto">
            <ThemeSwitch />
          </div>
        </Header>
        <Main>
          <p className="py-12 text-center text-muted-foreground">
            Advance request not found.
          </p>
        </Main>
      </>
    );
  }

  const recipients = (data.recipients ?? []) as string[];
  const lines = data.lines ?? [];

  return (
    <>
      <Header fixed>
        <button
          type="button"
          onClick={() => navigate({ to: "/advances" })}
          className="flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ChevronLeft className="size-4" /> Advance Requests
        </button>
        <span className="text-muted-foreground/40">/</span>
        <span className="font-mono text-sm">{data.refNumber}</span>
        <div className="ms-auto flex items-center gap-2">
          {data.status === "pending" && (
            <Button
              size="sm"
              onClick={() => approveMutation.mutate({ id: data.id })}
              disabled={approveMutation.isPending}
            >
              <CheckCircle2 className="mr-1.5 size-4" />
              Approve
            </Button>
          )}
          {data.status === "partial" && (
            <div className="flex items-center gap-2">
              <Input
                type="date"
                value={clearanceDate}
                onChange={(e) => setClearanceDate(e.target.value)}
                className="h-8 w-40"
              />
              <Button
                size="sm"
                onClick={() =>
                  clearMutation.mutate({ id: data.id, actualClearance: clearanceDate })
                }
                disabled={clearMutation.isPending}
              >
                <CheckCircle2 className="mr-1.5 size-4" />
                Mark Cleared
              </Button>
            </div>
          )}
          <ThemeSwitch />
        </div>
      </Header>

      <Main>
        <div className="mx-auto max-w-3xl space-y-4">
          {/* Hero */}
          <div className="flex items-start justify-between rounded-xl border bg-muted/30 p-5">
            <div>
              <div className="text-xs uppercase tracking-wider text-muted-foreground">
                Ref Number
              </div>
              <div className="font-mono text-lg font-semibold">{data.refNumber}</div>
              <div className="mt-2 text-sm">
                <span className="font-medium">{data.staffProfile?.user?.name ?? "—"}</span>
                <span className="text-muted-foreground">
                  {" · "}
                  {data.staffProfile?.department?.name ?? ""}
                </span>
              </div>
            </div>
            <div className="text-right">
              <div className="text-xs uppercase tracking-wider text-muted-foreground">
                Total Amount
              </div>
              <div className="font-mono text-2xl font-bold tabular-nums text-primary">
                GYD {fmtMoney(data.totalAmount)}
              </div>
              <span
                className={`mt-2 inline-flex rounded-md px-2 py-0.5 text-xs font-medium ${STATUS_CLASSES[data.status] ?? "bg-muted"}`}
              >
                {data.status}
              </span>
            </div>
          </div>

          {/* Details */}
          <Card>
            <CardHeader>
              <CardTitle>Advance Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>Purpose</Label>
                <p className="mt-1 whitespace-pre-line text-sm">{data.purpose}</p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Date Requested</Label>
                  <div className="mt-1 font-mono text-sm">
                    {data.dateRequested
                      ? format(parseISO(data.dateRequested), "d MMM yyyy")
                      : "—"}
                  </div>
                </div>
                <div>
                  <Label>Expected Clearance</Label>
                  <div className="mt-1 font-mono text-sm">
                    {data.expectedClearance
                      ? format(parseISO(data.expectedClearance), "d MMM yyyy")
                      : "—"}
                  </div>
                </div>
                <div>
                  <Label>Actual Clearance</Label>
                  <div className="mt-1 font-mono text-sm">
                    {data.actualClearance
                      ? format(parseISO(data.actualClearance), "d MMM yyyy")
                      : "—"}
                  </div>
                </div>
                <div>
                  <Label>Status</Label>
                  <div className="mt-1">
                    <span
                      className={`inline-flex rounded-md px-2 py-0.5 text-xs font-medium ${STATUS_CLASSES[data.status] ?? "bg-muted"}`}
                    >
                      {data.status}
                    </span>
                  </div>
                </div>
              </div>

              {recipients.length > 0 && (
                <div>
                  <Label>Recipients</Label>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {recipients.map((r, i) => (
                      <span
                        key={r + i}
                        className="rounded-full border border-blue-200 bg-blue-50 px-2.5 py-0.5 text-xs font-medium text-blue-800 dark:border-blue-800 dark:bg-blue-950/30 dark:text-blue-200"
                      >
                        {r}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {data.notes && (
                <div>
                  <Label>Notes</Label>
                  <p className="mt-1 whitespace-pre-line text-sm text-muted-foreground">
                    {data.notes}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Expense Breakdown */}
          {lines.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Expense Breakdown</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Expense</TableHead>
                      <TableHead className="text-center">Persons</TableHead>
                      <TableHead className="text-center">Cost/Unit (GYD)</TableHead>
                      <TableHead className="text-center">Days</TableHead>
                      <TableHead className="text-right">Amount (GYD)</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {lines.map((line) => (
                      <TableRow key={line.id}>
                        <TableCell className="font-medium">
                          {KIND_LABELS[line.kind] ?? line.kind}
                        </TableCell>
                        <TableCell className="text-center font-mono text-sm">
                          {line.kind === "miscellaneous" ? "—" : line.persons}
                        </TableCell>
                        <TableCell className="text-center font-mono text-sm">
                          {line.kind === "miscellaneous"
                            ? "—"
                            : fmtMoney(line.costPerUnit)}
                        </TableCell>
                        <TableCell className="text-center font-mono text-sm">
                          {line.kind === "miscellaneous" ? "—" : line.days}
                        </TableCell>
                        <TableCell className="text-right font-mono font-semibold tabular-nums">
                          {fmtMoney(line.amount)}
                        </TableCell>
                      </TableRow>
                    ))}
                    <TableRow className="bg-muted/40 font-semibold">
                      <TableCell colSpan={4}>Total</TableCell>
                      <TableCell className="text-right font-mono text-base tabular-nums text-primary">
                        {fmtMoney(data.totalAmount)}
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </div>
      </Main>
    </>
  );
}
