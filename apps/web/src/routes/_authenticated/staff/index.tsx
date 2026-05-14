import { useMemo, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Users, Search, Plus, Eye, LayoutGrid, Table2, FileDown, Shield } from "lucide-react";
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
  DialogDescription,
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
import { orpc } from "@/utils/orpc";
import { authClient } from "@/lib/auth-client";

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

const STATUS_COLORS: Record<string, string> = {
  active: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  inactive: "bg-muted text-muted-foreground",
  on_leave: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
  terminated: "bg-muted text-muted-foreground line-through",
};

const CARD_BORDER: Record<string, string> = {
  active: "border-l-blue-500",
  on_leave: "border-l-red-400",
  inactive: "border-l-border",
  terminated: "border-l-border",
};

const COL_HEADER: Record<string, string> = {
  active: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200",
  on_leave: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200",
  inactive: "bg-muted text-muted-foreground",
  terminated: "bg-muted text-muted-foreground",
};

const BOARD_COLUMNS: Array<{
  status: "" | "active" | "inactive" | "on_leave" | "terminated";
  label: string;
}> = [
  { status: "active", label: "Active" },
  { status: "on_leave", label: "On Leave" },
  { status: "inactive", label: "Inactive" },
  { status: "terminated", label: "Terminated" },
];

function getInitials(name?: string | null) {
  if (!name) return "?";
  return name.split(" ").map((s) => s[0]).slice(0, 2).join("").toUpperCase();
}

function StaffAvatar({ name, size = "md" }: { name?: string | null; size?: "sm" | "md" | "lg" }) {
  const sizes = { sm: "h-7 w-7 text-xs", md: "h-9 w-9 text-sm", lg: "h-12 w-12 text-base" };
  return (
    <div
      className={`flex shrink-0 items-center justify-center rounded-full bg-blue-100 font-bold text-blue-700 dark:bg-blue-900/40 dark:text-blue-300 ${sizes[size]}`}
    >
      {getInitials(name)}
    </div>
  );
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
  const borderCls = CARD_BORDER[staff.status] ?? "border-l-border";
  return (
    <button
      type="button"
      onClick={() => onOpen(staff.id)}
      className={`w-full rounded-2xl border border-l-4 bg-background p-4 text-left transition-colors hover:border-primary/50 hover:bg-accent/40 ${borderCls}`}
    >
      <div className="flex items-start gap-3">
        <StaffAvatar name={staff.user?.name} />
        <div className="min-w-0 flex-1">
          <p className="font-medium truncate">{staff.user?.name ?? "—"}</p>
          <p className="text-xs text-muted-foreground truncate">{staff.jobTitle}</p>
        </div>
        <span
          className={`inline-flex items-center rounded-lg px-2 py-0.5 text-[10px] font-medium shrink-0 ${
            STATUS_COLORS[staff.status] ?? "bg-muted text-muted-foreground"
          }`}
        >
          {staff.status.replace("_", " ")}
        </span>
      </div>

      <div className="mt-3 grid gap-2 text-xs text-muted-foreground">
        <div className="flex items-center justify-between gap-2">
          <span>Employee ID</span>
          <span className="font-mono">{staff.employeeId}</span>
        </div>
        <div className="flex items-center justify-between gap-2">
          <span>Phone</span>
          <span>{staff.phoneNumber ?? "—"}</span>
        </div>
        <div className="flex items-center justify-between gap-2">
          <span>Department</span>
          <span>{staff.department?.name ?? "—"}</span>
        </div>
        <div className="flex items-center justify-between gap-2">
          <span>Type</span>
          <span className="capitalize">{staff.employmentType?.replace("_", " ") ?? "—"}</span>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {staff.isTeamLead && (
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
            Lead
          </span>
        )}
        {staff.isOnCallEligible && (
          <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-medium text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">
            On-call
          </span>
        )}
      </div>
    </button>
  );
}

