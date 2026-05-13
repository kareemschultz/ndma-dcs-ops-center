import { createDb } from "@ndma-dcs-staff-portal/db";
import * as schema from "@ndma-dcs-staff-portal/db/schema/auth";
import { env } from "@ndma-dcs-staff-portal/env/server";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { admin, createAccessControl } from "better-auth/plugins";

// ─── RBAC: Custom resources and actions ──────────────────────────────────────
const statement = {
  staff: ["create", "read", "update", "delete", "import", "export"] as const,
  work: ["create", "read", "update", "delete", "assign"] as const,
  leave: ["create", "read", "update", "approve", "reject", "cancel"] as const,
  rota: ["create", "read", "update", "delete", "swap"] as const,
  roster: ["create", "read", "update", "delete", "publish", "swap", "assign"] as const,
  compliance: ["create", "read", "update", "assign"] as const,
  contract: ["create", "read", "update"] as const,
  appraisal: ["create", "read", "update", "submit", "approve", "reject", "process"] as const,
  report: ["read", "export"] as const,
  audit: ["read"] as const,
  settings: ["read", "update"] as const,
  procurement: [
    "create",
    "read",
    "update",
    "delete",
    "approve",
    "reject",
    "export",
  ] as const,
  notification: ["read", "update"] as const,
  access: ["create", "read", "update", "delete"] as const,
  department_assignment: ["create", "read", "update", "delete"] as const,
  promotion_letter: ["create", "read", "update", "delete"] as const,
  performance_journal: ["create", "read", "update", "delete"] as const,
  career_path: ["create", "read", "update", "delete"] as const,
  ppe: ["create", "read", "update", "delete", "assign"] as const,
  attendance: ["create", "read", "update", "delete", "submit", "approve", "reject"] as const,
  callout: ["create", "read", "update", "delete"] as const,
  timesheet: ["create", "read", "update", "delete", "submit", "approve", "reject"] as const,
  shift: ["create", "read", "update", "delete", "publish"] as const,
  feedback: ["create", "read", "update", "delete", "submit", "approve", "reject"] as const,
  leave_policy: ["create", "read", "update", "delete"] as const,
} as const;

export const ac = createAccessControl(statement);

// Read Only — view everything, change nothing
export const readOnlyRole = ac.newRole({
  staff: ["read"],
  work: ["read"],
  leave: ["read"],
  rota: ["read"],
  roster: ["read"],
  compliance: ["read"],
  contract: ["read"],
  appraisal: ["read"],
  report: ["read"],
  audit: ["read"],
  settings: ["read"],
  procurement: ["read"],
  notification: ["read"],
  access: ["read"],
  career_path: ["read"],
  timesheet: ["read"],
  shift: ["read"],
  callout: ["read"],
  ppe: ["read"],
  leave_policy: ["read"],
});

// Staff — own profile, self-service leave, submit PRs, view rota
export const staffRole = ac.newRole({
  staff: ["read"],
  work: ["create", "read", "update"],
  leave: ["create", "read", "cancel"],
  rota: ["read", "swap"],
  roster: ["read", "swap"],
  compliance: ["read"],
  contract: ["read"],
  appraisal: ["read"],
  procurement: ["create", "read"],
  notification: ["read", "update"],
  access: ["read"],
  career_path: ["read"],
  performance_journal: ["read"],
  feedback: ["create", "read", "submit"],
  callout: ["create", "read"],
  shift: ["read"],
  timesheet: ["create", "read", "submit"],
  ppe: ["read"],
  attendance: ["read"],
  leave_policy: ["read"],
});

// Manager — approve leave, manage rota, view reports, create appraisals
export const managerRole = ac.newRole({
  staff: ["read", "update"],
  work: ["create", "read", "update", "assign"],
  leave: ["create", "read", "approve", "reject", "cancel"],
  rota: ["create", "read", "update", "swap"],
  roster: ["create", "read", "update", "publish", "swap", "assign"],
  compliance: ["read", "assign"],
  contract: ["read"],
  appraisal: ["create", "read", "update", "submit", "approve", "reject", "process"],
  report: ["read"],
  audit: ["read"],
  settings: ["read"],
  procurement: ["create", "read", "approve", "reject"],
  notification: ["read", "update"],
  access: ["read"],
  department_assignment: ["read"],
  career_path: ["read", "update"],
  promotion_letter: ["create", "read", "update"],
  performance_journal: ["create", "read", "update"],
  feedback: ["read", "approve", "reject"],
  attendance: ["create", "read", "submit", "approve", "reject"],
  callout: ["create", "read", "update"],
  ppe: ["create", "read", "update", "assign"],
  timesheet: ["create", "read", "update", "submit", "approve", "reject"],
  leave_policy: ["read"],
});

// Team Lead — direct report appraisals, operational support, limited team scoping
export const teamLeadRole = ac.newRole({
  staff: ["read", "update"],
  work: ["create", "read", "update", "assign"],
  leave: ["read", "create", "cancel"],
  rota: ["read", "swap"],
  roster: ["read", "swap"],
  compliance: ["read"],
  contract: ["read"],
  appraisal: ["create", "read", "update", "submit"],
  report: ["read"],
  notification: ["read", "update"],
  access: ["read"],
  department_assignment: ["read"],
  career_path: ["read"],
  performance_journal: ["read"],
  feedback: ["create", "read", "submit"],
  attendance: ["create", "read", "submit"],
  leave_policy: ["read"],
});

