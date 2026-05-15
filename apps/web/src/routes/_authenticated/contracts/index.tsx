import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { differenceInDays, format, parseISO } from "date-fns";
import { FileText, AlertCircle, ArrowRight, Plus, Pencil, FileDown } from "lucide-react";
import { exportContractsExcel } from "@/utils/excel-export";
import { toast } from "sonner";
import { Skeleton } from "@ndma-dcs-staff-portal/ui/components/skeleton";
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
import { Button } from "@ndma-dcs-staff-portal/ui/components/button";
import { Input } from "@ndma-dcs-staff-portal/ui/components/input";
import { Label } from "@ndma-dcs-staff-portal/ui/components/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@ndma-dcs-staff-portal/ui/components/select";
import { Header } from "@/components/layout/header";
import { Main } from "@/components/layout/main";
import { PageHeader } from "@/components/layout/page-header";
import { ThemeSwitch } from "@/components/theme-switch";
import { orpc } from "@/utils/orpc";

export const Route = createFileRoute("/_authenticated/contracts/")({
  component: ContractsPage,
});

type ContractStatus = "active" | "expiring_soon" | "expired" | "renewed" | "terminated";
type RenewalStatus =
  | "not_due"
  | "due_soon"
  | "letter_drafted"
  | "submitted_to_hr"
  | "renewed"
  | "not_renewing";

const STATUS_COLORS: Record<ContractStatus, string> = {
  active: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  expiring_soon: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  expired: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
  renewed: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  terminated: "bg-muted text-muted-foreground",
};

const RENEWAL_STATUS_COLORS: Record<RenewalStatus, string> = {
  not_due: "bg-muted text-muted-foreground",
  due_soon: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  letter_drafted: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  submitted_to_hr: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300",
  renewed: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  not_renewing: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
};

const RENEWAL_STATUS_LABELS: Record<RenewalStatus, string> = {
  not_due: "Not Due",
  due_soon: "Due Soon",
  letter_drafted: "Letter Drafted",
  submitted_to_hr: "Submitted to HR",
  renewed: "Renewed",
  not_renewing: "Not Renewing",
};

type ContractRecord = {
  id: string;
  staffProfileId: string;
  contractType: string;
  startDate: string;
  endDate: string | null;
  status: string;
  renewalStatus: string;
  staffProfile?: { employeeId?: string; user?: { name?: string | null } | null } | null;
};

type CreateForm = {
  staffProfileId: string;
  contractType: string;
  startDate: string;
  endDate: string;
};

type EditForm = {
  contractType: string;
  startDate: string;
  endDate: string;
  status: ContractStatus;
};

function daysUntilEnd(endDate: string | null): number | null {
  if (!endDate) return null;
  return differenceInDays(parseISO(endDate), new Date());
}

