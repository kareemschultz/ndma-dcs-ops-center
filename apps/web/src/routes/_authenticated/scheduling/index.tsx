import { createFileRoute, Link } from "@tanstack/react-router";
import { CalendarClock, CalendarRange, Wrench } from "lucide-react";

import { Button } from "@ndma-dcs-staff-portal/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@ndma-dcs-staff-portal/ui/components/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@ndma-dcs-staff-portal/ui/components/tabs";

import { Header } from "@/components/layout/header";
import { Main } from "@/components/layout/main";
import { ThemeSwitch } from "@/components/theme-switch";

export const Route = createFileRoute("/_authenticated/scheduling/")({
  component: SchedulingPage,
});

function SchedulingPage() {
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

        <Tabs defaultValue="dcs" className="space-y-4">
          <TabsList variant="line" className="justify-start">
            <TabsTrigger value="dcs">DCS On-Call</TabsTrigger>
            <TabsTrigger value="noc">NOC Shifts</TabsTrigger>
            <TabsTrigger value="planner">Planner</TabsTrigger>
          </TabsList>

          <TabsContent value="dcs">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">DCS On-Call</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-wrap items-center gap-3">
                <p className="text-sm text-muted-foreground">
                  Manage DCS block assignments, swaps, and the on-call planning calendar.
                </p>
                <Button render={<Link to="/rota" />}>Open DCS On-Call</Button>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="noc">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">NOC Shifts</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-wrap items-center gap-3">
                <p className="text-sm text-muted-foreground">
                  Review the monthly shift grid and per-staff daily assignments.
                </p>
                <Button render={<Link to="/roster" />}>Open NOC Shifts</Button>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="planner">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Planner</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-wrap items-center gap-3">
                <p className="text-sm text-muted-foreground">
                  Open roster planning tools for maintenance windows and future scheduling.
                </p>
                <Button render={<Link to="/roster/planner" />}>
                  <Wrench className="mr-1.5 size-3.5" />
                  Open Planner
                </Button>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </Main>
    </>
  );
}
