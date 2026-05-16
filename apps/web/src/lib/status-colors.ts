/**
 * Central semantic status-color system — single source of truth for every
 * status badge, legend, gantt bar, kanban accent and chart colour in the app.
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * Status colours used to be defined inline in every route file. Different
 * statuses across modules ended up sharing the same colour (blue meant
 * "approved" AND "todo" AND "done" AND "WFH"), so legends and badges were
 * ambiguous. This module assigns ONE distinct hue per semantic family and is
 * imported everywhere, so a given hue always means the same thing.
 *
 * DESIGN CONSTRAINTS (CLAUDE.md)
 * - Blue/indigo is the primary palette. NO green/emerald Tailwind classes.
 * - "Present / active / available" is NOT green here — it maps to the primary
 *   blue family. In attendance grids it is contrasted against rose (on leave),
 *   orange (late) and red (absent), which keeps every status distinguishable.
 * - All class strings are LITERAL — Tailwind cannot see runtime-built strings,
 *   so every tone spells out its full class set.
 *
 * USAGE
 *   import { statusTone, leaveTypeTone } from "@/lib/status-colors";
 *   const t = statusTone("approved");
 *   <span className={t.badge}>Approved</span>          // pill badge
 *   <div className={t.bar} />                          // gantt / progress bar
 *   <div className={`border-l-2 ${t.border}`} />       // kanban card accent
 *   <Cell fill={t.hex} />                              // recharts categorical
 */

export interface StatusTone {
  /** Combined pill badge: background + text, light + dark. */
  badge: string;
  /** Background-only classes (light + dark) — for cells where text is separate. */
  bg: string;
  /** Text-only classes (light + dark). */
  text: string;
  /** Solid fill for gantt bars / progress bars. */
  bar: string;
  /** Left-border accent for kanban cards (`border-l-*`). */
  border: string;
  /** Solid dot for legends. */
  dot: string;
  /** Categorical chart hex (recharts `Cell` / stroke / fill). */
  hex: string;
}

export type ToneName =
  | "blue"
  | "indigo"
  | "amber"
  | "red"
  | "slate"
  | "rose"
  | "orange"
  | "sky"
  | "violet"
  | "purple"
  | "pink"
  | "cyan"
  | "neutral";

/**
 * The hue palette. Each tone is fully literal so Tailwind's JIT keeps the
 * classes. One hue = one meaning (see the domain maps below).
 */
