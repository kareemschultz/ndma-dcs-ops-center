/**
 * Phase 7 — Training router
 * Covers: training plans, certification catalog, exam vouchers, training events,
 * in-house training log, training syllabi, assessment questions, onboarding templates.
 */
import { ORPCError } from "@orpc/server";
import { and, asc, desc, eq, gte, lte, or } from "drizzle-orm";
import { z } from "zod";

import {
  assessmentQuestions,
  certificationCatalog,
  db,
  examVouchers,
  inHouseTrainingLog,
  onboardingTaskTemplates,
  onboardingTasks,
  trainingEventParticipants,
  trainingEvents,
  trainingPlans,
  trainingSyllabi,
} from "@ndma-dcs-staff-portal/db";

import { protectedProcedure, requireRole } from "../index";
import { logAudit } from "../lib/audit";
import { createNotification } from "../lib/notify";

// ─── Training Plans ───────────────────────────────────────────────────────────

export const trainingPlansRouter = {
  list: requireRole("compliance", "read")
    .input(
      z.object({
        staffId: z.string().optional(),
        year: z.number().int().optional(),
        limit: z.number().min(1).max(500).default(200),
      }),
    )
    .handler(async ({ input }) => {
      const conditions = [];
      if (input.staffId) conditions.push(eq(trainingPlans.staffId, input.staffId));
      if (input.year) conditions.push(eq(trainingPlans.year, input.year));
      return db.query.trainingPlans.findMany({
        where: conditions.length > 0 ? and(...conditions) : undefined,
        with: { staffProfile: { with: { user: true, department: true } } },
        orderBy: [asc(trainingPlans.year), asc(trainingPlans.staffId)],
        limit: input.limit,
      });
    }),

  upsert: requireRole("compliance", "update")
    .input(
      z.object({
        staffId: z.string(),
        year: z.number().int().min(2024).max(2040),
        plannedTrainings: z.array(
          z.object({
            trainingArea: z.string(),
            targetQuarter: z.enum(["Q1", "Q2", "Q3", "Q4"]).optional(),
            status: z.enum(["planned", "in_progress", "completed", "cancelled"]).default("planned"),
          }),
        ),
      }),
    )
    .handler(async ({ input, context }) => {
      const actor = context.session?.user;
      if (!actor) throw new ORPCError("UNAUTHORIZED");

      const existing = await db.query.trainingPlans.findFirst({
        where: and(eq(trainingPlans.staffId, input.staffId), eq(trainingPlans.year, input.year)),
      });

      let result;
      if (existing) {
        [result] = await db
          .update(trainingPlans)
          .set({ plannedTrainings: input.plannedTrainings, updatedAt: new Date() })
          .where(and(eq(trainingPlans.staffId, input.staffId), eq(trainingPlans.year, input.year)))
          .returning();
      } else {
        [result] = await db
          .insert(trainingPlans)
          .values({ staffId: input.staffId, year: input.year, plannedTrainings: input.plannedTrainings })
          .returning();
      }

      await logAudit({
        actorId: actor.id,
        actorName: actor.name,
        action: "training_plan.upsert",
        module: "training",
        resourceType: "training_plan",
        resourceId: `${input.staffId}:${input.year}`,
        beforeValue: existing ? (existing as unknown as Record<string, unknown>) : undefined,
        afterValue: result as unknown as Record<string, unknown>,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
        actorRole: context.userRole ?? undefined,
        correlationId: context.requestId,
      });

      return result;
    }),
};

// ─── Certification Catalog ────────────────────────────────────────────────────

