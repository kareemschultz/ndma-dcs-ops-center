import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { CalendarClock, CalendarRange } from "lucide-react";

import { Button } from "@ndma-dcs-staff-portal/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@ndma-dcs-staff-portal/ui/components/card";

import { Header } from "@/components/layout/header";
import { Main } from "@/components/layout/main";
import { ThemeSwitch } from "@/components/theme-switch";

export const Route = createFileRoute("/_authenticated/scheduling/")({
  component: SchedulingPage,
});

function SchedulingPage() {
  const navigate = useNavigate();
  return (
    <>
      <Header fixed>
        <div className="flex items-center gap-2">
          <CalendarRange className="size-4 text-muted-foreground" />
          <span className="text-sm font-medium">Scheduling &amp; Rosters</span>
        </div>
        <div className="ms-auto flex items-center gap-2">
          <ThemeSwitch />
        </div>
      </Header>

      <Main className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Scheduling &amp; Rosters</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Navigate the DCS on-call roster, NOC shift grid, and maintenance planning tools.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <CalendarClock className="size-4 text-muted-foreground" />
                DCS On-Call
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">
                View and manage the weekly DCS on-call roster with 4-role block assignments.
              </p>
              <div className="flex flex-wrap gap-2">
                <Button onClick={() => navigate({ to: "/scheduling/dcs-oncall" })}>
                  Weekly View
                </Button>
                <Button variant="outline" onClick={() => navigate({ to: "/scheduling/dcs-oncall" })}>
                  Legacy View
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <CalendarRange className="size-4 text-muted-foreground" />
                NOC Shifts
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Review the monthly NOC shift grid and per-staff daily assignments.
              </p>
              <div className="flex flex-wrap gap-2">
                <Button onClick={() => navigate({ to: "/scheduling/noc-shifts" })}>
                  Shift Grid
                </Button>
                <Button variant="outline" onClick={() => navigate({ to: "/scheduling/noc-shifts" })}>
                  Legacy View
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </Main>
    </>
  );
}
