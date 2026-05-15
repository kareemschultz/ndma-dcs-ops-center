import { useState } from "react";
import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, ClipboardCheck, Plus, X, Building2 } from "lucide-react";
import { Button } from "@ndma-dcs-staff-portal/ui/components/button";
import { Input } from "@ndma-dcs-staff-portal/ui/components/input";
import { Textarea } from "@ndma-dcs-staff-portal/ui/components/textarea";
import { Label } from "@ndma-dcs-staff-portal/ui/components/label";
import { Badge } from "@ndma-dcs-staff-portal/ui/components/badge";
import { Header } from "@/components/layout/header";
import { Main } from "@/components/layout/main";
import { orpc, queryClient } from "@/utils/orpc";
import { departmentOptionLabel } from "@/lib/departments";

export const Route = createFileRoute("/_authenticated/work/new")({
  component: NewWorkItemPage,
});

const schema = z.object({
  title: z.string().min(1, "Title is required").max(200),
  description: z.string().optional(),
  type: z.enum(["routine", "project", "external_request", "ad_hoc"]),
  priority: z.enum(["low", "medium", "high", "critical"]),
  assignedToId: z.string().optional(),
  departmentId: z.string().optional(),
  requesterName: z.string().optional(),
  requesterEmail: z.string().email("Invalid email").optional().or(z.literal("")),
  sourceSystem: z.string().optional(),
  sourceReference: z.string().optional(),
  dueDate: z.string().optional(),
});

type FormValues = z.infer<typeof schema>;