export const certCatalogRouter = {
  list: protectedProcedure.handler(async () => {
    return db.query.certificationCatalog.findMany({
      orderBy: [asc(certificationCatalog.trainingArea), asc(certificationCatalog.recommendedCert)],
    });
  }),

  create: requireRole("compliance", "create")
    .input(
      z.object({
        trainingArea: z.string().min(1),
        recommendedCert: z.string().min(1),
        vendor: z.string().optional(),
        level: z.string().optional(),
      }),
    )
    .handler(async ({ input, context }) => {
      const actor = context.session?.user;
      if (!actor) throw new ORPCError("UNAUTHORIZED");

      const [row] = await db.insert(certificationCatalog).values(input).returning();
      if (!row) throw new ORPCError("INTERNAL_SERVER_ERROR");

      await logAudit({
        actorId: actor.id,
        actorName: actor.name,
        action: "cert_catalog.create",
        module: "training",
        resourceType: "certification_catalog",
        resourceId: String(row.id),
        afterValue: row as unknown as Record<string, unknown>,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
        actorRole: context.userRole ?? undefined,
        correlationId: context.requestId,
      });

      return row;
    }),

  update: requireRole("compliance", "update")
    .input(
      z.object({
        id: z.number().int(),
        trainingArea: z.string().min(1).optional(),
        recommendedCert: z.string().min(1).optional(),
        vendor: z.string().optional(),
        level: z.string().optional(),
      }),
    )
    .handler(async ({ input, context }) => {
      const actor = context.session?.user;
      if (!actor) throw new ORPCError("UNAUTHORIZED");

      const before = await db.query.certificationCatalog.findFirst({
        where: eq(certificationCatalog.id, input.id),
      });
      if (!before) throw new ORPCError("NOT_FOUND");

      const { id, ...updates } = input;
      const [row] = await db
        .update(certificationCatalog)
        .set({ ...updates, updatedAt: new Date() })
        .where(eq(certificationCatalog.id, id))
        .returning();

      await logAudit({
        actorId: actor.id,
        actorName: actor.name,
        action: "cert_catalog.update",
        module: "training",
        resourceType: "certification_catalog",
        resourceId: String(id),
        beforeValue: before as unknown as Record<string, unknown>,
        afterValue: row as unknown as Record<string, unknown>,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
        actorRole: context.userRole ?? undefined,
        correlationId: context.requestId,
      });

      return row;
    }),
};

// ─── Exam Vouchers ────────────────────────────────────────────────────────────

