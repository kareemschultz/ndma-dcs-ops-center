import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import { ArrowUpRight, BadgeCheck, Pencil, Plus, Trash2, TrendingUp } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@ndma-dcs-staff-portal/ui/components/badge";
import { Button } from "@ndma-dcs-staff-portal/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@ndma-dcs-staff-portal/ui/components/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@ndma-dcs-staff-portal/ui/components/dialog";
import { Input } from "@ndma-dcs-staff-portal/ui/components/input";
import { Label } from "@ndma-dcs-staff-portal/ui/components/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@ndma-dcs-staff-portal/ui/components/select";
import { Skeleton } from "@ndma-dcs-staff-portal/ui/components/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@ndma-dcs-staff-portal/ui/components/table";
import { Textarea } from "@ndma-dcs-staff-portal/ui/components/textarea";

import { Header } from "@/components/layout/header";
import { Main } from "@/components/layout/main";
import { ThemeSwitch } from "@/components/theme-switch";
import { useTeamFilter } from "@/lib/team-filter";
import { orpc } from "@/utils/orpc";

export const Route = createFileRoute("/_authenticated/career-progression/")({
  component: CareerProgressionPage,
});

type PlanStatus = "pending" | "achieved" | "missed";

type CareerPlan = {
  id: string;
  staffId: string;
  targetYear: number;
  plannedRole: string;
  conditions?: string | null;
  status: PlanStatus;
  staffProfile?: { user?: { name?: string | null } | null } | null;
};

type StaffListItem = {
  id: string;
  employeeId: string;
  user?: { name?: string | null } | null;
};

const PLAN_STATUS_COLORS: Record<PlanStatus, string> = {
  pending: "bg-muted text-muted-foreground",
  achieved: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  missed: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
};

// ---------------------------------------------------------------------------
// Create / Edit Plan Dialog
// ---------------------------------------------------------------------------

