// /timesheets — the timesheet records builder was dropped (product decision).
// Kept as a redirect stub so old links/bookmarks resolve to the consolidated
// Timesheet Documents tab inside the Attendance module.
import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/timesheets/")({
  beforeLoad: () => {
    throw redirect({ to: "/attendance/timesheet-documents" });
  },
  component: () => null,
});
