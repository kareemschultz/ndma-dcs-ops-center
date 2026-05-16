import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Users, Search, Plus, Eye, LayoutGrid, Table2, FileDown } from "lucide-react";
import { exportStaffExcel } from "@/utils/excel-export";
import { toast } from "sonner";
import { Input } from "@ndma-dcs-staff-portal/ui/components/input";
import { Skeleton } from "@ndma-dcs-staff-portal/ui/components/skeleton";
import { Button } from "@ndma-dcs-staff-portal/ui/components/button";
import { Label } from "@ndma-dcs-staff-portal/ui/components/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@ndma-dcs-staff-portal/ui/components/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@ndma-dcs-staff-portal/ui/components/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@ndma-dcs-staff-portal/ui/components/select";
import { Header } from "@/components/layout/header";
import { Main } from "@/components/layout/main";
import { useTeamFilter } from "@/lib/team-filter";
import { ThemeSwitch } from "@/components/theme-switch";
import { FormerTag, isFormerStatus } from "@/components/former-tag";
import { DataPagination, usePagination } from "@/components/data-pagination";
import { TONES, LIFECYCLE_STATUS_TONE } from "@/lib/status-colors";
import { orpc } from "@/utils/orpc";
import { authClient } from "@/lib/auth-client";
import {
  departmentOptionLabel,
  departmentPillLabel,
  descendantDepartmentIds,
  isSubDepartment,
} from "@/lib/departments";

export const Route = createFileRoute("/_authenticated/staff/")({
  component: StaffPage,
});

const STATUS_OPTIONS = [
  { value: "", label: "All Statuses" },
  { value: "active", label: "Active" },
  { value: "inactive", label: "Inactive" },
  { value: "on_leave", label: "On Leave" },
  { value: "terminated", label: "Terminated" },
];

// Colours from the central status-color system (@/lib/status-colors).
const STATUS_COLORS: Record<string, string> = {
  active: TONES[LIFECYCLE_STATUS_TONE.active].badge,
  inactive: TONES[LIFECYCLE_STATUS_TONE.inactive].badge,
  on_leave: TONES[LIFECYCLE_STATUS_TONE.on_leave].badge,
  terminated: `${TONES[LIFECYCLE_STATUS_TONE.terminated].badge} line-through`,
};