// Personal Assistant — cross-scope coordination across DCS + NOC
export const personalAssistantRole = ac.newRole({
  staff: ["read", "update"],
  work: ["read", "update"],
  leave: ["read", "create", "update", "cancel"],
  rota: ["read"],
  roster: ["read"],
  compliance: ["read"],
  contract: ["read", "update"],
  appraisal: ["create", "read", "update", "submit", "process"],
  report: ["read"],
  audit: ["read"],
  settings: ["read"],
  procurement: ["read", "create"],
  notification: ["read", "update"],
  access: ["read"],
  department_assignment: ["read"],
  promotion_letter: ["create", "read", "update"],
  performance_journal: ["create", "read", "update"],
  career_path: ["read", "update"],
  feedback: ["create", "read", "submit"],
  attendance: ["create", "read", "submit"],
  callout: ["create", "read", "update"],
  timesheet: ["create", "read", "update", "submit"],
  shift: ["read"],
  ppe: ["create", "read", "update", "assign"],
  leave_policy: ["read"],
});

// HR/Admin Ops — full staff + compliance + procurement management
export const hrAdminOpsRole = ac.newRole({
  staff: ["create", "read", "update", "delete", "import", "export"],
  work: ["create", "read", "update", "delete", "assign"],
  leave: ["create", "read", "update", "approve", "reject", "cancel"],
  rota: ["create", "read", "update", "delete", "swap"],
  roster: ["create", "read", "update", "delete", "publish", "swap", "assign"],
  compliance: ["create", "read", "update", "assign"],
  contract: ["create", "read", "update"],
  appraisal: ["create", "read", "update", "submit", "approve", "reject", "process"],
  report: ["read", "export"],
  audit: ["read"],
  settings: ["read", "update"],
  procurement: ["create", "read", "update", "delete", "approve", "reject", "export"],
  notification: ["read", "update"],
  access: ["create", "read", "update", "delete"],
  department_assignment: ["create", "read", "update", "delete"],
  promotion_letter: ["create", "read", "update", "delete"],
  performance_journal: ["create", "read", "update", "delete"],
  career_path: ["create", "read", "update", "delete"],
  ppe: ["create", "read", "update", "delete", "assign"],
  attendance: ["create", "read", "update", "delete", "submit", "approve", "reject"],
  callout: ["create", "read", "update", "delete"],
  timesheet: ["create", "read", "update", "delete", "submit", "approve", "reject"],
  shift: ["create", "read", "update", "delete", "publish"],
  feedback: ["create", "read", "update", "delete", "submit", "approve", "reject"],
  leave_policy: ["create", "read", "update", "delete"],
});

// Admin — everything (inherits from hrAdminOps + settings + audit export)
export const adminRole = ac.newRole({
  staff: ["create", "read", "update", "delete", "import", "export"],
  work: ["create", "read", "update", "delete", "assign"],
  leave: ["create", "read", "update", "approve", "reject", "cancel"],
  rota: ["create", "read", "update", "delete", "swap"],
  roster: ["create", "read", "update", "delete", "publish", "swap", "assign"],
  compliance: ["create", "read", "update", "assign"],
  contract: ["create", "read", "update"],
  appraisal: ["create", "read", "update", "submit", "approve", "reject", "process"],
  report: ["read", "export"],
  audit: ["read"],
  settings: ["read", "update"],
  procurement: ["create", "read", "update", "delete", "approve", "reject", "export"],
  notification: ["read", "update"],
  access: ["create", "read", "update", "delete"],
  department_assignment: ["create", "read", "update", "delete"],
  promotion_letter: ["create", "read", "update", "delete"],
  performance_journal: ["create", "read", "update", "delete"],
  career_path: ["create", "read", "update", "delete"],
  ppe: ["create", "read", "update", "delete", "assign"],
  attendance: ["create", "read", "update", "delete", "submit", "approve", "reject"],
  callout: ["create", "read", "update", "delete"],
  timesheet: ["create", "read", "update", "delete", "submit", "approve", "reject"],
  shift: ["create", "read", "update", "delete", "publish"],
  feedback: ["create", "read", "update", "delete", "submit", "approve", "reject"],
  leave_policy: ["create", "read", "update", "delete"],
});

// ─── Auth factory ─────────────────────────────────────────────────────────────
export function createAuth() {
  const db = createDb();

  return betterAuth({
    database: drizzleAdapter(db, {
      provider: "pg",
      schema: schema,
    }),
    // In dev CORS_ORIGIN may be "*" (allow all) or a comma-separated list of origins.
    // Better Auth doesn't support literal "*" — omit the field to trust baseURL, or
    // provide explicit origins parsed from the env var.
    trustedOrigins: env.CORS_ORIGIN === "*"
      ? undefined
      : env.CORS_ORIGIN.split(",").map((o) => o.trim()).filter(Boolean),

    // Local email+password login MUST remain enabled as emergency admin fallback
    // even when LDAP is the primary auth method.
    emailAndPassword: {
      enabled: true,
      signUpDisabled: true, // Only admins create users via import/admin UI — no public self-registration
    },

    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.BETTER_AUTH_URL,
    advanced: {
      defaultCookieAttributes: {
        sameSite: "lax",
        secure: false,
        httpOnly: true,
      },
    },
    plugins: [
      admin({
        ac,
        roles: {
          readOnly: readOnlyRole,
          staff: staffRole,
          manager: managerRole,
          teamLead: teamLeadRole,
          personalAssistant: personalAssistantRole,
          hrAdminOps: hrAdminOpsRole,
          admin: adminRole,
        },
        defaultRole: "staff",
        adminRoles: ["admin"],
      }),
    ],
  });
}

export const auth = createAuth();

// Export role type for client-side usage
export type AppRole =
  | "readOnly"
  | "staff"
  | "manager"
  | "teamLead"
  | "personalAssistant"
  | "hrAdminOps"
  | "admin";
