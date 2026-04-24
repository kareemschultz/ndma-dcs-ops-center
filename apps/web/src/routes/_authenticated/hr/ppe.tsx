import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/hr/ppe")({
  beforeLoad: async () => {
    throw redirect({ to: "/compliance/ppe" });
  },
});
