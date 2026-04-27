import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Plus, Users } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@ndma-dcs-staff-portal/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@ndma-dcs-staff-portal/ui/components/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@ndma-dcs-staff-portal/ui/components/dialog";
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
import { Textarea } from "@ndma-dcs-staff-portal/ui/components/textarea";

import { Header } from "@/components/layout/header";
import { Main } from "@/components/layout/main";
import { ThemeSwitch } from "@/components/theme-switch";
import { orpc } from "@/utils/orpc";

export const Route = createFileRoute("/_authenticated/training/events")({
  component: TrainingEventsPage,
});

type EventForm = {
  institution: string;
  description: string;
  startDate: string;
  endDate: string;
  duration: string;
  location: string;
  travellingCost: string;
  courseCost: string;
  mealsCost: string;
  accommodationCost: string;
  justification: string;
};

const EMPTY_FORM: EventForm = {
  institution: "",
  description: "",
  startDate: "",
  endDate: "",
  duration: "",
  location: "",
  travellingCost: "0",
  courseCost: "0",
  mealsCost: "0",
  accommodationCost: "0",
  justification: "",
};

export default function TrainingEventsPage() {
  const queryClient = useQueryClient();
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [form, setForm] = useState<EventForm>(EMPTY_FORM);

  // Auto-sum total cost
  const computedTotal = (
    parseFloat(form.travellingCost || "0") +
    parseFloat(form.courseCost || "0") +
    parseFloat(form.mealsCost || "0") +
    parseFloat(form.accommodationCost || "0")
  ).toFixed(2);

  const { data: events, isLoading } = useQuery(
    orpc.trainingEvents.list.queryOptions({ input: { limit: 50 } }),
  );

  const createMutation = useMutation(
    orpc.trainingEvents.create.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: orpc.trainingEvents.list.key() });
        setAddDialogOpen(false);
        setForm(EMPTY_FORM);
        toast.success("Training event created");
      },
      onError: () => toast.error("Failed to create event"),
    }),
  );

  function handleCreate() {
    if (!form.institution || !form.description || !form.startDate || !form.endDate) {
      toast.error("Institution, description and dates are required");
      return;
    }
    createMutation.mutate({ ...form, totalCost: computedTotal });
  }

  function setField(field: keyof EventForm, value: string) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  return (
    <>
      <Header>
        <div className="flex items-center gap-2">
          <Users className="h-5 w-5" />
          <h1 className="text-xl font-semibold">Training Events</h1>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Button size="sm" onClick={() => setAddDialogOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            New Event
          </Button>
          <ThemeSwitch />
        </div>
      </Header>

      <Main>
        <Card>
          <CardHeader>
            <CardTitle>All Training Events</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="space-y-2 p-4">
                {[...Array(5)].map((_, i) => (
                  <Skeleton key={i} className="h-10 w-full" />
                ))}
              </div>
            ) : !events?.length ? (
              <p className="text-muted-foreground py-8 text-center text-sm">No events recorded</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Institution</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Dates</TableHead>
                    <TableHead>Location</TableHead>
                    <TableHead className="text-right">Participants</TableHead>
                    <TableHead className="text-right">Total Cost</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {events.map((e) => (
                    <TableRow key={e.id}>
                      <TableCell className="font-medium">{e.institution}</TableCell>
                      <TableCell className="max-w-xs truncate text-sm">{e.description}</TableCell>
                      <TableCell className="text-sm">
                        {e.startDate} → {e.endDate}
                      </TableCell>
                      <TableCell className="text-sm">{e.location ?? "—"}</TableCell>
                      <TableCell className="text-right">{e.participants?.length ?? 0}</TableCell>
                      <TableCell className="text-right font-mono text-sm">
                        ${Number(e.totalCost ?? 0).toLocaleString()}
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
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>New Training Event</DialogTitle>
            <DialogDescription>
              Record an external training event with cost breakdown. Total cost is auto-calculated.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Institution *</Label>
                <Input
                  placeholder="e.g. Cisco Learning Network"
                  value={form.institution}
                  onChange={(e) => setField("institution", e.target.value)}
                />
              </div>
              <div className="grid gap-2">
                <Label>Location</Label>
                <Input
                  placeholder="e.g. Georgetown, GY"
                  value={form.location}
                  onChange={(e) => setField("location", e.target.value)}
                />
              </div>
            </div>

            <div className="grid gap-2">
              <Label>Description *</Label>
              <Input
                placeholder="Course / training title"
                value={form.description}
                onChange={(e) => setField("description", e.target.value)}
              />
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="grid gap-2">
                <Label>Start Date *</Label>
                <Input
                  type="date"
                  value={form.startDate}
                  onChange={(e) => setField("startDate", e.target.value)}
                />
              </div>
              <div className="grid gap-2">
                <Label>End Date *</Label>
                <Input
                  type="date"
                  value={form.endDate}
                  onChange={(e) => setField("endDate", e.target.value)}
                />
              </div>
              <div className="grid gap-2">
                <Label>Duration</Label>
                <Input
                  placeholder="e.g. 5 days"
                  value={form.duration}
                  onChange={(e) => setField("duration", e.target.value)}
                />
              </div>
            </div>

            {/* Cost Breakdown */}
            <div className="rounded-lg border p-4">
              <p className="mb-3 text-sm font-medium">Cost Breakdown (GYD)</p>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { field: "travellingCost" as const, label: "Travelling" },
                  { field: "courseCost" as const, label: "Course Fee" },
                  { field: "mealsCost" as const, label: "Meals" },
                  { field: "accommodationCost" as const, label: "Accommodation" },
                ].map(({ field, label }) => (
                  <div key={field} className="grid gap-1">
                    <Label className="text-xs">{label}</Label>
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      value={form[field]}
                      onChange={(e) => setField(field, e.target.value)}
                    />
                  </div>
                ))}
              </div>
              <div className="mt-3 flex items-center justify-between rounded bg-muted px-3 py-2">
                <span className="text-sm font-medium">Total Cost</span>
                <span className="font-mono font-bold">${Number(computedTotal).toLocaleString()}</span>
              </div>
            </div>

            <div className="grid gap-2">
              <Label>Justification</Label>
              <Textarea
                placeholder="Business justification for this training…"
                value={form.justification}
                onChange={(e) => setField("justification", e.target.value)}
                rows={2}
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setAddDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreate} disabled={createMutation.isPending}>
              Create Event
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
