// /attendance/monthly — legacy redirect.
// The monthly attendance grid is now a view mode inside /attendance/roll-call
// (Roll-Call page → Daily | Monthly toggle). This stub keeps old links working.
import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/attendance/monthly")({
  beforeLoad: () => {
    throw redirect({ to: "/attendance/roll-call" });
  },
});
