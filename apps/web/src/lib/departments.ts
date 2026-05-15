/**
 * Department display helpers.
 *
 * In the NDMA org chart the real top-level departments are DCS, NOC, HR, etc.
 * ASN, Enterprise and Core are NOT peer departments — they are logical
 * sub-divisions *within* DCS (rows whose `parentId` points at DCS).
 *
 * `orpc.staff.getDepartments` returns the list already sorted hierarchically
 * (each parent immediately followed by its children). These helpers render the
 * nesting so sub-divisions never look like peers of their parent.
 */

export type DepartmentOption = {
  id: string;
  name: string;
  code: string;
  parentId: string | null;
};

/** A sub-division (has a parent) is shown indented under its parent. */
export function isSubDepartment(dept: { parentId: string | null }): boolean {
  return dept.parentId != null;
}

/** Label for a `<select>` <option> — sub-divisions get an indent prefix. */
export function departmentOptionLabel(
  dept: DepartmentOption,
  opts?: { withCode?: boolean },
): string {
  const base = opts?.withCode ? `${dept.code} - ${dept.name}` : dept.name;
  return isSubDepartment(dept) ? `   ${base}` : base;
}

/**
 * Compact label for filter pills / chips where indentation doesn't render.
 * A sub-division is shown as "PARENTCODE / Name" (e.g. "DCS / ASN") so it
 * never looks like a peer department.
 */
export function departmentPillLabel(
  dept: DepartmentOption,
  all: DepartmentOption[],
): string {
  if (!isSubDepartment(dept)) return dept.name;
  const parent = all.find((d) => d.id === dept.parentId);
  return parent ? `${parent.code} / ${dept.name}` : dept.name;
}

/**
 * Resolve a selected department to the set of IDs that should be matched when
 * filtering staff: the department itself plus *all* of its descendant
 * sub-divisions (recursive). Selecting a parent (e.g. DCS) therefore includes
 * everyone in DCS and every DCS sub-division (ASN / Enterprise / Core …).
 */
export function descendantDepartmentIds(
  rootId: string,
  all: DepartmentOption[],
): string[] {
  const ids = new Set<string>([rootId]);
  let added = true;
  while (added) {
    added = false;
    for (const d of all) {
      if (d.parentId && ids.has(d.parentId) && !ids.has(d.id)) {
        ids.add(d.id);
        added = true;
      }
    }
  }
  return [...ids];
}
