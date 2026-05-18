// Shared sub-navigation for the Scheduling module.
// Replace apps/web/src/components/layout/scheduling-tabs.tsx with this file.
//
// Usage in each scheduling route:
//   import { SchedulingSubNav } from "@/components/layout/scheduling-sub-nav";
//   <SchedulingSubNav activeView="hub" />

import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { CalendarCheck2, CalendarDays, LayoutDashboard, Wrench } from "lucide-react";

import { orpc } from "@/utils/orpc";
import { authClient } from "@/lib/auth-client";

export type SchedulingView = "hub" | "dcs" | "noc" | "maintenance";

// Management roles see every department's scheduling; rank-and-file are scoped.
const CROSS_DEPARTMENT_ROLES = new Set([
  "admin",
  "hrAdminOps",
  "manager",
  "teamLead",
  "personalAssistant",
]);

const TABS: Array<{
  value: SchedulingView;
  label: string;
  Icon: React.FC<React.SVGProps<SVGSVGElement>>;
  route: string;
  /** When set, only this department's rank-and-file (or management) see the tab. */
  team?: "NOC" | "DCS";
}> = [
  { value: "hub",         label: "Overview",    Icon: LayoutDashboard, route: "/scheduling" },
  { value: "dcs",         label: "DCS On-Call", Icon: CalendarCheck2,  route: "/scheduling/dcs-oncall" },
  { value: "noc",         label: "NOC Shifts",  Icon: CalendarDays,    route: "/scheduling/noc-shifts", team: "NOC" },
  { value: "maintenance", label: "Maintenance", Icon: Wrench,          route: "/scheduling/maintenance" },
];

export function SchedulingSubNav({ activeView }: { activeView: SchedulingView }) {
  const navigate = useNavigate();
  const { data: session } = authClient.useSession();
  const role = (session?.user as Record<string, unknown> | undefined)?.role as
    | string
    | undefined;
  const isCrossDept = role ? CROSS_DEPARTMENT_ROLES.has(role) : false;
  const { data: callerProfile } = useQuery({
    ...orpc.staff.me.queryOptions(),
    enabled: !!role && !isCrossDept,
  });
  const deptCode = (callerProfile as
    | { department?: { code?: string | null } | null }
    | null
    | undefined)?.department?.code;
  const callerTeam = deptCode === "NOC" ? "NOC" : callerProfile?.department ? "DCS" : null;

  const visibleTabs = TABS.filter((tab) => {
    if (!tab.team) return true;
    if (isCrossDept) return true;
    return callerTeam === tab.team;
  });

  return (
    <div className="flex items-center gap-0.5 border-b px-6">
      {visibleTabs.map((tab) => {
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
