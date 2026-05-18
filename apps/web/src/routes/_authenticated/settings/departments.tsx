import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Building2, Plus, Pencil, PowerOff } from "lucide-react";
import { requireResource } from "@/lib/route-guard";
import { toast } from "sonner";
import { Skeleton } from "@ndma-dcs-staff-portal/ui/components/skeleton";
import { Button } from "@ndma-dcs-staff-portal/ui/components/button";
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
import { Input } from "@ndma-dcs-staff-portal/ui/components/input";
import { Label } from "@ndma-dcs-staff-portal/ui/components/label";
import { Textarea } from "@ndma-dcs-staff-portal/ui/components/textarea";
import { Header } from "@/components/layout/header";
import { Main } from "@/components/layout/main";
import { ThemeSwitch } from "@/components/theme-switch";
import { authClient } from "@/lib/auth-client";
import { orpc } from "@/utils/orpc";

export const Route = createFileRoute("/_authenticated/settings/departments")({
  beforeLoad: ({ context }) => requireResource(context, "settings"),
  component: DepartmentsSettingsPage,
});

type Dept = {
  id: string;
  name: string;
  code: string;
  description: string | null;
  isActive: boolean;
  parentId: string | null;
  parent?: { id: string; name: string } | null;
  children?: { id: string; name: string }[];
};

