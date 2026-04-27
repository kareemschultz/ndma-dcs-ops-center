import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import { ClipboardList, Plus } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@ndma-dcs-staff-portal/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@ndma-dcs-staff-portal/ui/components/dialog";
import { Input } from "@ndma-dcs-staff-portal/ui/components/input";
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

export const Route = createFileRoute("/_authenticated/leave/tosd")({
  component: TosdPage,
});

const TOSD_TYPES = [
  "reported_sick",
  "medical",
  "absent",
  "time_off",
  "work_from_home",
  "lateness",
  "callout_legacy",
] as const;

type TosdType = (typeof TOSD_TYPES)[number];

const TOSD_TYPE_LABELS: Record<TosdType, string> = {
  reported_sick: "Reported Sick",
  medical: "Medical",
  absent: "Absent",
  time_off: "Time Off",
  work_from_home: "Work From Home",
  lateness: "Lateness",
  callout_legacy: "Callout (Legacy)",
};

const TOSD_TYPE_COLORS: Record<TosdType, string> = {
  reported_sick: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200",
  medical: "bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-200",
  absent: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200",
  time_off: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200",
  work_from_home: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200",
  lateness: "bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-200",
  callout_legacy: "bg-muted text-muted-foreground",
};

const CURRENT_YEAR = new Date().getFullYear();
const YEAR_OPTIONS = [CURRENT_YEAR, CURRENT_YEAR - 1, CURRENT_YEAR - 2];

// ---------------------------------------------------------------------------
// Add TOSD Record Dialog
// ---------------------------------------------------------------------------

type AddFormState = {
  staffId: string;
  date: string;
  type: TosdType;
  reasonText: string;
  days: string;
  hours: string;
};

type StaffListItem = {
  id: string;
  employeeId: string;
  user?: { name?: string | null } | null;
};

function AddTosdDialog({
  open,
  onOpenChange,
  staffList,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  staffList: StaffListItem[];
}) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<AddFormState>({
    staffId: "",
    date: "",
    type: "reported_sick",
    reasonText: "",
    days: "",
    hours: "",
  });

  const mutation = useMutation(
    orpc.leave.tosd.create.mutationOptions({
      onSuccess: () => {
        toast.success("TOSD record added");
        queryClient.invalidateQueries({ queryKey: orpc.leave.tosd.list.key() });
        onOpenChange(false);
        setForm({ staffId: "", date: "", type: "reported_sick", reasonText: "", days: "", hours: "" });
      },
      onError: (err: Error) => {
        toast.error(err.message ?? "Failed to add record");
      },
    }),
  );

  function handleSave() {
    if (!form.staffId || !form.date) {
      toast.error("Staff and date are required");
      return;
    }
    mutation.mutate({
      staffId: form.staffId,
      date: form.date,
      type: form.type,
      reasonText: form.reasonText || undefined,
      days: form.days || undefined,
      hours: form.hours || undefined,
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add TOSD Record</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>Staff Member</Label>
            <Select value={form.staffId} onValueChange={(v) => setForm((f) => ({ ...f, staffId: v ?? "" }))}>
              <SelectTrigger>
                <SelectValue placeholder="Select staff…" />
              </SelectTrigger>
              <SelectContent>
                {staffList.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.user?.name ?? s.employeeId}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Date</Label>
            <Input
              type="date"
              value={form.date}
              onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Type</Label>
            <Select
              value={form.type}
              onValueChange={(v) => setForm((f) => ({ ...f, type: v as TosdType }))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TOSD_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>
                    {TOSD_TYPE_LABELS[t]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Reason (optional)</Label>
            <Input
              value={form.reasonText}
              onChange={(e) => setForm((f) => ({ ...f, reasonText: e.target.value }))}
              placeholder="Brief explanation…"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Days</Label>
              <Input
                type="number"
                step="0.5"
                min="0"
                value={form.days}
                onChange={(e) => setForm((f) => ({ ...f, days: e.target.value }))}
                placeholder="0"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Hours</Label>
              <Input
                type="number"
                step="0.5"
                min="0"
                value={form.hours}
                onChange={(e) => setForm((f) => ({ ...f, hours: e.target.value }))}
                placeholder="0"
              />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={mutation.isPending}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={mutation.isPending}>
            {mutation.isPending ? "Saving…" : "Add Record"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

function TosdPage() {
  const [selectedStaffId, setSelectedStaffId] = useState<string>("");
  const [selectedYear, setSelectedYear] = useState<number>(CURRENT_YEAR);
  const [addOpen, setAddOpen] = useState(false);

  const { data: staffData, isLoading: staffLoading } = useQuery(
    orpc.staff.list.queryOptions({ input: { limit: 200, offset: 0 } }),
  );
  const staffList: StaffListItem[] = staffData ?? [];

  const { data: rows, isLoading: rowsLoading } = useQuery(
    orpc.leave.tosd.list.queryOptions({
      input: {
        staffId: selectedStaffId || undefined,
        year: selectedYear,
      },
    }),
  );

  return (
    <>
      <Header>
        <div className="flex items-center gap-2">
          <ClipboardList className="h-5 w-5" />
          <h1 className="text-lg font-semibold">Time Off & Sick Days</h1>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Button onClick={() => setAddOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Add Record
          </Button>
          <ThemeSwitch />
        </div>
      </Header>

      <Main>
        <div className="mb-4 flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Staff
            </label>
            <Select
              value={selectedStaffId || "_all"}
              onValueChange={(v) => setSelectedStaffId(v === "_all" ? "" : (v ?? ""))}
            >
              <SelectTrigger className="w-[220px]">
                <SelectValue placeholder={staffLoading ? "Loading…" : "All staff"} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="_all">All staff</SelectItem>
                {staffList.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.user?.name ?? s.employeeId}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Year
            </label>
            <Select
              value={String(selectedYear)}
              onValueChange={(v) => setSelectedYear(Number(v))}
            >
              <SelectTrigger className="w-[120px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {YEAR_OPTIONS.map((y) => (
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
                <TableHead>Staff</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Reason</TableHead>
                <TableHead className="text-right">Days</TableHead>
                <TableHead className="text-right">Hours</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rowsLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 6 }).map((_, j) => (
                      <TableCell key={j}>
                        <Skeleton className="h-4 w-full" />
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : !rows || rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-12 text-center text-muted-foreground">
                    No TOSD records found for the selected filters.
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>
                      <span className="font-medium">
                        {r.staffProfile?.user?.name ?? "—"}
                      </span>
                      {r.staffProfile?.department?.name && (
                        <p className="text-xs text-muted-foreground">
                          {r.staffProfile.department.name}
                        </p>
                      )}
                    </TableCell>
                    <TableCell className="text-sm">
                      {r.date ? format(parseISO(r.date), "d MMM yyyy") : "—"}
                    </TableCell>
                    <TableCell>
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                          TOSD_TYPE_COLORS[r.type as TosdType] ?? "bg-muted text-muted-foreground"
                        }`}
                      >
                        {TOSD_TYPE_LABELS[r.type as TosdType] ?? r.type}
                      </span>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {r.reasonText ?? "—"}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      {r.days ?? "—"}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      {r.hours ?? "—"}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </Main>

      <AddTosdDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        staffList={staffList}
      />
    </>
  );
}
