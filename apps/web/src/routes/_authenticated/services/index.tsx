import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Server, Plus, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Skeleton } from "@ndma-dcs-staff-portal/ui/components/skeleton";
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
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@ndma-dcs-staff-portal/ui/components/dialog";
import { Button } from "@ndma-dcs-staff-portal/ui/components/button";
import { Input } from "@ndma-dcs-staff-portal/ui/components/input";
import { Label } from "@ndma-dcs-staff-portal/ui/components/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@ndma-dcs-staff-portal/ui/components/select";
import { Header } from "@/components/layout/header";
import { Main } from "@/components/layout/main";
import { ThemeSwitch } from "@/components/theme-switch";
import { orpc } from "@/utils/orpc";

export const Route = createFileRoute("/_authenticated/services/")({
  component: ServiceRegistryPage,
});

// ─── Types ────────────────────────────────────────────────────────────────────

type ServiceStatus = "active" | "degraded" | "outage" | "maintenance";

interface ServiceFormValues {
  name: string;
  description: string;
  status: ServiceStatus;
  runbookUrl: string;
  docsUrl: string;
}

interface ServiceRow {
  id: string;
  name: string;
  description: string | null;
  isActive: boolean;
  runbookUrl: string | null;
  docsUrl: string | null;
  department: { name: string } | null;
  owner: { user: { name: string } | null } | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const STATUS_CLASSES: Record<ServiceStatus, string> = {
  active: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  degraded: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  outage: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
  maintenance: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
};

function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`inline-flex items-center rounded-lg px-2 py-0.5 text-xs font-medium capitalize ${
        STATUS_CLASSES[status as ServiceStatus] ?? "bg-muted text-muted-foreground"
      }`}
    >
      {status}
    </span>
  );
}

const EMPTY_FORM: ServiceFormValues = {
  name: "",
  description: "",
  status: "active",
  runbookUrl: "",
  docsUrl: "",
};

// ─── Service Form Dialog ───────────────────────────────────────────────────────

interface ServiceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "create" | "edit";
  initialValues?: ServiceFormValues;
  onSubmit: (values: ServiceFormValues) => Promise<void>;
  isSubmitting: boolean;
}

function ServiceDialog({
  open,
  onOpenChange,
  mode,
  initialValues = EMPTY_FORM,
  onSubmit,
  isSubmitting,
}: ServiceDialogProps) {
  const [values, setValues] = useState<ServiceFormValues>(initialValues);

  // Sync initialValues when dialog opens (for edit mode)
  const handleOpenChange = (nextOpen: boolean) => {
    if (nextOpen) setValues(initialValues);
    onOpenChange(nextOpen);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onSubmit(values);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {mode === "create" ? "Register New Service" : "Edit Service"}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Name */}
          <div className="space-y-1.5">
            <Label htmlFor="svc-name">
              Name <span className="text-destructive">*</span>
            </Label>
            <Input
              id="svc-name"
              value={values.name}
              onChange={(e) => setValues((v) => ({ ...v, name: e.target.value }))}
              placeholder="e.g. Authentication API"
              required
              maxLength={100}
            />
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <Label htmlFor="svc-desc">Description</Label>
            <textarea
              id="svc-desc"
              value={values.description}
              onChange={(e) => setValues((v) => ({ ...v, description: e.target.value }))}
              placeholder="Brief description of this service…"
              rows={3}
              className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 resize-none"
            />
          </div>

          {/* Status */}
          <div className="space-y-1.5">
            <Label htmlFor="svc-status">Status</Label>
            <Select
              value={values.status}
              onValueChange={(val) =>
                setValues((v) => ({ ...v, status: val as ServiceStatus }))
              }
            >
              <SelectTrigger id="svc-status">
                <SelectValue placeholder="Select status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="degraded">Degraded</SelectItem>
                <SelectItem value="outage">Outage</SelectItem>
                <SelectItem value="maintenance">Maintenance</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Runbook URL */}
          <div className="space-y-1.5">
            <Label htmlFor="svc-runbook">Runbook URL</Label>
            <Input
              id="svc-runbook"
              type="url"
              value={values.runbookUrl}
              onChange={(e) =>
                setValues((v) => ({ ...v, runbookUrl: e.target.value }))
              }
              placeholder="https://wiki.example.com/runbooks/…"
            />
          </div>

          {/* Docs URL */}
          <div className="space-y-1.5">
            <Label htmlFor="svc-docs">Docs URL</Label>
            <Input
              id="svc-docs"
              type="url"
              value={values.docsUrl}
              onChange={(e) =>
                setValues((v) => ({ ...v, docsUrl: e.target.value }))
              }
              placeholder="https://docs.example.com/…"
            />
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting || !values.name.trim()}>
              {isSubmitting
                ? mode === "create"
                  ? "Creating…"
                  : "Saving…"
                : mode === "create"
                ? "Create Service"
                : "Save Changes"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Delete Confirmation Dialog ────────────────────────────────────────────────

interface DeleteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  serviceName: string;
  onConfirm: () => Promise<void>;
  isDeleting: boolean;
}

