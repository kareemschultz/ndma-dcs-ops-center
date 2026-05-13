import { cn } from "@ndma-dcs-staff-portal/ui/lib/utils";

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

const statusConfig: Record<WorkStatus, { label: string; className: string }> = {
  backlog: { label: "Backlog", className: "bg-muted text-muted-foreground" },
  todo: { label: "To Do", className: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300" },
  in_progress: { label: "In Progress", className: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300" },
  blocked: { label: "Blocked", className: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300" },
  review: { label: "Review", className: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300" },
  done: { label: "Done", className: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300" },
  cancelled: { label: "Cancelled", className: "bg-muted text-muted-foreground line-through" },
};

const priorityConfig: Record<WorkPriority, { label: string; className: string }> = {
  low: { label: "Low", className: "bg-muted text-muted-foreground" },
  medium: { label: "Medium", className: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300" },
  high: { label: "High", className: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300" },
  critical: { label: "Critical", className: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300" },
};

const typeConfig: Record<WorkType, { label: string }> = {
  routine: { label: "Routine" },
  project: { label: "Project" },
  external_request: { label: "External" },
  ad_hoc: { label: "Ad Hoc" },
};

function StatusBadge({ status }: { status: WorkStatus }) {
  const cfg = statusConfig[status] ?? statusConfig.backlog;
  return (
    <span className={cn("inline-flex items-center rounded-lg px-2 py-0.5 text-xs font-medium", cfg.className)}>
      {cfg.label}
    </span>
  );
}

function PriorityBadge({ priority }: { priority: WorkPriority }) {
  const cfg = priorityConfig[priority] ?? priorityConfig.medium;
  return (
    <span className={cn("inline-flex items-center rounded-lg px-2 py-0.5 text-xs font-medium", cfg.className)}>
      {cfg.label}
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
