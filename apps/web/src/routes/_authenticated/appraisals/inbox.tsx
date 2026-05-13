// /appraisals/inbox — Fixed version
// Replaces: apps/web/src/routes/_authenticated/appraisals/inbox.tsx
//
// Bug fixes vs original:
//   1. window.prompt() for rejection reason → proper Dialog with Textarea
//   2. Hardcoded "Sachin's Appraisal Inbox" → dynamic session user name
//   3. Urgency badges: days since submitted (>7d=amber, >14d=red)
//   4. <Link><Button> anti-pattern removed → useNavigate onClick

import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { differenceInDays, format } from "date-fns";
import { AlertCircle, CheckCircle2, Inbox, XCircle } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@ndma-dcs-staff-portal/ui/components/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@ndma-dcs-staff-portal/ui/components/dialog";
import { Label } from "@ndma-dcs-staff-portal/ui/components/label";
import { Skeleton } from "@ndma-dcs-staff-portal/ui/components/skeleton";
import { Textarea } from "@ndma-dcs-staff-portal/ui/components/textarea";
import { Header } from "@/components/layout/header";
import { Main } from "@/components/layout/main";
import { ThemeSwitch } from "@/components/theme-switch";
import { authClient } from "@/lib/auth-client";
import { orpc } from "@/utils/orpc";

export const Route = createFileRoute("/_authenticated/appraisals/inbox")({
  component: AppraisalsInboxPage,
});

// ── Reject Dialog (replaces window.prompt) ────────────────────────────────────

