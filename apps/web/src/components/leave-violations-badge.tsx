// Leave Violations Badge
// ======================
// ADD to leave/index.tsx request table to show policy violations inline
//
// Usage in the request TableRow (next to the Status column):
//   <TableCell><LeaveViolationsBadge violations={r.violations} /></TableCell>
//
// The `violations` field is jsonb on leave_requests — populated by orpc.leave.validateRequest
// Schema shape (from leave.ts): violations: jsonb — array of violation objects

import { AlertTriangle } from "lucide-react";

type Violation = {
  rule: string;
  message: string;
  severity?: "error" | "warning";
};

export function LeaveViolationsBadge({
  violations,
}: {
  violations?: Violation[] | null | unknown;
}) {
  const list = Array.isArray(violations) ? (violations as Violation[]) : [];
  if (!list.length) return null;

  const hasErrors   = list.some((v) => !v.severity || v.severity === "error");
  const clsBadge    = hasErrors
    ? "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300"
    : "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300";

  return (
    <div className="group relative inline-flex">
      <span
        className={`inline-flex cursor-help items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-semibold ${clsBadge}`}
        title={list.map((v) => v.message).join("\n")}
      >
        <AlertTriangle className="size-3" />
        {list.length} violation{list.length > 1 ? "s" : ""}
      </span>

      {/* Tooltip popover — hover to see detail */}
      <div className="pointer-events-none absolute bottom-full left-0 z-50 mb-1.5 hidden w-64 rounded-lg border bg-popover p-3 shadow-lg group-hover:block">
        <p className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Policy violations
        </p>
        <ul className="space-y-1">
          {list.map((v, i) => (
            <li key={i} className={`text-xs ${v.severity === "error" ? "text-red-700 dark:text-red-300" : "text-amber-700 dark:text-amber-300"}`}>
              • {v.message}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

// ── How to add to leave/index.tsx ────────────────────────────────────────────
//
// 1. Import at top:
//    import { LeaveViolationsBadge } from "@/components/leave-violations-badge";
//
// 2. Add a "Violations" column to the TableHeader:
//    <TableHead>Violations</TableHead>
//
// 3. Add to each TableRow (after Status cell):
//    <TableCell>
//      <LeaveViolationsBadge violations={r.violations} />
//    </TableCell>
//
// 4. The `violations` field should already be returned by orpc.leave.requests.list
//    if the server includes it. If not, add it to the select in the list procedure.
