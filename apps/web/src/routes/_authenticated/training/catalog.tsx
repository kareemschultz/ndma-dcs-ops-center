import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Plus, Tag } from "lucide-react";
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

export default function CertCatalogPage() {
  const queryClient = useQueryClient();
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [form, setForm] = useState<CatalogForm>(EMPTY_FORM);

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

      <Main>
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
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Certification</TableHead>
                        <TableHead>Vendor</TableHead>
                        <TableHead>Level</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {certs?.map((c) => (
                        <TableRow key={c.id}>
                          <TableCell className="font-medium">{c.recommendedCert}</TableCell>
                          <TableCell>{c.vendor ?? <span className="text-muted-foreground">—</span>}</TableCell>
                          <TableCell>
                            {c.level ? (
                              <Badge variant="outline">{c.level}</Badge>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
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
    </>
  );
}