export const examVouchersRouter = {
  list: requireRole("compliance", "read")
    .input(
      z.object({
        status: z
          .enum(["unused", "assigned", "booked", "complete_pass", "complete_fail", "missed", "expired"])
          .optional(),
        assignedStaffId: z.string().optional(),
        expiringWithinDays: z.number().int().min(1).max(90).optional(),
      }),
    )
    .handler(async ({ input }) => {
      const conditions = [];
      if (input.status) conditions.push(eq(examVouchers.status, input.status));
      if (input.assignedStaffId) conditions.push(eq(examVouchers.assignedStaffId, input.assignedStaffId));
      if (input.expiringWithinDays != null) {
        const today = new Date().toISOString().slice(0, 10);
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() + input.expiringWithinDays);
        const cutoffStr = cutoff.toISOString().slice(0, 10);
        conditions.push(gte(examVouchers.mustBeUsedBy, today));
        conditions.push(lte(examVouchers.mustBeUsedBy, cutoffStr));
      }
      return db.query.examVouchers.findMany({
        where: conditions.length > 0 ? and(...conditions) : undefined,
        with: { assignedStaff: { with: { user: true } } },
        orderBy: [asc(examVouchers.mustBeUsedBy)],
      });
    }),

  create: requireRole("compliance", "create")
    .input(
      z.object({
        voucherNumber: z.string().min(1),
        productName: z.string().min(1),
        mustBeUsedBy: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        assignedStaffId: z.string().optional(),
      }),
    )
    .handler(async ({ input, context }) => {
      const actor = context.session?.user;
      if (!actor) throw new ORPCError("UNAUTHORIZED");

      const [row] = await db.insert(examVouchers).values(input).returning();
      if (!row) throw new ORPCError("INTERNAL_SERVER_ERROR");

      await logAudit({
        actorId: actor.id,
        actorName: actor.name,
        action: "exam_voucher.create",
        module: "training",
        resourceType: "exam_voucher",
        resourceId: String(row.id),
        afterValue: row as unknown as Record<string, unknown>,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
        actorRole: context.userRole ?? undefined,
        correlationId: context.requestId,
      });

      return row;
    }),

  assign: requireRole("compliance", "update")
    .input(
      z.object({
        id: z.number().int(),
        staffId: z.string(),
      }),
    )
    .handler(async ({ input, context }) => {
      const actor = context.session?.user;
      if (!actor) throw new ORPCError("UNAUTHORIZED");

      const before = await db.query.examVouchers.findFirst({
        where: eq(examVouchers.id, input.id),
      });
      if (!before) throw new ORPCError("NOT_FOUND");

      const [row] = await db
        .update(examVouchers)
        .set({ assignedStaffId: input.staffId, status: "assigned", updatedAt: new Date() })
        .where(eq(examVouchers.id, input.id))
        .returning();

      // Notify the assignee
      const staff = await db.query.examVouchers.findFirst({
        where: eq(examVouchers.id, input.id),
        with: { assignedStaff: { with: { user: true } } },
      });

      if (staff?.assignedStaff?.userId) {
        await createNotification({
          recipientId: staff.assignedStaff.userId,
          channel: "in_app",
          title: `Exam voucher assigned: ${before.productName}`,
          body: `You have been assigned an exam voucher for ${before.productName}. Must be used by ${before.mustBeUsedBy}.`,
          module: "training",
          resourceType: "exam_voucher",
          resourceId: String(input.id),
          linkUrl: "/training/vouchers",
        });
      }

      await logAudit({
        actorId: actor.id,
        actorName: actor.name,
        action: "exam_voucher.assign",
        module: "training",
        resourceType: "exam_voucher",
        resourceId: String(input.id),
        beforeValue: before as unknown as Record<string, unknown>,
        afterValue: row as unknown as Record<string, unknown>,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
        actorRole: context.userRole ?? undefined,
        correlationId: context.requestId,
      });

      return row;
    }),

  updateStatus: requireRole("compliance", "update")
    .input(
      z.object({
        id: z.number().int(),
        status: z.enum(["unused", "assigned", "booked", "complete_pass", "complete_fail", "missed", "expired"]),
        dateBooked: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      }),
    )
    .handler(async ({ input, context }) => {
      const actor = context.session?.user;
      if (!actor) throw new ORPCError("UNAUTHORIZED");

      const before = await db.query.examVouchers.findFirst({
        where: eq(examVouchers.id, input.id),
      });
      if (!before) throw new ORPCError("NOT_FOUND");

      const [row] = await db
        .update(examVouchers)
        .set({ status: input.status, dateBooked: input.dateBooked ?? undefined, updatedAt: new Date() })
        .where(eq(examVouchers.id, input.id))
        .returning();

      await logAudit({
        actorId: actor.id,
        actorName: actor.name,
        action: "exam_voucher.update_status",
        module: "training",
        resourceType: "exam_voucher",
        resourceId: String(input.id),
        beforeValue: before as unknown as Record<string, unknown>,
        afterValue: row as unknown as Record<string, unknown>,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
        actorRole: context.userRole ?? undefined,
        correlationId: context.requestId,
      });

      return row;
    }),

  /** Fire "must-be-used-by" reminders for vouchers expiring within N days. */
  sendExpiryReminders: requireRole("compliance", "update")
    .input(z.object({ withinDays: z.number().int().min(1).max(60).default(30) }))
    .handler(async ({ input, context }) => {
      const actor = context.session?.user;
      if (!actor) throw new ORPCError("UNAUTHORIZED");

      const today = new Date().toISOString().slice(0, 10);
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() + input.withinDays);
      const cutoffStr = cutoff.toISOString().slice(0, 10);

      const expiring = await db.query.examVouchers.findMany({
        where: and(
          gte(examVouchers.mustBeUsedBy, today),
          lte(examVouchers.mustBeUsedBy, cutoffStr),
          or(eq(examVouchers.status, "unused"), eq(examVouchers.status, "assigned")),
        ),
        with: { assignedStaff: { with: { user: true } } },
        orderBy: [asc(examVouchers.mustBeUsedBy)],
      });

      let notified = 0;
      for (const v of expiring) {
        const userId = v.assignedStaff?.userId;
        if (!userId) continue;
        await createNotification({
          recipientId: userId,
          channel: "in_app",
          title: `Exam voucher expiring soon: ${v.productName}`,
          body: `Your exam voucher for ${v.productName} must be used by ${v.mustBeUsedBy}. Please book your exam.`,
          module: "training",
          resourceType: "exam_voucher",
          resourceId: String(v.id),
          linkUrl: "/training/vouchers",
        });
        notified++;
      }

      await logAudit({
        actorId: actor.id,
        actorName: actor.name,
        action: "exam_voucher.expiry_reminders",
        module: "training",
        resourceType: "exam_voucher",
        resourceId: `within-${input.withinDays}`,
        afterValue: { scanned: expiring.length, notified } as Record<string, unknown>,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
        actorRole: context.userRole ?? undefined,
        correlationId: context.requestId,
      });

      return { scanned: expiring.length, notified };
    }),
};

