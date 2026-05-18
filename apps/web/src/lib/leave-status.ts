/**
 * Derived leave status — single source of truth for how a leave request's
 * status is *displayed* to users.
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * The DB `leave_requests.status` column only stores the workflow state:
 *   pending | approved | rejected | cancelled
 * There is intentionally NO "completed" value in the enum, and no migration
 * adds one — "completed" is a *display-only* derivation.
 *
 * THE RULE
 * --------
 * A leave request whose `status === "approved"` AND whose `endDate` is in the
 * past (strictly before today) is shown as **"Completed"** — the staff member
 * has already taken that leave. An approved request that is still ongoing or
 * in the future stays **"Approved"**.
 *
 * "completed" is NEVER written to the DB and is NEVER a selectable action.
 * Approving / rejecting / cancelling still operate on the real DB statuses.
 *
 * SPLIT LEAVE
 * -----------
 * Each leave request is an independent row. A staff member who splits annual
 * leave into two trips has two separate requests — each is evaluated on its
 * own `endDate`, so one half can read "Completed" while the other reads
 * "Approved". Totals must SUM all of a staff member's requests.
 */

import { parseISO } from "date-fns";
import { TONES, type StatusTone } from "@/lib/status-colors";

/** The DB-backed leave workflow statuses. */
export type LeaveDbStatus = "pending" | "approved" | "rejected" | "cancelled";

/** The displayed status — adds the derived "completed". */
export type EffectiveLeaveStatus =
  | "pending"
  | "approved"
  | "completed"
  | "rejected"
  | "cancelled";

/**
 * Derive the user-facing status from the DB status + end date.
 *
 * @param status  the raw DB status string
 * @param endDate the request's end date — ISO string (`"2026-04-12"`) or Date
 * @param now     reference "today" (defaults to the current date) — testable
 */
export function effectiveLeaveStatus(
  status: string | null | undefined,
  endDate: string | Date | null | undefined,
  now: Date = new Date(),
): EffectiveLeaveStatus {
  const raw = (status ?? "").toLowerCase().trim();

  if (raw === "approved" && endDate) {
    const end = typeof endDate === "string" ? parseISO(endDate) : endDate;
    if (!Number.isNaN(end.getTime())) {
      // Compare on calendar day — an approved leave that ended on any prior
      // day counts as completed; one ending today or later stays approved.
      const endDay = new Date(end.getFullYear(), end.getMonth(), end.getDate());
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      if (endDay.getTime() < today.getTime()) return "completed";
    }
    return "approved";
  }

  if (
    raw === "pending" ||
    raw === "approved" ||
    raw === "rejected" ||
    raw === "cancelled"
  ) {
    return raw;
  }
  // Unknown / legacy values fall through unchanged-ish.
  return (raw || "pending") as EffectiveLeaveStatus;
}

/** Human-readable label for each effective status. */
export const EFFECTIVE_LEAVE_STATUS_LABELS: Record<
  EffectiveLeaveStatus,
  string
> = {
  pending: "Pending",
  approved: "Approved",
  completed: "Completed",
  rejected: "Rejected",
  cancelled: "Cancelled",
};

/**
 * Tone name per effective status.
 * - pending   → amber  (awaiting action)
 * - approved  → blue   (active / upcoming)
 * - completed → slate  (calm, finished — clearly distinct from active blue
 *                       and from cancelled neutral/muted)
 * - rejected  → red
 * - cancelled → neutral (de-emphasised)
 */
export const EFFECTIVE_LEAVE_STATUS_TONE: Record<
  EffectiveLeaveStatus,
  StatusTone
> = {
  pending: TONES.amber,
  approved: TONES.blue,
  completed: TONES.slate,
  rejected: TONES.red,
  cancelled: TONES.neutral,
};

/** Convenience: tone for a (status, endDate) pair. */
export function effectiveLeaveTone(
  status: string | null | undefined,
  endDate: string | Date | null | undefined,
  now?: Date,
): StatusTone {
  return EFFECTIVE_LEAVE_STATUS_TONE[effectiveLeaveStatus(status, endDate, now)];
}

/** Convenience: label for a (status, endDate) pair. */
export function effectiveLeaveLabel(
  status: string | null | undefined,
  endDate: string | Date | null | undefined,
  now?: Date,
): string {
  return EFFECTIVE_LEAVE_STATUS_LABELS[
    effectiveLeaveStatus(status, endDate, now)
  ];
}

/** All effective statuses in display order — for filters, legends, boards. */
export const EFFECTIVE_LEAVE_STATUS_ORDER: EffectiveLeaveStatus[] = [
  "pending",
  "approved",
  "completed",
  "rejected",
  "cancelled",
];
