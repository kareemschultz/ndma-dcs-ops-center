import { z } from "zod";
import {
  appraisals,
  appraisalNotes,
  appraisalScores,
  calendarEvents,
  companyForms,
  companyPolicies,
  db,
  attendanceExceptions,
  callouts,
  contracts,
  departments,
  examDates,
  importJobs,
  leaveRequests,
  leaveTypes,
  nocShifts,
  onboardingTasks,
  ppeIssuances,
  ppeItems,
  onCallAssignments,
  onCallSchedules,
  staffProfiles,
  staffPromotions,
  staffTrainingRecords,
  trainingCourses,
  trainingMaterials,
  trainingRecords,
  temporaryChanges,
  user,
  workInitiatives,
  workItems,
  workItemTemplates,
} from "@ndma-dcs-staff-portal/db";
import { and, eq, sql } from "drizzle-orm";

import { protectedProcedure, requireRole } from "../index";
import { logAudit } from "../lib/audit";

// ── Row schemas ───────────────────────────────────────────────────────────

const staffRowSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  department: z.string().min(1),
  employmentType: z.enum(["full_time", "part_time", "contract", "temporary"]),
  phoneNumber: z.string().optional(),
  role: z.enum(["Staff", "Team_Lead", "Manager", "PA", "Admin"]).optional(),
  reportsTo: z.string().optional(),
  emergencyContactName: z.string().optional(),
  emergencyContactPhone: z.string().optional(),
  jobTitle: z.string().optional(),
  employeeId: z.string().optional(),
});

const trainingRowSchema = z.object({
  staffEmail: z.string().email(),
  trainingName: z.string().optional(),
  courseTitle: z.string().optional(),
  provider: z.string().optional(),
  vendor: z.string().optional(),
  courseType: z.enum(["Certification", "Syllabus", "Internship"]).optional(),
  completedDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  completionDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  targetDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  expiryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  status: z.enum(["Enrolled", "In Progress", "Completed", "Failed"]).optional(),
  materialType: z.enum(["Book", "Checklist", "Survey"]).optional(),
  materialTitle: z.string().optional(),
  referenceLink: z.string().optional(),
  notes: z.string().optional(),
  year: z.string().optional(),
  period: z.string().optional(),
  department: z.string().optional(),
});

const contractRowSchema = z.object({
  staffEmail: z.string().email(),
  contractType: z.string().min(1),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  renewalStatus: z
    .enum(["not_due", "due_soon", "letter_drafted", "submitted_to_hr", "renewed", "not_renewing"])
    .optional(),
  appraisalPeriod: z.string().optional(),
  documentUrl: z.string().optional(),
  notes: z.string().optional(),
});

const workRowSchema = z.object({
  recordKind: z.enum(["work_item", "routine", "temporary"]).default("work_item"),
  recordType: z.string().optional(),
  projectTitle: z.string().optional(),
  title: z.string().min(1),
  taskTitle: z.string().optional(),
  taskAssigned: z.string().optional(),
  subTask: z.string().optional(),
  type: z.enum(["routine", "project", "external_request", "ad_hoc"]).optional(),
  priority: z.enum(["low", "medium", "high", "critical"]),
  description: z.string().optional(),
  assignedTo: z.string().optional(),
  departmentCode: z.string().optional(),
  sheetName: z.string().optional(),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  period: z.string().optional(),
  estimatedHours: z.string().optional(),
  externalSource: z.string().optional(),
  externalLink: z.string().optional(),
  dateAssigned: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  details: z.string().optional(),
  updateStatus: z.string().optional(),
  deadlineOrOverdue: z.string().optional(),
  deadlineDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  weeksOverdue: z.string().optional(),
  engineer: z.string().optional(),
  sourceSystem: z.string().optional(),
  folder: z.string().optional(),
  removalDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  followUpDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  notes: z.string().optional(),
  year: z.string().optional(),
});

const rosterRowSchema = z.object({
  rosterType: z.enum(["dcs_on_call", "noc_shifts"]),
  staffEmail: z.string().email(),
  staffId: z.string().optional(),
  department: z.string().optional(),
  year: z.string().optional(),
  period: z.string().optional(),
  shiftDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  shiftType: z.string().min(1),
  startTime: z.string().optional(),
  endTime: z.string().optional(),
  notes: z.string().optional(),
});

const appraisalRowSchema = z.object({
  staffEmail: z.string().email(),
  reviewerEmail: z.string().email().optional(),
  year: z.string().regex(/^\d{4}$/),
  period: z.string().min(1),
  periodStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  periodEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  evaluationType: z.enum(["Standard", "Employee of the Month"]).optional(),
  status: z
    .enum(["draft", "in_progress", "submitted", "approved", "rejected", "completed", "overdue",
           "Draft", "Pending_Approval", "Approved_By_Manager", "Processed_By_PA", "Completed"])
    .optional(),
  totalScore: z.string().optional(),
  scheduledDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  completedDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  category: z.string().optional(),
  criteria: z.string().optional(),
  score: z.string().optional(),
  comment: z.string().optional(),
  noteType: z.string().optional(),
  content: z.string().optional(),
});

const calendarEventRowSchema = z.object({
  title: z.string().min(1),
  eventType: z.enum(["Birthday", "Training", "Event"]),
  eventDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  staffEmail: z.string().email().optional(),
  notes: z.string().optional(),
});

const promotionRowSchema = z.object({
  staffEmail: z.string().email(),
  promotionDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  letterDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  fromTitle: z.string().optional(),
  toTitle: z.string().min(1),
  letterUrl: z.string().optional(),
  notes: z.string().optional(),
});

const examDateRowSchema = z.object({
  staffEmail: z.string().email(),
  examName: z.string().min(1),
  scheduledDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  status: z.enum(["Scheduled", "Passed", "Failed"]).optional(),
});

const onboardingTaskRowSchema = z.object({
  staffEmail: z.string().email(),
  taskName: z.string().min(1),
  category: z.string().min(1),
  isCompleted: z.enum(["true", "false"]).optional(),
  completedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2})?$/).optional(),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

const policyRowSchema = z.object({
  title: z.string().min(1),
  contentText: z.string().min(1),
  documentUrl: z.string().optional(),
  lastUpdated: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

const formRowSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  category: z.enum(["HR & Leave", "Finance", "Operations", "IT", "General"]),
  fileUrl: z.string().min(1),
  uploadedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2})?$/).optional(),
});

type ImportRowResult = {
  success: boolean;
  error?: { row: number; field?: string; message: string };
  meta?: Record<string, string | null>;
};

// Leave import: 2026 dates only, existing staff only (never creates new staff)
const leaveRowSchema = z.object({
  staffEmail: z.string().email(),
  leaveTypeCode: z.string().min(1), // e.g. AL, SL, ML
  startDate: z.string().regex(/^2026-\d{2}-\d{2}$/, "startDate must be a 2026 date (YYYY-MM-DD)"),
  endDate: z.string().regex(/^2026-\d{2}-\d{2}$/, "endDate must be a 2026 date (YYYY-MM-DD)"),
  totalDays: z.string().regex(/^\d+$/, "totalDays must be a number"),
  reason: z.string().optional(),
});

