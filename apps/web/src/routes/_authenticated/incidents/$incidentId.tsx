import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { format } from "date-fns";
import {
  AlertTriangle,
  ArrowLeft,
  Clock,
  MessageSquare,
  Plus,
  Server,
  Users,
  X,
  FileText,
} from "lucide-react";
import { Button } from "@ndma-dcs-staff-portal/ui/components/button";
import { Textarea } from "@ndma-dcs-staff-portal/ui/components/textarea";
import { Label } from "@ndma-dcs-staff-portal/ui/components/label";
import { Input } from "@ndma-dcs-staff-portal/ui/components/input";
import { Skeleton } from "@ndma-dcs-staff-portal/ui/components/skeleton";
import { Separator } from "@ndma-dcs-staff-portal/ui/components/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@ndma-dcs-staff-portal/ui/components/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@ndma-dcs-staff-portal/ui/components/dialog";
import { Header } from "@/components/layout/header";
import { Main } from "@/components/layout/main";
import { orpc, queryClient } from "@/utils/orpc";

export const Route = createFileRoute("/_authenticated/incidents/$incidentId")({
  component: IncidentDetailPage,
});

// ── Types ──────────────────────────────────────────────────────────────────

type IncidentSeverity = "sev1" | "sev2" | "sev3" | "sev4";
type IncidentStatus =
  | "detected"
  | "investigating"
  | "identified"
  | "mitigating"
  | "resolved"
  | "post_mortem"
  | "closed";
type TimelineEventType = "status_change" | "note" | "escalation" | "action_taken";
type ResponderRole = "commander" | "comms" | "technical" | "observer";

// ── Badge helpers ──────────────────────────────────────────────────────────