function DaysBadge({ days }: { days: number | null }) {
  if (days == null) return <span className="text-muted-foreground text-xs">—</span>;
  if (days < 0)
    return (
      <span className="inline-flex items-center gap-1 rounded-md bg-red-600 px-2 py-0.5 text-xs font-bold text-white">
        <AlertCircle className="size-3" /> Expired {Math.abs(days)}d ago
      </span>
    );
  const cls =
    days <= 30
      ? "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300 font-bold"
      : days <= 60
        ? "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300 font-semibold"
        : days <= 90
          ? "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300"
          : "text-muted-foreground";
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs tabular-nums ${cls}`}
    >
      {days <= 30 && <AlertCircle className="size-3" />}
      {days}d
    </span>
  );
}

type ExpiringContract = {
  id: string;
  endDate: string | null;
  contractType: string;
  staffProfile?: { user?: { name?: string | null } | null } | null;
};

function ExpiringSoonSection({ contracts }: { contracts: ExpiringContract[] }) {
  const today = new Date();
  const tiers: Array<{ label: string; min: number; max: number; cls: string }> = [
    {
      label: "Critical — ≤30 days",
      min: -Infinity,
      max: 30,
      cls: "border-red-200 bg-red-50/60 dark:border-red-900 dark:bg-red-950/20",
    },
    {
      label: "Soon — 31–60 days",
      min: 31,
      max: 60,
      cls: "border-amber-200 bg-amber-50/60 dark:border-amber-900 dark:bg-amber-950/20",
    },
    {
      label: "Upcoming — 61–90 days",
      min: 61,
      max: 90,
      cls: "border-blue-200 bg-blue-50/40 dark:border-blue-900 dark:bg-blue-950/10",
    },
  ];

  return (
    <div className="space-y-3">
      {tiers.map((tier) => {
        const items = contracts.filter((c) => {
          if (!c.endDate) return false;
          const d = differenceInDays(parseISO(c.endDate), today);
          return d >= tier.min && d <= tier.max;
        });
        if (items.length === 0) return null;
        return (
          <div key={tier.label} className={`rounded-xl border p-4 ${tier.cls}`}>
            <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
              {tier.max <= 30 && <AlertCircle className="size-4 text-red-500" />}
              {tier.label}
              <span className="ml-auto rounded-full bg-white/60 px-2 py-0.5 text-xs dark:bg-black/20">
                {items.length}
              </span>
            </div>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {items.map((c) => {
                const d = c.endDate ? differenceInDays(parseISO(c.endDate), today) : null;
                return (
                  <div
                    key={c.id}
                    className="flex items-center justify-between gap-2 rounded-lg border bg-background px-3 py-2"
                  >
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium">
                        {c.staffProfile?.user?.name ?? "—"}
                      </div>
                      <div className="text-xs text-muted-foreground">{c.contractType}</div>
                    </div>
                    <DaysBadge days={d} />
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function RenewalStatusSelect({
  contractId,
  current,
}: {
  contractId: string;
  current: RenewalStatus;
}) {
  const queryClient = useQueryClient();
  const mutation = useMutation(orpc.contracts.updateRenewalStatus.mutationOptions());

  function handleChange(value: RenewalStatus | null) {
    if (!value) return;
    mutation.mutate(
      { id: contractId, renewalStatus: value },
      {
        onSuccess: async () => {
          toast.success("Renewal status updated.");
          await queryClient.invalidateQueries({ queryKey: orpc.contracts.list.key() });
        },
        onError: () => toast.error("Failed to update renewal status."),
      },
    );
  }

  return (
    <Select value={current} onValueChange={handleChange} disabled={mutation.isPending}>
      <SelectTrigger className="h-7 w-40 text-xs">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="not_due">Not Due</SelectItem>
        <SelectItem value="due_soon">Due Soon</SelectItem>
        <SelectItem value="letter_drafted">Letter Drafted</SelectItem>
        <SelectItem value="submitted_to_hr">Submitted to HR</SelectItem>
        <SelectItem value="renewed">Renewed</SelectItem>
        <SelectItem value="not_renewing">Not Renewing</SelectItem>
      </SelectContent>
    </Select>
  );
}

function CreateContractDialog({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();

  const { data: staffData } = useQuery(
    orpc.staff.list.queryOptions({ input: { limit: 200, offset: 0 } })
  );

  const [form, setForm] = useState<CreateForm>({
    staffProfileId: "",
    contractType: "",
    startDate: "",
    endDate: "",
  });

  const mutation = useMutation(orpc.contracts.create.mutationOptions());

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.staffProfileId || !form.contractType || !form.startDate) {
      toast.error("Staff member, contract type and start date are required.");
      return;
    }
    try {
      await mutation.mutateAsync({
        staffProfileId: form.staffProfileId,
        contractType: form.contractType,
        startDate: form.startDate,
        endDate: form.endDate || undefined,
      });
      toast.success("Contract created successfully.");
      await queryClient.invalidateQueries({ queryKey: orpc.contracts.list.key() });
      onClose();
    } catch {
      toast.error("Failed to create contract. Check your permissions and try again.");
    }
  }

  return (
    <DialogContent className="sm:max-w-md">
      <DialogHeader>
        <DialogTitle>Create Contract</DialogTitle>
        <DialogDescription>
          Add a new employment contract for an existing staff member.
        </DialogDescription>
      </DialogHeader>
      <form onSubmit={handleSubmit} className="space-y-4 py-2">
        <div className="space-y-1.5">
          <Label htmlFor="create-staff">Staff Member</Label>
          <Select
            value={form.staffProfileId}
            onValueChange={(v) => setForm((f) => ({ ...f, staffProfileId: v ?? "" }))}
          >
            <SelectTrigger id="create-staff">
              <SelectValue placeholder="Select staff member…" />
            </SelectTrigger>
            <SelectContent>
              {staffData?.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.user?.name ?? s.employeeId ?? "Unnamed"}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="create-type">Contract Type</Label>
          <Input
            id="create-type"
            placeholder="e.g. Full-time, Fixed-term, Contractor"
            value={form.contractType}
            onChange={(e) => setForm((f) => ({ ...f, contractType: e.target.value }))}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="create-start">Start Date</Label>
            <Input
              id="create-start"
              type="date"
              value={form.startDate}
              onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="create-end">End Date (optional)</Label>
            <Input
              id="create-end"
              type="date"
              value={form.endDate}
              onChange={(e) => setForm((f) => ({ ...f, endDate: e.target.value }))}
            />
          </div>
        </div>

        <DialogFooter className="pt-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={mutation.isPending}>
            {mutation.isPending ? "Creating…" : "Create Contract"}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}

function EditContractDialog({
  contract,
  onClose,
}: {
  contract: ContractRecord;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();

  const [form, setForm] = useState<EditForm>({
    contractType: contract.contractType,
    startDate: contract.startDate,
    endDate: contract.endDate ?? "",
    status: (contract.status as ContractStatus) || "active",
  });

  const mutation = useMutation(orpc.contracts.update.mutationOptions());

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    try {
      await mutation.mutateAsync({
        id: contract.id,
        contractType: form.contractType || undefined,
        startDate: form.startDate || undefined,
        endDate: form.endDate || undefined,
        status: form.status,
      });
      toast.success("Contract updated successfully.");
      await queryClient.invalidateQueries({ queryKey: orpc.contracts.list.key() });
      onClose();
    } catch {
      toast.error("Failed to update contract. Check your permissions and try again.");
    }
  }

  return (
    <DialogContent className="sm:max-w-md">
      <DialogHeader>
        <DialogTitle>Edit Contract</DialogTitle>
        <DialogDescription>
          Update contract details. Staff member assignment cannot be changed.
        </DialogDescription>
      </DialogHeader>
      <form onSubmit={handleSubmit} className="space-y-4 py-2">
        <div className="space-y-1.5">
          <Label>Staff Member</Label>
          <Input
            value={contract.staffProfile?.user?.name ?? contract.staffProfile?.employeeId ?? "Unnamed"}
            disabled
            className="bg-muted"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="edit-type">Contract Type</Label>
          <Input
            id="edit-type"
            placeholder="e.g. Full-time, Fixed-term, Contractor"
            value={form.contractType}
            onChange={(e) => setForm((f) => ({ ...f, contractType: e.target.value }))}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="edit-start">Start Date</Label>
            <Input
              id="edit-start"
              type="date"
              value={form.startDate}
              onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="edit-end">End Date (optional)</Label>
            <Input
              id="edit-end"
              type="date"
              value={form.endDate}
              onChange={(e) => setForm((f) => ({ ...f, endDate: e.target.value }))}
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="edit-status">Status</Label>
          <Select
            value={form.status}
            onValueChange={(v) => setForm((f) => ({ ...f, status: (v ?? "active") as ContractStatus }))}
          >
            <SelectTrigger id="edit-status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="expiring_soon">Expiring Soon</SelectItem>
              <SelectItem value="expired">Expired</SelectItem>
              <SelectItem value="renewed">Renewed</SelectItem>
              <SelectItem value="terminated">Terminated</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <DialogFooter className="pt-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={mutation.isPending}>
            {mutation.isPending ? "Saving…" : "Save Changes"}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}

function ContractsPage() {
  const navigate = useNavigate();
  const [status, setStatus] = useState<ContractStatus | "">("");
  const [showCreate, setShowCreate] = useState(false);
  const [editingContract, setEditingContract] = useState<ContractRecord | null>(null);

  const { data: allData, isLoading } = useQuery(
    orpc.contracts.list.queryOptions({
      input: { limit: 200, offset: 0 },
    }),
  );

  const { data: expiring } = useQuery(
    orpc.contracts.getExpiringSoon.queryOptions({ input: { withinDays: 90 } }),
  );

  const all = allData ?? [];
  const data = status ? all.filter((c) => c.status === status) : all;

  const stats = {
    active: all.filter((c) => c.status === "active").length,
    expiring: expiring?.length ?? 0,
    expired: all.filter((c) => c.status === "expired").length,
    terminated: all.filter((c) => c.status === "terminated").length,
  };

  return (
    <>
      <Header fixed>
        <div className="flex items-center gap-2">
          <FileText className="size-4 text-muted-foreground" />
          <span className="text-sm font-medium">Contracts</span>
        </div>
        <div className="ms-auto flex items-center gap-2">
          <ThemeSwitch />
        </div>
      </Header>

      <Main>
        <PageHeader
          eyebrow="People"
          title="Staff Contracts"
          description="Employment contract register with renewal tracking."
          actions={
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => exportContractsExcel(data ?? [], `Contracts_${new Date().toISOString().slice(0, 10)}.xlsx`)}
                disabled={!data?.length}
              >
                <FileDown className="size-4 mr-1.5" />
                Export Excel
              </Button>
              <Button size="sm" onClick={() => setShowCreate(true)}>
                <Plus className="size-4 mr-1.5" />
                Create Contract
              </Button>
            </>
          }
        />

        {/* Stats strip */}
        <div className="mb-6 overflow-hidden rounded-2xl border bg-muted/30">
          <div className="flex divide-x text-sm">
            {[
              {
                label: "Active",
                value: stats.active,
                cls: "text-blue-600 dark:text-blue-400",
              },
              {
                label: "Expiring ≤90 days",
                value: stats.expiring,
                cls: stats.expiring > 0 ? "text-amber-600 dark:text-amber-400" : "",
              },
              {
                label: "Expired",
                value: stats.expired,
                cls: stats.expired > 0 ? "text-red-600 dark:text-red-400" : "",
              },
              {
                label: "Terminated",
                value: stats.terminated,
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

        {/* Expiring soon — tiered urgency */}
        {expiring && expiring.length > 0 && (
          <section className="mb-6">
            <h2 className="mb-3 text-base font-semibold">Expiring Soon</h2>
            <ExpiringSoonSection contracts={expiring as ExpiringContract[]} />
          </section>
        )}

        <div className="mb-4 flex flex-wrap gap-3">
          <Select
            value={status === "" ? "_all" : status}
            onValueChange={(v) =>
              setStatus(!v || v === "_all" ? "" : (v as ContractStatus))
            }
          >
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="All Statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="_all">All Statuses</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="expiring_soon">Expiring Soon</SelectItem>
              <SelectItem value="expired">Expired</SelectItem>
              <SelectItem value="renewed">Renewed</SelectItem>
              <SelectItem value="terminated">Terminated</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="rounded-xl border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Staff Member</TableHead>
                <TableHead>Contract Type</TableHead>
                <TableHead>Start Date</TableHead>
                <TableHead>End Date</TableHead>
                <TableHead>Days Until Renewal</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Renewal Status</TableHead>
                <TableHead className="w-24 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 8 }).map((_, j) => (
                      <TableCell key={j}>
                        <Skeleton className="h-4 w-full" />
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : !data?.length ? (
                <TableRow>
                  <TableCell colSpan={8} className="py-12 text-center text-muted-foreground">
                    No contracts found.
                  </TableCell>
                </TableRow>
              ) : (
                data.map((contract) => {
                  const renewalStatus = (contract.renewalStatus ?? "not_due") as RenewalStatus;
                  return (
                    <TableRow key={contract.id}>
                      <TableCell className="font-medium">
                        {contract.staffProfile?.user?.name ?? "—"}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {contract.contractType}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {contract.startDate
                          ? format(parseISO(contract.startDate), "dd MMM yyyy")
                          : "—"}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {contract.endDate
                          ? format(parseISO(contract.endDate), "dd MMM yyyy")
                          : "Open-ended"}
                      </TableCell>
                      <TableCell>
                        <DaysBadge days={daysUntilEnd(contract.endDate)} />
                      </TableCell>
                      <TableCell>
                        <span
                          className={`inline-flex items-center rounded-lg px-2 py-0.5 text-xs font-medium ${
                            STATUS_COLORS[contract.status as ContractStatus] ?? ""
                          }`}
                        >
                          {contract.status.replace(/_/g, " ")}
                        </span>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <span
                            className={`inline-flex shrink-0 items-center rounded-lg px-2 py-0.5 text-xs font-medium ${
                              RENEWAL_STATUS_COLORS[renewalStatus]
                            }`}
                          >
                            {RENEWAL_STATUS_LABELS[renewalStatus]}
                          </span>
                          <RenewalStatusSelect
                            contractId={contract.id}
                            current={renewalStatus}
                          />
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-8"
                            onClick={() => setEditingContract(contract as ContractRecord)}
                            title="Edit contract"
                          >
                            <Pencil className="size-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-8"
                            onClick={() =>
                              navigate({
                                to: "/contracts/$contractId",
                                params: { contractId: contract.id },
                              })
                            }
                            title="View contract details"
                          >
                            <ArrowRight className="size-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </Main>

      <Dialog open={showCreate} onOpenChange={(open) => !open && setShowCreate(false)}>
        <CreateContractDialog onClose={() => setShowCreate(false)} />
      </Dialog>

      <Dialog
        open={!!editingContract}
        onOpenChange={(open) => !open && setEditingContract(null)}
      >
        {editingContract && (
          <EditContractDialog
            contract={editingContract}
            onClose={() => setEditingContract(null)}
          />
        )}
      </Dialog>
    </>
  );
}
