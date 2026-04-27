import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Clock3, Plus } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

import { Button } from "@ndma-dcs-staff-portal/ui/components/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@ndma-dcs-staff-portal/ui/components/dialog";
import { Input } from "@ndma-dcs-staff-portal/ui/components/input";
import { Label } from "@ndma-dcs-staff-portal/ui/components/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@ndma-dcs-staff-portal/ui/components/select";
import { Skeleton } from "@ndma-dcs-staff-portal/ui/components/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@ndma-dcs-staff-portal/ui/components/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@ndma-dcs-staff-portal/ui/components/tabs";

import { Header } from "@/components/layout/header";
import { Main } from "@/components/layout/main";
import { ThemeSwitch } from "@/components/theme-switch";
import { orpc } from "@/utils/orpc";

export const Route = createFileRoute("/_authenticated/lateness/")({
  component: LatenessPage,
});

const MONTHS_PER_QUARTER: Record<number, string[]> = {
  1: ["January", "February", "March"],
  2: ["April", "May", "June"],
  3: ["July", "August", "September"],
  4: ["October", "November", "December"],
};

const upsertSchema = z.object({
  staffId: z.string().min(1, "Staff required"),
  year: z.number().int(),
  month: z.string().min(1, "Month required"),
  totalTimeLate: z.string().min(1, "Time required"),
  daysLate: z.number().int().min(0),
  daysMissingFromAttendance: z.number().int().min(0).optional(),
  daysOnSchedule: z.number().int().min(0).optional(),
  notes: z.string().optional(),
});
type UpsertForm = z.infer<typeof upsertSchema>;

