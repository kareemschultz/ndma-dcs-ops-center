// /leave/tosd — legacy redirect.
// TOSD (Time-Off & Sick Days) moved to the Time & Attendance module because
// it is attendance data, not leave. This stub keeps old links working.
import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/leave/tosd")({
  beforeLoad: () => {
    throw redirect({ to: "/attendance/tosd" });
  },
});
