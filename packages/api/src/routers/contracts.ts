import { ORPCError } from "@orpc/server";
import { z } from "zod";
import { db, contracts } from "@ndma-dcs-staff-portal/db";
import { and, eq, lte, sql } from "drizzle-orm";

import { requireRole } from "../index";
import { logAudit } from "../lib/audit";
import { fireContractReminders } from "../lib/contract-reminders";

export const contractsRouter = {
  list: requireRole("contract", "read")
    .input(
      z.object({
        staffProfileId: z.string().optional(),
        status: z
          .enum(["active", "expiring_soon", "expired", "renewed", "terminated"])
          .optional(),
        limit: z.number().min(1).max(200).default(50),
        offset: z.number().min(0).default(0),
      }),
    )
    .handler(async ({ input }) => {
      const conditions = [];
      if (input.staffProfileId)
        conditions.push(eq(contracts.staffProfileId, input.staffProfileId));
      if (input.status) conditions.push(eq(contracts.status, input.status));

      return db.query.contracts.findMany({
        where: conditions.length > 0 ? and(...conditions) : undefined,
        with: { staffProfile: { with: { user: true } } },
        limit: input.limit,
        offset: input.offset,
      });
    }),

  get: requireRole("contract", "read")
    .input(z.object({ id: z.string() }))
    .handler(async ({ input }) => {
      const contract = await db.query.contracts.findFirst({
        where: eq(contracts.id, input.id),
        with: { staffProfile: { with: { user: true, department: true } } },
      });
      if (!contract) throw new ORPCError("NOT_FOUND");
      return contract;
    }),

  create: requireRole("contract", "create")
    .input(
      z.object({
        staffProfileId: z.string(),
        contractType: z.string().min(1),
        startDate: z.string(),
        endDate: z.string().optional(),
        appraisalPeriod: z.string().optional(),
        renewalReminderDays: z.number().default(60),
        documentUrl: z.string().optional(),
        notes: z.string().optional(),
      }),
    )
    .handler(async ({ input, context }) => {
      const [contract] = await db
        .insert(contracts)
        .values({
          ...input,
          endDate: input.endDate ?? null,
        })
        .returning();
      if (!contract) throw new ORPCError("INTERNAL_SERVER_ERROR");

      await logAudit({
        actorId: context.session.user.id,
        actorName: context.session.user.name,
        action: "contract.create",
        module: "staff",
        resourceType: "contract",
        resourceId: contract.id,
        afterValue: contract as Record<string, unknown>,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
        actorRole: context.userRole ?? undefined,
        correlationId: context.requestId,
      });

      return contract;
    }),

  update: requireRole("contract", "update")
    .input(
      z.object({
        id: z.string(),
        contractType: z.string().optional(),
        startDate: z.string().optional(),
        endDate: z.string().optional(),
        appraisalPeriod: z.string().optional(),
        renewalReminderDays: z.number().optional(),
        status: z
          .enum(["active", "expiring_soon", "expired", "renewed", "terminated"])
          .optional(),
        documentUrl: z.string().optional(),
        notes: z.string().optional(),
      }),
    )
    .handler(async ({ input, context }) => {
      const { id, ...updates } = input;
      const before = await db.query.contracts.findFirst({
        where: eq(contracts.id, id),
      });
      if (!before) throw new ORPCError("NOT_FOUND");

      const [updated] = await db
        .update(contracts)
        .set(updates)
        .where(eq(contracts.id, id))
        .returning();

      await logAudit({
        actorId: context.session.user.id,
        actorName: context.session.user.name,
        action: "contract.update",
        module: "staff",
        resourceType: "contract",
        resourceId: id,
        beforeValue: before as Record<string, unknown>,
        afterValue: updated as Record<string, unknown>,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
        actorRole: context.userRole ?? undefined,
        correlationId: context.requestId,
      });

      return updated;
    }),

  // Soft-archive: terminate a contract (audit-preserving — contracts are never hard-deleted).
  archive: requireRole("contract", "update")
    .input(z.object({ id: z.string() }))
    .handler(async ({ input, context }) => {
      const before = await db.query.contracts.findFirst({
        where: eq(contracts.id, input.id),
      });
      if (!before) throw new ORPCError("NOT_FOUND", { message: "Contract not found" });
      if (before.status === "terminated")
        throw new ORPCError("CONFLICT", { message: "Contract is already terminated" });

      const [updated] = await db
        .update(contracts)
        .set({ status: "terminated", updatedAt: new Date() })
        .where(eq(contracts.id, input.id))
        .returning();

      await logAudit({
        actorId: context.session.user.id,
        actorName: context.session.user.name,
        actorRole: context.userRole ?? undefined,
        correlationId: context.requestId,
        action: "contract.archive",
        module: "contracts",
        resourceType: "contract",
        resourceId: input.id,
        beforeValue: { status: before.status },
        afterValue: { status: "terminated" },
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
      });

      return updated;
    }),

  updateRenewalStatus: requireRole("contract", "update")
    .input(
      z.object({
        id: z.string(),
        renewalStatus: z.enum([
          "not_due",
          "due_soon",
          "letter_drafted",
          "submitted_to_hr",
          "renewed",
          "not_renewing",
        ]),
      }),
    )
    .handler(async ({ input, context }) => {
      const before = await db.query.contracts.findFirst({
        where: eq(contracts.id, input.id),
      });
      if (!before) throw new ORPCError("NOT_FOUND", { message: "Contract not found" });

      const [updated] = await db
        .update(contracts)
        .set({ renewalStatus: input.renewalStatus, updatedAt: new Date() })
        .where(eq(contracts.id, input.id))
        .returning();

      await logAudit({
        actorId: context.session.user.id,
        actorName: context.session.user.name,
        actorRole: context.userRole ?? undefined,
        correlationId: context.requestId,
        action: "contract.updateRenewalStatus",
        module: "contracts",
        resourceType: "contract",
        resourceId: input.id,
        beforeValue: { renewalStatus: before.renewalStatus } as Record<string, unknown>,
        afterValue: { renewalStatus: input.renewalStatus } as Record<string, unknown>,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
      });

      return updated;
    }),

  getExpiringSoon: requireRole("contract", "read")
    .input(z.object({ withinDays: z.number().default(60) }))
    .handler(async ({ input }) => {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() + input.withinDays);
      const cutoffStr = cutoff.toISOString().slice(0, 10);

      return db.query.contracts.findMany({
        where: and(
          sql`${contracts.endDate} IS NOT NULL`,
          lte(contracts.endDate, cutoffStr),
          sql`${contracts.status} NOT IN ('expired', 'terminated', 'renewed')`,
        ),
        with: { staffProfile: { with: { user: true, department: true } } },
      });
    }),

  /** Compute and store lifecycle dates from endDate. */
  setLifecycleDates: requireRole("contract", "update")
    .input(
      z.object({
        id: z.string(),
        renewalLetterDueDate: z.string().optional(),
        appraisal1DueDate: z.string().optional(),
        appraisal2DueDate: z.string().optional(),
      }),
    )
    .handler(async ({ input, context }) => {
      const { id, ...dates } = input;
      const before = await db.query.contracts.findFirst({ where: eq(contracts.id, id) });
      if (!before) throw new ORPCError("NOT_FOUND");

      // Auto-compute from endDate if individual dates not supplied
      let renewalLetterDueDate = dates.renewalLetterDueDate;
      let appraisal1DueDate = dates.appraisal1DueDate;
      let appraisal2DueDate = dates.appraisal2DueDate;

      function addMonths(dateStr: string, months: number): string {
        const d = new Date(dateStr);
        d.setMonth(d.getMonth() + months);
        return d.toISOString().slice(0, 10);
      }

      if (!renewalLetterDueDate && before.endDate) {
        renewalLetterDueDate = addMonths(before.endDate, -3);
      }
      if (!appraisal2DueDate && renewalLetterDueDate) {
        appraisal2DueDate = renewalLetterDueDate;
      }
      if (!appraisal1DueDate && renewalLetterDueDate) {
        appraisal1DueDate = addMonths(renewalLetterDueDate, -6);
      }

      const [updated] = await db
        .update(contracts)
        .set({ renewalLetterDueDate, appraisal1DueDate, appraisal2DueDate })
        .where(eq(contracts.id, id))
        .returning();
      if (!updated) throw new ORPCError("INTERNAL_SERVER_ERROR");

      await logAudit({
        actorId: context.session.user.id,
        actorName: context.session.user.name,
        actorRole: context.userRole ?? undefined,
        correlationId: context.requestId,
        action: "contract.setLifecycleDates",
        module: "contracts",
        resourceType: "contract",
        resourceId: id,
        beforeValue: { renewalLetterDueDate: before.renewalLetterDueDate, appraisal1DueDate: before.appraisal1DueDate } as Record<string, unknown>,
        afterValue: { renewalLetterDueDate, appraisal1DueDate, appraisal2DueDate } as Record<string, unknown>,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
      });

      return updated;
    }),

  /** Record when contract was submitted to HR. */
  submitToHR: requireRole("contract", "update")
    .input(z.object({ id: z.string() }))
    .handler(async ({ input, context }) => {
      const before = await db.query.contracts.findFirst({ where: eq(contracts.id, input.id) });
      if (!before) throw new ORPCError("NOT_FOUND");

      const [updated] = await db
        .update(contracts)
        .set({ submittedToHrAt: new Date(), renewalStatus: "submitted_to_hr" })
        .where(eq(contracts.id, input.id))
        .returning();
      if (!updated) throw new ORPCError("INTERNAL_SERVER_ERROR");

      await logAudit({
        actorId: context.session.user.id,
        actorName: context.session.user.name,
        actorRole: context.userRole ?? undefined,
        correlationId: context.requestId,
        action: "contract.submitToHR",
        module: "contracts",
        resourceType: "contract",
        resourceId: input.id,
        afterValue: { submittedToHrAt: updated.submittedToHrAt } as Record<string, unknown>,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
      });

      return updated;
    }),

  /** Record the final renewal outcome. */
  setOutcome: requireRole("contract", "update")
    .input(
      z.object({
        id: z.string(),
        renewalOutcome: z.enum(["renewed", "not_renewed", "left", "terminated"]),
      }),
    )
    .handler(async ({ input, context }) => {
      const before = await db.query.contracts.findFirst({ where: eq(contracts.id, input.id) });
      if (!before) throw new ORPCError("NOT_FOUND");

      const newStatus =
        input.renewalOutcome === "renewed"
          ? "renewed"
          : input.renewalOutcome === "terminated"
            ? "terminated"
            : "expired";

      const [updated] = await db
        .update(contracts)
        .set({ renewalOutcome: input.renewalOutcome, status: newStatus })
        .where(eq(contracts.id, input.id))
        .returning();
      if (!updated) throw new ORPCError("INTERNAL_SERVER_ERROR");

      await logAudit({
        actorId: context.session.user.id,
        actorName: context.session.user.name,
        actorRole: context.userRole ?? undefined,
        correlationId: context.requestId,
        action: "contract.setOutcome",
        module: "contracts",
        resourceType: "contract",
        resourceId: input.id,
        beforeValue: { renewalOutcome: before.renewalOutcome } as Record<string, unknown>,
        afterValue: { renewalOutcome: input.renewalOutcome, status: newStatus } as Record<string, unknown>,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
      });

      return updated;
    }),

  /** Get all contracts for a staff member with lifecycle timeline. */
  getTimeline: requireRole("contract", "read")
    .input(z.object({ staffProfileId: z.string() }))
    .handler(async ({ input }) => {
      return db.query.contracts.findMany({
        where: eq(contracts.staffProfileId, input.staffProfileId),
        orderBy: (table, { desc }) => [desc(table.startDate)],
        with: { staffProfile: { with: { user: true } } },
      });
    }),

  /**
   * Fire the 6-tier reminder ladder (90/60/30/14/7/1 days before expiry).
   * Master plan §8 Phase 6 acceptance criterion. Idempotent — re-running on the
   * same day produces no duplicate notifications.
   *
   * Call this from a daily cron (Cloudflare Workers / Vercel Cron at 09:00 GYT).
   */
  fireReminderLadder: requireRole("contract", "update")
    .input(z.object({}).optional())
    .handler(async ({ context }) => {
      const result = await fireContractReminders();
      await logAudit({
        actorId: context.session.user.id,
        actorName: context.session.user.name,
        actorRole: context.userRole ?? undefined,
        action: "contract.fire_reminder_ladder",
        module: "contract",
        resourceType: "contract_reminder",
        resourceId: "daily_check",
        afterValue: result as unknown as Record<string, unknown>,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
        correlationId: context.requestId,
      });
      return result;
    }),
};
