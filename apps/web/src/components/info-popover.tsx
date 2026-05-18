/**
 * InfoPopover — a small `?` info button that opens a short explanatory popover.
 *
 * Use it next to a label or control whose purpose is not self-evident.
 *
 * Usage:
 *   import { InfoPopover } from "@/components/info-popover";
 *
 *   <label>
 *     Risk Level
 *     <InfoPopover>Set automatically from exposure…</InfoPopover>
 *   </label>
 */
import { Info } from "lucide-react";
import type { ReactNode } from "react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@ndma-dcs-staff-portal/ui/components/popover";
import { cn } from "@ndma-dcs-staff-portal/ui/lib/utils";

interface InfoPopoverProps {
  /** The explanatory text shown inside the popover. */
  children: ReactNode;
  /** Accessible label for the trigger button. Defaults to "More information". */
  label?: string;
  className?: string;
}

export function InfoPopover({ children, label, className }: InfoPopoverProps) {
  return (
    <Popover>
      <PopoverTrigger
        type="button"
        aria-label={label ?? "More information"}
        className={cn(
          "inline-flex size-3.5 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          className,
        )}
      >
        <Info className="size-3.5" aria-hidden />
      </PopoverTrigger>
      <PopoverContent className="max-w-xs text-sm">{children}</PopoverContent>
    </Popover>
  );
}
