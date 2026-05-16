// Leave Sub-Nav — persistent tabs across all leave pages.
// Import in: leave/index.tsx, leave/planner.tsx, leave/calendar.tsx,
// leave/balances.tsx.
//
// Time-Off & Sick Days moved to the Time & Attendance module — TOSD is
// attendance data, not leave.

import { useNavigate, useLocation } from "@tanstack/react-router";
import { Calendar, CalendarOff, GanttChart, Wallet } from "lucide-react";

const LEAVE_TABS = [
  { to: "/leave",          label: "Requests",   Icon: CalendarOff },
  { to: "/leave/planner",  label: "Planner",    Icon: GanttChart  },
  { to: "/leave/calendar", label: "Calendar",   Icon: Calendar    },
  { to: "/leave/balances", label: "Balances",   Icon: Wallet      },
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
