// Client-side route RBAC guard.
//
// The server is the real authority (every oRPC procedure runs requireRole), but
// a `staff`-role user typing /settings, /audit, /import, /access directly into
// the URL bar must be bounced BEFORE the page renders — otherwise the page
// shell flashes and fires privileged queries that 403 noisily.
//
// `requireResource()` is meant for a route's `beforeLoad`. It reads the user
// off the `_authenticated` route context, checks the role→resource map, and
// throws a redirect to `/` (with a `denied` flag) when the role lacks access.
//
// This map MUST stay in sync with ROLE_RESOURCES in
// components/layout/nav-group.tsx and the RBAC matrix in packages/auth/src/index.ts.

import { redirect } from "@tanstack/react-router";

// Role → resources the role may access. Mirrors ROLE_RESOURCES in
// components/layout/nav-group.tsx. Fails CLOSED: an unknown role gets nothing.
const ROLE_RESOURCES: Record<string, readonly string[] | readonly ["*"]> = {
  admin: ["*"],
  hrAdminOps: [
    "staff", "work", "leave", "rota", "compliance", "contract", "appraisal",
    "report", "audit", "settings", "procurement", "notification", "access",
  ],
  manager: [
    "staff", "work", "leave", "rota", "compliance", "contract", "appraisal",
    "report", "audit", "procurement", "notification", "access",
  ],
  teamLead: [
    "staff", "work", "leave", "rota", "compliance", "contract", "appraisal",
    "procurement", "notification", "access",
  ],
  personalAssistant: [
    "staff", "work", "leave", "rota", "compliance", "contract", "appraisal",
    "report", "audit", "settings", "procurement", "notification", "access",
  ],
  // staff = self-service portal only. NO settings/audit/access/report/import.
  staff: [
    "work", "leave", "rota", "compliance", "contract", "appraisal",
    "procurement", "notification",
  ],
  // readOnly = view broadly but no admin surfaces.
  readOnly: [
    "staff", "work", "leave", "rota", "compliance", "contract", "appraisal",
    "report", "procurement", "notification",
  ],
};

export function roleCanAccess(
  role: string | null | undefined,
  resource: string,
): boolean {
  const allowed = ROLE_RESOURCES[role ?? ""];
  if (!allowed) return false; // unknown / missing role → fail closed
  if (allowed[0] === "*") return true;
  return (allowed as readonly string[]).includes(resource);
}

type GuardContext = {
  user?: { role?: string | null } | null;
};

/**
 * Route `beforeLoad` guard. Throws a redirect to `/` if the signed-in user's
 * role lacks `resource`. Use on every admin/management route.
 *
 *   beforeLoad: ({ context }) => requireResource(context, "settings"),
 */
export function requireResource(context: GuardContext, resource: string): void {
  const role = context.user?.role ?? null;
  if (!roleCanAccess(role, resource)) {
    throw redirect({ to: "/" });
  }
}
