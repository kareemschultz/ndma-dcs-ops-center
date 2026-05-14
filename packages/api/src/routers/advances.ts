import { ORPCError } from "@orpc/server";
import { and, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";

import {
  advanceExpenseLines,
  advanceRequests,
  db,
} from "@ndma-dcs-staff-portal/db";

import { requireRole } from "../index";
import { logAudit } from "../lib/audit";
import { getCallerStaffProfile, getManagedStaffIds } from "../lib/scope";

const STATUS_VALUES = ["pending", "partial", "cleared"] as const;
const EXPENSE_KIND_VALUES = [
  "breakfast",
  "lunch",
  "dinner",
  "out_of_pocket",
  "miscellaneous",
] as const;

const expenseLineInputSchema = z.object({
  kind: z.enum(EXPENSE_KIND_VALUES),
  persons: z.number().int().min(0).default(0),
  costPerUnit: z.number().min(0).default(0),
  days: z.number().int().min(0).default(0),
});

function computeLineAmount(line: {
  kind: (typeof EXPENSE_KIND_VALUES)[number];
  persons: number;
  costPerUnit: number;
  days: number;
}): number {
  if (line.kind === "miscellaneous") return line.costPerUnit;
  return line.persons * line.costPerUnit * line.days;
}

async function generateRefNumber(): Promise<string> {
  const year = new Date().getFullYear();
  const result = await db
    .select({ count: sql<number>`count(*)` })
    .from(advanceRequests)
    .where(sql`extract(year from ${advanceRequests.dateRequested}) = ${year}`);
  const count = Number(result[0]?.count ?? 0);
  return `ADV-${year}-${String(count + 1).padStart(4, "0")}`;
}

function rid(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
}

export const advancesRouter = {
  list: requireRole("advance", "read")
    .input(
      z.object({
        staffProfileId: z.string().optional(),
        status: z.enum(STATUS_VALUES).optional(),
        limit: z.number().min(1).max(200).default(100),
        offset: z.number().min(0).default(0),
      }),
    )
    .handler(async ({ input, context }) => {
      const role = context.userRole ?? "";
      const isPrivileged = role === "admin" || role === "hrAdminOps";

      const conditions = [];
      if (input.staffProfileId) {
        conditions.push(eq(advanceRequests.staffProfileId, input.staffProfileId));
      } else if (!isPrivileged) {
        const caller = await getCallerStaffProfile(context);
        const managed = new Set(await getManagedStaffIds(context));
        if (caller?.id) managed.add(caller.id);
        if (managed.size === 0) return [];
        const ids = [...managed];
        conditions.push(sql`${advanceRequests.staffProfileId} IN ${ids}`);
      }
      if (input.status) conditions.push(eq(advanceRequests.status, input.status));

      return db.query.advanceRequests.findMany({
        where: conditions.length > 0 ? and(...conditions) : undefined,
        with: {
          staffProfile: { with: { user: true, department: true } },
          lines: true,
        },
        orderBy: [desc(advanceRequests.dateRequested)],
        limit: input.limit,
        offset: input.offset,
      });
    }),

  get: requireRole("advance", "read")
    .input(z.object({ id: z.string() }))
    .handler(async ({ input }) => {
      const row = await db.query.advanceRequests.findFirst({
        where: eq(advanceRequests.id, input.id),
        with: {
          staffProfile: { with: { user: true, department: true } },
          lines: true,
        },
      });
      if (!row) throw new ORPCError("NOT_FOUND", { message: "Advance request not found" });
      return row;
    }),

  stats: requireRole("advance", "read").handler(async () => {
    const all = await db.query.advanceRequests.findMany();
    return {
      total: all.length,
      pending: all.filter((r) => r.status === "pending").length,
      partial: all.filter((r) => r.status === "partial").length,
      cleared: all.filter((r) => r.status === "cleared").length,
      totalDisbursed: all.reduce((s, r) => s + Number(r.totalAmount), 0),
    };
  }),

  create: requireRole("advance", "create")
    .input(
      z.object({
        staffProfileId: z.string().min(1),
        purpose: z.string().min(1).max(2000),
        recipients: z.array(z.string()).default([]),
        dateRequested: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        expectedClearance: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        notes: z.string().optional(),
        signatureDataUrl: z.string().optional(),
        lines: z.array(expenseLineInputSchema).default([]),
      }),
    )
    .handler(async ({ input, context }) => {
      const refNumber = await generateRefNumber();
      const id = rid("adv");
      const linesWithAmounts = input.lines.map((line) => ({
        ...line,
        amount: computeLineAmount(line),
      }));
      const totalAmount = linesWithAmounts.reduce((s, l) => s + l.amount, 0);

      const inserted = await db
        .insert(advanceRequests)
        .values({
          id,
          refNumber,
          staffProfileId: input.staffProfileId,
          purpose: input.purpose,
          recipients: input.recipients,
          dateRequested: input.dateRequested,
          expectedClearance: input.expectedClearance,
          totalAmount: String(totalAmount),
          status: "pending",
          notes: input.notes,
          signatureDataUrl: input.signatureDataUrl,
        })
        .returning();

      const created = inserted[0];
      if (!created) {
        throw new ORPCError("INTERNAL_SERVER_ERROR", { message: "Failed to create advance" });
      }

      if (linesWithAmounts.length > 0) {
        await db.insert(advanceExpenseLines).values(
          linesWithAmounts.map((line) => ({
            id: rid("adv_ln"),
            advanceRequestId: id,
            kind: line.kind,
            persons: line.persons,
            costPerUnit: String(line.costPerUnit),
            days: line.days,
            amount: String(line.amount),
          })),
        );
      }

      await logAudit({
        actorId: context.session?.user.id ?? "",
        actorName: context.session?.user.name ?? "",
        actorRole: context.userRole ?? undefined,
        correlationId: context.requestId,
        action: "advance.create",
        module: "procurement",
        resourceType: "advance_request",
        resourceId: id,
        afterValue: created as Record<string, unknown>,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
      });

      return { id, refNumber };
    }),

  update: requireRole("advance", "update")
    .input(
      z.object({
        id: z.string(),
        purpose: z.string().min(1).optional(),
        recipients: z.array(z.string()).optional(),
        dateRequested: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        expectedClearance: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        actualClearance: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        notes: z.string().optional(),
        signatureDataUrl: z.string().optional(),
        lines: z.array(expenseLineInputSchema).optional(),
        status: z.enum(STATUS_VALUES).optional(),
      }),
    )
    .handler(async ({ input, context }) => {
      const existing = await db.query.advanceRequests.findFirst({
        where: eq(advanceRequests.id, input.id),
        with: { lines: true },
      });
      if (!existing) throw new ORPCError("NOT_FOUND", { message: "Advance request not found" });

      let totalAmount: string | undefined;
      if (input.lines) {
        const linesWithAmounts = input.lines.map((line) => ({
          ...line,
          amount: computeLineAmount(line),
        }));
        const sum = linesWithAmounts.reduce((s, l) => s + l.amount, 0);
        totalAmount = String(sum);

        await db.delete(advanceExpenseLines).where(eq(advanceExpenseLines.advanceRequestId, input.id));
        if (linesWithAmounts.length > 0) {
          await db.insert(advanceExpenseLines).values(
            linesWithAmounts.map((line) => ({
              id: rid("adv_ln"),
              advanceRequestId: input.id,
              kind: line.kind,
              persons: line.persons,
              costPerUnit: String(line.costPerUnit),
              days: line.days,
              amount: String(line.amount),
            })),
          );
        }
      }

      const updates: Record<string, unknown> = {};
      if (input.purpose !== undefined) updates.purpose = input.purpose;
      if (input.recipients !== undefined) updates.recipients = input.recipients;
      if (input.dateRequested !== undefined) updates.dateRequested = input.dateRequested;
      if (input.expectedClearance !== undefined) updates.expectedClearance = input.expectedClearance;
      if (input.actualClearance !== undefined) updates.actualClearance = input.actualClearance;
      if (input.notes !== undefined) updates.notes = input.notes;
      if (input.signatureDataUrl !== undefined) updates.signatureDataUrl = input.signatureDataUrl;
      if (input.status !== undefined) updates.status = input.status;
      if (totalAmount !== undefined) updates.totalAmount = totalAmount;

      if (Object.keys(updates).length > 0) {
        await db.update(advanceRequests).set(updates).where(eq(advanceRequests.id, input.id));
      }

      await logAudit({
        actorId: context.session?.user.id ?? "",
        actorName: context.session?.user.name ?? "",
        actorRole: context.userRole ?? undefined,
        correlationId: context.requestId,
        action: "advance.update",
        module: "procurement",
        resourceType: "advance_request",
        resourceId: input.id,
        beforeValue: existing as Record<string, unknown>,
        afterValue: updates,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
      });

      return { success: true };
    }),

  approve: requireRole("advance", "approve")
    .input(z.object({ id: z.string() }))
    .handler(async ({ input, context }) => {
      const existing = await db.query.advanceRequests.findFirst({
        where: eq(advanceRequests.id, input.id),
      });
      if (!existing) throw new ORPCError("NOT_FOUND");
      if (existing.status !== "pending") {
        throw new ORPCError("BAD_REQUEST", { message: "Only pending advances can be approved" });
      }
      await db
        .update(advanceRequests)
        .set({ status: "partial" })
        .where(eq(advanceRequests.id, input.id));
      await logAudit({
        actorId: context.session?.user.id ?? "",
        actorName: context.session?.user.name ?? "",
        actorRole: context.userRole ?? undefined,
        correlationId: context.requestId,
        action: "advance.approve",
        module: "procurement",
        resourceType: "advance_request",
        resourceId: input.id,
        beforeValue: existing as Record<string, unknown>,
        afterValue: { status: "partial" },
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
      });
      return { success: true };
    }),

  clear: requireRole("advance", "clear")
    .input(
      z.object({
        id: z.string(),
        actualClearance: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      }),
    )
    .handler(async ({ input, context }) => {
      const existing = await db.query.advanceRequests.findFirst({
        where: eq(advanceRequests.id, input.id),
      });
      if (!existing) throw new ORPCError("NOT_FOUND");
      await db
        .update(advanceRequests)
        .set({ status: "cleared", actualClearance: input.actualClearance })
        .where(eq(advanceRequests.id, input.id));
      await logAudit({
        actorId: context.session?.user.id ?? "",
        actorName: context.session?.user.name ?? "",
        actorRole: context.userRole ?? undefined,
        correlationId: context.requestId,
        action: "advance.clear",
        module: "procurement",
        resourceType: "advance_request",
        resourceId: input.id,
        beforeValue: existing as Record<string, unknown>,
        afterValue: { status: "cleared", actualClearance: input.actualClearance },
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
      });
      return { success: true };
    }),

  delete: requireRole("advance", "delete")
    .input(z.object({ id: z.string() }))
    .handler(async ({ input, context }) => {
      const existing = await db.query.advanceRequests.findFirst({
        where: eq(advanceRequests.id, input.id),
      });
      if (!existing) throw new ORPCError("NOT_FOUND");
      await db.delete(advanceRequests).where(eq(advanceRequests.id, input.id));
      await logAudit({
        actorId: context.session?.user.id ?? "",
        actorName: context.session?.user.name ?? "",
        actorRole: context.userRole ?? undefined,
        correlationId: context.requestId,
        action: "advance.delete",
        module: "procurement",
        resourceType: "advance_request",
        resourceId: input.id,
        beforeValue: existing as Record<string, unknown>,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
      });
      return { success: true };
    }),
};
