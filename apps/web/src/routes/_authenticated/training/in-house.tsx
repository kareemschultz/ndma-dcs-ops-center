import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { BookOpen, CheckCircle2, Circle, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@ndma-dcs-staff-portal/ui/components/badge";
import { Button } from "@ndma-dcs-staff-portal/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@ndma-dcs-staff-portal/ui/components/card";
import { Checkbox } from "@ndma-dcs-staff-portal/ui/components/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import { TrainingSubNav } from "@/components/layout/training-sub-nav";
import { ThemeSwitch } from "@/components/theme-switch";
import { orpc } from "@/utils/orpc";

export const Route = createFileRoute("/_authenticated/training/in-house")({
  component: InHouseTrainingLogPage,
});

const CURRENT_YEAR = new Date().getFullYear();

type LogForm = {
  staffId: string;
  trainingName: string;
  date: string;
  assessmentCompleted: boolean;
  notes: string;
};

const EMPTY_FORM: LogForm = {
  staffId: "",
  trainingName: "",
  date: "",
  assessmentCompleted: false,
  notes: "",
};

export default function InHouseTrainingLogPage() {
  const queryClient = useQueryClient();
  const [year, setYear] = useState(CURRENT_YEAR);
  const [staffFilter, setStaffFilter] = useState<string>("all");
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [form, setForm] = useState<LogForm>(EMPTY_FORM);

  const { data: staff } = useQuery(orpc.staff.list.queryOptions({ input: { limit: 200 } }));
  const { data: logs, isLoading } = useQuery(
    orpc.inHouseLog.list.queryOptions({
      input: {
        year,
        staffId: staffFilter !== "all" ? staffFilter : undefined,
        limit: 200,
      },
    }),
  );

  const createMutation = useMutation(
    orpc.inHouseLog.create.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: orpc.inHouseLog.list.key() });
        setAddDialogOpen(false);
        setForm(EMPTY_FORM);
        toast.success("Session recorded");
      },
      onError: () => toast.error("Failed to record session"),
    }),
  );

  const deleteMutation = useMutation(
    orpc.inHouseLog.delete.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: orpc.inHouseLog.list.key() });
        toast.success("Record deleted");
      },
      onError: () => toast.error("Failed to delete record"),
    }),
  );

  const updateMutation = useMutation(
    orpc.inHouseLog.update.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: orpc.inHouseLog.list.key() });
        toast.success("Updated");
      },
      onError: () => toast.error("Failed to update"),
    }),
  );

  function handleCreate() {
    if (!form.staffId || !form.trainingName || !form.date) {
      toast.error("Staff, training name and date are required");
      return;
    }
    createMutation.mutate(form);
  }

  return (
    <>
      <Header>
        <div className="flex items-center gap-2">
          <BookOpen className="h-5 w-5" />
          <h1 className="text-xl font-semibold">In-House Training Log</h1>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Button size="sm" onClick={() => setAddDialogOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Record Session
          </Button>
          <ThemeSwitch />
        </div>
      </Header>

      <TrainingSubNav active="/training/in-house" />
      <Main>
        <div className="mb-5 flex gap-3 rounded-lg border bg-muted/40 p-4">
          <BookOpen className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          <div className="text-sm text-muted-foreground">
            <p className="font-medium text-foreground">
              Record training delivered internally by DCS.
            </p>
            <p className="mt-0.5">
              Use this for knowledge-sharing, on-the-job coaching, and NOC walkthroughs done
              in-house — anything that isn't an external course. For paid external courses, use{" "}
              <span className="font-medium">Training Events</span> instead.
            </p>
          </div>
        </div>

        <div className="mb-4 flex flex-wrap items-center gap-3">
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

          <Select value={staffFilter} onValueChange={(v) => v != null && setStaffFilter(v)}>
            <SelectTrigger className="w-48">
              <SelectValue>
                {staffFilter && staffFilter !== "all"
                  ? (staff?.find(s => s.id === staffFilter)?.user?.name ?? staff?.find(s => s.id === staffFilter)?.employeeId ?? staffFilter)
                  : "All staff"}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Staff</SelectItem>
              {staff?.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.user?.name ?? s.employeeId}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Badge variant="outline" className="ml-auto">
            {logs?.length ?? 0} sessions
          </Badge>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Training Sessions</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="space-y-2 p-4">
                {[...Array(5)].map((_, i) => (
                  <Skeleton key={i} className="h-10 w-full" />
                ))}
              </div>
            ) : !logs?.length ? (
              <p className="text-muted-foreground py-8 text-center text-sm">
                No in-house training sessions recorded
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Staff</TableHead>
                    <TableHead>Training</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead className="text-center">Assessment</TableHead>
                    <TableHead>Notes</TableHead>
                    <TableHead className="w-16" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {logs.map((l) => (
                    <TableRow key={l.id}>
                      <TableCell className="font-medium">
                        {l.staffProfile?.user?.name ?? l.staffId}
                      </TableCell>
                      <TableCell>{l.trainingName}</TableCell>
                      <TableCell className="text-sm">{l.date}</TableCell>
                      <TableCell className="text-center">
                        <button
                          onClick={() =>
                            updateMutation.mutate({
                              id: l.id,
                              assessmentCompleted: !l.assessmentCompleted,
                            })
                          }
                          className="inline-flex items-center justify-center"
                          title={l.assessmentCompleted ? "Mark incomplete" : "Mark complete"}
                        >
                          {l.assessmentCompleted ? (
                            <CheckCircle2 className="h-5 w-5 text-blue-500" />
                          ) : (
                            <Circle className="text-muted-foreground h-5 w-5" />
                          )}
                        </button>
                      </TableCell>
                      <TableCell className="text-muted-foreground max-w-xs truncate text-sm">
                        {l.notes ?? "—"}
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-destructive h-7 w-7 p-0"
                          onClick={() => deleteMutation.mutate({ id: l.id })}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </Main>

      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Record In-House Session</DialogTitle>
            <DialogDescription>
              Log a training session delivered internally to one staff member. To record several
              attendees, add one entry per person.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="grid gap-2">
              <Label>Staff Member *</Label>
              <Select
                value={form.staffId}
                onValueChange={(v) => v != null && setForm((f) => ({ ...f, staffId: v }))}
              >
                <SelectTrigger>
                  <SelectValue>
                    {form.staffId
                      ? (staff?.find(s => s.id === form.staffId)?.user?.name ?? staff?.find(s => s.id === form.staffId)?.employeeId ?? form.staffId)
                      : "Select staff…"}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {staff?.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.user?.name ?? s.employeeId}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>Training Topic *</Label>
              <Input
                placeholder="e.g. NOC Alarm Interpretation"
                value={form.trainingName}
                onChange={(e) => setForm((f) => ({ ...f, trainingName: e.target.value }))}
              />
              <p className="text-xs text-muted-foreground">
                What the session covered.
              </p>
            </div>
            <div className="grid gap-2">
              <Label>Date Delivered *</Label>
              <Input
                type="date"
                value={form.date}
                onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
              />
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="assessment"
                checked={form.assessmentCompleted}
                onCheckedChange={(v) =>
                  setForm((f) => ({ ...f, assessmentCompleted: Boolean(v) }))
                }
              />
              <Label htmlFor="assessment">Assessment completed</Label>
            </div>
            <div className="grid gap-2">
              <Label>Notes</Label>
              <Textarea
                placeholder="Any observations or outcomes…"
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                rows={2}
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setAddDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreate} disabled={createMutation.isPending}>
              Record
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
