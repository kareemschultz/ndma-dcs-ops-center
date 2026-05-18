// Exact replica from shadcn-admin/src/components/layout/types.ts
import { type LinkProps } from "@tanstack/react-router";

type User = {
  name: string;
  email: string;
  avatar: string;
};

type Team = {
  name: string;
  logo: React.ElementType;
  plan: string;
};

type BaseNavItem = {
  title: string;
  badge?: string;
  icon?: React.ElementType;
  /** RBAC resource required to see this item. Matches resources in packages/auth/src/index.ts. */
  requiredResource?: string;
  /**
   * Department this item belongs to. Rank-and-file users (staff/viewer) only
   * see items matching their own department; management roles see all.
   */
  requiredTeam?: "NOC" | "DCS";
};

type NavLink = BaseNavItem & {
  url: LinkProps["to"] | (string & {});
  items?: never;
};

type NavCollapsible = BaseNavItem & {
  items: (BaseNavItem & { url: LinkProps["to"] | (string & {}) })[];
  url?: never;
};

type NavItem = NavCollapsible | NavLink;

type NavGroup = {
  title: string;
  items: NavItem[];
};

type SidebarData = {
  user: User;
  teams: Team[];
  navGroups: NavGroup[];
};

export type { SidebarData, NavGroup, NavItem, NavCollapsible, NavLink };
