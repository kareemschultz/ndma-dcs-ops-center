import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import { ArrowUpRight, BadgeCheck, TrendingUp } from "lucide-react";

import { Badge } from "@ndma-dcs-staff-portal/ui/components/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@ndma-dcs-staff-portal/ui/components/card";
import { Skeleton } from "@ndma-dcs-staff-portal/ui/components/skeleton";

import { Header } from "@/components/layout/header";
import { Main } from "@/components/layout/main";
import { ThemeSwitch } from "@/components/theme-switch";
import { useTeamFilter } from "@/lib/team-filter";
import { orpc } from "@/utils/orpc";

export const Route = createFileRoute("/_authenticated/career-progression/")({
  component: CareerProgressionPage,
});

function CareerProgressionPage() {
  const { team } = useTeamFilter();
  const { data: promotions, isLoading } = useQuery(
    orpc.appraisals.promotions.list.queryOptions({
      input: { team: team === "All" ? undefined : team },
    }),
  );

  return (
    <>
      <Header fixed>
        <div className="flex items-center gap-2">
          <TrendingUp className="size-4 text-muted-foreground" />
          <span className="text-sm font-medium">Career Progression</span>
        </div>
        <div className="ms-auto flex items-center gap-2">
          <ThemeSwitch />
        </div>
      </Header>

      <Main className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Career Progression</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Promotion letters and role changes by staff member.
          </p>
        </div>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Promotion Timeline</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {isLoading ? (
              Array.from({ length: 5 }).map((_, index) => (
                <Skeleton key={index} className="h-16 rounded-xl" />
              ))
            ) : !promotions?.length ? (
              <p className="text-sm text-muted-foreground">No promotion records available.</p>
            ) : (
              promotions.map((promotion) => (
                <div key={promotion.id} className="flex items-start justify-between gap-4 rounded-xl border p-4">
                  <div>
                    <p className="font-medium">{promotion.staffProfile?.user?.name ?? "—"}</p>
                    <p className="text-sm text-muted-foreground">
                      {promotion.fromTitle ?? "—"} <ArrowUpRight className="inline size-3" /> {promotion.toTitle}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {promotion.promotionDate ? format(parseISO(promotion.promotionDate), "dd MMM yyyy") : "—"}
                    </p>
                  </div>
                  <Badge variant="outline">
                    <BadgeCheck className="mr-1.5 size-3.5" />
                    {promotion.letterDate ? `Letter ${promotion.letterDate}` : "Promotion"}
                  </Badge>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </Main>
    </>
  );
}
