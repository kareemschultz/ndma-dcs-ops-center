import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { HardHat } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

import { Button } from "@ndma-dcs-staff-portal/ui/components/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@ndma-dcs-staff-portal/ui/components/dialog";
import { Input } from "@ndma-dcs-staff-portal/ui/components/input";
import { Label } from "@ndma-dcs-staff-portal/ui/components/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@ndma-dcs-staff-portal/ui/components/select";
import { Skeleton } from "@ndma-dcs-staff-portal/ui/components/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@ndma-dcs-staff-portal/ui/components/table";

import { ComplianceSubNav } from "@/components/layout/compliance-sub-nav";
import { Header } from "@/components/layout/header";
import { Main } from "@/components/layout/main";
import { ThemeSwitch } from "@/components/theme-switch";
import { orpc } from "@/utils/orpc";

export const Route = createFileRoute("/_authenticated/compliance/ppe")({
  component: PPEMatrixPage,
});

const PPE_STATUSES = [
  { value: "issued",     label: "Issued",      color: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300" },
  { value: "not_issued", label: "Not Issued",  color: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400" },
  { value: "n_a",        label: "N/A",         color: "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400" },
  { value: "lost",       label: "Lost",        color: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300" },
  { value: "stolen",     label: "Stolen",      color: "bg-red-200 text-red-800 dark:bg-red-900/60 dark:text-red-200" },
  { value: "damaged",    label: "Damaged",     color: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300" },
  { value: "returned",   label: "Returned",    color: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300" },
  { value: "replaced",   label: "Replaced",    color: "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300" },
] as const;

type PpeStatus = typeof PPE_STATUSES[number]["value"];

function statusColor(status: string) {
  return PPE_STATUSES.find((s) => s.value === status)?.color ?? "bg-gray-100 text-gray-600";
}
function statusLabel(status: string) {
  return PPE_STATUSES.find((s) => s.value === status)?.label ?? status;
}

const upsertSchema = z.object({
  staffProfileId: z.string().min(1),
  ppeItemId: z.string().min(1),
  issuedDate: z.string().min(1),
  status: z.enum(["issued", "not_issued", "n_a", "stolen", "lost", "damaged", "returned", "replaced"]),
  size: z.string().optional(),
  assetTag: z.string().optional(),
  notes: z.string().optional(),
});
type UpsertForm = z.infer<typeof upsertSchema>;

type DialogCell = {
  staffId: string;
  staffName: string;
  itemId: string;
  itemName: string;
  hasSize: boolean;
  hasAssetTag: boolean;
  existing?: { status: string; size?: string | null; assetTag?: string | null; notes?: string | null; };
};

function UpsertDialog({ cell, issuedDate, onClose }: { cell: DialogCell; issuedDate: string; onClose: () => void }) {
  const qc = useQueryClient();
  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<UpsertForm>({
    resolver: zodResolver(upsertSchema),
    defaultValues: {
      staffProfileId: cell.staffId,
      ppeItemId: cell.itemId,
      issuedDate,
      status: (cell.existing?.status as PpeStatus) ?? "issued",
      size: cell.existing?.size ?? "",
      assetTag: cell.existing?.assetTag ?? "",
      notes: cell.existing?.notes ?? "",
    },
  });

  const currentStatus = watch("status");

  const mut = useMutation(
    orpc.ppe.issuances.upsert.mutationOptions({
      onSuccess: () => {
        toast.success("PPE record saved");
        qc.invalidateQueries({ queryKey: orpc.ppe.issuances.matrix.key() });
        onClose();
      },
      onError: (e) => toast.error(e.message),
    }),
  );

  return (
    <DialogContent className="max-w-md">
      <DialogHeader>
        <DialogTitle>{cell.itemName} — {cell.staffName}</DialogTitle>
        <DialogDescription>Record issuance status for this PPE item</DialogDescription>
      </DialogHeader>
      <form className="space-y-4" onSubmit={handleSubmit((d) => mut.mutate(d))}>
        <div className="space-y-1.5">
          <Label htmlFor="ppe-status">Status</Label>
          <Select value={currentStatus} onValueChange={(v) => v != null && setValue("status", v as PpeStatus)}>
            <SelectTrigger id="ppe-status"><SelectValue placeholder="Select status" /></SelectTrigger>
            <SelectContent>
              {PPE_STATUSES.map((s) => (
                <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {errors.status && <p className="text-xs text-destructive">{errors.status.message}</p>}
        </div>
        {cell.hasSize && (
          <div className="space-y-1.5">
            <Label htmlFor="ppe-size">Size</Label>
            <Input id="ppe-size" {...register("size")} placeholder="e.g. 11, 14" />
          </div>
        )}
        {cell.hasAssetTag && (
          <div className="space-y-1.5">
            <Label htmlFor="ppe-asset-tag">Asset Tag</Label>
            <Input id="ppe-asset-tag" {...register("assetTag")} placeholder="e.g. Yes-2300" />
          </div>
        )}
        <div className="space-y-1.5">
          <Label htmlFor="ppe-notes">Notes</Label>
          <Input id="ppe-notes" {...register("notes")} />
        </div>
        <Button type="submit" className="w-full" disabled={mut.isPending}>
          {mut.isPending ? "Saving…" : "Save"}
        </Button>
      </form>
    </DialogContent>
  );
}

function PPEMatrixPage() {
  const issuedDate = new Date().toISOString().slice(0, 10);
  const [dialogCell, setDialogCell] = useState<DialogCell | null>(null);

  const { data, isLoading } = useQuery(
    orpc.ppe.issuances.matrix.queryOptions({ input: {} }),
  );

  const items = data?.items ?? [];
  const rows = data?.rows ?? [];

  return (
    <>
      <Header>
        <div className="flex items-center gap-2">
          <HardHat className="size-5" />
          <h1 className="text-lg font-semibold">PPE Matrix</h1>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <ThemeSwitch />
        </div>
      </Header>

      <ComplianceSubNav />

      <Main>
        <p className="mb-4 text-sm text-muted-foreground">
          Staff × PPE item issuance matrix. Click any cell to record or update status.
        </p>

        {/* Legend */}
        <div className="mb-4 flex flex-wrap gap-2">
          {PPE_STATUSES.map((s) => (
            <span key={s.value} className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-medium ${s.color}`}>
              {s.label}
            </span>
          ))}
        </div>

        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-8 w-full" />
            ))}
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="sticky left-0 z-10 min-w-48 bg-background">Staff</TableHead>
                  <TableHead className="min-w-24">Dept</TableHead>
                  {items.map((item) => (
                    <TableHead key={item.id} className="min-w-20 text-center text-xs" title={item.name}>
                      <div className="truncate max-w-20">{item.name}</div>
                      {item.hasSize && <div className="text-muted-foreground text-[10px]">size</div>}
                      {item.hasAssetTag && <div className="text-muted-foreground text-[10px]">tag</div>}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.staffId}>
                    <TableCell className="sticky left-0 z-10 bg-background font-medium text-sm">
                      {row.staffName}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{row.department ?? "—"}</TableCell>
                    {items.map((item) => {
                      const iso = row.issuances[item.id];
                      const isOpen = dialogCell?.staffId === row.staffId && dialogCell?.itemId === item.id;
                      return (
                        <TableCell key={item.id} className="text-center p-1">
                          <Dialog open={isOpen} onOpenChange={(open) => { if (!open) setDialogCell(null); }}>
                            <DialogTrigger
                              className="w-full min-h-8 rounded text-xs font-medium transition-opacity hover:opacity-80 cursor-pointer px-1"
                              onClick={() =>
                                setDialogCell({
                                  staffId: row.staffId,
                                  staffName: row.staffName,
                                  itemId: item.id,
                                  itemName: item.name,
                                  hasSize: item.hasSize,
                                  hasAssetTag: item.hasAssetTag,
                                  existing: iso,
                                })
                              }
                            >
                              {iso ? (
                                <span className={`inline-block rounded px-1.5 py-0.5 ${statusColor(iso.status)}`}>
                                  {statusLabel(iso.status)}
                                  {iso.size ? ` (${iso.size})` : ""}
                                  {iso.assetTag ? ` [${iso.assetTag}]` : ""}
                                </span>
                              ) : (
                                <span className="text-muted-foreground/40 text-sm">—</span>
                              )}
                            </DialogTrigger>
                            {isOpen && dialogCell && (
                              <UpsertDialog cell={dialogCell} issuedDate={issuedDate} onClose={() => setDialogCell(null)} />
                            )}
                          </Dialog>
                        </TableCell>
                      );
                    })}
                  </TableRow>
                ))}
                {rows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={items.length + 2} className="h-24 text-center text-muted-foreground">
                      No PPE records yet. Click any cell to add.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        )}
      </Main>
    </>
  );
}