// ── Shared helpers ────────────────────────────────────────────────────────

async function findStaffByEmail(email: string): Promise<string | null> {
  const profile = await db.query.staffProfiles.findFirst({
    where: (sp) => sql`EXISTS (
      SELECT 1 FROM ${user} u WHERE u.id = ${sp.userId} AND u.email = ${email}
    )`,
    with: { user: true },
  });
  return profile?.id ?? null;
}

async function findStaffProfileByIdentifier(identifier: string | undefined): Promise<string | null> {
  if (!identifier) return null;
  const trimmed = identifier.trim();
  if (!trimmed) return null;

  const byId = await db.query.staffProfiles.findFirst({
    where: eq(staffProfiles.id, trimmed),
  });
  if (byId) return byId.id;

  if (trimmed.includes("@")) {
    const byEmail = await findStaffByEmail(trimmed);
    if (byEmail) return byEmail;
  }

  const byEmployeeId = await db.query.staffProfiles.findFirst({
    where: eq(staffProfiles.employeeId, trimmed),
  });
  if (byEmployeeId) return byEmployeeId.id;

  const byName = await db.query.staffProfiles.findFirst({
    where: (sp) => sql`EXISTS (
      SELECT 1 FROM ${user} u WHERE u.id = ${sp.userId} AND u.name = ${trimmed}
    )`,
    with: { user: true },
  });
  return byName?.id ?? null;
}

async function findOrCreateDepartment(name: string): Promise<string> {
  const existing = await db.query.departments.findFirst({
    where: eq(departments.name, name),
  });
  if (existing) return existing.id;

  // Derive a unique code from the name (uppercase, alphanumeric, max 10 chars)
  const code = name.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 10) || "DEPT";

  const [dept] = await db
    .insert(departments)
    .values({ name, code })
    .returning();
  if (!dept) throw new Error("Department insert failed");
  return dept.id;
}

async function findOrCreateTrainingCourse(input: {
  title: string;
  vendor: string;
  courseType: "Certification" | "Syllabus" | "Internship";
}): Promise<number> {
  const existing = await db.query.trainingCourses.findFirst({
    where: and(
      eq(trainingCourses.title, input.title),
      eq(trainingCourses.vendor, input.vendor),
      eq(trainingCourses.courseType, input.courseType),
    ),
  });
  if (existing) return existing.id;

  const [course] = await db
    .insert(trainingCourses)
    .values({
      title: input.title,
      vendor: input.vendor,
      courseType: input.courseType,
    })
    .returning();
  if (!course) throw new Error("Training course insert failed");
  return course.id;
}

async function findOrCreateWorkInitiative(input: {
  title: string;
  description?: string | null;
  departmentId?: string | null;
  targetDate?: string | null;
  createdById?: string | null;
}): Promise<string> {
  const existing = await db.query.workInitiatives.findFirst({
    where: input.departmentId
      ? and(eq(workInitiatives.title, input.title), eq(workInitiatives.departmentId, input.departmentId))
      : eq(workInitiatives.title, input.title),
  });
  if (existing) return existing.id;

  const [initiative] = await db
    .insert(workInitiatives)
    .values({
      title: input.title,
      description: input.description ?? null,
      departmentId: input.departmentId ?? null,
      targetDate: input.targetDate ?? null,
      createdById: input.createdById ?? null,
      status: "active",
    })
    .returning();
  if (!initiative) throw new Error("Work initiative insert failed");
  return initiative.id;
}

function normalizeWorkStatus(status?: string): "backlog" | "todo" | "in_progress" | "blocked" | "review" | "done" | "cancelled" {
  const value = (status ?? "").trim().toLowerCase().replace(/\s+/g, "_");
  if (value === "in_progress" || value === "inprogress") return "in_progress";
  if (value === "to_do" || value === "todo") return "todo";
  if (value === "review") return "review";
  if (value === "blocked") return "blocked";
  if (value === "done" || value === "completed" || value === "complete") return "done";
  if (value === "cancelled" || value === "canceled") return "cancelled";
  return "backlog";
}

function normalizeWorkPriority(priority?: string): "low" | "medium" | "high" | "critical" {
  const value = (priority ?? "").trim().toLowerCase();
  if (value === "critical") return "critical";
  if (value === "high") return "high";
  if (value === "low") return "low";
  return "medium";
}

function normalizeRotaRole(role?: string): "lead_engineer" | "asn_support" | "core_support" | "enterprise_support" {
  const value = (role ?? "").trim().toLowerCase();
  if (value.includes("asn")) return "asn_support";
  if (value.includes("core")) return "core_support";
  if (value.includes("enterprise")) return "enterprise_support";
  return "lead_engineer";
}

function getWeekStart(dateString: string): string {
  const date = new Date(`${dateString}T00:00:00`);
  const day = date.getDay();
  date.setDate(date.getDate() - day);
  return date.toISOString().slice(0, 10);
}

// ── Row processors ────────────────────────────────────────────────────────

