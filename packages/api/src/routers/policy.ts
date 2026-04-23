import { ORPCError } from "@orpc/server";
import { and, desc, eq, ilike } from "drizzle-orm";
import { z } from "zod";

import {
  companyForms,
  companyPolicies,
  db,
} from "@ndma-dcs-staff-portal/db";

import { protectedProcedure } from "../index";
import { logAudit } from "../lib/audit";

function assertDocumentAdmin(context: { userRole?: string | null }) {
  const role = context.userRole ?? "";
  if (!["admin", "hrAdminOps", "manager", "personalAssistant", "pa"].includes(role)) {
    throw new ORPCError("FORBIDDEN", {
      message: "You do not have permission to manage policy documents.",
    });
  }
}

export const policyRouter = {
  policies: {
    list: protectedProcedure
      .input(z.object({ query: z.string().optional() }).optional())
      .handler(async ({ input }) => {
        const query = input?.query?.trim();
        return db.query.companyPolicies.findMany({
          where: query ? ilike(companyPolicies.title, `%${query}%`) : undefined,
          orderBy: [desc(companyPolicies.lastUpdated), desc(companyPolicies.id)],
        });
      }),

    create: protectedProcedure
      .input(
        z.object({
          title: z.string().min(1),
          contentText: z.string().min(1),
          documentUrl: z.string().optional(),
          lastUpdated: z.string(),
        }),
      )
      .handler(async ({ input, context }) => {
        assertDocumentAdmin(context);
        const [row] = await db
          .insert(companyPolicies)
          .values({
            title: input.title,
            contentText: input.contentText,
            documentUrl: input.documentUrl ?? null,
            lastUpdated: input.lastUpdated,
          })
          .returning();
        if (!row) throw new ORPCError("INTERNAL_SERVER_ERROR");

        await logAudit({
          actorId: context.session.user.id,
          actorName: context.session.user.name,
          actorRole: context.userRole ?? undefined,
          action: "policy.create",
          module: "staff",
          resourceType: "company_policy",
          resourceId: String(row.id),
          afterValue: row as Record<string, unknown>,
          ipAddress: context.ipAddress,
          userAgent: context.userAgent,
          correlationId: context.requestId,
        });

        return row;
      }),
  },

  forms: {
    list: protectedProcedure
      .input(z.object({ category: z.enum(["HR & Leave", "Finance", "Operations", "IT", "General"]).optional(), query: z.string().optional() }).optional())
      .handler(async ({ input }) => {
        const conditions = [];
        if (input?.category) conditions.push(eq(companyForms.category, input.category));
        if (input?.query) conditions.push(ilike(companyForms.title, `%${input.query}%`));
        return db.query.companyForms.findMany({
          where: conditions.length > 0 ? and(...conditions) : undefined,
          orderBy: [desc(companyForms.uploadedAt), desc(companyForms.id)],
        });
      }),

    upload: protectedProcedure
      .input(
        z.object({
          title: z.string().min(1),
          description: z.string().optional(),
          category: z.enum(["HR & Leave", "Finance", "Operations", "IT", "General"]),
          fileUrl: z.string().min(1),
        }),
      )
      .handler(async ({ input, context }) => {
        assertDocumentAdmin(context);
        const [row] = await db
          .insert(companyForms)
          .values({
            title: input.title,
            description: input.description ?? null,
            category: input.category,
            fileUrl: input.fileUrl,
          })
          .returning();
        if (!row) throw new ORPCError("INTERNAL_SERVER_ERROR");

        await logAudit({
          actorId: context.session.user.id,
          actorName: context.session.user.name,
          actorRole: context.userRole ?? undefined,
          action: "policy_form.create",
          module: "staff",
          resourceType: "company_form",
          resourceId: String(row.id),
          afterValue: row as Record<string, unknown>,
          ipAddress: context.ipAddress,
          userAgent: context.userAgent,
          correlationId: context.requestId,
        });

        return row;
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.number().int() }))
      .handler(async ({ input, context }) => {
        assertDocumentAdmin(context);
        const before = await db.query.companyForms.findFirst({
          where: eq(companyForms.id, input.id),
        });
        if (!before) throw new ORPCError("NOT_FOUND");

        await db.delete(companyForms).where(eq(companyForms.id, input.id));

        await logAudit({
          actorId: context.session.user.id,
          actorName: context.session.user.name,
          actorRole: context.userRole ?? undefined,
          action: "policy_form.delete",
          module: "staff",
          resourceType: "company_form",
          resourceId: String(input.id),
          beforeValue: before as Record<string, unknown>,
          ipAddress: context.ipAddress,
          userAgent: context.userAgent,
          correlationId: context.requestId,
        });

        return { success: true };
      }),
  },
};