export const TONES: Record<ToneName, StatusTone> = {
  // Positive / approved / done / completed / present / active
  blue: {
    badge: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
    bg: "bg-blue-100 dark:bg-blue-900/40",
    text: "text-blue-700 dark:text-blue-300",
    bar: "bg-blue-500",
    border: "border-l-blue-500",
    dot: "bg-blue-500",
    hex: "#3b82f6",
  },
  // In-progress / active work
  indigo: {
    badge: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300",
    bg: "bg-indigo-100 dark:bg-indigo-900/40",
    text: "text-indigo-700 dark:text-indigo-300",
    bar: "bg-indigo-500",
    border: "border-l-indigo-500",
    dot: "bg-indigo-500",
    hex: "#6366f1",
  },
  // Pending / awaiting approval / review / warning
  amber: {
    badge: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
    bg: "bg-amber-100 dark:bg-amber-900/40",
    text: "text-amber-700 dark:text-amber-300",
    bar: "bg-amber-500",
    border: "border-l-amber-500",
    dot: "bg-amber-500",
    hex: "#f59e0b",
  },
  // Rejected / blocked / failed / error / absent
  red: {
    badge: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
    bg: "bg-red-100 dark:bg-red-900/40",
    text: "text-red-700 dark:text-red-300",
    bar: "bg-red-500",
    border: "border-l-red-500",
    dot: "bg-red-500",
    hex: "#ef4444",
  },
  // Cancelled / archived / inactive / backlog
  slate: {
    badge: "bg-slate-100 text-slate-600 dark:bg-slate-800/60 dark:text-slate-300",
    bg: "bg-slate-100 dark:bg-slate-800/60",
    text: "text-slate-600 dark:text-slate-300",
    bar: "bg-slate-400",
    border: "border-l-slate-400",
    dot: "bg-slate-400",
    hex: "#94a3b8",
  },
  // On leave / out of office
  rose: {
    badge: "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300",
    bg: "bg-rose-100 dark:bg-rose-900/40",
    text: "text-rose-700 dark:text-rose-300",
    bar: "bg-rose-500",
    border: "border-l-rose-500",
    dot: "bg-rose-500",
    hex: "#f43f5e",
  },
  // Late / tardy
  orange: {
    badge: "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300",
    bg: "bg-orange-100 dark:bg-orange-900/40",
    text: "text-orange-700 dark:text-orange-300",
    bar: "bg-orange-500",
    border: "border-l-orange-500",
    dot: "bg-orange-500",
    hex: "#f97316",
  },
  // WFH / remote
  sky: {
    badge: "bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300",
    bg: "bg-sky-100 dark:bg-sky-900/40",
    text: "text-sky-700 dark:text-sky-300",
    bar: "bg-sky-500",
    border: "border-l-sky-500",
    dot: "bg-sky-500",
    hex: "#0ea5e9",
  },
  // Training / development / annual leave
  violet: {
    badge: "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300",
    bg: "bg-violet-100 dark:bg-violet-900/40",
    text: "text-violet-700 dark:text-violet-300",
    bar: "bg-violet-500",
    border: "border-l-violet-500",
    dot: "bg-violet-500",
    hex: "#8b5cf6",
  },
  // Compassionate / special
  purple: {
    badge: "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300",
    bg: "bg-purple-100 dark:bg-purple-900/40",
    text: "text-purple-700 dark:text-purple-300",
    bar: "bg-purple-500",
    border: "border-l-purple-500",
    dot: "bg-purple-500",
    hex: "#a855f7",
  },
  // Maternity / paternity
  pink: {
    badge: "bg-pink-100 text-pink-700 dark:bg-pink-900/40 dark:text-pink-300",
    bg: "bg-pink-100 dark:bg-pink-900/40",
    text: "text-pink-700 dark:text-pink-300",
    bar: "bg-pink-500",
    border: "border-l-pink-500",
    dot: "bg-pink-500",
    hex: "#ec4899",
  },
  // To-do / new / planned / backlog
  cyan: {
    badge: "bg-cyan-100 text-cyan-700 dark:bg-cyan-900/40 dark:text-cyan-300",
    bg: "bg-cyan-100 dark:bg-cyan-900/40",
    text: "text-cyan-700 dark:text-cyan-300",
    bar: "bg-cyan-500",
    border: "border-l-cyan-500",
    dot: "bg-cyan-500",
    hex: "#06b6d4",
  },
  // De-emphasised / muted (cancelled rows, empty states)
  neutral: {
    badge: "bg-muted text-muted-foreground",
    bg: "bg-muted",
    text: "text-muted-foreground",
    bar: "bg-muted-foreground/40",
    border: "border-l-muted-foreground/40",
    dot: "bg-muted-foreground/50",
    hex: "#9ca3af",
  },
};

/* ───────────────────────── Domain maps ─────────────────────────────────
 * Each map points a domain's status strings at a tone. A hue means the same
 * thing across every module: blue = positive/done, amber = pending, etc.
 * Within a single view every status here resolves to a distinct hue.
 * ----------------------------------------------------------------------- */

/** Workflow statuses shared by leave, timesheets, procurement, advances, appraisals. */
export const WORKFLOW_STATUS_TONE: Record<string, ToneName> = {
  approved: "blue",
  signed: "blue",
  completed: "blue",
  published: "blue",
  active: "blue",
  pending: "amber",
  submitted: "amber",
  awaiting: "amber",
  in_review: "amber",
  rejected: "red",
  declined: "red",
  overdue: "red",
  cancelled: "neutral",
  canceled: "neutral",
  withdrawn: "neutral",
  archived: "slate",
  draft: "cyan",
};

/** Work-item kanban statuses — seven distinct hues so the board reads clearly. */
export const WORK_STATUS_TONE: Record<string, ToneName> = {
  backlog: "slate",
  todo: "cyan",
  in_progress: "indigo",
  blocked: "red",
  review: "amber",
  done: "blue",
  cancelled: "neutral",
};

/** Work-item / generic priority. */
export const PRIORITY_TONE: Record<string, ToneName> = {
  low: "slate",
  medium: "sky",
  high: "amber",
  critical: "red",
};

