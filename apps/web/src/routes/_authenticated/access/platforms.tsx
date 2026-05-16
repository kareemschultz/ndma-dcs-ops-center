import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plug, Plus, Pencil, Ban } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@ndma-dcs-staff-portal/ui/components/button";
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
  DialogDescription,
} from "@ndma-dcs-staff-portal/ui/components/dialog";
import { Label } from "@ndma-dcs-staff-portal/ui/components/label";
import { Input } from "@ndma-dcs-staff-portal/ui/components/input";
import { Textarea } from "@ndma-dcs-staff-portal/ui/components/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@ndma-dcs-staff-portal/ui/components/select";
import { AccessSubNav } from "@/components/layout/access-sub-nav";
import { Header } from "@/components/layout/header";
import { Main } from "@/components/layout/main";
import { ThemeSwitch } from "@/components/theme-switch";
import { orpc } from "@/utils/orpc";

export const Route = createFileRoute("/_authenticated/access/platforms")({
  component: PlatformsPage,
});

const CATEGORIES = ["monitoring", "vpn", "portal", "identity", "access_control", "other"] as const;
const AUTH_TYPES = ["local", "ad_ldap", "saml", "oauth", "hybrid", "unknown"] as const;
const SYNC_MODES = ["manual_only", "api_full", "api_partial", "api_read_only"] as const;

type Category = (typeof CATEGORIES)[number];
type AuthType = (typeof AUTH_TYPES)[number];
type SyncMode = (typeof SYNC_MODES)[number];

const CATEGORY_COLORS: Record<Category, string> = {
  monitoring: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200",
  vpn: "bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-200",
  portal: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200",
  identity: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200",
  access_control: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200",
  other: "bg-muted text-muted-foreground",
};

interface PlatformFormState {
  id?: string;
  name: string;
  category: Category;
  authType: AuthType;
  syncMode: SyncMode;
  notes: string;
}

const EMPTY_FORM: PlatformFormState = {
  name: "",
  category: "other",
  authType: "unknown",
  syncMode: "manual_only",
  notes: "",
};

function PlatformsPage() {
  const qc = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<PlatformFormState>(EMPTY_FORM);

  const { data: platforms, isLoading } = useQuery(orpc.platforms.list.queryOptions());

  const createMutation = useMutation(
    orpc.platforms.create.mutationOptions({
      onSuccess: () => {
        toast.success("Platform created");
        qc.invalidateQueries({ queryKey: orpc.platforms.list.key() });
        setDialogOpen(false);
        setForm(EMPTY_FORM);
      },
      onError: (e) => toast.error(`Create failed: ${e.message}`),
    }),
  );

  const updateMutation = useMutation(
    orpc.platforms.update.mutationOptions({
      onSuccess: () => {
        toast.success("Platform updated");
        qc.invalidateQueries({ queryKey: orpc.platforms.list.key() });
        setDialogOpen(false);
        setForm(EMPTY_FORM);
      },
      onError: (e) => toast.error(`Update failed: ${e.message}`),
    }),
  );

  const disableMutation = useMutation(
    orpc.platforms.disable.mutationOptions({
      onSuccess: () => {
        toast.success("Platform disabled");
        qc.invalidateQueries({ queryKey: orpc.platforms.list.key() });
      },
      onError: (e) => toast.error(`Disable failed: ${e.message}`),
    }),
  );

  function openCreate() {
    setForm(EMPTY_FORM);
    setDialogOpen(true);
  }

  function openEdit(p: NonNullable<typeof platforms>[number]) {
    setForm({
      id: p.id,
      name: p.name,
      category: (p.category ?? "other") as Category,
      authType: (p.authType ?? "unknown") as AuthType,
      syncMode: (p.syncMode ?? "manual_only") as SyncMode,
      notes: p.notes ?? "",
    });
    setDialogOpen(true);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const payload = {
      name: form.name.trim(),
      category: form.category,
      authType: form.authType,
      syncMode: form.syncMode,
      notes: form.notes.trim() || null,
    };
    if (!payload.name) {
      toast.error("Name is required");
      return;
    }
    if (form.id) {
      updateMutation.mutate({ id: form.id, ...payload });
    } else {
      createMutation.mutate(payload);
    }
  }

  return (
    <>
      <Header>
        <div className="flex items-center gap-2">
          <Plug className="h-5 w-5" />
          <h1 className="text-lg font-semibold">Platforms (Access Registry)</h1>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Button onClick={openCreate}>
            <Plus className="mr-2 h-4 w-4" />
            New platform
          </Button>
          <ThemeSwitch />
        </div>
      </Header>
      <AccessSubNav activeView="platforms" />
      <Main>
        <div className="mb-4 max-w-3xl text-sm text-muted-foreground">
          The platforms reference table is Layer 1 of the 3-layer access registry. Each row represents a system NDMA staff have accounts on (Zabbix, Grafana, Fortigate, Uportal, biometric door systems, etc.). See master plan §5.2.
        </div>

        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Auth type</TableHead>
                <TableHead>Sync mode</TableHead>
                <TableHead>Notes</TableHead>
                <TableHead className="w-32 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 6 }).map((_, j) => (
                      <TableCell key={j}>
                        <Skeleton className="h-4 w-full" />
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : !platforms || platforms.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-12 text-center text-muted-foreground">
                    No platforms yet. Create one to start tracking access.
                  </TableCell>
                </TableRow>
              ) : (
                platforms.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium">{p.name}</TableCell>
                    <TableCell>
                      {p.category && (
                        <span
                          className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                            CATEGORY_COLORS[p.category as Category] ?? CATEGORY_COLORS.other
                          }`}
                        >
                          {p.category}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{p.authType ?? "—"}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{p.syncMode ?? "—"}</TableCell>
                    <TableCell className="max-w-md text-sm text-muted-foreground">
                      <span className="line-clamp-2">{p.notes ?? "—"}</span>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="icon" onClick={() => openEdit(p)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => {
                            if (window.confirm(`Disable platform "${p.name}"?`)) {
                              disableMutation.mutate({ id: p.id });
                            }
                          }}
                        >
                          <Ban className="h-4 w-4" />
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

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{form.id ? "Edit platform" : "New platform"}</DialogTitle>
            <DialogDescription>
              {form.id
                ? "Update the platform's metadata. Existing access registry rows are unaffected."
                : "Add a new platform to the registry. After saving, you can record per-staff access on the Access Registry page."}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="platform-name">Name</Label>
              <Input
                id="platform-name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="e.g. Zabbix"
                required
              />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-2">
                <Label>Category</Label>
                <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v as Category })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map((c) => (
                      <SelectItem key={c} value={c}>
                        {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Auth type</Label>
                <Select value={form.authType} onValueChange={(v) => setForm({ ...form, authType: v as AuthType })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {AUTH_TYPES.map((a) => (
                      <SelectItem key={a} value={a}>
                        {a}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Sync mode</Label>
                <Select value={form.syncMode} onValueChange={(v) => setForm({ ...form, syncMode: v as SyncMode })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SYNC_MODES.map((s) => (
                      <SelectItem key={s} value={s}>
                        {s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="platform-notes">Notes</Label>
              <Textarea
                id="platform-notes"
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                placeholder="Known limitations, API quirks, contact for access provisioning, etc."
                rows={3}
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending}>
                {form.id ? "Save changes" : "Create"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