// ─── Training Events ──────────────────────────────────────────────────────────

export const trainingEventsRouter = {
  list: requireRole("compliance", "read")
    .input(
      z.object({
        year: z.number().int().optional(),
        limit: z.number().min(1).max(200).default(50),
      }),
    )
    .handler(async ({ input }) => {
      const conditions = [];
      if (input.year) {
        const yearStart = `${input.year}-01-01`;
        const yearEnd = `${input.year}-12-31`;
        conditions.push(gte(trainingEvents.startDate, yearStart));
        conditions.push(lte(trainingEvents.startDate, yearEnd));
      }
      return db.query.trainingEvents.findMany({
        where: conditions.length > 0 ? and(...conditions) : undefined,
        with: { participants: { with: { staffProfile: { with: { user: true } } } } },
        orderBy: [desc(trainingEvents.startDate)],
        limit: input.limit,
      });
    }),

  get: requireRole("compliance", "read")
    .input(z.object({ id: z.number().int() }))
    .handler(async ({ input }) => {
      const row = await db.query.trainingEvents.findFirst({
        where: eq(trainingEvents.id, input.id),
        with: { participants: { with: { staffProfile: { with: { user: true, department: true } } } } },
      });
      if (!row) throw new ORPCError("NOT_FOUND");
      return row;
    }),

  create: requireRole("compliance", "create")
    .input(
      z.object({
        institution: z.string().min(1),
        description: z.string().min(1),
        startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        duration: z.string().optional(),
        location: z.string().optional(),
        travellingCost: z.string().optional(),
        courseCost: z.string().optional(),
        mealsCost: z.string().optional(),
        accommodationCost: z.string().optional(),
        totalCost: z.string().optional(),
        justification: z.string().optional(),
        results: z.string().optional(),
      }),
    )
    .handler(async ({ input, context }) => {
      const actor = context.session?.user;
      if (!actor) throw new ORPCError("UNAUTHORIZED");

      // Auto-sum totalCost if individual costs provided
      const travelling = parseFloat(input.travellingCost ?? "0") || 0;
      const course = parseFloat(input.courseCost ?? "0") || 0;
      const meals = parseFloat(input.mealsCost ?? "0") || 0;
      const accommodation = parseFloat(input.accommodationCost ?? "0") || 0;
      const total = input.totalCost ? parseFloat(input.totalCost) : travelling + course + meals + accommodation;

      const [row] = await db
        .insert(trainingEvents)
        .values({
          ...input,
          travellingCost: String(travelling),
          courseCost: String(course),
          mealsCost: String(meals),
          accommodationCost: String(accommodation),
          totalCost: String(total),
        })
        .returning();
      if (!row) throw new ORPCError("INTERNAL_SERVER_ERROR");

      await logAudit({
        actorId: actor.id,
        actorName: actor.name,
        action: "training_event.create",
        module: "training",
        resourceType: "training_event",
        resourceId: String(row.id),
        afterValue: row as unknown as Record<string, unknown>,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
        actorRole: context.userRole ?? undefined,
        correlationId: context.requestId,
      });

      return row;
    }),

  update: requireRole("compliance", "update")
    .input(
      z.object({
        id: z.number().int(),
        institution: z.string().min(1).optional(),
        description: z.string().min(1).optional(),
        startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        duration: z.string().optional(),
        location: z.string().optional(),
        travellingCost: z.string().optional(),
        courseCost: z.string().optional(),
        mealsCost: z.string().optional(),
        accommodationCost: z.string().optional(),
        totalCost: z.string().optional(),
        justification: z.string().optional(),
        results: z.string().optional(),
      }),
    )
    .handler(async ({ input, context }) => {
      const actor = context.session?.user;
      if (!actor) throw new ORPCError("UNAUTHORIZED");

      const before = await db.query.trainingEvents.findFirst({
        where: eq(trainingEvents.id, input.id),
      });
      if (!before) throw new ORPCError("NOT_FOUND");

      const { id, ...updates } = input;

      // Recalculate total if any cost fields changed
      if (
        updates.travellingCost !== undefined ||
        updates.courseCost !== undefined ||
        updates.mealsCost !== undefined ||
        updates.accommodationCost !== undefined
      ) {
        const travelling = parseFloat(updates.travellingCost ?? before.travellingCost ?? "0") || 0;
        const course = parseFloat(updates.courseCost ?? before.courseCost ?? "0") || 0;
        const meals = parseFloat(updates.mealsCost ?? before.mealsCost ?? "0") || 0;
        const accommodation = parseFloat(updates.accommodationCost ?? before.accommodationCost ?? "0") || 0;
        if (!updates.totalCost) {
          updates.totalCost = String(travelling + course + meals + accommodation);
        }
      }

      const [row] = await db
        .update(trainingEvents)
        .set({ ...updates, updatedAt: new Date() })
        .where(eq(trainingEvents.id, id))
        .returning();

      await logAudit({
        actorId: actor.id,
        actorName: actor.name,
        action: "training_event.update",
        module: "training",
        resourceType: "training_event",
        resourceId: String(id),
        beforeValue: before as unknown as Record<string, unknown>,
        afterValue: row as unknown as Record<string, unknown>,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
        actorRole: context.userRole ?? undefined,
        correlationId: context.requestId,
      });

      return row;
    }),

  addParticipant: requireRole("compliance", "update")
    .input(
      z.object({
        trainingEventId: z.number().int(),
        staffId: z.string(),
        gender: z.enum(["M", "F", "other", "prefer_not_to_say"]).optional(),
        status: z.enum(["attended", "cancelled", "missed", "waitlisted"]).default("attended"),
      }),
    )
    .handler(async ({ input, context }) => {
      const actor = context.session?.user;
      if (!actor) throw new ORPCError("UNAUTHORIZED");

      const [row] = await db
        .insert(trainingEventParticipants)
        .values(input)
        .onConflictDoUpdate({
          target: [trainingEventParticipants.trainingEventId, trainingEventParticipants.staffId],
          set: { gender: input.gender, status: input.status },
        })
        .returning();
      if (!row) throw new ORPCError("INTERNAL_SERVER_ERROR");

      await logAudit({
        actorId: actor.id,
        actorName: actor.name,
        action: "training_event.participant.add",
        module: "training",
        resourceType: "training_event_participant",
        resourceId: String(row.id),
        afterValue: row as unknown as Record<string, unknown>,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
        actorRole: context.userRole ?? undefined,
        correlationId: context.requestId,
      });

      return row;
    }),

  removeParticipant: requireRole("compliance", "update")
    .input(z.object({ id: z.number().int() }))
    .handler(async ({ input, context }) => {
      const actor = context.session?.user;
      if (!actor) throw new ORPCError("UNAUTHORIZED");

      const before = await db.query.trainingEventParticipants.findFirst({
        where: eq(trainingEventParticipants.id, input.id),
      });
      if (!before) throw new ORPCError("NOT_FOUND");

      await db.delete(trainingEventParticipants).where(eq(trainingEventParticipants.id, input.id));

      await logAudit({
        actorId: actor.id,
        actorName: actor.name,
        action: "training_event.participant.remove",
        module: "training",
        resourceType: "training_event_participant",
        resourceId: String(input.id),
        beforeValue: before as unknown as Record<string, unknown>,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
        actorRole: context.userRole ?? undefined,
        correlationId: context.requestId,
      });

      return { success: true };
    }),
};