/** Incident lifecycle — seven distinct hues. */
export const INCIDENT_STATUS_TONE: Record<string, ToneName> = {
  detected: "red",
  investigating: "orange",
  identified: "amber",
  mitigating: "indigo",
  resolved: "blue",
  post_mortem: "violet",
  closed: "slate",
};

/** Incident / alert severity (sev1 = highest). */
export const SEVERITY_TONE: Record<string, ToneName> = {
  sev1: "red",
  sev2: "orange",
  sev3: "amber",
  sev4: "neutral",
};

/** Attendance / roll-call statuses. "Present" is primary blue (no green). */
export const ATTENDANCE_STATUS_TONE: Record<string, ToneName> = {
  present: "blue",
  on_site: "blue",
  workday: "blue",
  wfh: "sky",
  work_from_home: "sky",
  on_leave: "rose",
  annual_leave: "rose",
  late: "orange",
  half_day: "amber",
  training: "violet",
  compassionate: "purple",
  maternity_paternity: "pink",
  sick: "red",
  absent: "red",
  off: "slate",
  holiday: "slate",
};

/** Generic lifecycle for staff / services / accounts / contracts. */
export const LIFECYCLE_STATUS_TONE: Record<string, ToneName> = {
  active: "blue",
  on_leave: "rose",
  inactive: "slate",
  terminated: "neutral",
  expired: "red",
  expiring: "amber",
  pending_creation: "amber",
  disabled: "red",
  orphaned: "red",
  error: "red",
  synced: "blue",
};

/** Resolve any status string to its tone. Falls back to neutral. */
export function statusTone(
  status: string | null | undefined,
  map: Record<string, ToneName> = WORKFLOW_STATUS_TONE,
): StatusTone {
  if (!status) return TONES.neutral;
  const key = status.toLowerCase().replace(/[\s-]+/g, "_");
  return TONES[map[key] ?? "neutral"];
}

/* ──────────────────────── Leave types ──────────────────────────────────
 * Leave *type* is a separate semantic axis from leave *request status*.
 * This is the single place purple/violet/pink are defined for leave.
 * ----------------------------------------------------------------------- */

export type LeaveCode = "A" | "S" | "M" | "C" | "H" | "W" | "O";

/** Leave-type code → tone. */
export const LEAVE_TYPE_TONE: Record<LeaveCode, ToneName> = {
  A: "violet", // Annual
  S: "red", // Sick
  M: "pink", // Maternity / Paternity
  C: "purple", // Compassionate
  H: "amber", // Half day
  W: "sky", // Work from home
  O: "slate", // Other
};

export const LEAVE_CODE_LABEL: Record<LeaveCode, string> = {
  A: "Annual",
  S: "Sick",
  M: "Mat / Pat",
  C: "Compassionate",
  H: "Half Day",
  W: "WFH",
  O: "Other",
};

/** Resolve a leave-type code (or name) to its tone. */
export function leaveTypeTone(code: LeaveCode): StatusTone {
  return TONES[LEAVE_TYPE_TONE[code]];
}

/** Map a free-text leave-type name to its single-letter code. */
export function leaveCodeFromName(name: string | null | undefined): LeaveCode {
  const n = (name ?? "").toLowerCase().trim();
  if (n.startsWith("annual") || n.startsWith("vacation")) return "A";
  if (n.startsWith("sick")) return "S";
  if (n.startsWith("matern") || n.startsWith("patern") || n.startsWith("mat"))
    return "M";
  if (n.startsWith("compassion") || n.startsWith("bereave")) return "C";
  if (n.startsWith("half")) return "H";
  if (n.startsWith("wfh") || n.includes("work from home")) return "W";
  return "O";
}

/** A legend entry: one swatch + label. */
export interface LegendItem {
  label: string;
  tone: StatusTone;
}

/** Build legend items from a domain map (preserves insertion order). */
export function legendFromMap(
  map: Record<string, ToneName>,
  labels?: Record<string, string>,
): LegendItem[] {
  return Object.entries(map).map(([key, tone]) => ({
    label:
      labels?.[key] ??
      key
        .replace(/_/g, " ")
        .replace(/\b\w/g, (c) => c.toUpperCase()),
    tone: TONES[tone],
  }));
}
