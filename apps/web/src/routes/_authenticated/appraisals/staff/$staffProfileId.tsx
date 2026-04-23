import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, ClipboardCheck, Download, FileText, NotebookPen, Star } from "lucide-react";

import { Badge } from "@ndma-dcs-staff-portal/ui/components/badge";
import { Button } from "@ndma-dcs-staff-portal/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@ndma-dcs-staff-portal/ui/components/card";
import { Separator } from "@ndma-dcs-staff-portal/ui/components/separator";
import { Skeleton } from "@ndma-dcs-staff-portal/ui/components/skeleton";

import { Header } from "@/components/layout/header";
import { Main } from "@/components/layout/main";
import { ThemeSwitch } from "@/components/theme-switch";
import { orpc } from "@/utils/orpc";

export const Route = createFileRoute("/_authenticated/appraisals/staff/$staffProfileId")({
  component: StaffAppraisalDetailPage,
});

type Evaluation = {
  id: string;
  year: number | null;
  period: string | null;
  totalScore: number | null;
  status: string;
  reviewer?: { user?: { name?: string | null } | null } | null;
  scores?: Array<{
    id: number;
    category: string;
    criteria: string;
    score: number;
    comment: string | null;
  }>;
  notes?: Array<{
    id: number;
    noteType: string;
    content: string;
  }>;
};

type StaffSummary = {
  staffProfile: {
    id: string;
    jobTitle?: string | null;
    user?: { name?: string | null; email?: string | null } | null;
    department?: { name: string; code: string } | null;
  };
  summary: {
    averageTotalScore: number | null;
    evaluationCount: number;
    latestYear: number | null;
    latestPeriod: string | null;
    latestStatus: string | null;
  };
  evaluations: Evaluation[];
};

