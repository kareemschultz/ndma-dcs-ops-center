import { ORPCError } from "@orpc/server";
import { and, asc, desc, eq, gte, inArray, lte, sql } from "drizzle-orm";

import {
  calendarEvents,
  db,
  staffProfiles,
  staffTrainingRecords,
  trainingCourses,
  trainingMaterials,
} from "@ndma-dcs-staff-portal/db";

import type { Context } from "../context";
import { logAudit } from "./audit";
import { createNotification } from "./notify";
import { canAccessStaffPrivate, getCallerStaffProfile, getManagedStaffIds } from "./scope";
import { getTeamStaffIds } from "./team";

function isPrivileged(context: Context) {
  return (context.userRole ?? "") === "admin" || (context.userRole ?? "") === "hrAdminOps";
}

async function getAccessibleStaffIds(context: Context) {
  if (isPrivileged(context)) return null;
  const managed = new Set(await getManagedStaffIds(context));
  const caller = await getCallerStaffProfile(context);
  if (caller?.id) managed.add(caller.id);
  return managed;
}

function reminderTitle(courseTitle: string, staffName: string) {
  return `Training Reminder: ${courseTitle} - ${staffName}`;
}

function getGuyanaDateString(date: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Guyana",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export async function listTrainingRecords(context: Context, input: {
  staffProfileId?: string;
  departmentId?: string;
  team?: "DCS" | "NOC";
  courseId?: number;
  status?: "Enrolled" | "In Progress" | "Completed" | "Failed";
  limit?: number;
}) {
  const conditions = [];
  const accessibleStaffIds = await getAccessibleStaffIds(context);

  if (input.staffProfileId) {
    if (accessibleStaffIds && !accessibleStaffIds.has(input.staffProfileId)) {
      throw new ORPCError("FORBIDDEN");
    }
    conditions.push(eq(staffTrainingRecords.staffId, input.staffProfileId));
  } else if (input.team) {
    const ids = await getTeamStaffIds(input.team);
    const filtered = accessibleStaffIds
      ? ids.filter((id) => accessibleStaffIds.has(id))
      : ids;
    if (filtered.length === 0) return [];
    conditions.push(inArray(staffTrainingRecords.staffId, filtered));
  } else if (input.departmentId) {
    const departmentStaff = await db
      .select({ id: staffProfiles.id })
      .from(staffProfiles)
      .where(eq(staffProfiles.departmentId, input.departmentId));
    const ids = departmentStaff
      .map((row) => row.id)
      .filter((id) => !accessibleStaffIds || accessibleStaffIds.has(id));
    if (ids.length === 0) return [];
    conditions.push(inArray(staffTrainingRecords.staffId, ids));
  } else if (accessibleStaffIds) {
    if (accessibleStaffIds.size === 0) return [];
    conditions.push(inArray(staffTrainingRecords.staffId, [...accessibleStaffIds]));
  }

  if (input.courseId != null) {
    conditions.push(eq(staffTrainingRecords.courseId, input.courseId));
  }
  if (input.status) {
    conditions.push(eq(staffTrainingRecords.status, input.status));
  }

  return db.query.staffTrainingRecords.findMany({
    where: conditions.length > 0 ? and(...conditions) : undefined,
    with: {
      staffProfile: { with: { user: true, department: true } },
      course: { with: { materials: true } },
    },
    orderBy: [asc(staffTrainingRecords.targetDate), desc(staffTrainingRecords.updatedAt)],
    limit: input.limit ?? 200,
  });
}

export async function listTrainingCourses() {
  return db.query.trainingCourses.findMany({
    with: { materials: true },
    orderBy: [asc(trainingCourses.vendor), asc(trainingCourses.title)],
  });
}

export async function listTrainingMaterials(input?: { courseId?: number }) {
  const where = input?.courseId != null
    ? eq(trainingMaterials.courseId, input.courseId)
    : undefined;
  return db.query.trainingMaterials.findMany({
    where,
    with: { course: true },
    orderBy: [asc(trainingMaterials.materialType), asc(trainingMaterials.title)],
  });
}

