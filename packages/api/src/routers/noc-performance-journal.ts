import { ORPCError } from "@orpc/server";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";

import {
  db,
  nocPerformanceJournal,
  staffProfiles,
} from "@ndma-dcs-staff-portal/db";

import { requireRole } from "../index";
import { logAudit } from "../lib/audit";

/**
 * NOC performance journal router — monthly mistake-matrix tracker.
 * Master plan §5.3 (renamed from `performance_journal_entries` per Option B
 * — see `docs/plan-questions.md` 2026-05-04 resolution).
 *
 * RBAC: `performance_journal` resource.
 * - admin / hrAdminOps — full CRUD + matrix view
 * - manager — read all, create/update for direct reports
 * - staff — denied (sensitive)
 */

const monthSchema = z.number().int().min(1).max(12);
const yearSchema = z.number().int().min(2020).max(2099);
const categorySchema = z.enum([
  "tickets_itop",
  "alarms",
  "slack_whatsapp",
  "task_incomplete",
]);

export const nocPerformanceJournalRouter = {
  list: requireRole("performance_journal", "read")
    .input(
      z
        .object({
          staffProfileId: z.string().optional(),
          year: yearSchema.optional(),
          month: monthSchema.optional(),
          category: categorySchema.optional(),
        })
        .optional(),
    )
    .handler(async ({ input }) => {
      const filters = [];
      if (input?.staffProfileId) {
        filters.push(eq(nocPerformanceJournal.staffProfileId, input.staffProfileId));
      }
      if (input?.year !== undefined) {
        filters.push(eq(nocPerformanceJournal.year, input.year));
      }
      if (input?.month !== undefined) {
        filters.push(eq(nocPerformanceJournal.month, input.month));
      }
      if (input?.category !== undefined) {
        filters.push(eq(nocPerformanceJournal.category, input.category));
      }
      return db.query.nocPerformanceJournal.findMany({
        where: filters.length ? and(...filters) : undefined,
        with: {
          staff: { with: { user: true, department: true } },
        },
        orderBy: [
          desc(nocPerformanceJournal.year),
          desc(nocPerformanceJournal.month),
        ],
      });
    }),

  upsert: requireRole("performance_journal", "create")
    .input(
      z.object({
        staffProfileId: z.string(),
        year: yearSchema,
        month: monthSchema,
        category: categorySchema,
        count: z.number().int().min(0),
        narrative: z.string().nullable().optional(),
      }),
    )
    .handler(async ({ input, context }) => {
      const staff = await db.query.staffProfiles.findFirst({
        where: eq(staffProfiles.id, input.staffProfileId),
      });
      if (!staff) {
        throw new ORPCError("NOT_FOUND", { message: "Staff profile not found" });
      }

      const [row] = await db
        .insert(nocPerformanceJournal)
        .values({
          staffProfileId: input.staffProfileId,
          year: input.year,
          month: input.month,
          category: input.category,
          count: input.count,
          narrative: input.narrative ?? null,
        })
        .onConflictDoUpdate({
          target: [
            nocPerformanceJournal.staffProfileId,
            nocPerformanceJournal.year,
            nocPerformanceJournal.month,
            nocPerformanceJournal.category,
          ],
          set: {
            count: input.count,
            narrative: input.narrative ?? null,
          },
        })
        .returning();

      if (!row) {
        throw new ORPCError("INTERNAL_SERVER_ERROR");
      }

      await logAudit({
        actorId: context.session?.user?.id ?? "system",
        actorName: context.session?.user?.name ?? "system",
        actorRole: context.userRole ?? undefined,
        correlationId: context.requestId,
        action: "noc_performance_journal.upsert",
        module: "performance",
        resourceType: "noc_performance_journal",
        resourceId: row.id,
        afterValue: row,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
      });

      return row;
    }),

  delete: requireRole("performance_journal", "delete")
    .input(z.object({ id: z.string() }))
    .handler(async ({ input, context }) => {
      const before = await db.query.nocPerformanceJournal.findFirst({
        where: eq(nocPerformanceJournal.id, input.id),
      });
      if (!before) {
        throw new ORPCError("NOT_FOUND");
      }
      await db.delete(nocPerformanceJournal).where(eq(nocPerformanceJournal.id, input.id));

      await logAudit({
        actorId: context.session?.user?.id ?? "system",
        actorName: context.session?.user?.name ?? "system",
        actorRole: context.userRole ?? undefined,
        correlationId: context.requestId,
        action: "noc_performance_journal.delete",
        module: "performance",
        resourceType: "noc_performance_journal",
        resourceId: before.id,
        beforeValue: before,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
      });

      return { success: true } as const;
    }),
};
