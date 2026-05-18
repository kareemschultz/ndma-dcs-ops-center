import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { CalendarOff, Plus, Pencil, Archive } from "lucide-react";
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
import { Switch } from "@ndma-dcs-staff-portal/ui/components/switch";
import { Header } from "@/components/layout/header";
import { Main } from "@/components/layout/main";
import { ThemeSwitch } from "@/components/theme-switch";
import { authClient } from "@/lib/auth-client";
import { orpc } from "@/utils/orpc";

export const Route = createFileRoute("/_authenticated/settings/leave-types")({
  beforeLoad: ({ context }) => requireResource(context, "settings"),
  component: LeaveTypesSettingsPage,
});

type LeaveType = {
  id: string;
  name: string;
  code: string;
  defaultAnnualAllowance: number;
  requiresApproval: boolean;
  allowsCarryOver: boolean;
  isActive: boolean;
};

function LeaveTypesSettingsPage() {
  const { data: session } = authClient.useSession();
  const userRole = (session?.user as Record<string, unknown> | undefined)
    ?.role as string | undefined;
  const canEdit = !!userRole && ["admin", "hrAdminOps"].includes(userRole);

  const qc = useQueryClient();
  const { data, isLoading } = useQuery(orpc.leave.types.list.queryOptions());

  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<LeaveType | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<LeaveType | null>(null);

  const invalidate = () =>
    qc.invalidateQueries({ queryKey: orpc.leave.types.list.key() });

  const createMutation = useMutation(
    orpc.leave.types.create.mutationOptions({
      onSuccess: () => {
        invalidate();
        toast.success("Leave type created");
        setCreateOpen(false);
      },
      onError: (e: Error) => toast.error(e.message),
    }),
  );

  const updateMutation = useMutation(
    orpc.leave.types.update.mutationOptions({
      onSuccess: () => {
        invalidate();
        toast.success("Leave type updated");
        setEditTarget(null);
      },
      onError: (e: Error) => toast.error(e.message),
    }),
  );

  const deleteMutation = useMutation(
    orpc.leave.types.delete.mutationOptions({
      onSuccess: () => {
        invalidate();
        toast.success("Leave type archived");
        setArchiveTarget(null);
      },
      onError: (e: Error) => toast.error(e.message),
    }),
  );

  const types = (data ?? []) as LeaveType[];

  return (
    <>
      <Header fixed>
        <div className="flex items-center gap-2">
          <CalendarOff className="size-4 text-muted-foreground" />
          <span className="text-sm font-medium">Leave Types</span>
        </div>
        <div className="ms-auto flex items-center gap-2">
          <ThemeSwitch />
        </div>
      </Header>

      <Main>
        <div className="mb-6 flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Leave Types</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Configure leave categories, annual allowances, approval
              requirements, and whether unused days carry over.
            </p>
          </div>
          {canEdit && (
            <Button size="sm" onClick={() => setCreateOpen(true)}>
              <Plus className="size-4 mr-1" />
              Add Leave Type
            </Button>
          )}
        </div>

        <div className="overflow-x-auto rounded-xl border max-w-3xl">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Code</TableHead>
                <TableHead>Annual Allowance</TableHead>
                <TableHead>Requires Approval</TableHead>
                <TableHead>Carry Over</TableHead>
                {canEdit && <TableHead className="w-20">Actions</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: canEdit ? 6 : 5 }).map((_, j) => (
                      <TableCell key={j}>
                        <Skeleton className="h-4 w-full" />
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : !types.length ? (
                <TableRow>
                  <TableCell
                    colSpan={canEdit ? 6 : 5}
                    className="py-8 text-center text-muted-foreground"
                  >
                    No leave types configured.
                  </TableCell>
                </TableRow>
              ) : (
                types.map((type) => (
                  <TableRow key={type.id}>
                    <TableCell className="font-medium">{type.name}</TableCell>
                    <TableCell className="font-mono text-sm text-muted-foreground">
                      {type.code}
                    </TableCell>
                    <TableCell className="text-sm">
                      {type.defaultAnnualAllowance} days/year
                    </TableCell>
                    <TableCell>
                      <span
                        className={`inline-flex items-center rounded-lg px-2 py-0.5 text-xs font-medium ${
                          type.requiresApproval
                            ? "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300"
                            : "bg-muted text-muted-foreground"
                        }`}
                      >
                        {type.requiresApproval
                          ? "Requires Approval"
                          : "Auto-Approved"}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span
                        className={`inline-flex items-center rounded-lg px-2 py-0.5 text-xs font-medium ${
                          type.allowsCarryOver
                            ? "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300"
                            : "bg-muted text-muted-foreground"
                        }`}
                      >
                        {type.allowsCarryOver ? "Carries Over" : "Expires"}
                      </span>
                    </TableCell>
                    {canEdit && (
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-7"
                            onClick={() => setEditTarget(type)}
                          >
                            <Pencil className="size-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-7 text-destructive hover:text-destructive"
                            disabled={deleteMutation.isPending}
                            onClick={() => setArchiveTarget(type)}
                          >
                            <Archive className="size-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </Main>

      <LeaveTypeDialog
        open={createOpen}
        title="Add Leave Type"
        onClose={() => setCreateOpen(false)}
        onSubmit={(values) => createMutation.mutate(values)}
        isLoading={createMutation.isPending}
      />

      {editTarget && (
        <LeaveTypeDialog
          open
          title="Edit Leave Type"
          initial={editTarget}
          onClose={() => setEditTarget(null)}
          onSubmit={(values) =>
            updateMutation.mutate({
              id: editTarget.id,
              name: values.name,
              defaultAnnualAllowance: values.defaultAnnualAllowance,
              requiresApproval: values.requiresApproval,
              allowsCarryOver: values.allowsCarryOver,
            })
          }
          isLoading={updateMutation.isPending}
        />
      )}

      <Dialog
        open={archiveTarget !== null}
        onOpenChange={(o) => {
          if (!o) setArchiveTarget(null);
        }}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Archive Leave Type</DialogTitle>
            <DialogDescription>
              Archive{" "}
              <span className="font-medium text-foreground">
                {archiveTarget?.name}
              </span>
              ? It will no longer be selectable for new leave requests. Existing
              balances and requests are preserved.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => setArchiveTarget(null)}
              disabled={deleteMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={deleteMutation.isPending}
              onClick={() => {
                if (archiveTarget)
                  deleteMutation.mutate({ id: archiveTarget.id });
              }}
            >
              {deleteMutation.isPending ? "Archiving…" : "Archive"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

type LeaveTypeFormValues = {
  name: string;
  code: string;
  defaultAnnualAllowance: number;
  requiresApproval: boolean;
  allowsCarryOver: boolean;
};

type LeaveTypeDialogProps = {
  open: boolean;
  title: string;
  initial?: LeaveType | null;
  onClose: () => void;
  onSubmit: (v: LeaveTypeFormValues) => void;
  isLoading: boolean;
};

function LeaveTypeDialog({
  open,
  title,
  initial,
  onClose,
  onSubmit,
  isLoading,
}: LeaveTypeDialogProps) {
  const [name, setName] = useState(initial?.name ?? "");
  const [code, setCode] = useState(initial?.code ?? "");
  const [allowance, setAllowance] = useState(
    String(initial?.defaultAnnualAllowance ?? 20),
  );
  const [requiresApproval, setRequiresApproval] = useState(
    initial?.requiresApproval ?? true,
  );
  const [allowsCarryOver, setAllowsCarryOver] = useState(
    initial?.allowsCarryOver ?? false,
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({
      name: name.trim(),
      code: code.trim().toUpperCase(),
      defaultAnnualAllowance: Number(allowance) || 0,
      requiresApproval,
      allowsCarryOver,
    });
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            Define a leave category, its default annual allowance, and whether
            unused days carry over to the next contract year.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 pt-2">
          <div className="space-y-1.5">
            <Label htmlFor="lt-name">Name</Label>
            <Input
              id="lt-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Annual Leave"
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="lt-code">Code</Label>
            <Input
              id="lt-code"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="e.g. AL"
              maxLength={10}
              required
              disabled={!!initial}
            />
            {!!initial && (
              <p className="text-xs text-muted-foreground">
                Leave type code cannot be changed after creation.
              </p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="lt-allowance">Default Annual Allowance</Label>
            <Input
              id="lt-allowance"
              type="number"
              min={0}
              value={allowance}
              onChange={(e) => setAllowance(e.target.value)}
              placeholder="e.g. 28"
              required
            />
            <p className="text-xs text-muted-foreground">
              Default number of days granted per contract year.
            </p>
          </div>
          <div className="flex items-start justify-between gap-4 rounded-lg border p-3">
            <div className="space-y-0.5">
              <Label htmlFor="lt-approval">Requires approval</Label>
              <p className="text-xs text-muted-foreground">
                Off: requests of this type are auto-approved.
              </p>
            </div>
            <Switch
              id="lt-approval"
              checked={requiresApproval}
              onCheckedChange={setRequiresApproval}
            />
          </div>
          <div className="flex items-start justify-between gap-4 rounded-lg border p-3">
            <div className="space-y-0.5">
              <Label htmlFor="lt-carryover">Carries over to next year</Label>
              <p className="text-xs text-muted-foreground">
                Off (recommended for NDMA): unused leave of this type expires at
                the end of the contract year.
              </p>
            </div>
            <Switch
              id="lt-carryover"
              checked={allowsCarryOver}
              onCheckedChange={setAllowsCarryOver}
            />
          </div>
          <DialogFooter className="pt-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isLoading || !name.trim() || !code.trim()}
            >
              {isLoading ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
