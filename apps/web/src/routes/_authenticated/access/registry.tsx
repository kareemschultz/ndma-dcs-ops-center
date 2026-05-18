import { useMemo, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Key, Search, Shield, ExternalLink } from "lucide-react";
import { Button } from "@ndma-dcs-staff-portal/ui/components/button";
import { Input } from "@ndma-dcs-staff-portal/ui/components/input";
import { Skeleton } from "@ndma-dcs-staff-portal/ui/components/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@ndma-dcs-staff-portal/ui/components/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@ndma-dcs-staff-portal/ui/components/table";
import { AccessSubNav } from "@/components/layout/access-sub-nav";
import { InfoPopover } from "@/components/info-popover";
import { DataPagination, usePagination } from "@/components/data-pagination";
import { Header } from "@/components/layout/header";
import { Main } from "@/components/layout/main";
import { ThemeSwitch } from "@/components/theme-switch";
import { orpc } from "@/utils/orpc";

export const Route = createFileRoute("/_authenticated/access/registry")({
  component: AccessRegistryPage,
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
      {level.replace("_", " ")}
    </span>
  );
}

function AccessRegistryPage() {
  const navigate = useNavigate();
  const [platformId, setPlatformId] = useState<string>("");
  const [search, setSearch] = useState("");

  const { data: platforms, isLoading: platformsLoading } = useQuery(
    orpc.platforms.list.queryOptions(),
  );

  const { data: rows, isLoading: rowsLoading } = useQuery({
    ...orpc.accessRegistry.listByPlatform.queryOptions({
      input: { platformId: platformId || "" },
    }),
    enabled: !!platformId,
  });

  const filteredRows = useMemo(() => {
    if (!rows) return [];
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => {
      const name = r.staff?.user?.name?.toLowerCase() ?? "";
      const email = r.staff?.user?.email?.toLowerCase() ?? "";
      const username = r.accountUsername?.toLowerCase() ?? "";
      return name.includes(q) || email.includes(q) || username.includes(q);
    });
  }, [rows, search]);

  const pagination = usePagination(filteredRows, 50);

  const selectedPlatform = platforms?.find((p) => p.id === platformId);

  return (
    <>
      <Header>
        <div className="flex items-center gap-2">
          <Key className="h-5 w-5" />
          <h1 className="text-lg font-semibold">Access Registry</h1>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Button variant="outline" onClick={() => navigate({ to: "/access/platforms" })}>
            <Shield className="mr-2 h-4 w-4" />
            Manage platforms
          </Button>
          <ThemeSwitch />
        </div>
      </Header>
      <AccessSubNav activeView="registry" />
      <Main>
        <div className="mb-6 flex max-w-3xl items-start gap-1.5 text-sm text-muted-foreground">
          <span>
            A record of every staff member's access on each platform. Add and maintain
            these records manually below.
          </span>
          <InfoPopover label="About the Access Registry">
            One row per staff member per platform. Records who can log into what
            — keep it current as access changes.
          </InfoPopover>
        </div>

        <div className="mb-4 flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Platform
            </label>
            <Select value={platformId} onValueChange={(v) => setPlatformId(v ?? "")}>
              <SelectTrigger className="w-[260px]">
                <SelectValue placeholder={platformsLoading ? "Loading…" : "Select a platform"} />
              </SelectTrigger>
              <SelectContent>
                {platforms?.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex-1 space-y-1">
            <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Search staff
            </label>
            <div className="relative max-w-md">
              <Search className="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="name, email, or username…"
                className="pl-8"
                disabled={!platformId}
              />
            </div>
          </div>
        </div>

        {!platformId ? (
          <div className="rounded-md border border-dashed py-16 text-center text-muted-foreground">
            <Key className="mx-auto mb-3 h-10 w-10 opacity-50" />
            <p className="font-medium text-foreground">Select a platform to view access records</p>
            <p className="mt-1 text-sm">
              Don't see one?{" "}
              <Link to="/access/platforms" className="underline">
                Create a platform first
              </Link>
              .
            </p>
          </div>
        ) : (
          <>
            {selectedPlatform && (
              <div className="mb-3 text-sm text-muted-foreground">
                Showing {filteredRows.length} of {rows?.length ?? 0} records on{" "}
                <span className="font-semibold text-foreground">{selectedPlatform.name}</span>
                {selectedPlatform.notes && (
                  <span className="ml-2 italic">— {selectedPlatform.notes}</span>
                )}
              </div>
            )}
            <div className="overflow-x-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Staff</TableHead>
                    <TableHead>Username</TableHead>
                    <TableHead>Account type</TableHead>
                    <TableHead>Privilege</TableHead>
                    <TableHead>Groups</TableHead>
                    <TableHead>Source</TableHead>
                    <TableHead className="w-12"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rowsLoading ? (
                    Array.from({ length: 5 }).map((_, i) => (
                      <TableRow key={i}>
                        {Array.from({ length: 7 }).map((_, j) => (
                          <TableCell key={j}>
                            <Skeleton className="h-4 w-full" />
                          </TableCell>
                        ))}
                      </TableRow>
                    ))
                  ) : filteredRows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="py-12 text-center text-muted-foreground">
                        No staff have access records on this platform yet.
                      </TableCell>
                    </TableRow>
                  ) : (
                    pagination.pageItems.map((r) => (
                      <TableRow key={r.id}>
                        <TableCell>
                          <Link
                            to="/staff/$staffId"
                            params={{ staffId: r.staffId }}
                            className="font-medium hover:underline"
                          >
                            {r.staff?.user?.name ?? r.staff?.employeeId ?? "—"}
                          </Link>
                          <div className="text-xs text-muted-foreground">
                            {r.staff?.department?.name ?? "—"}
                          </div>
                        </TableCell>
                        <TableCell className="font-mono text-sm">
                          {r.accountUsername ?? <span className="text-muted-foreground">—</span>}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground capitalize">
                          {r.accountType ? r.accountType.replace("_", " ") : "—"}
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
                        <TableCell className="text-xs text-muted-foreground">
                          {r.privilegeSource === "manual"
                            ? "manual"
                            : r.privilegeSource === "synced"
                              ? "🔄 synced"
                              : "🔁 hybrid-verified"}
                        </TableCell>
                        <TableCell>
                          <Link
                            to="/staff/$staffId"
                            params={{ staffId: r.staffId }}
                            className="text-muted-foreground hover:text-foreground"
                            aria-label="Open staff profile"
                          >
                            <ExternalLink className="h-4 w-4" />
                          </Link>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
              <div className="border-t px-2">
                <DataPagination
                  page={pagination.page}
                  pageCount={pagination.pageCount}
                  total={pagination.total}
                  rangeLabel={pagination.rangeLabel}
                  onPageChange={pagination.setPage}
                />
              </div>
            </div>
          </>
        )}
      </Main>
    </>
  );
}
