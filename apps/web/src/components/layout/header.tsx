// Top header bar — NDMA design handoff §4 Layout Shell
// h-14, white/80 backdrop-blur, ink borders. SidebarTrigger stays for mobile.
// Pages pass children (title + right-aligned cluster with ms-auto).
// Optional `breadcrumbs` prop renders a Group / Page nav with chevron-right separators.
import { useEffect, useState } from "react";
import { ChevronRight } from "lucide-react";
import { cn } from "@ndma-dcs-staff-portal/ui/lib/utils";
import { Separator } from "@ndma-dcs-staff-portal/ui/components/separator";
import { SidebarTrigger } from "@ndma-dcs-staff-portal/ui/components/sidebar";
import { DepartmentFilter } from "./department-filter";

type HeaderProps = React.HTMLAttributes<HTMLElement> & {
  fixed?: boolean;
  breadcrumbs?: string[];
  ref?: React.Ref<HTMLElement>;
};

export function Header({
  className,
  fixed,
  breadcrumbs,
  children,
  ...props
}: HeaderProps) {
  const [offset, setOffset] = useState(0);

  useEffect(() => {
    const onScroll = () => {
      setOffset(document.body.scrollTop || document.documentElement.scrollTop);
    };

    document.addEventListener("scroll", onScroll, { passive: true });
    return () => document.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={cn(
        "z-50 h-14 border-b border-ink-200 bg-white/80 backdrop-blur dark:border-ink-800 dark:bg-ink-950/80",
        fixed && "header-fixed peer/header sticky top-0 w-[inherit]",
        offset > 10 && fixed ? "shadow-sm" : "shadow-none",
        className
      )}
      {...props}
    >
      <div className="relative flex h-full items-center gap-3 px-6">
        <SidebarTrigger variant="outline" className="max-md:scale-125" />
        <Separator orientation="vertical" className="h-6" />
        <DepartmentFilter />
        {breadcrumbs && breadcrumbs.length > 0 ? (
          <nav
            aria-label="Breadcrumb"
            className="flex min-w-0 items-center gap-1 text-[13px]"
          >
            {breadcrumbs.map((label, i) => {
              const isLast = i === breadcrumbs.length - 1;
              return (
                <span
                  key={`${i}-${label}`}
                  className="flex min-w-0 items-center gap-1"
                >
                  {i > 0 && (
                    <ChevronRight className="size-3 text-ink-400" />
                  )}
                  {isLast ? (
                    <span className="max-w-[280px] truncate font-medium text-ink-900 dark:text-ink-50">
                      {label}
                    </span>
                  ) : (
                    <span className="truncate text-ink-500">{label}</span>
                  )}
                </span>
              );
            })}
          </nav>
        ) : null}
        {children}
      </div>
    </header>
  );
}
