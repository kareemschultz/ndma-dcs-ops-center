import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { FileText, Plus, Trash2 } from "lucide-react";
import { format } from "date-fns";
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

import { Header } from "@/components/layout/header";
import { Main } from "@/components/layout/main";
import { ThemeSwitch } from "@/components/theme-switch";
import { orpc } from "@/utils/orpc";

export const Route = createFileRoute("/_authenticated/timesheets/documents")({
  component: TimesheetDocumentsPage,
});

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const createSchema = z.object({
  staffId: z.string().min(1, "Staff required"),
  year: z.number().int().min(2020).max(2050),
  month: z.number().int().min(1).max(12),
  office: z.enum(["castellani", "liliendaal"]),
  filename: z.string().min(1, "Filename required"),
  storagePath: z.string().optional(),
});
type CreateForm = z.infer<typeof createSchema>;

function CreateDocumentDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const staffQuery = useQuery(orpc.staff.list.queryOptions({ input: { limit: 200, offset: 0 } }));
  const staffList = staffQuery.data ?? [];
  const currentYear = new Date().getFullYear();

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
    reset,
  } = useForm<CreateForm>({
    resolver: zodResolver(createSchema),
    defaultValues: {
      staffId: "",
      year: currentYear,
      month: new Date().getMonth() + 1,
      office: "castellani",
      filename: "",
      storagePath: "",
    },
  });

  const staffId = watch("staffId");
  const year = watch("year");
  const month = watch("month");
  const office = watch("office");

  const mut = useMutation(
    orpc.timesheetDocuments.create.mutationOptions({
      onSuccess: () => {
        toast.success("Document registered");
        qc.invalidateQueries({ queryKey: orpc.timesheetDocuments.list.key() });
        onClose();
        reset();
      },
      onError: (e) => toast.error(e.message),
    }),
  );

  const YEARS = [currentYear - 2, currentYear - 1, currentYear, currentYear + 1];

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Register Timesheet Document</DialogTitle>
          <DialogDescription>Index a PDF timesheet (metadata only — no file parsing)</DialogDescription>
        </DialogHeader>
        <form className="space-y-4" onSubmit={handleSubmit((d) => mut.mutate(d))}>
          <div className="space-y-1.5">
            <Label htmlFor="tsd-staff">Staff Member</Label>
            <Select value={staffId} onValueChange={(v) => v != null && setValue("staffId", v)}>
              <SelectTrigger id="tsd-staff">
                <SelectValue>
                  {staffId
                    ? (() => { const s = staffList.find((x: { id: string; employeeId: string; user?: { name?: string } | null }) => x.id === staffId); return s?.user?.name ?? s?.employeeId ?? "Unnamed"; })()
                    : "Select staff"}
                </SelectValue>
              </SelectTrigger>
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
              <Label htmlFor="tsd-year">Year</Label>
              <Select value={String(year)} onValueChange={(v) => v != null && setValue("year", Number(v))}>
                <SelectTrigger id="tsd-year"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {YEARS.map((y) => (
                    <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="tsd-month">Month</Label>
              <Select value={String(month)} onValueChange={(v) => v != null && setValue("month", Number(v))}>
                <SelectTrigger id="tsd-month"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {MONTH_NAMES.map((m, i) => (
                    <SelectItem key={i + 1} value={String(i + 1)}>{m}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="tsd-office">Office</Label>
            <Select value={office} onValueChange={(v) => v != null && setValue("office", v as "castellani" | "liliendaal")}>
              <SelectTrigger id="tsd-office"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="castellani">Castellani</SelectItem>
                <SelectItem value="liliendaal">Liliendaal</SelectItem>
              </SelectContent>
            </Select>
            {errors.office && <p className="text-xs text-destructive">{errors.office.message}</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="tsd-filename">Filename</Label>
            <Input id="tsd-filename" {...register("filename")} placeholder="e.g. timesheet_jan2025_john.pdf" />
            {errors.filename && <p className="text-xs text-destructive">{errors.filename.message}</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="tsd-path">Storage Path (optional)</Label>
            <Input id="tsd-path" {...register("storagePath")} placeholder="e.g. /timesheets/2025/01/" />
          </div>
          <Button type="submit" className="w-full" disabled={mut.isPending}>
            {mut.isPending ? "Saving…" : "Register Document"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function TimesheetDocumentsPage() {
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState<string>(String(currentYear));
  const [month, setMonth] = useState<string>("all");
  const [office, setOffice] = useState<string>("all");
  const [createOpen, setCreateOpen] = useState(false);

  const qc = useQueryClient();

  const { data: docs, isLoading } = useQuery(
    orpc.timesheetDocuments.list.queryOptions({
      input: {
        year: year !== "all" ? Number(year) : undefined,
        month: month !== "all" ? Number(month) : undefined,
        office: office !== "all" ? (office as "castellani" | "liliendaal") : undefined,
      },
    }),
  );

  const deleteMut = useMutation(
    orpc.timesheetDocuments.delete.mutationOptions({
      onSuccess: () => {
        toast.success("Document removed");
        qc.invalidateQueries({ queryKey: orpc.timesheetDocuments.list.key() });
      },
      onError: (e) => toast.error(e.message),
    }),
  );

  const YEARS = [currentYear - 2, currentYear - 1, currentYear, currentYear + 1];

  return (
    <>
      <Header>
        <div className="flex items-center gap-2">
          <FileText className="size-5" />
          <h1 className="text-lg font-semibold">Timesheet Documents</h1>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <ThemeSwitch />
        </div>
      </Header>

      <Main>
        {/* Filters */}
        <div className="mb-6 flex flex-wrap gap-3 items-end">
          <div className="flex flex-col gap-1">
            <span className="text-xs text-muted-foreground">Year</span>
            <Select value={year} onValueChange={(v) => v != null && setYear(v)}>
              <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All years</SelectItem>
                {YEARS.map((y) => (
                  <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs text-muted-foreground">Month</span>
            <Select value={month} onValueChange={(v) => v != null && setMonth(v)}>
              <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All months</SelectItem>
                {MONTH_NAMES.map((m, i) => (
                  <SelectItem key={i + 1} value={String(i + 1)}>{m}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs text-muted-foreground">Office</span>
            <Select value={office} onValueChange={(v) => v != null && setOffice(v)}>
              <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All offices</SelectItem>
                <SelectItem value="castellani">Castellani</SelectItem>
                <SelectItem value="liliendaal">Liliendaal</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="ml-auto">
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="size-4 mr-1" /> Register Document
            </Button>
          </div>
        </div>

        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
          </div>
        ) : (
          <div className="rounded-lg border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Staff</TableHead>
                  <TableHead>Year</TableHead>
                  <TableHead>Month</TableHead>
                  <TableHead>Office</TableHead>
                  <TableHead>Filename</TableHead>
                  <TableHead>Uploaded</TableHead>
                  <TableHead>Uploader</TableHead>
                  <TableHead className="w-12" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {(docs ?? []).map((doc) => (
                  <TableRow key={doc.id}>
                    <TableCell className="font-medium">
                      {doc.staffProfile?.user?.name ?? doc.staffProfile?.employeeId ?? "Unknown"}
                    </TableCell>
                    <TableCell>{doc.year}</TableCell>
                    <TableCell>{MONTH_NAMES[doc.month - 1]}</TableCell>
                    <TableCell className="capitalize">{doc.office}</TableCell>
                    <TableCell className="font-mono text-xs">{doc.filename}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {format(new Date(doc.uploadedAt), "d MMM yyyy")}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {doc.uploader?.name ?? "—"}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive hover:text-destructive"
                        disabled={deleteMut.isPending}
                        onClick={() => {
                          if (confirm(`Remove "${doc.filename}"?`)) {
                            deleteMut.mutate({ id: doc.id });
                          }
                        }}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {(docs ?? []).length === 0 && (
                  <TableRow>
                    <TableCell colSpan={8} className="h-24 text-center text-muted-foreground">
                      No timesheet documents found. Register one with the button above.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        )}
      </Main>

      <CreateDocumentDialog open={createOpen} onClose={() => setCreateOpen(false)} />
    </>
  );
}
