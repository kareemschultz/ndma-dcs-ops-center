import { useEffect } from "react";
import { createFileRoute, useLocation, useNavigate } from "@tanstack/react-router";
import { ShieldCheck } from "lucide-react";

import { Tabs, TabsList, TabsTrigger } from "@ndma-dcs-staff-portal/ui/components/tabs";

import { Header } from "@/components/layout/header";
import { Main } from "@/components/layout/main";
import { ThemeSwitch } from "@/components/theme-switch";

export const Route = createFileRoute("/_authenticated/compliance/")({
  component: ComplianceTabsPage,
});

type ComplianceRoute =
  | "/compliance/ppe"
  | "/compliance/items"
  | "/compliance/training";

const TABS: Array<{ value: string; label: string; route: ComplianceRoute }> = [
  { value: "ppe", label: "PPE", route: "/compliance/ppe" },
  { value: "items", label: "Items", route: "/compliance/items" },
  { value: "training", label: "Training", route: "/compliance/training" },
];

function getTabValue(pathname: string) {
  const match = TABS.find(
    (tab) => pathname === tab.route || pathname.startsWith(`${tab.route}/`),
  );
  return match?.value ?? TABS[0]?.value ?? "ppe";
}

function ComplianceTabsPage() {
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (location.pathname === "/compliance" || location.pathname === "/compliance/") {
      void navigate({ to: "/compliance/ppe", replace: true });
    }
  }, [location.pathname, navigate]);

  const value = getTabValue(location.pathname);

  return (
    <>
      <Header fixed>
        <div className="flex items-center gap-2">
          <ShieldCheck className="size-4 text-muted-foreground" />
          <span className="text-sm font-medium">Compliance</span>
        </div>
        <div className="ms-auto flex items-center gap-2">
          <ThemeSwitch />
        </div>
      </Header>

      <Main className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Compliance</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            PPE issuances, compliance items, and training records.
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
