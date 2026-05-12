import { createFileRoute, Navigate } from "@tanstack/react-router";

// Phase 16 — legacy route, superseded by the new /scheduling IA.
// Kept as a redirect for 90 days to preserve bookmarks and old links.
export const Route = createFileRoute("/_authenticated/roster/today")({
  component: LegacyRedirect,
});

function LegacyRedirect() {
  return <Navigate to="/scheduling/noc-shifts" replace />;
}
