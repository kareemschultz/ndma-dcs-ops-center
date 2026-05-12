import { createFileRoute, Navigate } from "@tanstack/react-router";

// Phase 16 — the new IA exposes "Forms" as a top-level Knowledge nav entry.
// The /policy page already renders both Policies and Forms in tabs; until we
// split this into a dedicated forms-only page (Phase 17), redirect to /policy.
export const Route = createFileRoute("/_authenticated/forms/")({
  component: FormsRedirect,
});

function FormsRedirect() {
  return <Navigate to="/policy" replace />;
}
