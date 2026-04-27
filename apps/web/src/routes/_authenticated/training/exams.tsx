import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Calendar, Plus } from "lucide-react";
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
import { Textarea } from "@ndma-dcs-staff-portal/ui/components/textarea";

import { Header } from "@/components/layout/header";
import { Main } from "@/components/layout/main";
import { ThemeSwitch } from "@/components/theme-switch";
import { orpc } from "@/utils/orpc";

export const Route = createFileRoute("/_authenticated/training/exams")({
  component: ExamSchedulePage,
});

const STATUS_BADGE: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  scheduled: "secondary",
  passed: "default",
  failed: "destructive",
  cancelled: "outline",
  rescheduled: "secondary",
};

type ExamForm = {
  staffProfileId: string;
  examName: string;
  scheduledDate: string;
  vendor: string;
  notes: string;
};

const EMPTY_FORM: ExamForm = {
  staffProfileId: "",
  examName: "",
  scheduledDate: "",
  vendor: "",
  notes: "",
};

export default function ExamSchedulePage() {
  const queryClient = useQueryClient();
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [form, setForm] = useState<ExamForm>(EMPTY_FORM);

  const { data: examSchedules, isLoading } = useQuery(
    orpc.compliance.training.records.list.queryOptions({
      input: { status: "Enrolled", limit: 200 },
    }),
  );

  const { data: staff } = useQuery(orpc.staff.list.queryOptions({ input: { limit: 200 } }));
  const { data: vouchers } = useQuery(
    orpc.examVouchers.list.queryOptions({ input: { status: "assigned" } }),
  );

  // Use existing training records with status Enrolled as "upcoming exams"
  const filteredRecords = examSchedules?.filter((r) => {
    if (statusFilter === "all") return true;
    return r.status === statusFilter;
  }) ?? [];

  return (
    <>
      <Header>
        <div className="flex items-center gap-2">
          <Calendar className="h-5 w-5" />
          <h1 className="text-xl font-semibold">Exam Schedule</h1>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <ThemeSwitch />
        </div>
      </Header>

      <Main>
        <div className="mb-4 flex flex-wrap items-center gap-3">
          {(["all", "Enrolled", "In Progress", "Completed", "Failed"] as const).map((s) => (
            <Button
              key={s}
              variant={statusFilter === s ? "default" : "outline"}
              size="sm"
              onClick={() => setStatusFilter(s)}
            >
              {s === "all" ? "All" : s}
            </Button>
          ))}
        </div>

        {/* Vouchers with assigned staff — exam actions */}
        {vouchers && vouchers.length > 0 && (
          <Card className="mb-6">
            <CardHeader className="pb-2">
              <CardTitle className="text-base text-amber-600">
                Assigned Vouchers — Pending Booking
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Voucher</TableHead>
                    <TableHead>Product</TableHead>
                    <TableHead>Assigned To</TableHead>
                    <TableHead>Must Use By</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {vouchers.map((v) => (
                    <TableRow key={v.id}>
                      <TableCell className="font-mono text-xs">{v.voucherNumber}</TableCell>
                      <TableCell>{v.productName}</TableCell>
                      <TableCell>{v.assignedStaff?.user?.name ?? "—"}</TableCell>
                      <TableCell>{v.mustBeUsedBy}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}

        {/* Training records (enrolled/upcoming) */}
        <Card>
          <CardHeader>
            <CardTitle>Training Records — {statusFilter === "all" ? "All" : statusFilter}</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="space-y-2 p-4">
                {[...Array(5)].map((_, i) => (
                  <Skeleton key={i} className="h-10 w-full" />
                ))}
              </div>
            ) : filteredRecords.length === 0 ? (
              <p className="text-muted-foreground py-8 text-center text-sm">No records found</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Staff</TableHead>
                    <TableHead>Course</TableHead>
                    <TableHead>Target Date</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Notes</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredRecords.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="font-medium">
                        {r.staffProfile?.user?.name ?? r.staffId}
                      </TableCell>
                      <TableCell>{r.course?.title ?? "—"}</TableCell>
                      <TableCell>{r.targetDate ?? "—"}</TableCell>
                      <TableCell>
                        <Badge variant={STATUS_BADGE[r.status] ?? "outline"}>{r.status}</Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground max-w-xs truncate text-sm">
                        {r.notes ?? "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </Main>
    </>
  );
}
