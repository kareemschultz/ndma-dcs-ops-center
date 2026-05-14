// /staff — Staff Directory
// Replaces: apps/web/src/routes/_authenticated/staff/index.tsx
//
// Visual improvements over original:
//   • Stats strip: Active | On Leave | On-Call Eligible | Contract type counts
//   • StaffCard: coloured 2-letter avatar circle + left-border accent by status
//   • Board columns: colour-coded header chip per status
//   • Table: On-Call Eligible → blue badge (not plain Yes/No text)
//   • Status filter: already uses shadcn Select — native <select> removed from filter bar
//   • Preserve all NewStaffDialog mutation logic unchanged

import { useMemo, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Eye, LayoutGrid, Plus, Search, Shield, Table2, Users } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@ndma-dcs-staff-portal/ui/components/button";
import { Input } from "@ndma-dcs-staff-portal/ui/components/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@ndma-dcs-staff-portal/ui/components/select";
import { Skeleton } from "@ndma-dcs-staff-portal/ui/components/skeleton";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@ndma-dcs-staff-portal/ui/components/table";
import { Header } from "@/components/layout/header";
import { Main } from "@/components/layout/main";
import { ThemeSwitch } from "@/components/theme-switch";
import { useTeamFilter } from "@/lib/team-filter";
import { orpc } from "@/utils/orpc";

// NOTE: Keep NewStaffDialog from original file unchanged — only visual components below change.

export const Route = createFileRoute("/_authenticated/staff/")({
  component: StaffPage,
});

// ── Constants ──────────────────────────────────────────────────────────────────

const STATUS_OPTIONS = [
  { value: "", label: "All Statuses" },
  { value: "active", label: "Active" },
  { value: "inactive", label: "Inactive" },
  { value: "on_leave", label: "On Leave" },
  { value: "terminated", label: "Terminated" },
];

// Row/badge colour by status
const STATUS_BADGE: Record<string, string> = {
  active:     "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  inactive:   "bg-muted text-muted-foreground",
  on_leave:   "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
  terminated: "bg-muted text-muted-foreground line-through",
};

// Left border accent on card per status
const CARD_BORDER: Record<string, string> = {
  active:     "border-l-blue-500",
  on_leave:   "border-l-red-400",
  inactive:   "border-l-border",
  terminated: "border-l-border",
};

// Board column header colour
const COL_HEADER: Record<string, string> = {
  active:     "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200",
  on_leave:   "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200",
  inactive:   "bg-muted text-muted-foreground",
  terminated: "bg-muted text-muted-foreground",
};

const BOARD_COLUMNS = [
  { status: "active",     label: "Active"     },
  { status: "on_leave",   label: "On Leave"   },
  { status: "inactive",   label: "Inactive"   },
  { status: "terminated", label: "Terminated" },
] as const;

// ── Helpers ────────────────────────────────────────────────────────────────────

function getInitials(name?: string | null) {
  if (!name) return "?";
  return name.split(" ").map((s) => s[0]).slice(0, 2).join("").toUpperCase();
}

// ── Avatar ─────────────────────────────────────────────────────────────────────

function StaffAvatar({ name, size = "md" }: { name?: string | null; size?: "sm" | "md" | "lg" }) {
  const sizes = { sm: "h-7 w-7 text-xs", md: "h-9 w-9 text-sm", lg: "h-12 w-12 text-base" };
  return (
    <div className={`flex shrink-0 items-center justify-center rounded-full bg-blue-100 font-bold text-blue-700 dark:bg-blue-900/40 dark:text-blue-300 ${sizes[size]}`}>
      {getInitials(name)}
    </div>
  );
}

// ── StaffCard (Board view) ─────────────────────────────────────────────────────

