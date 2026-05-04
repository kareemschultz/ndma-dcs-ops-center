import { ORPCError } from "@orpc/server";
import { and, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";

import { db, timesheetDocuments } from "@ndma-dcs-staff-portal/db";

import { requireRole } from "../index";
import { logAudit } from "../lib/audit";
import { getCallerStaffProfile, getManagedStaffIds } from "../lib/scope";

const officeEnum = z.enum(["castellani", "liliendaal"]);

export const timesheetDocumentsRouter = {
  // List timesheet document index entries — filterable by year/month/office/staff
  list: requireRole("timesheet", "read")
    .input(
      z.object({
        year: z.number().int().optional(),
        month: z.number().int().min(1).max(12).optional(),
        office: officeEnum.optional(),
        staffId: z.string().optional(),
        limit: z.number().int().min(1).max(500).optional(),
        offset: z.number().int().min(0).optional(),
      }),
    )
    .handler(async ({ input, context }) => {
      const role = context.userRole ?? "";
      const conditions = [];

      if (input.year) conditions.push(eq(timesheetDocuments.year, input.year));
      if (input.month) conditions.push(eq(timesheetDocuments.month, input.month));
      if (input.office) conditions.push(eq(timesheetDocuments.office, input.office));

      if (input.staffId) {
        conditions.push(eq(timesheetDocuments.staffId, input.staffId));
      } else if (role !== "admin" && role !== "hrAdminOps" && role !== "manager") {
        const managed = await getManagedStaffIds(context);
        const caller = await getCallerStaffProfile(context);
        const ids = new Set(managed);
        if (caller?.id) ids.add(caller.id);
        if (ids.size === 0) return [];
        conditions.push(inArray(timesheetDocuments.staffId, [...ids]));
      }

      return db.query.timesheetDocuments.findMany({
        where: conditions.length > 0 ? and(...conditions) : undefined,
        with: { staffProfile: { with: { user: true } }, uploader: true },
        orderBy: [desc(timesheetDocuments.year), desc(timesheetDocuments.month)],
        limit: input.limit ?? 200,
        offset: input.offset ?? 0,
      });
    }),

  // Create / register a timesheet document index entry (metadata only — no file parsing)
  create: requireRole("timesheet", "create")
    .input(
      z.object({
        staffId: z.string(),
        year: z.number().int().min(2020).max(2050),
        month: z.number().int().min(1).max(12),
        office: officeEnum,
        filename: z.string().min(1),
        storagePath: z.string().optional(),
      }),
    )
    .handler(async ({ input, context }) => {
      // Check for duplicate
      const existing = await db.query.timesheetDocuments.findFirst({
        where: and(
          eq(timesheetDocuments.staffId, input.staffId),
          eq(timesheetDocuments.year, input.year),
          eq(timesheetDocuments.month, input.month),
          eq(timesheetDocuments.office, input.office),
        ),
      });
      if (existing) {
        throw new ORPCError("CONFLICT", {
          message: "A timesheet document already exists for this staff/year/month/office combination.",
        });
      }

      const [row] = await db
        .insert(timesheetDocuments)
        .values({
          staffId: input.staffId,
          year: input.year,
          month: input.month,
          office: input.office,
          filename: input.filename,
          storagePath: input.storagePath ?? null,
          uploadedBy: context.session.user.id,
          uploadedAt: new Date(),
        })
        .returning();

      if (!row) throw new ORPCError("INTERNAL_SERVER_ERROR");

      await logAudit({
        actorId: context.session.user.id,
        actorName: context.session.user.name,
        actorRole: context.userRole ?? undefined,
        action: "timesheet_document.create",
        module: "compliance",
        resourceType: "timesheet_document",
        resourceId: String(row.id),
        afterValue: row as Record<string, unknown>,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
        correlationId: context.requestId,
      });

      return row;
    }),

  // Update metadata (filename / storagePath)
  update: requireRole("timesheet", "update")
    .input(
      z.object({
        id: z.number().int(),
        filename: z.string().optional(),
        storagePath: z.string().optional(),
      }),
    )
    .handler(async ({ input, context }) => {
      const before = await db.query.timesheetDocuments.findFirst({
        where: eq(timesheetDocuments.id, input.id),
      });
      if (!before) throw new ORPCError("NOT_FOUND");

      const [row] = await db
        .update(timesheetDocuments)
        .set({
          filename: input.filename ?? before.filename,
          storagePath: input.storagePath ?? before.storagePath,
        })
        .where(eq(timesheetDocuments.id, input.id))
        .returning();

      await logAudit({
        actorId: context.session.user.id,
        actorName: context.session.user.name,
        actorRole: context.userRole ?? undefined,
        action: "timesheet_document.update",
        module: "compliance",
        resourceType: "timesheet_document",
        resourceId: String(input.id),
        beforeValue: before as Record<string, unknown>,
        afterValue: row as Record<string, unknown>,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
        correlationId: context.requestId,
      });

      return row;
    }),

  // Delete a timesheet document entry
  delete: requireRole("timesheet", "delete")
    .input(z.object({ id: z.number().int() }))
    .handler(async ({ input, context }) => {
      const before = await db.query.timesheetDocuments.findFirst({
        where: eq(timesheetDocuments.id, input.id),
      });
      if (!before) throw new ORPCError("NOT_FOUND");

      await db.delete(timesheetDocuments).where(eq(timesheetDocuments.id, input.id));

      await logAudit({
        actorId: context.session.user.id,
        actorName: context.session.user.name,
        actorRole: context.userRole ?? undefined,
        action: "timesheet_document.delete",
        module: "compliance",
        resourceType: "timesheet_document",
        resourceId: String(input.id),
        beforeValue: before as Record<string, unknown>,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
        correlationId: context.requestId,
      });

      return { success: true };
    }),
};
