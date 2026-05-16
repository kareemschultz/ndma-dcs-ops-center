// NDMA DCS Ops Center sidebar.
//
// Consolidated to 9 groups (was 12) to cut scrolling — single-item groups were
// merged into related ones and the Access trio collapsed into one tabbed hub.
//
// Hub pages have internal sub-navs (no sub-routes in sidebar):
//   /attendance — tabs: Logs · Roll-Call · Lateness · Time-Off & Sick Days · Holidays · Analytics
//   /scheduling — tabs: Calendar · DCS · NOC · Maintenance
//   /training   — tabs: Overview · Plan · Exams · Vouchers · Events · In-House · Catalog
//   /access     — tabs: Accounts · Registry · Platforms
//   /settings   — tabs: General · Departments · Roles · Leave Types · Automation · Escalation

import {
  Activity,
  BarChart3,
  BookOpen,
  CalendarDays,
  ClipboardCheck,
  ClipboardList,
  Clock,
  CreditCard,
  FileBarChart,
  FileClock,
  FileSignature,
  FileText,
  GitPullRequest,
  GraduationCap,
  KeyRound,
  LayoutDashboard,
  Repeat,
  ScrollText,
  Server,
  Settings,
  Shield,
  ShieldCheck,
  ShoppingCart,
  Siren,
  TreePalm,
  TrendingUp,
  Users,
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
      items: [{ title: "Home", url: "/", icon: LayoutDashboard }],
    },
    {
      title: "Operations",
      items: [
        { title: "Work Register", url: "/work", icon: ClipboardList },
        { title: "Incidents", url: "/incidents", icon: Siren },
        { title: "Changes", url: "/changes", icon: GitPullRequest },
        { title: "Services", url: "/services", icon: Server },
        { title: "Ops Readiness", url: "/ops-readiness", icon: ShieldCheck },
      ],
    },
    {
      // Scheduling merged in here — it was a single-item group.
      title: "Scheduling & Time",
      items: [
        { title: "Scheduling", url: "/scheduling", icon: CalendarDays },
        { title: "Attendance", url: "/attendance", icon: Clock },
        { title: "Timesheets", url: "/timesheets", icon: FileClock },
      ],
    },
    {
      title: "People",
      items: [
        { title: "Directory", url: "/staff", icon: Users },
        { title: "Leave", url: "/leave", icon: TreePalm },
        { title: "Career Progression", url: "/career-progression", icon: TrendingUp },
        {
          title: "Contracts",
          url: "/contracts",
          icon: FileSignature,
          requiredResource: "contract",
        },
        {
          title: "Compliance",
          url: "/compliance",
          icon: ShieldCheck,
          requiredResource: "compliance",
        },
      ],
    },
    {
      // Training merged in here — it was a single-item group.
      title: "Performance & Training",
      items: [
        { title: "Appraisals", url: "/appraisals", icon: ClipboardCheck },
        { title: "Cycles", url: "/cycles", icon: Repeat },
        { title: "NOC Performance", url: "/noc-performance", icon: Activity },
        { title: "Training", url: "/training", icon: GraduationCap },
      ],
    },
    {
      // Identity & Access — Registry + Platforms collapsed into the /access
      // hub's tab bar, so this is now a single sidebar entry.
      title: "Identity & Access",
      items: [
        { title: "Access", url: "/access", icon: KeyRound, requiredResource: "access" },
      ],
    },
    {
      title: "Procurement",
      items: [
        {
          title: "Procurement",
          url: "/procurement",
          icon: ShoppingCart,
          requiredResource: "procurement",
        },
        { title: "Advance Requests", url: "/advances", icon: CreditCard, badge: "new" },
      ],
    },
    {
      title: "Knowledge",
      items: [
        { title: "Policies", url: "/policy", icon: BookOpen },
        { title: "Forms", url: "/forms", icon: FileText },
      ],
    },
    {
      // Reports & Analytics + Admin merged — Admin was a single-item group.
      title: "Reports & Admin",
      items: [
        { title: "Analytics", url: "/analytics", icon: BarChart3 },
        { title: "Reports", url: "/reports", icon: FileBarChart, requiredResource: "report" },
        { title: "Audit Log", url: "/audit", icon: ScrollText },
        { title: "Settings", url: "/settings", icon: Settings, requiredResource: "settings" },
      ],
    },
  ],
};
