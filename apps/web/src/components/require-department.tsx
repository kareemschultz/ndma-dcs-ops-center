// Department-scoped page guard.
//
// NOC vs DCS are distinct departments (ASN/Enterprise/Core are DCS sub-divisions).
// NOC-only pages (NOC Shifts, NOC Performance) must not be visible to a DCS
// `staff`/`viewer` user, and vice versa — even by typing the URL.
//
// Role-based route guards can't do this: a NOC `staff` and a DCS `staff` share
// the same Better Auth role. The department lives on the staff_profiles row, so
// this guard queries `staff.me` and redirects rank-and-file users whose
// department doesn't match.
//
// Management roles (admin, hrAdminOps, manager, teamLead, personalAssistant)
// legitimately work across both departments — they are NOT redirected.

import type { ReactNode } from "react";
import { useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";

import { Skeleton } from "@ndma-dcs-staff-portal/ui/components/skeleton";
import { orpc } from "@/utils/orpc";
import { authClient } from "@/lib/auth-client";

// Roles that legitimately operate across DCS and NOC.
const CROSS_DEPARTMENT_ROLES = new Set([
  "admin",
  "hrAdminOps",
  "manager",
  "teamLead",
  "personalAssistant",
]);

function topLevelDepartmentCode(
  profile:
    | { department?: { code?: string | null; parentId?: string | null } | null }
    | null
    | undefined,
): string | null {
  const code = profile?.department?.code;
  if (code === "NOC" || code === "DCS") return code;
  // ASN / Enterprise / Core are DCS sub-divisions — treat any non-NOC dept as DCS.
  return profile?.department ? "DCS" : null;
}

export function RequireDepartment({
  team,
  children,
}: {
  team: "NOC" | "DCS";
  children: ReactNode;
}) {
  const navigate = useNavigate();
  const { data: session } = authClient.useSession();
  const role = (session?.user as Record<string, unknown> | undefined)?.role as
    | string
    | undefined;

  const isCrossDept = role ? CROSS_DEPARTMENT_ROLES.has(role) : false;

  const { data: profile, isLoading } = useQuery({
    ...orpc.staff.me.queryOptions(),
    enabled: !isCrossDept,
  });

  const callerTeam = topLevelDepartmentCode(profile);
  const blocked = !isCrossDept && !isLoading && callerTeam !== null && callerTeam !== team;

  useEffect(() => {
    if (blocked) {
      void navigate({ to: "/" });
    }
  }, [blocked, navigate]);

  // Management roles bypass entirely.
  if (isCrossDept) return <>{children}</>;

  // Still resolving the caller's department — don't flash the page.
  if (isLoading) {
    return (
      <div className="space-y-4 p-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (blocked) {
    return (
      <div className="flex min-h-[40vh] flex-col items-center justify-center gap-2 p-8 text-center">
        <h2 className="text-lg font-semibold">Not available for your department</h2>
        <p className="text-sm text-muted-foreground">
          This page is scoped to the {team} department. Redirecting…
        </p>
      </div>
    );
  }

  return <>{children}</>;
}
