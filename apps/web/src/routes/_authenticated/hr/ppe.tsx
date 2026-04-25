import { createFileRoute, Navigate } from "@tanstack/react-router";

// Phase 0 — sidebar duplicate removed; this route now redirects to /compliance/ppe
// (the canonical PPE page per master plan §3.2). Keeping the file as a redirect
// for backward compatibility with bookmarks and old links.
export const Route = createFileRoute("/_authenticated/hr/ppe")({
  component: PpeRedirect,
});

function PpeRedirect() {
  return <Navigate to="/compliance/ppe" replace />;
}