async function processStaffRow(
  rawRow: Record<string, string>,
  rowIdx: number,
  _createdByUserId: string,
  options?: { deferReportsTo?: boolean },
): Promise<ImportRowResult> {
  const parse = staffRowSchema.safeParse({
    name: rawRow.name,
    email: rawRow.email,
    department: rawRow.department,
    employmentType: rawRow.employmentType || rawRow.employment_type,
    phoneNumber: rawRow.phoneNumber || rawRow.phone_number || undefined,
    role: (rawRow.role as "Staff" | "Team_Lead" | "Manager" | "PA" | "Admin" | undefined) ?? "Staff",
    reportsTo: rawRow.reportsTo || rawRow.reports_to || undefined,
    emergencyContactName: rawRow.emergencyContactName || rawRow.emergency_contact_name || undefined,
    emergencyContactPhone: rawRow.emergencyContactPhone || rawRow.emergency_contact_phone || undefined,
    jobTitle: rawRow.jobTitle || rawRow.job_title,
    employeeId: rawRow.employeeId || rawRow.employee_id,
  });
  if (!parse.success) {
    return {
      success: false,
      error: { row: rowIdx, message: parse.error.issues[0]?.message ?? "Validation failed" },
    };
  }
  const data = parse.data;

  // Check for duplicate email
  const existingUser = await db.query.user.findFirst({
    where: eq(user.email, data.email),
  });
  if (existingUser) {
    return {
      success: false,
      error: { row: rowIdx, field: "email", message: `User with email ${data.email} already exists` },
    };
  }

  const departmentId = await findOrCreateDepartment(data.department);
  const reportsToId =
    data.reportsTo && !options?.deferReportsTo ? await findStaffProfileByIdentifier(data.reportsTo) : null;

  // Generate a sequential employee ID if not provided
  const empId = data.employeeId ?? `IMP-${Date.now()}-${rowIdx}`;

  // Create the auth user record
  const [newUser] = await db
    .insert(user)
    .values({
      id: crypto.randomUUID(),
      name: data.name,
      email: data.email,
      emailVerified: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .returning();
  if (!newUser) throw new Error("User insert failed");

  // Create staff profile
  const [profile] = await db.insert(staffProfiles).values({
    userId: newUser.id,
    employeeId: empId,
    departmentId,
    jobTitle: data.jobTitle ?? "Staff",
    employmentType: data.employmentType,
    role: data.role ?? "Staff",
    phoneNumber: data.phoneNumber ?? null,
    reportsTo: reportsToId,
    teamLeadId: reportsToId,
    emergencyContacts:
      data.emergencyContactName || data.emergencyContactPhone
        ? [
            {
              name: data.emergencyContactName ?? "Emergency Contact",
              phone: data.emergencyContactPhone ?? "",
            },
          ]
        : [],
    status: "active",
    startDate: new Date(),
  }).returning();

  if (!profile) throw new Error("Staff profile insert failed");

  return {
    success: true,
    meta: {
      staffProfileId: profile.id,
      reportsTo: data.reportsTo ?? null,
    },
  };
}

async function processTrainingRow(
  rawRow: Record<string, string>,
  rowIdx: number,
): Promise<{ success: boolean; error?: { row: number; field?: string; message: string } }> {
  const parse = trainingRowSchema.safeParse({
    staffEmail: rawRow.staffEmail || rawRow.staff_email,
    trainingName: rawRow.trainingName,
    courseTitle: rawRow.courseTitle || rawRow.course_title,
    provider: rawRow.provider || rawRow.vendor,
    vendor: rawRow.vendor || rawRow.provider,
    courseType: (rawRow.courseType || rawRow.course_type) as
      | "Certification"
      | "Syllabus"
      | "Internship"
      | undefined,
    completedDate: rawRow.completedDate || rawRow.completionDate || rawRow.completion_date,
    completionDate: rawRow.completionDate || rawRow.completedDate || rawRow.completion_date,
    startDate: rawRow.startDate || rawRow.start_date,
    targetDate: rawRow.targetDate || rawRow.target_date,
    expiryDate: rawRow.expiryDate || rawRow.expiry_date || undefined,
    status: (rawRow.status || rawRow.record_status) as "Enrolled" | "In Progress" | "Completed" | "Failed" | undefined,
    materialType: (rawRow.materialType || rawRow.material_type) as "Book" | "Checklist" | "Survey" | undefined,
    materialTitle: rawRow.materialTitle || rawRow.material_title,
    referenceLink: rawRow.referenceLink || rawRow.reference_link,
    notes: rawRow.notes,
    year: rawRow.year,
    period: rawRow.period,
    department: rawRow.department,
  });
  if (!parse.success) {
    return { success: false, error: { row: rowIdx, message: parse.error.issues[0]?.message ?? "Validation failed" } };
  }
  const data = parse.data;

  const staffProfileId = await findStaffByEmail(data.staffEmail);
  if (!staffProfileId) {
    return { success: false, error: { row: rowIdx, field: "staffEmail", message: `No staff found with email ${data.staffEmail}` } };
  }

  const courseTitle = data.courseTitle ?? data.trainingName ?? "Imported Training";
  const courseVendor = data.vendor ?? data.provider ?? "Internal";
  const courseType = data.courseType ?? "Certification";
  const courseId = await findOrCreateTrainingCourse({
    title: courseTitle,
    vendor: courseVendor,
    courseType,
  });

  const status =
    data.status ??
    (data.completionDate || data.completedDate ? "Completed" : data.startDate ? "In Progress" : "Enrolled");
  const complianceStatus: "current" | "expired" =
    status === "Failed" ? "expired" : "current";

  await db.insert(trainingRecords).values({
    staffProfileId,
    trainingName: courseTitle,
    provider: courseVendor,
    completedDate: data.completionDate ?? data.completedDate ?? null,
    expiryDate: data.expiryDate ?? null,
    status: complianceStatus,
  });

  if (data.startDate || data.targetDate || data.notes) {
    await db.insert(staffTrainingRecords).values({
      staffId: staffProfileId,
      courseId,
      status: status as "Enrolled" | "In Progress" | "Completed" | "Failed",
      startDate: data.startDate ?? null,
      completionDate: data.completionDate ?? data.completedDate ?? null,
      targetDate: data.targetDate ?? data.expiryDate ?? null,
      notes: data.notes ?? null,
    }).onConflictDoNothing();
  }

  if (data.materialType && data.materialTitle) {
    await db.insert(trainingMaterials).values({
      courseId,
      materialType: data.materialType,
      title: data.materialTitle,
      referenceLink: data.referenceLink ?? null,
    }).onConflictDoNothing();
  }

  return { success: true };
}

async function processContractRow(
  rawRow: Record<string, string>,
  rowIdx: number,
): Promise<{ success: boolean; error?: { row: number; field?: string; message: string } }> {
  const parse = contractRowSchema.safeParse({
    staffEmail: rawRow.staffEmail || rawRow.staff_email,
    contractType: rawRow.contractType || rawRow.contract_type,
    startDate: rawRow.startDate || rawRow.start_date,
    endDate: rawRow.endDate || rawRow.end_date || undefined,
    renewalStatus: (rawRow.renewalStatus || rawRow.renewal_status) as
      | "not_due"
      | "due_soon"
      | "letter_drafted"
      | "submitted_to_hr"
      | "renewed"
      | "not_renewing"
      | undefined,
    appraisalPeriod: rawRow.appraisalPeriod || rawRow.appraisal_period || undefined,
    documentUrl: rawRow.documentUrl || rawRow.document_url || undefined,
    notes: rawRow.notes || undefined,
  });
  if (!parse.success) {
    return { success: false, error: { row: rowIdx, message: parse.error.issues[0]?.message ?? "Validation failed" } };
  }
  const data = parse.data;

  const staffProfileId = await findStaffByEmail(data.staffEmail);
  if (!staffProfileId) {
    return { success: false, error: { row: rowIdx, field: "staffEmail", message: `No staff found with email ${data.staffEmail}` } };
  }

  await db.insert(contracts).values({
    staffProfileId,
    contractType: data.contractType,
    startDate: data.startDate,
    endDate: data.endDate ?? null,
    appraisalPeriod: data.appraisalPeriod ?? null,
    renewalStatus: data.renewalStatus ?? "not_due",
    documentUrl: data.documentUrl ?? null,
    notes: data.notes ?? null,
    status: "active",
  });

  return { success: true };
}

async function processWorkRow(
  rawRow: Record<string, string>,
  rowIdx: number,
  createdById: string,
): Promise<{ success: boolean; error?: { row: number; field?: string; message: string } }> {
  const parse = workRowSchema.safeParse({
    recordKind: (rawRow.recordKind || rawRow.record_kind) as "work_item" | "routine" | "temporary" | undefined,
    recordType: rawRow.recordType || rawRow.record_type || undefined,
    projectTitle: rawRow.projectTitle || rawRow.project_title || undefined,
    title:
      rawRow.title ||
      rawRow.taskAssigned ||
      rawRow.task_assigned ||
      rawRow.projectTitle ||
      rawRow.project_title ||
      rawRow.sheetName ||
      rawRow.sheet_name ||
      "Imported task",
    taskTitle: rawRow.taskTitle || rawRow.task_title || undefined,
    taskAssigned: rawRow.taskAssigned || rawRow.task_assigned || undefined,
    subTask: rawRow.subTask || rawRow.sub_task || undefined,
    type: (rawRow.type as "routine" | "project" | "external_request" | "ad_hoc" | undefined) ?? undefined,
    priority: (rawRow.priority as "low" | "medium" | "high" | "critical") ?? "medium",
    description: rawRow.description || rawRow.details || undefined,
    assignedTo: rawRow.assignedTo || rawRow.assigned_to || rawRow.engineer || rawRow.assignedToEmail || rawRow.assigned_to_email || undefined,
    departmentCode: rawRow.departmentCode || rawRow.department_code || undefined,
    sheetName: rawRow.sheetName || rawRow.sheet_name || undefined,
    dueDate: rawRow.dueDate || rawRow.due_date || undefined,
    period: rawRow.period || undefined,
    estimatedHours: rawRow.estimatedHours || rawRow.estimated_hours || undefined,
    externalSource: rawRow.externalSource || rawRow.external_source || rawRow.sourceSystem || rawRow.source_system || undefined,
    externalLink: rawRow.externalLink || rawRow.external_link || undefined,
    dateAssigned: rawRow.dateAssigned || rawRow.date_assigned || undefined,
    details: rawRow.details || undefined,
    updateStatus: rawRow.updateStatus || rawRow.update_status || undefined,
    deadlineOrOverdue: rawRow.deadlineOrOverdue || rawRow.deadline_or_overdue || undefined,
    deadlineDate: rawRow.deadlineDate || rawRow.deadline_date || undefined,
    weeksOverdue: rawRow.weeksOverdue || rawRow.weeks_overdue || undefined,
    engineer: rawRow.engineer || undefined,
    sourceSystem: rawRow.sourceSystem || rawRow.source_system || undefined,
    folder: rawRow.folder || undefined,
    removalDate: rawRow.removalDate || rawRow.removal_date || undefined,
    followUpDate: rawRow.followUpDate || rawRow.follow_up_date || undefined,
    notes: rawRow.notes || undefined,
    year: rawRow.year || undefined,
  });
  if (!parse.success) {
    return { success: false, error: { row: rowIdx, message: parse.error.issues[0]?.message ?? "Validation failed" } };
  }
  const data = parse.data;

  let assignedToId: string | null = null;
  if (data.assignedTo) {
    assignedToId = await findStaffProfileByIdentifier(data.assignedTo);
  }

  const normalizedRecordKind = (() => {
    const kind = (data.recordKind ?? data.recordType ?? "work_item").toLowerCase();
    if (kind.includes("routine")) return "routine" as const;
    if (kind.includes("temporary")) return "temporary" as const;
    return "work_item" as const;
  })();
  const departmentId = data.departmentCode
    ? await findOrCreateDepartment(data.departmentCode)
    : data.sheetName === "TemporaryTracker"
      ? await findOrCreateDepartment("DCS")
      : null;
  const initiativeTitle = data.projectTitle ?? data.sheetName ?? data.title;
  const initiativeId = initiativeTitle
    ? await findOrCreateWorkInitiative({
      title: initiativeTitle,
        description: data.description ?? data.details ?? data.notes ?? null,
        departmentId,
        targetDate: data.dueDate ?? null,
        createdById,
      })
    : null;

  if (normalizedRecordKind === "routine") {
    await db
      .insert(workItemTemplates)
      .values({
        title: data.taskTitle ?? data.taskAssigned ?? data.title,
        description: [data.subTask, data.description, data.details, data.notes].filter(Boolean).join("\n"),
        type: data.type ?? "routine",
        priority: data.priority,
        departmentId,
        estimatedHours: data.estimatedHours ? parseInt(data.estimatedHours, 10) : null,
        recurrencePattern: data.period ?? "monthly",
        createdById,
      })
      .onConflictDoNothing();
    return { success: true };
  }

  if (normalizedRecordKind === "temporary") {
    await db
      .insert(temporaryChanges)
      .values({
        title: data.taskTitle ?? data.taskAssigned ?? data.title,
        description: [data.projectTitle, data.sheetName, data.subTask, data.description, data.details].filter(Boolean).join("\n"),
        justification: data.notes ?? data.updateStatus ?? null,
        ownerId: assignedToId,
        implementationDate: data.dateAssigned ?? data.dueDate ?? null,
        removeByDate: data.removalDate ?? data.deadlineDate ?? data.followUpDate ?? null,
        followUpDate: data.followUpDate ?? null,
        status: (
          data.updateStatus?.toLowerCase().includes("remove")
            ? "overdue"
            : data.updateStatus?.toLowerCase().includes("active")
              ? "active"
              : data.priority === "critical"
                ? "active"
                : "planned"
        ) as
          | "planned"
          | "implemented"
          | "active"
          | "overdue"
          | "removed"
          | "cancelled",
        createdById,
        departmentId,
        followUpNotes: [data.notes, data.deadlineOrOverdue, data.weeksOverdue ? `Weeks overdue: ${data.weeksOverdue}` : null].filter(Boolean).join(" | ") || null,
      })
      .onConflictDoNothing();
    return { success: true };
  }

  await db.insert(workItems).values({
    title: data.taskTitle ?? data.taskAssigned ?? data.title,
    description: [data.projectTitle, data.sheetName, data.subTask, data.description, data.details, data.notes].filter(Boolean).join("\n"),
    type: data.type ?? "project",
    status: normalizeWorkStatus(data.updateStatus || rawRow.status),
    priority: normalizeWorkPriority(data.priority),
    assignedToId,
    departmentId,
    sourceSystem: data.externalSource ?? data.sourceSystem ?? null,
    sourceReference: data.externalLink ?? null,
    dueDate: data.dueDate ?? data.deadlineDate ?? null,
    estimatedHours: data.estimatedHours ?? null,
    followUpDate: data.followUpDate ?? null,
    initiativeId,
    createdById,
  }).returning();

  return { success: true };
}

async function processLeaveRow(
  rawRow: Record<string, string>,
  rowIdx: number,
): Promise<{ success: boolean; error?: { row: number; field?: string; message: string } }> {
  const parse = leaveRowSchema.safeParse({
    staffEmail: rawRow.staffEmail,
    leaveTypeCode: rawRow.leaveTypeCode,
    startDate: rawRow.startDate,
    endDate: rawRow.endDate,
    totalDays: rawRow.totalDays,
    reason: rawRow.reason || undefined,
  });
  if (!parse.success) {
    return {
      success: false,
      error: { row: rowIdx, message: parse.error.issues[0]?.message ?? "Validation failed" },
    };
  }
  const data = parse.data;

  // Must match an existing staff member — never create new staff
  const staffProfileId = await findStaffByEmail(data.staffEmail);
  if (!staffProfileId) {
    return {
      success: false,
      error: {
        row: rowIdx,
        field: "staffEmail",
        message: `No existing staff found with email ${data.staffEmail} — new staff cannot be created via leave import`,
      },
    };
  }

  // Must match an existing leave type by code
  const leaveType = await db.query.leaveTypes.findFirst({
    where: and(eq(leaveTypes.code, data.leaveTypeCode), eq(leaveTypes.isActive, true)),
  });
  if (!leaveType) {
    return {
      success: false,
      error: {
        row: rowIdx,
        field: "leaveTypeCode",
        message: `No active leave type found with code "${data.leaveTypeCode}"`,
      },
    };
  }

  await db.insert(leaveRequests).values({
    staffProfileId,
    leaveTypeId: leaveType.id,
    startDate: data.startDate,
    endDate: data.endDate,
    totalDays: parseInt(data.totalDays, 10),
    reason: data.reason ?? null,
    status: "approved", // Historical imports are auto-approved
  });

  return { success: true };
}

// ── PPE + Attendance + Callout row schemas ────────────────────────────────

const ppeRowSchema = z.object({
  staffEmail: z.string().email(),
  ppeItemCode: z.string().min(1),
  status: z.enum(["issued", "returned", "lost", "damaged", "replaced"]),
  issuedDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  serialNumber: z.string().optional(),
  size: z.string().optional(),
  notes: z.string().optional(),
});

const attendanceRowSchema = z.object({
  staffEmail: z.string().email(),
  exceptionDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  exceptionType: z.enum(["reported_sick", "medical", "absent", "lateness", "wfh", "early_leave", "other"]),
  reason: z.string().optional(),
  hours: z.string().optional(),
  minutesLate: z.string().optional(),
  notes: z.string().optional(),
});

const calloutRowSchema = z.object({
  staffEmail: z.string().email(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  startTime: z.string().optional(),
  endTime: z.string().optional(),
  hours: z.string().regex(/^\d+(\.\d+)?$/, "hours must be a number"),
  comments: z.string().optional(),
  relatedIncidentRef: z.string().optional(),
});

async function processPpeRow(
  rawRow: Record<string, string>,
  rowIdx: number,
  actorUserId: string,
): Promise<{ success: boolean; error?: { row: number; field?: string; message: string } }> {
  const parse = ppeRowSchema.safeParse({
    staffEmail: rawRow.staffEmail,
    ppeItemCode: rawRow.ppeItemCode,
    status: rawRow.status,
    issuedDate: rawRow.issuedDate,
    serialNumber: rawRow.serialNumber || undefined,
    size: rawRow.size || undefined,
    notes: rawRow.notes || undefined,
  });
  if (!parse.success) {
    return { success: false, error: { row: rowIdx, message: parse.error.issues[0]?.message ?? "Validation failed" } };
  }
  const data = parse.data;

  const staffProfileId = await findStaffByEmail(data.staffEmail);
  if (!staffProfileId) {
    return { success: false, error: { row: rowIdx, field: "staffEmail", message: `Staff not found: ${data.staffEmail}` } };
  }

  const item = await db.query.ppeItems.findFirst({ where: eq(ppeItems.code, data.ppeItemCode) });
  if (!item) {
    return { success: false, error: { row: rowIdx, field: "ppeItemCode", message: `PPE item not found: ${data.ppeItemCode}` } };
  }

  await db
    .insert(ppeIssuances)
    .values({
      staffProfileId,
      ppeItemId: item.id,
      issuedById: actorUserId,
      issuedDate: data.issuedDate,
      status: data.status,
      serialNumber: data.serialNumber ?? null,
      size: data.size ?? null,
      notes: data.notes ?? null,
    })
    .onConflictDoNothing();

  return { success: true };
}

async function processAttendanceRow(
  rawRow: Record<string, string>,
  rowIdx: number,
  _actorUserId: string,
): Promise<{ success: boolean; error?: { row: number; field?: string; message: string } }> {
  const parse = attendanceRowSchema.safeParse({
    staffEmail: rawRow.staffEmail,
    exceptionDate: rawRow.exceptionDate ?? rawRow.date,
    exceptionType: rawRow.exceptionType ?? rawRow.type,
    reason: rawRow.reason || undefined,
    hours: rawRow.hours || undefined,
    minutesLate: rawRow.minutesLate || undefined,
    notes: rawRow.notes || undefined,
  });
  if (!parse.success) {
    return { success: false, error: { row: rowIdx, message: parse.error.issues[0]?.message ?? "Validation failed" } };
  }
  const data = parse.data;

  const staffProfileId = await findStaffByEmail(data.staffEmail);
  if (!staffProfileId) {
    return { success: false, error: { row: rowIdx, field: "staffEmail", message: `Staff not found: ${data.staffEmail}` } };
  }

  await db
    .insert(attendanceExceptions)
    .values({
      staffProfileId,
      exceptionDate: data.exceptionDate,
      exceptionType: data.exceptionType,
      reason: data.reason ?? null,
      hours: data.hours ?? null,
      minutesLate: data.minutesLate ? parseInt(data.minutesLate, 10) : null,
      notes: data.notes ?? null,
    })
    .onConflictDoNothing();

  return { success: true };
}

async function processCalloutRow(
  rawRow: Record<string, string>,
  rowIdx: number,
  _actorUserId: string,
): Promise<{ success: boolean; error?: { row: number; field?: string; message: string } }> {
  const parse = calloutRowSchema.safeParse({
    staffEmail: rawRow.staffEmail,
    date: rawRow.date,
    startTime: rawRow.startTime || undefined,
    endTime: rawRow.endTime || undefined,
    hours: rawRow.hours,
    comments: rawRow.comments || undefined,
    relatedIncidentRef: rawRow.relatedIncidentRef || undefined,
  });
  if (!parse.success) {
    return { success: false, error: { row: rowIdx, message: parse.error.issues[0]?.message ?? "Validation failed" } };
  }
  const data = parse.data;

  const staffProfileId = await findStaffByEmail(data.staffEmail);
  if (!staffProfileId) {
    return { success: false, error: { row: rowIdx, field: "staffEmail", message: `Staff not found: ${data.staffEmail}` } };
  }

  await db
    .insert(callouts)
    .values({
      staffProfileId,
      calloutAt: new Date(`${data.date}T${data.startTime ?? "00:00"}:00`),
      calloutType: "manual",
      reason: data.comments ?? "Imported callout",
      outcome: data.endTime ? `End: ${data.endTime}, Hours: ${data.hours}` : `Hours: ${data.hours}`,
    })
    .onConflictDoNothing();

  return { success: true };
}

async function processRosterRow(
  rawRow: Record<string, string>,
  rowIdx: number,
  actorUserId: string,
): Promise<ImportRowResult> {
  const parse = rosterRowSchema.safeParse({
    rosterType: rawRow.rosterType,
    staffEmail: rawRow.staffEmail,
    staffId: rawRow.staffId || undefined,
    department: rawRow.department || undefined,
    year: rawRow.year || undefined,
    period: rawRow.period || undefined,
    shiftDate: rawRow.shiftDate || rawRow.shift_date,
    shiftType: rawRow.shiftType || rawRow.shift_type,
    startTime: rawRow.startTime || undefined,
    endTime: rawRow.endTime || undefined,
    notes: rawRow.notes || undefined,
  });
  if (!parse.success) {
    return { success: false, error: { row: rowIdx, message: parse.error.issues[0]?.message ?? "Validation failed" } };
  }
  const data = parse.data;
  const staffProfileId = await findStaffProfileByIdentifier(data.staffId ?? data.staffEmail);
  if (!staffProfileId) {
    return {
      success: false,
      error: { row: rowIdx, field: "staffEmail", message: `Staff not found: ${data.staffEmail}` },
    };
  }

  if (data.rosterType === "noc_shifts") {
    const shiftType = data.shiftType as "12hr Day" | "12hr Night" | "Off" | "Annual Leave" | "Sick Leave";
    await db
      .insert(nocShifts)
      .values({
        staffId: staffProfileId,
        shiftDate: data.shiftDate,
        shiftType,
        notes:
          [
            data.period ? `Period: ${data.period}` : null,
            data.startTime ? `Start: ${data.startTime}` : null,
            data.endTime ? `End: ${data.endTime}` : null,
            data.notes ? `Notes: ${data.notes}` : null,
          ]
            .filter(Boolean)
            .join(" | ") || null,
      })
      .onConflictDoNothing();
    return { success: true };
  }

  const weekStart = getWeekStart(data.shiftDate);
  const weekEnd = new Date(new Date(weekStart).getTime() + 6 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const rosterNotes = [
    `Imported roster row ${rowIdx}`,
    data.period ? `Period: ${data.period}` : null,
    data.startTime ? `Start: ${data.startTime}` : null,
    data.endTime ? `End: ${data.endTime}` : null,
    data.notes ? `Notes: ${data.notes}` : null,
  ]
    .filter(Boolean)
    .join(" | ");
  const schedule = await db.query.onCallSchedules.findFirst({
    where: eq(onCallSchedules.weekStart, weekStart),
  });
  const scheduleId =
    schedule?.id ??
    (
      await db
      .insert(onCallSchedules)
      .values({
        weekStart,
        weekEnd,
        status: "published",
        notes: rosterNotes || `Imported roster row ${rowIdx} by ${actorUserId}`,
        publishedAt: new Date(),
        publishedById: actorUserId,
        hasConflicts: false,
        isLegacyImport: true,
      })
        .returning()
    )[0]?.id;

  if (!scheduleId) throw new Error("Roster schedule insert failed");

  const existingAssignment = await db.query.onCallAssignments.findFirst({
    where: and(
      eq(onCallAssignments.scheduleId, scheduleId),
      eq(onCallAssignments.staffProfileId, staffProfileId),
    ),
  });
  if (!existingAssignment) {
    await db.insert(onCallAssignments).values({
      scheduleId,
      role: normalizeRotaRole(data.shiftType),
      staffProfileId,
      isLegacyImport: true,
      isConfirmed: true,
      acknowledgedById: staffProfileId,
    });
  }
  return { success: true };
}

async function processAppraisalRow(
  rawRow: Record<string, string>,
  rowIdx: number,
  actorUserId: string,
): Promise<{ success: boolean; error?: { row: number; field?: string; message: string } }> {
  const parse = appraisalRowSchema.safeParse({
    staffEmail: rawRow.staffEmail || rawRow.staff_email,
    reviewerEmail: rawRow.reviewerEmail || rawRow.reviewer_email || undefined,
    year: rawRow.year,
    period: rawRow.period,
    periodStart: rawRow.periodStart || rawRow.period_start,
    periodEnd: rawRow.periodEnd || rawRow.period_end,
    evaluationType: (rawRow.evaluationType || rawRow.evaluation_type) as "Standard" | "Employee of the Month" | undefined,
    status: (rawRow.status || rawRow.workflow_status) as string | undefined,
    totalScore: rawRow.totalScore || rawRow.total_score || undefined,
    scheduledDate: rawRow.scheduledDate || rawRow.scheduled_date || undefined,
    completedDate: rawRow.completedDate || rawRow.completed_date || undefined,
    category: rawRow.category || undefined,
    criteria: rawRow.criteria || undefined,
    score: rawRow.score || undefined,
    comment: rawRow.comment || undefined,
    noteType: rawRow.noteType || rawRow.note_type || undefined,
    content: rawRow.content || undefined,
  });
  if (!parse.success) {
    return { success: false, error: { row: rowIdx, message: parse.error.issues[0]?.message ?? "Validation failed" } };
  }
  const data = parse.data;
  const staffProfileId = await findStaffByEmail(data.staffEmail);
  if (!staffProfileId) {
    return {
      success: false,
      error: { row: rowIdx, field: "staffEmail", message: `Staff not found: ${data.staffEmail}` },
    };
  }

  const reviewerId = data.reviewerEmail ? await findStaffByEmail(data.reviewerEmail) : null;
  const legacyStatusMap: Record<string, string> = {
    Draft: "draft", Pending_Approval: "submitted",
    Approved_By_Manager: "approved", Processed_By_PA: "completed", Completed: "completed",
  };
  const appraisalStatus = (legacyStatusMap[data.status ?? ""] ?? data.status ?? "draft") as
    "draft" | "in_progress" | "submitted" | "approved" | "rejected" | "completed" | "overdue";
  const existingAppraisal = await db.query.appraisals.findFirst({
    where: and(
      eq(appraisals.staffProfileId, staffProfileId),
      eq(appraisals.year, parseInt(data.year, 10)),
      eq(appraisals.period, data.period),
      eq(appraisals.evaluationType, data.evaluationType ?? "Standard"),
    ),
  });

  const [appraisal] = existingAppraisal
    ? await db
        .update(appraisals)
        .set({
          reviewerId,
          totalScore: data.totalScore ? parseInt(data.totalScore, 10) : existingAppraisal.totalScore,
          periodStart: data.periodStart,
          periodEnd: data.periodEnd,
          status: appraisalStatus,
          scheduledDate: data.scheduledDate ?? existingAppraisal.scheduledDate,
          completedDate: data.completedDate ?? existingAppraisal.completedDate,
          submittedById: actorUserId,
        })
        .where(eq(appraisals.id, existingAppraisal.id))
        .returning()
    : await db
        .insert(appraisals)
        .values({
          staffProfileId,
          reviewerId,
          year: parseInt(data.year, 10),
          period: data.period,
          totalScore: data.totalScore ? parseInt(data.totalScore, 10) : null,
          evaluationType: data.evaluationType ?? "Standard",
          periodStart: data.periodStart,
          periodEnd: data.periodEnd,
          status: appraisalStatus,
          scheduledDate: data.scheduledDate ?? null,
          completedDate: data.completedDate ?? null,
          submittedById: actorUserId,
        })
        .returning();
  if (!appraisal) throw new Error("Appraisal insert failed");

  if (data.category && data.criteria && data.score) {
    await db.insert(appraisalScores).values({
      appraisalId: appraisal.id,
      category: data.category,
      criteria: data.criteria,
      score: parseInt(data.score, 10),
      comment: data.comment ?? null,
    });
  }
  if (data.noteType && data.content) {
    await db.insert(appraisalNotes).values({
      appraisalId: appraisal.id,
      noteType: data.noteType,
      content: data.content,
    });
  }
  return { success: true };
}

async function processCalendarEventRow(
  rawRow: Record<string, string>,
  rowIdx: number,
): Promise<ImportRowResult> {
  const parse = calendarEventRowSchema.safeParse({
    title: rawRow.title,
    eventType: rawRow.eventType || rawRow.event_type,
    eventDate: rawRow.eventDate || rawRow.event_date,
    staffEmail: rawRow.staffEmail || rawRow.staff_email || undefined,
    notes: rawRow.notes || undefined,
  });
  if (!parse.success) {
    return { success: false, error: { row: rowIdx, message: parse.error.issues[0]?.message ?? "Validation failed" } };
  }
  const data = parse.data;
  const staffProfileId = data.staffEmail ? await findStaffByEmail(data.staffEmail) : null;
  if (data.staffEmail && !staffProfileId) {
    return {
      success: false,
      error: { row: rowIdx, field: "staffEmail", message: `Staff not found: ${data.staffEmail}` },
    };
  }
  await db.insert(calendarEvents).values({
    title: data.title,
    eventType: data.eventType,
    eventDate: data.eventDate,
    staffId: staffProfileId ?? null,
    notes: data.notes ?? null,
  });
  return { success: true };
}

async function processPromotionRow(
  rawRow: Record<string, string>,
  rowIdx: number,
): Promise<{ success: boolean; error?: { row: number; field?: string; message: string } }> {
  const parse = promotionRowSchema.safeParse({
    staffEmail: rawRow.staffEmail || rawRow.staff_email,
    promotionDate: rawRow.promotionDate || rawRow.promotion_date,
    letterDate: rawRow.letterDate || rawRow.letter_date || undefined,
    fromTitle: rawRow.fromTitle || rawRow.from_title || undefined,
    toTitle: rawRow.toTitle || rawRow.to_title,
    letterUrl: rawRow.letterUrl || rawRow.letter_url || undefined,
    notes: rawRow.notes || undefined,
  });
  if (!parse.success) {
    return { success: false, error: { row: rowIdx, message: parse.error.issues[0]?.message ?? "Validation failed" } };
  }
  const data = parse.data;
  const staffProfileId = await findStaffByEmail(data.staffEmail);
  if (!staffProfileId) {
    return { success: false, error: { row: rowIdx, field: "staffEmail", message: `Staff not found: ${data.staffEmail}` } };
  }
  await db.insert(staffPromotions).values({
    staffId: staffProfileId,
    promotionDate: data.promotionDate,
    letterDate: data.letterDate ?? null,
    fromTitle: data.fromTitle ?? null,
    toTitle: data.toTitle,
    letterUrl: data.letterUrl ?? null,
    notes: data.notes ?? null,
  });
  return { success: true };
}

async function processExamDateRow(
  rawRow: Record<string, string>,
  rowIdx: number,
): Promise<{ success: boolean; error?: { row: number; field?: string; message: string } }> {
  const parse = examDateRowSchema.safeParse({
    staffEmail: rawRow.staffEmail || rawRow.staff_email,
    examName: rawRow.examName || rawRow.exam_name,
    scheduledDate: rawRow.scheduledDate || rawRow.scheduled_date,
    status: (rawRow.status || rawRow.exam_status) as "Scheduled" | "Passed" | "Failed" | undefined,
  });
  if (!parse.success) {
    return { success: false, error: { row: rowIdx, message: parse.error.issues[0]?.message ?? "Validation failed" } };
  }
  const data = parse.data;
  const staffProfileId = await findStaffByEmail(data.staffEmail);
  if (!staffProfileId) {
    return { success: false, error: { row: rowIdx, field: "staffEmail", message: `Staff not found: ${data.staffEmail}` } };
  }
  await db.insert(examDates).values({
    staffId: staffProfileId,
    examName: data.examName,
    scheduledDate: data.scheduledDate,
    status: data.status ?? "Scheduled",
  });
  return { success: true };
}

async function processOnboardingRow(
  rawRow: Record<string, string>,
  rowIdx: number,
): Promise<{ success: boolean; error?: { row: number; field?: string; message: string } }> {
  const parse = onboardingTaskRowSchema.safeParse({
    staffEmail: rawRow.staffEmail || rawRow.staff_email,
    taskName: rawRow.taskName || rawRow.task_name,
    category: rawRow.category,
    isCompleted: rawRow.isCompleted || rawRow.is_completed || undefined,
    completedAt: rawRow.completedAt || rawRow.completed_at || undefined,
    dueDate: rawRow.dueDate || rawRow.due_date || undefined,
  });
  if (!parse.success) {
    return { success: false, error: { row: rowIdx, message: parse.error.issues[0]?.message ?? "Validation failed" } };
  }
  const data = parse.data;
  const staffProfileId = await findStaffByEmail(data.staffEmail);
  if (!staffProfileId) {
    return { success: false, error: { row: rowIdx, field: "staffEmail", message: `Staff not found: ${data.staffEmail}` } };
  }
  await db.insert(onboardingTasks).values({
    staffId: staffProfileId,
    taskName: data.taskName,
    category: data.category,
    isCompleted: data.isCompleted === "true",
    completedAt: data.completedAt ? new Date(data.completedAt) : null,
    dueDate: data.dueDate ?? null,
  });
  return { success: true };
}

async function processPolicyRow(
  rawRow: Record<string, string>,
  rowIdx: number,
): Promise<{ success: boolean; error?: { row: number; field?: string; message: string } }> {
  const parse = policyRowSchema.safeParse({
    title: rawRow.title,
    contentText: rawRow.contentText || rawRow.content_text,
    documentUrl: rawRow.documentUrl || rawRow.document_url || undefined,
    lastUpdated: rawRow.lastUpdated || rawRow.last_updated,
  });
  if (!parse.success) {
    return { success: false, error: { row: rowIdx, message: parse.error.issues[0]?.message ?? "Validation failed" } };
  }
  const data = parse.data;
  await db.insert(companyPolicies).values({
    title: data.title,
    contentText: data.contentText,
    documentUrl: data.documentUrl ?? null,
    lastUpdated: data.lastUpdated,
  });
  return { success: true };
}

async function processFormRow(
  rawRow: Record<string, string>,
  rowIdx: number,
): Promise<{ success: boolean; error?: { row: number; field?: string; message: string } }> {
  const parse = formRowSchema.safeParse({
    title: rawRow.title,
    description: rawRow.description || undefined,
    category: rawRow.category,
    fileUrl: rawRow.fileUrl || rawRow.file_url,
    uploadedAt: rawRow.uploadedAt || rawRow.uploaded_at || undefined,
  });
  if (!parse.success) {
    return { success: false, error: { row: rowIdx, message: parse.error.issues[0]?.message ?? "Validation failed" } };
  }
  const data = parse.data;
  await db.insert(companyForms).values({
    title: data.title,
    description: data.description ?? null,
    category: data.category,
    fileUrl: data.fileUrl,
    uploadedAt: data.uploadedAt ? new Date(data.uploadedAt) : new Date(),
  });
  return { success: true };
}

// ── Router ────────────────────────────────────────────────────────────────

export const importRouter = {
  /** Execute a validated import. Rows are processed one at a time; failures are
   * recorded in the job errors array without aborting the whole batch. */
  execute: requireRole("staff", "import")
    .input(
    z.object({
        importType: z.enum([
          "staff",
          "training",
          "contracts",
          "work",
          "operations_work_update",
          "roster",
          "leave",
          "ppe",
          "attendance",
          "callouts",
          "appraisals",
          "calendar_events",
          "promotions",
          "exam_dates",
          "onboarding",
          "policy",
          "forms",
        ]),
        fileName: z.string().optional(),
        rows: z.array(z.record(z.string(), z.string())).max(500),
      }),
    )
    .handler(async ({ input, context }) => {
      const { importType, rows, fileName } = input;

      // Create job record
      const [job] = await db
        .insert(importJobs)
        .values({
          importType: importType as any,
          // extended import types are also accepted by the runtime router
          fileName: fileName ?? null,
          status: "running",
          totalRows: rows.length,
          createdByUserId: context.session.user.id,
        })
        .returning();
      if (!job) throw new Error("Import job creation failed");

      const errors: { row: number; field?: string; message: string }[] = [];
      let successCount = 0;
      const stagedStaffLinks: Array<{ profileId: string; reportsTo: string | null; row: number }> = [];

      for (let i = 0; i < rows.length; i++) {
        const row = rows[i]!;
        let result: ImportRowResult;

        try {
          switch (importType) {
            case "staff":
              result = await processStaffRow(row, i + 1, context.session.user.id, { deferReportsTo: true });
              if (result.success && result.meta?.staffProfileId) {
                stagedStaffLinks.push({
                  profileId: result.meta.staffProfileId,
                  reportsTo: result.meta.reportsTo ?? null,
                  row: i + 1,
                });
              }
              break;
            case "training":
              result = await processTrainingRow(row, i + 1);
              break;
            case "contracts":
              result = await processContractRow(row, i + 1);
              break;
            case "work":
              result = await processWorkRow(row, i + 1, context.session.user.id);
              break;
            case "operations_work_update":
              result = await processWorkRow(row, i + 1, context.session.user.id);
              break;
            case "roster":
              result = await processRosterRow(row, i + 1, context.session.user.id);
              break;
            case "leave":
              result = await processLeaveRow(row, i + 1);
              break;
            case "ppe":
              result = await processPpeRow(row, i + 1, context.session.user.id);
              break;
            case "attendance":
              result = await processAttendanceRow(row, i + 1, context.session.user.id);
              break;
            case "callouts":
              result = await processCalloutRow(row, i + 1, context.session.user.id);
              break;
            case "appraisals":
              result = await processAppraisalRow(row, i + 1, context.session.user.id);
              break;
            case "calendar_events":
              result = await processCalendarEventRow(row, i + 1);
              break;
            case "promotions":
              result = await processPromotionRow(row, i + 1);
              break;
            case "exam_dates":
              result = await processExamDateRow(row, i + 1);
              break;
            case "onboarding":
              result = await processOnboardingRow(row, i + 1);
              break;
            case "policy":
              result = await processPolicyRow(row, i + 1);
              break;
            case "forms":
              result = await processFormRow(row, i + 1);
              break;
            default:
              result = { success: false, error: { row: i + 1, message: "Unknown import type" } };
          }
        } catch (err) {
          result = {
            success: false,
            error: { row: i + 1, message: err instanceof Error ? err.message : "Unexpected error" },
          };
        }

        if (result.success) {
          successCount++;
        } else if (result.error) {
          errors.push(result.error);
        }
      }

      if (importType === "staff" && stagedStaffLinks.length > 0) {
        for (const staged of stagedStaffLinks) {
          if (!staged.reportsTo) continue;
          const reportsToId = await findStaffProfileByIdentifier(staged.reportsTo);
          if (!reportsToId) {
            errors.push({
              row: staged.row,
              field: "reportsTo",
              message: `Could not resolve reports_to reference: ${staged.reportsTo}`,
            });
            continue;
          }
          if (reportsToId === staged.profileId) {
            errors.push({
              row: staged.row,
              field: "reportsTo",
              message: "A staff member cannot report to themselves.",
            });
            continue;
          }

          await db
            .update(staffProfiles)
            .set({
              reportsTo: reportsToId,
              teamLeadId: reportsToId,
              updatedAt: new Date(),
            })
            .where(eq(staffProfiles.id, staged.profileId));
        }
      }

      const errorCount = errors.length;
      const status = errorCount === 0 ? "completed" : successCount > 0 ? "partial" : "failed";

      // Update job record
      const [updatedJob] = await db
        .update(importJobs)
        .set({
          status,
          successCount,
          errorCount,
          errors: errors.length > 0 ? errors : null,
          completedAt: new Date(),
        })
        .where(eq(importJobs.id, job.id))
        .returning();

      await logAudit({
        actorId: context.session.user.id,
        actorName: context.session.user.name,
        action: `import.${importType}.execute`,
        module: "import",
        resourceType: "import_job",
        resourceId: job.id,
        afterValue: { importType, totalRows: rows.length, successCount, errorCount, status } as Record<string, unknown>,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
        actorRole: context.userRole ?? undefined,
        correlationId: context.requestId,
      });

      return updatedJob;
    }),

  /** List past import runs, most recent first. */
  getHistory: protectedProcedure
    .input(
      z.object({
      limit: z.number().default(20),
      offset: z.number().default(0),
      importType: z
        .enum([
          "staff",
          "training",
          "contracts",
          "work",
          "operations_work_update",
          "roster",
          "platform_accounts",
          "leave",
          "ppe",
          "attendance",
          "callouts",
          "appraisals",
          "calendar_events",
          "promotions",
          "exam_dates",
          "onboarding",
          "policy",
          "forms",
        ])
        .optional(),
    }),
    )
    .handler(async ({ input }) => {
      const conditions = [];
      if (input.importType) {
        conditions.push(eq(importJobs.importType, input.importType));
      }

      return db.query.importJobs.findMany({
        where: conditions.length > 0 ? conditions[0] : undefined,
        with: { createdBy: true },
        orderBy: (t, { desc }) => [desc(t.createdAt)],
        limit: input.limit,
        offset: input.offset,
      });
    }),
};
