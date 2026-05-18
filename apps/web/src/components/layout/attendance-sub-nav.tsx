// Shared sub-navigation for the Attendance hub.
// One sidebar entry "Attendance" → internal tabs:
// Clock Logs · Roll-Call (daily + monthly) · Lateness · Time-Off & Sick Days ·
// Holidays · Analytics.
//
// Usage in each attendance route:
//   import { AttendanceSubNav } from "@/components/layout/attendance-sub-nav";
//   <AttendanceSubNav activeView="logs" />

import { useNavigate } from "@tanstack/react-router";
import {
  BarChart3,
  CalendarCheck,
  ClipboardCheck,
  ClipboardList,
  Clock,
  FileText,
  Timer,
} from "lucide-react";

export type AttendanceView =
  | "logs"
  | "roll-call"
  | "lateness"
  | "tosd"
  | "holidays"
  | "timesheet-documents"
  | "analytics";

const TABS: Array<{
  value: AttendanceView;
  label: string;
  Icon: React.FC<React.SVGProps<SVGSVGElement>>;
  route: string;
  isNew?: boolean;
}> = [
  { value: "logs",      label: "Clock Logs",      Icon: Clock,          route: "/attendance" },
  { value: "roll-call", label: "Roll-Call",       Icon: ClipboardCheck, route: "/attendance/roll-call" },
  { value: "lateness",  label: "Lateness",        Icon: Timer,          route: "/lateness" },
  { value: "tosd",      label: "Time-Off & Sick Days", Icon: ClipboardList, route: "/attendance/tosd" },
  { value: "holidays",  label: "Holidays",        Icon: CalendarCheck,  route: "/attendance/holidays" },
  { value: "timesheet-documents", label: "Timesheet Documents", Icon: FileText, route: "/attendance/timesheet-documents" },
  { value: "analytics", label: "Analytics",       Icon: BarChart3,      route: "/attendance/analytics" },
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
