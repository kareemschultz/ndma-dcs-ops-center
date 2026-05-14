// Exact replica from shadcn-admin/src/components/layout/main.tsx
import { cn } from "@ndma-dcs-staff-portal/ui/lib/utils";

type MainProps = React.HTMLAttributes<HTMLElement> & {
  fixed?: boolean;
  fluid?: boolean;
  ref?: React.Ref<HTMLElement>;
};

export function Main({ fixed, className, fluid, ...props }: MainProps) {
  return (
    <main
      data-layout={fixed ? "fixed" : "auto"}
      className={cn(
        // Warm-grey wash per design handoff §4 — lifts white cards visually
        "bg-ink-50/60 px-6 py-6 dark:bg-ink-950",
        // If layout is fixed, make the main container flex and grow
        fixed && "flex grow flex-col overflow-hidden",
        // If layout is not fluid, set the max-width
        !fluid &&
          "@7xl/content:mx-auto @7xl/content:w-full @7xl/content:max-w-7xl",
        className
      )}
      {...props}
    />
  );
}
