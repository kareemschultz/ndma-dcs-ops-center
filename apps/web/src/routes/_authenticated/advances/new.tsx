// /advances/new — Advance Request Form (3 sections + signature)
// Drop-in from design handoff/screens-new.jsx:692 (AdvanceFormScreen).
// Live total = sum(persons × cost × days for non-misc lines) + misc lump sum.

import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { ChevronLeft, Plus, Save, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@ndma-dcs-staff-portal/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@ndma-dcs-staff-portal/ui/components/card";
import { Input } from "@ndma-dcs-staff-portal/ui/components/input";
import { Label } from "@ndma-dcs-staff-portal/ui/components/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@ndma-dcs-staff-portal/ui/components/select";
import { Textarea } from "@ndma-dcs-staff-portal/ui/components/textarea";

import { Header } from "@/components/layout/header";
import { Main } from "@/components/layout/main";
import { ThemeSwitch } from "@/components/theme-switch";
import { orpc } from "@/utils/orpc";

export const Route = createFileRoute("/_authenticated/advances/new")({
  component: NewAdvancePage,
});

const ROW_KINDS = [
  { key: "breakfast", label: "Breakfast" },
  { key: "lunch", label: "Lunch" },
  { key: "dinner", label: "Dinner" },
  { key: "out_of_pocket", label: "Out of Pocket" },
] as const;

type ExpenseLine = {
  persons: number;
  costPerUnit: number;
  days: number;
};

const EMPTY_LINE: ExpenseLine = { persons: 0, costPerUnit: 0, days: 0 };

function NewAdvancePage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: staffData } = useQuery(
    orpc.staff.list.queryOptions({ input: { limit: 500, offset: 0 } }),
  );

  const [staffProfileId, setStaffProfileId] = useState("");
  const [purpose, setPurpose] = useState("");
  const [dateRequested, setDateRequested] = useState(
    new Date().toISOString().slice(0, 10),
  );
  const [expectedClearance, setExpectedClearance] = useState("");
  const [recipients, setRecipients] = useState<string[]>([]);
  const [newRecip, setNewRecip] = useState("");
  const [notes, setNotes] = useState("");

  const [lines, setLines] = useState<Record<string, ExpenseLine>>({
    breakfast: { ...EMPTY_LINE },
    lunch: { ...EMPTY_LINE },
    dinner: { ...EMPTY_LINE },
    out_of_pocket: { ...EMPTY_LINE },
  });
  const [misc, setMisc] = useState(0);

  const calcRow = (line: ExpenseLine) =>
    (line.persons || 0) * (line.costPerUnit || 0) * (line.days || 0);

  const total = useMemo(() => {
    const sum = ROW_KINDS.reduce(
      (s, { key }) => s + calcRow(lines[key] ?? EMPTY_LINE),
      0,
    );
    return sum + (misc || 0);
  }, [lines, misc]);

  const selectedStaff = staffData?.find((s) => s.id === staffProfileId);

  const createMutation = useMutation(
    orpc.advances.create.mutationOptions({
      onSuccess: async (result: { id: string; refNumber: string }) => {
        toast.success(`Advance ${result.refNumber} created`);
        await queryClient.invalidateQueries({ queryKey: orpc.advances.list.key() });
        await queryClient.invalidateQueries({ queryKey: orpc.advances.stats.key() });
        navigate({ to: "/advances" });
      },
      onError: (e: Error) => toast.error(e.message ?? "Failed to create advance"),
    }),
  );

  function addRecipient() {
    const t = newRecip.trim();
    if (!t) return;
    if (recipients.includes(t)) return;
    setRecipients([...recipients, t]);
    setNewRecip("");
  }

  function addRecipientFromStaff(id: string) {
    if (!id || id === "__none__") return;
    const name = staffData?.find((s) => s.id === id)?.user?.name;
    if (!name) return;
    if (recipients.includes(name)) return;
    setRecipients([...recipients, name]);
  }

  function removeRecipient(idx: number) {
    setRecipients(recipients.filter((_, i) => i !== idx));
  }

  function updateLine(key: string, field: keyof ExpenseLine, val: string) {
    const n = Number(val) || 0;
    setLines((curr) => ({
      ...curr,
      [key]: { ...curr[key], [field]: n },
    }));
  }

  function handleSave() {
    if (!staffProfileId) {
      toast.error("Select a staff member.");
      return;
    }
    if (!purpose.trim()) {
      toast.error("Purpose is required.");
      return;
    }

    type LineEntry = {
      kind: "breakfast" | "lunch" | "dinner" | "out_of_pocket" | "miscellaneous";
      persons: number;
      costPerUnit: number;
      days: number;
    };
    const lineEntries: LineEntry[] = ROW_KINDS.map(({ key }) => ({
      kind: key,
      persons: lines[key]?.persons ?? 0,
      costPerUnit: lines[key]?.costPerUnit ?? 0,
      days: lines[key]?.days ?? 0,
    })).filter((line) => line.persons > 0 && line.costPerUnit > 0 && line.days > 0);

    if (misc > 0) {
      lineEntries.push({
        kind: "miscellaneous",
        persons: 0,
        costPerUnit: misc,
        days: 0,
      });
    }

    createMutation.mutate({
      staffProfileId,
      purpose: purpose.trim(),
      recipients,
      dateRequested,
      expectedClearance: expectedClearance || undefined,
      notes: notes || undefined,
      lines: lineEntries,
    });
  }

  return (
    <>
      <Header fixed>
        <button
          type="button"
          onClick={() => navigate({ to: "/advances" })}
          className="flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ChevronLeft className="size-4" /> Advance Requests
        </button>
        <span className="text-muted-foreground/40">/</span>
        <span className="text-sm font-medium">New Advance</span>
        <div className="ms-auto flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate({ to: "/advances" })}
            disabled={createMutation.isPending}
          >
            Cancel
          </Button>
          <Button size="sm" onClick={handleSave} disabled={createMutation.isPending}>
            <Save className="mr-1.5 size-4" />
            {createMutation.isPending ? "Saving…" : "Save Advance"}
          </Button>
          <ThemeSwitch />
        </div>
      </Header>

      <Main>
        <div className="mx-auto max-w-3xl space-y-4">
          {/* Section 1 — Details */}
          <Card>
            <CardHeader>
              <CardTitle>1 — Advance Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>Staff Member *</Label>
                  <Select
                    value={staffProfileId}
                    onValueChange={(v) => setStaffProfileId(v ?? "")}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select staff member" />
                    </SelectTrigger>
                    <SelectContent>
                      {staffData?.map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.user?.name ?? s.id}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Designation</Label>
                  <div className="flex h-9 items-center rounded-md border bg-muted/50 px-3 text-sm text-muted-foreground">
                    {selectedStaff?.jobTitle ?? "—"}
                  </div>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label>Recipients</Label>
                <p className="text-xs text-muted-foreground">
                  Everyone this advance covers — staff members or freetext names.
                </p>
                {recipients.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {recipients.map((r, i) => (
                      <span
                        key={r + i}
                        className="inline-flex items-center gap-1 rounded-full border border-blue-200 bg-blue-50 px-2.5 py-0.5 text-xs font-medium text-blue-800 dark:border-blue-800 dark:bg-blue-950/30 dark:text-blue-200"
                      >
                        {r}
                        <button
                          type="button"
                          onClick={() => removeRecipient(i)}
                          className="opacity-60 hover:opacity-100"
                        >
                          <X className="size-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
                <div className="flex gap-2">
                  <Select
                    value=""
                    onValueChange={(v) => addRecipientFromStaff(v ?? "")}
                  >
                    <SelectTrigger className="flex-1">
                      <SelectValue placeholder="Add from staff list…" />
                    </SelectTrigger>
                    <SelectContent>
                      {staffData
                        ?.filter((s) => !recipients.includes(s.user?.name ?? ""))
                        .map((s) => (
                          <SelectItem key={s.id} value={s.id}>
                            {s.user?.name ?? s.id}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                  <Input
                    value={newRecip}
                    onChange={(e) => setNewRecip(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        addRecipient();
                      }
                    }}
                    placeholder="Or type a name…"
                    className="flex-1"
                  />
                  <Button variant="outline" size="icon" onClick={addRecipient}>
                    <Plus className="size-4" />
                  </Button>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label>Purpose *</Label>
                <Textarea
                  value={purpose}
                  onChange={(e) => setPurpose(e.target.value)}
                  rows={3}
                  placeholder="Describe the purpose and scope of the advance…"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>Date Requested *</Label>
                  <Input
                    type="date"
                    value={dateRequested}
                    onChange={(e) => setDateRequested(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Expected Clearance</Label>
                  <Input
                    type="date"
                    value={expectedClearance}
                    onChange={(e) => setExpectedClearance(e.target.value)}
                  />
                </div>
              </div>

              {/* Total callout */}
              <div className="flex items-center justify-between rounded-xl border border-blue-200 bg-blue-50/60 px-5 py-3 dark:border-blue-800 dark:bg-blue-950/20">
                <span className="text-sm font-semibold text-blue-800 dark:text-blue-200">
                  Total Amount (GYD)
                </span>
                <span className="text-2xl font-bold tabular-nums text-blue-700 dark:text-blue-300">
                  {total.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                </span>
              </div>
            </CardContent>
          </Card>

          {/* Section 2 — Expense Breakdown */}
          <Card>
            <CardHeader>
              <CardTitle>2 — Expense Breakdown</CardTitle>
              <p className="text-xs text-muted-foreground">
                Optional — populates the NDMA requisition document.
              </p>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                      <th className="py-2 pl-4 pr-3 font-medium">Expense</th>
                      <th className="px-3 py-2 text-center font-medium">Persons</th>
                      <th className="px-3 py-2 text-center font-medium">Cost/Unit (GYD)</th>
                      <th className="px-3 py-2 text-center font-medium">Days</th>
                      <th className="py-2 pl-3 pr-4 text-right font-medium">Amount (GYD)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ROW_KINDS.map(({ key, label }) => {
                      const r = lines[key] ?? EMPTY_LINE;
                      const amt = calcRow(r);
                      return (
                        <tr key={key} className="border-b">
                          <td className="py-2 pl-4 pr-3 font-medium">{label}</td>
                          {(["persons", "costPerUnit", "days"] as const).map((f) => (
                            <td key={f} className="px-2 py-1.5">
                              <Input
                                type="number"
                                min={0}
                                value={r[f] || ""}
                                onChange={(e) => updateLine(key, f, e.target.value)}
                                placeholder="0"
                                className="h-8 text-center"
                              />
                            </td>
                          ))}
                          <td className="py-2 pl-3 pr-4 text-right font-mono font-semibold tabular-nums">
                            {amt > 0
                              ? amt.toLocaleString("en-US", { minimumFractionDigits: 2 })
                              : "—"}
                          </td>
                        </tr>
                      );
                    })}
                    <tr className="border-b">
                      <td className="py-2 pl-4 pr-3 font-medium">Miscellaneous</td>
                      <td
                        colSpan={3}
                        className="py-2 px-3 text-center text-xs text-muted-foreground"
                      >
                        Lump sum — enter total directly
                      </td>
                      <td className="py-1.5 pl-3 pr-4">
                        <Input
                          type="number"
                          min={0}
                          value={misc || ""}
                          onChange={(e) => setMisc(Number(e.target.value) || 0)}
                          placeholder="0"
                          className="h-8 text-right"
                        />
                      </td>
                    </tr>
                    <tr className="border-t-2 bg-muted/40 font-semibold">
                      <td colSpan={4} className="py-2.5 pl-4 pr-3">
                        Total
                      </td>
                      <td className="py-2.5 pl-3 pr-4 text-right font-mono text-base tabular-nums text-primary">
                        {total.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          {/* Section 3 — Notes */}
          <Card>
            <CardHeader>
              <CardTitle>3 — Notes</CardTitle>
              <p className="text-xs text-muted-foreground">
                Internal notes — not embedded in the generated requisition.
              </p>
            </CardHeader>
            <CardContent>
              <Textarea
                rows={3}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Approval context, justification, anything to remember…"
              />
            </CardContent>
          </Card>
        </div>
      </Main>
    </>
  );
}
