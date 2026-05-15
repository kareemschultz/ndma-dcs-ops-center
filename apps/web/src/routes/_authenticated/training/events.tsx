import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Pencil, Plus, Trash2, Users } from "lucide-react";
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

type ParticipantStatus = "attended" | "cancelled" | "missed" | "waitlisted";

const PARTICIPANT_STATUS_BADGE: Record<ParticipantStatus, "default" | "secondary" | "destructive" | "outline"> = {
  attended: "default",
  cancelled: "destructive",
  missed: "destructive",
  waitlisted: "secondary",
};

export default function TrainingEventsPage() {
  const queryClient = useQueryClient();

  // Create dialog
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [form, setForm] = useState<EventForm>(EMPTY_FORM);

  // Edit dialog
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingEventId, setEditingEventId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<EventForm>(EMPTY_FORM);

  // Participants dialog
  const [participantsDialogOpen, setParticipantsDialogOpen] = useState(false);
  const [participantsEventId, setParticipantsEventId] = useState<number | null>(null);
  const [addParticipantStaffId, setAddParticipantStaffId] = useState("");
  const [addParticipantStatus, setAddParticipantStatus] = useState<ParticipantStatus>("attended");

  // Auto-sum total cost for create form
  const computedTotal = (
    parseFloat(form.travellingCost || "0") +
    parseFloat(form.courseCost || "0") +
    parseFloat(form.mealsCost || "0") +
    parseFloat(form.accommodationCost || "0")
  ).toFixed(2);

  // Auto-sum total cost for edit form
  const editComputedTotal = (
    parseFloat(editForm.travellingCost || "0") +
    parseFloat(editForm.courseCost || "0") +
    parseFloat(editForm.mealsCost || "0") +
    parseFloat(editForm.accommodationCost || "0")
  ).toFixed(2);

  const { data: events, isLoading } = useQuery(
    orpc.trainingEvents.list.queryOptions({ input: { limit: 50 } }),
  );

  const { data: staff } = useQuery(orpc.staff.list.queryOptions({ input: { limit: 200 } }));

  // Fetch participants for the selected event
  const { data: participantsEvent } = useQuery({
    ...orpc.trainingEvents.get.queryOptions({
      input: { id: participantsEventId ?? 0 },
    }),
    enabled: participantsEventId != null && participantsDialogOpen,
  });

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

  const updateMutation = useMutation(
    orpc.trainingEvents.update.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: orpc.trainingEvents.list.key() });
        setEditDialogOpen(false);
        setEditingEventId(null);
        setEditForm(EMPTY_FORM);
        toast.success("Training event updated");
      },
      onError: () => toast.error("Failed to update event"),
    }),
  );

  const addParticipantMutation = useMutation(
    orpc.trainingEvents.addParticipant.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: orpc.trainingEvents.list.key() });
        // Also invalidate the get query so the participants panel refreshes
        if (participantsEventId != null) {
          queryClient.invalidateQueries({
            queryKey: orpc.trainingEvents.get.key(),
          });
        }
        setAddParticipantStaffId("");
        setAddParticipantStatus("attended");
        toast.success("Participant added");
      },
      onError: () => toast.error("Failed to add participant"),
    }),
  );

  const removeParticipantMutation = useMutation(
    orpc.trainingEvents.removeParticipant.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: orpc.trainingEvents.list.key() });
        if (participantsEventId != null) {
          queryClient.invalidateQueries({
            queryKey: orpc.trainingEvents.get.key(),
          });
        }
        toast.success("Participant removed");
      },
      onError: () => toast.error("Failed to remove participant"),
    }),
  );

  function handleCreate() {
    if (!form.institution || !form.description || !form.startDate || !form.endDate) {
      toast.error("Institution, description and dates are required");
      return;
    }
    createMutation.mutate({ ...form, totalCost: computedTotal });
  }

  function handleUpdate() {
    if (!editingEventId) return;
    if (!editForm.institution || !editForm.description || !editForm.startDate || !editForm.endDate) {
      toast.error("Institution, description and dates are required");
      return;
    }
    updateMutation.mutate({
      id: editingEventId,
      institution: editForm.institution,
      description: editForm.description,
      startDate: editForm.startDate,
      endDate: editForm.endDate,
      duration: editForm.duration || undefined,
      location: editForm.location || undefined,
      travellingCost: editForm.travellingCost || undefined,
      courseCost: editForm.courseCost || undefined,
      mealsCost: editForm.mealsCost || undefined,
      accommodationCost: editForm.accommodationCost || undefined,
      justification: editForm.justification || undefined,
      totalCost: editComputedTotal,
    });
  }

  function openEditDialog(event: NonNullable<typeof events>[number]) {
    setEditingEventId(event.id);
    setEditForm({
      institution: event.institution ?? "",
      description: event.description ?? "",
      startDate: event.startDate ?? "",
      endDate: event.endDate ?? "",
      duration: event.duration ?? "",
      location: event.location ?? "",
      travellingCost: String(event.travellingCost ?? "0"),
      courseCost: String(event.courseCost ?? "0"),
      mealsCost: String(event.mealsCost ?? "0"),
      accommodationCost: String(event.accommodationCost ?? "0"),
      justification: event.justification ?? "",
    });
    setEditDialogOpen(true);
  }

  function openParticipantsDialog(eventId: number) {
    setParticipantsEventId(eventId);
    setAddParticipantStaffId("");
    setAddParticipantStatus("attended");
    setParticipantsDialogOpen(true);
  }

  function handleAddParticipant() {
    if (!participantsEventId || !addParticipantStaffId) {
      toast.error("Please select a staff member");
      return;
    }
    addParticipantMutation.mutate({
      trainingEventId: participantsEventId,
      staffId: addParticipantStaffId,
      status: addParticipantStatus,
    });
  }

  function setField(field: keyof EventForm, value: string) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  function setEditField(field: keyof EventForm, value: string) {
    setEditForm((f) => ({ ...f, [field]: value }));
  }

  const costFields: { field: keyof EventForm; label: string }[] = [
    { field: "travellingCost", label: "Travelling" },
    { field: "courseCost", label: "Course Fee" },
    { field: "mealsCost", label: "Meals" },
    { field: "accommodationCost", label: "Accommodation" },
  ];

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

      <TrainingSubNav active="/training/events" />
      <Main>
        <div className="mb-5 flex gap-3 rounded-lg border bg-muted/40 p-4">
          <Users className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          <div className="text-sm text-muted-foreground">
            <p className="font-medium text-foreground">
              Training events are external courses, workshops, and conferences.
            </p>
            <p className="mt-0.5">
              Record the institution, dates, and full cost breakdown (travel, course fee, meals,
              accommodation), then use the people icon on each row to add the staff who attended.
            </p>
          </div>
        </div>

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
                    <TableHead>Course / Event</TableHead>
                    <TableHead>Dates</TableHead>
                    <TableHead>Location</TableHead>
                    <TableHead className="text-right">Participants</TableHead>
                    <TableHead className="text-right">Total Cost</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
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
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => openParticipantsDialog(e.id)}
                            title="Manage participants"
                          >
                            <Users className="h-4 w-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => openEditDialog(e)}
                            title="Edit event"
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </Main>

      {/* Create Event Dialog */}
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
              <Label>Course / Event Title *</Label>
              <Input
                placeholder="e.g. CCNA Bootcamp 2026"
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
                {costFields.map(({ field, label }) => (
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

      {/* Edit Event Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Training Event</DialogTitle>
            <DialogDescription>
              Update the details for this training event. Total cost is auto-calculated.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Institution *</Label>
                <Input
                  placeholder="e.g. Cisco Learning Network"
                  value={editForm.institution}
                  onChange={(e) => setEditField("institution", e.target.value)}
                />
              </div>
              <div className="grid gap-2">
                <Label>Location</Label>
                <Input
                  placeholder="e.g. Georgetown, GY"
                  value={editForm.location}
                  onChange={(e) => setEditField("location", e.target.value)}
                />
              </div>
            </div>

            <div className="grid gap-2">
              <Label>Course / Event Title *</Label>
              <Input
                placeholder="e.g. CCNA Bootcamp 2026"
                value={editForm.description}
                onChange={(e) => setEditField("description", e.target.value)}
              />
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="grid gap-2">
                <Label>Start Date *</Label>
                <Input
                  type="date"
                  value={editForm.startDate}
                  onChange={(e) => setEditField("startDate", e.target.value)}
                />
              </div>
              <div className="grid gap-2">
                <Label>End Date *</Label>
                <Input
                  type="date"
                  value={editForm.endDate}
                  onChange={(e) => setEditField("endDate", e.target.value)}
                />
              </div>
              <div className="grid gap-2">
                <Label>Duration</Label>
                <Input
                  placeholder="e.g. 5 days"
                  value={editForm.duration}
                  onChange={(e) => setEditField("duration", e.target.value)}
                />
              </div>
            </div>

            {/* Cost Breakdown */}
            <div className="rounded-lg border p-4">
              <p className="mb-3 text-sm font-medium">Cost Breakdown (GYD)</p>
              <div className="grid grid-cols-2 gap-3">
                {costFields.map(({ field, label }) => (
                  <div key={field} className="grid gap-1">
                    <Label className="text-xs">{label}</Label>
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      value={editForm[field]}
                      onChange={(e) => setEditField(field, e.target.value)}
                    />
                  </div>
                ))}
              </div>
              <div className="mt-3 flex items-center justify-between rounded bg-muted px-3 py-2">
                <span className="text-sm font-medium">Total Cost</span>
                <span className="font-mono font-bold">
                  ${Number(editComputedTotal).toLocaleString()}
                </span>
              </div>
            </div>

            <div className="grid gap-2">
              <Label>Justification</Label>
              <Textarea
                placeholder="Business justification for this training…"
                value={editForm.justification}
                onChange={(e) => setEditField("justification", e.target.value)}
                rows={2}
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button
              variant="outline"
              onClick={() => {
                setEditDialogOpen(false);
                setEditingEventId(null);
                setEditForm(EMPTY_FORM);
              }}
            >
              Cancel
            </Button>
            <Button onClick={handleUpdate} disabled={updateMutation.isPending}>
              Save Changes
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Participants Dialog */}
      <Dialog open={participantsDialogOpen} onOpenChange={setParticipantsDialogOpen}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Participants</DialogTitle>
            <DialogDescription>
              View and manage participants for this training event.
            </DialogDescription>
          </DialogHeader>

          {/* Existing participants */}
          <div className="rounded-lg border">
            {!participantsEvent ? (
              <div className="space-y-2 p-4">
                {[...Array(3)].map((_, i) => (
                  <Skeleton key={i} className="h-8 w-full" />
                ))}
              </div>
            ) : participantsEvent.participants == null || participantsEvent.participants.length === 0 ? (
              <p className="text-muted-foreground py-6 text-center text-sm">
                No participants added yet.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Remove</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {participantsEvent.participants.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell className="font-medium">
                        {p.staffProfile?.user?.name ?? p.staffProfile?.employeeId ?? "Unknown"}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            PARTICIPANT_STATUS_BADGE[p.status as ParticipantStatus] ?? "outline"
                          }
                        >
                          {p.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => removeParticipantMutation.mutate({ id: p.id })}
                          disabled={removeParticipantMutation.isPending}
                          title="Remove participant"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>

          {/* Add participant form */}
          <div className="grid gap-3 rounded-lg border p-4">
            <p className="text-sm font-medium">Add Participant</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-2">
                <Label>Staff Member</Label>
                <Select
                  value={addParticipantStaffId}
                  onValueChange={(v) => v != null && setAddParticipantStaffId(v)}
                >
                  <SelectTrigger>
                    <SelectValue>
                      {addParticipantStaffId
                        ? (staff?.find((s) => s.id === addParticipantStaffId)?.user?.name ??
                          staff?.find((s) => s.id === addParticipantStaffId)?.employeeId ??
                          addParticipantStaffId)
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
                <Label>Status</Label>
                <Select
                  value={addParticipantStatus}
                  onValueChange={(v) => v != null && setAddParticipantStatus(v as ParticipantStatus)}
                >
                  <SelectTrigger>
                    <SelectValue>
                      {addParticipantStatus ?? "Select status…"}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="attended">attended</SelectItem>
                    <SelectItem value="cancelled">cancelled</SelectItem>
                    <SelectItem value="missed">missed</SelectItem>
                    <SelectItem value="waitlisted">waitlisted</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex justify-end">
              <Button
                size="sm"
                onClick={handleAddParticipant}
                disabled={addParticipantMutation.isPending || !addParticipantStaffId}
              >
                <Plus className="mr-2 h-4 w-4" />
                Add
              </Button>
            </div>
          </div>

          <div className="flex justify-end pt-2">
            <Button
              variant="outline"
              onClick={() => {
                setParticipantsDialogOpen(false);
                setParticipantsEventId(null);
              }}
            >
              Close
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
