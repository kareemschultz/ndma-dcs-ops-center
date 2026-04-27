import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import { CalendarCheck, Pencil } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@ndma-dcs-staff-portal/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@ndma-dcs-staff-portal/ui/components/dialog";
import { Label } from "@ndma-dcs-staff-portal/ui/components/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@ndma-dcs-staff-portal/ui/components/select";
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

export const Route = createFileRoute("/_authenticated/scheduling/dcs-oncall")({
  component: DcsOnCallPage,
});

const CURRENT_YEAR = new Date().getFullYear();

type StaffItem = {
  id: string;
  employeeId: string;
  user?: { name?: string | null } | null;
};

type WeekRow = {
  id: string;
  year: number;
  weekNum: number;
  weekStartDate: string;
  weekEndDate: string;
  leadEngineerId: string | null;
  asnSupportId: string | null;
  enterpriseSupportId: string | null;
  coreSupportId: string | null;
  notes: string | null;
  leadEngineer?: { id: string; user?: { name?: string | null } | null } | null;
  asnSupport?: { id: string; user?: { name?: string | null } | null } | null;
  enterpriseSupport?: { id: string; user?: { name?: string | null } | null } | null;
  coreSupport?: { id: string; user?: { name?: string | null } | null } | null;
};

function staffName(s?: { user?: { name?: string | null } | null } | null): string {
  return s?.user?.name ?? "—";
}

// ---------------------------------------------------------------------------
// Edit Week Dialog
// ---------------------------------------------------------------------------

type EditForm = {
  leadEngineerId: string;
  asnSupportId: string;
  enterpriseSupportId: string;
  coreSupportId: string;
  notes: string;
};

function EditWeekDialog({
  open,
  onOpenChange,
  week,
  staffList,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  week: WeekRow;
  staffList: StaffItem[];
}) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<EditForm>({
    leadEngineerId: week.leadEngineerId ?? "",
    asnSupportId: week.asnSupportId ?? "",
    enterpriseSupportId: week.enterpriseSupportId ?? "",
    coreSupportId: week.coreSupportId ?? "",
    notes: week.notes ?? "",
  });

  const mutation = useMutation(
    orpc.scheduling.dcsOnCall.upsertWeek.mutationOptions({
      onSuccess: () => {
        toast.success("Week updated");
        queryClient.invalidateQueries({ queryKey: orpc.scheduling.dcsOnCall.list.key() });
        onOpenChange(false);
      },
      onError: (err: Error) => toast.error(err.message ?? "Failed to update"),
    }),
  );

  function handleSave() {
    mutation.mutate({
      year: week.year,
      weekNum: week.weekNum,
      weekStartDate: week.weekStartDate,
      weekEndDate: week.weekEndDate,
      leadEngineerId: form.leadEngineerId || null,
      asnSupportId: form.asnSupportId || null,
      enterpriseSupportId: form.enterpriseSupportId || null,
      coreSupportId: form.coreSupportId || null,
      notes: form.notes || null,
    });
  }

  const roleFields: Array<{ key: keyof EditForm; label: string }> = [
    { key: "leadEngineerId", label: "Lead Engineer" },
    { key: "asnSupportId", label: "ASN Support" },
    { key: "enterpriseSupportId", label: "Enterprise Support" },
    { key: "coreSupportId", label: "CORE Support" },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            Edit Week {week.weekNum} — {week.weekStartDate} to {week.weekEndDate}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          {roleFields.map(({ key, label }) => (
            <div key={key} className="space-y-1.5">
              <Label>{label}</Label>
              <Select
                value={form[key] || "_none"}
                onValueChange={(v) =>
                  setForm((f) => ({ ...f, [key]: v === "_none" ? "" : (v ?? "") }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Unassigned" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="_none">Unassigned</SelectItem>
                  {staffList.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.user?.name ?? s.employeeId}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ))}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={mutation.isPending}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={mutation.isPending}>
            {mutation.isPending ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

function DcsOnCallPage() {
  const [year, setYear] = useState(CURRENT_YEAR);
  const [editingWeek, setEditingWeek] = useState<WeekRow | null>(null);

  const { data: weeks, isLoading } = useQuery(
    orpc.scheduling.dcsOnCall.list.queryOptions({ input: { year } }),
  );

  const { data: staffData } = useQuery(
    orpc.staff.list.queryOptions({ input: { limit: 200, offset: 0 } }),
  );
  const staffList: StaffItem[] = staffData ?? [];

  return (
    <>
      <Header>
        <div className="flex items-center gap-2">
          <CalendarCheck className="h-5 w-5" />
          <h1 className="text-lg font-semibold">DCS On-Call Schedule</h1>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <ThemeSwitch />
        </div>
      </Header>

      <Main>
        <div className="mb-4 flex items-end gap-3">
          <div className="space-y-1">
            <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Year
            </label>
            <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
              <SelectTrigger className="w-[120px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[CURRENT_YEAR - 1, CURRENT_YEAR, CURRENT_YEAR + 1].map((y) => (
                  <SelectItem key={y} value={String(y)}>
                    {y}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-16">Week</TableHead>
                <TableHead>Dates</TableHead>
                <TableHead>Lead Engineer</TableHead>
                <TableHead>ASN Support</TableHead>
                <TableHead>Enterprise Support</TableHead>
                <TableHead>CORE Support</TableHead>
                <TableHead className="w-16"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 7 }).map((_, j) => (
                      <TableCell key={j}>
                        <Skeleton className="h-4 w-full" />
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : !weeks || weeks.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="py-12 text-center text-muted-foreground">
                    No on-call weeks defined for {year}. Use the edit button to add assignments.
                  </TableCell>
                </TableRow>
              ) : (
                weeks.map((w) => (
                  <TableRow key={w.id}>
                    <TableCell className="font-mono font-medium">W{w.weekNum}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {w.weekStartDate && w.weekEndDate
                        ? `${format(parseISO(w.weekStartDate), "d MMM")} – ${format(parseISO(w.weekEndDate), "d MMM")}`
                        : "—"}
                    </TableCell>
                    <TableCell>{staffName(w.leadEngineer)}</TableCell>
                    <TableCell>{staffName(w.asnSupport)}</TableCell>
                    <TableCell>{staffName(w.enterpriseSupport)}</TableCell>
                    <TableCell>{staffName(w.coreSupport)}</TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setEditingWeek(w as WeekRow)}
                      >
                        <Pencil className="size-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </Main>

      {editingWeek && (
        <EditWeekDialog
          open={!!editingWeek}
          onOpenChange={(v) => { if (!v) setEditingWeek(null); }}
          week={editingWeek}
          staffList={staffList}
        />
      )}
    </>
  );
}
