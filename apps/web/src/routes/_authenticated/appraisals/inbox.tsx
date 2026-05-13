import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Inbox, CheckCircle2, XCircle } from "lucide-react";
import { toast } from "sonner";

import { Header } from "@/components/layout/header";
import { Main } from "@/components/layout/main";
import { ThemeSwitch } from "@/components/theme-switch";
import { authClient } from "@/lib/auth-client";
import { orpc } from "@/utils/orpc";
import { Button } from "@ndma-dcs-staff-portal/ui/components/button";
import { Label } from "@ndma-dcs-staff-portal/ui/components/label";
import { Textarea } from "@ndma-dcs-staff-portal/ui/components/textarea";

export const Route = createFileRoute("/_authenticated/appraisals/inbox")({
  component: AppraisalsInboxPage,
});

function AppraisalsInboxPage() {
  const navigate = useNavigate();
  const { data: session } = authClient.useSession();
  const role = (session?.user as Record<string, unknown> | undefined)?.role as string | undefined;
  const canReview = role === "admin" || role === "hrAdminOps" || role === "manager";

  const queryClient = useQueryClient();
  const { data } = useQuery({
    ...orpc.appraisals.list.queryOptions({ input: { status: "submitted", limit: 100, offset: 0 } }),
    enabled: canReview,
  });

  const approveMutation = useMutation(
    orpc.appraisals.approve.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries({ queryKey: orpc.appraisals.list.key() });
        toast.success("Appraisal approved");
      },
      onError: (error: Error) => toast.error(error.message),
    }),
  );

  const rejectMutation = useMutation(
    orpc.appraisals.reject.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries({ queryKey: orpc.appraisals.list.key() });
        toast.success("Appraisal rejected");
      },
      onError: (error: Error) => toast.error(error.message),
    }),
  );

  return (
    <>
      <Header fixed>
        <div className="flex items-center gap-2">
          <Inbox className="size-4 text-muted-foreground" />
          <span className="text-sm font-medium">Appraisal Inbox</span>
        </div>
        <div className="ms-auto flex items-center gap-2">
          <ThemeSwitch />
        </div>
      </Header>

      <Main>
        <div className="mb-6 flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Sachin's Appraisal Inbox</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Manager review queue for Sachin Ramsuran. Review submitted appraisals and push them through approval or rejection.
            </p>
          </div>
          <Button variant="outline" onClick={() => navigate({ to: "/appraisals" })}>
            Back to Appraisals
          </Button>
        </div>

        {!canReview ? (
          <div className="rounded-xl border border-dashed p-6 text-sm text-muted-foreground">
            You do not have permission to review appraisal submissions.
          </div>
        ) : (
          <div className="space-y-4">
            {data?.length ? (
              data.map((appraisal) => (
                <div key={appraisal.id} className="rounded-xl border p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="font-medium">
                        {appraisal.staffProfile?.user?.name ?? appraisal.staffProfileId}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {appraisal.staffProfile?.department?.name ?? "Unassigned"} |{" "}
                        {appraisal.period ??
                          (appraisal.periodStart && appraisal.periodEnd
                            ? `${appraisal.periodStart} to ${appraisal.periodEnd}`
                            : appraisal.year ?? "—")}
                      </p>
                    </div>
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
                      Submitted
                    </span>
                  </div>

                  <div className="mt-4 grid gap-4 lg:grid-cols-2">
                    <div className="space-y-2">
                      <Label>Manager Comments</Label>
                      <Textarea
                        id={`mgr-${appraisal.id}`}
                        placeholder="Optional approval / rejection context"
                        rows={3}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Action</Label>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          onClick={() =>
                            approveMutation.mutate({
                              id: appraisal.id,
                              managerComments:
                                (document.getElementById(`mgr-${appraisal.id}`) as HTMLTextAreaElement | null)?.value?.trim() ||
                                undefined,
                            })
                          }
                          disabled={approveMutation.isPending}
                        >
                          <CheckCircle2 className="mr-1 size-4" />
                          Approve
                        </Button>
                        <Button
                          variant="destructive"
                          onClick={() => {
                            const reason = prompt("Rejection reason");
                            if (!reason) return;
                            rejectMutation.mutate({ id: appraisal.id, rejectionReason: reason });
                          }}
                          disabled={rejectMutation.isPending}
                        >
                          <XCircle className="mr-1 size-4" />
                          Reject
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="rounded-xl border border-dashed p-6 text-sm text-muted-foreground">
                No submitted appraisals are waiting for review.
              </div>
            )}
          </div>
        )}
      </Main>
    </>
  );
}
