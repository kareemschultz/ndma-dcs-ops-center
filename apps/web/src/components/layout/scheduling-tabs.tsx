import { useLocation, useNavigate } from "@tanstack/react-router";

import { Tabs, TabsList, TabsTrigger } from "@ndma-dcs-staff-portal/ui/components/tabs";

type SchedulingScope = "dcs" | "noc";

const TAB_ROUTES: Record<SchedulingScope, Array<{ value: string; label: string; route: string }>> = {
  dcs: [
    { value: "on-call", label: "On-Call", route: "/rota" },
    { value: "planner", label: "Planner", route: "/rota/planner" },
    { value: "swaps", label: "Swaps", route: "/rota/swaps" },
    { value: "calendar", label: "Calendar", route: "/rota/calendar" },
    { value: "fairness", label: "Fairness", route: "/rota/fairness" },
    { value: "history", label: "History", route: "/rota/history" },
    { value: "warnings", label: "Warnings", route: "/rota/warnings" },
  ],
  noc: [
    { value: "shifts", label: "NOC Shifts", route: "/roster" },
    { value: "planner", label: "Planner", route: "/roster/planner" },
    { value: "today", label: "Today", route: "/roster/today" },
    { value: "my-roster", label: "My Roster", route: "/roster/my-roster" },
    { value: "swaps", label: "Swaps", route: "/roster/swaps" },
    { value: "maintenance", label: "Maintenance Planner", route: "/roster/maintenance" },
  ],
};

function getTabValue(pathname: string, scope: SchedulingScope) {
  const match = TAB_ROUTES[scope].find((tab) => pathname === tab.route || pathname.startsWith(`${tab.route}/`));
  return match?.value ?? TAB_ROUTES[scope][0]?.value ?? "";
}

export function SchedulingTabs({ scope }: { scope: SchedulingScope }) {
  const navigate = useNavigate();
  const location = useLocation();
  const value = getTabValue(location.pathname, scope);
  const tabs = TAB_ROUTES[scope];

  return (
    <Tabs
      value={value}
      onValueChange={(next) => {
        const target = tabs.find((tab) => tab.value === next)?.route ?? tabs[0]?.route ?? "/";
        if (target !== location.pathname) {
          void navigate({ to: target });
        }
      }}
      className="w-full"
    >
      <TabsList variant="line" className="w-full justify-start gap-1 overflow-x-auto rounded-none border-b border-border pb-0">
        {tabs.map((tab) => (
          <TabsTrigger key={tab.value} value={tab.value} className="px-3 py-2 text-sm font-medium">
            {tab.label}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}