function DepartmentsSettingsPage() {
  const { data: session } = authClient.useSession();
  const userRole = (session?.user as Record<string, unknown> | undefined)?.role as string | undefined;
  const canEdit = !!userRole && ["admin", "hrAdminOps"].includes(userRole);

  const qc = useQueryClient();
  const { data, isLoading } = useQuery(orpc.departments.list.queryOptions());

  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Dept | null>(null);
  const [deactivateTarget, setDeactivateTarget] = useState<Dept | null>(null);

  const createMutation = useMutation(
    orpc.departments.create.mutationOptions({
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: orpc.departments.list.key() });
        toast.success("Department created");
        setCreateOpen(false);
      },
      onError: (e: Error) => toast.error(e.message),
    }),
  );

  const updateMutation = useMutation(
    orpc.departments.update.mutationOptions({
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: orpc.departments.list.key() });
        toast.success("Department updated");
        setEditTarget(null);
      },
      onError: (e: Error) => toast.error(e.message),
    }),
  );

  const deactivateMutation = useMutation(
    orpc.departments.deactivate.mutationOptions({
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: orpc.departments.list.key() });
        toast.success("Department deactivated");
        setDeactivateTarget(null);
      },
      onError: (e: Error) => toast.error(e.message),
    }),
  );

  const depts = (data ?? []) as Dept[];

  return (
    <>
      <Header fixed>
        <div className="flex items-center gap-2">
          <Building2 className="size-4 text-muted-foreground" />
          <span className="text-sm font-medium">Departments</span>
        </div>
        <div className="ms-auto flex items-center gap-2">
          <ThemeSwitch />
        </div>
      </Header>

      <Main>
        <div className="mb-6 flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Departments</h1>
            <p className="text-sm text-muted-foreground mt-1">
              DCS department structure — used for on-call eligibility and staff grouping.
            </p>
          </div>
          {canEdit && (
            <Button size="sm" onClick={() => setCreateOpen(true)}>
              <Plus className="size-4 mr-1" />
              Add Department
            </Button>
          )}
        </div>

        <div className="overflow-x-auto rounded-xl border max-w-3xl">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Code</TableHead>
                <TableHead>Parent</TableHead>
                <TableHead>Status</TableHead>
                {canEdit && <TableHead className="w-20">Actions</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading
                ? Array.from({ length: 4 }).map((_, i) => (
                    <TableRow key={i}>
                      {Array.from({ length: canEdit ? 5 : 4 }).map((_, j) => (
                        <TableCell key={j}>
                          <Skeleton className="h-4 w-full" />
                        </TableCell>
                      ))}
                    </TableRow>
                  ))
                : !depts.length
                  ? (
                    <TableRow>
                      <TableCell colSpan={canEdit ? 5 : 4} className="py-8 text-center text-muted-foreground">
                        No departments found.
                      </TableCell>
                    </TableRow>
                  )
                  : depts.map((dept) => (
                    <TableRow key={dept.id} className={!dept.isActive ? "opacity-50" : ""}>
                      <TableCell className="font-medium">{dept.name}</TableCell>
                      <TableCell className="font-mono text-sm text-muted-foreground">
                        {dept.code}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {dept.parent?.name ?? <span className="italic text-muted-foreground/60">Top-level</span>}
                      </TableCell>
                      <TableCell>
                        <span
                          className={`inline-flex items-center rounded-lg px-2 py-0.5 text-xs font-medium ${
                            dept.isActive
                              ? "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300"
                              : "bg-muted text-muted-foreground"
                          }`}
                        >
                          {dept.isActive ? "Active" : "Inactive"}
                        </span>
                      </TableCell>
                      {canEdit && (
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="size-7"
                              onClick={() => setEditTarget(dept)}
                            >
                              <Pencil className="size-3.5" />
                            </Button>
                            {dept.isActive && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="size-7 text-destructive hover:text-destructive"
                                disabled={deactivateMutation.isPending}
                                onClick={() => setDeactivateTarget(dept)}
                              >
                                <PowerOff className="size-3.5" />
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
            </TableBody>
          </Table>
        </div>
      </Main>

      <DeptDialog
        open={createOpen}
        title="Add Department"
        departments={depts}
        onClose={() => setCreateOpen(false)}
        onSubmit={(values) => createMutation.mutate(values)}
        isLoading={createMutation.isPending}
      />

      {editTarget && (
        <DeptDialog
          open
          title="Edit Department"
          departments={depts.filter((d) => d.id !== editTarget.id)}
          initial={editTarget}
          onClose={() => setEditTarget(null)}
          onSubmit={(values) =>
            updateMutation.mutate({ id: editTarget.id, ...values })
          }
          isLoading={updateMutation.isPending}
        />
      )}

      <Dialog
        open={deactivateTarget !== null}
        onOpenChange={(o) => { if (!o) setDeactivateTarget(null); }}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Deactivate Department</DialogTitle>
            <DialogDescription>
              Deactivate{" "}
              <span className="font-medium text-foreground">
                {deactivateTarget?.name}
              </span>
              ? Staff currently assigned to it will remain, but new assignments
              will be blocked.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => setDeactivateTarget(null)}
              disabled={deactivateMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={deactivateMutation.isPending}
              onClick={() => {
                if (deactivateTarget) deactivateMutation.mutate({ id: deactivateTarget.id });
              }}
            >
              {deactivateMutation.isPending ? "Deactivating…" : "Deactivate"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

type DeptDialogProps = {
  open: boolean;
  title: string;
  departments: Dept[];
  initial?: Dept | null;
  onClose: () => void;
  onSubmit: (v: { name: string; code: string; description?: string; parentId?: string }) => void;
  isLoading: boolean;
};

function DeptDialog({ open, title, departments, initial, onClose, onSubmit, isLoading }: DeptDialogProps) {
  const [name, setName] = useState(initial?.name ?? "");
  const [code, setCode] = useState(initial?.code ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [parentId, setParentId] = useState(initial?.parentId ?? "");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({
      name: name.trim(),
      code: code.trim().toUpperCase(),
      description: description.trim() || undefined,
      parentId: parentId || undefined,
    });
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 pt-2">
          <div className="space-y-1.5">
            <Label htmlFor="dept-name">Name</Label>
            <Input
              id="dept-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Core Network"
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="dept-code">Code</Label>
            <Input
              id="dept-code"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="e.g. CORE"
              maxLength={20}
              required
              disabled={!!initial}
            />
            {!!initial && (
              <p className="text-xs text-muted-foreground">Department code cannot be changed after creation.</p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="dept-parent">Parent Department</Label>
            <select
              id="dept-parent"
              value={parentId}
              onChange={(e) => setParentId(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="">None (top-level)</option>
              {departments.filter((d) => d.isActive).map((d) => (
                <option key={d.id} value={d.id}>{d.name} ({d.code})</option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="dept-desc">Description</Label>
            <Textarea
              id="dept-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              placeholder="Brief description of this department's role"
            />
          </div>
          <DialogFooter className="pt-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={isLoading || !name.trim() || !code.trim()}>
              {isLoading ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
