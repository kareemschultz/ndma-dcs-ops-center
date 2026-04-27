import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import { CalendarDays } from "lucide-react";
import { toast } from "sonner";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@ndma-dcs-staff-portal/ui/components/select";
import { Skeleton } from "@ndma-dcs-staff-portal/ui/components/skeleton";
import { Header } from "@/components/layout/header";
import { Main } from "@/components/layout/main";
import { ThemeSwitch } from "@/components/theme-switch";
import { orpc } from "@/utils/orpc";

export const Route = createFileRoute("/_authenticated/scheduling/noc-shifts")({
  component: NocShiftsPage,
});

const SHIFT_TYPES = ["12hr Day", "12hr Night", "Off", "Annual Leave", "Sick Leave"] as const;
type ShiftType = (typeof SHIFT_TYPES)[number];

const SHIFT_COLORS: Record<ShiftType, string> = {
  "12hr Day": "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200",
  "12hr Night": "bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-200",
  Off: "bg-muted text-muted-foreground",
  "Annual Leave": "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200",
  "Sick Leave": "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200",
};

const SHIFT_SHORT: Record<ShiftType, string> = {
  "12hr Day": "D",
  "12hr Night": "N",
  Off: "—",
  "Annual Leave": "AL",
  "Sick Leave": "SL",
};

const CURRENT_YEAR = new Date().getFullYear();
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month, 0).getDate();
}

function NocShiftsPage() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);

  const queryClient = useQueryClient();

  const { data: shifts, isLoading } = useQuery(
    orpc.scheduling.nocShifts.list.queryOptions({ input: { year, month } }),
  );

  const mutation = useMutation(
    orpc.scheduling.nocShifts.bulkSet.mutationOptions({
      onSuccess: () => {
        toast.success("Shift updated");
        queryClient.invalidateQueries({ queryKey: orpc.scheduling.nocShifts.list.key() });
      },
      onError: (err: Error) => toast.error(err.message ?? "Failed to update shift"),
    }),
  );

  const daysInMonth = getDaysInMonth(year, month);
  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);

  // Build a lookup: staffId → day → shiftType
  const shiftMap: Record<string, Record<number, ShiftType>> = {};
  const staffNames: Record<string, string> = {};
  for (const s of shifts ?? []) {
    const day = parseISO(s.shiftDate).getDate();
    if (!shiftMap[s.staffId]) shiftMap[s.staffId] = {};
    shiftMap[s.staffId][day] = s.shiftType as ShiftType;
    if (s.staffProfile?.user?.name) staffNames[s.staffId] = s.staffProfile.user.name;
  }

  const staffIds = Object.keys(shiftMap);

  function handleCellChange(staffId: string, day: number, shiftType: ShiftType) {
    const monthStr = String(month).padStart(2, "0");
    const dayStr = String(day).padStart(2, "0");
    const shiftDate = `${year}-${monthStr}-${dayStr}`;
    mutation.mutate({ entries: [{ staffId, shiftDate, shiftType }] });
  }

  return (
    <>
      <Header>
        <div className="flex items-center gap-2">
          <CalendarDays className="h-5 w-5" />
          <h1 className="text-lg font-semibold">NOC Shift Grid</h1>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <ThemeSwitch />
        </div>
      </Header>

      <Main>
        <div className="mb-4 flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Month
            </label>
            <Select value={String(month)} onValueChange={(v) => setMonth(Number(v))}>
              <SelectTrigger className="w-[160px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MONTHS.map((name, i) => (
                  <SelectItem key={i + 1} value={String(i + 1)}>
                    {name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Year
            </label>
            <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
              <SelectTrigger className="w-[120px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[CURRENT_YEAR - 1, CURRENT_YEAR, CURRENT_YEAR + 1].map((y) => (
                  <SelectItem key={y} value={String(y)}>
                    {y}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex items-center gap-3 mb-3 flex-wrap">
          {SHIFT_TYPES.map((t) => (
            <span key={t} className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${SHIFT_COLORS[t]}`}>
              <span className="font-mono font-bold">{SHIFT_SHORT[t]}</span>
              {t}
            </span>
          ))}
        </div>

        {isLoading ? (
          <Skeleton className="h-64 w-full" />
        ) : staffIds.length === 0 ? (
          <div className="rounded-md border border-dashed py-16 text-center text-muted-foreground">
            <CalendarDays className="mx-auto mb-3 h-10 w-10 opacity-50" />
            <p className="font-medium text-foreground">No shift data for this month</p>
            <p className="mt-1 text-sm">
              Shift records will appear here once they are entered.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-md border">
            <table className="min-w-max text-xs">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="sticky left-0 bg-muted/80 px-3 py-2 text-left font-medium whitespace-nowrap">
                    Staff
                  </th>
                  {days.map((d) => (
                    <th
                      key={d}
                      className="px-1 py-2 text-center font-medium w-10 text-muted-foreground"
                    >
                      {d}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {staffIds.map((staffId) => (
                  <tr key={staffId} className="border-b last:border-0">
                    <td className="sticky left-0 bg-background px-3 py-1.5 font-medium whitespace-nowrap">
                      {staffNames[staffId] ?? staffId}
                    </td>
                    {days.map((day) => {
                      const currentShift = shiftMap[staffId]?.[day];
                      return (
                        <td key={day} className="px-0.5 py-1">
                          <Select
                            value={currentShift ?? "_none"}
                            onValueChange={(v) => {
                              const val = v as string | null;
                              if (val && val !== "_none") {
                                handleCellChange(staffId, day, val as ShiftType);
                              }
                            }}
                          >
                            <SelectTrigger className="h-7 w-12 px-1 text-center text-xs border-0 focus:ring-0 focus:ring-offset-0">
                              <span
                                className={`inline-block rounded px-1 py-0.5 font-mono font-bold ${
                                  currentShift ? SHIFT_COLORS[currentShift] : "text-muted-foreground"
                                }`}
                              >
                                {currentShift ? SHIFT_SHORT[currentShift] : "·"}
                              </span>
                            </SelectTrigger>
                            <SelectContent>
                              {SHIFT_TYPES.map((t) => (
                                <SelectItem key={t} value={t}>
                                  <span className={`inline-flex items-center gap-1.5 rounded-full px-1.5 py-0 ${SHIFT_COLORS[t]}`}>
                                    <span className="font-mono font-bold">{SHIFT_SHORT[t]}</span>
                                    {t}
                                  </span>
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Main>
    </>
  );
}
