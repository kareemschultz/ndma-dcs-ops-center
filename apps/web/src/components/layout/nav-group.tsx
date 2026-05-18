// Adapted from shadcn-admin/src/components/layout/nav-group.tsx
// Uses Base UI render prop pattern instead of Radix asChild
// Uses TanStack Router Link + useLocation instead of Next.js
import { type ReactNode } from "react";
import { Link, useLocation } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { authClient } from "@/lib/auth-client";
import { orpc } from "@/utils/orpc";
import { ChevronRight } from "lucide-react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@ndma-dcs-staff-portal/ui/components/collapsible";
import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  useSidebar,
} from "@ndma-dcs-staff-portal/ui/components/sidebar";
import { Badge } from "@ndma-dcs-staff-portal/ui/components/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@ndma-dcs-staff-portal/ui/components/dropdown-menu";
import {
  type NavCollapsible,
  type NavItem,
  type NavLink,
  type NavGroup as NavGroupProps,
} from "./types";

// Role → resources the role can access. Mirrors the RBAC table in
// packages/auth/src/index.ts (roles: readOnly, staff, manager, teamLead,
// personalAssistant, hrAdminOps, admin). This is a UX filter only — the
// server enforces real RBAC via requireRole().
//
// EVERY role must have an entry: canAccess() fails CLOSED, so an unlisted
// role (or a still-loading session) hides resource-gated nav items rather
// than leaking admin-only pages.
// Mirrors ROLE_RESOURCES in src/lib/route-guard.ts — keep the two in sync.
const ROLE_RESOURCES: Record<string, string[] | ["*"]> = {
  admin:             ["*"],
  hrAdminOps:        ["staff", "work", "leave", "rota", "compliance", "contract", "appraisal", "report", "audit", "settings", "procurement", "notification", "access"],
  manager:           ["staff", "work", "leave", "rota", "compliance", "contract", "appraisal", "report", "audit", "procurement", "notification", "access"],
  teamLead:          ["staff", "work", "leave", "rota", "compliance", "contract", "appraisal", "procurement", "notification", "access"],
  personalAssistant: ["staff", "work", "leave", "rota", "compliance", "contract", "appraisal", "report", "audit", "settings", "procurement", "notification", "access"],
  // staff = self-service portal only: NO settings/audit/access/report/import.
  staff:             ["work", "leave", "rota", "compliance", "contract", "appraisal", "procurement", "notification"],
  // readOnly = view broadly but no admin surfaces.
  readOnly:          ["staff", "work", "leave", "rota", "compliance", "contract", "appraisal", "report", "procurement", "notification"],
};

function canAccess(role: string | null | undefined, resource?: string): boolean {
  if (!resource) return true; // ungated item — always visible
  const allowed = ROLE_RESOURCES[role ?? ""];
  if (!allowed) return false; // unknown / still-loading role → fail closed
  if (allowed[0] === "*") return true;
  return (allowed as string[]).includes(resource);
}

// Management roles operate across DCS and NOC; rank-and-file are dept-scoped.
const CROSS_DEPARTMENT_ROLES = new Set([
  "admin",
  "hrAdminOps",
  "manager",
  "teamLead",
  "personalAssistant",
]);

// A department-tagged item is visible if: the role works cross-department, OR
// the caller's department matches. While the department is still loading we
// HIDE the item (fail closed) so NOC pages never flash for a DCS user.
function canAccessTeam(
  role: string | null | undefined,
  callerTeam: "NOC" | "DCS" | null,
  requiredTeam?: "NOC" | "DCS",
): boolean {
  if (!requiredTeam) return true;
  if (role && CROSS_DEPARTMENT_ROLES.has(role)) return true;
  return callerTeam === requiredTeam;
}

export function NavGroup({ title, items }: NavGroupProps) {
  const { state, isMobile } = useSidebar();
  const href = useLocation({ select: (location) => location.href });
  const { data: session } = authClient.useSession();
  const role = (session?.user as Record<string, unknown>)?.role as string | null;

  // Caller's top-level department (NOC vs DCS) — drives requiredTeam filtering.
  // Skipped for cross-department roles, which see everything regardless.
  const isCrossDept = role ? CROSS_DEPARTMENT_ROLES.has(role) : false;
  const { data: callerProfile } = useQuery({
    ...orpc.staff.me.queryOptions(),
    enabled: !!role && !isCrossDept,
  });
  const deptCode = (callerProfile as
    | { department?: { code?: string | null } | null }
    | null
    | undefined)?.department?.code;
  const callerTeam: "NOC" | "DCS" | null =
    deptCode === "NOC" ? "NOC" : callerProfile?.department ? "DCS" : null;

  const visibleItems = items
    .map((item) => {
      if (!item.items) {
        const visible =
          canAccess(role, item.requiredResource) &&
          canAccessTeam(role, callerTeam, item.requiredTeam);
        return visible ? item : null;
      }

      const visibleSubItems = item.items.filter(
        (subItem) =>
          canAccess(role, subItem.requiredResource) &&
          canAccessTeam(role, callerTeam, subItem.requiredTeam),
      );

      if (visibleSubItems.length === 0) {
        return null;
      }

      return {
        ...item,
        items: visibleSubItems,
      };
    })
    .filter((item): item is NavItem => item !== null);

  // A whole group can resolve to zero visible items for a low-privilege role
  // (e.g. "Reports & Admin" for a `staff` user). Render nothing rather than a
  // dangling group label with no entries under it.
  if (visibleItems.length === 0) return null;

  return (
    <SidebarGroup>
      <SidebarGroupLabel>{title}</SidebarGroupLabel>
      <SidebarMenu>
        {visibleItems.map((item) => {
          const key = `${item.title}-${item.url ?? item.title}`;

          if (!item.items)
            return <SidebarMenuLink key={key} item={item as NavLink} href={href} />;

          if (state === "collapsed" && !isMobile)
            return (
              <SidebarMenuCollapsedDropdown key={key} item={item as NavCollapsible} href={href} />
            );

          return <SidebarMenuCollapsible key={key} item={item as NavCollapsible} href={href} />;
        })}
      </SidebarMenu>
    </SidebarGroup>
  );
}

