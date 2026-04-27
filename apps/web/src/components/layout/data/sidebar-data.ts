// NDMA Portal sidebar navigation aligned to the master implementation plan.
import {
  BarChart2,
  Bell,
  AlertTriangle,
  BookOpen,
  CalendarClock,
  CalendarOff,
  CalendarRange,
  ClipboardCheck,
  Clock3,
  FileText,
  GraduationCap,
  LayoutDashboard,
  LayoutList,
  Settings2,
  Shield,
  Tag,
  Ticket,
  Users,
  Wrench,
  Upload,
} from "lucide-react";

import { type SidebarData } from "../types";

export const sidebarData: Omit<SidebarData, "user"> = {
  teams: [
    {
      name: "DCS Ops Center",
      logo: Shield,
      plan: "NDMA Data Centre Services",
    },
  ],
  navGroups: [
    {
      title: "Dashboard",
      items: [
        { title: "Home", url: "/", icon: LayoutDashboard },
      ],
    },
    {
      title: "Operations",
      items: [
        {
          title: "Work Management",
          icon: ClipboardCheck,
          items: [
            { title: "Work Register", url: "/work", icon: ClipboardCheck },
            { title: "Workload", url: "/work/workload", icon: BarChart2 },
          ],
        },
        {
          title: "Incidents & Services",
          icon: Shield,
          items: [
            { title: "Incidents", url: "/incidents", icon: Shield },
            { title: "Services", url: "/services", icon: Shield },
            { title: "Ops Readiness", url: "/ops-readiness", icon: Shield },
            { title: "Reports", url: "/reports", icon: FileText, requiredResource: "report" },
          ],
        },
        {
          title: "Changes & Access",
          icon: Wrench,
          items: [
            { title: "Changes", url: "/changes", icon: Wrench },
            { title: "Procurement", url: "/procurement", icon: Wrench, requiredResource: "procurement" },
            { title: "Access Management", url: "/access", icon: Shield },
            { title: "Access Registry", url: "/access/registry", icon: Shield, requiredResource: "access" },
            { title: "Platforms", url: "/access/platforms", icon: Shield, requiredResource: "access" },
          ],
        },
      ],
    },
    {
      title: "Scheduling & Rosters",
      items: [
        {
          title: "Scheduling Overview",
          url: "/scheduling",
          icon: CalendarClock,
        },
        {
          title: "DCS On-Call",
          icon: CalendarClock,
          items: [
            { title: "DCS Weekly View", url: "/scheduling/dcs-oncall", icon: CalendarClock },
            { title: "On-Call (Legacy)", url: "/rota", icon: CalendarClock },
            { title: "Planner", url: "/rota/planner", icon: Wrench },
            { title: "Swaps", url: "/rota/swaps", icon: CalendarRange },
            { title: "Calendar", url: "/rota/calendar", icon: CalendarClock },
            { title: "Fairness", url: "/rota/fairness", icon: BarChart2 },
            { title: "History", url: "/rota/history", icon: FileText },
            { title: "Warnings", url: "/rota/warnings", icon: AlertTriangle },
          ],
        },
        {
          title: "NOC Scheduling",
          icon: CalendarRange,
          items: [
            { title: "NOC Shift Grid", url: "/scheduling/noc-shifts", icon: CalendarRange },
            { title: "NOC Shifts (Legacy)", url: "/roster", icon: CalendarRange },
            { title: "Planner", url: "/roster/planner", icon: Wrench },
            { title: "Today", url: "/roster/today", icon: CalendarClock },
            { title: "My Roster", url: "/roster/my-roster", icon: Users },
            { title: "Swaps", url: "/roster/swaps", icon: CalendarRange },
            { title: "Maintenance Planner", url: "/roster/maintenance", icon: Wrench },
          ],
        },
      ],
    },
    {
      title: "Attendance & Time",
      items: [
        {
          title: "Attendance Views",
          icon: Clock3,
          items: [
            { title: "Attendance Logs", url: "/attendance", icon: Clock3 },
            { title: "Lateness Report", url: "/lateness", icon: Clock3 },
            { title: "Timesheets", url: "/timesheets", icon: CalendarOff },
            { title: "Timesheet Documents", url: "/timesheets/documents", icon: FileText },
          ],
        },
      ],
    },
    {
      title: "HR & People",
      items: [
        {
          title: "People Records",
          icon: Users,
          items: [
            { title: "Staff Directory", url: "/staff", icon: Users },
            { title: "Leave Management", url: "/leave", icon: CalendarOff },
            { title: "Time Off & Sick Days", url: "/leave/tosd", icon: CalendarOff },
            { title: "Career Progression", url: "/career-progression", icon: ClipboardCheck },
            { title: "Contracts", url: "/contracts", icon: FileText, requiredResource: "contract" },
            { title: "PPE Compliance", url: "/compliance/ppe", icon: Shield, requiredResource: "compliance" },
          ],
        },
      ],
    },
    {
      title: "Appraisals & Performance",
      items: [
        {
          title: "Review Flow",
          icon: ClipboardCheck,
          items: [
            { title: "My Appraisals", url: "/appraisals", icon: ClipboardCheck },
            { title: "Team Pipeline", url: "/appraisals/inbox", icon: ClipboardCheck },
          ],
        },
        {
          title: "NOC Performance",
          icon: BarChart2,
          items: [
            { title: "Monthly Metrics", url: "/noc-performance", icon: BarChart2 },
          ],
        },
      ],
    },
    {
      title: "Training & Development",
      items: [
        {
          title: "Training",
          icon: GraduationCap,
          items: [
            { title: "Overview",       url: "/training",          icon: GraduationCap },
            { title: "Training Plan",  url: "/training/plan",     icon: LayoutList },
            { title: "Exam Schedule",  url: "/training/exams",    icon: CalendarRange },
            { title: "Vouchers",       url: "/training/vouchers", icon: Ticket },
            { title: "Events",         url: "/training/events",   icon: Users },
            { title: "In-House Log",   url: "/training/in-house", icon: BookOpen },
            { title: "Cert Catalog",   url: "/training/catalog",  icon: Tag },
          ],
        },
      ],
    },
    {
      title: "Policies & Forms",
      items: [
        {
          title: "Document Library",
          icon: FileText,
          items: [
            { title: "NDMA Policies", url: "/policy", icon: FileText },
            { title: "Internal Forms", url: "/policy", icon: FileText },
          ],
        },
      ],
    },
    {
      title: "Admin & Setup",
      items: [
        {
          title: "System Setup",
          icon: Settings2,
          requiredResource: "settings",
          items: [
            { title: "Data Import", url: "/import", icon: Upload, requiredResource: "settings" },
            { title: "Departments", url: "/settings/departments", icon: Settings2, requiredResource: "settings" },
            { title: "Roles", url: "/settings/roles", icon: Shield, requiredResource: "settings" },
            { title: "Leave Types", url: "/settings/leave-types", icon: CalendarOff, requiredResource: "settings" },
            { title: "Automation", url: "/settings/automation", icon: Bell, requiredResource: "settings" },
            { title: "Escalation", url: "/settings/escalation", icon: Bell, requiredResource: "settings" },
            { title: "General", url: "/settings/general", icon: Settings2, requiredResource: "settings" },
          ],
        },
      ],
    },
  ],
};
