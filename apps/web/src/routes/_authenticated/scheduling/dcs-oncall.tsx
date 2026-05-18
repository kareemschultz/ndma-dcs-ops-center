// /scheduling/dcs-oncall — DCS On-Call Weekly Roster
//
// Changes from prior version:
//   • "Add Week" button + dialog to create a new week entry
//   • Default view shows ALL weeks (no DEFAULT_WINDOW limit)
//   • "Show all" toggle removed
//   • Date column updated to Sun → Sat display using weekStartDate / weekEndDate
//   • "No weeks" prompt updated to mention "Add Week"
//   • Current week highlight (blue border + "Now" badge) preserved

import { useEffect, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import { CalendarCheck2, Pencil, Plus, TriangleAlert, User } from "lucide-react";
import { useSession } from "@/lib/auth-client";
import { toast } from "sonner";

import { Badge } from "@ndma-dcs-staff-portal/ui/components/badge";
import { Button } from "@ndma-dcs-staff-portal/ui/components/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@ndma-dcs-staff-portal/ui/components/dialog";
import { Input } from "@ndma-dcs-staff-portal/ui/components/input";
import { Label } from "@ndma-dcs-staff-portal/ui/components/label";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@ndma-dcs-staff-portal/ui/components/popover";
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
import { SchedulingSubNav } from "@/components/layout/scheduling-sub-nav";
import { orpc } from "@/utils/orpc";
import { getHolidaysInRange } from "@/utils/holidays";

export const Route = createFileRoute("/_authenticated/scheduling/dcs-oncall")({
  component: DcsOnCallPage,
});

const CURRENT_YEAR = new Date().getFullYear();
const TODAY = new Date().toISOString().slice(0, 10); // "YYYY-MM-DD"

type StaffItem = { id: string; employeeId: string; userId?: string | null; user?: { id?: string | null; name?: string | null } | null };

type WeekRow = {
  id: string; year: number; weekNum: number;
  weekStartDate: string; weekEndDate: string;
  leadEngineerId: string | null; asnSupportId: string | null;
  enterpriseSupportId: string | null; coreSupportId: string | null;
  notes: string | null;
  leadEngineer?: { id: string; user?: { name?: string | null } | null } | null;
  asnSupport?:   { id: string; user?: { name?: string | null } | null } | null;
  enterpriseSupport?: { id: string; user?: { name?: string | null } | null } | null;
  coreSupport?:  { id: string; user?: { name?: string | null } | null } | null;
};

function staffName(s?: { user?: { name?: string | null } | null } | null) {
  return s?.user?.name ?? null;
}

function initials(name: string | null | undefined) {
  if (!name) return "?";
  return name.split(" ").map((s) => s[0]).slice(0, 2).join("").toUpperCase();
}

// Coloured chip used in each role cell
function StaffChip({ name }: { name: string | null }) {
  if (!name) {
    return <span className="text-sm text-muted-foreground italic">Unassigned</span>;
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-medium text-blue-800 dark:bg-blue-900/40 dark:text-blue-200">
      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-200 text-[10px] font-bold dark:bg-blue-800">
        {initials(name)}
      </span>
      {name}
    </span>
  );
}

// ── Role fields shared by both dialogs + inline cell ──────────────────────────

type RoleFormKeys = "leadEngineerId" | "asnSupportId" | "enterpriseSupportId" | "coreSupportId";

const ROLE_FIELDS: Array<{ key: RoleFormKeys; label: string }> = [
  { key: "leadEngineerId",      label: "Lead Engineer" },
  { key: "asnSupportId",        label: "ASN Support" },
  { key: "enterpriseSupportId", label: "Enterprise Support" },
  { key: "coreSupportId",       label: "CORE Support" },
];

// ── Inline role cell — click chip to pop open staff picker ────────────────────

// STAGE 3 — a single leave clash for an on-call assignment.
type LeaveConflict = {
  staffProfileId: string;
  role: string;
  leaveType: string;
  startDate: string;
  endDate: string;
};

function InlineRoleCell({
  week,
  roleKey,
  staffList,
  onAssign,
  conflict,
}: {
  week: WeekRow;
  roleKey: RoleFormKeys;
  staffList: StaffItem[];
  onAssign: (weekId: string, roleKey: RoleFormKeys, staffId: string | null) => void;
  conflict?: LeaveConflict;
}) {
  const [open, setOpen] = useState(false);
  const currentStaffId = week[roleKey] as string | null;
  const currentStaff = staffList.find((s) => s.id === currentStaffId);
  const currentName = currentStaff?.user?.name ?? null;

  function assign(staffId: string | null) {
    setOpen(false);
    onAssign(week.id, roleKey, staffId);
  }

  const roleLabel = ROLE_FIELDS.find((r) => r.key === roleKey)?.label ?? roleKey;

  return (
    <div className="flex items-center gap-1.5">
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        className={[
          "inline-flex cursor-pointer items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50",
          currentName
            ? "bg-blue-100 text-blue-800 hover:bg-blue-200 dark:bg-blue-900/40 dark:text-blue-200 dark:hover:bg-blue-900/60"
            : "italic text-muted-foreground hover:text-foreground",
        ].join(" ")}
        title="Click to reassign"
      >
        {currentName ? (
          <>
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-200 text-[10px] font-bold dark:bg-blue-800">
              {initials(currentName)}
            </span>
            {currentName}
          </>
        ) : (
          "Unassigned"
        )}
      </PopoverTrigger>
      <PopoverContent className="w-52 p-2" side="bottom" align="start">
        <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          {roleLabel}
        </p>
        <div className="max-h-52 space-y-0.5 overflow-y-auto">
          <button
            onClick={() => assign(null)}
            className={[
              "w-full rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-muted",
              !currentStaffId ? "font-semibold" : "text-muted-foreground",
            ].join(" ")}
          >
            Unassigned
          </button>
          {staffList.map((s) => (
            <button
              key={s.id}
              onClick={() => assign(s.id)}
              className={[
                "w-full rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-muted",
                s.id === currentStaffId ? "font-semibold bg-muted/60" : "",
              ].join(" ")}
            >
              {s.user?.name ?? s.employeeId}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
      {/* STAGE 3 — approved leave clashes with this on-call assignment */}
      {conflict && currentName && (
        <span
          className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-amber-100 px-1.5 py-0.5 text-[9px] font-semibold text-amber-800 dark:bg-amber-900/40 dark:text-amber-200"
          title={`On approved ${conflict.leaveType} (${conflict.startDate} → ${conflict.endDate}) — overlaps this on-call week`}
        >
          <TriangleAlert className="size-2.5" />
          On leave
        </span>
      )}
    </div>
  );
}

// ── Add Week Dialog ────────────────────────────────────────────────────────────

type AddForm = {
  weekNum: string;
  weekStartDate: string;
  weekEndDate: string;
  leadEngineerId: string;
  asnSupportId: string;
  enterpriseSupportId: string;
  coreSupportId: string;
};

function AddWeekDialog({ open, onOpenChange, year, staffList }: {
  open: boolean; onOpenChange: (v: boolean) => void; year: number; staffList: StaffItem[];
}) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<AddForm>({
    weekNum: "",
    weekStartDate: "",
    weekEndDate: "",
    leadEngineerId: "",
    asnSupportId: "",
    enterpriseSupportId: "",
    coreSupportId: "",
  });

  const mutation = useMutation(
    orpc.scheduling.dcsOnCall.upsertWeek.mutationOptions({
      onSuccess: () => {
        toast.success("Week added");
        queryClient.invalidateQueries({ queryKey: orpc.scheduling.dcsOnCall.list.key() });
        onOpenChange(false);
        setForm({
          weekNum: "", weekStartDate: "", weekEndDate: "",
          leadEngineerId: "", asnSupportId: "", enterpriseSupportId: "", coreSupportId: "",
        });
      },
      onError: (err: Error) => toast.error(err.message ?? "Failed to add week"),
    }),
  );

  function handleSubmit() {
    const weekNumParsed = parseInt(form.weekNum, 10);
    if (
      isNaN(weekNumParsed) || weekNumParsed < 1 || weekNumParsed > 52 ||
      !form.weekStartDate || !form.weekEndDate
    ) {
      toast.error("Please fill in Week #, Sunday date, and Saturday date.");
      return;
    }
    mutation.mutate({
      year,
      weekNum: weekNumParsed,
      weekStartDate: form.weekStartDate,
      weekEndDate: form.weekEndDate,
      leadEngineerId:      form.leadEngineerId      || null,
      asnSupportId:        form.asnSupportId        || null,
      enterpriseSupportId: form.enterpriseSupportId || null,
      coreSupportId:       form.coreSupportId       || null,
      notes: null,
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add Week — {year}</DialogTitle>
          <DialogDescription>
            Define a new on-call week entry for the {year} roster.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Week # */}
          <div className="space-y-1.5">
            <Label htmlFor="add-weekNum">Week #</Label>
            <Input
              id="add-weekNum"
              type="number"
              min={1}
              max={52}
              placeholder="e.g. 23"
              value={form.weekNum}
              onChange={(e) => setForm((f) => ({ ...f, weekNum: e.target.value }))}
            />
          </div>

          {/* Start Date (Sunday) */}
          <div className="space-y-1.5">
            <Label htmlFor="add-startDate">Sunday (start of on-call period)</Label>
            <Input
              id="add-startDate"
              type="date"
              value={form.weekStartDate}
              onChange={(e) => setForm((f) => ({ ...f, weekStartDate: e.target.value }))}
            />
          </div>

          {/* End Date (Saturday) */}
          <div className="space-y-1.5">
            <Label htmlFor="add-endDate">Saturday (end of on-call period)</Label>
            <Input
              id="add-endDate"
              type="date"
              value={form.weekEndDate}
              onChange={(e) => setForm((f) => ({ ...f, weekEndDate: e.target.value }))}
            />
          </div>

          {/* Role assignments */}
          {ROLE_FIELDS.map(({ key, label }) => (
            <div key={key} className="space-y-1.5">
              <Label>{label}</Label>
              <Select
                value={form[key] || "_none"}
                onValueChange={(v) => setForm((f) => ({ ...f, [key]: v === "_none" ? "" : v }))}
              >
                <SelectTrigger>
                  <SelectValue>
                    {form[key]
                      ? (staffList.find((s) => s.id === form[key])?.user?.name ?? form[key])
                      : "Unassigned"}
                  </SelectValue>
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
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={mutation.isPending}
          >
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={mutation.isPending}>
            {mutation.isPending ? "Adding…" : "Add Week"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Edit Week Dialog ───────────────────────────────────────────────────────────

type EditForm = {
  leadEngineerId: string;
  asnSupportId: string;
  enterpriseSupportId: string;
  coreSupportId: string;
  notes: string;
};

function EditWeekDialog({ open, onOpenChange, week, staffList }: {
  open: boolean; onOpenChange: (v: boolean) => void; week: WeekRow; staffList: StaffItem[];
}) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<EditForm>({
    leadEngineerId:      week.leadEngineerId      ?? "",
    asnSupportId:        week.asnSupportId        ?? "",
    enterpriseSupportId: week.enterpriseSupportId ?? "",
    coreSupportId:       week.coreSupportId       ?? "",
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            Week {week.weekNum} —{" "}
            {week.weekStartDate ? format(parseISO(week.weekStartDate), "d MMM") : "?"}{" "}
            to{" "}
            {week.weekEndDate ? format(parseISO(week.weekEndDate), "d MMM") : "?"}
          </DialogTitle>
          <DialogDescription>
            Update on-call assignments for this week.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {ROLE_FIELDS.map(({ key, label }) => (
            <div key={key} className="space-y-1.5">
              <Label>{label}</Label>
              <Select
                value={form[key] || "_none"}
                onValueChange={(v) => setForm((f) => ({ ...f, [key]: v === "_none" ? "" : v }))}
              >
                <SelectTrigger>
                  <SelectValue>
                    {form[key]
                      ? (staffList.find((s) => s.id === form[key])?.user?.name ?? form[key])
                      : "Unassigned"}
                  </SelectValue>
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
          <Button
            onClick={() => mutation.mutate({
              year: week.year, weekNum: week.weekNum,
              weekStartDate: week.weekStartDate, weekEndDate: week.weekEndDate,
              leadEngineerId:      form.leadEngineerId      || null,
              asnSupportId:        form.asnSupportId        || null,
              enterpriseSupportId: form.enterpriseSupportId || null,
              coreSupportId:       form.coreSupportId       || null,
              notes: form.notes || null,
            })}
            disabled={mutation.isPending}
          >
            {mutation.isPending ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────

function DcsOnCallPage() {
  const [year,        setYear]        = useState(CURRENT_YEAR);
  const [editingWeek, setEditingWeek] = useState<WeekRow | null>(null);
  const [addOpen,     setAddOpen]     = useState(false);
  const [myOnlyMode,  setMyOnlyMode]  = useState(false);
  const currentWeekRef = useRef<HTMLTableRowElement>(null);

  const { data: session } = useSession();
  const currentUserId = session?.user?.id;
  const queryClient = useQueryClient();

  // Quick single-role update (bypasses full Edit dialog)
  const quickUpdateMutation = useMutation(
    orpc.scheduling.dcsOnCall.upsertWeek.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: orpc.scheduling.dcsOnCall.list.key() });
        toast.success("Updated");
      },
      onError: (err: Error) => toast.error(err.message ?? "Failed to update"),
    }),
  );

  function handleQuickAssign(weekId: string, roleKey: RoleFormKeys, staffId: string | null) {
    const week = (weeks ?? []).find((w) => w.id === weekId);
    if (!week) return;
    quickUpdateMutation.mutate({
      year: week.year,
      weekNum: week.weekNum,
      weekStartDate: week.weekStartDate,
      weekEndDate: week.weekEndDate,
      leadEngineerId:      roleKey === "leadEngineerId"      ? staffId : (week.leadEngineerId      ?? null),
      asnSupportId:        roleKey === "asnSupportId"        ? staffId : (week.asnSupportId        ?? null),
      enterpriseSupportId: roleKey === "enterpriseSupportId" ? staffId : (week.enterpriseSupportId ?? null),
      coreSupportId:       roleKey === "coreSupportId"       ? staffId : (week.coreSupportId       ?? null),
      notes: week.notes ?? null,
    });
  }

  const { data: weeks, isLoading } = useQuery(
    orpc.scheduling.dcsOnCall.list.queryOptions({ input: { year } }),
  );
  const { data: staffData } = useQuery(
    orpc.staff.list.queryOptions({ input: { limit: 200, offset: 0 } }),
  );
  const staffList: StaffItem[] = (staffData ?? []) as StaffItem[];

  // STAGE 3 — data linking: approved leave that overlaps any on-call week.
  // Keyed by weekId → list of clashes (role + leave type + dates).
  const { data: leaveConflicts } = useQuery(
    orpc.scheduling.dcsOnCall.leaveConflicts.queryOptions({ input: { year } }),
  );

  // Look up the conflict for a specific (week, role) cell, if any.
  function conflictFor(weekId: string, roleLabel: string): LeaveConflict | undefined {
    return (leaveConflicts?.[weekId] ?? []).find((c) => c.role === roleLabel);
  }

  // Find the logged-in user's staff profile ID by matching user.id
  const myStaffId = staffList.find((s) => s.user?.id === currentUserId || s.userId === currentUserId)?.id ?? null;

  // Determine current week by date range (not ISO week number)
  const currentWeekNum = (weeks ?? []).find(
    (w) => w.weekStartDate <= TODAY && TODAY <= w.weekEndDate
  )?.weekNum ?? null;

  // Auto-scroll to current week on load
  useEffect(() => {
    if (!isLoading && currentWeekRef.current) {
      setTimeout(() => {
        currentWeekRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 100);
    }
  }, [isLoading]);

  // Filter: all weeks, or only weeks where the current user appears in any role
  const allWeeks = weeks ?? [];
  const displayedWeeks = myOnlyMode && myStaffId
    ? allWeeks.filter((w) =>
        w.leadEngineerId === myStaffId ||
        w.asnSupportId   === myStaffId ||
        w.enterpriseSupportId === myStaffId ||
        w.coreSupportId  === myStaffId
      )
    : allWeeks;

  return (
    <>
      <Header fixed>
        <div className="flex items-center gap-2">
          <CalendarCheck2 className="size-4 text-muted-foreground" />
          <span className="text-sm font-medium">DCS On-Call Roster</span>
        </div>
        <div className="ms-auto flex items-center gap-2">
          <ThemeSwitch />
        </div>
      </Header>

      <Main className="p-0">
        <SchedulingSubNav activeView="dcs" />

        <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-4">
          <div className="space-y-0.5">
            <h1 className="text-xl font-bold tracking-tight">DCS On-Call Roster</h1>
            <p className="text-sm text-muted-foreground">
              4-role weekly rotation. Click any role chip to reassign, or use ✎ for full edit.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {myStaffId && (
              <Button
                size="sm"
                variant={myOnlyMode ? "default" : "outline"}
                onClick={() => setMyOnlyMode((v) => !v)}
              >
                <User className="mr-1.5 size-3.5" />
                {myOnlyMode ? "Show All Weeks" : "My On-Call"}
              </Button>
            )}
            <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
              <SelectTrigger className="w-[120px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[CURRENT_YEAR - 1, CURRENT_YEAR, CURRENT_YEAR + 1].map((y) => (
                  <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button size="sm" onClick={() => setAddOpen(true)}>
              <Plus className="mr-1.5 size-3.5" />
              Add Week
            </Button>
          </div>
        </div>

        <div className="mx-6 mb-6 overflow-hidden rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-20">Week</TableHead>
                <TableHead className="w-44">Sun &#8594; Sat</TableHead>
                <TableHead>Lead Engineer</TableHead>
                <TableHead>ASN Support</TableHead>
                <TableHead>Enterprise Support</TableHead>
                <TableHead>CORE Support</TableHead>
                <TableHead className="w-12" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 7 }).map((_, j) => (
                      <TableCell key={j}><Skeleton className="h-5 w-full" /></TableCell>
                    ))}
                  </TableRow>
                ))
              ) : displayedWeeks.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="py-12 text-center text-muted-foreground">
                    No weeks defined for {year}. Use &ldquo;Add Week&rdquo; to get started.
                  </TableCell>
                </TableRow>
              ) : (
                displayedWeeks.map((w) => {
                  const isCurrent = w.weekNum === currentWeekNum && w.year === CURRENT_YEAR;
                  // Highlight weeks where the current user is on-call
                  const isMyWeek = myStaffId && (
                    w.leadEngineerId === myStaffId ||
                    w.asnSupportId   === myStaffId ||
                    w.enterpriseSupportId === myStaffId ||
                    w.coreSupportId  === myStaffId
                  );
                  return (
                    <TableRow
                      key={w.id}
                      ref={isCurrent ? currentWeekRef : undefined}
                      className={
                        isCurrent
                          ? "relative bg-blue-50/60 shadow-[inset_3px_0_0_0_hsl(var(--primary))] dark:bg-blue-950/20"
                          : isMyWeek && !myOnlyMode
                          ? "bg-indigo-50/40 dark:bg-indigo-950/10"
                          : undefined
                      }
                    >
                      <TableCell>
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono font-semibold">W{w.weekNum}</span>
                          {isCurrent && (
                            <Badge variant="default" className="px-1.5 py-0 text-[10px]">Now</Badge>
                          )}
                          {isMyWeek && !isCurrent && (
                            <Badge variant="outline" className="px-1.5 py-0 text-[10px] border-indigo-400 text-indigo-600 dark:text-indigo-300">Me</Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="font-mono text-xs text-muted-foreground">
                          {w.weekStartDate && w.weekEndDate
                            ? `${format(parseISO(w.weekStartDate), "EEE d MMM")} – ${format(parseISO(w.weekEndDate), "EEE d MMM")}`
                            : "—"}
                        </div>
                        {w.weekStartDate && w.weekEndDate && (() => {
                          const holidays = getHolidaysInRange(w.weekStartDate, w.weekEndDate);
                          return holidays.length > 0 ? (
                            <div className="mt-0.5 flex flex-wrap gap-0.5">
                              {holidays.map((h) => (
                                <span
                                  key={h.date}
                                  title={h.name}
                                  className="inline-flex items-center rounded px-1 py-0 text-[9px] font-semibold bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300"
                                >
                                  🏳️ {h.name.split(" (")[0]}
                                </span>
                              ))}
                            </div>
                          ) : null;
                        })()}
                      </TableCell>
                      <TableCell>
                        <InlineRoleCell week={w} roleKey="leadEngineerId" staffList={staffList} onAssign={handleQuickAssign} conflict={conflictFor(w.id, "Lead Engineer")} />
                      </TableCell>
                      <TableCell>
                        <InlineRoleCell week={w} roleKey="asnSupportId" staffList={staffList} onAssign={handleQuickAssign} conflict={conflictFor(w.id, "ASN Support")} />
                      </TableCell>
                      <TableCell>
                        <InlineRoleCell week={w} roleKey="enterpriseSupportId" staffList={staffList} onAssign={handleQuickAssign} conflict={conflictFor(w.id, "Enterprise Support")} />
                      </TableCell>
                      <TableCell>
                        <InlineRoleCell week={w} roleKey="coreSupportId" staffList={staffList} onAssign={handleQuickAssign} conflict={conflictFor(w.id, "CORE Support")} />
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost" size="icon"
                          onClick={() => setEditingWeek(w as WeekRow)}
                        >
                          <Pencil className="size-3.5" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </Main>

      <AddWeekDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        year={year}
        staffList={staffList}
      />

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
