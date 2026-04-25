import { and, eq } from "drizzle-orm";

import type { Context } from "../context";
import { db, departmentAssignments, departments, staffProfiles } from "@ndma-dcs-staff-portal/db";

const MANAGEMENT_ASSIGNMENT_ROLES = new Set(["manager", "pa", "supervisor"]);

type DepartmentNode = {
  id: string;
  parentId: string | null;
};

type DepartmentAssignmentRow = {
  id: string;
  staffProfileId: string;
  departmentId: string;
  role: string;
  isActive: boolean;
};

async function loadDepartmentGraph() {
  const rows = await db.select({ id: departments.id, parentId: departments.parentId }).from(departments);
  const byId = new Map<string, DepartmentNode>();

  for (const row of rows) {
    byId.set(row.id, row);
  }

  return byId;
}

function isSameOrDescendant(
  graph: Map<string, DepartmentNode>,
  departmentId: string,
  ancestorDepartmentId: string,
) {
  let current: string | null | undefined = departmentId;

  while (current) {
    if (current === ancestorDepartmentId) {
      return true;
    }
    current = graph.get(current)?.parentId ?? null;
  }

  return false;
}

export async function getCallerStaffProfile(context: Context) {
  if (!context.session?.user?.id) {
    return null;
  }

  return db.query.staffProfiles.findFirst({
    where: eq(staffProfiles.userId, context.session.user.id),
    with: {
      department: true,
      user: true,
    },
  });
}

export async function getCallerDepartmentRoles(context: Context) {
  const caller = await getCallerStaffProfile(context);
  if (!caller) {
    return [];
  }

  return db.query.departmentAssignments.findMany({
    where: and(
      eq(departmentAssignments.staffProfileId, caller.id),
      eq(departmentAssignments.isActive, true),
    ),
    with: {
      department: true,
    },
    orderBy: (table, { asc }) => [asc(table.createdAt)],
  });
}

export async function getDirectReports(context: Context) {
  const caller = await getCallerStaffProfile(context);
  if (!caller) {
    return [];
  }

  return db.query.staffProfiles.findMany({
    where: eq(staffProfiles.reportsTo, caller.id),
    with: {
      department: true,
      user: true,
    },
    orderBy: (table, { asc }) => [asc(table.jobTitle), asc(table.employeeId)],
  });
}

export async function getManagedStaffIds(context: Context) {
  const caller = await getCallerStaffProfile(context);
  if (!caller) {
    return [];
  }

  const role = context.userRole ?? "";
  if (role === "admin" || role === "hrAdminOps") {
    const rows = await db.select({ id: staffProfiles.id }).from(staffProfiles);
    return rows.map((row) => row.id);
  }

  const graph = await loadDepartmentGraph();
  const assignments = await getCallerDepartmentRoles(context);
  const directReports = await getDirectReports(context);
  const directReportIds = new Set(directReports.map((row) => row.id));
  const accessibleDepartments = new Set<string>();

  for (const assignment of assignments as DepartmentAssignmentRow[]) {
    if (!assignment.isActive || !MANAGEMENT_ASSIGNMENT_ROLES.has(assignment.role)) {
      continue;
    }

    for (const dept of graph.values()) {
      if (isSameOrDescendant(graph, dept.id, assignment.departmentId)) {
        accessibleDepartments.add(dept.id);
      }
    }
  }

  const staffRows = await db.select({
    id: staffProfiles.id,
    departmentId: staffProfiles.departmentId,
    reportsTo: staffProfiles.reportsTo,
  }).from(staffProfiles);

  const managedIds = new Set<string>();
  for (const row of staffRows) {
    if (
      accessibleDepartments.has(row.departmentId) ||
      directReportIds.has(row.id) ||
      row.reportsTo === caller.id
    ) {
      managedIds.add(row.id);
    }
  }

  return [...managedIds];
}

export async function canAccessStaffPrivate(
  context: Context,
  staffProfileId: string,
) {
  const caller = await getCallerStaffProfile(context);
  if (!caller) {
    return false;
  }

  if (context.userRole === "admin" || context.userRole === "hrAdminOps") {
    return true;
  }

  if (caller.id === staffProfileId) {
    return true;
  }

  const target = await db.query.staffProfiles.findFirst({
    where: eq(staffProfiles.id, staffProfileId),
    with: {
      department: true,
    },
  });

  if (!target) {
    return false;
  }

  if (target.reportsTo === caller.id) {
    return true;
  }

  const graph = await loadDepartmentGraph();
  const assignments = await getCallerDepartmentRoles(context);

  for (const assignment of assignments) {
    if (!assignment.isActive || !MANAGEMENT_ASSIGNMENT_ROLES.has(assignment.role)) {
      continue;
    }

    if (isSameOrDescendant(graph, target.departmentId, assignment.departmentId)) {
      return true;
    }
  }

  return false;
}
