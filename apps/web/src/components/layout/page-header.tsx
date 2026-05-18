// Shared PageHeader band — design handoff §5 (ui.jsx:168–205)
//
// Usage:
//   <PageHeader
//     eyebrow="People"
//     title="Staff Directory"
//     description="142 active staff across DCS, NOC, Security, HR and Ops."
//     actions={<Button>...</Button>}
//     tabs={[{ value: "list", label: "List", icon: Table, count: 142 }]}
//     activeTab={tab}
//     onTabChange={setTab}
//   />
//
// Placement: render as the FIRST child of <Main> (or before any other content).
// The band stretches to the edges of Main via `-mx-6 -mt-6 mb-6` to match the
// design-handoff full-bleed header band.

import type React from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@ndma-dcs-staff-portal/ui/lib/utils";

export interface PageHeaderTab {
  value: string;
  label: string;
  icon?: LucideIcon;
  count?: number;
}

export interface PageHeaderProps {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: React.ReactNode;
  tabs?: PageHeaderTab[];
  activeTab?: string;
  onTabChange?: (value: string) => void;
  className?: string;
}

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  tabs,
  activeTab,
  onTabChange,
  className,
}: PageHeaderProps) {
  return (
    <section
      className={cn(
        // Full-bleed band — negate Main's px-6 py-6 padding so the band
        // stretches edge-to-edge with its own internal padding.
        "-mx-6 -mt-6 mb-6 border-b border-ink-200 dark:border-ink-800 bg-white dark:bg-ink-950",
        className,
      )}
    >
      <div className="flex flex-col gap-3 px-6 pt-5 pb-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
        <div className="min-w-0">
          {eyebrow && (
            <div className="mb-1 text-[11px] font-bold uppercase tracking-wider text-brand-700 dark:text-brand-400">
              {eyebrow}
            </div>
          )}
          <h1 className="text-[20px] font-semibold tracking-tight text-ink-900 dark:text-ink-50">
            {title}
          </h1>
          {description && (
            <p className="mt-1 max-w-3xl text-[13px] text-ink-500 dark:text-ink-400">
              {description}
            </p>
          )}
        </div>
        {actions && (
          <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>
        )}
      </div>

      {tabs && tabs.length > 0 && (
        <div className="overflow-x-auto px-6">
          <div className="inline-flex min-w-max items-center gap-0.5 -mb-px">
            {tabs.map((t) => {
              const isActive = activeTab === t.value;
              const Icon = t.icon;
              return (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => onTabChange?.(t.value)}
                  className={cn(
                    "relative -mb-px h-9 border-b-2 px-3 text-[13px] font-medium transition-colors",
                    isActive
                      ? "border-brand-600 text-brand-700 dark:border-brand-400 dark:text-brand-300"
                      : "border-transparent text-ink-500 hover:text-ink-800 dark:hover:text-ink-200",
                  )}
                >
                  <span className="inline-flex items-center gap-1.5">
                    {Icon && <Icon className="size-3.5" />}
                    {t.label}
                    {t.count != null && (
                      <span
                        className={cn(
                          "ml-1 rounded px-1.5 py-0.5 text-[10.5px] tabular-nums",
                          isActive
                            ? "bg-brand-600 text-white dark:bg-brand-500"
                            : "bg-ink-100 text-ink-600 dark:bg-ink-800 dark:text-ink-300",
                        )}
                      >
                        {t.count}
                      </span>
                    )}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}
