import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Bell, Pencil, Plus, Ticket } from "lucide-react";
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
import { TrainingSubNav } from "@/components/layout/training-sub-nav";
import { ThemeSwitch } from "@/components/theme-switch";
import { orpc } from "@/utils/orpc";

export const Route = createFileRoute("/_authenticated/training/vouchers")({
  component: ExamVouchersPage,
});

const STATUS_BADGE: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  unused: "destructive",
  assigned: "secondary",
  booked: "default",
  complete_pass: "default",
  complete_fail: "destructive",
  missed: "destructive",
  expired: "outline",
};

type VoucherStatus = "unused" | "assigned" | "booked" | "complete_pass" | "complete_fail" | "missed" | "expired";

const ALL_STATUSES: VoucherStatus[] = [
  "unused",
  "assigned",
  "booked",
  "complete_pass",
  "complete_fail",
  "missed",
  "expired",
];

type Voucher = {
  id: number;
  voucherNumber: string;
  productName: string;
  mustBeUsedBy: string;
  status: VoucherStatus;
  assignedStaff?: { user?: { name?: string } } | null;
};

export default function ExamVouchersPage() {
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<VoucherStatus | "all">("all");

  // Add dialog
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [form, setForm] = useState({ voucherNumber: "", productName: "", mustBeUsedBy: "" });

  // Assign dialog
  const [assignDialogOpen, setAssignDialogOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [assignStaffId, setAssignStaffId] = useState("");

  // Update status dialog
  const [updateStatusDialogOpen, setUpdateStatusDialogOpen] = useState(false);
  const [selectedVoucher, setSelectedVoucher] = useState<Voucher | null>(null);
  const [newStatus, setNewStatus] = useState<VoucherStatus>("assigned");
  const [dateBooked, setDateBooked] = useState("");

  const { data: vouchers, isLoading } = useQuery(
    orpc.examVouchers.list.queryOptions({
      input: statusFilter !== "all" ? { status: statusFilter } : {},
    }),
  );
  const { data: staff } = useQuery(orpc.staff.list.queryOptions({ input: { limit: 200 } }));

  const createMutation = useMutation(
    orpc.examVouchers.create.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: orpc.examVouchers.list.key() });
        setAddDialogOpen(false);
        setForm({ voucherNumber: "", productName: "", mustBeUsedBy: "" });
        toast.success("Voucher created");
      },
      onError: () => toast.error("Failed to create voucher"),
    }),
  );

  const assignMutation = useMutation(
    orpc.examVouchers.assign.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: orpc.examVouchers.list.key() });
        setAssignDialogOpen(false);
        setAssignStaffId("");
        toast.success("Voucher assigned");
      },
      onError: () => toast.error("Failed to assign voucher"),
    }),
  );

  const updateStatusMutation = useMutation(
    orpc.examVouchers.updateStatus.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: orpc.examVouchers.list.key() });
        setUpdateStatusDialogOpen(false);
        setSelectedVoucher(null);
        setNewStatus("assigned");
        setDateBooked("");
        toast.success("Voucher status updated");
      },
      onError: () => toast.error("Failed to update voucher status"),
    }),
  );

  const remindersMutation = useMutation(
    orpc.examVouchers.sendExpiryReminders.mutationOptions({
      onSuccess: (data) => toast.success(`Sent ${data.notified} expiry reminder(s)`),
      onError: () => toast.error("Failed to send reminders"),
    }),
  );

  function handleCreate() {
    if (!form.voucherNumber || !form.productName || !form.mustBeUsedBy) {
      toast.error("All fields are required");
      return;
    }
    createMutation.mutate(form);
  }

  function handleAssign() {
    if (!selectedId || !assignStaffId) return;
    assignMutation.mutate({ id: selectedId, staffId: assignStaffId });
  }

  function openUpdateStatus(voucher: Voucher) {
    setSelectedVoucher(voucher);
    setNewStatus(voucher.status);
    setDateBooked("");
    setUpdateStatusDialogOpen(true);
  }

  function handleUpdateStatus() {
    if (!selectedVoucher) return;
    updateStatusMutation.mutate({
      id: selectedVoucher.id,
      status: newStatus,
      ...(newStatus === "booked" && dateBooked ? { dateBooked } : {}),
    });
  }

  return (
    <>
      <Header>
        <div className="flex items-center gap-2">
          <Ticket className="h-5 w-5" />
          <h1 className="text-xl font-semibold">Exam Vouchers</h1>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => remindersMutation.mutate({ withinDays: 30 })}
            disabled={remindersMutation.isPending}
          >
            <Bell className="mr-2 h-4 w-4" />
            Send 30-Day Reminders
          </Button>
          <Button size="sm" onClick={() => setAddDialogOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Add Voucher
          </Button>
          <ThemeSwitch />
        </div>
      </Header>

      <TrainingSubNav active="/training/vouchers" />
      <Main>
        <div className="mb-5 flex gap-3 rounded-lg border bg-muted/40 p-4">
          <Ticket className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          <div className="text-sm text-muted-foreground">
            <p className="font-medium text-foreground">
              Exam vouchers are pre-paid credits for certification exams.
            </p>
            <p className="mt-0.5">
              Add a voucher when DCS purchases one, assign it to the staff member who will use it,
              then track it through to the exam on the Exam Bookings page. Vouchers have a
              must-use-by date — use the reminders button so none expire unused.
            </p>
          </div>
        </div>

        <div className="mb-4 flex flex-wrap items-center gap-3">
          <span className="text-muted-foreground text-sm font-medium">Filter by status:</span>
          {(["all", "unused", "assigned", "booked", "complete_pass", "expired"] as const).map(
            (s) => (
              <Button
                key={s}
                variant={statusFilter === s ? "default" : "outline"}
                size="sm"
                onClick={() => setStatusFilter(s)}
              >
                {s === "all" ? "All" : s}
              </Button>
            ),
          )}
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Voucher Registry</CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto p-0">
            {isLoading ? (
              <div className="space-y-2 p-4">
                {[...Array(5)].map((_, i) => (
                  <Skeleton key={i} className="h-10 w-full" />
                ))}
              </div>
            ) : !vouchers?.length ? (
              <p className="text-muted-foreground py-8 text-center text-sm">No vouchers found</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Voucher #</TableHead>
                    <TableHead>Product</TableHead>
                    <TableHead>Must Use By</TableHead>
                    <TableHead>Assigned To</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {vouchers.map((v) => (
                    <TableRow key={v.id}>
                      <TableCell className="font-mono text-xs">{v.voucherNumber}</TableCell>
                      <TableCell className="font-medium">{v.productName}</TableCell>
                      <TableCell>{v.mustBeUsedBy}</TableCell>
                      <TableCell>
                        {v.assignedStaff?.user?.name ?? (
                          <span className="text-muted-foreground italic">Unassigned</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant={STATUS_BADGE[v.status] ?? "outline"}>{v.status}</Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          {v.status === "unused" && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                setSelectedId(v.id);
                                setAssignDialogOpen(true);
                              }}
                            >
                              Assign
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => openUpdateStatus(v as Voucher)}
                            title="Update status"
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </Main>

      {/* Add Voucher Dialog */}
      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Exam Voucher</DialogTitle>
            <DialogDescription>
              Record a new exam voucher for tracking and assignment.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="grid gap-2">
              <Label>Voucher Number *</Label>
              <Input
                placeholder="e.g. PEAR-2026-0001"
                value={form.voucherNumber}
                onChange={(e) => setForm((f) => ({ ...f, voucherNumber: e.target.value }))}
              />
              <p className="text-xs text-muted-foreground">
                The reference code printed on the voucher from the exam provider.
              </p>
            </div>
            <div className="grid gap-2">
              <Label>Exam / Product Name *</Label>
              <Input
                placeholder="e.g. Cisco CCNA 200-301"
                value={form.productName}
                onChange={(e) => setForm((f) => ({ ...f, productName: e.target.value }))}
              />
              <p className="text-xs text-muted-foreground">
                The certification exam this voucher pays for.
              </p>
            </div>
            <div className="grid gap-2">
              <Label>Must Be Used By *</Label>
              <Input
                type="date"
                value={form.mustBeUsedBy}
                onChange={(e) => setForm((f) => ({ ...f, mustBeUsedBy: e.target.value }))}
              />
              <p className="text-xs text-muted-foreground">
                The voucher's expiry date — after this date it can no longer be redeemed.
              </p>
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setAddDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreate} disabled={createMutation.isPending}>
              Create
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Assign Voucher Dialog */}
      <Dialog open={assignDialogOpen} onOpenChange={setAssignDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Assign Voucher</DialogTitle>
            <DialogDescription>Assign this exam voucher to a staff member.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="grid gap-2">
              <Label>Staff Member</Label>
              <Select value={assignStaffId} onValueChange={(v) => v != null && setAssignStaffId(v)}>
                <SelectTrigger>
                  <SelectValue>
                    {assignStaffId
                      ? (staff?.find((s) => s.id === assignStaffId)?.user?.name ?? staff?.find((s) => s.id === assignStaffId)?.employeeId ?? "Unnamed")
                      : "Select staff…"}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {staff?.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.user?.name ?? s.employeeId}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setAssignDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleAssign} disabled={assignMutation.isPending}>
              Assign
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Update Status Dialog */}
      <Dialog open={updateStatusDialogOpen} onOpenChange={setUpdateStatusDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Update Voucher Status</DialogTitle>
            <DialogDescription>
              Change the status of voucher{" "}
              <span className="font-mono font-medium">{selectedVoucher?.voucherNumber}</span>. Current
              status: <span className="font-medium">{selectedVoucher?.status}</span>.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="grid gap-2">
              <Label>New Status</Label>
              <Select
                value={newStatus}
                onValueChange={(v) => v != null && setNewStatus(v as VoucherStatus)}
              >
                <SelectTrigger>
                  <SelectValue>
                    {newStatus ?? "Select status…"}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {ALL_STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {newStatus === "booked" && (
              <div className="grid gap-2">
                <Label>Date Booked</Label>
                <Input
                  type="date"
                  value={dateBooked}
                  onChange={(e) => setDateBooked(e.target.value)}
                />
              </div>
            )}
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button
              variant="outline"
              onClick={() => {
                setUpdateStatusDialogOpen(false);
                setSelectedVoucher(null);
              }}
            >
              Cancel
            </Button>
            <Button onClick={handleUpdateStatus} disabled={updateStatusMutation.isPending}>
              Save Status
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
