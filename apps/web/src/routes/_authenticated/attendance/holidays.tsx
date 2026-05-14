// /attendance/holidays — Public Holidays
//
// Drop-in from design handoff/screens-new.jsx:353 (HolidaysScreen).
// Wired to the new attendanceTime.holidays.* oRPC procedures backed by the
// calendar_events table with event_type='public_holiday'.

import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { CalendarCheck, Plus, Star, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@ndma-dcs-staff-portal/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@ndma-dcs-staff-portal/ui/components/card";
import { Input } from "@ndma-dcs-staff-portal/ui/components/input";
import { Label } from "@ndma-dcs-staff-portal/ui/components/label";
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
import { ThemeSwitch } from "@/components/theme-switch";
import { orpc } from "@/utils/orpc";

export const Route = createFileRoute("/_authenticated/attendance/holidays")({
  component: HolidaysPage,
});

// ── Year selector options ─────────────────────────────────────────────────────
const YEARS = [2024, 2025, 2026, 2027];

// ── Static reference data: Guyanese public holiday presets per year.
// This is configuration (date+name pairs the admin can opt-in to), NOT a record cache.
// Religious holidays (Phagwah, Eid, Diwali) vary year-to-year; the admin should
// confirm and edit if needed before bulk-adding.
const GY_PRESETS: Record<number, { date: string; name: string }[]> = {
  2024: [
    { date: "2024-01-01", name: "New Year's Day" },
    { date: "2024-02-23", name: "Mashramani — Republic Day" },
    { date: "2024-03-25", name: "Phagwah (Holi)" },
    { date: "2024-03-29", name: "Good Friday" },
    { date: "2024-04-01", name: "Easter Monday" },
    { date: "2024-04-10", name: "Eid-ul-Fitr" },
    { date: "2024-05-01", name: "Labour Day" },
    { date: "2024-05-05", name: "Indian Arrival Day" },
    { date: "2024-05-26", name: "Independence Day" },
    { date: "2024-07-01", name: "Caricom Day" },
    { date: "2024-08-01", name: "Emancipation Day" },
    { date: "2024-11-01", name: "Diwali" },
    { date: "2024-12-25", name: "Christmas Day" },
    { date: "2024-12-26", name: "Boxing Day" },
  ],
  2025: [
    { date: "2025-01-01", name: "New Year's Day" },
    { date: "2025-02-23", name: "Mashramani — Republic Day" },
    { date: "2025-03-14", name: "Phagwah (Holi)" },
    { date: "2025-03-31", name: "Eid-ul-Fitr" },
    { date: "2025-04-18", name: "Good Friday" },
    { date: "2025-04-21", name: "Easter Monday" },
    { date: "2025-05-01", name: "Labour Day" },
    { date: "2025-05-05", name: "Indian Arrival Day" },
    { date: "2025-05-26", name: "Independence Day" },
    { date: "2025-07-01", name: "Caricom Day" },
    { date: "2025-08-01", name: "Emancipation Day" },
    { date: "2025-10-20", name: "Diwali" },
    { date: "2025-12-25", name: "Christmas Day" },
    { date: "2025-12-26", name: "Boxing Day" },
  ],
  2026: [
    { date: "2026-01-01", name: "New Year's Day" },
    { date: "2026-02-23", name: "Mashramani — Republic Day" },
    { date: "2026-03-03", name: "Phagwah (Holi)" },
    { date: "2026-03-20", name: "Eid-ul-Fitr" },
    { date: "2026-04-03", name: "Good Friday" },
    { date: "2026-04-06", name: "Easter Monday" },
    { date: "2026-05-01", name: "Labour Day" },
    { date: "2026-05-05", name: "Indian Arrival Day" },
    { date: "2026-05-26", name: "Independence Day" },
    { date: "2026-07-01", name: "Caricom Day" },
    { date: "2026-08-01", name: "Emancipation Day" },
    { date: "2026-11-08", name: "Diwali" },
    { date: "2026-12-25", name: "Christmas Day" },
    { date: "2026-12-26", name: "Boxing Day" },
  ],
  2027: [
    { date: "2027-01-01", name: "New Year's Day" },
    { date: "2027-02-23", name: "Mashramani — Republic Day" },
    { date: "2027-03-26", name: "Good Friday" },
    { date: "2027-03-29", name: "Easter Monday" },
    { date: "2027-05-01", name: "Labour Day" },
    { date: "2027-05-05", name: "Indian Arrival Day" },
    { date: "2027-05-26", name: "Independence Day" },
    { date: "2027-07-01", name: "Caricom Day" },
    { date: "2027-08-01", name: "Emancipation Day" },
    { date: "2027-12-25", name: "Christmas Day" },
    { date: "2027-12-26", name: "Boxing Day" },
  ],
};

function dayName(dateStr: string) {
  return new Date(`${dateStr}T00:00:00`).toLocaleDateString("en-GB", { weekday: "long" });
}

function shortDate(dateStr: string) {
  return new Date(`${dateStr}T00:00:00`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
  });
}