function StaffCard({
  staff, onOpen,
}: {
  staff: {
    id: string; employeeId: string; phoneNumber?: string | null; jobTitle: string;
    status: string; employmentType?: string | null;
    isTeamLead?: boolean; isOnCallEligible?: boolean;
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
      className={`w-full rounded-xl border-l-4 border border-border bg-background p-4 text-left transition-colors hover:border-primary/40 hover:bg-accent/30 ${borderCls}`}
    >
      {/* Header row: avatar + name + status */}
      <div className="flex items-start gap-3">
        <StaffAvatar name={staff.user?.name} />
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">{staff.user?.name ?? "—"}</p>
          <p className="truncate text-xs text-muted-foreground">{staff.jobTitle}</p>
        </div>
        <span className={`shrink-0 rounded-md px-2 py-0.5 text-[10px] font-medium ${STATUS_BADGE[staff.status] ?? "bg-muted text-muted-foreground"}`}>
          {staff.status.replace("_", " ")}
        </span>
      </div>

      {/* Details grid */}
      <div className="mt-3 grid gap-1.5 text-xs text-muted-foreground">
        <div className="flex justify-between gap-2">
          <span>ID</span>
          <span className="font-mono font-medium text-foreground">{staff.employeeId}</span>
        </div>
        <div className="flex justify-between gap-2">
          <span>Department</span>
          <span className="text-foreground">{staff.department?.name ?? "—"}</span>
        </div>
        <div className="flex justify-between gap-2">
          <span>Phone</span>
          <span>{staff.phoneNumber ?? "—"}</span>
        </div>
      </div>

      {/* Badges */}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-1.5">
        <div className="flex flex-wrap gap-1">
          {staff.isTeamLead && (
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">Lead</span>
          )}
          {staff.isOnCallEligible && (
            <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-medium text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">On-call</span>
          )}
        </div>
        <Eye className="size-3.5 text-muted-foreground opacity-50" />
      </div>
    </button>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────

function StaffPage() {
  const navigate = useNavigate();
  const { team }  = useTeamFilter();

  const [search,    setSearch]    = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [deptFilter,   setDeptFilter]   = useState("");
  const [viewMode,  setViewMode]  = useState<"table" | "board">("table");
  const [newOpen,   setNewOpen]   = useState(false);

  const { data, isLoading } = useQuery(
    orpc.staff.list.queryOptions({ input: { limit: 200, offset: 0 } }),
  );
  const { data: departments } = useQuery(orpc.staff.getDepartments.queryOptions());

  const allStaff = data ?? [];

  // Stats (computed from full list, not filtered)
  const stats = useMemo(() => ({
    active:  allStaff.filter((s) => s.status === "active").length,
    onLeave: allStaff.filter((s) => s.status === "on_leave").length,
    onCall:  allStaff.filter((s) => s.isOnCallEligible).length,
    contract:allStaff.filter((s) => s.employmentType === "contract" || s.employmentType === "temporary").length,
  }), [allStaff]);

  // Filtered list
  const filtered = useMemo(() => allStaff.filter((s) => {
    const name = s.user?.name?.toLowerCase() ?? "";
    const id   = s.employeeId.toLowerCase();
    const q    = search.toLowerCase();
    if (q && !name.includes(q) && !id.includes(q)) return false;
    if (statusFilter && statusFilter !== "_all" && s.status !== statusFilter) return false;
    if (deptFilter && deptFilter !== "_all" && s.departmentId !== deptFilter) return false;
    return true;
  }), [allStaff, search, statusFilter, deptFilter]);

  return (
    <>
      <Header fixed>
        <div className="flex items-center gap-2">
          <Users className="size-4 text-muted-foreground" />
          <span className="text-sm font-medium">Staff Directory</span>
        </div>
        <div className="ms-auto flex items-center gap-2">
          <ThemeSwitch />
          <Button size="sm" onClick={() => setNewOpen(true)}>
            <Plus className="mr-1 size-4" /> New Staff
          </Button>
        </div>
      </Header>

      <Main className="p-0">
        {/* Stats strip */}
        <div className="flex divide-x border-b bg-muted/30 text-sm">
          {[
            { label: "Active",           value: stats.active,   cls: "" },
            { label: "On Leave",         value: stats.onLeave,  cls: stats.onLeave > 0 ? "text-red-600 dark:text-red-400" : "" },
            { label: "On-Call Eligible", value: stats.onCall,   cls: "text-blue-600 dark:text-blue-400" },
            { label: "Contract / Temp",  value: stats.contract, cls: "" },
            { label: "Total",            value: allStaff.length,cls: "text-muted-foreground" },
          ].map((s) => (
            <div key={s.label} className="flex flex-col px-5 py-2.5 first:pl-6">
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{s.label}</span>
              <span className={`text-xl font-bold tabular-nums leading-tight ${s.cls}`}>{s.value}</span>
            </div>
          ))}
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2 border-b px-6 py-3">
          <div className="relative flex-1 min-w-[200px] max-w-xs">
            <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search name or ID…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8"
            />
          </div>
          {/* shadcn Select — replaces native <select> */}
          <Select value={statusFilter || "_all"} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[150px]"><SelectValue placeholder="All Statuses" /></SelectTrigger>
            <SelectContent>
              {STATUS_OPTIONS.map((o) => <SelectItem key={o.value || "_all"} value={o.value || "_all"}>{o.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={deptFilter || "_all"} onValueChange={setDeptFilter}>
            <SelectTrigger className="w-[160px]"><SelectValue placeholder="All Departments" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="_all">All Departments</SelectItem>
              {(departments ?? []).map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <div className="ml-auto flex items-center gap-1 rounded-md border p-0.5">
            <button onClick={() => setViewMode("table")} className={`rounded px-2 py-1 transition-colors ${viewMode === "table" ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
              <Table2 className="size-4" />
            </button>
            <button onClick={() => setViewMode("board")} className={`rounded px-2 py-1 transition-colors ${viewMode === "board" ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
              <LayoutGrid className="size-4" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-6">
          {isLoading ? (
            <div className="space-y-2">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
          ) : viewMode === "table" ? (
            // ── Table view ──
            <div className="overflow-hidden rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Staff Member</TableHead>
                    <TableHead>Employee ID</TableHead>
                    <TableHead>Job Title</TableHead>
                    <TableHead>Department</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>On-Call</TableHead>
                    <TableHead className="w-12" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.length === 0 ? (
                    <TableRow><TableCell colSpan={8} className="py-12 text-center text-muted-foreground">No staff found.</TableCell></TableRow>
                  ) : filtered.map((s) => (
                    <TableRow key={s.id} className="cursor-pointer" onClick={() => navigate({ to: "/staff/$staffId", params: { staffId: s.id } })}>
                      <TableCell>
                        <div className="flex items-center gap-2.5">
                          <StaffAvatar name={s.user?.name} size="sm" />
                          <div>
                            <div className="font-medium">{s.user?.name ?? "—"}</div>
                            <div className="text-xs text-muted-foreground">{s.user?.email ?? ""}</div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell><span className="font-mono text-xs">{s.employeeId}</span></TableCell>
                      <TableCell>{s.jobTitle}</TableCell>
                      <TableCell>{s.department?.name ?? "—"}</TableCell>
                      <TableCell><span className="capitalize text-sm">{s.employmentType?.replace("_", " ") ?? "—"}</span></TableCell>
                      <TableCell>
                        <span className={`rounded-md px-2 py-0.5 text-xs font-medium ${STATUS_BADGE[s.status] ?? "bg-muted text-muted-foreground"}`}>
                          {s.status.replace("_", " ")}
                        </span>
                      </TableCell>
                      <TableCell>
                        {s.isOnCallEligible ? (
                          <span className="inline-flex items-center gap-1 rounded-md bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">
                            <Shield className="size-3" /> Eligible
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); navigate({ to: "/staff/$staffId", params: { staffId: s.id } }); }}>
                          <Eye className="size-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            // ── Board view ──
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {BOARD_COLUMNS.map((col) => {
                const colStaff = filtered.filter((s) => s.status === col.status);
                return (
                  <div key={col.status} className="space-y-2">
                    {/* Colour-coded column header */}
                    <div className={`flex items-center justify-between rounded-lg px-3 py-2 ${COL_HEADER[col.status]}`}>
                      <span className="text-sm font-semibold">{col.label}</span>
                      <span className="rounded-full bg-white/30 px-2 py-0.5 text-xs font-bold tabular-nums dark:bg-black/20">
                        {colStaff.length}
                      </span>
                    </div>
                    {colStaff.length === 0 ? (
                      <div className="rounded-xl border border-dashed py-8 text-center text-xs text-muted-foreground">Empty</div>
                    ) : colStaff.map((s) => (
                      <StaffCard key={s.id} staff={s} onOpen={(id) => navigate({ to: "/staff/$staffId", params: { staffId: id } })} />
                    ))}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </Main>

      {/* NewStaffDialog — preserve existing implementation from original file */}
      {/* {newOpen && <NewStaffDialog onClose={() => setNewOpen(false)} />} */}
    </>
  );
}
