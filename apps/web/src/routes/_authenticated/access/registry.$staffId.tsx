import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Key, Shield } from "lucide-react";
import { Button } from "@ndma-dcs-staff-portal/ui/components/button";
import { Skeleton } from "@ndma-dcs-staff-portal/ui/components/skeleton";
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
import { orpc } from "@/utils/orpc";

export const Route = createFileRoute("/_authenticated/access/registry/$staffId")({
  component: RegistryStaffDetailPage,
});

const PRIVILEGE_COLORS: Record<string, string> = {
  admin: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200",
  operator: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200",
  read_only: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200",
  auditor: "bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-200",
  custom: "bg-muted text-muted-foreground",
  none: "bg-muted text-muted-foreground line-through",
};

function PrivilegePill({ level }: { level: string | null }) {
  if (!level) return <span className="text-xs text-muted-foreground">—</span>;
  return (
    <span
      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
        PRIVILEGE_COLORS[level] ?? PRIVILEGE_COLORS.custom
      }`}
    >
      {level.replace(/_/g, " ")}
    </span>
  );
}

function ActiveBadge({ active }: { active: boolean | null }) {
  if (active === null || active === undefined) {
    return <span className="text-xs text-muted-foreground">—</span>;
  }
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
        active
          ? "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200"
          : "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200"
      }`}
    >
      {active ? "Active" : "Inactive"}
    </span>
  );
}

function RegistryStaffDetailPage() {
  const { staffId } = Route.useParams();

  const { data: rows, isLoading } = useQuery(
    orpc.accessRegistry.listByStaff.queryOptions({ input: { staffId } }),
  );

  const staffName = rows?.[0]?.staff?.user?.name;
  const staffDept = rows?.[0]?.staff?.department?.name;

  return (
    <>
      <Header>
        <div className="flex items-center gap-2">
          <Key className="h-5 w-5" />
          <Link
            to="/access/registry"
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            Access Registry
          </Link>
          <span className="text-muted-foreground">/</span>
          <span className="text-sm font-medium">
            {isLoading ? "Loading…" : (staffName ?? staffId)}
          </span>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <ThemeSwitch />
        </div>
      </Header>

      <Main>
        <div className="mb-4 flex items-center gap-3">
          <Link to="/access/registry">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="size-4" />
            </Button>
          </Link>
          <div>
            {isLoading ? (
              <Skeleton className="h-6 w-48" />
            ) : (
              <>
                <h1 className="text-xl font-bold">{staffName ?? "Staff Member"}</h1>
                {staffDept && (
                  <p className="text-sm text-muted-foreground">{staffDept}</p>
                )}
              </>
            )}
          </div>
        </div>

        {isLoading ? (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  {["Platform", "Username", "Account Type", "Privilege", "Groups", "Status"].map(
                    (h) => (
                      <TableHead key={h}>{h}</TableHead>
                    ),
                  )}
                </TableRow>
              </TableHeader>
              <TableBody>
                {Array.from({ length: 4 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 6 }).map((_, j) => (
                      <TableCell key={j}>
                        <Skeleton className="h-4 w-full" />
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : !rows || rows.length === 0 ? (
          <div className="rounded-md border border-dashed py-16 text-center text-muted-foreground">
            <Shield className="mx-auto mb-3 h-10 w-10 opacity-50" />
            <p className="font-medium text-foreground">No access records found</p>
            <p className="mt-1 text-sm">
              This staff member has no platform accounts registered yet.
            </p>
          </div>
        ) : (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Platform</TableHead>
                  <TableHead>Username</TableHead>
                  <TableHead>Account Type</TableHead>
                  <TableHead>Privilege</TableHead>
                  <TableHead>Groups</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">
                      {r.platform?.name ?? (
                        <span className="text-muted-foreground">—</span>
                      )}
                      {r.platform?.notes && (
                        <p className="text-xs text-muted-foreground">{r.platform.notes}</p>
                      )}
                    </TableCell>
                    <TableCell className="font-mono text-sm">
                      {r.accountUsername ?? (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm capitalize text-muted-foreground">
                      {r.accountType ? r.accountType.replace(/_/g, " ") : "—"}
                    </TableCell>
                    <TableCell>
                      <PrivilegePill level={r.privilegeLevel} />
                    </TableCell>
                    <TableCell className="max-w-xs">
                      {r.privilegeGroups && r.privilegeGroups.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {r.privilegeGroups.map((g) => (
                            <span
                              key={g}
                              className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs"
                            >
                              {g}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <ActiveBadge active={r.accountActive} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        <div className="mt-4 flex gap-2">
          <Link to="/staff/$staffId" params={{ staffId }}>
            <Button variant="outline" size="sm">
              View Staff Profile
            </Button>
          </Link>
        </div>
      </Main>
    </>
  );
}