function DeleteConfirmDialog({
  open,
  onOpenChange,
  serviceName,
  onConfirm,
  isDeleting,
}: DeleteDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Deactivate Service</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Are you sure you want to deactivate{" "}
          <span className="font-semibold text-foreground">{serviceName}</span>? It will
          be hidden from the registry but not permanently deleted.
        </p>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isDeleting}
          >
            Cancel
          </Button>
          <Button variant="destructive" onClick={onConfirm} disabled={isDeleting}>
            {isDeleting ? "Deactivating…" : "Deactivate"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

function ServiceRegistryPage() {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery(orpc.services.list.queryOptions());

  // Create dialog state
  const [createOpen, setCreateOpen] = useState(false);

  // Edit dialog state
  const [editOpen, setEditOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<ServiceRow | null>(null);

  // Delete dialog state
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ServiceRow | null>(null);

  // ── Mutations ──────────────────────────────────────────────────────────────

  const createMutation = useMutation(orpc.services.create.mutationOptions());
  const updateMutation = useMutation(orpc.services.update.mutationOptions());

  const invalidateList = () =>
    queryClient.invalidateQueries({ queryKey: orpc.services.list.key() });

  // ── Handlers ───────────────────────────────────────────────────────────────

  const handleCreate = async (values: ServiceFormValues) => {
    try {
      await createMutation.mutateAsync({
        name: values.name.trim(),
        description: values.description.trim() || undefined,
        runbookUrl: values.runbookUrl.trim() || undefined,
        docsUrl: values.docsUrl.trim() || undefined,
      });
      toast.success("Service registered successfully.");
      await invalidateList();
      setCreateOpen(false);
    } catch {
      toast.error("Failed to create service. Please try again.");
    }
  };

  const handleEdit = async (values: ServiceFormValues) => {
    if (!editTarget) return;
    try {
      await updateMutation.mutateAsync({
        id: editTarget.id,
        name: values.name.trim(),
        description: values.description.trim() || undefined,
        runbookUrl: values.runbookUrl.trim() || undefined,
        docsUrl: values.docsUrl.trim() || undefined,
        isActive: values.status !== "outage" ? true : undefined,
      });
      toast.success("Service updated successfully.");
      await invalidateList();
      setEditOpen(false);
      setEditTarget(null);
    } catch {
      toast.error("Failed to update service. Please try again.");
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await updateMutation.mutateAsync({
        id: deleteTarget.id,
        isActive: false,
      });
      toast.success(`"${deleteTarget.name}" has been deactivated.`);
      await invalidateList();
      setDeleteOpen(false);
      setDeleteTarget(null);
    } catch {
      toast.error("Failed to deactivate service. Please try again.");
    }
  };

  const openEdit = (svc: ServiceRow) => {
    setEditTarget(svc);
    setEditOpen(true);
  };

  const openDelete = (svc: ServiceRow) => {
    setDeleteTarget(svc);
    setDeleteOpen(true);
  };

  // Build initial values for edit form from service row
  const editInitialValues: ServiceFormValues = editTarget
    ? {
        name: editTarget.name,
        description: editTarget.description ?? "",
        status: editTarget.isActive ? "active" : "maintenance",
        runbookUrl: editTarget.runbookUrl ?? "",
        docsUrl: editTarget.docsUrl ?? "",
      }
    : EMPTY_FORM;

  return (
    <>
      <Header fixed>
        <div className="flex items-center gap-2">
          <Server className="size-4 text-muted-foreground" />
          <span className="text-sm font-medium">Service Registry</span>
        </div>
        <div className="ms-auto flex items-center gap-2">
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="size-4 mr-1" />
            New Service
          </Button>
          <ThemeSwitch />
        </div>
      </Header>

      <Main>
        <div className="mb-6">
          <h1 className="text-2xl font-bold tracking-tight">Service Registry</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Managed services, ownership, and incident associations.
          </p>
        </div>

        {data && (
          <div className="mb-4 flex flex-wrap gap-4 text-sm">
            <span className="text-muted-foreground">
              <strong className="text-foreground">{data.length}</strong> total
            </span>
            <span className="text-blue-600">
              <strong>{data.filter((s) => s.isActive).length}</strong> active
            </span>
          </div>
        )}

        <div className="rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Service</TableHead>
                <TableHead>Department</TableHead>
                <TableHead>Owner</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-20 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 5 }).map((_, j) => (
                      <TableCell key={j}>
                        <Skeleton className="h-4 w-full" />
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : !data?.length ? (
                <TableRow>
                  <TableCell
                    colSpan={5}
                    className="py-12 text-center text-muted-foreground"
                  >
                    No services registered yet.{" "}
                    <button
                      onClick={() => setCreateOpen(true)}
                      className="underline hover:text-foreground transition-colors"
                    >
                      Register the first service.
                    </button>
                  </TableCell>
                </TableRow>
              ) : (
                data.map((svc) => (
                  <TableRow key={svc.id}>
                    <TableCell>
                      <p className="font-medium">{svc.name}</p>
                      {svc.description && (
                        <p className="text-xs text-muted-foreground truncate max-w-xs mt-0.5">
                          {svc.description}
                        </p>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {svc.department?.name ?? "—"}
                    </TableCell>
                    <TableCell className="text-sm">
                      {svc.owner?.user?.name ?? "—"}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={svc.isActive ? "active" : "maintenance"} />
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-8"
                          title="Edit service"
                          onClick={() => openEdit(svc as ServiceRow)}
                        >
                          <Pencil className="size-3.5" />
                          <span className="sr-only">Edit</span>
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                          title="Deactivate service"
                          onClick={() => openDelete(svc as ServiceRow)}
                        >
                          <Trash2 className="size-3.5" />
                          <span className="sr-only">Deactivate</span>
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </Main>

      {/* Create Dialog */}
      <ServiceDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        mode="create"
        initialValues={EMPTY_FORM}
        onSubmit={handleCreate}
        isSubmitting={createMutation.isPending}
      />

      {/* Edit Dialog */}
      {editTarget && (
        <ServiceDialog
          open={editOpen}
          onOpenChange={(open) => {
            setEditOpen(open);
            if (!open) setEditTarget(null);
          }}
          mode="edit"
          initialValues={editInitialValues}
          onSubmit={handleEdit}
          isSubmitting={updateMutation.isPending}
        />
      )}

      {/* Delete Confirmation Dialog */}
      {deleteTarget && (
        <DeleteConfirmDialog
          open={deleteOpen}
          onOpenChange={(open) => {
            setDeleteOpen(open);
            if (!open) setDeleteTarget(null);
          }}
          serviceName={deleteTarget.name}
          onConfirm={handleDelete}
          isDeleting={updateMutation.isPending}
        />
      )}
    </>
  );
}
