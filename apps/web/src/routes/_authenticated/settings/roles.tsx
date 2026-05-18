import { createFileRoute } from "@tanstack/react-router";
import { Shield, Check, X, Info } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@ndma-dcs-staff-portal/ui/components/table";
import { Header } from "@/components/layout/header";
import { Main } from "@/components/layout/main";
import { ThemeSwitch } from "@/components/theme-switch";

export const Route = createFileRoute("/_authenticated/settings/roles")({
  component: RolesSettingsPage,
});

const ROLES = [
  { key: "readOnly", label: "Read Only", description: "View-only access to all modules" },
  { key: "staff", label: "Staff", description: "Submit leaves, view rota, log work items" },
  { key: "manager", label: "Manager", description: "Approve leaves, manage team, assign work" },
  { key: "teamLead", label: "Team Lead", description: "Direct-report appraisals and team supervision" },
  { key: "personalAssistant", label: "Personal Assistant", description: "Cross-scope coordination across DCS and NOC" },
  { key: "hrAdminOps", label: "HR / Admin Ops", description: "Full HR, procurement, and compliance access" },
  { key: "admin", label: "Admin", description: "Full system access including settings and audit" },
];

const RESOURCES = [
  "staff", "work", "leave", "rota", "compliance",
  "contract", "appraisal", "report", "audit", "settings",
  "procurement", "notification", "access", "department_assignment",
  "promotion_letter", "performance_journal", "career_path", "ppe",
  "callout", "timesheet", "shift", "feedback",
];

const PERMISSIONS: Record<string, string[]> = {
  readOnly: ["staff:read", "work:read", "leave:read", "rota:read", "compliance:read", "contract:read", "appraisal:read", "report:read", "audit:read", "procurement:read", "notification:read", "access:read"],
  staff: ["staff:read", "work:create", "work:read", "leave:create", "leave:read", "rota:read", "compliance:read", "contract:read", "appraisal:read", "procurement:create", "procurement:read", "notification:read", "notification:update", "access:read"],
  manager: ["staff:read", "staff:update", "work:create", "work:read", "work:update", "work:assign", "leave:create", "leave:read", "leave:update", "rota:read", "rota:create", "rota:update", "compliance:read", "contract:read", "appraisal:read", "appraisal:create", "procurement:create", "procurement:read", "notification:read", "notification:update", "access:read", "settings:read", "department_assignment:read"],
  teamLead: ["staff:read", "staff:update", "work:create", "work:read", "work:update", "work:assign", "leave:read", "leave:create", "rota:read", "rota:swap", "compliance:read", "contract:read", "appraisal:read", "appraisal:create", "appraisal:update", "appraisal:submit", "report:read", "notification:read", "notification:update", "access:read", "department_assignment:read", "career_path:read", "feedback:create", "feedback:read", "feedback:submit"],
  personalAssistant: ["staff:read", "staff:update", "work:read", "work:update", "leave:read", "leave:create", "leave:update", "rota:read", "compliance:read", "contract:read", "contract:update", "appraisal:read", "appraisal:create", "appraisal:update", "appraisal:submit", "report:read", "audit:read", "settings:read", "procurement:read", "procurement:create", "notification:read", "notification:update", "access:read", "department_assignment:read", "promotion_letter:create", "promotion_letter:read", "promotion_letter:update", "performance_journal:create", "performance_journal:read", "performance_journal:update", "career_path:read", "career_path:update", "feedback:create", "feedback:read", "feedback:submit", "callout:read", "timesheet:read", "shift:read", "ppe:read"],
  hrAdminOps: ["staff:read", "staff:create", "staff:update", "work:read", "leave:read", "leave:update", "rota:read", "rota:create", "compliance:read", "compliance:create", "compliance:update", "contract:read", "contract:create", "contract:update", "appraisal:read", "appraisal:create", "appraisal:update", "appraisal:submit", "appraisal:approve", "appraisal:reject", "report:read", "procurement:read", "procurement:approve", "notification:read", "access:read", "access:create", "access:update", "department_assignment:read", "department_assignment:create", "department_assignment:update", "department_assignment:delete", "promotion_letter:read", "promotion_letter:create", "promotion_letter:update", "promotion_letter:delete", "performance_journal:read", "performance_journal:create", "performance_journal:update", "performance_journal:delete", "career_path:read", "career_path:create", "career_path:update", "career_path:delete", "ppe:read", "ppe:create", "ppe:update", "ppe:delete", "ppe:assign", "callout:read", "callout:create", "callout:update", "callout:delete", "timesheet:read", "timesheet:create", "timesheet:update", "timesheet:delete", "timesheet:submit", "timesheet:approve", "timesheet:reject", "shift:read", "shift:create", "shift:update", "shift:delete", "shift:publish", "feedback:read", "feedback:create", "feedback:update", "feedback:delete", "feedback:submit", "feedback:approve", "feedback:reject"],
  admin: RESOURCES.flatMap((r) => [`${r}:create`, `${r}:read`, `${r}:update`, `${r}:delete`, `${r}:submit`, `${r}:approve`, `${r}:reject`, `${r}:assign`, `${r}:publish`]),
};

function RolesSettingsPage() {
  return (
    <>
      <Header fixed>
        <div className="flex items-center gap-2">
          <Shield className="size-4 text-muted-foreground" />
          <span className="text-sm font-medium">Roles & Permissions</span>
        </div>
        <div className="ms-auto flex items-center gap-2">
          <ThemeSwitch />
        </div>
      </Header>

      <Main>
        <div className="mb-6">
          <h1 className="text-2xl font-bold tracking-tight">Roles & Permissions</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Expanded RBAC model. Roles are assigned at user creation via the Better Auth Admin plugin.
          </p>
          <div className="mt-3 flex items-start gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-800 dark:border-blue-900/50 dark:bg-blue-950/40 dark:text-blue-300">
            <Info className="mt-0.5 size-4 shrink-0" />
            <span>
              Roles and their permissions are defined in system configuration.
              Contact a system administrator to change them.
            </span>
          </div>
        </div>

        {/* Role cards */}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 mb-8">
          {ROLES.map((role) => (
            <div key={role.key} className="rounded-xl border p-3">
              <p className="text-sm font-semibold">{role.label}</p>
              <p className="text-xs text-muted-foreground mt-1">{role.description}</p>
            </div>
          ))}
        </div>

        {/* Permission matrix */}
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
          Permission Matrix
        </h2>

        <div className="rounded-xl border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="min-w-[120px]">Resource</TableHead>
                {ROLES.map((r) => (
                  <TableHead key={r.key} className="text-center text-xs">{r.label}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {RESOURCES.map((resource) => (
                <TableRow key={resource}>
                  <TableCell className="font-mono text-xs">{resource}</TableCell>
                  {ROLES.map((role) => {
                    const hasRead = PERMISSIONS[role.key]?.includes(`${resource}:read`);
                    const hasWrite = PERMISSIONS[role.key]?.some((p) =>
                      p.startsWith(`${resource}:`) && p !== `${resource}:read`
                    );
                    return (
                      <TableCell key={role.key} className="text-center">
                        {hasRead ? (
                          <span className="inline-flex items-center gap-0.5 text-xs text-blue-600">
                            <Check className="size-3" />
                            {hasWrite ? "R/W" : "R"}
                          </span>
                        ) : (
                          <X className="size-3 text-muted-foreground mx-auto" />
                        )}
                      </TableCell>
                    );
                  })}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Main>
    </>
  );
}
