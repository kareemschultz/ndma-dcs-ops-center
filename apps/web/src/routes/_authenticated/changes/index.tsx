import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { format, parseISO } from "date-fns";
import {
  Shuffle,
  Plus,
  AlertCircle,
  Ban,
  Clock,
  Globe,
  Activity,
  Network,
  CheckCircle2,
  Pencil,
  Trash2,
  ServerCrash,
} from "lucide-react";
import { Button } from "@ndma-dcs-staff-portal/ui/components/button";
import { Skeleton } from "@ndma-dcs-staff-portal/ui/components/skeleton";
import { Badge } from "@ndma-dcs-staff-portal/ui/components/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@ndma-dcs-staff-portal/ui/components/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@ndma-dcs-staff-portal/ui/components/dialog";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@ndma-dcs-staff-portal/ui/components/tabs";
import { Card, CardContent } from "@ndma-dcs-staff-portal/ui/components/card";
import { InfoPopover } from "@/components/info-popover";
import { Header } from "@/components/layout/header";
import { Main } from "@/components/layout/main";
import { ThemeSwitch } from "@/components/theme-switch";
import { orpc } from "@/utils/orpc";

export const Route = createFileRoute("/_authenticated/changes/")({
  component: TempChangesPage,
});

// ── Helper functions ──────────────────────────────────────────────────────────

function daysOverdue(removeByDate: string): number {
  return Math.floor((Date.now() - new Date(removeByDate).getTime()) / 86400000);
}

function daysUntil(date: string): number {
  return Math.ceil((new Date(date).getTime() - Date.now()) / 86400000);
}

function safeFormatDate(d: string | null | undefined): string {
  if (!d) return "—";
  try {
    return format(parseISO(d), "d MMM yyyy");
  } catch {
    return d;
  }
}

// ── Badge components ──────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    active: {
      label: "Active",
      cls: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
    },
    pending_removal: {
      label: "Pending Removal",
      cls: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
    },
    overdue: {
      label: "Overdue",
      cls: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300 font-semibold",
    },
    removed: {
      label: "Removed",
      cls: "bg-muted text-muted-foreground",
    },
    implemented: {
      label: "Implemented",
      cls: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
    },
    planned: {
      label: "Planned",
      cls: "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300",
    },
    cancelled: {
      label: "Cancelled",
      cls: "bg-muted text-muted-foreground",
    },
  };
  const cfg = map[status] ?? { label: status, cls: "bg-muted text-muted-foreground" };
  return (
    <span
      className={`inline-flex items-center rounded-lg px-2 py-0.5 text-xs font-medium ${cfg.cls}`}
    >
      {cfg.label}
    </span>
  );
}

function RiskBadge({ risk }: { risk?: string | null }) {
  if (!risk) return null;
  const map: Record<string, string> = {
    low: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
    medium: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
    high: "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300",
    critical:
      "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300 font-semibold",
  };
  return (
    <span
      className={`inline-flex items-center rounded-lg px-2 py-0.5 text-xs font-medium uppercase ${map[risk] ?? "bg-muted text-muted-foreground"}`}
    >
      {risk}
    </span>
  );
}

function CategoryBadge({ category }: { category?: string | null }) {
  const labels: Record<string, string> = {
    public_ip_exposure: "Public IP",
    temporary_service: "Temp Service",
    temporary_access: "Temp Access",
    temporary_change: "Config Change",
    other: "Other",
  };
  return (
    <span className="inline-flex items-center rounded-lg px-2 py-0.5 text-xs font-medium bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300">
      {labels[category ?? ""] ?? (category ?? "Change")}
    </span>
  );
}

// ── Types ─────────────────────────────────────────────────────────────────────

type TempChange = {
  id: string;
  title: string;
  description?: string | null;
  justification?: string | null;
  status: string;
  category?: string | null;
  riskLevel?: string | null;
  environment?: string | null;
  systemName?: string | null;
  publicIp?: string | null;
  internalIp?: string | null;
  port?: string | null;
  protocol?: string | null;
  externalExposure?: boolean | null;
  externalAgencyName?: string | null;
  ownerType?: string | null;
  removeByDate?: string | null;
  followUpDate?: string | null;
  implementationDate?: string | null;
  rollbackPlan?: string | null;
  followUpNotes?: string | null;
  owner?: { user?: { name?: string | null } | null } | null;
  service?: { name?: string | null } | null;
};

// ── Create/Edit form state ────────────────────────────────────────────────────

