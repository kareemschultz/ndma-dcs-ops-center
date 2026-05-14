// Leave Sub-Nav — persistent tabs across all leave pages
// Create: apps/web/src/components/layout/leave-sub-nav.tsx
// Import in: leave/index.tsx, leave/calendar.tsx, leave/tosd.tsx

import { useNavigate, useLocation } from "@tanstack/react-router";
import { Calendar, CalendarOff, Clock } from "lucide-react";

const LEAVE_TABS = [
  { to: "/leave",          label: "Requests",   Icon: CalendarOff },
  { to: "/leave/calendar", label: "Calendar",   Icon: Calendar    },
  { to: "/leave/tosd",     label: "TOSD",       Icon: Clock       },
] as const;

export function LeaveSubNav() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const active = LEAVE_TABS.find((t) => t.to === pathname)?.to ?? "/leave";

  return (
    <div className="flex items-center gap-0.5 border-b px-6">
      {LEAVE_TABS.map((tab) => (
        <button
          key={tab.to}
          onClick={() => navigate({ to: tab.to })}
          className={[
            "flex items-center gap-1.5 border-b-2 px-3 py-3 text-sm font-medium transition-colors",
            active === tab.to
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:border-border hover:text-foreground",
          ].join(" ")}
        >
          <tab.Icon className="size-3.5" />
          {tab.label}
        </button>
      ))}
    </div>
  );
}
