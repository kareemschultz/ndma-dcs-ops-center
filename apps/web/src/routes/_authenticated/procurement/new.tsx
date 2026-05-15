import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { ShoppingCart, Plus, Trash2, ArrowLeft } from "lucide-react";
import { Button } from "@ndma-dcs-staff-portal/ui/components/button";
import { Header } from "@/components/layout/header";
import { Main } from "@/components/layout/main";
import { ThemeSwitch } from "@/components/theme-switch";
import { orpc, queryClient } from "@/utils/orpc";
import { departmentOptionLabel } from "@/lib/departments";

export const Route = createFileRoute("/_authenticated/procurement/new")({
  component: NewPRPage,
});

const lineItemSchema = z.object({
  description: z.string().min(1, "Required"),
  quantity: z.number().min(1),
  unitCost: z.string().min(1, "Required"),
  unit: z.string(),
});

const schema = z.object({
  title: z.string().min(1, "Title is required"),
  description: z.string().optional(),
  justification: z.string().optional(),
  priority: z.enum(["low", "medium", "high", "urgent"]),
  departmentId: z.string().optional(),
  lineItems: z.array(lineItemSchema).min(1, "At least one line item is required"),
});

type FormData = z.infer<typeof schema>;

function NewPRPage() {
  const navigate = useNavigate();

  const { data: departments } = useQuery(orpc.staff.getDepartments.queryOptions());
  const { data: staff } = useQuery(
    orpc.staff.list.queryOptions({ input: { limit: 100, offset: 0 } })
  );

  const {
    register,
    control,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      priority: "medium",
      lineItems: [{ description: "", quantity: 1, unitCost: "", unit: "pcs" }],
    },
  });

  const { fields, append, remove } = useFieldArray({ control, name: "lineItems" });

  const lineItems = watch("lineItems");
  const estimatedTotal = lineItems.reduce((sum, item) => {
    const cost = parseFloat(item.unitCost || "0") * (item.quantity || 0);
    return sum + (isNaN(cost) ? 0 : cost);
  }, 0);

  const mutation = useMutation(
    orpc.procurement.create.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: orpc.procurement.list.key() });
        queryClient.invalidateQueries({ queryKey: orpc.procurement.stats.key() });
        toast.success("Purchase requisition created");
        navigate({ to: "/procurement" });
      },
      onError: (err) => toast.error(err.message),
    })
  );

  return (
    <>
      <Header fixed>
        <div className="flex items-center gap-2">
          <ShoppingCart className="size-4 text-muted-foreground" />
          <span className="text-sm font-medium">New Purchase Requisition</span>
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
            onClick={() => navigate({ to: "/procurement" })}
          >
            <ArrowLeft className="size-3.5" />
            Back to Procurement
          </Button>
          <h1 className="text-2xl font-bold tracking-tight">New Purchase Requisition</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Submit a purchase request for departmental approval.
          </p>
        </div>

        <form
          onSubmit={handleSubmit((data: FormData) => mutation.mutate(data))}
          className="space-y-6 max-w-2xl"
        >
          {/* PR Details */}
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1.5">
                Title <span className="text-destructive">*</span>
              </label>
              <input
                {...register("title")}
                placeholder="Brief title for the requisition"
                className="w-full rounded-xl border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
              {errors.title && (
                <p className="text-xs text-destructive mt-1">{errors.title.message}</p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1.5">Priority</label>
                <select
                  {...register("priority")}
                  className="w-full rounded-xl border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                  <option value="urgent">Urgent</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5">Department</label>
                <select
                  {...register("departmentId")}
                  className="w-full rounded-xl border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  <option value="">Select department</option>
                  {departments?.map((d) => (
                    <option key={d.id} value={d.id}>{departmentOptionLabel(d)}</option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1.5">Description</label>
              <textarea
                {...register("description")}
                rows={2}
                placeholder="What is being purchased?"
                className="w-full rounded-xl border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1.5">Business Justification</label>
              <textarea
                {...register("justification")}
                rows={2}
                placeholder="Why is this purchase needed?"
                className="w-full rounded-xl border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none"
              />
            </div>
          </div>

          {/* Line Items */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <label className="text-sm font-medium">
                Line Items <span className="text-destructive">*</span>
              </label>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-7 text-xs gap-1"
                onClick={() =>
                  append({ description: "", quantity: 1, unitCost: "", unit: "pcs" })
                }
              >
                <Plus className="size-3" />
                Add Item
              </Button>
            </div>

            {errors.lineItems?.root && (
              <p className="text-xs text-destructive mb-2">{errors.lineItems.root.message}</p>
            )}

            <div className="space-y-2">
              {fields.map((field, index) => (
                <div key={field.id} className="rounded-xl border p-3 space-y-2">
                  <div className="flex items-start gap-2">
                    <div className="flex-1">
                      <input
                        {...register(`lineItems.${index}.description`)}
                        placeholder="Item description"
                        className="w-full rounded-xl border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                      />
                    </div>
                    {fields.length > 1 && (
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="size-7 shrink-0"
                        onClick={() => remove(index)}
                      >
                        <Trash2 className="size-3.5 text-muted-foreground" />
                      </Button>
                    )}
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <input
                        {...register(`lineItems.${index}.quantity`, { valueAsNumber: true })}
                        type="number"
                        min={1}
                        placeholder="Qty"
                        className="w-full rounded-xl border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                      />
                    </div>
                    <div>
                      <input
                        {...register(`lineItems.${index}.unitCost`)}
                        placeholder="Unit cost (GHS)"
                        className="w-full rounded-xl border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                      />
                    </div>
                    <div>
                      <input
                        {...register(`lineItems.${index}.unit`)}
                        placeholder="Unit (pcs, kg…)"
                        className="w-full rounded-xl border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-3 text-right">
              <p className="text-sm text-muted-foreground">
                Estimated Total:{" "}
                <strong className="text-foreground">
                  GHS {estimatedTotal.toLocaleString("en-GH", { minimumFractionDigits: 2 })}
                </strong>
              </p>
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? "Creating..." : "Create Requisition"}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => navigate({ to: "/procurement" })}
            >
              Cancel
            </Button>
          </div>
        </form>
      </Main>
    </>
  );
}
