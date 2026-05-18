import { useEffect } from "react";
import { createFileRoute, useLocation, useNavigate } from "@tanstack/react-router";
import { Settings2 } from "lucide-react";

import { Tabs, TabsList, TabsTrigger } from "@ndma-dcs-staff-portal/ui/components/tabs";

import { Header } from "@/components/layout/header";
import { Main } from "@/components/layout/main";
import { ThemeSwitch } from "@/components/theme-switch";
import { requireResource } from "@/lib/route-guard";

export const Route = createFileRoute("/_authenticated/settings/")({
  beforeLoad: ({ context }) => requireResource(context, "settings"),
  component: SettingsTabsPage,
});

type SettingsRoute =
  | "/settings/general"
  | "/settings/departments"
  | "/settings/roles"
  | "/settings/leave-types"
  | "/settings/automation"
  | "/settings/escalation"
  | "/import";

const TABS: Array<{ value: string; label: string; route: SettingsRoute }> = [
  { value: "general", label: "General", route: "/settings/general" },
  { value: "departments", label: "Departments", route: "/settings/departments" },
  { value: "roles", label: "Roles", route: "/settings/roles" },
  { value: "leave-types", label: "Leave Types", route: "/settings/leave-types" },
  { value: "automation", label: "Automation", route: "/settings/automation" },
  { value: "escalation", label: "Escalation", route: "/settings/escalation" },
  { value: "import", label: "Data Import", route: "/import" },
];

function getTabValue(pathname: string) {
  const match = TABS.find(
    (tab) => pathname === tab.route || pathname.startsWith(`${tab.route}/`),
  );
  return match?.value ?? TABS[0]?.value ?? "general";
}

function SettingsTabsPage() {
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (location.pathname === "/settings" || location.pathname === "/settings/") {
      void navigate({ to: "/settings/general", replace: true });
    }
  }, [location.pathname, navigate]);

  const value = getTabValue(location.pathname);

  return (
    <>
      <Header fixed>
        <div className="flex items-center gap-2">
          <Settings2 className="size-4 text-muted-foreground" />
          <span className="text-sm font-medium">Settings</span>
        </div>
        <div className="ms-auto flex items-center gap-2">
          <ThemeSwitch />
        </div>
      </Header>

      <Main className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage organization configuration, roles, automation, and data import.
          </p>
        </div>

        <Tabs
          value={value}
          onValueChange={(next) => {
            const target = TABS.find((tab) => tab.value === next)?.route;
            if (target && target !== location.pathname) {
              void navigate({ to: target });
            }
          }}
          className="w-full"
        >
          <TabsList
            variant="line"
            className="w-full justify-start gap-1 overflow-x-auto rounded-none border-b border-border pb-0"
          >
            {TABS.map((tab) => (
              <TabsTrigger
                key={tab.value}
                value={tab.value}
                className="px-3 py-2 text-sm font-medium"
              >
                {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </Main>
    </>
  );
}
