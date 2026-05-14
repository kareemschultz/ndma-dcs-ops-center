// Shared sub-navigation for the Attendance hub.
// Matches the design handoff intent: one sidebar entry "Attendance" → internal
// tabs to Logs / Roll-Call / Monthly Grid / Public Holidays / Lateness.
//
// Usage in each attendance route:
//   import { AttendanceSubNav } from "@/components/layout/attendance-sub-nav";
//   <AttendanceSubNav activeView="logs" />

import { useNavigate } from "@tanstack/react-router";
import {
  CalendarCheck,
  CalendarDays,
  ClipboardCheck,
  Clock,
  Timer,
} from "lucide-react";

export type AttendanceView = "logs" | "roll-call" | "monthly" | "holidays" | "lateness";

const TABS: Array<{
  value: AttendanceView;
  label: string;
  Icon: React.FC<React.SVGProps<SVGSVGElement>>;
  route: string;
}> = [
  { value: "logs",      label: "Logs",            Icon: Clock,          route: "/attendance" },
  { value: "roll-call", label: "Daily Roll-Call", Icon: ClipboardCheck, route: "/attendance/roll-call" },
  { value: "monthly",   label: "Monthly Grid",    Icon: CalendarDays,   route: "/attendance/monthly" },
  { value: "holidays",  label: "Public Holidays", Icon: CalendarCheck,  route: "/attendance/holidays" },
  { value: "lateness",  label: "Lateness",        Icon: Timer,          route: "/lateness" },
];

export function AttendanceSubNav({ activeView }: { activeView: AttendanceView }) {
  const navigate = useNavigate();
  return (
    <div className="flex items-center gap-0.5 border-b px-6">
      {TABS.map((tab) => {
        const active = tab.value === activeView;
        return (
          <button
            key={tab.value}
            type="button"
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
