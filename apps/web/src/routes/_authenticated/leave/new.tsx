import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { differenceInBusinessDays, parseISO } from "date-fns";
import { ArrowLeft, CalendarOff } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@ndma-dcs-staff-portal/ui/components/button";
import { Header } from "@/components/layout/header";
import { Main } from "@/components/layout/main";
import { ThemeSwitch } from "@/components/theme-switch";
import {
  getLeaveTypeDisplayName,
  isVisibleLeaveType,
  sortLeaveTypesByCanonicalOrder,
} from "@/lib/leave-types";
import { orpc, queryClient } from "@/utils/orpc";

export const Route = createFileRoute("/_authenticated/leave/new")({
  component: NewLeavePage,
});

const schema = z
  .object({
    staffProfileId: z.string().min(1, "Staff member is required"),
    leaveTypeId: z.string().min(1, "Leave type is required"),
    startDate: z.string().min(1, "Start date is required"),
    endDate: z.string().min(1, "End date is required"),
    reason: z.string().optional(),
  })
  .refine((d) => d.endDate >= d.startDate, {
    message: "End date must be on or after start date",
    path: ["endDate"],
  });

type FormData = z.infer<typeof schema>;

function NewLeavePage() {
  const navigate = useNavigate();

  const { data: staff } = useQuery(
    orpc.staff.list.queryOptions({ input: { limit: 100, offset: 0 } }),
  );
  const { data: leaveTypes } = useQuery(orpc.leave.types.list.queryOptions());
  const visibleLeaveTypes = leaveTypes
    ?.filter((leaveType) => isVisibleLeaveType(leaveType.name))
    .slice()
    .sort(sortLeaveTypesByCanonicalOrder);

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<FormData>({ resolver: zodResolver(schema) });

  const startDate = watch("startDate");
  const endDate = watch("endDate");
  const totalDays =
    startDate && endDate && endDate >= startDate
      ? Math.max(1, differenceInBusinessDays(parseISO(endDate), parseISO(startDate)) + 1)
      : null;

  const mutation = useMutation(
    orpc.leave.requests.create.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: orpc.leave.requests.list.key() });
        toast.success("Leave request submitted");
        navigate({ to: "/leave" });
      },
      onError: (err) => toast.error(err.message),
    }),
  );

  return (
    <>
      <Header fixed>
        <div className="flex items-center gap-2">
          <CalendarOff className="size-4 text-muted-foreground" />
          <span className="text-sm font-medium">Submit Leave Request</span>
        </div>
        <div className="ms-auto flex items-center gap-2">
          <ThemeSwitch />
        </div>
      </Header>

      <Main>
        <div className="mb-6">
          <Button
            variant="ghost"
            size="sm"
            className="mb-3 -ml-2 gap-1"
            onClick={() => navigate({ to: "/leave" })}
          >
            <ArrowLeft className="size-3.5" />
            Back to Leave
          </Button>
          <h1 className="text-2xl font-bold tracking-tight">Submit Leave Request</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Submit a leave request for approval.
          </p>
        </div>

        <form
          onSubmit={handleSubmit((data) => mutation.mutate({ ...data, totalDays: totalDays ?? 1 }))}
          className="max-w-2xl space-y-5"
        >
          <div>
            <label className="mb-1.5 block text-sm font-medium">
              Staff Member <span className="text-destructive">*</span>
            </label>
            <select
              {...register("staffProfileId")}
              className="w-full rounded-xl border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="">Select staff member</option>
              {staff?.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.user?.name}
                </option>
              ))}
            </select>
            {errors.staffProfileId && (
              <p className="mt-1 text-xs text-destructive">{errors.staffProfileId.message}</p>
            )}
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium">
              Leave Type <span className="text-destructive">*</span>
            </label>
            <select
              {...register("leaveTypeId")}
              className="w-full rounded-xl border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="">Select leave type</option>
              {visibleLeaveTypes?.map((t) => (
                <option key={t.id} value={t.id}>
                  {getLeaveTypeDisplayName(t.name)}
                </option>
              ))}
            </select>
            {errors.leaveTypeId && (
              <p className="mt-1 text-xs text-destructive">{errors.leaveTypeId.message}</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1.5 block text-sm font-medium">
                Start Date <span className="text-destructive">*</span>
              </label>
              <input
                {...register("startDate")}
                type="date"
                className="w-full rounded-xl border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
              {errors.startDate && (
                <p className="mt-1 text-xs text-destructive">{errors.startDate.message}</p>
              )}
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium">
                End Date <span className="text-destructive">*</span>
              </label>
              <input
                {...register("endDate")}
                type="date"
                className="w-full rounded-xl border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
              {errors.endDate && (
                <p className="mt-1 text-xs text-destructive">{errors.endDate.message}</p>
              )}
            </div>
          </div>

          {totalDays !== null && (
            <p className="text-sm text-muted-foreground">
              Duration:{" "}
              <strong className="text-foreground">
                {totalDays} business day{totalDays !== 1 ? "s" : ""}
              </strong>
            </p>
          )}

          <div>
            <label className="mb-1.5 block text-sm font-medium">Reason</label>
            <textarea
              {...register("reason")}
              rows={3}
              placeholder="Optional reason for leave..."
              className="w-full resize-none rounded-xl border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          <div className="flex gap-3 pt-2">
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? "Submitting..." : "Submit Request"}
            </Button>
            <Button type="button" variant="outline" onClick={() => navigate({ to: "/leave" })}>
              Cancel
            </Button>
          </div>
        </form>
      </Main>
    </>
  );
}
