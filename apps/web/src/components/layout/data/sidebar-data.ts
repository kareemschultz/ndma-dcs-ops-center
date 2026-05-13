// NDMA DCS Ops Center sidebar — REVAMPED IA
// Drop-in replacement for apps/web/src/components/layout/data/sidebar-data.ts
//
// Key changes vs. previous version:
//   • Legacy /rota/* and /roster/* removed from nav (kept as 301 redirects to /scheduling)
//   • Scheduling consolidated to one entry; DCS/NOC handled via scope query param
//   • Training & Admin collapsed from 7 flat items each → 1 entry whose sub-views are page tabs
//   • Identity & Access promoted to its own group (was buried in "Changes & Access")
//   • Procurement promoted to its own entry (was misfiled under Changes)
//   • Compliance unified — PPE, Items, Training tabs behind /compliance
//   • Reports & Analytics surfaced (Analytics + Audit Log were orphaned before)
//   • Forms split from /policy duplicate (now points to /forms)
//   • Icon set de-duplicated — 1 icon per concept, Shield no longer used 8 times

import {
  BarChart3,
  BookOpen,
  CalendarDays,
  ClipboardList,
  Clock,
  GraduationCap,
  KeyRound,
  LayoutDashboard,
  LineChart,
  Settings,
  ShoppingCart,
  Shield,
  Users,
  Wrench,
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
        { title: "Work Register",  url: "/work",            icon: ClipboardList },
        { title: "Incidents",      url: "/incidents",       icon: ClipboardList },
        { title: "Changes",        url: "/changes",         icon: ClipboardList },
        { title: "Services",       url: "/services",        icon: ClipboardList },
        { title: "Ops Readiness",  url: "/ops-readiness",   icon: ClipboardList },
      ],
    },
    {
      title: "Scheduling",
      items: [
        {
          // Unified entry — internal tabs handle Calendar / Planner / Swaps / Fairness / History / Warnings
          // Scope (DCS vs NOC) is a top-of-page toggle, persisted as ?scope=dcs|noc
          title: "Calendar",
          url: "/scheduling",
          icon: CalendarDays,
        },
        {
          title: "Maintenance Planner",
          url: "/scheduling/maintenance",
          icon: Wrench,
        },
      ],
    },
    {
      title: "Time & Attendance",
      items: [
        { title: "Attendance Logs", url: "/attendance",  icon: Clock },
        { title: "Lateness Report", url: "/lateness",    icon: Clock },
        { title: "Timesheets",      url: "/timesheets",  icon: Clock },
      ],
    },
    {
      title: "People",
      items: [
        { title: "Directory",            url: "/staff",                icon: Users },
        { title: "Leave",                url: "/leave",                icon: Users },
        { title: "Career Progression",   url: "/career-progression",   icon: Users },
        { title: "Contracts",            url: "/contracts",            icon: Users, requiredResource: "contract" },
        { title: "Compliance",           url: "/compliance",           icon: Users, requiredResource: "compliance" },
      ],
    },
    {
      title: "Performance",
      items: [
        { title: "Appraisals",       url: "/appraisals",       icon: LineChart },
        { title: "Cycles",           url: "/cycles",           icon: LineChart },
        { title: "NOC Performance",  url: "/noc-performance",  icon: LineChart },
      ],
    },
    {
      title: "Training",
      items: [
        // Single nav entry. Internal tabs: Overview · Plan · Exams · Vouchers · Events · In-House · Catalog
        { title: "Training", url: "/training", icon: GraduationCap },
      ],
    },
    {
      title: "Identity & Access",
      items: [
        { title: "Accounts",  url: "/access",            icon: KeyRound, requiredResource: "access" },
        { title: "Registry",  url: "/access/registry",   icon: KeyRound, requiredResource: "access" },
        { title: "Platforms", url: "/access/platforms",  icon: KeyRound, requiredResource: "access" },
      ],
    },
    {
      title: "Procurement",
      items: [
        { title: "Procurement", url: "/procurement", icon: ShoppingCart, requiredResource: "procurement" },
      ],
    },
    {
      title: "Knowledge",
      items: [
        { title: "Policies", url: "/policy", icon: BookOpen },
        { title: "Forms",    url: "/forms",  icon: BookOpen },
      ],
    },
    {
      title: "Reports & Analytics",
      items: [
        { title: "Analytics", url: "/analytics", icon: BarChart3 },
        { title: "Reports",   url: "/reports",   icon: BarChart3, requiredResource: "report" },
        { title: "Audit Log", url: "/audit",     icon: BarChart3 },
      ],
    },
    {
      title: "Admin",
      items: [
        // Single entry. Internal tabs: General · Departments · Roles · Leave Types · Automation · Escalation · Data Import
        { title: "Settings", url: "/settings", icon: Settings, requiredResource: "settings" },
      ],
    },
  ],
};
