/**
 * FormerTag — a small "Former" chip shown next to the name of a staff member
 * who no longer works at NDMA (status `inactive` or `terminated`).
 *
 * Historical records (leave, TOSD, lateness, appraisals) still reference
 * ex-staff, so their rows stay visible but are gently marked.
 */
import { cn } from "@ndma-dcs-staff-portal/ui/lib/utils";

/** True when a staff status string means the person has left NDMA. */
export function isFormerStatus(status: string | null | undefined): boolean {
  return status === "inactive" || status === "terminated";
}

export function FormerTag({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "ml-1.5 inline-flex items-center rounded bg-muted px-1.5 py-0.5 align-middle text-[10px] font-medium text-muted-foreground",
        className,
      )}
    >
      Former
    </span>
  );
}
