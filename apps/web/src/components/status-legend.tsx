/**
 * StatusLegend — a compact, consistent legend strip for register pages.
 *
 * Every list/board/gantt page should render one so the meaning of each
 * status colour is always visible. Pair it with the tones from
 * `@/lib/status-colors` so the swatch colour always matches the badges.
 *
 * Usage:
 *   import { StatusLegend } from "@/components/status-legend";
 *   import { legendFromMap, WORK_STATUS_TONE } from "@/lib/status-colors";
 *
 *   <StatusLegend items={legendFromMap(WORK_STATUS_TONE)} />
 */
import { cn } from "@ndma-dcs-staff-portal/ui/lib/utils";
import type { LegendItem } from "@/lib/status-colors";

interface StatusLegendProps {
  items: LegendItem[];
  /** Optional heading shown before the swatches. */
  label?: string;
  className?: string;
}

export function StatusLegend({ items, label, className }: StatusLegendProps) {
  if (items.length === 0) return null;
  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[11px] text-muted-foreground",
        className,
      )}
    >
      {label && <span className="font-medium uppercase tracking-wide">{label}</span>}
      {items.map((it) => (
        <span key={it.label} className="inline-flex items-center gap-1.5">
          <span
            className={cn("size-2.5 shrink-0 rounded-sm", it.tone.dot)}
            aria-hidden
          />
          {it.label}
        </span>
      ))}
    </div>
  );
}