function initials(name?: string | null): string {
  if (!name) return "?";
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

function StaffCard({
  staff,
  onOpen,
}: {
  staff: {
    id: string;
    employeeId: string;
    phoneNumber?: string | null;
    jobTitle: string;
    status: string;
    employmentType?: string | null;
    isTeamLead?: boolean;
    isOnCallEligible?: boolean;
    user?: { name?: string | null } | null;
    department?: { name?: string | null } | null;
  };
  onOpen: (id: string) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onOpen(staff.id)}
      className="w-full rounded-2xl border bg-background p-4 text-left transition-colors hover:border-primary/50 hover:bg-accent/40"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex size-11 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary">
            {initials(staff.user?.name)}
          </div>
          <div className="min-w-0">
            <p className="font-semibold truncate">
              {staff.user?.name ?? "—"}
              {isFormerStatus(staff.status) && <FormerTag />}
            </p>
            <p className="text-xs text-muted-foreground truncate">{staff.jobTitle}</p>
          </div>
        </div>
        <span
          className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${
            STATUS_COLORS[staff.status] ?? "bg-muted text-muted-foreground"
          }`}
        >
          {staff.status.replace("_", " ")}
        </span>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <div>
          <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Dept.</p>
          <p className="mt-0.5 truncate text-sm">{staff.department?.name ?? "—"}</p>
        </div>
        <div>
          <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Type</p>
          <p className="mt-0.5 truncate text-sm capitalize">
            {staff.employmentType?.replace("_", " ") ?? "—"}
          </p>
        </div>
      </div>
    </button>
  );
}

const STEP_LABELS: Record<1 | 2 | 3, string> = {
  1: "Personal",
  2: "Employment",
  3: "Emergency & Notes",
};

function NewStaffDialog({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const { data: departments } = useQuery(orpc.staff.getDepartments.queryOptions());
  const createProfile = useMutation(orpc.staff.create.mutationOptions());

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [form, setForm] = useState({
    // Step 1
    name: "",
    email: "",
    password: "",
    employeeId: "",
    phoneNumber: "",
    // Step 2
    departmentId: "",
    jobTitle: "",
    employmentType: "full_time" as "full_time" | "part_time" | "contract" | "temporary",
    startDate: new Date().toISOString().slice(0, 10),
    isTeamLead: false,
    // Step 3
    emergencyContactName: "",
    emergencyContactPhone: "",
    nextAppraisalDate: "",
    notes: "",
  });
  const [submitting, setSubmitting] = useState(false);

  function advanceStep() {
    if (step === 1) {
      if (!form.name || !form.email || !form.password || !form.employeeId) {
        toast.error("Full Name, Email, Password, and Employee ID are required.");
        return;
      }
    }
    if (step === 2) {
      if (!form.departmentId || !form.jobTitle || !form.startDate) {
        toast.error("Department, Job Title, and Start Date are required.");
        return;
      }
    }
    setStep((s) => (s < 3 ? ((s + 1) as 1 | 2 | 3) : s));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.departmentId || !form.jobTitle) {
      toast.error("Employment details are incomplete.");
      return;
    }
    setSubmitting(true);
    try {
      const { data, error } = await authClient.admin.createUser({
        name: form.name,
        email: form.email,
        password: form.password,
        role: "user",
      });
      if (error || !data?.user?.id) {
        toast.error(error?.message ?? "Failed to create user account.");
        return;
      }
      const userId = data.user.id;

      await createProfile.mutateAsync({
        userId,
        employeeId: form.employeeId,
        departmentId: form.departmentId,
        jobTitle: form.jobTitle,
        employmentType: form.employmentType,
        startDate: form.startDate,
        phoneNumber: form.phoneNumber || undefined,
        isTeamLead: form.isTeamLead,
        emergencyContactName: form.emergencyContactName || undefined,
        emergencyContactPhone: form.emergencyContactPhone || undefined,
        nextAppraisalDate: form.nextAppraisalDate || undefined,
        notes: form.notes || undefined,
      });

      toast.success(`Staff member ${form.name} created. They can sign in with their email and password.`);
      await queryClient.invalidateQueries({ queryKey: orpc.staff.list.key() });
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to create staff member.";
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <DialogContent className="sm:max-w-lg">
      <DialogHeader>
        <DialogTitle>New Staff Member</DialogTitle>
      </DialogHeader>

      {/* Step indicator */}
      <div className="flex items-center gap-2 py-1">
        {([1, 2, 3] as const).map((s) => (
          <div key={s} className="flex items-center gap-2">
            <div
              className={`flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                s === step
                  ? "bg-primary text-primary-foreground"
                  : s < step
                  ? "bg-primary/20 text-primary"
                  : "bg-muted text-muted-foreground"
              }`}
            >
              {s}
            </div>
            <span className={`text-xs ${s === step ? "font-medium text-foreground" : "text-muted-foreground"}`}>
              {STEP_LABELS[s]}
            </span>
            {s < 3 && <span className="text-muted-foreground">›</span>}
          </div>
        ))}
      </div>

      <form onSubmit={handleSubmit} className="space-y-4 py-1">
        {/* Step 1: Personal */}
        {step === 1 && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="ns-name">Full Name <span className="text-red-500">*</span></Label>
                <Input id="ns-name" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="Kareem Schultz" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ns-empid">Employee ID <span className="text-red-500">*</span></Label>
                <Input id="ns-empid" value={form.employeeId} onChange={(e) => setForm((f) => ({ ...f, employeeId: e.target.value }))} placeholder="DCS-001" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ns-email">Email <span className="text-red-500">*</span></Label>
              <Input id="ns-email" type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} placeholder="name@ndma.gov.gh" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ns-password">Temporary Password <span className="text-red-500">*</span></Label>
              <Input id="ns-password" type="password" value={form.password} onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))} placeholder="Min 8 characters" />
              <p className="text-xs text-muted-foreground">Staff will use this to sign in. Ask them to change it on first login.</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ns-phone">Phone Number</Label>
              <Input id="ns-phone" value={form.phoneNumber} onChange={(e) => setForm((f) => ({ ...f, phoneNumber: e.target.value }))} placeholder="+592 xxx xxxx" />
            </div>
          </>
        )}

        {/* Step 2: Employment */}
        {step === 2 && (
          <>
            <div className="space-y-1.5">
              <Label htmlFor="ns-title">Job Title <span className="text-red-500">*</span></Label>
              <Input id="ns-title" value={form.jobTitle} onChange={(e) => setForm((f) => ({ ...f, jobTitle: e.target.value }))} placeholder="Senior Network Engineer" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Department <span className="text-red-500">*</span></Label>
                <Select value={form.departmentId} onValueChange={(v) => setForm((f) => ({ ...f, departmentId: v ?? f.departmentId }))}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select…" />
                  </SelectTrigger>
                  <SelectContent>
                    {departments?.map((d) => (
                      <SelectItem key={d.id} value={d.id}>{departmentOptionLabel(d)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Employment Type <span className="text-red-500">*</span></Label>
                <Select value={form.employmentType} onValueChange={(v) => setForm((f) => ({ ...f, employmentType: v as typeof form.employmentType }))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="full_time">Full Time</SelectItem>
                    <SelectItem value="part_time">Part Time</SelectItem>
                    <SelectItem value="contract">Contract</SelectItem>
                    <SelectItem value="temporary">Temporary</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ns-start">Start Date <span className="text-red-500">*</span></Label>
              <Input id="ns-start" type="date" value={form.startDate} onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))} />
            </div>
            <div className="flex items-center gap-3">
              <input
                id="ns-teamlead"
                type="checkbox"
                checked={form.isTeamLead}
                onChange={(e) => setForm((f) => ({ ...f, isTeamLead: e.target.checked }))}
                className="size-4 rounded border-border"
              />
              <Label htmlFor="ns-teamlead" className="cursor-pointer font-normal">Team Lead</Label>
            </div>
          </>
        )}

        {/* Step 3: Emergency & Notes */}
        {step === 3 && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="ns-ec-name">Emergency Contact Name</Label>
                <Input id="ns-ec-name" value={form.emergencyContactName} onChange={(e) => setForm((f) => ({ ...f, emergencyContactName: e.target.value }))} placeholder="Jane Doe" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ns-ec-phone">Emergency Contact Phone</Label>
                <Input id="ns-ec-phone" value={form.emergencyContactPhone} onChange={(e) => setForm((f) => ({ ...f, emergencyContactPhone: e.target.value }))} placeholder="+592 xxx xxxx" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ns-appraisal">Next Appraisal Date</Label>
              <Input id="ns-appraisal" type="date" value={form.nextAppraisalDate} onChange={(e) => setForm((f) => ({ ...f, nextAppraisalDate: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ns-notes">Notes</Label>
              <textarea
                id="ns-notes"
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                placeholder="Any additional notes about this staff member..."
                rows={3}
                className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none"
              />
            </div>
          </>
        )}

        <DialogFooter className="flex items-center justify-between gap-2">
          <div>
            {step > 1 && (
              <Button type="button" variant="outline" onClick={() => setStep((s) => (s > 1 ? ((s - 1) as 1 | 2 | 3) : s))}>
                Back
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            {step < 3 ? (
              <Button type="button" onClick={advanceStep}>
                Next
              </Button>
            ) : (
              <Button type="submit" disabled={submitting}>
                {submitting ? "Creating…" : "Create Staff Member"}
              </Button>
            )}
          </div>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}

function StaffPage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [deptId, setDeptId] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [view, setView] = useState<"grid" | "table">("grid");
  // Staff who have left NDMA are hidden by default — toggle to include them.
  const [showFormer, setShowFormer] = useState(false);
  const { team } = useTeamFilter();

  const { data, isLoading } = useQuery(
    orpc.staff.list.queryOptions({
      input: {
        limit: 200,
        offset: 0,
        team: team === "All" ? undefined : team,
        includeFormer: showFormer,
      },
    }),
  );
  const { data: departments } = useQuery(orpc.staff.getDepartments.queryOptions());

  // Selecting a department includes that department + all of its descendant
  // sub-divisions (e.g. picking DCS includes ASN / Enterprise / Core staff).
  const deptFilterIds =
    deptId && departments
      ? new Set(descendantDepartmentIds(deptId, departments))
      : null;

  const filtered = data?.filter((s) => {
    if (status && s.status !== status) return false;
    if (deptFilterIds && !(s.departmentId && deptFilterIds.has(s.departmentId)))
      return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        s.user?.name?.toLowerCase().includes(q) ||
        s.jobTitle?.toLowerCase().includes(q) ||
        s.employeeId?.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const pagination = usePagination(filtered ?? [], 24);

  const activeCount = data?.filter((s) => s.status === "active").length ?? 0;

  return (
    <>
      <Header fixed>
        <div className="flex items-center gap-2">
          <Users className="size-4 text-muted-foreground" />
          <span className="text-sm font-medium">Staff Directory</span>
        </div>
        <div className="ms-auto flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => exportStaffExcel(data ?? [], `Staff_List_${new Date().toISOString().slice(0, 10)}.xlsx`)}
            disabled={!data?.length}
          >
            <FileDown className="size-4 mr-1.5" />
            Export
          </Button>
          <Button size="sm" onClick={() => setShowCreate(true)}>
            <Plus className="size-4 mr-1.5" /> Add staff
          </Button>
          <ThemeSwitch />
        </div>
      </Header>

      <Main>
        <div className="mb-6">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            People
          </p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight">Staff Directory</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {data ? `${activeCount} active staff across DCS, NOC, Security, HR and Ops.` : "—"}
          </p>
        </div>

        {/* Search + Status Filter */}
        <div className="mb-3 flex flex-wrap gap-3">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name, title, ID..."
              className="pl-8 w-64"
            />
          </div>

          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="rounded-xl border bg-background px-3 py-1.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          >
            {STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>

          <div className="inline-flex rounded-xl border bg-background p-0.5">
            <button
              type="button"
              onClick={() => setView("grid")}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm transition-colors ${
                view === "grid"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <LayoutGrid className="size-3.5" />
              Grid
            </button>
            <button
              type="button"
              onClick={() => setView("table")}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm transition-colors ${
                view === "table"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Table2 className="size-3.5" />
              Table
            </button>
          </div>

          <button
            type="button"
            onClick={() => setShowFormer((v) => !v)}
            aria-pressed={showFormer}
            className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-sm transition-colors ${
              showFormer
                ? "bg-primary text-primary-foreground"
                : "bg-background text-muted-foreground hover:text-foreground"
            }`}
          >
            <Users className="size-3.5" />
            {showFormer ? "Showing former staff" : "Show former staff"}
          </button>
        </div>

        {/* Department filter pills */}
        <div className="mb-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setDeptId("")}
            className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
              deptId === ""
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-background text-muted-foreground hover:border-primary hover:text-foreground"
            }`}
          >
            All
          </button>
          {departments?.map((d) => {
            const child = isSubDepartment(d);
            return (
              <button
                key={d.id}
                type="button"
                onClick={() => setDeptId(d.id === deptId ? "" : d.id)}
                title={
                  child
                    ? "Sub-division — filters to this division only"
                    : "Department — includes all sub-divisions"
                }
                className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                  child ? "border-dashed" : ""
                } ${
                  deptId === d.id
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-background text-muted-foreground hover:border-primary hover:text-foreground"
                }`}
              >
                {departmentPillLabel(d, departments)}
              </button>
            );
          })}
        </div>

        {view === "grid" ? (
          <div>
            {isLoading ? (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {Array.from({ length: 8 }).map((_, i) => (
                  <Skeleton key={i} className="h-36 rounded-2xl" />
                ))}
              </div>
            ) : !filtered?.length ? (
              <div className="rounded-xl border py-12 text-center text-muted-foreground">
                {search ? "No staff matching your search." : "No staff found."}
              </div>
            ) : (
              <>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                  {pagination.pageItems.map((staff) => (
                    <StaffCard
                      key={staff.id}
                      staff={staff}
                      onOpen={(id) => navigate({ to: "/staff/$staffId", params: { staffId: id } })}
                    />
                  ))}
                </div>
                <DataPagination
                  page={pagination.page}
                  pageCount={pagination.pageCount}
                  total={pagination.total}
                  rangeLabel={pagination.rangeLabel}
                  onPageChange={pagination.setPage}
                  className="mt-3"
                />
              </>
            )}
          </div>
        ) : (
          <div className="rounded-xl border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Employee ID</TableHead>
                  <TableHead>Phone Number</TableHead>
                  <TableHead>Job Title</TableHead>
                  <TableHead>Department</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>On-Call Eligible</TableHead>
                  <TableHead className="w-16" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  Array.from({ length: 6 }).map((_, i) => (
                    <TableRow key={i}>
                      {Array.from({ length: 9 }).map((_, j) => (
                        <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : !filtered?.length ? (
                  <TableRow>
                    <TableCell colSpan={9} className="py-12 text-center text-muted-foreground">
                      {search ? "No staff matching your search." : "No staff found."}
                    </TableCell>
                  </TableRow>
                ) : (
                  pagination.pageItems.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell>
                        <Link
                          to="/staff/$staffId"
                          params={{ staffId: s.id }}
                          className="font-medium hover:underline"
                        >
                          {s.user?.name ?? "—"}
                        </Link>
                        {s.isTeamLead && (
                          <span className="ml-2 text-xs text-amber-600 dark:text-amber-400">Lead</span>
                        )}
                        {isFormerStatus(s.status) && <FormerTag />}
                      </TableCell>
                      <TableCell className="font-mono text-muted-foreground text-xs">
                        {s.employeeId}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {s.phoneNumber ?? "—"}
                      </TableCell>
                      <TableCell>{s.jobTitle}</TableCell>
                      <TableCell>{s.department?.name ?? "—"}</TableCell>
                      <TableCell className="capitalize">
                        {s.employmentType?.replace("_", " ")}
                      </TableCell>
                      <TableCell>
                        <span
                          className={`inline-flex items-center rounded-lg px-2 py-0.5 text-xs font-medium ${
                            STATUS_COLORS[s.status] ?? "bg-muted text-muted-foreground"
                          }`}
                        >
                          {s.status?.replace("_", " ")}
                        </span>
                      </TableCell>
                      <TableCell>
                        {s.isOnCallEligible ? (
                          <span className="text-blue-600 text-xs">Yes</span>
                        ) : (
                          <span className="text-muted-foreground text-xs">No</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-8"
                          title="View profile"
                          onClick={() =>
                            navigate({ to: "/staff/$staffId", params: { staffId: s.id } })
                          }
                        >
                          <Eye className="size-3.5" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
            <div className="border-t px-2">
              <DataPagination
                page={pagination.page}
                pageCount={pagination.pageCount}
                total={pagination.total}
                rangeLabel={pagination.rangeLabel}
                onPageChange={pagination.setPage}
              />
            </div>
          </div>
        )}
      </Main>
      <Dialog open={showCreate} onOpenChange={(o) => !o && setShowCreate(false)}>
        <NewStaffDialog onClose={() => setShowCreate(false)} />
      </Dialog>
    </>
  );
}
