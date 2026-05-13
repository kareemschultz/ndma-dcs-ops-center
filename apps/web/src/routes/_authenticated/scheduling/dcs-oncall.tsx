// /scheduling/dcs-oncall — DCS On-Call Weekly Roster
// Replaces: apps/web/src/routes/_authenticated/scheduling/dcs-oncall.tsx
//
// Visual improvements over original:
//   • Current week: blue left border + elevated background + "Now" pill
//   • Role cells: coloured avatar/initials chip (not plain text)
//   • Default view: shows ~12 weeks centred on today; "Show all" toggle
//   • Edit dialog: unchanged logic, improved staff-picker UI

import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format, getISOWeek, parseISO } from "date-fns";
import { CalendarCheck2, Pencil } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@ndma-dcs-staff-portal/ui/components/badge";
import { Button } from "@ndma-dcs-staff-portal/ui/components/button";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@ndma-dcs-staff-portal/ui/components/dialog";
import { Label } from "@ndma-dcs-staff-portal/ui/components/label";
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

export const Route = createFileRoute("/_authenticated/scheduling/dcs-oncall")({
  component: DcsOnCallPage,
});

const CURRENT_YEAR    = new Date().getFullYear();
const CURRENT_WEEK    = getISOWeek(new Date());
const DEFAULT_WINDOW  = 12; // weeks to show by default

type StaffItem = { id: string; employeeId: string; user?: { name?: string | null } | null };

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

// ── Edit Dialog ────────────────────────────────────────────────────────────────

type EditForm = { leadEngineerId: string; asnSupportId: string; enterpriseSupportId: string; coreSupportId: string; notes: string };

const ROLE_FIELDS: Array<{ key: keyof EditForm; label: string }> = [
  { key: "leadEngineerId",      label: "Lead Engineer" },
  { key: "asnSupportId",        label: "ASN Support" },
  { key: "enterpriseSupportId", label: "Enterprise Support" },
  { key: "coreSupportId",       label: "CORE Support" },
];

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
                  <SelectValue placeholder="Unassigned" />
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
  const [year,       setYear]       = useState(CURRENT_YEAR);
  const [showAll,    setShowAll]    = useState(false);
  const [editingWeek, setEditingWeek] = useState<WeekRow | null>(null);

  const { data: weeks, isLoading } = useQuery(
    orpc.scheduling.dcsOnCall.list.queryOptions({ input: { year } }),
  );
  const { data: staffData } = useQuery(
    orpc.staff.list.queryOptions({ input: { limit: 200, offset: 0 } }),
  );
  const staffList: StaffItem[] = staffData ?? [];

  // Trim to DEFAULT_WINDOW weeks centred on the current week, unless showAll
  const displayedWeeks = (() => {
    if (!weeks || showAll) return weeks ?? [];
    const curIdx = weeks.findIndex((w) => w.weekNum === CURRENT_WEEK);
    const start  = Math.max(0, curIdx - 1);
    return weeks.slice(start, start + DEFAULT_WINDOW);
  })();

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
              4-role weekly rotation — Lead Engineer · ASN · Enterprise · CORE
            </p>
          </div>
          <div className="flex items-center gap-2">
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
            {weeks && weeks.length > DEFAULT_WINDOW && (
              <Button variant="outline" size="sm" onClick={() => setShowAll((s) => !s)}>
                {showAll ? `Show ${DEFAULT_WINDOW} weeks` : `Show all ${weeks.length} weeks`}
              </Button>
            )}
          </div>
        </div>

        <div className="mx-6 mb-6 overflow-hidden rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-20">Week</TableHead>
                <TableHead className="w-40">Dates</TableHead>
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
                    No weeks defined for {year}.
                  </TableCell>
                </TableRow>
              ) : (
                displayedWeeks.map((w) => {
                  const isCurrent = w.weekNum === CURRENT_WEEK && w.year === CURRENT_YEAR;
                  return (
                    <TableRow
                      key={w.id}
                      // Blue left border for current week via box-shadow (no extra DOM node)
                      className={isCurrent
                        ? "relative bg-blue-50/60 shadow-[inset_3px_0_0_0_hsl(var(--primary))] dark:bg-blue-950/20"
                        : undefined
                      }
                    >
                      <TableCell>
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono font-semibold">W{w.weekNum}</span>
                          {isCurrent && (
                            <Badge variant="default" className="px-1.5 py-0 text-[10px]">Now</Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">
                        {w.weekStartDate && w.weekEndDate
                          ? `${format(parseISO(w.weekStartDate), "d MMM")} – ${format(parseISO(w.weekEndDate), "d MMM")}`
                          : "—"}
                      </TableCell>
                      <TableCell><StaffChip name={staffName(w.leadEngineer)} /></TableCell>
                      <TableCell><StaffChip name={staffName(w.asnSupport)} /></TableCell>
                      <TableCell><StaffChip name={staffName(w.enterpriseSupport)} /></TableCell>
                      <TableCell><StaffChip name={staffName(w.coreSupport)} /></TableCell>
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
