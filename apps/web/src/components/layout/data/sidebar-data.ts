// NDMA DCS Ops Center sidebar — synced 1:1 to canonical handoff prototype
// (design handoff/sidebar.jsx). Unique icon per concept; "new" badges on
// Leave Planner and Advance Requests per prototype.
//
// Hub pages have internal sub-navs (no sub-routes in sidebar):
//   /attendance — tabs: Logs · Roll-Call · Lateness · Time-Off & Sick Days · Holidays · Analytics
//   /scheduling — tabs: Calendar · DCS · NOC · Maintenance
//   /training   — tabs: Overview · Plan · Exams · Vouchers · Events · In-House · Catalog
//   /settings   — tabs: General · Departments · Roles · Leave Types · Automation · Escalation

import {
  Activity,
  BarChart3,
  BookOpen,
  Boxes,
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
  IdCard,
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
      title: "Scheduling",
      items: [{ title: "Calendar", url: "/scheduling", icon: CalendarDays }],
    },
    {
      title: "Time & Attendance",
      items: [
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
      title: "Performance",
      items: [
        { title: "Appraisals", url: "/appraisals", icon: ClipboardCheck },
        { title: "Cycles", url: "/cycles", icon: Repeat },
        { title: "NOC Performance", url: "/noc-performance", icon: Activity },
      ],
    },
    {
      title: "Training",
      items: [{ title: "Training", url: "/training", icon: GraduationCap }],
    },
    {
      title: "Identity & Access",
      items: [
        { title: "Accounts", url: "/access", icon: KeyRound, requiredResource: "access" },
        { title: "Registry", url: "/access/registry", icon: IdCard, requiredResource: "access" },
        { title: "Platforms", url: "/access/platforms", icon: Boxes, requiredResource: "access" },
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
      title: "Reports & Analytics",
      items: [
        { title: "Analytics", url: "/analytics", icon: BarChart3 },
        { title: "Reports", url: "/reports", icon: FileBarChart, requiredResource: "report" },
        { title: "Audit Log", url: "/audit", icon: ScrollText },
      ],
    },
    {
      title: "Admin",
      items: [
        { title: "Settings", url: "/settings", icon: Settings, requiredResource: "settings" },
      ],
    },
  ],
};