function ScorePill({ score }: { score: number | null }) {
  return (
    <span className="inline-flex items-center rounded-lg bg-blue-100 px-2.5 py-1 text-sm font-semibold text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">
      {score != null ? `${score}%` : "—"}
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  const tone =
    status === "approved" || status === "completed"
      ? "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300"
      : status === "submitted"
        ? "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300"
        : status === "overdue"
          ? "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300"
          : "bg-muted text-muted-foreground";
  return (
    <span className={`inline-flex items-center rounded-lg px-2.5 py-0.5 text-xs font-medium ${tone}`}>
      {status.replace("_", " ")}
    </span>
  );
}

function StaffAppraisalDetailPage() {
  const { staffProfileId } = Route.useParams();

  const { data, isLoading, isError } = useQuery(
    orpc.appraisals.getStaffSummary.queryOptions({
      input: { staffProfileId },
    }),
  );

  const summary = data as StaffSummary | undefined;

  if (isLoading) {
    return (
      <>
        <Header fixed>
          <div className="flex items-center gap-2">
            <ClipboardCheck className="size-4 text-muted-foreground" />
            <span className="text-sm font-medium">Appraisal Detail</span>
          </div>
          <div className="ms-auto flex items-center gap-2 print:hidden">
            <Button variant="outline" size="sm" onClick={() => window.print()}>
              <Download className="mr-1.5 size-3.5" />
              Export PDF
            </Button>
            <ThemeSwitch />
          </div>
        </Header>
        <Main className="space-y-6">
          <Skeleton className="h-10 w-48" />
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-64 w-full" />
        </Main>
      </>
    );
  }

  if (isError || !summary) {
    return (
      <>
        <Header fixed>
          <div className="flex items-center gap-2">
            <ClipboardCheck className="size-4 text-muted-foreground" />
            <span className="text-sm font-medium">Appraisal Detail</span>
          </div>
          <div className="ms-auto flex items-center gap-2 print:hidden">
            <Button variant="outline" size="sm" onClick={() => window.print()}>
              <Download className="mr-1.5 size-3.5" />
              Export PDF
            </Button>
            <ThemeSwitch />
          </div>
        </Header>
        <Main>
          <div className="rounded-xl border border-dashed p-8 text-sm text-muted-foreground">
            Appraisal history not found for this staff member.
          </div>
        </Main>
      </>
    );
  }

  const { staffProfile, evaluations } = summary;

  return (
    <>
      <Header fixed>
        <div className="flex items-center gap-2">
          <ClipboardCheck className="size-4 text-muted-foreground" />
          <span className="text-sm font-medium">Appraisal Detail</span>
        </div>
        <div className="ms-auto flex items-center gap-2 print:hidden">
          <Button variant="outline" size="sm" onClick={() => window.print()}>
            <Download className="mr-1.5 size-3.5" />
            Export PDF
          </Button>
          <ThemeSwitch />
        </div>
      </Header>

      <Main className="space-y-6">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" render={<Link to="/appraisals" />}>
            <ArrowLeft className="mr-1.5 size-3.5" />
            Back to Appraisals
          </Button>
        </div>

        <Card>
          <CardContent className="grid gap-6 p-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
            <div className="space-y-4">
              <div>
                <p className="text-sm uppercase tracking-wide text-muted-foreground">
                  {staffProfile.department?.code ?? "Team"}
                </p>
                <h1 className="text-3xl font-bold tracking-tight">{staffProfile.user?.name ?? "Unknown Staff"}</h1>
                <p className="mt-1 text-sm text-muted-foreground">{staffProfile.jobTitle ?? "No job title recorded"}</p>
              </div>

              <div className="flex flex-wrap gap-2">
                <Badge variant="outline">{staffProfile.department?.name ?? "Unassigned"}</Badge>
                <Badge variant="outline">{summary.summary.evaluationCount} evaluations</Badge>
                {summary.summary.latestStatus && (
                  <Badge variant="outline">{summary.summary.latestStatus.replace("_", " ")}</Badge>
                )}
              </div>
            </div>

            <div className="rounded-2xl border bg-muted/20 p-5">
              <p className="text-sm uppercase tracking-wide text-muted-foreground">Aggregated Total Score</p>
              <div className="mt-3 flex items-end gap-3">
                <p className="text-5xl font-black tracking-tight">
                  {summary.summary.averageTotalScore != null ? summary.summary.averageTotalScore : "—"}
                </p>
                {summary.summary.averageTotalScore != null && <span className="pb-1 text-xl font-semibold text-muted-foreground">%</span>}
              </div>
              <p className="mt-3 text-sm text-muted-foreground">
                Latest cycle:{" "}
                {summary.summary.latestYear != null
                  ? `${summary.summary.latestYear} ${summary.summary.latestPeriod ?? ""}`.trim()
                  : "No appraisal records yet"}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Historical Evaluations</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {evaluations.length === 0 ? (
              <div className="rounded-xl border border-dashed p-8 text-sm text-muted-foreground">
                No appraisal history found for this staff member.
              </div>
            ) : (
              evaluations.map((evaluation) => (
                <div key={evaluation.id} className="rounded-2xl border p-4">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <p className="text-sm font-semibold">
                        {evaluation.year ?? "—"} {evaluation.period ? `• ${evaluation.period}` : ""}
                      </p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        Reviewer: {evaluation.reviewer?.user?.name ?? "—"}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <ScorePill score={evaluation.totalScore} />
                      <StatusBadge status={evaluation.status} />
                    </div>
                  </div>

                  <Separator className="my-4" />

                  <div className="grid gap-4 lg:grid-cols-2">
                    <div className="space-y-3">
                      <div className="flex items-center gap-2 text-sm font-semibold">
                        <FileText className="size-4 text-muted-foreground" />
                        Score Breakdown
                      </div>
                      {evaluation.scores?.length ? (
                        <div className="space-y-2">
                          {evaluation.scores.map((score) => (
                            <div key={score.id} className="rounded-xl border px-3 py-2 text-sm">
                              <div className="flex items-center justify-between gap-3">
                                <div>
                                  <p className="font-medium">{score.category}</p>
                                  <p className="text-xs text-muted-foreground">{score.criteria}</p>
                                </div>
                                <Badge variant="outline">{score.score}</Badge>
                              </div>
                              {score.comment && (
                                <p className="mt-2 text-xs text-muted-foreground">{score.comment}</p>
                              )}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-sm text-muted-foreground">No score rows recorded.</p>
                      )}
                    </div>

                    <div className="space-y-3">
                      <div className="flex items-center gap-2 text-sm font-semibold">
                        <NotebookPen className="size-4 text-muted-foreground" />
                        Notes
                      </div>
                      {evaluation.notes?.length ? (
                        <div className="space-y-2">
                          {evaluation.notes.map((note) => (
                            <div key={note.id} className="rounded-xl border px-3 py-2 text-sm">
                              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                {note.noteType}
                              </p>
                              <p className="mt-1 whitespace-pre-wrap">{note.content}</p>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-sm text-muted-foreground">No notes recorded.</p>
                      )}
                    </div>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </Main>
    </>
  );
}