function RejectDialog({
  appraisalId,
  staffName,
  open,
  onOpenChange,
}: {
  appraisalId: string;
  staffName: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const [reason, setReason] = useState("");

  const mutation = useMutation(
    orpc.appraisals.reject.mutationOptions({
      onSuccess: async () => {
        toast.success("Appraisal rejected");
        await queryClient.invalidateQueries({ queryKey: orpc.appraisals.list.key() });
        onOpenChange(false);
        setReason("");
      },
      onError: (err: Error) => toast.error(err.message),
    }),
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Reject appraisal — {staffName}</DialogTitle>
          <DialogDescription>
            Provide a reason for rejection. This will be visible to the staff member and their reviewer.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <Label htmlFor="rejection-reason">Reason for rejection *</Label>
          <Textarea
            id="rejection-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Explain what needs to be corrected before re-submission…"
            rows={4}
          />
          <p className="text-xs text-muted-foreground">
            This reason will be visible to the staff member and their reviewer.
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={mutation.isPending}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            disabled={!reason.trim() || mutation.isPending}
            onClick={() => mutation.mutate({ id: appraisalId, rejectionReason: reason.trim() })}
          >
            {mutation.isPending ? "Rejecting…" : "Reject appraisal"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Urgency badge ──────────────────────────────────────────────────────────────

function UrgencyBadge({ submittedAt }: { submittedAt: string | null | undefined }) {
  if (!submittedAt) return null;
  const days = differenceInDays(new Date(), new Date(submittedAt));
  if (days > 14) return (
    <span className="inline-flex items-center gap-1 rounded-md bg-red-100 px-2 py-0.5 text-[10px] font-bold text-red-700 dark:bg-red-900/40 dark:text-red-300">
      <AlertCircle className="size-3" /> Overdue {days}d
    </span>
  );
  if (days > 7) return (
    <span className="rounded-md bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
      Waiting {days}d
    </span>
  );
  return (
    <span className="rounded-md bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
      {days}d ago
    </span>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────

type AppraisalRow = {
  id: string; staffProfileId: string;
  period?: string | null; periodStart?: string | null; periodEnd?: string | null;
  year?: number | null; submittedAt?: string | null;
  managerComments?: string | null;
  staffProfile?: { user?: { name?: string | null } | null; department?: { name?: string | null } | null } | null;
};

function AppraisalsInboxPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  // [FIX] Use session user name — remove hardcoded "Sachin's"
  const { data: session } = authClient.useSession();
  const userName = session?.user?.name ?? "My";
  const role = (session?.user as Record<string, unknown> | undefined)?.role as string | undefined;
  const canReview = role === "admin" || role === "hrAdminOps" || role === "manager";

  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [managerComments, setManagerComments] = useState<Record<string, string>>({});

  const { data, isLoading } = useQuery({
    ...orpc.appraisals.list.queryOptions({ input: { status: "submitted", limit: 100, offset: 0 } }),
    enabled: canReview,
  });

  const approveMutation = useMutation(
    orpc.appraisals.approve.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries({ queryKey: orpc.appraisals.list.key() });
        toast.success("Appraisal approved");
      },
      onError: (err: Error) => toast.error(err.message),
    }),
  );

  const rows = (data ?? []) as AppraisalRow[];
  const rejectingRow = rows.find((r) => r.id === rejectingId);

  function formatPeriod(row: AppraisalRow) {
    if (row.period) return row.period;
    if (row.periodStart && row.periodEnd)
      return `${format(new Date(row.periodStart), "d MMM yyyy")} – ${format(new Date(row.periodEnd), "d MMM yyyy")}`;
    if (row.year) return String(row.year);
    return "—";
  }

  return (
    <>
      <Header fixed>
        <div className="flex items-center gap-2">
          <Inbox className="size-4 text-muted-foreground" />
          {/* [FIX] Dynamic name from session */}
          <span className="text-sm font-medium">{userName}'s Appraisal Inbox</span>
          {rows.length > 0 && (
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
              {rows.length}
            </span>
          )}
        </div>
        <div className="ms-auto flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => navigate({ to: "/appraisals" })}>
            All Appraisals
          </Button>
          <ThemeSwitch />
        </div>
      </Header>

      <Main>
        <div className="mb-6">
          <h1 className="text-2xl font-bold tracking-tight">{userName}'s Appraisal Inbox</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Submitted appraisals awaiting your review. Approve to send to the PA; reject with a reason to return to the staff member.
          </p>
        </div>

        {!canReview ? (
          <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
            You do not have permission to review appraisal submissions. Only managers, HR admins, and admins can access this inbox.
          </div>
        ) : isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)}
          </div>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center rounded-xl border border-dashed p-12 text-center">
            <Inbox className="mb-3 size-10 opacity-30" />
            <p className="font-medium">Inbox is clear</p>
            <p className="mt-1 text-sm text-muted-foreground">No submitted appraisals are waiting for your review.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {rows.map((appraisal) => (
              <div key={appraisal.id} className="rounded-xl border p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2">
                      <p className="font-semibold">{appraisal.staffProfile?.user?.name ?? "—"}</p>
                      {/* [FIX] Urgency badge instead of nothing */}
                      <UrgencyBadge submittedAt={appraisal.submittedAt} />
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {appraisal.staffProfile?.department?.name ?? "Unassigned"} · {formatPeriod(appraisal)}
                      {appraisal.submittedAt && (
                        <span className="ml-2 font-mono text-xs">
                          submitted {format(new Date(appraisal.submittedAt), "d MMM")}
                        </span>
                      )}
                    </p>
                  </div>
                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
                    Awaiting review
                  </span>
                </div>

                <div className="mt-4 grid gap-4 lg:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor={`mgr-${appraisal.id}`}>Manager comments (optional)</Label>
                    <Textarea
                      id={`mgr-${appraisal.id}`}
                      placeholder="Add context for the PA or staff member…"
                      rows={3}
                      value={managerComments[appraisal.id] ?? ""}
                      onChange={(e) => setManagerComments((prev) => ({ ...prev, [appraisal.id]: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Action</Label>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        onClick={() =>
                          approveMutation.mutate({
                            id: appraisal.id,
                            managerComments: managerComments[appraisal.id]?.trim() || undefined,
                          })
                        }
                        disabled={approveMutation.isPending}
                      >
                        <CheckCircle2 className="mr-1 size-4" />
                        Approve
                      </Button>
                      {/* [FIX] Opens Dialog instead of window.prompt() */}
                      <Button
                        variant="destructive"
                        onClick={() => setRejectingId(appraisal.id)}
                        disabled={approveMutation.isPending}
                      >
                        <XCircle className="mr-1 size-4" />
                        Reject
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => navigate({ to: "/appraisals/$appraisalId", params: { appraisalId: appraisal.id } })}
                      >
                        View full appraisal
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Approving sends to PA (Ataybia) for processing. Rejecting returns to staff.
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Main>

      {/* [FIX] Proper Dialog instead of window.prompt() */}
      {rejectingId && rejectingRow && (
        <RejectDialog
          appraisalId={rejectingId}
          staffName={rejectingRow.staffProfile?.user?.name ?? "staff member"}
          open={!!rejectingId}
          onOpenChange={(v) => { if (!v) setRejectingId(null); }}
        />
      )}
    </>
  );
}