function NewWorkItemPage() {
  const navigate = useNavigate();

  // Contributors (multi-select managed separately from RHF)
  const [contributorIds, setContributorIds] = useState<string[]>([]);
  const [teamAllocations, setTeamAllocations] = useState<Array<{ departmentId: string; requiredCount: number }>>([]);

  const { data: staffList } = useQuery(orpc.staff.list.queryOptions({ input: { limit: 200, offset: 0 } }));
  const { data: departments } = useQuery(orpc.staff.getDepartments.queryOptions());

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { type: "routine", priority: "medium" },
  });

  const type = watch("type");
  const primaryOwnerId = watch("assignedToId");

  const mutation = useMutation(
    orpc.work.create.mutationOptions({
      onSuccess: (item) => {
        queryClient.invalidateQueries({ queryKey: orpc.work.list.key() });
        queryClient.invalidateQueries({ queryKey: orpc.work.stats.key() });
        toast.success("Work item created");
        navigate({ to: "/work/$workItemId", params: { workItemId: item.id } });
      },
      onError: (err) => toast.error(`Failed: ${err.message}`),
    })
  );

  const onSubmit = (values: FormValues) => {
    mutation.mutate({
      ...values,
      requesterEmail: values.requesterEmail || undefined,
      dueDate: values.dueDate || undefined,
      contributorIds: contributorIds.length > 0 ? contributorIds : undefined,
      teamAllocations: teamAllocations.length > 0
        ? teamAllocations.filter((a) => a.departmentId)
        : undefined,
    });
  };

  // Available contributors = all staff excluding the primary owner + already selected
  const availableContributors = staffList?.filter(
    (s) => s.id !== primaryOwnerId && !contributorIds.includes(s.id)
  ) ?? [];

  const addContributor = (id: string) => {
    if (id && !contributorIds.includes(id)) setContributorIds((prev) => [...prev, id]);
  };

  const removeContributor = (id: string) => setContributorIds((prev) => prev.filter((c) => c !== id));

  const staffById = (id: string) => staffList?.find((s) => s.id === id);
  const deptById = (id: string) => departments?.find((d) => d.id === id);

  return (
    <>
      <Header fixed>
        <div className="flex items-center gap-2">
          <ClipboardCheck className="size-4 text-muted-foreground" />
          <Link to="/work" className="text-sm text-muted-foreground hover:text-foreground">
            Work Register
          </Link>
          <span className="text-muted-foreground">/</span>
          <span className="text-sm font-medium">New Work Item</span>
        </div>
      </Header>

      <Main>
        <div className="mb-6 flex items-center gap-3">
          <Link to="/work">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="size-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">New Work Item</h1>
            <p className="text-sm text-muted-foreground">Add a work item to the register.</p>
          </div>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="max-w-2xl space-y-5">
          {/* Title */}
          <div className="space-y-1.5">
            <Label htmlFor="title">Title *</Label>
            <Input id="title" {...register("title")} placeholder="Brief title" />
            {errors.title && <p className="text-xs text-destructive">{errors.title.message}</p>}
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              {...register("description")}
              placeholder="Details, context, acceptance criteria..."
              rows={3}
            />
          </div>

          {/* Type + Priority */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="type">Type</Label>
              <select
                id="type"
                {...register("type")}
                className="w-full rounded-xl border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="routine">Routine</option>
                <option value="project">Project</option>
                <option value="external_request">External Request</option>
                <option value="ad_hoc">Ad Hoc</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="priority">Priority</Label>
              <select
                id="priority"
                {...register("priority")}
                className="w-full rounded-xl border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="critical">Critical</option>
              </select>
            </div>
          </div>

          {/* Primary owner + Department */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="assignedToId">Primary Owner</Label>
              <select
                id="assignedToId"
                {...register("assignedToId")}
                className="w-full rounded-xl border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="">Unassigned</option>
                {staffList?.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.user?.name} — {s.jobTitle}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="departmentId">Department</Label>
              <select
                id="departmentId"
                {...register("departmentId")}
                className="w-full rounded-xl border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="">No department</option>
                {departments?.map((d) => (
                  <option key={d.id} value={d.id}>{departmentOptionLabel(d, { withCode: true })}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Contributors */}
          <div className="space-y-2 rounded-xl border p-4">
            <div className="flex items-center justify-between">
              <Label>Contributors</Label>
              <p className="text-xs text-muted-foreground">Additional staff working on this item</p>
            </div>

            {contributorIds.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {contributorIds.map((id) => {
                  const s = staffById(id);
                  return (
                    <div key={id} className="flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-xs">
                      {s?.user?.name ?? id}
                      {s?.department && (
                        <span className="text-muted-foreground">({s.department.code})</span>
                      )}
                      <button type="button" onClick={() => removeContributor(id)}>
                        <X className="size-3 text-muted-foreground hover:text-destructive" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="flex gap-2">
              <select
                id="contributor-select"
                defaultValue=""
                onChange={(e) => { addContributor(e.target.value); e.target.value = ""; }}
                className="flex-1 rounded-xl border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="">Add contributor...</option>
                {availableContributors.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.user?.name} — {s.department?.code ?? s.jobTitle}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Team allocations */}
          <div className="space-y-2 rounded-xl border p-4">
            <div className="flex items-center justify-between">
              <Label>Team Allocation</Label>
              <p className="text-xs text-muted-foreground">Required headcount per sub-department</p>
            </div>

            {teamAllocations.map((row, i) => (
              <div key={i} className="flex gap-2 items-center">
                <select
                  value={row.departmentId}
                  onChange={(e) => {
                    const next = [...teamAllocations];
                    next[i] = { ...next[i]!, departmentId: e.target.value };
                    setTeamAllocations(next);
                  }}
                  className="flex-1 rounded-xl border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  <option value="">Select team...</option>
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
                    const next = [...teamAllocations];
                    next[i] = { ...next[i]!, requiredCount: Number(e.target.value) };
                    setTeamAllocations(next);
                  }}
                  className="w-16 rounded-xl border bg-background px-3 py-2 text-sm text-center focus:outline-none focus:ring-2 focus:ring-ring"
                />
                <button type="button" onClick={() => setTeamAllocations(teamAllocations.filter((_, j) => j !== i))}>
                  <X className="size-4 text-muted-foreground hover:text-destructive" />
                </button>
              </div>
            ))}

            {teamAllocations.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {teamAllocations.filter((a) => a.departmentId).map((a, i) => (
                  <Badge key={i} variant="secondary" className="text-xs gap-1">
                    <Building2 className="size-3" />
                    {deptById(a.departmentId)?.code ?? "?"} ×{a.requiredCount}
                  </Badge>
                ))}
              </div>
            )}

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setTeamAllocations([...teamAllocations, { departmentId: "", requiredCount: 1 }])}
            >
              <Plus className="size-3.5 mr-1" /> Add team
            </Button>
          </div>

          {/* Due Date */}
          <div className="space-y-1.5">
            <Label htmlFor="dueDate">Due Date</Label>
            <Input id="dueDate" type="date" {...register("dueDate")} />
          </div>

          {/* External request fields */}
          {type === "external_request" && (
            <div className="grid grid-cols-2 gap-4 rounded-xl border p-4">
              <div className="space-y-1.5">
                <Label htmlFor="requesterName">Requester Name</Label>
                <Input id="requesterName" {...register("requesterName")} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="requesterEmail">Requester Email</Label>
                <Input id="requesterEmail" type="email" {...register("requesterEmail")} />
                {errors.requesterEmail && (
                  <p className="text-xs text-destructive">{errors.requesterEmail.message}</p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="sourceSystem">Source System</Label>
                <Input id="sourceSystem" {...register("sourceSystem")} placeholder="e.g. ServiceNow" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="sourceReference">Reference No.</Label>
                <Input id="sourceReference" {...register("sourceReference")} />
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <Button type="submit" disabled={isSubmitting || mutation.isPending}>
              {mutation.isPending ? "Creating..." : "Create Work Item"}
            </Button>
            <Link to="/work">
              <Button type="button" variant="outline">Cancel</Button>
            </Link>
          </div>
        </form>
      </Main>
    </>
  );
}