const SEV_CONFIG: Record<IncidentSeverity, { label: string; className: string }> = {
  sev1: { label: "SEV1 — Critical", className: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300 font-bold" },
  sev2: { label: "SEV2 — High", className: "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300" },
  sev3: { label: "SEV3 — Medium", className: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300" },
  sev4: { label: "SEV4 — Low", className: "bg-muted text-muted-foreground" },
};

const STATUS_CONFIG: Record<IncidentStatus, { label: string; className: string }> = {
  detected: { label: "Detected", className: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300" },
  investigating: { label: "Investigating", className: "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300" },
  identified: { label: "Identified", className: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300" },
  mitigating: { label: "Mitigating", className: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300" },
  resolved: { label: "Resolved", className: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300" },
  post_mortem: { label: "Post-Mortem", className: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300" },
  closed: { label: "Closed", className: "bg-muted text-muted-foreground" },
};

const TIMELINE_ICON: Record<TimelineEventType, string> = {
  status_change: "🔄",
  note: "📝",
  escalation: "🚨",
  action_taken: "✅",
};

function SeverityBadge({ severity }: { severity: string }) {
  const cfg = SEV_CONFIG[severity as IncidentSeverity];
  if (!cfg) return <span className="text-xs text-muted-foreground">{severity}</span>;
  return (
    <span className={`inline-flex items-center rounded-lg px-2 py-0.5 text-xs font-medium ${cfg.className}`}>
      {cfg.label}
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status as IncidentStatus];
  if (!cfg) return <span className="text-xs text-muted-foreground">{status}</span>;
  return (
    <span className={`inline-flex items-center rounded-lg px-2 py-0.5 text-xs font-medium ${cfg.className}`}>
      {cfg.label}
    </span>
  );
}

// ── PIR Dialog ─────────────────────────────────────────────────────────────

function PIRDialog({
  incidentId,
  existingPIR,
  onClose,
}: {
  incidentId: string;
  existingPIR?: { summary?: string | null; lessonsLearned?: string | null; reviewDate?: string | null } | null;
  onClose: () => void;
}) {
  const [form, setForm] = useState({
    summary: existingPIR?.summary ?? "",
    lessonsLearned: existingPIR?.lessonsLearned ?? "",
    reviewDate: existingPIR?.reviewDate ?? "",
  });

  const mutation = useMutation(
    orpc.incidents.createPIR.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: orpc.incidents.get.key() });
        toast.success("PIR saved");
        onClose();
      },
      onError: (err) => toast.error(err.message),
    })
  );

  return (
    <DialogContent className="sm:max-w-lg">
      <DialogHeader>
        <DialogTitle>Post-Incident Review</DialogTitle>
      </DialogHeader>
      <div className="space-y-4 py-2">
        <div className="space-y-1.5">
          <Label htmlFor="pir-review-date">Review Date (optional)</Label>
          <Input
            id="pir-review-date"
            type="date"
            value={form.reviewDate}
            onChange={(e) => setForm((f) => ({ ...f, reviewDate: e.target.value }))}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="pir-summary">Summary / Root Cause</Label>
          <Textarea
            id="pir-summary"
            rows={4}
            placeholder="What happened and why..."
            value={form.summary}
            onChange={(e) => setForm((f) => ({ ...f, summary: e.target.value }))}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="pir-lessons">Lessons Learned &amp; Action Items</Label>
          <Textarea
            id="pir-lessons"
            rows={4}
            placeholder="What will prevent recurrence..."
            value={form.lessonsLearned}
            onChange={(e) => setForm((f) => ({ ...f, lessonsLearned: e.target.value }))}
          />
        </div>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button
          disabled={mutation.isPending}
          onClick={() =>
            mutation.mutate({
              incidentId,
              summary: form.summary || undefined,
              lessonsLearned: form.lessonsLearned || undefined,
              reviewDate: form.reviewDate || undefined,
            })
          }
        >
          {mutation.isPending ? "Saving…" : "Save PIR"}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

// ── Edit Incident Dialog ────────────────────────────────────────────────────

function EditIncidentDialog({
  incident,
  onClose,
}: {
  incident: { id: string; title: string; description?: string | null; severity: string; impactSummary?: string | null; rootCause?: string | null };
  onClose: () => void;
}) {
  const [form, setForm] = useState({
    title: incident.title,
    description: incident.description ?? "",
    severity: incident.severity as IncidentSeverity,
    impactSummary: incident.impactSummary ?? "",
    rootCause: incident.rootCause ?? "",
  });

  const mutation = useMutation(
    orpc.incidents.update.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: orpc.incidents.get.key() });
        queryClient.invalidateQueries({ queryKey: orpc.incidents.list.key() });
        toast.success("Incident updated");
        onClose();
      },
      onError: (err) => toast.error(err.message),
    })
  );

  return (
    <DialogContent className="sm:max-w-lg">
      <DialogHeader>
        <DialogTitle>Edit Incident</DialogTitle>
      </DialogHeader>
      <div className="space-y-4 py-2">
        <div className="space-y-1.5">
          <Label htmlFor="edit-title">Title</Label>
          <Input
            id="edit-title"
            value={form.title}
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="edit-severity">Severity</Label>
          <Select
            value={form.severity}
            onValueChange={(v) => setForm((f) => ({ ...f, severity: v as IncidentSeverity }))}
          >
            <SelectTrigger id="edit-severity">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="sev1">SEV1 — Critical</SelectItem>
              <SelectItem value="sev2">SEV2 — High</SelectItem>
              <SelectItem value="sev3">SEV3 — Medium</SelectItem>
              <SelectItem value="sev4">SEV4 — Low</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="edit-description">Description</Label>
          <Textarea
            id="edit-description"
            rows={3}
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="edit-impact">Impact Summary</Label>
          <Textarea
            id="edit-impact"
            rows={2}
            placeholder="Who/what is affected..."
            value={form.impactSummary}
            onChange={(e) => setForm((f) => ({ ...f, impactSummary: e.target.value }))}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="edit-root-cause">Root Cause</Label>
          <Textarea
            id="edit-root-cause"
            rows={2}
            placeholder="Known or suspected root cause..."
            value={form.rootCause}
            onChange={(e) => setForm((f) => ({ ...f, rootCause: e.target.value }))}
          />
        </div>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button
          disabled={mutation.isPending || !form.title.trim()}
          onClick={() =>
            mutation.mutate({
              id: incident.id,
              title: form.title,
              description: form.description || undefined,
              severity: form.severity,
              impactSummary: form.impactSummary || undefined,
              rootCause: form.rootCause || undefined,
            })
          }
        >
          {mutation.isPending ? "Saving…" : "Save Changes"}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

// ── Main page component ────────────────────────────────────────────────────

function IncidentDetailPage() {
  const { incidentId } = Route.useParams();

  const [timelineContent, setTimelineContent] = useState("");
  const [timelineType, setTimelineType] = useState<TimelineEventType>("note");
  const [selectedResponder, setSelectedResponder] = useState("");
  const [responderRole, setResponderRole] = useState<ResponderRole>("technical");
  const [selectedService, setSelectedService] = useState("");
  const [showPIR, setShowPIR] = useState(false);
  const [showEdit, setShowEdit] = useState(false);

  const { data: incident, isLoading, error } = useQuery(
    orpc.incidents.get.queryOptions({ input: { id: incidentId } })
  );

  const { data: staffList } = useQuery(
    orpc.staff.list.queryOptions({ input: { limit: 200, offset: 0 } })
  );

  const { data: servicesList } = useQuery(orpc.services.list.queryOptions());

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: orpc.incidents.get.key() });
    queryClient.invalidateQueries({ queryKey: orpc.incidents.list.key() });
  };

  const statusMutation = useMutation(
    orpc.incidents.update.mutationOptions({
      onSuccess: () => { invalidate(); toast.success("Status updated"); },
      onError: (err) => toast.error(err.message),
    })
  );

  const timelineMutation = useMutation(
    orpc.incidents.addTimelineEntry.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: orpc.incidents.get.key() });
        setTimelineContent("");
        toast.success("Timeline entry added");
      },
      onError: (err) => toast.error(err.message),
    })
  );

  const addResponderMutation = useMutation(
    orpc.incidents.addResponder.mutationOptions({
      onSuccess: () => { invalidate(); setSelectedResponder(""); toast.success("Responder added"); },
      onError: (err) => toast.error(err.message),
    })
  );

  const removeResponderMutation = useMutation(
    orpc.incidents.removeResponder.mutationOptions({
      onSuccess: () => { invalidate(); toast.success("Responder removed"); },
      onError: (err) => toast.error(err.message),
    })
  );

  const linkServiceMutation = useMutation(
    orpc.incidents.linkService.mutationOptions({
      onSuccess: () => { invalidate(); setSelectedService(""); toast.success("Service linked"); },
      onError: (err) => toast.error(err.message),
    })
  );

  const unlinkServiceMutation = useMutation(
    orpc.incidents.unlinkService.mutationOptions({
      onSuccess: () => { invalidate(); toast.success("Service unlinked"); },
      onError: (err) => toast.error(err.message),
    })
  );

  const STATUS_PIPELINE: IncidentStatus[] = [
    "detected", "investigating", "identified", "mitigating", "resolved", "post_mortem", "closed",
  ];

  if (isLoading) {
    return (
      <>
        <Header fixed>
          <div className="flex items-center gap-2">
            <AlertTriangle className="size-4 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">Incidents</span>
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

  if (error || !incident) {
    return (
      <Main>
        <p className="text-muted-foreground">Incident not found.</p>
        <Link to="/incidents">
          <Button variant="outline" className="mt-4">Back to Incidents</Button>
        </Link>
      </Main>
    );
  }

  const activeResponders = incident.responders?.filter((r) => !(r as any).leftAt) ?? [];
  const linkedServiceIds = new Set(incident.affectedServices?.map((s) => s.serviceId));
  const availableServices = servicesList?.filter((s) => !linkedServiceIds.has(s.id)) ?? [];
  const responderProfileIds = new Set(activeResponders.map((r) => r.staffProfileId));
  const availableStaff = staffList?.filter((s) => !responderProfileIds.has(s.id)) ?? [];

  return (
    <>
      <Header fixed>
        <div className="flex items-center gap-2 min-w-0">
          <AlertTriangle className="size-4 shrink-0 text-muted-foreground" />
          <Link to="/incidents" className="text-sm text-muted-foreground hover:text-foreground shrink-0">
            Incidents
          </Link>
          <span className="text-muted-foreground shrink-0">/</span>
          <span className="text-sm font-medium truncate">{incident.title}</span>
        </div>
      </Header>

      <Main>
        <div className="mb-6 flex items-start gap-3">
          <Link to="/incidents">
            <Button variant="ghost" size="icon" className="mt-1">
              <ArrowLeft className="size-4" />
            </Button>
          </Link>
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2 mb-1">
              <SeverityBadge severity={incident.severity} />
              <StatusBadge status={incident.status} />
            </div>
            <h1 className="text-2xl font-bold tracking-tight">{incident.title}</h1>
            {incident.description && (
              <p className="text-sm text-muted-foreground mt-1">{incident.description}</p>
            )}
          </div>
          <Button variant="outline" size="sm" onClick={() => setShowEdit(true)}>
            Edit
          </Button>
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          {/* ── Left: Timeline + Actions ── */}
          <div className="lg:col-span-2 space-y-6">

            {/* Status pipeline */}
            <div className="rounded-xl border p-4">
              <h2 className="font-semibold text-sm mb-3">Status</h2>
              <div className="flex flex-wrap gap-1.5">
                {STATUS_PIPELINE.map((s) => (
                  <button
                    key={s}
                    onClick={() => statusMutation.mutate({ id: incidentId, status: s })}
                    disabled={incident.status === s || statusMutation.isPending}
                    className={`rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
                      incident.status === s
                        ? "bg-primary text-primary-foreground"
                        : "border hover:bg-muted"
                    }`}
                  >
                    {STATUS_CONFIG[s]?.label ?? s}
                  </button>
                ))}
              </div>
            </div>

            {/* Timeline */}
            <div>
              <h2 className="font-semibold mb-3 flex items-center gap-2">
                <Clock className="size-4" />
                Timeline
              </h2>

              {/* Add entry form */}
              <div className="rounded-xl border p-4 mb-4 space-y-3">
                <div className="flex gap-3">
                  <div className="flex-1 space-y-1.5">
                    <Label>Entry Type</Label>
                    <Select
                      value={timelineType}
                      onValueChange={(v) => setTimelineType(v as TimelineEventType)}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="note">Note</SelectItem>
                        <SelectItem value="action_taken">Action Taken</SelectItem>
                        <SelectItem value="escalation">Escalation</SelectItem>
                        <SelectItem value="status_change">Status Note</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label>Update</Label>
                  <Textarea
                    value={timelineContent}
                    onChange={(e) => setTimelineContent(e.target.value)}
                    placeholder="What happened? What was tried? What was the outcome?"
                    rows={3}
                  />
                </div>
                <Button
                  size="sm"
                  disabled={!timelineContent.trim() || timelineMutation.isPending}
                  onClick={() =>
                    timelineMutation.mutate({
                      incidentId,
                      eventType: timelineType,
                      content: timelineContent,
                    })
                  }
                >
                  {timelineMutation.isPending ? "Adding…" : "Add Timeline Entry"}
                </Button>
              </div>

              {/* Past entries */}
              {incident.timeline?.length ? (
                <div className="relative space-y-3 pl-6 before:absolute before:left-2 before:top-2 before:bottom-2 before:w-px before:bg-border">
                  {[...incident.timeline]
                    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
                    .map((entry) => (
                      <div key={entry.id} className="relative">
                        <span className="absolute -left-[22px] top-1 text-sm">
                          {TIMELINE_ICON[entry.eventType as TimelineEventType] ?? "📌"}
                        </span>
                        <div className="rounded-xl border p-3 text-sm">
                          <div className="flex items-center justify-between mb-1">
                            <span className="font-medium capitalize">
                              {entry.eventType.replace("_", " ")}
                            </span>
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                              <span>{(entry as any).author?.name}</span>
                              <span>{format(new Date(entry.createdAt), "dd MMM, HH:mm")}</span>
                            </div>
                          </div>
                          <p className="text-muted-foreground whitespace-pre-wrap">{entry.content}</p>
                        </div>
                      </div>
                    ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No timeline entries yet.</p>
              )}
            </div>

            {/* PIR section */}
            {(incident.status === "resolved" || incident.status === "post_mortem" || incident.status === "closed") && (
              <div>
                <Separator className="mb-4" />
                <h2 className="font-semibold mb-3 flex items-center gap-2">
                  <FileText className="size-4" />
                  Post-Incident Review
                </h2>
                {incident.pir ? (
                  <div className="rounded-xl border p-4 space-y-3 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">
                        Review Date: {incident.pir.reviewDate ? format(new Date(incident.pir.reviewDate), "dd MMM yyyy") : "TBD"}
                      </span>
                      <Button variant="outline" size="sm" onClick={() => setShowPIR(true)}>
                        Edit PIR
                      </Button>
                    </div>
                    {incident.pir.summary && (
                      <div>
                        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">Summary / Root Cause</p>
                        <p className="whitespace-pre-wrap">{incident.pir.summary}</p>
                      </div>
                    )}
                    {incident.pir.lessonsLearned && (
                      <div>
                        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">Lessons Learned</p>
                        <p className="whitespace-pre-wrap">{incident.pir.lessonsLearned}</p>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="rounded-xl border border-dashed p-4 text-center">
                    <p className="text-sm text-muted-foreground mb-3">
                      No PIR created yet. Document the root cause and lessons learned.
                    </p>
                    <Button size="sm" variant="outline" onClick={() => setShowPIR(true)}>
                      <Plus className="size-3.5 mr-1.5" /> Create PIR
                    </Button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ── Right sidebar ── */}
          <div className="space-y-4">

            {/* Details */}
            <div className="rounded-xl border p-4 space-y-3 text-sm">
              <h3 className="font-semibold">Details</h3>
              <div className="space-y-2 text-muted-foreground">
                <div className="flex justify-between">
                  <span>Detected</span>
                  <span className="text-foreground">
                    {format(new Date(incident.detectedAt), "dd MMM yyyy, HH:mm")}
                  </span>
                </div>
                {(incident as any).resolvedAt && (
                  <div className="flex justify-between">
                    <span>Resolved</span>
                    <span className="text-foreground">
                      {format(new Date((incident as any).resolvedAt), "dd MMM yyyy, HH:mm")}
                    </span>
                  </div>
                )}
                {incident.commander && (
                  <div className="flex justify-between">
                    <span>Commander</span>
                    <span className="text-foreground">{incident.commander.user?.name}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span>Reported by</span>
                  <span className="text-foreground">{(incident as any).reportedBy?.name}</span>
                </div>
              </div>
              {incident.impactSummary && (
                <>
                  <Separator />
                  <div>
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">Impact</p>
                    <p className="text-muted-foreground">{incident.impactSummary}</p>
                  </div>
                </>
              )}
              {incident.rootCause && (
                <>
                  <Separator />
                  <div>
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">Root Cause</p>
                    <p className="text-muted-foreground">{incident.rootCause}</p>
                  </div>
                </>
              )}
            </div>

            {/* Affected Services */}
            <div className="rounded-xl border p-4 space-y-3 text-sm">
              <h3 className="font-semibold flex items-center gap-2">
                <Server className="size-4" />
                Affected Services
              </h3>
              {incident.affectedServices?.length ? (
                <div className="space-y-1.5">
                  {incident.affectedServices.map((as) => (
                    <div key={as.serviceId} className="flex items-center justify-between gap-2">
                      <span>{(as as any).service?.name ?? as.serviceId}</span>
                      <button
                        onClick={() =>
                          unlinkServiceMutation.mutate({ incidentId, serviceId: as.serviceId })
                        }
                        disabled={unlinkServiceMutation.isPending}
                        className="text-muted-foreground hover:text-destructive transition-colors"
                        title="Unlink service"
                      >
                        <X className="size-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground italic">No services linked</p>
              )}
              {availableServices.length > 0 && (
                <div className="flex gap-2 pt-1">
                  <select
                    value={selectedService}
                    onChange={(e) => setSelectedService(e.target.value)}
                    className="flex-1 rounded-lg border bg-background px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-ring"
                  >
                    <option value="">Link service…</option>
                    {availableServices.map((s) => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                  <Button
                    size="sm"
                    disabled={!selectedService || linkServiceMutation.isPending}
                    onClick={() =>
                      linkServiceMutation.mutate({ incidentId, serviceId: selectedService })
                    }
                  >
                    <Plus className="size-3.5" />
                  </Button>
                </div>
              )}
            </div>

            {/* Responders */}
            <div className="rounded-xl border p-4 space-y-3 text-sm">
              <h3 className="font-semibold flex items-center gap-2">
                <Users className="size-4" />
                Responders
              </h3>
              {activeResponders.length ? (
                <div className="space-y-1.5">
                  {activeResponders.map((r) => (
                    <div key={r.staffProfileId} className="flex items-center justify-between gap-2">
                      <div>
                        <span className="font-medium">{r.staffProfile?.user?.name}</span>
                        <span className="ml-2 text-xs text-muted-foreground capitalize">{r.role}</span>
                      </div>
                      <button
                        onClick={() =>
                          removeResponderMutation.mutate({ incidentId, staffProfileId: r.staffProfileId })
                        }
                        disabled={removeResponderMutation.isPending}
                        className="text-muted-foreground hover:text-destructive transition-colors"
                        title="Remove responder"
                      >
                        <X className="size-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground italic">No responders assigned</p>
              )}
              <div className="space-y-2 pt-1">
                <select
                  value={selectedResponder}
                  onChange={(e) => setSelectedResponder(e.target.value)}
                  className="w-full rounded-lg border bg-background px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  <option value="">Add responder…</option>
                  {availableStaff.map((s) => (
                    <option key={s.id} value={s.id}>{s.user?.name}</option>
                  ))}
                </select>
                <div className="flex gap-2">
                  <select
                    value={responderRole}
                    onChange={(e) => setResponderRole(e.target.value as ResponderRole)}
                    className="flex-1 rounded-lg border bg-background px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-ring"
                  >
                    <option value="commander">Commander</option>
                    <option value="technical">Technical</option>
                    <option value="comms">Comms</option>
                    <option value="observer">Observer</option>
                  </select>
                  <Button
                    size="sm"
                    disabled={!selectedResponder || addResponderMutation.isPending}
                    onClick={() =>
                      addResponderMutation.mutate({
                        incidentId,
                        staffProfileId: selectedResponder,
                        role: responderRole,
                      })
                    }
                  >
                    <Plus className="size-3.5" />
                  </Button>
                </div>
              </div>
            </div>

            {/* PIR quick action for resolved incidents */}
            {(incident.status === "resolved" || incident.status === "post_mortem" || incident.status === "closed") && !incident.pir && (
              <Button
                variant="outline"
                className="w-full"
                onClick={() => setShowPIR(true)}
              >
                <MessageSquare className="size-4 mr-2" />
                Create Post-Incident Review
              </Button>
            )}
          </div>
        </div>
      </Main>

      {/* Edit dialog */}
      <Dialog open={showEdit} onOpenChange={(o) => !o && setShowEdit(false)}>
        <EditIncidentDialog incident={incident as any} onClose={() => setShowEdit(false)} />
      </Dialog>

      {/* PIR dialog */}
      <Dialog open={showPIR} onOpenChange={(o) => !o && setShowPIR(false)}>
        <PIRDialog
          incidentId={incidentId}
          existingPIR={incident.pir}
          onClose={() => setShowPIR(false)}
        />
      </Dialog>
    </>
  );
}
