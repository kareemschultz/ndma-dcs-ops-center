import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { format, parseISO, startOfISOWeek } from "date-fns";
import {
  ArrowLeft,
  Calendar,
  ClipboardCheck,
  MessageSquare,
  User,
  Users,
  Building2,
  Clock,
  Plus,
  X,
  LayoutGrid,
  Pencil,
} from "lucide-react";
import { Button } from "@ndma-dcs-staff-portal/ui/components/button";
import { Textarea } from "@ndma-dcs-staff-portal/ui/components/textarea";
import { Input } from "@ndma-dcs-staff-portal/ui/components/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@ndma-dcs-staff-portal/ui/components/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@ndma-dcs-staff-portal/ui/components/select";
import { Label } from "@ndma-dcs-staff-portal/ui/components/label";
import { Skeleton } from "@ndma-dcs-staff-portal/ui/components/skeleton";
import { Separator } from "@ndma-dcs-staff-portal/ui/components/separator";
import { Badge } from "@ndma-dcs-staff-portal/ui/components/badge";
import { Header } from "@/components/layout/header";
import { Main } from "@/components/layout/main";
import { orpc, queryClient } from "@/utils/orpc";
import { departmentOptionLabel } from "@/lib/departments";
import {
  StatusBadge,
  PriorityBadge,
  TypeBadge,
} from "@/features/work/components/badges";
import type { WorkStatus, WorkPriority, WorkType } from "@/features/work/components/badges";

export const Route = createFileRoute("/_authenticated/work/$workItemId")({
  component: WorkItemDetailPage,
});

function TeamAllocationBadges({ allocations }: {
  allocations: Array<{ department: { name: string; code: string } | null; requiredCount: number }>;
}) {
  if (!allocations || allocations.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {allocations.map((a, i) => (
        <Badge key={i} variant="secondary" className="text-xs gap-1">
          <Building2 className="size-3" />
          {a.department?.code ?? "?"} ×{a.requiredCount}
        </Badge>
      ))}
    </div>
  );
}

