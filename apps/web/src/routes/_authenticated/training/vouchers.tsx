import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Bell, Plus, Ticket } from "lucide-react";
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

export default function ExamVouchersPage() {
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<VoucherStatus | "all">("all");
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [assignDialogOpen, setAssignDialogOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);

  // Form state
  const [form, setForm] = useState({ voucherNumber: "", productName: "", mustBeUsedBy: "" });
  const [assignStaffId, setAssignStaffId] = useState("");

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
        <div className="mb-4 flex items-center gap-3">
          <span className="text-muted-foreground text-sm font-medium">Filter:</span>
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
          <CardContent className="p-0">
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
              <Label>Voucher Number</Label>
              <Input
                placeholder="e.g. PEAR-2026-0001"
                value={form.voucherNumber}
                onChange={(e) => setForm((f) => ({ ...f, voucherNumber: e.target.value }))}
              />
            </div>
            <div className="grid gap-2">
              <Label>Product Name</Label>
              <Input
                placeholder="e.g. Pearson CCNA"
                value={form.productName}
                onChange={(e) => setForm((f) => ({ ...f, productName: e.target.value }))}
              />
            </div>
            <div className="grid gap-2">
              <Label>Must Be Used By</Label>
              <Input
                type="date"
                value={form.mustBeUsedBy}
                onChange={(e) => setForm((f) => ({ ...f, mustBeUsedBy: e.target.value }))}
              />
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
                      ? (staff?.find(s => s.id === assignStaffId)?.user?.name ?? staff?.find(s => s.id === assignStaffId)?.employeeId ?? assignStaffId)
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
    </>
  );
}
