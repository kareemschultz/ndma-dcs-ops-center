import { createFileRoute } from "@tanstack/react-router";
import { Activity, Building2, Globe, Bell } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@ndma-dcs-staff-portal/ui/components/card";
import { Header } from "@/components/layout/header";
import { Main } from "@/components/layout/main";
import { ThemeSwitch } from "@/components/theme-switch";
import { requireResource } from "@/lib/route-guard";

export const Route = createFileRoute("/_authenticated/settings/general")({
  beforeLoad: ({ context }) => requireResource(context, "settings"),
  component: GeneralSettingsPage,
});

function SettingRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-3 border-b last:border-0">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm font-medium">{value}</span>
    </div>
  );
}

function GeneralSettingsPage() {
  return (
    <>
      <Header fixed>
        <div className="flex items-center gap-2">
          <Activity className="size-4 text-muted-foreground" />
          <span className="text-sm font-medium">General Settings</span>
        </div>
        <div className="ms-auto flex items-center gap-2">
          <ThemeSwitch />
        </div>
      </Header>

      <Main>
        <div className="mb-6">
          <h1 className="text-2xl font-bold tracking-tight">General Settings</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Platform configuration and system-level settings.
          </p>
        </div>

        <div className="space-y-4 max-w-2xl">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Building2 className="size-4" />
                Organisation
              </CardTitle>
            </CardHeader>
            <CardContent>
              <SettingRow label="Organisation" value="NDMA" />
              <SettingRow label="Division" value="Data Centre Services (DCS)" />
              <SettingRow label="Platform" value="DCS Ops Center" />
              <SettingRow label="Environment" value="Production" />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Globe className="size-4" />
                Locale
              </CardTitle>
            </CardHeader>
            <CardContent>
              <SettingRow label="Timezone" value="Africa/Accra (GMT+0)" />
              <SettingRow label="Date Format" value="DD MMM YYYY" />
              <SettingRow label="Currency" value="GHS (Ghana Cedi)" />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Bell className="size-4" />
                Notifications
              </CardTitle>
            </CardHeader>
            <CardContent>
              <SettingRow label="In-App Notifications" value="Enabled" />
              <SettingRow label="Email Notifications" value="Not configured" />
              <SettingRow label="Escalation Alerts" value="See Escalation settings" />
            </CardContent>
          </Card>
        </div>
      </Main>
    </>
  );
}