function HolidaysPage() {
  const queryClient = useQueryClient();
  const [year, setYear] = useState<number>(new Date().getFullYear());
  const [newDate, setNewDate] = useState("");
  const [newName, setNewName] = useState("");

  const { data: holidays, isLoading } = useQuery(
    orpc.attendanceTime.holidays.list.queryOptions({ input: { year } }),
  );

  const createMutation = useMutation(
    orpc.attendanceTime.holidays.create.mutationOptions({
      onSuccess: async () => {
        toast.success("Holiday added");
        setNewDate("");
        setNewName("");
        await queryClient.invalidateQueries({
          queryKey: orpc.attendanceTime.holidays.list.key(),
        });
      },
      onError: (e: Error) => toast.error(e.message ?? "Failed to add holiday"),
    }),
  );

  const bulkMutation = useMutation(
    orpc.attendanceTime.holidays.bulkAdd.mutationOptions({
      onSuccess: async (result: { inserted: number; skipped: number }) => {
        if (result.inserted === 0) {
          toast.info(`All ${result.skipped} presets are already added.`);
        } else {
          toast.success(
            `Added ${result.inserted} holiday${result.inserted === 1 ? "" : "s"}${
              result.skipped > 0 ? ` (${result.skipped} already existed)` : ""
            }`,
          );
        }
        await queryClient.invalidateQueries({
          queryKey: orpc.attendanceTime.holidays.list.key(),
        });
      },
      onError: (e: Error) => toast.error(e.message ?? "Failed to bulk-add holidays"),
    }),
  );

  const deleteMutation = useMutation(
    orpc.attendanceTime.holidays.delete.mutationOptions({
      onSuccess: async () => {
        toast.success("Holiday removed");
        await queryClient.invalidateQueries({
          queryKey: orpc.attendanceTime.holidays.list.key(),
        });
      },
      onError: (e: Error) => toast.error(e.message ?? "Failed to remove holiday"),
    }),
  );

  const list = holidays ?? [];
  const configuredDates = new Set(list.map((h) => h.eventDate));
  const presets = GY_PRESETS[year] ?? [];
  const remainingPresets = presets.filter((p) => !configuredDates.has(p.date));

  function addOne() {
    if (!newDate || !newName) return;
    createMutation.mutate({ date: newDate, name: newName });
  }

  function quickAddAll() {
    if (remainingPresets.length === 0) {
      toast.info("All presets for this year are already added.");
      return;
    }
    bulkMutation.mutate({
      entries: remainingPresets.map((p) => ({ date: p.date, name: p.name })),
    });
  }

  function quickAddOne(date: string, name: string) {
    if (configuredDates.has(date)) return;
    createMutation.mutate({ date, name });
  }

  function removeOne(id: number) {
    if (!confirm("Remove this holiday?")) return;
    deleteMutation.mutate({ id });
  }

  return (
    <>
      <Header fixed>
        <div className="flex items-center gap-2">
          <CalendarCheck className="size-4 text-muted-foreground" />
          <span className="text-sm font-medium">Public Holidays</span>
        </div>
        <div className="ms-auto flex items-center gap-2">
          <Button
            size="sm"
            onClick={quickAddAll}
            disabled={bulkMutation.isPending || remainingPresets.length === 0}
          >
            <Plus className="mr-1.5 size-4" />
            Quick-add all {year} presets
          </Button>
          <ThemeSwitch />
        </div>
      </Header>

      <Main>
        <div className="mb-6">
          <h1 className="text-2xl font-bold tracking-tight">Public Holidays</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage Guyanese public holidays used by the attendance roll-call, monthly grid, and
            auto-marking.
          </p>
        </div>

        {/* Year tabs */}
        <div className="mb-6 flex border-b">
          {YEARS.map((y) => (
            <button
              key={y}
              type="button"
              onClick={() => setYear(y)}
              className={`relative -mb-px h-10 border-b-2 px-4 text-sm font-medium transition-colors ${
                year === y
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {y}
              {y === year && holidays && holidays.length > 0 && (
                <span className="ml-1.5 rounded bg-primary px-1.5 py-0.5 text-[10px] font-bold text-primary-foreground">
                  {holidays.length}
                </span>
              )}
              {y !== year && (
                <span className="ml-1.5 text-[10px] text-muted-foreground">
                  {/* No count for non-active years; would need separate queries */}
                </span>
              )}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          {/* Left: Add form + presets */}
          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Add Holiday</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="space-y-1.5">
                  <Label htmlFor="holiday-date">Date</Label>
                  <Input
                    id="holiday-date"
                    type="date"
                    value={newDate}
                    onChange={(e) => setNewDate(e.target.value)}
                    min={`${year}-01-01`}
                    max={`${year}-12-31`}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="holiday-name">Holiday Name</Label>
                  <Input
                    id="holiday-name"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && newDate && newName) addOne();
                    }}
                    placeholder="e.g. Mashramani"
                  />
                </div>
                <Button
                  className="w-full"
                  onClick={addOne}
                  disabled={!newDate || !newName || createMutation.isPending}
                >
                  <Plus className="mr-1.5 size-4" />
                  Add Holiday
                </Button>
              </CardContent>
            </Card>

            {presets.length > 0 && (
              <Card>
                <CardHeader className="flex flex-row items-start justify-between gap-2">
                  <div>
                    <CardTitle>Quick-add {year} presets</CardTitle>
                    <p className="mt-1 text-xs text-muted-foreground">
                      One-click to add Guyanese holidays.
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={quickAddAll}
                    disabled={bulkMutation.isPending || remainingPresets.length === 0}
                  >
                    Add all
                  </Button>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="divide-y">
                    {presets.map((p) => {
                      const added = configuredDates.has(p.date);
                      return (
                        <div key={p.date} className="flex items-center gap-3 px-4 py-2.5">
                          <div className="min-w-0 flex-1">
                            <div className="text-sm font-medium">{p.name}</div>
                            <div className="text-xs text-muted-foreground">
                              {shortDate(p.date)} · {dayName(p.date)}
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => quickAddOne(p.date, p.name)}
                            disabled={added || createMutation.isPending}
                            className={`rounded-md border px-2.5 py-1 text-xs font-semibold transition-colors ${
                              added
                                ? "cursor-default border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-950/30 dark:text-blue-300"
                                : "border-border hover:bg-accent"
                            }`}
                          >
                            {added ? "✓ Added" : "+ Add"}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Right: Configured holidays */}
          <div>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-base font-semibold">{year} Holidays</h2>
              <span className="text-xs text-muted-foreground">
                {list.length} holiday{list.length === 1 ? "" : "s"} configured
              </span>
            </div>
            {isLoading ? (
              <Skeleton className="h-64 w-full" />
            ) : list.length === 0 ? (
              <div className="rounded-xl border border-dashed py-16 text-center">
                <Star className="mx-auto size-6 text-muted-foreground" />
                <p className="mt-3 text-sm font-medium">No holidays added for {year}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Use the form or click quick-add to get started.
                </p>
              </div>
            ) : (
              <div className="overflow-hidden rounded-xl border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Day</TableHead>
                      <TableHead className="w-12" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {list.map((h) => (
                      <TableRow key={h.id}>
                        <TableCell className="font-medium">{h.title}</TableCell>
                        <TableCell className="font-mono text-xs">{shortDate(h.eventDate)}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {dayName(h.eventDate)}
                        </TableCell>
                        <TableCell>
                          <button
                            type="button"
                            onClick={() => removeOne(h.id)}
                            disabled={deleteMutation.isPending}
                            className="flex size-7 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/30"
                            title="Remove"
                          >
                            <Trash2 className="size-3.5" />
                          </button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        </div>
      </Main>
    </>
  );
}
