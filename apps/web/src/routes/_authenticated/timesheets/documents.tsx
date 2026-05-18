// /timesheets/documents — consolidated into the Attendance module.
// Kept as a redirect stub so old links/bookmarks still resolve.
import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/timesheets/documents")({
  beforeLoad: () => {
    throw redirect({ to: "/attendance/timesheet-documents" });
  },
  component: () => null,
});
