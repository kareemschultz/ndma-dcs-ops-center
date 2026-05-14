// /contracts — Contract Management
// Replaces: apps/web/src/routes/_authenticated/contracts/index.tsx
//
// Changes from original:
//   • Stats bar: Active | Expiring ≤90 days | Expired | Terminated
//   • Days until expiry cell: red ≤30d, amber ≤60d, blue ≤90d
//   • Contract status badges already correct — enhanced here
//   • Expiring section split into urgency tiers: Critical/Soon/Upcoming
//   • Preserve all CreateContractDialog and mutation logic from original

import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { differenceInDays, format, parseISO } from "date-fns";
import { AlertCircle, FileText, Plus } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@ndma-dcs-staff-portal/ui/components/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@ndma-dcs-staff-portal/ui/components/select";
import { Skeleton } from "@ndma-dcs-staff-portal/ui/components/skeleton";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@ndma-dcs-staff-portal/ui/components/table";
import { Header } from "@/components/layout/header";
import { Main } from "@/components/layout/main";
import { ThemeSwitch } from "@/components/theme-switch";
import { orpc } from "@/utils/orpc";

// NOTE: Preserve CreateContractDialog and all mutation logic from original file.

export const Route = createFileRoute("/_authenticated/contracts/")({
  component: ContractsPage,
});

// ── Constants ──────────────────────────────────────────────────────────────────

const STATUS_BADGE: Record<string, string> = {
  active:       "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  expiring_soon:"bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  expired:      "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
  renewed:      "bg-blue-600 text-white dark:bg-blue-700",
  terminated:   "bg-muted text-muted-foreground",
};

const CONTRACT_TYPE_LABEL: Record<string, string> = {
  permanent:   "Permanent",
  fixed_term:  "Fixed Term",
  contract:    "Contract",
  temporary:   "Temporary",
};

// ── Days badge with urgency colour ────────────────────────────────────────────