type FormState = {
  title: string;
  category: string;
  description: string;
  systemName: string;
  environment: string;
  publicIp: string;
  internalIp: string;
  port: string;
  protocol: string;
  externalExposure: boolean;
  externalAgencyName: string;
  ownerType: string;
  engineer: string;
  removeByDate: string;
  followUpDate: string;
  riskLevel: string;
  notes: string;
};

const defaultForm: FormState = {
  title: "",
  category: "temporary_change",
  description: "",
  systemName: "",
  environment: "production",
  publicIp: "",
  internalIp: "",
  port: "",
  protocol: "",
  externalExposure: false,
  externalAgencyName: "",
  ownerType: "internal_staff",
  engineer: "",
  removeByDate: "",
  followUpDate: "",
  riskLevel: "medium",
  notes: "",
};

// ── Stat card ─────────────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  icon: Icon,
  colorClass,
  loading,
}: {
  label: string;
  value: number | undefined;
  icon: React.ElementType;
  colorClass: string;
  loading?: boolean;
}) {
  return (
    <Card className="flex-1 min-w-[140px]">
      <CardContent className="p-4">
        <div className="flex items-center justify-between gap-2">
          <div>
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide mb-1">
              {label}
            </p>
            {loading ? (
              <Skeleton className="h-7 w-12 mt-1" />
            ) : (
              <p className={`text-2xl font-bold ${colorClass}`}>{value ?? 0}</p>
            )}
          </div>
          <div className={`rounded-lg p-2 ${colorClass} bg-current/10`}>
            <Icon className={`size-5 ${colorClass}`} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Empty state ───────────────────────────────────────────────────────────────

function EmptyState({
  icon: Icon,
  title,
  description,
}: {
  icon: React.ElementType;
  title: string;
  description: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="rounded-full bg-muted p-4 mb-4">
        <Icon className="size-8 text-muted-foreground" />
      </div>
      <h3 className="text-sm font-semibold mb-1">{title}</h3>
      <p className="text-xs text-muted-foreground max-w-xs">{description}</p>
    </div>
  );
}

// ── Loading skeleton rows ─────────────────────────────────────────────────────

function SkeletonRows({ cols }: { cols: number }) {
  return (
    <>
      {Array.from({ length: 5 }).map((_, i) => (
        <TableRow key={i}>
          {Array.from({ length: cols }).map((_, j) => (
            <TableCell key={j}>
              <Skeleton className="h-4 w-full" />
            </TableCell>
          ))}
        </TableRow>
      ))}
    </>
  );
}

// ── Mark Removed confirm dialog ───────────────────────────────────────────────

function MarkRemovedDialog({
  change,
  open,
  onClose,
  onConfirm,
  isPending,
}: {
  change: TempChange | null;
  open: boolean;
  onClose: () => void;
  onConfirm: (notes: string) => void;
  isPending: boolean;
}) {
  const [notes, setNotes] = useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!notes.trim()) return;
    onConfirm(notes.trim());
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Mark as Removed</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <p className="text-sm text-muted-foreground mb-3">
              Confirm that{" "}
              <span className="font-medium text-foreground">
                {change?.title}
              </span>{" "}
              has been removed from the environment.
            </p>
            <label className="block text-sm font-medium mb-1.5">
              Removal Notes <span className="text-destructive">*</span>
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder="Describe what was done to remove this change..."
              className="w-full rounded-xl border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none"
              required
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isPending || !notes.trim()}
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              {isPending ? "Marking..." : "Confirm Removal"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── Create/Edit Dialog ────────────────────────────────────────────────────────

function ChangeFormDialog({
  open,
  onClose,
  editChange,
  onSuccess,
}: {
  open: boolean;
  onClose: () => void;
  editChange: TempChange | null;
  onSuccess: () => void;
}) {
  const qc = useQueryClient();
  const isEdit = !!editChange;

  const [form, setForm] = useState<FormState>(() =>
    editChange
      ? {
          title: editChange.title ?? "",
          category: editChange.category ?? "temporary_change",
          description: editChange.description ?? "",
          systemName: editChange.systemName ?? "",
          environment: editChange.environment ?? "production",
          publicIp: editChange.publicIp ?? "",
          internalIp: editChange.internalIp ?? "",
          port: editChange.port ?? "",
          protocol: editChange.protocol ?? "",
          externalExposure: editChange.externalExposure ?? false,
          externalAgencyName: editChange.externalAgencyName ?? "",
          ownerType: editChange.ownerType ?? "internal_staff",
          engineer: editChange.owner?.user?.name ?? "",
          removeByDate: editChange.removeByDate ?? "",
          followUpDate: editChange.followUpDate ?? "",
          riskLevel: editChange.riskLevel ?? "medium",
          notes: editChange.followUpNotes ?? "",
        }
      : { ...defaultForm }
  );

  function set(key: keyof FormState, value: string | boolean) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function invalidateAll() {
    qc.invalidateQueries({ queryKey: orpc.tempChanges.list.key() });
    qc.invalidateQueries({ queryKey: orpc.tempChanges.getOverdue.key() });
    qc.invalidateQueries({ queryKey: orpc.tempChanges.getPublicIPs.key() });
    qc.invalidateQueries({ queryKey: orpc.tempChanges.getExpiringSoon.key() });
    qc.invalidateQueries({ queryKey: orpc.tempChanges.statsExtended.key() });
    qc.invalidateQueries({ queryKey: orpc.tempChanges.stats.key() });
  }

  const createMut = useMutation(
    orpc.tempChanges.create.mutationOptions({
      onSuccess: () => {
        invalidateAll();
        toast.success("Temporary change logged");
        onSuccess();
      },
      onError: (err) => toast.error(err.message),
    })
  );

  const updateMut = useMutation(
    orpc.tempChanges.update.mutationOptions({
      onSuccess: () => {
        invalidateAll();
        toast.success("Change updated");
        onSuccess();
      },
      onError: (err) => toast.error(err.message),
    })
  );

  const isPending = createMut.isPending || updateMut.isPending;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title.trim() || !form.removeByDate) return;

    // The form's category / protocol / ownerType <select> values are constrained
    // to the router enums, so the casts below are safe.
    const protocol =
      form.protocol === "tcp" || form.protocol === "udp" || form.protocol === "both"
        ? (form.protocol as "tcp" | "udp" | "both")
        : undefined;

    const payload = {
      title: form.title.trim(),
      description: form.description || undefined,
      removeByDate: form.removeByDate || undefined,
      followUpDate: form.followUpDate || undefined,
      // Extended categorization + network/exposure details — previously these
      // were collected by the form but silently dropped before submit.
      category: form.category as
        | "public_ip_exposure"
        | "temporary_service"
        | "temporary_access"
        | "temporary_change"
        | "other",
      environment: form.environment || undefined,
      systemName: form.systemName || undefined,
      publicIp: form.publicIp || undefined,
      internalIp: form.internalIp || undefined,
      port: form.port || undefined,
      protocol,
      externalExposure: form.externalExposure,
      ownerType: form.ownerType as
        | "internal_staff"
        | "external_contact"
        | "department"
        | "system",
      externalAgencyName: form.externalAgencyName || undefined,
    };

    if (isEdit && editChange) {
      updateMut.mutate({
        id: editChange.id,
        ...payload,
        followUpNotes: form.notes || undefined,
      });
    } else {
      createMut.mutate(payload);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? "Edit Temporary Change" : "Log New Temporary Change"}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Title */}
          <div>
            <label className="block text-sm font-medium mb-1.5">
              Title <span className="text-destructive">*</span>
            </label>
            <input
              value={form.title}
              onChange={(e) => set("title", e.target.value)}
              placeholder="Brief description of the change"
              required
              className="w-full rounded-xl border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          {/* Category + Environment row */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1.5">Category</label>
              <select
                value={form.category}
                onChange={(e) => set("category", e.target.value)}
                className="w-full rounded-xl border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="public_ip_exposure">Public IP Exposure</option>
                <option value="temporary_service">Temporary Service</option>
                <option value="temporary_access">Temporary Access</option>
                <option value="temporary_change">Config Change</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5">Environment</label>
              <select
                value={form.environment}
                onChange={(e) => set("environment", e.target.value)}
                className="w-full rounded-xl border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="production">Production</option>
                <option value="test">Test</option>
                <option value="dev">Dev</option>
              </select>
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium mb-1.5">Description</label>
            <textarea
              value={form.description}
              onChange={(e) => set("description", e.target.value)}
              rows={3}
              placeholder="Detailed description of the change..."
              className="w-full rounded-xl border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none"
            />
          </div>

          {/* System Name */}
          <div>
            <label className="block text-sm font-medium mb-1.5">System Name</label>
            <input
              value={form.systemName}
              onChange={(e) => set("systemName", e.target.value)}
              placeholder="e.g. Firewall, LDAP Server, VPN Gateway"
              className="w-full rounded-xl border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          {/* Network details */}
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1.5">Public IP</label>
              <input
                value={form.publicIp}
                onChange={(e) => set("publicIp", e.target.value)}
                placeholder="0.0.0.0"
                className="w-full rounded-xl border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5">Internal IP</label>
              <input
                value={form.internalIp}
                onChange={(e) => set("internalIp", e.target.value)}
                placeholder="10.x.x.x"
                className="w-full rounded-xl border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5">Port</label>
              <input
                value={form.port}
                onChange={(e) => set("port", e.target.value)}
                placeholder="443"
                className="w-full rounded-xl border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
          </div>

          {/* Protocol */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1.5">Protocol</label>
              <select
                value={form.protocol}
                onChange={(e) => set("protocol", e.target.value)}
                className="w-full rounded-xl border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="">Not specified</option>
                <option value="tcp">TCP</option>
                <option value="udp">UDP</option>
                <option value="both">Both</option>
              </select>
            </div>
            <div className="flex items-end pb-2">
              <label className="flex items-center gap-2.5 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={form.externalExposure}
                  onChange={(e) => set("externalExposure", e.target.checked)}
                  className="h-4 w-4 rounded-lg border"
                />
                <span className="text-sm font-medium">External Exposure</span>
              </label>
              <InfoPopover label="About External Exposure" className="ml-1.5">
                Turn on if this change exposes a service outside the NDMA
                network. This raises the calculated risk level.
              </InfoPopover>
            </div>
          </div>

          {/* External agency — conditional */}
          {form.externalExposure && (
            <div>
              <label className="block text-sm font-medium mb-1.5">
                External Agency Name
              </label>
              <input
                value={form.externalAgencyName}
                onChange={(e) => set("externalAgencyName", e.target.value)}
                placeholder="Agency or organisation name"
                className="w-full rounded-xl border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
          )}

          {/* Owner type + Engineer */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1.5">Owner Type</label>
              <select
                value={form.ownerType}
                onChange={(e) => set("ownerType", e.target.value)}
                className="w-full rounded-xl border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="internal_staff">Internal Staff</option>
                <option value="external_contact">External Contact</option>
                <option value="department">Department</option>
                <option value="system">System</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5">Engineer / Owner Name</label>
              <input
                value={form.engineer}
                onChange={(e) => set("engineer", e.target.value)}
                placeholder="Name of responsible engineer"
                className="w-full rounded-xl border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
          </div>

          {/* Remove By + Follow-up dates */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1.5">
                Remove By Date <span className="text-destructive">*</span>
              </label>
              <input
                type="date"
                value={form.removeByDate}
                onChange={(e) => set("removeByDate", e.target.value)}
                required
                className="w-full rounded-xl border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5">Follow Up Date</label>
              <input
                type="date"
                value={form.followUpDate}
                onChange={(e) => set("followUpDate", e.target.value)}
                className="w-full rounded-xl border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
          </div>

          {/* Risk level */}
          <div>
            <label className="block text-sm font-medium mb-1.5">Risk Level</label>
            <select
              value={form.riskLevel}
              onChange={(e) => set("riskLevel", e.target.value)}
              className="w-full rounded-xl border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="critical">Critical</option>
            </select>
            <p className="text-xs text-muted-foreground mt-1">
              Set automatically from exposure, public IP and environment — shown
              here for reference.
            </p>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-sm font-medium mb-1.5">Notes</label>
            <textarea
              value={form.notes}
              onChange={(e) => set("notes", e.target.value)}
              rows={2}
              placeholder="Any additional notes or context..."
              className="w-full rounded-xl border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none"
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending
                ? isEdit
                  ? "Saving..."
                  : "Logging..."
                : isEdit
                  ? "Save Changes"
                  : "Log Change"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── Action buttons ────────────────────────────────────────────────────────────

function ActionButtons({
  change,
  onEdit,
  onMarkRemoved,
  onCancel,
  onDelete,
}: {
  change: TempChange;
  onEdit: (c: TempChange) => void;
  onMarkRemoved: (c: TempChange) => void;
  onCancel: (c: TempChange) => void;
  onDelete: (c: TempChange) => void;
}) {
  const isTerminal = change.status === "removed" || change.status === "cancelled";
  const isDraft = change.status === "planned";
  return (
    <div className="flex items-center gap-1">
      <Button
        size="sm"
        variant="ghost"
        className="h-7 w-7 p-0"
        onClick={() => onEdit(change)}
        title="Edit"
      >
        <Pencil className="size-3.5" />
      </Button>
      {!isTerminal && (
        <Button
          size="sm"
          variant="ghost"
          className="h-7 w-7 p-0 text-blue-600 hover:text-blue-700 hover:bg-blue-50 dark:hover:bg-blue-900/20"
          onClick={() => onMarkRemoved(change)}
          title="Mark as Removed"
        >
          <CheckCircle2 className="size-3.5" />
        </Button>
      )}
      {!isTerminal && (
        <Button
          size="sm"
          variant="ghost"
          className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
          onClick={() => onCancel(change)}
          title="Archive — keeps the record for audit and moves it to Cancelled. Reversible."
        >
          <Ban className="size-3.5" />
        </Button>
      )}
      {isDraft && (
        <Button
          size="sm"
          variant="ghost"
          className="h-7 w-7 p-0 text-destructive hover:text-destructive hover:bg-destructive/10"
          onClick={() => onDelete(change)}
          title="Delete permanently — cannot be undone."
        >
          <Trash2 className="size-3.5" />
        </Button>
      )}
    </div>
  );
}

// ── Main page component ───────────────────────────────────────────────────────

function TempChangesPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [formOpen, setFormOpen] = useState(false);
  const [editChange, setEditChange] = useState<TempChange | null>(null);
  const [removingChange, setRemovingChange] = useState<TempChange | null>(null);
  const [cancellingChange, setCancellingChange] = useState<TempChange | null>(null);
  const [deletingChange, setDeletingChange] = useState<TempChange | null>(null);

  // ── Queries ─────────────────────────────────────────────────────────────────
  const { data: allChanges, isLoading: loadingAll } = useQuery(
    orpc.tempChanges.list.queryOptions({ input: { limit: 50, offset: 0 } })
  );

  const { data: overdueItems, isLoading: loadingOverdue } = useQuery(
    orpc.tempChanges.getOverdue.queryOptions()
  );

  const { data: expiringSoon, isLoading: loadingExpiring } = useQuery(
    orpc.tempChanges.getExpiringSoon.queryOptions({ input: { days: 7 } })
  );

  const { data: publicIPs, isLoading: loadingPublicIPs } = useQuery(
    orpc.tempChanges.getPublicIPs.queryOptions({ input: {} })
  );

  const { data: extStats, isLoading: loadingStats } = useQuery(
    orpc.tempChanges.statsExtended.queryOptions()
  );

  // ── Mutations ────────────────────────────────────────────────────────────────
  function invalidateAll() {
    qc.invalidateQueries({ queryKey: orpc.tempChanges.list.key() });
    qc.invalidateQueries({ queryKey: orpc.tempChanges.getOverdue.key() });
    qc.invalidateQueries({ queryKey: orpc.tempChanges.getPublicIPs.key() });
    qc.invalidateQueries({ queryKey: orpc.tempChanges.getExpiringSoon.key() });
    qc.invalidateQueries({ queryKey: orpc.tempChanges.statsExtended.key() });
    qc.invalidateQueries({ queryKey: orpc.tempChanges.stats.key() });
  }

  const markRemovedMut = useMutation(
    orpc.tempChanges.markRemoved.mutationOptions({
      onSuccess: () => {
        invalidateAll();
        setRemovingChange(null);
        toast.success("Change marked as removed");
      },
      onError: (err) => toast.error(err.message),
    })
  );

  const cancelMut = useMutation(
    orpc.tempChanges.cancel.mutationOptions({
      onSuccess: () => {
        invalidateAll();
        setCancellingChange(null);
        toast.success("Change cancelled");
      },
      onError: (err) => toast.error(err.message),
    })
  );

  const deleteMut = useMutation(
    orpc.tempChanges.delete.mutationOptions({
      onSuccess: () => {
        invalidateAll();
        setDeletingChange(null);
        toast.success("Draft change deleted");
      },
      onError: (err) => toast.error(err.message),
    })
  );

  function handleEdit(change: TempChange) {
    setEditChange(change);
    setFormOpen(true);
  }

  function handleNew() {
    setEditChange(null);
    setFormOpen(true);
  }

  function handleFormClose() {
    setFormOpen(false);
    setEditChange(null);
  }

  function handleMarkRemoved(notes: string) {
    if (!removingChange) return;
    markRemovedMut.mutate({ id: removingChange.id, followUpNotes: notes });
  }

  const totalActive = extStats?.active ?? 0;
  const totalOverdue = extStats?.overdue ?? 0;
  const totalExpiringSoon = extStats?.expiringSoon ?? 0;
  const totalPublicIPs = extStats?.publicIpCount ?? 0;

  return (
    <>
      <Header fixed>
        <div className="flex items-center gap-2">
          <Shuffle className="size-4 text-muted-foreground" />
          <span className="text-sm font-medium">Temporary Changes</span>
          {totalActive > 0 && (
            <Badge className="bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300 text-xs px-1.5 py-0">
              {totalActive} active
            </Badge>
          )}
          {totalOverdue > 0 && (
            <Badge className="bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300 text-xs px-1.5 py-0">
              {totalOverdue} overdue
            </Badge>
          )}
        </div>
        <div className="ms-auto flex items-center gap-2">
          <ThemeSwitch />
          <Button size="sm" onClick={handleNew}>
            <Plus className="size-4 mr-1" />
            New Change
          </Button>
        </div>
      </Header>

      <Main>
        <div className="mb-6">
          <h1 className="text-2xl font-bold tracking-tight">Temporary Changes</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Track temporary network and infrastructure changes that need to be rolled
            back. Monitor public IP exposures, service openings, and access grants.
          </p>
        </div>

        {/* Overdue alert banner */}
        {overdueItems && overdueItems.length > 0 && (
          <div className="mb-5 flex items-center gap-2.5 rounded-xl border border-red-200 bg-red-50 dark:bg-red-900/20 dark:border-red-800 p-3 text-sm text-red-700 dark:text-red-300">
            <AlertCircle className="size-4 shrink-0" />
            <span>
              <strong>{overdueItems.length}</strong> change
              {overdueItems.length > 1 ? "s are" : " is"} past the remove-by date
              and require immediate attention.
            </span>
          </div>
        )}

        {/* Summary stat cards */}
        <div className="flex flex-wrap gap-4 mb-7">
          <StatCard
            label="Active"
            value={totalActive}
            icon={Activity}
            colorClass="text-blue-600"
            loading={loadingStats}
          />
          <StatCard
            label="Overdue"
            value={totalOverdue}
            icon={AlertCircle}
            colorClass="text-red-600"
            loading={loadingStats}
          />
          <StatCard
            label="Expiring Soon"
            value={totalExpiringSoon}
            icon={Clock}
            colorClass="text-amber-600"
            loading={loadingStats}
          />
          <StatCard
            label="Public IPs"
            value={totalPublicIPs}
            icon={Globe}
            colorClass="text-orange-600"
            loading={loadingStats}
          />
        </div>

        {/* Tabbed views */}
        <Tabs defaultValue="all">
          <TabsList className="mb-4">
            <TabsTrigger value="all">All Changes</TabsTrigger>
            <TabsTrigger value="overdue">
              Overdue
              {totalOverdue > 0 && (
                <span className="ml-1.5 rounded-full bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300 px-1.5 py-0.5 text-xs font-semibold">
                  {totalOverdue}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="expiring">
              Expiring Soon
              {totalExpiringSoon > 0 && (
                <span className="ml-1.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300 px-1.5 py-0.5 text-xs font-semibold">
                  {totalExpiringSoon}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="public-ips">
              Public IPs
              {totalPublicIPs > 0 && (
                <span className="ml-1.5 rounded-full bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300 px-1.5 py-0.5 text-xs font-semibold">
                  {totalPublicIPs}
                </span>
              )}
            </TabsTrigger>
          </TabsList>

          {/* ── All Changes tab ────────────────────────────────────────────── */}
          <TabsContent value="all">
            <div className="rounded-xl border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[280px]">Title</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Risk</TableHead>
                    <TableHead>Owner</TableHead>
                    <TableHead>System</TableHead>
                    <TableHead>Remove By</TableHead>
                    <TableHead className="w-[80px]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loadingAll ? (
                    <SkeletonRows cols={8} />
                  ) : !allChanges?.length ? (
                    <TableRow>
                      <TableCell colSpan={8} className="p-0">
                        <EmptyState
                          icon={Shuffle}
                          title="No temporary changes"
                          description="Log a temporary change to start tracking infrastructure modifications that need rollback."
                        />
                      </TableCell>
                    </TableRow>
                  ) : (
                    (allChanges as TempChange[]).map((change) => (
                      <TableRow key={change.id}>
                        <TableCell>
                          <p className="font-medium leading-tight">{change.title}</p>
                          {change.systemName && (
                            <p className="text-xs text-muted-foreground mt-0.5">
                              {change.systemName}
                            </p>
                          )}
                        </TableCell>
                        <TableCell>
                          <CategoryBadge category={change.category} />
                        </TableCell>
                        <TableCell>
                          <StatusBadge status={change.status} />
                        </TableCell>
                        <TableCell>
                          <RiskBadge risk={change.riskLevel} />
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {change.owner?.user?.name ?? "—"}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {change.systemName ?? "—"}
                        </TableCell>
                        <TableCell>
                          {change.removeByDate ? (
                            <span
                              className={
                                change.status === "overdue"
                                  ? "text-red-600 font-medium text-sm"
                                  : "text-sm text-muted-foreground"
                              }
                            >
                              {safeFormatDate(change.removeByDate)}
                            </span>
                          ) : (
                            <span className="text-muted-foreground text-sm">—</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <ActionButtons
                            change={change}
                            onEdit={handleEdit}
                            onMarkRemoved={setRemovingChange}
                            onCancel={setCancellingChange}
                            onDelete={setDeletingChange}
                          />
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </TabsContent>

          {/* ── Overdue tab ────────────────────────────────────────────────── */}
          <TabsContent value="overdue">
            <div className="rounded-xl border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[300px]">Title</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Days Overdue</TableHead>
                    <TableHead>Owner</TableHead>
                    <TableHead>Remove By</TableHead>
                    <TableHead className="w-[80px]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loadingOverdue ? (
                    <SkeletonRows cols={6} />
                  ) : !overdueItems?.length ? (
                    <TableRow>
                      <TableCell colSpan={6} className="p-0">
                        <EmptyState
                          icon={CheckCircle2}
                          title="No overdue changes"
                          description="All temporary changes are within their scheduled removal dates."
                        />
                      </TableCell>
                    </TableRow>
                  ) : (
                    (overdueItems as TempChange[]).map((change) => {
                      const days = change.removeByDate
                        ? daysOverdue(change.removeByDate)
                        : 0;
                      return (
                        <TableRow key={change.id} className="bg-red-50/30 dark:bg-red-900/10">
                          <TableCell>
                            <p className="font-medium leading-tight">{change.title}</p>
                            {change.systemName && (
                              <p className="text-xs text-muted-foreground mt-0.5">
                                {change.systemName}
                              </p>
                            )}
                          </TableCell>
                          <TableCell>
                            <StatusBadge status="overdue" />
                          </TableCell>
                          <TableCell>
                            <span className="inline-flex items-center gap-1 text-red-600 font-semibold text-sm">
                              <AlertCircle className="size-3.5" />
                              {days} day{days !== 1 ? "s" : ""}
                            </span>
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {change.owner?.user?.name ?? "—"}
                          </TableCell>
                          <TableCell>
                            <span className="text-red-600 font-medium text-sm">
                              {safeFormatDate(change.removeByDate)}
                            </span>
                          </TableCell>
                          <TableCell>
                            <ActionButtons
                              change={change}
                              onEdit={handleEdit}
                              onMarkRemoved={setRemovingChange}
                              onCancel={setCancellingChange}
                              onDelete={setDeletingChange}
                            />
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>
          </TabsContent>

          {/* ── Expiring Soon tab ──────────────────────────────────────────── */}
          <TabsContent value="expiring">
            <div className="rounded-xl border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[300px]">Title</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Days Left</TableHead>
                    <TableHead>Owner</TableHead>
                    <TableHead>Remove By</TableHead>
                    <TableHead className="w-[80px]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loadingExpiring ? (
                    <SkeletonRows cols={6} />
                  ) : !expiringSoon?.length ? (
                    <TableRow>
                      <TableCell colSpan={6} className="p-0">
                        <EmptyState
                          icon={Clock}
                          title="Nothing expiring soon"
                          description="No temporary changes are due for removal in the next 7 days."
                        />
                      </TableCell>
                    </TableRow>
                  ) : (
                    (expiringSoon as TempChange[]).map((change) => {
                      const days = change.removeByDate
                        ? daysUntil(change.removeByDate)
                        : 0;
                      const urgency =
                        days <= 1
                          ? "text-red-600"
                          : days <= 3
                            ? "text-amber-600"
                            : "text-muted-foreground";
                      return (
                        <TableRow key={change.id}>
                          <TableCell>
                            <p className="font-medium leading-tight">{change.title}</p>
                            {change.systemName && (
                              <p className="text-xs text-muted-foreground mt-0.5">
                                {change.systemName}
                              </p>
                            )}
                          </TableCell>
                          <TableCell>
                            <StatusBadge status={change.status} />
                          </TableCell>
                          <TableCell>
                            <span
                              className={`inline-flex items-center gap-1 font-semibold text-sm ${urgency}`}
                            >
                              <Clock className="size-3.5" />
                              {days} day{days !== 1 ? "s" : ""}
                            </span>
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {change.owner?.user?.name ?? "—"}
                          </TableCell>
                          <TableCell className={`text-sm font-medium ${urgency}`}>
                            {safeFormatDate(change.removeByDate)}
                          </TableCell>
                          <TableCell>
                            <ActionButtons
                              change={change}
                              onEdit={handleEdit}
                              onMarkRemoved={setRemovingChange}
                              onCancel={setCancellingChange}
                              onDelete={setDeletingChange}
                            />
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>
          </TabsContent>

          {/* ── Public IPs tab ────────────────────────────────────────────── */}
          <TabsContent value="public-ips">
            <div className="rounded-xl border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[220px]">Title</TableHead>
                    <TableHead>Public IP</TableHead>
                    <TableHead>Port</TableHead>
                    <TableHead>Protocol</TableHead>
                    <TableHead>Risk</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Owner</TableHead>
                    <TableHead>Remove By</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loadingPublicIPs ? (
                    <SkeletonRows cols={8} />
                  ) : !publicIPs?.length ? (
                    <TableRow>
                      <TableCell colSpan={8} className="p-0">
                        <EmptyState
                          icon={Network}
                          title="No public IP exposures"
                          description="No active temporary changes have associated public IP addresses."
                        />
                      </TableCell>
                    </TableRow>
                  ) : (
                    (publicIPs as TempChange[]).map((change) => (
                      <TableRow key={change.id}>
                        <TableCell>
                          <p className="font-medium leading-tight">{change.title}</p>
                          {change.systemName && (
                            <p className="text-xs text-muted-foreground mt-0.5">
                              {change.systemName}
                            </p>
                          )}
                        </TableCell>
                        <TableCell>
                          <code className="rounded-lg bg-muted px-1.5 py-0.5 text-xs font-mono">
                            {change.publicIp ?? "—"}
                          </code>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {change.port ?? "—"}
                        </TableCell>
                        <TableCell>
                          {change.protocol ? (
                            <span className="uppercase text-xs font-mono font-medium">
                              {change.protocol}
                            </span>
                          ) : (
                            <span className="text-muted-foreground text-sm">—</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <RiskBadge risk={change.riskLevel} />
                        </TableCell>
                        <TableCell>
                          <StatusBadge status={change.status} />
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {change.owner?.user?.name ?? "—"}
                        </TableCell>
                        <TableCell>
                          {change.removeByDate ? (
                            <span
                              className={
                                change.status === "overdue"
                                  ? "text-red-600 font-medium text-sm"
                                  : "text-sm text-muted-foreground"
                              }
                            >
                              {safeFormatDate(change.removeByDate)}
                            </span>
                          ) : (
                            <span className="text-muted-foreground text-sm">—</span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </TabsContent>
        </Tabs>
      </Main>

      {/* Create / Edit Dialog — keyed + conditionally mounted so the form
          state re-initialises from `editChange` every time it opens (the
          lazy useState initialiser only runs on mount). */}
      {formOpen && (
        <ChangeFormDialog
          key={editChange?.id ?? "new"}
          open={formOpen}
          onClose={handleFormClose}
          editChange={editChange}
          onSuccess={handleFormClose}
        />
      )}

      {/* Mark Removed confirm dialog */}
      <MarkRemovedDialog
        change={removingChange}
        open={!!removingChange}
        onClose={() => setRemovingChange(null)}
        onConfirm={handleMarkRemoved}
        isPending={markRemovedMut.isPending}
      />

      {/* Cancel confirm dialog */}
      <Dialog
        open={!!cancellingChange}
        onOpenChange={(open) => !open && setCancellingChange(null)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Cancel Temporary Change</DialogTitle>
            <DialogDescription>
              This marks{" "}
              <span className="font-medium text-foreground">
                {cancellingChange?.title}
              </span>{" "}
              as <strong>Cancelled</strong>. The record is preserved for audit
              and remains listed in the All Changes register.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setCancellingChange(null)}
              disabled={cancelMut.isPending}
            >
              Keep change
            </Button>
            <Button
              onClick={() =>
                cancellingChange &&
                cancelMut.mutate({ id: cancellingChange.id })
              }
              disabled={cancelMut.isPending}
            >
              {cancelMut.isPending ? "Cancelling…" : "Cancel change"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Hard delete confirm dialog (drafts only) */}
      <Dialog
        open={!!deletingChange}
        onOpenChange={(open) => !open && setDeletingChange(null)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete Draft Change</DialogTitle>
            <DialogDescription>
              This permanently deletes{" "}
              <span className="font-medium text-foreground">
                {deletingChange?.title}
              </span>
              . Only planned (draft) changes can be deleted — this cannot be
              undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeletingChange(null)}
              disabled={deleteMut.isPending}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() =>
                deletingChange && deleteMut.mutate({ id: deletingChange.id })
              }
              disabled={deleteMut.isPending}
            >
              {deleteMut.isPending ? "Deleting…" : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