function NewStaffDialog({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const { data: departments } = useQuery(orpc.staff.getDepartments.queryOptions());
  const createProfile = useMutation(orpc.staff.create.mutationOptions());

  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    employeeId: "",
    departmentId: "",
    jobTitle: "",
    employmentType: "full_time" as "full_time" | "part_time" | "contract" | "temporary",
    startDate: new Date().toISOString().slice(0, 10),
  });
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name || !form.email || !form.password || !form.employeeId || !form.departmentId || !form.jobTitle) {
      toast.error("All fields are required.");
      return;
    }
    setSubmitting(true);
    try {
      // 1. Create the auth user via Better Auth admin
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

      // 2. Create the staff profile linked to the user
      await createProfile.mutateAsync({
        userId,
        employeeId: form.employeeId,
        departmentId: form.departmentId,
        jobTitle: form.jobTitle,
        employmentType: form.employmentType,
        startDate: form.startDate,
      });

      toast.success(`Staff member ${form.name} created. They can sign in with their email and password.`);
      await queryClient.invalidateQueries({ queryKey: orpc.staff.list.key() });
      onClose();
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to create staff member.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <DialogContent className="sm:max-w-md">
      <DialogHeader>
        <DialogTitle>New Staff Member</DialogTitle>
        <DialogDescription>
          Create a user account and link a staff profile. The new staff member can sign in
          with the email and temporary password you set here.
        </DialogDescription>
      </DialogHeader>
      <form onSubmit={handleSubmit} className="space-y-4 py-2">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="ns-name">Full Name</Label>
            <Input id="ns-name" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="Kareem Schultz" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ns-empid">Employee ID</Label>
            <Input id="ns-empid" value={form.employeeId} onChange={(e) => setForm((f) => ({ ...f, employeeId: e.target.value }))} placeholder="DCS-001" />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ns-email">Email</Label>
          <Input id="ns-email" type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} placeholder="name@ndma.gov.gh" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ns-password">Temporary Password</Label>
          <Input id="ns-password" type="password" value={form.password} onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))} placeholder="Min 8 characters" />
          <p className="text-xs text-muted-foreground">Staff will use this to sign in. Ask them to change it on first login.</p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ns-title">Job Title</Label>
          <Input id="ns-title" value={form.jobTitle} onChange={(e) => setForm((f) => ({ ...f, jobTitle: e.target.value }))} placeholder="Senior Network Engineer" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Department</Label>
            <Select value={form.departmentId} onValueChange={(v) => setForm((f) => ({ ...f, departmentId: v ?? f.departmentId }))}>
              <SelectTrigger>
                <SelectValue placeholder="Select…" />
              </SelectTrigger>
              <SelectContent>
                {departments?.map((d) => (
                  <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Employment Type</Label>
            <Select value={form.employmentType} onValueChange={(v) => setForm((f) => ({ ...f, employmentType: v as any }))}>
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
          <Label htmlFor="ns-start">Start Date</Label>
          <Input id="ns-start" type="date" value={form.startDate} onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))} />
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={submitting}>
            {submitting ? "Creating…" : "Create Staff Member"}
          </Button>
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
  const [view, setView] = useState<"table" | "board">("table");
  const { team } = useTeamFilter();

  const { data, isLoading } = useQuery(
    orpc.staff.list.queryOptions({
      input: { limit: 200, offset: 0, team: team === "All" ? undefined : team },
    }),
  );
  const { data: departments } = useQuery(orpc.staff.getDepartments.queryOptions());

  const filtered = data?.filter((s) => {
    if (status && s.status !== status) return false;
    if (deptId && s.departmentId !== deptId) return false;
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

  const stats = useMemo(() => {
    const all = data ?? [];
    return {
      active: all.filter((s) => s.status === "active").length,
      onLeave: all.filter((s) => s.status === "on_leave").length,
      onCall: all.filter((s) => s.isOnCallEligible).length,
      contract: all.filter(
        (s) => s.employmentType === "contract" || s.employmentType === "temporary",
      ).length,
    };
  }, [data]);

  const boardColumns = useMemo(
    () =>
      BOARD_COLUMNS.map((column) => ({
        ...column,
        staff: (filtered ?? []).filter((staff) => staff.status === column.status),
      })),
    [filtered],
  );

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
            Export Excel
          </Button>
          <Button size="sm" onClick={() => setShowCreate(true)}>
            <Plus className="size-4 mr-1.5" /> New Staff
          </Button>
          <ThemeSwitch />
        </div>
      </Header>

      <Main>
        <div className="mb-6">
          <h1 className="text-2xl font-bold tracking-tight">Staff Directory</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {data?.length ?? "—"} staff members
          </p>
        </div>

        {/* Stats strip */}
        <div className="mb-4 overflow-hidden rounded-2xl border bg-muted/30">
          <div className="flex divide-x text-sm">
            {[
              { label: "Active", value: stats.active, cls: "" },
              {
                label: "On Leave",
                value: stats.onLeave,
                cls: stats.onLeave > 0 ? "text-red-600 dark:text-red-400" : "",
              },
              {
                label: "On-Call Eligible",
                value: stats.onCall,
                cls: "text-blue-600 dark:text-blue-400",
              },
              { label: "Contract / Temp", value: stats.contract, cls: "" },
              {
                label: "Total",
                value: data?.length ?? 0,
                cls: "text-muted-foreground",
              },
            ].map((s) => (
              <div key={s.label} className="flex flex-1 flex-col px-5 py-3">
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  {s.label}
                </span>
                <span className={`text-xl font-bold tabular-nums leading-tight ${s.cls}`}>
                  {s.value}
                </span>
              </div>
            ))}
          </div>
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

          <Select
            value={status === "" ? "_all" : status}
            onValueChange={(v) => setStatus(!v || v === "_all" ? "" : v)}
          >
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="All Statuses" />
            </SelectTrigger>
            <SelectContent>
              {STATUS_OPTIONS.map((o) => (
                <SelectItem key={o.value || "_all"} value={o.value || "_all"}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <div className="inline-flex rounded-xl border bg-background p-0.5">
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
            <button
              type="button"
              onClick={() => setView("board")}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm transition-colors ${
                view === "board"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <LayoutGrid className="size-3.5" />
              Board
            </button>
          </div>
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
          {departments?.map((d) => (
            <button
              key={d.id}
              type="button"
              onClick={() => setDeptId(d.id === deptId ? "" : d.id)}
              className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                deptId === d.id
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-background text-muted-foreground hover:border-primary hover:text-foreground"
              }`}
            >
              {d.name}
            </button>
          ))}
        </div>

        {view === "board" ? (
          <div className="space-y-4">
            {isLoading ? (
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                {BOARD_COLUMNS.map((column) => (
                  <Skeleton key={column.status} className="h-64 rounded-2xl" />
                ))}
              </div>
            ) : !filtered?.length ? (
              <div className="rounded-xl border py-12 text-center text-muted-foreground">
                {search ? "No staff matching your search." : "No staff found."}
              </div>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                {boardColumns.map((column) => (
                  <div key={column.status} className="rounded-2xl border bg-muted/20 p-3">
                    <div
                      className={`mb-3 flex items-center justify-between rounded-lg px-3 py-2 ${
                        COL_HEADER[column.status] ?? "bg-background text-foreground"
                      }`}
                    >
                      <h3 className="text-sm font-semibold">{column.label}</h3>
                      <span className="rounded-full bg-white/40 px-2 py-0.5 text-xs font-bold tabular-nums dark:bg-black/20">
                        {column.staff.length}
                      </span>
                    </div>
                    <div className="space-y-3">
                      {column.staff.length === 0 ? (
                        <div className="rounded-xl border border-dashed p-4 text-center text-xs text-muted-foreground">
                          No staff in this lane
                        </div>
                      ) : (
                        column.staff.map((staff) => (
                          <StaffCard key={staff.id} staff={staff} onOpen={(id) => navigate({ to: "/staff/$staffId", params: { staffId: id } })} />
                        ))
                      )}
                    </div>
                  </div>
                ))}
              </div>
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
                  filtered.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell>
                        <div className="flex items-center gap-2.5">
                          <StaffAvatar name={s.user?.name} size="sm" />
                          <div className="min-w-0">
                            <Link
                              to="/staff/$staffId"
                              params={{ staffId: s.id }}
                              className="font-medium hover:underline"
                            >
                              {s.user?.name ?? "—"}
                            </Link>
                            {s.isTeamLead && (
                              <span className="ml-2 text-xs text-amber-600 dark:text-amber-400">
                                Lead
                              </span>
                            )}
                          </div>
                        </div>
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
                          <span className="inline-flex items-center gap-1 rounded-md bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">
                            <Shield className="size-3" /> Eligible
                          </span>
                        ) : (
                          <span className="text-muted-foreground text-xs">—</span>
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
          </div>
        )}
      </Main>
      <Dialog open={showCreate} onOpenChange={(o) => !o && setShowCreate(false)}>
        <NewStaffDialog onClose={() => setShowCreate(false)} />
      </Dialog>
    </>
  );
}