// ─── In-House Training Log ────────────────────────────────────────────────────

export const inHouseLogRouter = {
  list: requireRole("compliance", "read")
    .input(
      z.object({
        staffId: z.string().optional(),
        year: z.number().int().optional(),
        limit: z.number().min(1).max(500).default(100),
      }),
    )
    .handler(async ({ input }) => {
      const conditions = [];
      if (input.staffId) conditions.push(eq(inHouseTrainingLog.staffId, input.staffId));
      if (input.year) {
        const yearStart = `${input.year}-01-01`;
        const yearEnd = `${input.year}-12-31`;
        conditions.push(gte(inHouseTrainingLog.date, yearStart));
        conditions.push(lte(inHouseTrainingLog.date, yearEnd));
      }
      return db.query.inHouseTrainingLog.findMany({
        where: conditions.length > 0 ? and(...conditions) : undefined,
        with: { staffProfile: { with: { user: true, department: true } } },
        orderBy: [desc(inHouseTrainingLog.date)],
        limit: input.limit,
      });
    }),

  create: requireRole("compliance", "create")
    .input(
      z.object({
        staffId: z.string(),
        trainingName: z.string().min(1),
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        assessmentCompleted: z.boolean().default(false),
        notes: z.string().optional(),
      }),
    )
    .handler(async ({ input, context }) => {
      const actor = context.session?.user;
      if (!actor) throw new ORPCError("UNAUTHORIZED");

      const [row] = await db.insert(inHouseTrainingLog).values(input).returning();
      if (!row) throw new ORPCError("INTERNAL_SERVER_ERROR");

      await logAudit({
        actorId: actor.id,
        actorName: actor.name,
        action: "in_house_training.create",
        module: "training",
        resourceType: "in_house_training_log",
        resourceId: String(row.id),
        afterValue: row as unknown as Record<string, unknown>,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
        actorRole: context.userRole ?? undefined,
        correlationId: context.requestId,
      });

      return row;
    }),

  update: requireRole("compliance", "update")
    .input(
      z.object({
        id: z.number().int(),
        trainingName: z.string().min(1).optional(),
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        assessmentCompleted: z.boolean().optional(),
        notes: z.string().optional(),
      }),
    )
    .handler(async ({ input, context }) => {
      const actor = context.session?.user;
      if (!actor) throw new ORPCError("UNAUTHORIZED");

      const before = await db.query.inHouseTrainingLog.findFirst({
        where: eq(inHouseTrainingLog.id, input.id),
      });
      if (!before) throw new ORPCError("NOT_FOUND");

      const { id, ...updates } = input;
      const [row] = await db
        .update(inHouseTrainingLog)
        .set({ ...updates, updatedAt: new Date() })
        .where(eq(inHouseTrainingLog.id, id))
        .returning();

      await logAudit({
        actorId: actor.id,
        actorName: actor.name,
        action: "in_house_training.update",
        module: "training",
        resourceType: "in_house_training_log",
        resourceId: String(id),
        beforeValue: before as unknown as Record<string, unknown>,
        afterValue: row as unknown as Record<string, unknown>,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
        actorRole: context.userRole ?? undefined,
        correlationId: context.requestId,
      });

      return row;
    }),

  delete: requireRole("compliance", "delete")
    .input(z.object({ id: z.number().int() }))
    .handler(async ({ input, context }) => {
      const actor = context.session?.user;
      if (!actor) throw new ORPCError("UNAUTHORIZED");

      const before = await db.query.inHouseTrainingLog.findFirst({
        where: eq(inHouseTrainingLog.id, input.id),
      });
      if (!before) throw new ORPCError("NOT_FOUND");

      await db.delete(inHouseTrainingLog).where(eq(inHouseTrainingLog.id, input.id));

      await logAudit({
        actorId: actor.id,
        actorName: actor.name,
        action: "in_house_training.delete",
        module: "training",
        resourceType: "in_house_training_log",
        resourceId: String(input.id),
        beforeValue: before as unknown as Record<string, unknown>,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
        actorRole: context.userRole ?? undefined,
        correlationId: context.requestId,
      });

      return { success: true };
    }),
};

