import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Pencil, Plus, Tag } from "lucide-react";
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
import { Skeleton } from "@ndma-dcs-staff-portal/ui/components/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@ndma-dcs-staff-portal/ui/components/table";

import { Header } from "@/components/layout/header";
import { Main } from "@/components/layout/main";
import { TrainingSubNav } from "@/components/layout/training-sub-nav";
import { ThemeSwitch } from "@/components/theme-switch";
import { orpc } from "@/utils/orpc";

export const Route = createFileRoute("/_authenticated/training/catalog")({
  component: CertCatalogPage,
});

type CatalogForm = {
  trainingArea: string;
  recommendedCert: string;
  vendor: string;
  level: string;
};

const EMPTY_FORM: CatalogForm = {
  trainingArea: "",
  recommendedCert: "",
  vendor: "",
  level: "",
};

type EditingItem = {
  id: number;
  trainingArea: string;
  recommendedCert: string;
  vendor: string;
  level: string;
};

export default function CertCatalogPage() {
  const queryClient = useQueryClient();

  // Create dialog
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [form, setForm] = useState<CatalogForm>(EMPTY_FORM);

  // Edit dialog
  const [editingItem, setEditingItem] = useState<EditingItem | null>(null);

  const { data: catalog, isLoading } = useQuery(orpc.certCatalog.list.queryOptions());

  const createMutation = useMutation(
    orpc.certCatalog.create.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: orpc.certCatalog.list.key() });
        setAddDialogOpen(false);
        setForm(EMPTY_FORM);
        toast.success("Certification added to catalog");
      },
      onError: () => toast.error("Failed to add certification"),
    }),
  );

  const updateMutation = useMutation(
    orpc.certCatalog.update.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: orpc.certCatalog.list.key() });
        setEditingItem(null);
        toast.success("Certification updated");
      },
      onError: () => toast.error("Failed to update certification"),
    }),
  );

  // Group by trainingArea for display
  const grouped = (catalog ?? []).reduce<Record<string, typeof catalog>>((acc, c) => {
    const area = c.trainingArea;
    if (!acc[area]) acc[area] = [];
    acc[area]!.push(c);
    return acc;
  }, {});

  function handleCreate() {
    if (!form.trainingArea || !form.recommendedCert) {
      toast.error("Training area and certification are required");
      return;
    }
    createMutation.mutate({
      trainingArea: form.trainingArea,
      recommendedCert: form.recommendedCert,
      vendor: form.vendor || undefined,
      level: form.level || undefined,
    });
  }

  function handleUpdate() {
    if (!editingItem) return;
    if (!editingItem.trainingArea || !editingItem.recommendedCert) {
      toast.error("Training area and certification are required");
      return;
    }
    updateMutation.mutate({
      id: editingItem.id,
      trainingArea: editingItem.trainingArea || undefined,
      recommendedCert: editingItem.recommendedCert || undefined,
      vendor: editingItem.vendor || undefined,
      level: editingItem.level || undefined,
    });
  }

  function openEditDialog(c: { id: number; trainingArea: string; recommendedCert: string; vendor?: string | null; level?: string | null }) {
    setEditingItem({
      id: c.id,
      trainingArea: c.trainingArea,
      recommendedCert: c.recommendedCert,
      vendor: c.vendor ?? "",
      level: c.level ?? "",
    });
  }

  return (
    <>
      <Header>
        <div className="flex items-center gap-2">
          <Tag className="h-5 w-5" />
          <h1 className="text-xl font-semibold">Certification Catalog</h1>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Button size="sm" onClick={() => setAddDialogOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Add Certification
          </Button>
          <ThemeSwitch />
        </div>
      </Header>

      <TrainingSubNav active="/training/catalog" />
      <Main>
        <div className="mb-5 flex gap-3 rounded-lg border bg-muted/40 p-4">
          <Tag className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          <div className="text-sm text-muted-foreground">
            <p className="font-medium text-foreground">
              The certification catalog is a reference list, not a per-staff record.
            </p>
            <p className="mt-0.5">
              It lists the certifications DCS recommends for each training area (e.g. CCNA for
              Networking). It's the menu you draw on when building each staff member's training
              plan — adding an entry here does not assign it to anyone.
            </p>
          </div>
        </div>

        {isLoading ? (
          <div className="space-y-4">
            {[...Array(3)].map((_, i) => (
              <Skeleton key={i} className="h-32 w-full" />
            ))}
          </div>
        ) : Object.keys(grouped).length === 0 ? (
          <Card>
            <CardContent className="py-10 text-center">
              <Tag className="text-muted-foreground mx-auto mb-3 h-10 w-10" />
              <p className="text-muted-foreground text-sm">
                No certifications catalogued yet. Add the first one.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-6">
            {Object.entries(grouped).map(([area, certs]) => (
              <Card key={area}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">{area}</CardTitle>
                </CardHeader>
                <CardContent className="overflow-x-auto p-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Certification</TableHead>
                        <TableHead>Vendor</TableHead>
                        <TableHead>Level</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {certs?.map((c) => (
                        <TableRow key={c.id}>
                          <TableCell className="font-medium">{c.recommendedCert}</TableCell>
                          <TableCell>
                            {c.vendor ?? <span className="text-muted-foreground">—</span>}
                          </TableCell>
                          <TableCell>
                            {c.level ? (
                              <Badge variant="outline">{c.level}</Badge>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => openEditDialog(c)}
                              title="Edit certification"
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </Main>

      {/* Add Certification Dialog */}
      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Certification</DialogTitle>
            <DialogDescription>
              Add a recommended certification to the catalog for a training area.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="grid gap-2">
              <Label>Training Area *</Label>
              <Input
                placeholder="e.g. Networking, Cloud, Security…"
                value={form.trainingArea}
                onChange={(e) => setForm((f) => ({ ...f, trainingArea: e.target.value }))}
              />
            </div>
            <div className="grid gap-2">
              <Label>Recommended Certification *</Label>
              <Input
                placeholder="e.g. CCNA, AWS Solutions Architect…"
                value={form.recommendedCert}
                onChange={(e) => setForm((f) => ({ ...f, recommendedCert: e.target.value }))}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Vendor</Label>
                <Input
                  placeholder="e.g. Cisco, Amazon…"
                  value={form.vendor}
                  onChange={(e) => setForm((f) => ({ ...f, vendor: e.target.value }))}
                />
              </div>
              <div className="grid gap-2">
                <Label>Level</Label>
                <Input
                  placeholder="e.g. Associate, Professional…"
                  value={form.level}
                  onChange={(e) => setForm((f) => ({ ...f, level: e.target.value }))}
                />
              </div>
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setAddDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreate} disabled={createMutation.isPending}>
              Add
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Certification Dialog */}
      <Dialog open={editingItem != null} onOpenChange={(open) => { if (!open) setEditingItem(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Certification</DialogTitle>
            <DialogDescription>
              Update the details for this certification in the catalog.
            </DialogDescription>
          </DialogHeader>
          {editingItem != null && (
            <div className="grid gap-4">
              <div className="grid gap-2">
                <Label>Training Area *</Label>
                <Input
                  placeholder="e.g. Networking, Cloud, Security…"
                  value={editingItem.trainingArea}
                  onChange={(e) =>
                    setEditingItem((prev) => prev ? { ...prev, trainingArea: e.target.value } : prev)
                  }
                />
              </div>
              <div className="grid gap-2">
                <Label>Recommended Certification *</Label>
                <Input
                  placeholder="e.g. CCNA, AWS Solutions Architect…"
                  value={editingItem.recommendedCert}
                  onChange={(e) =>
                    setEditingItem((prev) => prev ? { ...prev, recommendedCert: e.target.value } : prev)
                  }
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label>Vendor</Label>
                  <Input
                    placeholder="e.g. Cisco, Amazon…"
                    value={editingItem.vendor}
                    onChange={(e) =>
                      setEditingItem((prev) => prev ? { ...prev, vendor: e.target.value } : prev)
                    }
                  />
                </div>
                <div className="grid gap-2">
                  <Label>Level</Label>
                  <Input
                    placeholder="e.g. Associate, Professional…"
                    value={editingItem.level}
                    onChange={(e) =>
                      setEditingItem((prev) => prev ? { ...prev, level: e.target.value } : prev)
                    }
                  />
                </div>
              </div>
            </div>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setEditingItem(null)}>
              Cancel
            </Button>
            <Button onClick={handleUpdate} disabled={updateMutation.isPending}>
              Save Changes
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