function NavBadge({ children }: { children: ReactNode }) {
  return (
    <Badge className="rounded-full px-1 py-0 text-xs">{children}</Badge>
  );
}

function SidebarMenuLink({ item, href }: { item: NavLink; href: string }) {
  const { setOpenMobile } = useSidebar();
  const isExternal = String(item.url).startsWith("http");
  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        render={
          isExternal ? (
            <a
              href={String(item.url)}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => setOpenMobile(false)}
            />
          ) : (
            <Link to={item.url} onClick={() => setOpenMobile(false)} />
          )
        }
        isActive={checkIsActive(href, item)}
        tooltip={item.title}
      >
        {item.icon && <item.icon />}
        <span>{item.title}</span>
        {item.badge && <NavBadge>{item.badge}</NavBadge>}
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

function SidebarMenuCollapsible({
  item,
  href,
}: {
  item: NavCollapsible;
  href: string;
}) {
  const { setOpenMobile } = useSidebar();
  return (
    <Collapsible
      render={<SidebarMenuItem />}
      defaultOpen={checkIsActive(href, item, true)}
      className="group/collapsible"
    >
      <CollapsibleTrigger render={<SidebarMenuButton tooltip={item.title} />}>
        {item.icon && <item.icon />}
        <span>{item.title}</span>
        {item.badge && <NavBadge>{item.badge}</NavBadge>}
        <ChevronRight className="ms-auto transition-transform duration-200 group-data-[open]/collapsible:rotate-90 rtl:rotate-180" />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <SidebarMenuSub>
          {item.items.map((subItem) => (
            <SidebarMenuSubItem key={subItem.title}>
              <SidebarMenuSubButton
                render={<Link to={subItem.url} onClick={() => setOpenMobile(false)} />}
                isActive={checkIsActive(href, subItem)}
              >
                {subItem.icon && <subItem.icon />}
                <span>{subItem.title}</span>
                {subItem.badge && <NavBadge>{subItem.badge}</NavBadge>}
              </SidebarMenuSubButton>
            </SidebarMenuSubItem>
          ))}
        </SidebarMenuSub>
      </CollapsibleContent>
    </Collapsible>
  );
}

function SidebarMenuCollapsedDropdown({
  item,
  href,
}: {
  item: NavCollapsible;
  href: string;
}) {
  return (
    <SidebarMenuItem>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <SidebarMenuButton
              tooltip={item.title}
              isActive={checkIsActive(href, item)}
            />
          }
        >
          {item.icon && <item.icon />}
          <span>{item.title}</span>
          {item.badge && <NavBadge>{item.badge}</NavBadge>}
          <ChevronRight className="ms-auto transition-transform duration-200" />
        </DropdownMenuTrigger>
        <DropdownMenuContent side="right" align="start" sideOffset={4}>
          <DropdownMenuLabel>
            {item.title}
            {item.badge ? ` (${item.badge})` : ""}
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          {item.items.map((sub) => (
            <DropdownMenuItem
              key={`${sub.title}-${sub.url}`}
              render={
                <Link
                  to={sub.url}
                  className={checkIsActive(href, sub) ? "bg-secondary" : ""}
                />
              }
            >
              {sub.icon && <sub.icon />}
              <span className="max-w-52 text-wrap">{sub.title}</span>
              {sub.badge && (
                <span className="ms-auto text-xs">{sub.badge}</span>
              )}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </SidebarMenuItem>
  );
}

function checkIsActive(href: string, item: NavItem, mainNav = false) {
  return (
    href === item.url ||
    href.split("?")[0] === item.url ||
    !!item?.items?.filter((i) => i.url === href).length ||
    (mainNav &&
      href.split("/")[1] !== "" &&
      href.split("/")[1] === item?.url?.split("/")[1])
  );
}