// ─── Training Syllabi ─────────────────────────────────────────────────────────

export const syllabiRouter = {
  list: protectedProcedure
    .input(
      z.object({
        syllabusName: z.enum(["noc_onboarding", "intern_onboarding", "dcs_onboarding"]).optional(),
      }),
    )
    .handler(async ({ input }) => {
      return db.query.trainingSyllabi.findMany({
        where: input.syllabusName ? eq(trainingSyllabi.syllabusName, input.syllabusName) : undefined,
        orderBy: [asc(trainingSyllabi.syllabusName), asc(trainingSyllabi.week)],
      });
    }),
};

// ─── Assessment Questions ─────────────────────────────────────────────────────

export const assessmentQuestionsRouter = {
  list: protectedProcedure
    .input(
      z.object({
        topic: z
          .enum(["about_ndma", "administrative", "backhaul", "fibre", "lte", "monitoring_platform", "troubleshooting", "itop"])
          .optional(),
      }),
    )
    .handler(async ({ input }) => {
      return db.query.assessmentQuestions.findMany({
        where: input.topic ? eq(assessmentQuestions.topic, input.topic) : undefined,
        orderBy: [asc(assessmentQuestions.topic), asc(assessmentQuestions.id)],
      });
    }),
};

// ─── Onboarding ───────────────────────────────────────────────────────────────