function UpsertDialog({
  open,
  onClose,
  year,
  month,
}: {
  open: boolean;
  onClose: () => void;
  year: number;
  month: string;
}) {
  const qc = useQueryClient();
  const staffQuery = useQuery(orpc.staff.list.queryOptions({ input: { limit: 200, offset: 0 } }));
  const staffList = staffQuery.data ?? [];

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
    reset,
  } = useForm<UpsertForm>({
    resolver: zodResolver(upsertSchema),
    defaultValues: {
      staffId: "",
      year,
      month,
      totalTimeLate: "0:00",
      daysLate: 0,
    },
  });

  const staffId = watch("staffId");

  const mut = useMutation(
    orpc.lateness.upsert.mutationOptions({
      onSuccess: () => {
        toast.success("Record saved");
        qc.invalidateQueries({ queryKey: orpc.lateness.quarterlyGrid.key() });
        qc.invalidateQueries({ queryKey: orpc.lateness.list.key() });
        onClose();
        reset();
      },
      onError: (e) => toast.error(e.message),
    }),
  );

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add Lateness Record</DialogTitle>
          <DialogDescription>{month} {year} — per-staff monthly lateness data</DialogDescription>
        </DialogHeader>
        <form className="space-y-4" onSubmit={handleSubmit((d) => mut.mutate(d))}>
          <div className="space-y-1.5">
            <Label htmlFor="lat-staff">Staff</Label>
            <Select value={staffId} onValueChange={(v) => v != null && setValue("staffId", v)}>
              <SelectTrigger id="lat-staff"><SelectValue placeholder="Select staff" /></SelectTrigger>
              <SelectContent>
                {staffList.map((s: { id: string; employeeId: string; user?: { name?: string } | null }) => (
                  <SelectItem key={s.id} value={s.id}>{s.user?.name ?? s.employeeId}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.staffId && <p className="text-xs text-destructive">{errors.staffId.message}</p>}
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="lat-tl">Total Time Late</Label>
              <Input id="lat-tl" {...register("totalTimeLate")} placeholder="e.g. 1:30" />
              {errors.totalTimeLate && <p className="text-xs text-destructive">{errors.totalTimeLate.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="lat-dl">Days Late</Label>
              <Input id="lat-dl" type="number" min={0} {...register("daysLate", { valueAsNumber: true })} />
              {errors.daysLate && <p className="text-xs text-destructive">{errors.daysLate.message}</p>}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="lat-dm">Days Missing</Label>
              <Input id="lat-dm" type="number" min={0} {...register("daysMissingFromAttendance", { valueAsNumber: true })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="lat-dos">Days On Schedule</Label>
              <Input id="lat-dos" type="number" min={0} {...register("daysOnSchedule", { valueAsNumber: true })} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="lat-notes">Notes</Label>
            <Input id="lat-notes" {...register("notes")} />
          </div>
          <Button type="submit" className="w-full" disabled={mut.isPending}>
            {mut.isPending ? "Saving…" : "Save"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function QuarterGrid({
  year,
  quarter,
  onAdd,
}: {
  year: number;
  quarter: number;
  onAdd: (month: string) => void;
}) {
  const months = MONTHS_PER_QUARTER[quarter] ?? [];
  const { data, isLoading } = useQuery(
    orpc.lateness.quarterlyGrid.queryOptions({ input: { year, quarter } }),
  );

  if (isLoading) {
    return (
      <div className="space-y-2 mt-4">
        {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
      </div>
    );
  }

  const rows = data?.rows ?? [];

  return (
    <div className="mt-4 overflow-x-auto rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="sticky left-0 bg-background min-w-48">Staff</TableHead>
            <TableHead className="min-w-24">Dept</TableHead>
            {months.map((m) => (
              <TableHead key={m} colSpan={4} className="text-center border-l min-w-64">
                <div className="flex items-center justify-between px-2">
                  <span className="font-medium">{m}</span>
                  <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => onAdd(m)}>
                    <Plus className="size-3" />
                  </Button>
                </div>
              </TableHead>
            ))}
          </TableRow>
          <TableRow>
            <TableHead className="sticky left-0 bg-background" />
            <TableHead />
            {months.flatMap((m) => [
              <TableHead key={`${m}-tl`} className="text-xs text-muted-foreground border-l min-w-20">Time Late</TableHead>,
              <TableHead key={`${m}-dl`} className="text-xs text-muted-foreground min-w-14">Days Late</TableHead>,
              <TableHead key={`${m}-dm`} className="text-xs text-muted-foreground min-w-14">Missing</TableHead>,
              <TableHead key={`${m}-dos`} className="text-xs text-muted-foreground min-w-14">Scheduled</TableHead>,
            ])}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.staffId}>
              <TableCell className="sticky left-0 bg-background font-medium text-sm">{row.staffName}</TableCell>
              <TableCell className="text-xs text-muted-foreground">{row.department ?? "—"}</TableCell>
              {months.flatMap((m) => {
                const rec = row.months[m];
                return [
                  <TableCell key={`${m}-tl`} className={`text-sm border-l ${rec?.daysLate ? "text-red-600 dark:text-red-400" : "text-muted-foreground"}`}>
                    {rec?.totalTimeLate ?? "—"}
                  </TableCell>,
                  <TableCell key={`${m}-dl`} className={`text-center text-sm ${rec?.daysLate ? "font-semibold text-red-600 dark:text-red-400" : "text-muted-foreground"}`}>
                    {rec?.daysLate ?? "—"}
                  </TableCell>,
                  <TableCell key={`${m}-dm`} className="text-center text-sm text-muted-foreground">
                    {rec?.daysMissingFromAttendance ?? "—"}
                  </TableCell>,
                  <TableCell key={`${m}-dos`} className="text-center text-sm text-muted-foreground">
                    {rec?.daysOnSchedule ?? "—"}
                  </TableCell>,
                ];
              })}
            </TableRow>
          ))}
          {rows.length === 0 && (
            <TableRow>
              <TableCell colSpan={2 + months.length * 4} className="h-24 text-center text-muted-foreground">
                No lateness records for Q{quarter} {year}. Use + to add a record.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}

function LatenessPage() {
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);
  const [activeQuarter, setActiveQuarter] = useState("1");
  const [addDialog, setAddDialog] = useState<{ month: string } | null>(null);

  const YEARS = [currentYear - 1, currentYear, currentYear + 1];

  return (
    <>
      <Header>
        <div className="flex items-center gap-2">
          <Clock3 className="size-5" />
          <h1 className="text-lg font-semibold">Lateness Report</h1>
        </div>
        <div className="ml-auto flex items-center gap-4">
          <Select value={String(year)} onValueChange={(v) => v != null && setYear(Number(v))}>
            <SelectTrigger className="w-28">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {YEARS.map((y) => (
                <SelectItem key={y} value={String(y)}>{y}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <ThemeSwitch />
        </div>
      </Header>

      <Main>
        <Tabs value={activeQuarter} onValueChange={setActiveQuarter}>
          <TabsList>
            <TabsTrigger value="1">Q1 (Jan–Mar)</TabsTrigger>
            <TabsTrigger value="2">Q2 (Apr–Jun)</TabsTrigger>
            <TabsTrigger value="3">Q3 (Jul–Sep)</TabsTrigger>
            <TabsTrigger value="4">Q4 (Oct–Dec)</TabsTrigger>
          </TabsList>

          {[1, 2, 3, 4].map((q) => (
            <TabsContent key={q} value={String(q)}>
              <QuarterGrid
                year={year}
                quarter={q}
                onAdd={(m) => setAddDialog({ month: m })}
              />
            </TabsContent>
          ))}
        </Tabs>
      </Main>

      {addDialog && (
        <UpsertDialog
          open={true}
          onClose={() => setAddDialog(null)}
          year={year}
          month={addDialog.month}
        />
      )}
    </>
  );
}