function AssignmentPanel({ workItemId }: { workItemId: string }) {
  const [showAddContributor, setShowAddContributor] = useState(false);
  const [selectedContributor, setSelectedContributor] = useState("");
  const [showSetOwner, setShowSetOwner] = useState(false);
  const [selectedOwner, setSelectedOwner] = useState("");

  const { data: staffList } = useQuery(
    orpc.staff.list.queryOptions({ input: { limit: 200, offset: 0 } })
  );
  const { data: departments } = useQuery(orpc.staff.getDepartments.queryOptions());
  const { data: item } = useQuery(
    orpc.work.get.queryOptions({ input: { id: workItemId } })
  );

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: orpc.work.get.key({ input: { id: workItemId } }) });
    queryClient.invalidateQueries({ queryKey: orpc.work.list.key() });
  };

  const assignOwnerMutation = useMutation(
    orpc.work.assign.mutationOptions({
      onSuccess: () => { invalidate(); setShowSetOwner(false); toast.success("Primary owner updated"); },
      onError: (err) => toast.error(err.message),
    })
  );

  const addContributorMutation = useMutation(
    orpc.work.assignees.add.mutationOptions({
      onSuccess: () => { invalidate(); setShowAddContributor(false); setSelectedContributor(""); toast.success("Contributor added"); },
      onError: (err) => toast.error(err.message),
    })
  );

  const removeContributorMutation = useMutation(
    orpc.work.assignees.remove.mutationOptions({
      onSuccess: () => { invalidate(); toast.success("Contributor removed"); },
      onError: (err) => toast.error(err.message),
    })
  );

  const [allocEditing, setAllocEditing] = useState(false);
  const [allocRows, setAllocRows] = useState<Array<{ departmentId: string; requiredCount: number }>>([]);

  const setAllocMutation = useMutation(
    orpc.work.teamAllocations.set.mutationOptions({
      onSuccess: () => { invalidate(); setAllocEditing(false); toast.success("Team allocations updated"); },
      onError: (err) => toast.error(err.message),
    })
  );

  const currentAssignees = item?.assignees ?? [];
  const currentAllocations = item?.teamAllocations ?? [];

  const availableContributors = staffList?.filter(
    (s) =>
      s.id !== item?.assignedToId &&
      !currentAssignees.some((a) => a.staffProfileId === s.id)
  ) ?? [];

  return (
    <div className="rounded-xl border p-4 space-y-4 text-sm">
      <h3 className="font-semibold flex items-center gap-2">
        <Users className="size-4" />
        Assignment
      </h3>

      {/* Primary owner */}
      <div className="space-y-1.5">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Primary Owner</p>
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className="size-7 rounded-full bg-primary/10 flex items-center justify-center text-xs font-semibold text-primary">
              {item?.assignedTo?.user?.name?.[0] ?? "?"}
            </div>
            <span className="font-medium">{item?.assignedTo?.user?.name ?? "Unassigned"}</span>
          </div>
          <button
            onClick={() => setShowSetOwner((v) => !v)}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            Change
          </button>
        </div>
        {showSetOwner && (
          <div className="flex gap-2 mt-1">
            <select
              value={selectedOwner}
              onChange={(e) => setSelectedOwner(e.target.value)}
              className="flex-1 rounded-lg border bg-background px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="">Select staff...</option>
              {staffList?.map((s) => (
                <option key={s.id} value={s.id}>{s.user?.name} — {s.jobTitle}</option>
              ))}
            </select>
            <Button
              size="sm"
              disabled={!selectedOwner || assignOwnerMutation.isPending}
              onClick={() => assignOwnerMutation.mutate({ id: workItemId, staffProfileId: selectedOwner })}
            >
              Set
            </Button>
          </div>
        )}
      </div>

      <Separator />

      {/* Contributors */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Contributors</p>
          <button
            onClick={() => setShowAddContributor((v) => !v)}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-0.5"
          >
            <Plus className="size-3" /> Add
          </button>
        </div>

        {currentAssignees.length === 0 && !showAddContributor && (
          <p className="text-xs text-muted-foreground italic">No contributors yet</p>
        )}

        <div className="space-y-1.5">
          {currentAssignees.map((a) => (
            <div key={a.id} className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <div className="size-6 rounded-full bg-muted flex items-center justify-center text-xs font-semibold">
                  {a.staffProfile?.user?.name?.[0] ?? "?"}
                </div>
                <span>{a.staffProfile?.user?.name}</span>
                {a.staffProfile?.department && (
                  <Badge variant="outline" className="text-xs px-1.5 py-0">
                    {a.staffProfile.department.code}
                  </Badge>
                )}
              </div>
              <button
                onClick={() => removeContributorMutation.mutate({ workItemId, staffProfileId: a.staffProfileId })}
                disabled={removeContributorMutation.isPending}
                className="text-muted-foreground hover:text-destructive transition-colors"
              >
                <X className="size-3.5" />
              </button>
            </div>
          ))}
        </div>

        {showAddContributor && (
          <div className="flex gap-2 mt-1">
            <select
              value={selectedContributor}
              onChange={(e) => setSelectedContributor(e.target.value)}
              className="flex-1 rounded-lg border bg-background px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="">Select contributor...</option>
              {availableContributors.map((s) => (
                <option key={s.id} value={s.id}>{s.user?.name} — {s.department?.code ?? s.jobTitle}</option>
              ))}
            </select>
            <Button
              size="sm"
              disabled={!selectedContributor || addContributorMutation.isPending}
              onClick={() => addContributorMutation.mutate({ workItemId, staffProfileId: selectedContributor })}
            >
              Add
            </Button>
          </div>
        )}
      </div>

      <Separator />

      {/* Team allocations */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Team Allocation</p>
          <button
            onClick={() => {
              setAllocRows(currentAllocations.map((a) => ({ departmentId: a.departmentId, requiredCount: a.requiredCount })));
              setAllocEditing((v) => !v);
            }}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            {allocEditing ? "Cancel" : "Edit"}
          </button>
        </div>

        {!allocEditing && (
          currentAllocations.length > 0
            ? <TeamAllocationBadges allocations={currentAllocations} />
            : <p className="text-xs text-muted-foreground italic">No team allocations set</p>
        )}

        {allocEditing && (
          <div className="space-y-2">
            {allocRows.map((row, i) => (
              <div key={i} className="flex gap-2 items-center">
                <select
                  value={row.departmentId}
                  onChange={(e) => {
                    const next = [...allocRows];
                    next[i] = { ...next[i]!, departmentId: e.target.value };
                    setAllocRows(next);
                  }}
                  className="flex-1 rounded-lg border bg-background px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  <option value="">Department...</option>
                  {departments?.map((d) => (
                    <option key={d.id} value={d.id}>{departmentOptionLabel(d, { withCode: true })}</option>
                  ))}
                </select>
                <input
                  type="number"
                  min={1}
                  max={20}
                  value={row.requiredCount}
                  onChange={(e) => {
                    const next = [...allocRows];
                    next[i] = { ...next[i]!, requiredCount: Number(e.target.value) };
                    setAllocRows(next);
                  }}
                  className="w-14 rounded-lg border bg-background px-2 py-1 text-xs text-center focus:outline-none focus:ring-2 focus:ring-ring"
                />
                <button
                  onClick={() => setAllocRows(allocRows.filter((_, j) => j !== i))}
                  className="text-muted-foreground hover:text-destructive"
                >
                  <X className="size-3.5" />
                </button>
              </div>
            ))}
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setAllocRows([...allocRows, { departmentId: "", requiredCount: 1 }])}
              >
                <Plus className="size-3.5 mr-1" /> Add team
              </Button>
              <Button
                size="sm"
                disabled={setAllocMutation.isPending || allocRows.some((r) => !r.departmentId)}
                onClick={() => setAllocMutation.mutate({ workItemId, allocations: allocRows })}
              >
                Save
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function EditWorkItemDialog({
  item,
  onClose,
}: {
  item: { id: string; title: string; description?: string | null; type: string; priority: string; dueDate?: string | null };
  onClose: () => void;
}) {
  const [form, setForm] = useState({
    title: item.title,
    description: item.description ?? "",
    type: item.type,
    priority: item.priority,
    dueDate: item.dueDate ?? "",
  });

  const mutation = useMutation(
    orpc.work.update.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: orpc.work.get.key({ input: { id: item.id } }) });
        queryClient.invalidateQueries({ queryKey: orpc.work.list.key() });
        toast.success("Work item updated");
        onClose();
      },
      onError: (err) => toast.error(err.message),
    })
  );

  return (
    <DialogContent className="sm:max-w-lg">
      <DialogHeader>
        <DialogTitle>Edit Work Item</DialogTitle>
      </DialogHeader>
      <div className="space-y-4 py-2">
        <div className="space-y-1.5">
          <Label htmlFor="wi-title">Title</Label>
          <Input
            id="wi-title"
            value={form.title}
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Type</Label>
            <Select
              value={form.type}
              onValueChange={(v) => setForm((f) => ({ ...f, type: v ?? f.type }))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="routine">Routine</SelectItem>
                <SelectItem value="project">Project</SelectItem>
                <SelectItem value="external_request">External Request</SelectItem>
                <SelectItem value="ad_hoc">Ad Hoc</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Priority</Label>
            <Select
              value={form.priority}
              onValueChange={(v) => setForm((f) => ({ ...f, priority: v ?? f.priority }))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="low">Low</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="high">High</SelectItem>
                <SelectItem value="critical">Critical</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="wi-due">Due Date</Label>
          <Input
            id="wi-due"
            type="date"
            value={form.dueDate}
            onChange={(e) => setForm((f) => ({ ...f, dueDate: e.target.value }))}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="wi-desc">Description</Label>
          <Textarea
            id="wi-desc"
            rows={4}
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
          />
        </div>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button
          disabled={mutation.isPending || !form.title.trim()}
          onClick={() =>
            mutation.mutate({
              id: item.id,
              title: form.title,
              description: form.description || undefined,
              type: form.type as WorkType,
              priority: form.priority as WorkPriority,
              dueDate: form.dueDate || undefined,
            })
          }
        >
          {mutation.isPending ? "Saving…" : "Save Changes"}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

function WorkItemDetailPage() {
  const { workItemId } = Route.useParams();
  const navigate = useNavigate();

  const [showEdit, setShowEdit] = useState(false);
  const [commentBody, setCommentBody] = useState("");
  const [updateSummary, setUpdateSummary] = useState("");
  const [updateBlockers, setUpdateBlockers] = useState("");
  const [updateNextSteps, setUpdateNextSteps] = useState("");

  const { data: item, isLoading, error } = useQuery(
    orpc.work.get.queryOptions({ input: { id: workItemId } })
  );

  const commentMutation = useMutation(
    orpc.work.addComment.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: orpc.work.get.key({ input: { id: workItemId } }) });
        setCommentBody("");
        toast.success("Comment added");
      },
      onError: (err) => toast.error(err.message),
    })
  );

  const updateMutation = useMutation(
    orpc.work.addWeeklyUpdate.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: orpc.work.get.key({ input: { id: workItemId } }) });
        setUpdateSummary("");
        setUpdateBlockers("");
        setUpdateNextSteps("");
        toast.success("Weekly update saved");
      },
      onError: (err) => toast.error(err.message),
    })
  );

  const statusMutation = useMutation(
    orpc.work.update.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: orpc.work.get.key({ input: { id: workItemId } }) });
        queryClient.invalidateQueries({ queryKey: orpc.work.list.key() });
        queryClient.invalidateQueries({ queryKey: orpc.work.stats.key() });
        toast.success("Status updated");
      },
      onError: (err) => toast.error(err.message),
    })
  );

  const thisWeekStart = format(startOfISOWeek(new Date()), "yyyy-MM-dd");

  if (isLoading) {
    return (
      <>
        <Header fixed>
          <div className="flex items-center gap-2">
            <ClipboardCheck className="size-4 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">Work Register</span>
          </div>
        </Header>
        <Main>
          <Skeleton className="h-8 w-64 mb-4" />
          <Skeleton className="h-4 w-full mb-2" />
          <Skeleton className="h-4 w-3/4" />
        </Main>
      </>
    );
  }

  if (error || !item) {
    return (
      <Main>
        <p className="text-muted-foreground">Work item not found.</p>
        <Link to="/work"><Button variant="outline" className="mt-4">Back to Work Register</Button></Link>
      </Main>
    );
  }

  const STATUS_TRANSITIONS: WorkStatus[] = [
    "backlog", "todo", "in_progress", "blocked", "review", "done", "cancelled",
  ];

  const teamAllocations = item.teamAllocations ?? [];
  const contributors = item.assignees ?? [];

  return (
    <>
      <Header fixed>
        <div className="flex items-center gap-2 min-w-0">
          <ClipboardCheck className="size-4 shrink-0 text-muted-foreground" />
          <Link to="/work" className="text-sm text-muted-foreground hover:text-foreground shrink-0">
            Work Register
          </Link>
          <span className="text-muted-foreground shrink-0">/</span>
          <span className="text-sm font-medium truncate">{item.title}</span>
        </div>
      </Header>

      <Main>
        <div className="mb-6 flex items-start gap-3">
          <Link to="/work">
            <Button variant="ghost" size="icon" className="mt-1">
              <ArrowLeft className="size-4" />
            </Button>
          </Link>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2 mb-1">
              <TypeBadge type={item.type as WorkType} />
              <StatusBadge status={item.status as WorkStatus} />
              <PriorityBadge priority={item.priority as WorkPriority} />
              <Button
                variant="ghost"
                size="sm"
                className="ml-auto h-7 gap-1.5 text-muted-foreground"
                onClick={() => setShowEdit(true)}
              >
                <Pencil className="size-3.5" /> Edit
              </Button>
              {/* Team allocation summary badges */}
              {teamAllocations.map((a) => (
                <Badge key={a.id} variant="secondary" className="text-xs gap-1">
                  <Building2 className="size-3" />
                  {a.department?.code ?? "?"} ×{a.requiredCount}
                </Badge>
              ))}
            </div>
            <h1 className="text-2xl font-bold tracking-tight">{item.title}</h1>
            {/* Contributor pill row */}
            {contributors.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {contributors.map((a) => (
                  <div key={a.id} className="flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-0.5 text-xs">
                    <div className="size-4 rounded-full bg-primary/20 flex items-center justify-center text-[10px] font-semibold text-primary">
                      {a.staffProfile?.user?.name?.[0] ?? "?"}
                    </div>
                    {a.staffProfile?.user?.name}
                    {a.staffProfile?.department && (
                      <span className="text-muted-foreground">({a.staffProfile.department.code})</span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          {/* Main content */}
          <div className="lg:col-span-2 space-y-6">
            {/* Description */}
            {item.description && (
              <div>
                <h2 className="font-semibold mb-2">Description</h2>
                <p className="text-sm text-muted-foreground whitespace-pre-wrap">{item.description}</p>
              </div>
            )}

            {/* Weekly updates */}
            <div>
              <h2 className="font-semibold mb-3 flex items-center gap-2">
                <Clock className="size-4" />
                Weekly Updates
              </h2>

              {/* Add update form */}
              <div className="rounded-xl border p-4 mb-4 space-y-3">
                <p className="text-xs text-muted-foreground">Week of {thisWeekStart}</p>
                <div className="space-y-1.5">
                  <Label>Status Summary *</Label>
                  <Textarea
                    value={updateSummary}
                    onChange={(e) => setUpdateSummary(e.target.value)}
                    placeholder="What was done this week..."
                    rows={2}
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>Blockers</Label>
                    <Textarea
                      value={updateBlockers}
                      onChange={(e) => setUpdateBlockers(e.target.value)}
                      placeholder="Any blockers?"
                      rows={2}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Next Steps</Label>
                    <Textarea
                      value={updateNextSteps}
                      onChange={(e) => setUpdateNextSteps(e.target.value)}
                      placeholder="Planned for next week..."
                      rows={2}
                    />
                  </div>
                </div>
                <Button
                  size="sm"
                  disabled={!updateSummary.trim() || updateMutation.isPending}
                  onClick={() =>
                    updateMutation.mutate({
                      workItemId,
                      weekStart: thisWeekStart,
                      statusSummary: updateSummary,
                      blockers: updateBlockers || undefined,
                      nextSteps: updateNextSteps || undefined,
                    })
                  }
                >
                  {updateMutation.isPending ? "Saving..." : "Save Weekly Update"}
                </Button>
              </div>

              {/* Past updates */}
              {item.weeklyUpdates?.length ? (
                <div className="space-y-3">
                  {item.weeklyUpdates.map((u) => (
                    <div key={u.id} className="rounded-xl border p-3 text-sm">
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-medium">Week of {u.weekStart}</span>
                        <span className="text-xs text-muted-foreground">{u.author?.name}</span>
                      </div>
                      <p className="text-muted-foreground">{u.statusSummary}</p>
                      {u.blockers && (
                        <p className="text-red-600 dark:text-red-400 mt-1">
                          <strong>Blockers:</strong> {u.blockers}
                        </p>
                      )}
                      {u.nextSteps && (
                        <p className="text-muted-foreground mt-1">
                          <strong>Next:</strong> {u.nextSteps}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No weekly updates yet.</p>
              )}
            </div>

            <Separator />

            {/* Comments */}
            <div>
              <h2 className="font-semibold mb-3 flex items-center gap-2">
                <MessageSquare className="size-4" />
                Comments
              </h2>

              <div className="space-y-1.5 mb-4">
                <Textarea
                  value={commentBody}
                  onChange={(e) => setCommentBody(e.target.value)}
                  placeholder="Add a comment..."
                  rows={3}
                />
                <Button
                  size="sm"
                  disabled={!commentBody.trim() || commentMutation.isPending}
                  onClick={() =>
                    commentMutation.mutate({ workItemId, body: commentBody })
                  }
                >
                  {commentMutation.isPending ? "Posting..." : "Post Comment"}
                </Button>
              </div>

              {item.comments?.length ? (
                <div className="space-y-3">
                  {item.comments.map((c) => (
                    <div key={c.id} className="flex gap-3">
                      <div className="size-7 shrink-0 rounded-full bg-muted flex items-center justify-center text-xs font-semibold">
                        {c.author?.name?.[0] ?? "?"}
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                          <span className="font-medium text-foreground">{c.author?.name}</span>
                          <span>{format(new Date(c.createdAt), "dd MMM yyyy, HH:mm")}</span>
                        </div>
                        <p className="text-sm whitespace-pre-wrap">{c.body}</p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No comments yet.</p>
              )}
            </div>
          </div>

          {/* Sidebar */}
          <div className="space-y-4">
            {/* Status changer */}
            <div className="rounded-xl border p-4 space-y-3">
              <h3 className="font-semibold text-sm">Status</h3>
              <div className="flex flex-wrap gap-1.5">
                {STATUS_TRANSITIONS.map((s) => (
                  <button
                    key={s}
                    onClick={() =>
                      statusMutation.mutate({ id: workItemId, status: s })
                    }
                    disabled={item.status === s || statusMutation.isPending}
                    className={`rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
                      item.status === s
                        ? "bg-primary text-primary-foreground"
                        : "border hover:bg-muted"
                    }`}
                  >
                    {s.replace(/_/g, " ")}
                  </button>
                ))}
              </div>
            </div>

            {/* Multi-assignee panel */}
            <AssignmentPanel workItemId={workItemId} />

            {/* Details */}
            <div className="rounded-xl border p-4 space-y-3 text-sm">
              <h3 className="font-semibold">Details</h3>

              {item.department && (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Building2 className="size-3.5 shrink-0" />
                  <span>{item.department.name}</span>
                </div>
              )}

              {item.dueDate && (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Calendar className="size-3.5 shrink-0" />
                  <span>{format(parseISO(item.dueDate), "dd MMM yyyy")}</span>
                </div>
              )}

              <Separator />

              <div className="text-xs text-muted-foreground space-y-1">
                <p>Created by {item.createdBy?.name}</p>
                <p>{format(new Date(item.createdAt), "dd MMM yyyy, HH:mm")}</p>
              </div>

              {item.requesterName && (
                <>
                  <Separator />
                  <div className="text-xs space-y-1">
                    <p className="font-medium">External Request</p>
                    <p className="text-muted-foreground">{item.requesterName}</p>
                    {item.requesterEmail && (
                      <p className="text-muted-foreground">{item.requesterEmail}</p>
                    )}
                    {item.sourceSystem && (
                      <p className="text-muted-foreground">
                        {item.sourceSystem}
                        {item.sourceReference ? ` #${item.sourceReference}` : ""}
                      </p>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </Main>

      <Dialog open={showEdit} onOpenChange={(o) => !o && setShowEdit(false)}>
        <EditWorkItemDialog item={item as any} onClose={() => setShowEdit(false)} />
      </Dialog>
    </>
  );
}
