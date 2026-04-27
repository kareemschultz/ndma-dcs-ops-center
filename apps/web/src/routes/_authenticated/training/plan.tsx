import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { LayoutList, Plus, Save } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@ndma-dcs-staff-portal/ui/components/badge";
import { Button } from "@ndma-dcs-staff-portal/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@ndma-dcs-staff-portal/ui/components/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@ndma-dcs-staff-portal/ui/components/dialog";
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

import { Header } from "@/components/layout/header";
import { Main } from "@/components/layout/main";
import { ThemeSwitch } from "@/components/theme-switch";
import { orpc } from "@/utils/orpc";

export const Route = createFileRoute("/_authenticated/training/plan")({
  component: TrainingPlanPage,
});

const TRAINING_AREAS = [
  "Networking",
  "Cloud",
  "Security",
  "Fibre",
  "Backhaul",
  "LTE",
  "Monitoring",
  "IT Operations",
  "Leadership",
  "Project Management",
];

const STATUS_COLORS: Record<string, string> = {
  planned: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  in_progress: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200",
  completed: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  cancelled: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
};

const CURRENT_YEAR = new Date().getFullYear();

type PlannedTraining = {
  trainingArea: string;
  targetQuarter?: "Q1" | "Q2" | "Q3" | "Q4";
  status: "planned" | "in_progress" | "completed" | "cancelled";
};

export default function TrainingPlanPage() {
  const queryClient = useQueryClient();
  const [year, setYear] = useState(CURRENT_YEAR);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingStaffId, setEditingStaffId] = useState<string | null>(null);
  const [draftTrainings, setDraftTrainings] = useState<PlannedTraining[]>([]);

  const { data: staff, isLoading: staffLoading } = useQuery(
    orpc.staff.list.queryOptions({ input: { limit: 200 } }),
  );
  const { data: plans, isLoading: plansLoading } = useQuery(
    orpc.trainingPlans.list.queryOptions({ input: { year, limit: 500 } }),
  );

  const upsertMutation = useMutation(
    orpc.trainingPlans.upsert.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: orpc.trainingPlans.list.key() });
        setEditDialogOpen(false);
        toast.success("Training plan saved");
      },
      onError: () => toast.error("Failed to save training plan"),
    }),
  );

  const planByStaffId = new Map(plans?.map((p) => [p.staffId, p]) ?? []);

  function openEdit(staffId: string) {
    const plan = planByStaffId.get(staffId);
    setEditingStaffId(staffId);
    setDraftTrainings(
      plan ? (plan.plannedTrainings as PlannedTraining[]) : [],
    );
    setEditDialogOpen(true);
  }

  function addTrainingArea() {
    setDraftTrainings((prev) => [
      ...prev,
      { trainingArea: TRAINING_AREAS[0], status: "planned" },
    ]);
  }

  function updateDraft(index: number, field: keyof PlannedTraining, value: string) {
    setDraftTrainings((prev) =>
      prev.map((item, i) => (i === index ? { ...item, [field]: value } : item)),
    );
  }

  function removeDraft(index: number) {
    setDraftTrainings((prev) => prev.filter((_, i) => i !== index));
  }

  function saveEdit() {
    if (!editingStaffId) return;
    upsertMutation.mutate({
      staffId: editingStaffId,
      year,
      plannedTrainings: draftTrainings,
    });
  }

  const editingStaff = staff?.find((s) => s.id === editingStaffId);

  return (
    <>
      <Header>
        <div className="flex items-center gap-2">
          <LayoutList className="h-5 w-5" />
          <h1 className="text-xl font-semibold">Training Plan Matrix</h1>
        </div>
        <div className="ml-auto flex items-center gap-4">
          <Select value={String(year)} onValueChange={(v) => v != null && setYear(Number(v))}>
            <SelectTrigger className="w-28">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[CURRENT_YEAR - 1, CURRENT_YEAR, CURRENT_YEAR + 1].map((y) => (
                <SelectItem key={y} value={String(y)}>
                  {y}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <ThemeSwitch />
        </div>
      </Header>

      <Main>
        <Card>
          <CardHeader>
            <CardTitle>Staff × Training Areas — {year}</CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto p-0">
            {staffLoading || plansLoading ? (
              <div className="space-y-2 p-4">
                {[...Array(5)].map((_, i) => (
                  <Skeleton key={i} className="h-10 w-full" />
                ))}
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="min-w-[160px]">Staff</TableHead>
                    <TableHead>Dept</TableHead>
                    <TableHead>Planned Areas</TableHead>
                    <TableHead className="w-20 text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {staff?.map((s) => {
                    const plan = planByStaffId.get(s.id);
                    const trainings = (plan?.plannedTrainings as PlannedTraining[] | undefined) ?? [];
                    return (
                      <TableRow key={s.id}>
                        <TableCell className="font-medium">
                          {s.user?.name ?? s.employeeId}
                        </TableCell>
                        <TableCell className="text-muted-foreground text-sm">
                          {s.department?.name ?? "—"}
                        </TableCell>
                        <TableCell>
                          {trainings.length === 0 ? (
                            <span className="text-muted-foreground text-xs italic">Not planned</span>
                          ) : (
                            <div className="flex flex-wrap gap-1">
                              {trainings.map((t, i) => (
                                <span
                                  key={i}
                                  className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[t.status] ?? ""}`}
                                >
                                  {t.trainingArea}
                                  {t.targetQuarter && ` (${t.targetQuarter})`}
                                </span>
                              ))}
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => openEdit(s.id)}
                          >
                            Edit
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </Main>

      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              Edit Training Plan — {editingStaff?.user?.name ?? editingStaffId} ({year})
            </DialogTitle>
            <DialogDescription>
              Set planned training areas, target quarter, and current status for this staff member.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            {draftTrainings.map((t, i) => (
              <div key={i} className="grid grid-cols-[1fr_100px_130px_40px] items-center gap-2">
                <Select
                  value={t.trainingArea}
                  onValueChange={(v) => v != null && updateDraft(i, "trainingArea", v)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TRAINING_AREAS.map((area) => (
                      <SelectItem key={area} value={area}>
                        {area}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select
                  value={t.targetQuarter ?? ""}
                  onValueChange={(v) => v != null && updateDraft(i, "targetQuarter", v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Quarter" />
                  </SelectTrigger>
                  <SelectContent>
                    {["Q1", "Q2", "Q3", "Q4"].map((q) => (
                      <SelectItem key={q} value={q}>
                        {q}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select
                  value={t.status}
                  onValueChange={(v) => v != null && updateDraft(i, "status", v)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {["planned", "in_progress", "completed", "cancelled"].map((s) => (
                      <SelectItem key={s} value={s}>
                        {s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-destructive h-8 w-8 p-0"
                  onClick={() => removeDraft(i)}
                >
                  ×
                </Button>
              </div>
            ))}
            <Button variant="outline" size="sm" onClick={addTrainingArea}>
              <Plus className="mr-1 h-3 w-3" />
              Add area
            </Button>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setEditDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={saveEdit} disabled={upsertMutation.isPending}>
              <Save className="mr-2 h-4 w-4" />
              Save Plan
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
