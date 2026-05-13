// Shared sub-navigation for the Scheduling module.
// Replace apps/web/src/components/layout/scheduling-tabs.tsx with this file.
//
// Usage in each scheduling route:
//   import { SchedulingSubNav } from "@/components/layout/scheduling-sub-nav";
//   <SchedulingSubNav activeView="hub" />

import { useNavigate } from "@tanstack/react-router";
import { CalendarCheck2, CalendarDays, LayoutDashboard, Wrench } from "lucide-react";

export type SchedulingView = "hub" | "dcs" | "noc" | "maintenance";

const TABS: Array<{
  value: SchedulingView;
  label: string;
  Icon: React.FC<React.SVGProps<SVGSVGElement>>;
  route: string;
}> = [
  { value: "hub",         label: "Overview",    Icon: LayoutDashboard, route: "/scheduling" },
  { value: "dcs",         label: "DCS On-Call", Icon: CalendarCheck2,  route: "/scheduling/dcs-oncall" },
  { value: "noc",         label: "NOC Shifts",  Icon: CalendarDays,    route: "/scheduling/noc-shifts" },
  { value: "maintenance", label: "Maintenance", Icon: Wrench,          route: "/scheduling/maintenance" },
];

export function SchedulingSubNav({ activeView }: { activeView: SchedulingView }) {
  const navigate = useNavigate();
  return (
    <div className="flex items-center gap-0.5 border-b px-6">
      {TABS.map((tab) => {
        const active = tab.value === activeView;
        return (
          <button
            key={tab.value}
            onClick={() => navigate({ to: tab.route })}
            className={[
              "flex items-center gap-1.5 border-b-2 px-3 py-3 text-sm font-medium transition-colors",
              active
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:border-border hover:text-foreground",
            ].join(" ")}
          >
            <tab.Icon className="size-3.5" />
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