function DaysBadge({ days }: { days: number | null }) {
  if (days == null) return <span className="text-muted-foreground">—</span>;
  if (days < 0) return <span className="rounded-md bg-red-600 px-2 py-0.5 text-xs font-bold text-white">Expired {Math.abs(days)}d ago</span>;
  const cls =
    days <= 30 ? "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300 font-bold" :
    days <= 60 ? "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300 font-semibold" :
    days <= 90 ? "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300" :
                 "text-muted-foreground";
  return (
    <span className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs tabular-nums ${cls}`}>
      {days <= 30 && <AlertCircle className="size-3" />}
      {days}d
    </span>
  );
}

// ── Expiring section with urgency tiers ───────────────────────────────────────

function ExpiringSoonSection({ contracts }: { contracts: Array<{ id: string; endDate: string; staffProfile?: { user?: { name?: string | null } | null } | null; contractType: string }> }) {
  const tiers = [
    { label: "Critical — ≤30 days",   max: 30,               cls: "border-red-200   bg-red-50/60   dark:border-red-900   dark:bg-red-950/20"   },
    { label: "Soon — 31–60 days",      min: 31, max: 60,      cls: "border-amber-200 bg-amber-50/60 dark:border-amber-900 dark:bg-amber-950/20" },
    { label: "Upcoming — 61–90 days",  min: 61, max: 90,      cls: "border-blue-200  bg-blue-50/40  dark:border-blue-900  dark:bg-blue-950/10"  },
  ] as Array<{ label: string; min?: number; max: number; cls: string }>;

  const today = new Date();

  return (
    <div className="space-y-3">
      {tiers.map((tier) => {
        const items = contracts.filter((c) => {
          const d = differenceInDays(parseISO(c.endDate), today);
          return d >= (tier.min ?? 0) && d <= tier.max;
        });
        if (items.length === 0) return null;
        return (
          <div key={tier.label} className={`rounded-xl border p-4 ${tier.cls}`}>
            <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
              {tier.max <= 30 && <AlertCircle className="size-4 text-red-500" />}
              {tier.label}
              <span className="ml-auto rounded-full bg-white/60 px-2 py-0.5 text-xs dark:bg-black/20">{items.length}</span>
            </div>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {items.map((c) => {
                const d = differenceInDays(parseISO(c.endDate), today);
                return (
                  <div key={c.id} className="flex items-center justify-between gap-2 rounded-lg border bg-background px-3 py-2">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium">{c.staffProfile?.user?.name ?? "—"}</div>
                      <div className="text-xs text-muted-foreground">{CONTRACT_TYPE_LABEL[c.contractType] ?? c.contractType}</div>
                    </div>
                    <DaysBadge days={d} />
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────

function ContractsPage() {
  const [statusFilter, setStatusFilter] = useState("");
  const [newOpen,      setNewOpen]      = useState(false);

  const { data: contracts, isLoading } = useQuery(
    orpc.contracts.list.queryOptions({ input: { status: (statusFilter || undefined) as "active" | "expired" | "terminated" | "renewed" | undefined } }),
  );
  const { data: expiring } = useQuery(
    orpc.contracts.getExpiringSoon.queryOptions({ input: { withinDays: 90 } }),
  );

  const all = contracts ?? [];
  const today = new Date();

  const stats = {
    active:    all.filter((c) => c.status === "active").length,
    expiring:  expiring?.length ?? 0,
    expired:   all.filter((c) => c.status === "expired").length,
    terminated:all.filter((c) => c.status === "terminated").length,
  };

  return (
    <>
      <Header fixed>
        <div className="flex items-center gap-2">
          <FileText className="size-4 text-muted-foreground" />
          <span className="text-sm font-medium">Contracts</span>
        </div>
        <div className="ms-auto flex items-center gap-2">
          <ThemeSwitch />
          <Button size="sm" onClick={() => setNewOpen(true)}>
            <Plus className="mr-1 size-4" /> New Contract
          </Button>
        </div>
      </Header>

      <Main className="p-0">
        {/* Stats strip */}
        <div className="flex divide-x border-b bg-muted/30">
          {[
            { label: "Active",            value: stats.active,     cls: "text-blue-600 dark:text-blue-400" },
            { label: "Expiring ≤90 days", value: stats.expiring,   cls: stats.expiring > 0 ? "text-amber-600 dark:text-amber-400" : "" },
            { label: "Expired",           value: stats.expired,    cls: stats.expired  > 0 ? "text-red-600 dark:text-red-400"    : "" },
            { label: "Terminated",        value: stats.terminated, cls: "text-muted-foreground" },
          ].map((s) => (
            <div key={s.label} className="flex flex-col px-5 py-2.5 first:pl-6">
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{s.label}</span>
              <span className={`text-xl font-bold tabular-nums leading-tight ${s.cls}`}>{s.value}</span>
            </div>
          ))}
        </div>

        <div className="space-y-6 p-6">
          {/* Expiring soon — tiered urgency */}
          {expiring && expiring.length > 0 && (
            <section>
              <h2 className="mb-3 text-base font-semibold">Expiring Soon</h2>
              <ExpiringSoonSection contracts={expiring as Parameters<typeof ExpiringSoonSection>[0]["contracts"]} />
            </section>
          )}

          {/* All contracts table */}
          <section>
            <div className="mb-3 flex items-center gap-3">
              <h2 className="text-base font-semibold">All Contracts</h2>
              <Select value={statusFilter || "_all"} onValueChange={(v) => setStatusFilter(v === "_all" ? "" : v)}>
                <SelectTrigger className="w-[160px]"><SelectValue placeholder="All Statuses" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="_all">All Statuses</SelectItem>
                  {["active","expired","terminated","renewed"].map((s) => (
                    <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {isLoading ? <Skeleton className="h-48 w-full" /> : (
              <div className="overflow-hidden rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Staff Member</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Start Date</TableHead>
                      <TableHead>End Date</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Days Until Expiry</TableHead>
                      <TableHead className="w-12" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {all.length === 0 ? (
                      <TableRow><TableCell colSpan={7} className="py-12 text-center text-muted-foreground">No contracts found.</TableCell></TableRow>
                    ) : all.map((c) => {
                      const daysLeft = c.endDate ? differenceInDays(parseISO(c.endDate), today) : null;
                      return (
                        <TableRow key={c.id}>
                          <TableCell className="font-medium">{c.staffProfile?.user?.name ?? "—"}</TableCell>
                          <TableCell>{CONTRACT_TYPE_LABEL[c.contractType] ?? c.contractType}</TableCell>
                          <TableCell className="font-mono text-xs">{c.startDate ? format(parseISO(c.startDate), "d MMM yyyy") : "—"}</TableCell>
                          <TableCell className="font-mono text-xs">{c.endDate ? format(parseISO(c.endDate), "d MMM yyyy") : "—"}</TableCell>
                          <TableCell>
                            <span className={`rounded-md px-2 py-0.5 text-xs font-medium ${STATUS_BADGE[c.status] ?? "bg-muted text-muted-foreground"}`}>
                              {c.status.replace("_", " ")}
                            </span>
                          </TableCell>
                          <TableCell><DaysBadge days={daysLeft} /></TableCell>
                          <TableCell>
                            {/* Preserve edit/action buttons from original file */}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </section>
        </div>
      </Main>

      {/* CreateContractDialog — preserve from original file */}
      {/* {newOpen && <CreateContractDialog onClose={() => setNewOpen(false)} />} */}
    </>
  );
}
