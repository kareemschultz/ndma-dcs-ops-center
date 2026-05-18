import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { CalendarCheck, CalendarDays, Info } from "lucide-react";
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

export const Route = createFileRoute("/_authenticated/training/exams")({
  component: ExamBookingsPage,
});

type VoucherStatus =
  | "unused"
  | "assigned"
  | "booked"
  | "complete_pass"
  | "complete_fail"
  | "missed"
  | "expired";

const STATUS_LABEL: Record<VoucherStatus, string> = {
  unused: "Not assigned",
  assigned: "Awaiting booking",
  booked: "Exam booked",
  complete_pass: "Passed",
  complete_fail: "Failed",
  missed: "Missed",
  expired: "Voucher expired",
};

const STATUS_BADGE: Record<VoucherStatus, "default" | "secondary" | "destructive" | "outline"> = {
  unused: "outline",
  assigned: "secondary",
  booked: "default",
  complete_pass: "default",
  complete_fail: "destructive",
  missed: "destructive",
  expired: "outline",
};

type Voucher = {
  id: number;
  voucherNumber: string;
  productName: string;
  mustBeUsedBy: string;
  dateBooked?: string | null;
  status: VoucherStatus;
  assignedStaff?: { user?: { name?: string } | null } | null;
};

export default function ExamBookingsPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  // Book-exam dialog
  const [bookDialogOpen, setBookDialogOpen] = useState(false);
  const [bookVoucher, setBookVoucher] = useState<Voucher | null>(null);
  const [bookDate, setBookDate] = useState("");

  // Record-result dialog
  const [resultDialogOpen, setResultDialogOpen] = useState(false);
  const [resultVoucher, setResultVoucher] = useState<Voucher | null>(null);
  const [resultStatus, setResultStatus] = useState<"complete_pass" | "complete_fail" | "missed">(
    "complete_pass",
  );

  const { data: vouchers, isLoading } = useQuery(
    orpc.examVouchers.list.queryOptions({ input: {} }),
  );

  const updateStatusMutation = useMutation(
    orpc.examVouchers.updateStatus.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: orpc.examVouchers.list.key() });
        setBookDialogOpen(false);
        setResultDialogOpen(false);
        setBookVoucher(null);
        setResultVoucher(null);
        setBookDate("");
        toast.success("Exam booking updated");
      },
      onError: () => toast.error("Failed to update exam booking"),
    }),
  );

  // Only vouchers tied to a real exam (assigned to staff and not yet expired)
  const examVouchers = (vouchers ?? []).filter(
    (v) => v.status !== "unused" && v.status !== "expired",
  ) as Voucher[];

  const awaitingBooking = examVouchers.filter((v) => v.status === "assigned");
  const booked = examVouchers.filter((v) => v.status === "booked");
  const completed = examVouchers.filter(
    (v) => v.status === "complete_pass" || v.status === "complete_fail" || v.status === "missed",
  );

  function openBook(v: Voucher) {
    setBookVoucher(v);
    setBookDate("");
    setBookDialogOpen(true);
  }

  function openResult(v: Voucher) {
    setResultVoucher(v);
    setResultStatus("complete_pass");
    setResultDialogOpen(true);
  }

  function confirmBooking() {
    if (!bookVoucher || !bookDate) {
      toast.error("Please choose the exam date");
      return;
    }
    updateStatusMutation.mutate({
      id: bookVoucher.id,
      status: "booked",
      dateBooked: bookDate,
    });
  }

  function confirmResult() {
    if (!resultVoucher) return;
    updateStatusMutation.mutate({ id: resultVoucher.id, status: resultStatus });
  }

  function renderRow(v: Voucher, kind: "awaiting" | "booked" | "done") {
    return (
      <TableRow key={v.id}>
        <TableCell className="font-medium">
          {v.assignedStaff?.user?.name ?? "Unassigned"}
        </TableCell>
        <TableCell>{v.productName}</TableCell>
        <TableCell className="font-mono text-xs">{v.voucherNumber}</TableCell>
        <TableCell className="text-sm">
          {kind === "booked" || kind === "done" ? (v.dateBooked ?? "—") : v.mustBeUsedBy}
        </TableCell>
        <TableCell>
          <Badge variant={STATUS_BADGE[v.status]}>{STATUS_LABEL[v.status]}</Badge>
        </TableCell>
        <TableCell className="text-right">
          {kind === "awaiting" && (
            <Button size="sm" variant="outline" onClick={() => openBook(v)}>
              <CalendarCheck className="mr-2 h-4 w-4" />
              Book exam
            </Button>
          )}
          {kind === "booked" && (
            <Button size="sm" variant="outline" onClick={() => openResult(v)}>
              Record result
            </Button>
          )}
          {kind === "done" && <span className="text-muted-foreground text-xs">—</span>}
        </TableCell>
      </TableRow>
    );
  }

  return (
    <>
      <Header>
        <div className="flex items-center gap-2">
          <CalendarDays className="h-5 w-5" />
          <h1 className="text-xl font-semibold">Exam Bookings</h1>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <ThemeSwitch />
        </div>
      </Header>

      <TrainingSubNav active="/training/exams" />
      <Main>
        {/* What this page is for */}
        <div className="mb-5 flex gap-3 rounded-lg border bg-muted/40 p-4">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          <div className="text-sm text-muted-foreground">
            <p className="font-medium text-foreground">Track exams from voucher to result.</p>
            <p className="mt-0.5">
              An exam booking starts when a voucher is assigned to a staff member on the{" "}
              <button
                className="font-medium text-primary underline-offset-2 hover:underline"
                onClick={() => navigate({ to: "/training/vouchers" })}
              >
                Exam Vouchers
              </button>{" "}
              page. Here you book the exam date and record whether the staff member passed or
              failed.
            </p>
          </div>
        </div>

        {isLoading ? (
          <div className="space-y-2">
            {[...Array(5)].map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : (
          <div className="space-y-6">
            {/* Awaiting booking */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">
                  Awaiting Booking
                  <span className="ml-2 text-sm font-normal text-muted-foreground">
                    voucher assigned, exam date not yet set
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent className="overflow-x-auto p-0">
                {awaitingBooking.length === 0 ? (
                  <p className="text-muted-foreground py-6 text-center text-sm">
                    No exams awaiting a booking date.
                  </p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Staff</TableHead>
                        <TableHead>Exam / Product</TableHead>
                        <TableHead>Voucher #</TableHead>
                        <TableHead>Voucher Expires</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Action</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>{awaitingBooking.map((v) => renderRow(v, "awaiting"))}</TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>

            {/* Booked */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">
                  Booked — Result Pending
                  <span className="ml-2 text-sm font-normal text-muted-foreground">
                    exam date set, awaiting pass / fail
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent className="overflow-x-auto p-0">
                {booked.length === 0 ? (
                  <p className="text-muted-foreground py-6 text-center text-sm">
                    No exams currently booked.
                  </p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Staff</TableHead>
                        <TableHead>Exam / Product</TableHead>
                        <TableHead>Voucher #</TableHead>
                        <TableHead>Exam Date</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Action</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>{booked.map((v) => renderRow(v, "booked"))}</TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>

            {/* Completed */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">
                  Completed Exams
                  <span className="ml-2 text-sm font-normal text-muted-foreground">
                    results on record
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent className="overflow-x-auto p-0">
                {completed.length === 0 ? (
                  <p className="text-muted-foreground py-6 text-center text-sm">
                    No completed exams recorded yet.
                  </p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Staff</TableHead>
                        <TableHead>Exam / Product</TableHead>
                        <TableHead>Voucher #</TableHead>
                        <TableHead>Exam Date</TableHead>
                        <TableHead>Result</TableHead>
                        <TableHead className="text-right" />
                      </TableRow>
                    </TableHeader>
                    <TableBody>{completed.map((v) => renderRow(v, "done"))}</TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </div>
        )}
      </Main>

      {/* Book exam dialog */}
      <Dialog open={bookDialogOpen} onOpenChange={setBookDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Book Exam</DialogTitle>
            <DialogDescription>
              Set the date {bookVoucher?.assignedStaff?.user?.name ?? "this staff member"} will sit
              the <span className="font-medium">{bookVoucher?.productName}</span> exam.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            <Label>Exam Date</Label>
            <Input
              type="date"
              value={bookDate}
              onChange={(e) => setBookDate(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              The voucher must be used by {bookVoucher?.mustBeUsedBy} — pick a date on or before
              then.
            </p>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setBookDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={confirmBooking} disabled={updateStatusMutation.isPending}>
              Confirm Booking
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Record result dialog */}
      <Dialog open={resultDialogOpen} onOpenChange={setResultDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Record Exam Result</DialogTitle>
            <DialogDescription>
              Record the outcome of the{" "}
              <span className="font-medium">{resultVoucher?.productName}</span> exam for{" "}
              {resultVoucher?.assignedStaff?.user?.name ?? "this staff member"}.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            <Label>Outcome</Label>
            <Select
              value={resultStatus}
              onValueChange={(v) =>
                v != null && setResultStatus(v as "complete_pass" | "complete_fail" | "missed")
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="complete_pass">Passed</SelectItem>
                <SelectItem value="complete_fail">Failed</SelectItem>
                <SelectItem value="missed">Missed / did not sit</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setResultDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={confirmResult} disabled={updateStatusMutation.isPending}>
              Save Result
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
