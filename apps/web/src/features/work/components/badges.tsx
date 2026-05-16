import { cn } from "@ndma-dcs-staff-portal/ui/lib/utils";
import { TONES, WORK_STATUS_TONE, PRIORITY_TONE } from "@/lib/status-colors";

type WorkStatus =
  | "backlog"
  | "todo"
  | "in_progress"
  | "blocked"
  | "review"
  | "done"
  | "cancelled";

type WorkPriority = "low" | "medium" | "high" | "critical";

type WorkType = "routine" | "project" | "external_request" | "ad_hoc";

// Labels only — colours come from the central status-color system so a hue
// always means the same thing across the app (see @/lib/status-colors).
const statusLabel: Record<WorkStatus, string> = {
  backlog: "Backlog",
  todo: "To Do",
  in_progress: "In Progress",
  blocked: "Blocked",
  review: "Review",
  done: "Done",
  cancelled: "Cancelled",
};

const priorityLabel: Record<WorkPriority, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
  critical: "Critical",
};

const typeConfig: Record<WorkType, { label: string }> = {
  routine: { label: "Routine" },
  project: { label: "Project" },
  external_request: { label: "External" },
  ad_hoc: { label: "Ad Hoc" },
};

function StatusBadge({ status }: { status: WorkStatus }) {
  const tone = TONES[WORK_STATUS_TONE[status] ?? "neutral"];
  const label = statusLabel[status] ?? status;
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-lg px-2 py-0.5 text-xs font-medium",
        tone.badge,
        status === "cancelled" && "line-through",
      )}
    >
      {label}
    </span>
  );
}

function PriorityBadge({ priority }: { priority: WorkPriority }) {
  const tone = TONES[PRIORITY_TONE[priority] ?? "neutral"];
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-lg px-2 py-0.5 text-xs font-medium",
        tone.badge,
      )}
    >
      {priorityLabel[priority] ?? priority}
    </span>
  );
}

function TypeBadge({ type }: { type: WorkType }) {
  const cfg = typeConfig[type] ?? typeConfig.routine;
  return (
    <span className="inline-flex items-center rounded-lg border px-2 py-0.5 text-xs font-medium text-muted-foreground">
      {cfg.label}
    </span>
  );
}

export { StatusBadge, PriorityBadge, TypeBadge };
export type { WorkStatus, WorkPriority, WorkType };
