import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation } from "@tanstack/react-query";
import { format, parseISO, isPast } from "date-fns";
import {
  ArrowLeft,
  Key,
  Network,
  Users,
  Shield,
  CheckCircle,
  XCircle,
  AlertCircle,
  Clock,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@ndma-dcs-staff-portal/ui/components/button";
import { Skeleton } from "@ndma-dcs-staff-portal/ui/components/skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@ndma-dcs-staff-portal/ui/components/card";
import { Header } from "@/components/layout/header";
import { Main } from "@/components/layout/main";
import { ThemeSwitch } from "@/components/theme-switch";
import { orpc, queryClient } from "@/utils/orpc";

export const Route = createFileRoute("/_authenticated/access/$accountId")({
  component: AccountDetailPage,
});

type Platform =
  | "vpn" | "fortigate" | "uportal" | "biometric" | "ad"
  | "ipam" | "phpipam" | "radius" | "zabbix" | "other";

const PLATFORM_LABELS: Record<Platform, string> = {
  vpn: "VPN", fortigate: "Fortigate", uportal: "uPortal",
  biometric: "Biometric", ad: "Active Directory", ipam: "IPAM",
  phpipam: "phpIPAM", radius: "RADIUS", zabbix: "Zabbix", other: "Other",
};

const STATUS_COLORS: Record<string, string> = {
  active: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  suspended: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  disabled: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
  pending_creation: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  orphaned: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
  pending_review: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
};

const REVIEW_STATUS_COLORS: Record<string, string> = {
  pending: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  approved: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  revoked: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
  escalated: "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300",
};

type Tab = "overview" | "groups" | "reviews";

function AccountDetailPage() {
  const { accountId } = Route.useParams();
  const [activeTab, setActiveTab] = useState<Tab>("overview");

  const { data: account, isLoading } = useQuery(
    orpc.access.accounts.get.queryOptions({ input: { id: accountId } })
  );

  const disableMutation = useMutation(
    orpc.access.accounts.disable.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: orpc.access.accounts.list.key() });
        toast.success("Account disabled");
      },
      onError: (err) => toast.error(err.message),
    })
  );

  const markReviewedMutation = useMutation(
    orpc.access.accounts.markReviewed.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: orpc.access.accounts.list.key() });
        toast.success("Account marked as reviewed");
      },
      onError: (err) => toast.error(err.message),
    })
  );

  if (isLoading) {
    return (
      <>
        <Header fixed>
          <div className="flex items-center gap-2">
            <Key className="size-4 text-muted-foreground" />
            <span className="text-sm font-medium">Account Detail</span>
          </div>
          <div className="ms-auto"><ThemeSwitch /></div>
        </Header>
        <Main>
          <Skeleton className="h-8 w-64 mb-6" />
          <Skeleton className="h-40 w-full rounded-xl" />
        </Main>
      </>
    );
  }

  if (!account) {
    return (
      <>
        <Header fixed>
          <div className="flex items-center gap-2">
            <Key className="size-4 text-muted-foreground" />
            <span className="text-sm font-medium">Account Detail</span>
          </div>
          <div className="ms-auto"><ThemeSwitch /></div>
        </Header>
        <Main>
          <div className="flex items-center gap-2 text-muted-foreground py-20 justify-center">
            <AlertCircle className="size-5" />
            Account not found.
          </div>
        </Main>
      </>
    );
  }

  const displayName =
    account.staffProfile?.user?.name ??
    account.externalContact?.name ??
    account.displayName ??
    account.accountIdentifier;

  const isExpired = account.expiresAt && isPast(parseISO(account.expiresAt));
  const isReviewDue =
    account.reviewDueDate && isPast(parseISO(account.reviewDueDate));

  const activeGroupMemberships = account.groupMemberships ?? [];

  return (
    <>
      <Header fixed>
        <div className="flex items-center gap-2">
          <Link to="/access" className="text-muted-foreground hover:text-foreground">
            <ArrowLeft className="size-4" />
          </Link>
          <Key className="size-4 text-muted-foreground" />
          <span className="text-sm font-medium">{displayName}</span>
        </div>
        <div className="ms-auto flex items-center gap-2">
          <ThemeSwitch />
        </div>
      </Header>

      <Main>
        {/* Header */}
        <div className="mb-6 flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{displayName}</h1>
            <p className="text-sm text-muted-foreground mt-1">
              {PLATFORM_LABELS[account.platform as Platform] ?? account.platform}
              {" · "}
              <span className="font-mono">{account.accountIdentifier}</span>
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className={`inline-flex items-center rounded-lg px-2 py-1 text-xs font-medium ${STATUS_COLORS[account.status] ?? "bg-muted text-muted-foreground"}`}>
              {account.status.replace(/_/g, " ")}
            </span>
            {account.status !== "disabled" && (
              <Button
                size="sm"
                variant="outline"
                className="text-xs text-red-600 hover:text-red-700 h-8"
                onClick={() => disableMutation.mutate({ id: accountId, reason: "Manual disable from admin" })}
                disabled={disableMutation.isPending}
              >
                <XCircle className="size-3 mr-1" />
                Disable
              </Button>
            )}
            <Button
              size="sm"
              variant="outline"
              className="text-xs h-8"
              onClick={() => markReviewedMutation.mutate({ id: accountId })}
              disabled={markReviewedMutation.isPending}
            >
              <CheckCircle className="size-3 mr-1" />
              Mark Reviewed
            </Button>
          </div>
        </div>

        {/* Alert banners */}
        {isExpired && (
          <div className="mb-4 flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 dark:bg-red-900/20 p-3 text-sm text-red-700 dark:text-red-300">
            <AlertCircle className="size-4 shrink-0" />
            This account expired on {format(parseISO(account.expiresAt!), "dd MMM yyyy")}.
          </div>
        )}
        {isReviewDue && !isExpired && (
          <div className="mb-4 flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 dark:bg-amber-900/20 p-3 text-sm text-amber-700 dark:text-amber-300">
            <AlertCircle className="size-4 shrink-0" />
            Access review was due on {format(parseISO(account.reviewDueDate!), "dd MMM yyyy")}.
          </div>
        )}

        {/* Tabs */}
        <div className="mb-4 flex gap-1 border-b">
          {([
            { key: "overview" as Tab, label: "Overview", icon: Key },
            { key: "groups" as Tab, label: `Groups (${activeGroupMemberships.length})`, icon: Users },
            { key: "reviews" as Tab, label: `Reviews (${account.reviews?.length ?? 0})`, icon: Shield },
          ]).map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium transition-colors ${
                activeTab === tab.key
                  ? "border-b-2 border-primary text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <tab.icon className="size-3.5" />
              {tab.label}
            </button>
          ))}
        </div>

        {/* ── Overview Tab ─────────────────────────────────────────────── */}
        {activeTab === "overview" && (
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Key className="size-4" />Account Details
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <Row label="Platform" value={PLATFORM_LABELS[account.platform as Platform] ?? account.platform} />
                <Row label="Account ID" value={<span className="font-mono">{account.accountIdentifier}</span>} />
                <Row label="Display Name" value={account.displayName ?? "—"} />
                <Row label="Email" value={account.email ?? "—"} />
                <Row label="Auth Source" value={account.authSource.replace(/_/g, " ")} />
                <Row label="Privilege Level" value={account.privilegeLevel ?? "—"} />
                <Row label="Affiliation" value={account.affiliationType.replace(/_/g, " ")} />
                <Row label="Sync Mode" value={account.syncMode} />
                {account.syncSourceSystem && (
                  <Row label="Sync Source" value={account.syncSourceSystem} />
                )}
                {account.externalAccountId && (
                  <Row label="External ID" value={<span className="font-mono text-xs">{account.externalAccountId}</span>} />
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Clock className="size-4" />Dates & Status
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <Row label="Status" value={
                  <span className={`inline-flex items-center rounded-lg px-1.5 py-0.5 text-xs font-medium ${STATUS_COLORS[account.status] ?? ""}`}>
                    {account.status.replace(/_/g, " ")}
                  </span>
                } />
                <Row label="Provisioned" value={account.provisionedAt ? format(parseISO(account.provisionedAt), "dd MMM yyyy") : "—"} />
                <Row label="Expires" value={account.expiresAt ? (
                  <span className={isExpired ? "text-red-600 font-medium" : ""}>
                    {format(parseISO(account.expiresAt), "dd MMM yyyy")}
                    {isExpired && " (expired)"}
                  </span>
                ) : "—"} />
                <Row label="Last Reviewed" value={account.lastReviewedAt ? format(parseISO(account.lastReviewedAt), "dd MMM yyyy") : <span className="text-amber-600">Never</span>} />
                <Row label="Review Due" value={account.reviewDueDate ? (
                  <span className={isReviewDue ? "text-red-600 font-medium" : ""}>
                    {format(parseISO(account.reviewDueDate), "dd MMM yyyy")}
                  </span>
                ) : "—"} />
                <Row label="Last Verified" value={account.lastVerifiedAt ? format(parseISO(account.lastVerifiedAt), "dd MMM yyyy") : "—"} />
                {account.disabledAt && (
                  <Row label="Disabled At" value={format(new Date(account.disabledAt), "dd MMM yyyy, HH:mm")} />
                )}
              </CardContent>
            </Card>

            {account.vpnEnabled && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <Network className="size-4" />VPN Details
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <Row label="VPN Enabled" value={<span className="text-blue-600 font-medium">Yes</span>} />
                  <Row label="VPN Group" value={account.vpnGroup ?? "—"} />
                  <Row label="VPN Profile" value={account.vpnProfile ?? "—"} />
                </CardContent>
              </Card>
            )}

            {account.externalContact && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm font-medium">External Contact</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <Row label="Name" value={account.externalContact.name} />
                  <Row label="Organization" value={account.externalContact.organization ?? "—"} />
                  <Row label="Email" value={account.externalContact.email ?? "—"} />
                  <Row label="Phone" value={account.externalContact.phone ?? "—"} />
                </CardContent>
              </Card>
            )}

            {account.staffProfile && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm font-medium">NDMA Staff</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <Row label="Name" value={account.staffProfile.user?.name ?? "—"} />
                  <Row label="Email" value={account.staffProfile.user?.email ?? "—"} />
                  <Row label="Department" value={account.staffProfile.department?.name ?? "—"} />
                </CardContent>
              </Card>
            )}

            {account.notes && (
              <Card className="md:col-span-2">
                <CardHeader>
                  <CardTitle className="text-sm font-medium">Notes</CardTitle>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground whitespace-pre-line">
                  {account.notes}
                </CardContent>
              </Card>
            )}
          </div>
        )}

        {/* ── Groups Tab ───────────────────────────────────────────────── */}
        {activeTab === "groups" && (
          <div className="space-y-3">
            {activeGroupMemberships.length === 0 ? (
              <div className="rounded-xl border border-dashed p-12 text-center text-muted-foreground">
                <Users className="size-8 mx-auto mb-3 opacity-40" />
                <p className="font-medium">No group memberships</p>
              </div>
            ) : (
              activeGroupMemberships.map((membership) => (
                <div key={membership.id} className="rounded-xl border p-4">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="font-medium text-sm">{membership.accessGroup?.name}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {membership.accessGroup?.groupType.replace(/_/g, " ")}
                        {membership.accessGroup?.platform && (
                          <span className="ml-2">· {PLATFORM_LABELS[membership.accessGroup.platform as Platform] ?? membership.accessGroup.platform}</span>
                        )}
                      </p>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Added {format(new Date(membership.addedAt), "dd MMM yyyy")}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* ── Reviews Tab ──────────────────────────────────────────────── */}
        {activeTab === "reviews" && (
          <div className="space-y-3">
            {!account.reviews?.length ? (
              <div className="rounded-xl border border-dashed p-12 text-center text-muted-foreground">
                <Shield className="size-8 mx-auto mb-3 opacity-40" />
                <p className="font-medium">No access reviews yet</p>
              </div>
            ) : (
              account.reviews.map((review) => (
                <div key={review.id} className="rounded-xl border p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className={`inline-flex items-center rounded-lg px-1.5 py-0.5 text-xs font-medium ${REVIEW_STATUS_COLORS[review.status] ?? "bg-muted text-muted-foreground"}`}>
                          {review.status}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          by {review.reviewer?.name ?? "—"}
                        </span>
                      </div>
                      {review.reviewedAt && (
                        <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                          <CheckCircle className="size-3" />
                          Reviewed: {format(new Date(review.reviewedAt), "dd MMM yyyy, HH:mm")}
                        </p>
                      )}
                      {review.nextReviewDate && (
                        <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                          <Clock className="size-3" />
                          Next due: {format(parseISO(review.nextReviewDate), "dd MMM yyyy")}
                        </p>
                      )}
                      {review.notes && (
                        <p className="text-xs text-muted-foreground mt-1">{review.notes}</p>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground shrink-0">
                      {format(new Date(review.createdAt), "dd MMM yyyy")}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </Main>
    </>
  );
}

// ── Small helper ─────────────────────────────────────────────────────────

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-muted-foreground shrink-0">{label}</span>
      <span className="text-right">{value}</span>
    </div>
  );
}
