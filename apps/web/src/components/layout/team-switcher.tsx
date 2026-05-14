// Adapted from shadcn-admin/src/components/layout/team-switcher.tsx
// Uses Base UI render prop pattern instead of Radix asChild
import * as React from "react";
import { ChevronsUpDown } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@ndma-dcs-staff-portal/ui/components/dropdown-menu";
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@ndma-dcs-staff-portal/ui/components/sidebar";

type TeamSwitcherProps = {
  teams: {
    name: string;
    logo: React.ElementType;
    plan: string;
  }[];
};

export function TeamSwitcher({ teams }: TeamSwitcherProps) {
  const { isMobile } = useSidebar();
  const [activeTeam, setActiveTeam] = React.useState(teams[0]);

  if (!activeTeam) return null;

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <SidebarMenuButton
                size="lg"
                className="bg-gradient-to-br from-brand-800 via-brand-700 to-brand-900 text-white hover:text-white data-[popup-open]:text-white group-data-[collapsible=icon]:!bg-gradient-to-br group-data-[collapsible=icon]:!from-brand-800 group-data-[collapsible=icon]:!to-brand-900"
              />
            }
          >
            <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-white/20 text-white backdrop-blur">
              <activeTeam.logo className="size-4" />
            </div>
            <div className="grid flex-1 text-start text-sm leading-tight">
              <span className="truncate font-semibold text-white">{activeTeam.name}</span>
              <span className="truncate text-[10.5px] uppercase tracking-wider text-white/70">
                {activeTeam.plan}
              </span>
            </div>
            <ChevronsUpDown className="ms-auto text-white/70" />
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="w-(--available-width) min-w-56 rounded-lg"
            align="start"
            side={isMobile ? "bottom" : "right"}
            sideOffset={4}
          >
            <DropdownMenuGroup>
              <DropdownMenuLabel className="text-xs text-muted-foreground">
                Organisation
              </DropdownMenuLabel>
              {teams.map((team, index) => (
                <DropdownMenuItem
                  key={team.name}
                  onClick={() => setActiveTeam(team)}
                  className="gap-2 p-2"
                >
                  <div className="flex size-6 items-center justify-center rounded-sm border">
                    <team.logo className="size-4 shrink-0" />
                  </div>
                  {team.name}
                  <DropdownMenuShortcut>⌘{index + 1}</DropdownMenuShortcut>
                </DropdownMenuItem>
              ))}
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
