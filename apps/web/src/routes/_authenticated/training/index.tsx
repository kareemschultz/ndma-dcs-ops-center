import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { BookOpen, RefreshCw, Send, ShieldCheck, LibraryBig } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@ndma-dcs-staff-portal/ui/components/badge";
import { Button } from "@ndma-dcs-staff-portal/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@ndma-dcs-staff-portal/ui/components/card";
import { Skeleton } from "@ndma-dcs-staff-portal/ui/components/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@ndma-dcs-staff-portal/ui/components/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@ndma-dcs-staff-portal/ui/components/table";

import { Header } from "@/components/layout/header";
import { Main } from "@/components/layout/main";
import { ThemeSwitch } from "@/components/theme-switch";
import { useTeamFilter } from "@/lib/team-filter";
import { orpc } from "@/utils/orpc";

export const Route = createFileRoute("/_authenticated/training/")({
  component: TrainingRecordsPage,
});

function TrainingRecordsPage() {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState("logs");
  const { team } = useTeamFilter();

  const { data: records, isLoading: recordsLoading } = useQuery(
    orpc.compliance.training.records.list.queryOptions({
      input: { team: team === "All" ? undefined : team, limit: 200 },
    }),
  );
  const { data: courses, isLoading: coursesLoading } = useQuery(orpc.compliance.training.courses.list.queryOptions());
  const { data: budgets, isLoading: budgetsLoading } = useQuery(
    orpc.compliance.training.budgets.list.queryOptions({
      input: {},
    }),
  );

  const sendReminder = useMutation(
    orpc.compliance.training.records.sendReminder.mutationOptions({
      onSuccess: async () => {
        toast.success("Reminder sent");
        await queryClient.invalidateQueries({ queryKey: orpc.notifications.list.key() });
      },
      onError: (error: Error) => toast.error(error.message),
    }),
  );

  const pendingCount = useMemo(
    () => (records ?? []).filter((record) => record.status !== "Completed").length,
    [records],
  );
  const budgetSummary = useMemo(() => {
    const grouped = new Map<number, { estimated: number; actual: number; count: number }>();
    for (const row of budgets ?? []) {
      const current = grouped.get(row.year) ?? { estimated: 0, actual: 0, count: 0 };
      grouped.set(row.year, {
        estimated: current.estimated + Number(row.estimatedCost ?? 0),
        actual: current.actual + Number(row.actualCost ?? 0),
        count: current.count + 1,
      });
    }
    return [...grouped.entries()].map(([year, summary]) => ({ year, ...summary })).sort((a, b) => a.year - b.year);
  }, [budgets]);

  return (
    <>
      <Header fixed>
        <div className="flex items-center gap-2">
          <BookOpen className="size-4 text-muted-foreground" />
          <span className="text-sm font-medium">Training Records</span>
        </div>
        <div className="ms-auto flex items-center gap-2">
          <ThemeSwitch />
            <Button
            size="sm"
            variant="outline"
            onClick={() => queryClient.invalidateQueries({ queryKey: orpc.compliance.training.records.list.key() })}
          >
            <RefreshCw className="mr-1.5 size-3.5" />
            Refresh
          </Button>
        </div>
      </Header>

      <Main className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Training Records</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Staff training logs, syllabus materials, and budget forecasting by department.
          </p>
        </div>

        <Tabs value={tab} onValueChange={setTab} className="space-y-4">
          <TabsList variant="line" className="justify-start">
            <TabsTrigger value="logs">Staff Training Logs</TabsTrigger>
            <TabsTrigger value="syllabus">Curriculum &amp; Syllabus</TabsTrigger>
            <TabsTrigger value="budgets">Budget &amp; Forecasting</TabsTrigger>
          </TabsList>

          <TabsContent value="logs" className="space-y-4">
            <div className="grid gap-4 md:grid-cols-3">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Training Records</CardTitle>
                </CardHeader>
                <CardContent className="text-2xl font-bold">{records?.length ?? "—"}</CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Pending Follow-ups</CardTitle>
                </CardHeader>
                <CardContent className="text-2xl font-bold">{pendingCount}</CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Scope</CardTitle>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground">
                  {team === "All" ? "All staff" : `${team} only`}
                </CardContent>
              </Card>
            </div>

            <div className="rounded-xl border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Staff</TableHead>
                    <TableHead>Course</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Target</TableHead>
                    <TableHead>Vendor</TableHead>
                    <TableHead className="w-40">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recordsLoading ? (
                    Array.from({ length: 6 }).map((_, i) => (
                      <TableRow key={i}>
                        {Array.from({ length: 6 }).map((_, j) => (
                          <TableCell key={j}>
                            <Skeleton className="h-4 w-full" />
                          </TableCell>
                        ))}
                      </TableRow>
                    ))
                  ) : !records?.length ? (
                    <TableRow>
                      <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                        No training records found.
                      </TableCell>
                    </TableRow>
                  ) : (
                    records.map((record) => (
                      <TableRow key={record.id}>
                        <TableCell className="font-medium">
                          {record.staffProfile?.user?.name ?? "—"}
                        </TableCell>
                        <TableCell>{record.course?.title ?? "—"}</TableCell>
                        <TableCell>
                          <Badge variant="outline">{record.status}</Badge>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {record.targetDate ?? "—"}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {record.course?.vendor ?? "—"}
                        </TableCell>
                        <TableCell>
                          {record.status !== "Completed" && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => sendReminder.mutate({ recordId: record.id })}
                            >
                              <Send className="mr-1.5 size-3.5" />
                              Send Reminder
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </TabsContent>

          <TabsContent value="syllabus" className="space-y-4">
            <div className="grid gap-4 lg:grid-cols-2">
              {coursesLoading ? (
                Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-48 rounded-xl" />)
              ) : (
                (courses ?? []).map((course) => (
                  <Card key={course.id}>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base">{course.title}</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3 text-sm">
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <ShieldCheck className="size-4" />
                        {course.vendor} · {course.courseType}
                      </div>
                      <div className="space-y-2">
                        {(course.materials ?? []).map((material) => (
                          <div key={material.id} className="rounded-lg border px-3 py-2">
                            <p className="font-medium">{material.title}</p>
                            <p className="text-xs text-muted-foreground">
                              {material.materialType}
                              {material.referenceLink ? ` · ${material.referenceLink}` : ""}
                            </p>
                          </div>
                        ))}
                        {(!course.materials || course.materials.length === 0) && (
                          <p className="text-sm text-muted-foreground">No syllabus materials yet.</p>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))
              )}
            </div>
          </TabsContent>

          <TabsContent value="budgets" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Budget &amp; Forecasting</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <LibraryBig className="size-4" />
                  Certification budget data grouped by year.
                </div>
                <div className="rounded-xl border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Year</TableHead>
                        <TableHead>Certifications</TableHead>
                        <TableHead>Estimated</TableHead>
                        <TableHead>Actual</TableHead>
                        <TableHead>Variance</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {budgetsLoading ? (
                        Array.from({ length: 4 }).map((_, i) => (
                          <TableRow key={i}>
                            {Array.from({ length: 5 }).map((_, j) => (
                              <TableCell key={j}>
                                <Skeleton className="h-4 w-full" />
                              </TableCell>
                            ))}
                          </TableRow>
                        ))
                      ) : !budgetSummary.length ? (
                        <TableRow>
                          <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                            No certification budget data available.
                          </TableCell>
                        </TableRow>
                      ) : (
                        budgetSummary.map((row) => (
                          <TableRow key={row.year}>
                            <TableCell className="font-medium">{row.year}</TableCell>
                            <TableCell>{row.count}</TableCell>
                            <TableCell>{row.estimated}</TableCell>
                            <TableCell>{row.actual}</TableCell>
                            <TableCell>{row.estimated - row.actual}</TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </Main>
    </>
  );
}
