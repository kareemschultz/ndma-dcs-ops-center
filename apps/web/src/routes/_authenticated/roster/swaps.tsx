import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeftRight, CheckCircle2, Plus, XCircle } from "lucide-react";
import { toast } from "sonner";

import { useSession } from "@/lib/auth-client";
import { Button } from "@ndma-dcs-staff-portal/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@ndma-dcs-staff-portal/ui/components/card";
import { Input } from "@ndma-dcs-staff-portal/ui/components/input";
import { Label } from "@ndma-dcs-staff-portal/ui/components/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@ndma-dcs-staff-portal/ui/components/select";
import { Textarea } from "@ndma-dcs-staff-portal/ui/components/textarea";
import { Header } from "@/components/layout/header";
import { Main } from "@/components/layout/main";
import { SchedulingTabs } from "@/components/layout/scheduling-tabs";
import { ThemeSwitch } from "@/components/theme-switch";
import { orpc } from "@/utils/orpc";

export const Route = createFileRoute("/_authenticated/roster/swaps")({
  component: RosterSwapsPage,
});

function RosterSwapsPage() {
  const queryClient = useQueryClient();
  const { data: session } = useSession();
  const role = (session?.user.role as string | undefined) ?? "";
  const canReview = ["manager", "teamLead", "personalAssistant", "hrAdminOps", "admin"].includes(role);
  const [assignmentId, setAssignmentId] = useState("");
  const [targetStaffProfileId, setTargetStaffProfileId] = useState("");
  const [reason, setReason] = useState("");
  const [reviewNotes, setReviewNotes] = useState("");

  const { data: swaps } = useQuery(orpc.roster.swap.list.queryOptions({ input: {} }));
  const { data: staff } = useQuery(orpc.staff.list.queryOptions({ input: { limit: 200, offset: 0 } }));
  const { data: schedules } = useQuery(orpc.roster.list.queryOptions({ input: { status: "published" } }));

  const requestSwap = useMutation(
    orpc.roster.swap.request.mutationOptions({
      onSuccess: async () => {
        toast.success("Swap request submitted");
        setAssignmentId("");
        setTargetStaffProfileId("");
        setReason("");
        await queryClient.invalidateQueries({ queryKey: orpc.roster.swap.list.key() });
      },
      onError: (error: Error) => toast.error(error.message),
    }),
  );

  const reviewSwap = useMutation(
    orpc.roster.swap.review.mutationOptions({
      onSuccess: async () => {
        toast.success("Swap reviewed");
        await queryClient.invalidateQueries({ queryKey: orpc.roster.swap.list.key() });
        await queryClient.invalidateQueries({ queryKey: orpc.roster.list.key() });
      },
      onError: (error: Error) => toast.error(error.message),
    }),
  );

  function submitRequest(e: React.FormEvent) {
    e.preventDefault();
    if (!assignmentId || !targetStaffProfileId) {
      toast.error("Select an assignment and a target staff member.");
      return;
    }
    requestSwap.mutate({
      assignmentId,
      targetStaffProfileId,
      reason: reason || undefined,
    });
  }

  return (
    <>
      <Header fixed>
        <div className="flex items-center gap-2">
          <ArrowLeftRight className="size-4 text-muted-foreground" />
          <span className="text-sm font-medium">Roster Swaps</span>
        </div>
        <div className="ms-auto flex items-center gap-2">
          <ThemeSwitch />
        </div>
      </Header>

      <Main className="space-y-6">
        <SchedulingTabs scope="noc" />

        <div>
          <h1 className="text-2xl font-bold tracking-tight">Swap Requests</h1>
          <p className="text-sm text-muted-foreground">Staff can request coverage swaps; managers can review them.</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Request Swap</CardTitle>
          </CardHeader>
          <CardContent>
            <form className="grid gap-4 md:grid-cols-2" onSubmit={submitRequest}>
              <div className="space-y-1.5">
                <Label>Assignment</Label>
                <Select value={assignmentId} onValueChange={(value) => setAssignmentId(value ?? "")}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select assignment" />
                  </SelectTrigger>
                  <SelectContent>
                    {(schedules ?? []).flatMap((schedule) =>
                      schedule.assignments.map((assignment) => (
                        <SelectItem key={assignment.id} value={assignment.id}>
                          {schedule.monthKey} • {assignment.shiftDate} • {assignment.shiftType} • {assignment.staffProfile?.user?.name ?? "Unassigned"}
                        </SelectItem>
                      )),
                    )}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Target Staff</Label>
                <Select value={targetStaffProfileId} onValueChange={(value) => setTargetStaffProfileId(value ?? "")}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select staff" />
                  </SelectTrigger>
                  <SelectContent>
                    {(staff ?? []).map((member) => (
                      <SelectItem key={member.id} value={member.id}>
                        {member.user?.name ?? member.id}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5 md:col-span-2">
                <Label htmlFor="reason">Reason</Label>
                <Textarea id="reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Explain why the swap is needed." />
              </div>
              <div className="md:col-span-2">
                <Button type="submit" disabled={requestSwap.isPending || !assignmentId || !targetStaffProfileId}>
                  <Plus className="mr-1.5 size-3.5" />
                  {requestSwap.isPending ? "Submitting..." : "Submit Swap Request"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Requests</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {(swaps ?? []).map((swap) => (
              <div key={swap.id} className="rounded-lg border px-3 py-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="font-medium">
                      {swap.requester?.user?.name ?? "Unknown"} → {swap.targetStaffProfile?.user?.name ?? "Unknown"}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {swap.assignment?.schedule?.monthKey} • {swap.assignment?.shiftDate} • {swap.assignment?.shiftType}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {swap.reason ?? "No reason provided"}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="rounded-full border px-2 py-0.5 text-xs">{swap.status}</span>
                    {canReview && swap.status === "pending" && (
                      <>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            reviewSwap.mutate({
                              swapId: swap.id,
                              action: "approve",
                              notes: reviewNotes || undefined,
                            })
                          }
                        >
                          <CheckCircle2 className="mr-1.5 size-3.5" />
                          Approve
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            reviewSwap.mutate({
                              swapId: swap.id,
                              action: "reject",
                              notes: reviewNotes || undefined,
                            })
                          }
                        >
                          <XCircle className="mr-1.5 size-3.5" />
                          Reject
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            ))}
            {(swaps ?? []).length === 0 && (
              <p className="text-sm text-muted-foreground">No swap requests found.</p>
            )}
          </CardContent>
        </Card>

        {canReview && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Review Notes</CardTitle>
            </CardHeader>
            <CardContent>
              <Input value={reviewNotes} onChange={(e) => setReviewNotes(e.target.value)} placeholder="Optional note for approvals or rejections" />
            </CardContent>
          </Card>
        )}
      </Main>
    </>
  );
}
