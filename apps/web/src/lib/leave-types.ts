export const LEAVE_TYPE_ORDER = [
  "Annual Leave",
  "Sick Leave",
  "Maternity Leave",
  "Study Leave",
  "Emergency",
  "No Pay",
  "Special Leave",
] as const;

const HIDDEN_LEAVE_TYPE_NAMES = new Set(["Compassionate", "Compassionate Leave"]);

export function getLeaveTypeDisplayName(name: string): string {
  if (name === "Special") return "Special Leave";
  return name;
}

export function isVisibleLeaveType(name: string): boolean {
  return !HIDDEN_LEAVE_TYPE_NAMES.has(name);
}

export function sortLeaveTypesByCanonicalOrder(
  left: { name: string },
  right: { name: string },
): number {
  const leftName = getLeaveTypeDisplayName(left.name);
  const rightName = getLeaveTypeDisplayName(right.name);
  const leftIndex = LEAVE_TYPE_ORDER.indexOf(leftName as (typeof LEAVE_TYPE_ORDER)[number]);
  const rightIndex = LEAVE_TYPE_ORDER.indexOf(rightName as (typeof LEAVE_TYPE_ORDER)[number]);

  const leftRank = leftIndex === -1 ? LEAVE_TYPE_ORDER.length : leftIndex;
  const rightRank = rightIndex === -1 ? LEAVE_TYPE_ORDER.length : rightIndex;

  return leftRank - rightRank || leftName.localeCompare(rightName);
}