export const onboardingRouter = {
  templates: {
    list: protectedProcedure.handler(async () => {
      return db.query.onboardingTaskTemplates.findMany({
        orderBy: [asc(onboardingTaskTemplates.seq)],
      });
    }),
  },

  /** Create onboarding tasks for a new hire from the 8 standard templates. */
  createFromTemplates: requireRole("staff", "create")
    .input(
      z.object({
        staffId: z.string(),
        dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      }),
    )
    .handler(async ({ input, context }) => {
      const actor = context.session?.user;
      if (!actor) throw new ORPCError("UNAUTHORIZED");

      const templates = await db.query.onboardingTaskTemplates.findMany({
        orderBy: [asc(onboardingTaskTemplates.seq)],
      });

      if (templates.length === 0) {
        throw new ORPCError("PRECONDITION_FAILED", {
          message: "No onboarding task templates found. Run seed first.",
        });
      }

      const rows = await db
        .insert(onboardingTasks)
        .values(
          templates.map((t) => ({
            staffId: input.staffId,
            taskName: t.taskName,
            category: t.responsibleDept,
            isCompleted: false,
            dueDate: input.dueDate ?? undefined,
            templateId: t.id,
          })),
        )
        .returning();

      await logAudit({
        actorId: actor.id,
        actorName: actor.name,
        action: "onboarding.create_from_templates",
        module: "training",
        resourceType: "onboarding_tasks",
        resourceId: input.staffId,
        afterValue: { count: rows.length, staffId: input.staffId } as Record<string, unknown>,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
        actorRole: context.userRole ?? undefined,
        correlationId: context.requestId,
      });

      return { created: rows.length, tasks: rows };
    }),
};