export async function refreshTrainingReminders(
  context: Context,
  withinDays = 14,
) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() + withinDays);
  const today = getGuyanaDateString(new Date());
  const cutoffStr = getGuyanaDateString(cutoff);
  const accessibleStaffIds = await getAccessibleStaffIds(context);

  const conditions = [
    sql`${staffTrainingRecords.targetDate} IS NOT NULL`,
    gte(staffTrainingRecords.targetDate, today),
    lte(staffTrainingRecords.targetDate, cutoffStr),
    sql`${staffTrainingRecords.status} <> 'Completed'`,
  ];
  if (accessibleStaffIds) {
    if (accessibleStaffIds.size === 0) return { created: 0, scanned: 0 };
    conditions.push(inArray(staffTrainingRecords.staffId, [...accessibleStaffIds]));
  }

  const records = await db.query.staffTrainingRecords.findMany({
    where: and(...conditions),
    with: {
      staffProfile: { with: { user: true, department: true } },
      course: true,
    },
    orderBy: [asc(staffTrainingRecords.targetDate), asc(staffTrainingRecords.id)],
  });

  await db.delete(calendarEvents).where(
    and(
      eq(calendarEvents.eventType, "Training"),
      gte(calendarEvents.eventDate, today),
      lte(calendarEvents.eventDate, cutoffStr),
      sql`${calendarEvents.title} LIKE 'Training Reminder:%'`,
    ),
  );

  const createdRows = records
    .filter((record) => record.targetDate)
    .map((record) => ({
      title: reminderTitle(
        record.course?.title ?? "Training",
        record.staffProfile?.user?.name ?? record.staffId,
      ),
      eventType: "Training" as const,
      eventDate: record.targetDate as string,
      staffId: record.staffId,
    }));

  if (createdRows.length > 0) {
    await db.insert(calendarEvents).values(createdRows);
  }

  const actor = context.session?.user;
  if (!actor) {
    throw new ORPCError("UNAUTHORIZED");
  }

  await logAudit({
    actorId: actor.id,
    actorName: actor.name,
    action: "training.reminder.refresh",
    module: "compliance",
    resourceType: "training_reminder",
    resourceId: `within-${withinDays}`,
    afterValue: { scanned: records.length, created: createdRows.length } as Record<string, unknown>,
    ipAddress: context.ipAddress,
    userAgent: context.userAgent,
    actorRole: context.userRole ?? undefined,
    correlationId: context.requestId,
  });

  return { scanned: records.length, created: createdRows.length, records };
}

export async function sendTrainingReminder(context: Context, recordId: number) {
  const record = await db.query.staffTrainingRecords.findFirst({
    where: eq(staffTrainingRecords.id, recordId),
    with: {
      staffProfile: { with: { user: true, department: true } },
      course: true,
    },
  });
  if (!record) {
    throw new ORPCError("NOT_FOUND");
  }
  if (!isPrivileged(context)) {
    const caller = await getCallerStaffProfile(context);
    if (!caller) {
      throw new ORPCError("FORBIDDEN");
    }
    if (caller.id !== record.staffId && !(await canAccessStaffPrivate(context, record.staffId))) {
      throw new ORPCError("FORBIDDEN");
    }
  }

  const recipientId = record.staffProfile?.user?.id;
  if (!recipientId) {
    throw new ORPCError("NOT_FOUND", { message: "Staff member has no user account." });
  }

  const actor = context.session?.user;
  if (!actor) {
    throw new ORPCError("UNAUTHORIZED");
  }

  const title = `Training reminder: ${record.course?.title ?? "Training"}`;
  const body = record.targetDate
    ? `Your training "${record.course?.title ?? "Training"}" is due by ${record.targetDate}. Current status: ${record.status}.`
    : `Your training "${record.course?.title ?? "Training"}" needs attention. Current status: ${record.status}.`;

  await createNotification({
    recipientId,
    channel: "in_app",
    title,
    body,
    module: "training",
    resourceType: "staff_training_record",
    resourceId: String(record.id),
    linkUrl: "/training",
  });

  await logAudit({
    actorId: actor.id,
    actorName: actor.name,
    action: "training.reminder.send",
    module: "compliance",
    resourceType: "staff_training_record",
    resourceId: String(record.id),
    afterValue: { recipientId, title, targetDate: record.targetDate } as Record<string, unknown>,
    ipAddress: context.ipAddress,
    userAgent: context.userAgent,
    actorRole: context.userRole ?? undefined,
    correlationId: context.requestId,
  });

  return { success: true, record };
}
