// Shared sub-navigation for the Attendance hub.
// One sidebar entry "Attendance" → internal tabs matching the design prototype:
// Clock Logs · Daily Roll-Call · Monthly Grid · Lateness · Holidays.
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

export type AttendanceView = "logs" | "roll-call" | "monthly" | "lateness" | "holidays";

const TABS: Array<{
  value: AttendanceView;
  label: string;
  Icon: React.FC<React.SVGProps<SVGSVGElement>>;
  route: string;
  isNew?: boolean;
}> = [
  { value: "logs",      label: "Clock Logs",      Icon: Clock,          route: "/attendance" },
  { value: "roll-call", label: "Daily Roll-Call", Icon: ClipboardCheck, route: "/attendance/roll-call", isNew: true },
  { value: "monthly",   label: "Monthly Grid",    Icon: CalendarDays,   route: "/attendance/monthly",   isNew: true },
  { value: "lateness",  label: "Lateness",        Icon: Timer,          route: "/lateness" },
  { value: "holidays",  label: "Holidays",        Icon: CalendarCheck,  route: "/attendance/holidays",  isNew: true },
];

export function AttendanceSubNav({ activeView }: { activeView: AttendanceView }) {
  const navigate = useNavigate();
  return (
    <div className="flex items-center gap-0.5 border-b">
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
            {tab.isNew && !active && (
              <span className="rounded-full bg-blue-100 px-1.5 py-0.5 text-[10px] font-semibold text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">
                new
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