function PlanDialog({
  existing,
  staffList,
  onClose,
}: {
  existing: CareerPlan | null;
  staffList: StaffListItem[];
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    staffId: existing?.staffId ?? "",
    targetYear: existing?.targetYear ?? new Date().getFullYear() + 1,
    plannedRole: existing?.plannedRole ?? "",
    conditions: existing?.conditions ?? "",
    status: (existing?.status ?? "pending") as PlanStatus,
  });

  const mutation = useMutation(
    orpc.careerProgression.upsert.mutationOptions({
      onSuccess: () => {
        toast.success(existing ? "Career plan updated" : "Career plan added");
        queryClient.invalidateQueries({ queryKey: orpc.careerProgression.list.key() });
        onClose();
      },
      onError: (err: Error) => toast.error(err.message ?? "Failed to save plan"),
    }),
  );

  function handleSave() {
    if (!form.staffId) {
      toast.error("Staff member is required");
      return;
    }
    if (!form.plannedRole.trim()) {
      toast.error("Planned role is required");
      return;
    }
    mutation.mutate({
      staffId: form.staffId,
      targetYear: form.targetYear,
      plannedRole: form.plannedRole.trim(),
      conditions: form.conditions.trim() || undefined,
      status: form.status,
    });
  }

  return (
    <DialogContent className="sm:max-w-md">
      <DialogHeader>
        <DialogTitle>{existing ? "Edit Career Plan" : "Add Career Plan"}</DialogTitle>
        <DialogDescription>
          A career progression plan records a target role and year for a staff member.
          Plans are keyed by staff member and year — re-saving the same pair updates it.
        </DialogDescription>
      </DialogHeader>
      <div className="space-y-4 py-2">
        <div className="space-y-1.5">
          <Label>Staff Member</Label>
          <Select
            value={form.staffId}
            onValueChange={(v) => setForm((f) => ({ ...f, staffId: v ?? "" }))}
            disabled={Boolean(existing)}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select staff member…" />
            </SelectTrigger>
            <SelectContent>
              {staffList.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.user?.name ?? s.employeeId}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Target Year</Label>
            <Input
              type="number"
              min={2024}
              max={2035}
              value={form.targetYear}
              disabled={Boolean(existing)}
              onChange={(e) =>
                setForm((f) => ({ ...f, targetYear: Number(e.target.value) || f.targetYear }))
              }
            />
          </div>
          <div className="space-y-1.5">
            <Label>Status</Label>
            <Select
              value={form.status}
              onValueChange={(v) => setForm((f) => ({ ...f, status: (v ?? "pending") as PlanStatus }))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="achieved">Achieved</SelectItem>
                <SelectItem value="missed">Missed</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="space-y-1.5">
          <Label>Planned Role</Label>
          <Input
            value={form.plannedRole}
            onChange={(e) => setForm((f) => ({ ...f, plannedRole: e.target.value }))}
            placeholder="e.g. Senior ICT Engineer"
          />
        </div>
        <div className="space-y-1.5">
          <Label>Conditions (optional)</Label>
          <Textarea
            rows={2}
            value={form.conditions}
            onChange={(e) => setForm((f) => ({ ...f, conditions: e.target.value }))}
            placeholder="e.g. Complete CCIE certification"
          />
        </div>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onClose} disabled={mutation.isPending}>
          Cancel
        </Button>
        <Button onClick={handleSave} disabled={mutation.isPending}>
          {mutation.isPending ? "Saving…" : existing ? "Save Changes" : "Add Plan"}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

function CareerProgressionPage() {
  const { team } = useTeamFilter();
  const queryClient = useQueryClient();
  const [planDialogOpen, setPlanDialogOpen] = useState(false);
  const [editPlan, setEditPlan] = useState<CareerPlan | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<CareerPlan | null>(null);

  const { data: promotions, isLoading } = useQuery(
    orpc.appraisals.promotions.list.queryOptions({
      input: { team: team === "All" ? undefined : team },
    }),
  );

  const { data: staffData } = useQuery(
    orpc.staff.list.queryOptions({ input: { limit: 200, offset: 0 } }),
  );
  const staffList: StaffListItem[] = staffData ?? [];

  const { data: plansData, isLoading: plansLoading } = useQuery(
    orpc.careerProgression.list.queryOptions({ input: {} }),
  );

  const plans = useMemo(
    () =>
      ((plansData ?? []) as CareerPlan[])
        .slice()
        .sort((a, b) => a.targetYear - b.targetYear),
    [plansData],
  );

  const deleteMutation = useMutation(
    orpc.careerProgression.delete.mutationOptions({
      onSuccess: () => {
        toast.success("Career plan removed");
        queryClient.invalidateQueries({ queryKey: orpc.careerProgression.list.key() });
        setDeleteTarget(null);
      },
      onError: (err: Error) => toast.error(err.message ?? "Failed to delete plan"),
    }),
  );

  return (
    <>
      <Header fixed>
        <div className="flex items-center gap-2">
          <TrendingUp className="size-4 text-muted-foreground" />
          <span className="text-sm font-medium">Career Progression</span>
        </div>
        <div className="ms-auto flex items-center gap-2">
          <ThemeSwitch />
        </div>
      </Header>

      <Main className="space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Career Progression</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Forward-looking progression plans and historical promotion records.
            </p>
          </div>
          <Button size="sm" onClick={() => setPlanDialogOpen(true)}>
            <Plus className="mr-1.5 size-4" />
            Add Career Plan
          </Button>
        </div>

        {/* Progression plans — CRUD */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Progression Plans</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Staff Member</TableHead>
                  <TableHead>Target Year</TableHead>
                  <TableHead>Planned Role</TableHead>
                  <TableHead>Conditions</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-24 text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {plansLoading ? (
                  Array.from({ length: 4 }).map((_, i) => (
                    <TableRow key={i}>
                      {Array.from({ length: 6 }).map((_, j) => (
                        <TableCell key={j}>
                          <Skeleton className="h-4 w-full" />
                        </TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : plans.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="py-12 text-center text-muted-foreground">
                      No career progression plans yet. Click "Add Career Plan" to create one.
                    </TableCell>
                  </TableRow>
                ) : (
                  plans.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell className="font-medium">
                        {p.staffProfile?.user?.name ?? "—"}
                      </TableCell>
                      <TableCell className="tabular-nums">{p.targetYear}</TableCell>
                      <TableCell>{p.plannedRole}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {p.conditions || "—"}
                      </TableCell>
                      <TableCell>
                        <span
                          className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${PLAN_STATUS_COLORS[p.status]}`}
                        >
                          {p.status.charAt(0).toUpperCase() + p.status.slice(1)}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button
                            size="icon"
                            variant="ghost"
                            className="size-7"
                            onClick={() => setEditPlan(p)}
                            title="Edit plan"
                          >
                            <Pencil className="size-3.5" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="size-7 text-destructive hover:text-destructive/80"
                            onClick={() => setDeleteTarget(p)}
                            title="Delete plan"
                          >
                            <Trash2 className="size-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Promotion timeline — historical, read-only */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Promotion Timeline</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {isLoading ? (
              Array.from({ length: 5 }).map((_, index) => (
                <Skeleton key={index} className="h-16 rounded-xl" />
              ))
            ) : !promotions?.length ? (
              <p className="text-sm text-muted-foreground">No promotion records available.</p>
            ) : (
              promotions.map((promotion) => (
                <div key={promotion.id} className="flex items-start justify-between gap-4 rounded-xl border p-4">
                  <div>
                    <p className="font-medium">{promotion.staffProfile?.user?.name ?? "—"}</p>
                    <p className="text-sm text-muted-foreground">
                      {promotion.fromTitle ?? "—"} <ArrowUpRight className="inline size-3" /> {promotion.toTitle}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {promotion.promotionDate ? format(parseISO(promotion.promotionDate), "dd MMM yyyy") : "—"}
                    </p>
                  </div>
                  <Badge variant="outline">
                    <BadgeCheck className="mr-1.5 size-3.5" />
                    {promotion.letterDate ? `Letter ${promotion.letterDate}` : "Promotion"}
                  </Badge>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </Main>

      <Dialog open={planDialogOpen} onOpenChange={(v) => { if (!v) setPlanDialogOpen(false); }}>
        {planDialogOpen && (
          <PlanDialog
            existing={null}
            staffList={staffList}
            onClose={() => setPlanDialogOpen(false)}
          />
        )}
      </Dialog>

      <Dialog open={Boolean(editPlan)} onOpenChange={(v) => { if (!v) setEditPlan(null); }}>
        {editPlan && (
          <PlanDialog
            existing={editPlan}
            staffList={staffList}
            onClose={() => setEditPlan(null)}
          />
        )}
      </Dialog>

      <Dialog open={Boolean(deleteTarget)} onOpenChange={(v) => { if (!v) setDeleteTarget(null); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete Career Plan</DialogTitle>
            <DialogDescription>
              Permanently delete the {deleteTarget?.targetYear} plan
              {deleteTarget?.staffProfile?.user?.name
                ? ` for ${deleteTarget.staffProfile.user.name}`
                : ""}
              ? This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDeleteTarget(null)} disabled={deleteMutation.isPending}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={deleteMutation.isPending}
              onClick={() => { if (deleteTarget) deleteMutation.mutate({ id: deleteTarget.id }); }}
            >
              {deleteMutation.isPending ? "Deleting…" : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
