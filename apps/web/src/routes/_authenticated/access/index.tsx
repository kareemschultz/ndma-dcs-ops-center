import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation } from "@tanstack/react-query";
import { format, parseISO, isPast } from "date-fns";
import {
  Key,
  AlertCircle,
  CheckCircle,
  RefreshCw,
  Plug,
  Activity,
  Clock,
  AlertTriangle,
  Shield,
  Users,
  Network,
  UserX,
  ExternalLink,
  Plus,
  Pencil,
  Ban,
} from "lucide-react";
import { toast } from "sonner";
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@ndma-dcs-staff-portal/ui/components/dialog";
import { Label } from "@ndma-dcs-staff-portal/ui/components/label";
import { Input } from "@ndma-dcs-staff-portal/ui/components/input";
import { Textarea } from "@ndma-dcs-staff-portal/ui/components/textarea";
import { Switch } from "@ndma-dcs-staff-portal/ui/components/switch";
import { Header } from "@/components/layout/header";
import { Main } from "@/components/layout/main";
import { ThemeSwitch } from "@/components/theme-switch";
import { orpc, queryClient } from "@/utils/orpc";

export const Route = createFileRoute("/_authenticated/access/")({
  component: PlatformAccountsPage,
});

// ── Label/color maps ──────────────────────────────────────────────────────

type Platform =
  | "vpn" | "fortigate" | "uportal" | "biometric" | "ad"
  | "ipam" | "phpipam" | "radius" | "zabbix" | "other";
type AccountStatus = "active" | "suspended" | "disabled" | "pending_creation" | "orphaned" | "pending_review";
type SyncMode = "manual" | "synced" | "hybrid";
type AuthSource =
  | "local" | "active_directory" | "ldap" | "radius" | "saml"
  | "oauth_oidc" | "service_account" | "api_only";
type Affiliation =
  | "ndma_internal" | "external_agency" | "contractor"
  | "consultant" | "vendor" | "shared_service";
type GroupType = "ad_group" | "vpn_group" | "platform_role" | "local_group" | "radius_group";

const PLATFORM_LABELS: Record<Platform, string> = {
  vpn: "VPN", fortigate: "Fortigate", uportal: "uPortal",
  biometric: "Biometric", ad: "Active Directory", ipam: "IPAM",
  phpipam: "phpIPAM", radius: "RADIUS", zabbix: "Zabbix", other: "Other",
};

const AUTH_SOURCE_LABELS: Record<AuthSource, string> = {
  local: "Local", active_directory: "AD", ldap: "LDAP", radius: "RADIUS",
  saml: "SAML", oauth_oidc: "OAuth/OIDC", service_account: "Service Acct", api_only: "API Only",
};

const AUTH_SOURCE_COLORS: Record<AuthSource, string> = {
  local: "bg-muted text-muted-foreground",
  active_directory: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  ldap: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  radius: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300",
  saml: "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300",
  oauth_oidc: "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300",
  service_account: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  api_only: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
};

const SYNC_MODE_COLORS: Record<SyncMode, string> = {
  manual: "bg-muted text-muted-foreground",
  synced: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  hybrid: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
};

const STATUS_COLORS: Record<AccountStatus, string> = {
  active: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  suspended: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  disabled: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
  pending_creation: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  orphaned: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
  pending_review: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
};

const AFFILIATION_LABELS: Record<Affiliation, string> = {
  ndma_internal: "NDMA", external_agency: "Agency", contractor: "Contractor",
  consultant: "Consultant", vendor: "Vendor", shared_service: "Shared",
};

const AFFILIATION_COLORS: Record<Affiliation, string> = {
  ndma_internal: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  external_agency: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300",
  contractor: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  consultant: "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300",
  vendor: "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300",
  shared_service: "bg-muted text-muted-foreground",
};

const INTEGRATION_STATUS_COLORS: Record<string, string> = {
  active: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  inactive: "bg-muted text-muted-foreground",
  error: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
  pending: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
};

// ── Platform type config (full enum, all 18 types) ────────────────────────

type PlatformType =
  | "vpn" | "fortigate" | "uportal" | "biometric" | "ad"
  | "ipam" | "phpipam" | "radius" | "zabbix" | "esight"
  | "ivs_neteco" | "nce_fan_atp" | "neteco" | "lte_grafana"
  | "gen_grafana" | "plum" | "kibana" | "other";

const PLATFORMS: Record<PlatformType, { label: string; description: string; icon: string; category: string }> = {
  vpn: { label: "VPN (Forticlient)", description: "MikroTik / Forticlient VPN access control", icon: "🔒", category: "Network" },
  fortigate: { label: "Fortigate", description: "Fortigate firewall management", icon: "🛡️", category: "Network" },
  ad: { label: "Active Directory", description: "Windows AD / LDAP user directory", icon: "🏢", category: "Identity" },
  ipam: { label: "IPAM", description: "IP Address Management", icon: "🌐", category: "Network" },
  phpipam: { label: "phpIPAM", description: "Open-source IP address management", icon: "🌐", category: "Network" },
  uportal: { label: "Uportal", description: "User portal access management", icon: "👤", category: "Identity" },
  biometric: { label: "Biometrics", description: "Biometric fingerprint registration", icon: "🔍", category: "Physical" },
  radius: { label: "RADIUS", description: "Remote Authentication Dial-In service", icon: "📡", category: "Network" },
  zabbix: { label: "Zabbix", description: "Network monitoring platform", icon: "📊", category: "Monitoring" },
  esight: { label: "eSight", description: "Huawei eSight network management", icon: "👁️", category: "Monitoring" },
  ivs_neteco: { label: "IVS Neteco", description: "IVS network ecosystem management", icon: "🔧", category: "Monitoring" },
  nce_fan_atp: { label: "NCE FAN ATP", description: "NCE FAN Advanced Threat Protection", icon: "🛡️", category: "Security" },
  neteco: { label: "NeTeco", description: "NeTeco network management", icon: "🔧", category: "Monitoring" },
  lte_grafana: { label: "LTE Grafana", description: "LTE network Grafana dashboards", icon: "📈", category: "Monitoring" },
  gen_grafana: { label: "Generator Grafana", description: "Generator monitoring dashboards", icon: "📈", category: "Monitoring" },
  plum: { label: "Plum", description: "Plum platform management", icon: "🍇", category: "Other" },
  kibana: { label: "Kibana", description: "Elasticsearch Kibana dashboards", icon: "📋", category: "Monitoring" },
  other: { label: "Other", description: "Other platform integration", icon: "⚙️", category: "Other" },
};

const CATEGORY_STYLES: Record<string, { border: string; bg: string; badge: string }> = {
  Network:    { border: "border-blue-200 dark:border-blue-800",   bg: "bg-blue-50 dark:bg-blue-950/30",    badge: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300" },
  Identity:   { border: "border-indigo-200 dark:border-indigo-800", bg: "bg-indigo-50 dark:bg-indigo-950/30",  badge: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300" },
  Monitoring: { border: "border-blue-200 dark:border-blue-800",  bg: "bg-blue-50 dark:bg-blue-950/30",   badge: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300" },
  Security:   { border: "border-red-200 dark:border-red-800",     bg: "bg-red-50 dark:bg-red-950/30",      badge: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300" },
  Physical:   { border: "border-orange-200 dark:border-orange-800", bg: "bg-orange-50 dark:bg-orange-950/30",  badge: "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300" },
  Other:      { border: "border-gray-200 dark:border-gray-700",   bg: "bg-gray-50 dark:bg-gray-900/30",    badge: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400" },
};

type Tab = "accounts" | "vpn" | "groups" | "external" | "reviews" | "integrations" | "reconciliation";

// ── Badge helpers ─────────────────────────────────────────────────────────

function AuthBadge({ source }: { source: string }) {
  return (
    <span className={`inline-flex items-center rounded-lg px-1.5 py-0.5 text-xs font-medium ${AUTH_SOURCE_COLORS[source as AuthSource] ?? "bg-muted text-muted-foreground"}`}>
      {AUTH_SOURCE_LABELS[source as AuthSource] ?? source}
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`inline-flex items-center rounded-lg px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[status as AccountStatus] ?? "bg-muted text-muted-foreground"}`}>
      {status.replace(/_/g, " ")}
    </span>
  );
}

function AffiliationBadge({ affiliation }: { affiliation: string }) {
  return (
    <span className={`inline-flex items-center rounded-lg px-1.5 py-0.5 text-xs font-medium ${AFFILIATION_COLORS[affiliation as Affiliation] ?? "bg-muted text-muted-foreground"}`}>
      {AFFILIATION_LABELS[affiliation as Affiliation] ?? affiliation}
    </span>
  );
}

// ── Shared form field component ───────────────────────────────────────────

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

// ── Account dialog ────────────────────────────────────────────────────────

type StaffItem = { id: string; employeeId?: string; user: { name: string } | null };
type ContactItem = { id: string; name: string };

type AccountDialogProps = {
  open: boolean;
  onClose: () => void;
  staff: StaffItem[];
  contacts: ContactItem[];
  onSave: (data: Record<string, unknown>) => void;
  isPending: boolean;
  editData?: Record<string, unknown> | null;
};

function AccountDialog({ open, onClose, staff, contacts, onSave, isPending, editData }: AccountDialogProps) {
  const isEdit = !!editData;
  const [form, setForm] = useState({
    identityType: "staff" as "staff" | "external",
    staffProfileId: (editData?.staffProfileId as string) ?? "",
    externalContactId: (editData?.externalContactId as string) ?? "",
    platform: (editData?.platform as string) ?? "vpn",
    accountIdentifier: (editData?.accountIdentifier as string) ?? "",
    displayName: (editData?.displayName as string) ?? "",
    affiliationType: (editData?.affiliationType as string) ?? "ndma_internal",
    authSource: (editData?.authSource as string) ?? "local",
    status: (editData?.status as string) ?? "active",
    syncMode: (editData?.syncMode as string) ?? "manual",
    privilegeLevel: (editData?.privilegeLevel as string) ?? "",
    vpnEnabled: (editData?.vpnEnabled as boolean) ?? false,
    vpnGroup: (editData?.vpnGroup as string) ?? "",
    vpnProfile: (editData?.vpnProfile as string) ?? "",
    expiresAt: (editData?.expiresAt as string) ?? "",
    notes: (editData?.notes as string) ?? "",
  });

  const set = (k: string, v: unknown) => setForm((f) => ({ ...f, [k]: v }));

  const handleSave = () => {
    const payload: Record<string, unknown> = {
      platform: form.platform,
      accountIdentifier: form.accountIdentifier.trim(),
      affiliationType: form.affiliationType,
      authSource: form.authSource,
      status: form.status,
      syncMode: form.syncMode,
      vpnEnabled: form.vpnEnabled,
    };
    if (!isEdit) {
      if (form.identityType === "staff") payload.staffProfileId = form.staffProfileId;
      else payload.externalContactId = form.externalContactId;
    }
    if (isEdit && editData?.id) payload.id = editData.id as string;
    if (form.displayName.trim()) payload.displayName = form.displayName.trim();
    if (form.privilegeLevel.trim()) payload.privilegeLevel = form.privilegeLevel.trim();
    if (form.vpnEnabled && form.vpnGroup.trim()) payload.vpnGroup = form.vpnGroup.trim();
    if (form.vpnEnabled && form.vpnProfile.trim()) payload.vpnProfile = form.vpnProfile.trim();
    if (form.expiresAt) payload.expiresAt = form.expiresAt;
    if (form.notes.trim()) payload.notes = form.notes.trim();
    onSave(payload);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Account" : "Add Platform Account"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3 py-2">
          {!isEdit && (
            <Field label="Identity type">
              <div className="flex gap-2">
                {(["staff", "external"] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => set("identityType", t)}
                    className={`flex-1 rounded-xl border py-1.5 text-xs font-medium transition-colors ${form.identityType === t ? "border-primary bg-primary/10 text-primary" : "hover:bg-muted"}`}
                  >
                    {t === "staff" ? "NDMA Staff" : "External Contact"}
                  </button>
                ))}
              </div>
            </Field>
          )}

          {!isEdit && form.identityType === "staff" && (
            <Field label="Staff member *">
              <select
                value={form.staffProfileId}
                onChange={(e) => set("staffProfileId", e.target.value)}
                className="w-full rounded-xl border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="">— Select staff —</option>
                {staff.map((s) => (
                  <option key={s.id} value={s.id}>{s.user?.name ?? s.employeeId ?? "Unnamed"}</option>
                ))}
              </select>
            </Field>
          )}

          {!isEdit && form.identityType === "external" && (
            <Field label="External contact *">
              <select
                value={form.externalContactId}
                onChange={(e) => set("externalContactId", e.target.value)}
                className="w-full rounded-xl border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="">— Select contact —</option>
                {contacts.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </Field>
          )}

          <div className="grid grid-cols-2 gap-3">
            <Field label="Platform *">
              <select
                value={form.platform}
                onChange={(e) => set("platform", e.target.value)}
                className="w-full rounded-xl border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                disabled={isEdit}
              >
                {(Object.keys(PLATFORM_LABELS) as Platform[]).map((p) => (
                  <option key={p} value={p}>{PLATFORM_LABELS[p]}</option>
                ))}
              </select>
            </Field>
            <Field label="Account identifier *">
              <Input
                value={form.accountIdentifier}
                onChange={(e) => set("accountIdentifier", e.target.value)}
                placeholder="e.g. jdoe or 192.168.1.1"
                className="text-sm"
                disabled={isEdit}
              />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Affiliation">
              <select
                value={form.affiliationType}
                onChange={(e) => set("affiliationType", e.target.value)}
                className="w-full rounded-xl border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                {(["ndma_internal", "external_agency", "contractor", "consultant", "vendor", "shared_service"] as const).map((a) => (
                  <option key={a} value={a}>{AFFILIATION_LABELS[a]}</option>
                ))}
              </select>
            </Field>
            <Field label="Auth source">
              <select
                value={form.authSource}
                onChange={(e) => set("authSource", e.target.value)}
                className="w-full rounded-xl border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                {(Object.keys(AUTH_SOURCE_LABELS) as AuthSource[]).map((a) => (
                  <option key={a} value={a}>{AUTH_SOURCE_LABELS[a]}</option>
                ))}
              </select>
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Status">
              <select
                value={form.status}
                onChange={(e) => set("status", e.target.value)}
                className="w-full rounded-xl border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                {(["active", "suspended", "disabled", "pending_creation", "pending_review"] as const).map((s) => (
                  <option key={s} value={s}>{s.replace(/_/g, " ")}</option>
                ))}
              </select>
            </Field>
            <Field label="Sync mode">
              <select
                value={form.syncMode}
                onChange={(e) => set("syncMode", e.target.value)}
                className="w-full rounded-xl border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                {(["manual", "synced", "hybrid"] as const).map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </Field>
          </div>

          <Field label="Privilege level (optional)">
            <Input
              value={form.privilegeLevel}
              onChange={(e) => set("privilegeLevel", e.target.value)}
              placeholder="e.g. admin, read-only"
              className="text-sm"
            />
          </Field>

          <div className="flex items-center gap-3 rounded-xl border p-3">
            <Switch
              checked={form.vpnEnabled}
              onCheckedChange={(v) => set("vpnEnabled", v)}
            />
            <span className="text-sm font-medium">VPN access enabled</span>
          </div>

          {form.vpnEnabled && (
            <div className="grid grid-cols-2 gap-3">
              <Field label="VPN group">
                <Input value={form.vpnGroup} onChange={(e) => set("vpnGroup", e.target.value)} placeholder="e.g. NDMA_VPN" className="text-sm" />
              </Field>
              <Field label="VPN profile">
                <Input value={form.vpnProfile} onChange={(e) => set("vpnProfile", e.target.value)} placeholder="e.g. full-access" className="text-sm" />
              </Field>
            </div>
          )}

          <Field label="Expires (optional)">
            <Input type="date" value={form.expiresAt} onChange={(e) => set("expiresAt", e.target.value)} className="text-sm" />
          </Field>

          <Field label="Notes">
            <Textarea value={form.notes} onChange={(e) => set("notes", e.target.value)} rows={2} className="text-sm" />
          </Field>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isPending}>Cancel</Button>
          <Button onClick={handleSave} disabled={isPending}>
            {isPending ? "Saving…" : isEdit ? "Save changes" : "Add account"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── External Contact dialog ───────────────────────────────────────────────

type ContactDialogProps = {
  open: boolean;
  onClose: () => void;
  onSave: (data: Record<string, unknown>) => void;
  isPending: boolean;
  editData?: Record<string, unknown> | null;
};

function ContactDialog({ open, onClose, onSave, isPending, editData }: ContactDialogProps) {
  const isEdit = !!editData;
  const [form, setForm] = useState({
    name: (editData?.name as string) ?? "",
    email: (editData?.email as string) ?? "",
    organization: (editData?.organization as string) ?? "",
    phone: (editData?.phone as string) ?? "",
    affiliationType: (editData?.affiliationType as string) ?? "external_agency",
    isActive: (editData?.isActive as boolean) ?? true,
    notes: (editData?.notes as string) ?? "",
  });

  const set = (k: string, v: unknown) => setForm((f) => ({ ...f, [k]: v }));

  const handleSave = () => {
    const payload: Record<string, unknown> = {
      name: form.name.trim(),
      affiliationType: form.affiliationType,
    };
    if (isEdit && editData?.id) { payload.id = editData.id as string; payload.isActive = form.isActive; }
    if (form.email.trim()) payload.email = form.email.trim();
    if (form.organization.trim()) payload.organization = form.organization.trim();
    if (form.phone.trim()) payload.phone = form.phone.trim();
    if (form.notes.trim()) payload.notes = form.notes.trim();
    onSave(payload);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit External Contact" : "Add External Contact"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <Field label="Full name *">
            <Input value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="Jane Doe" className="text-sm" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Email">
              <Input type="email" value={form.email} onChange={(e) => set("email", e.target.value)} placeholder="jane@example.com" className="text-sm" />
            </Field>
            <Field label="Phone">
              <Input value={form.phone} onChange={(e) => set("phone", e.target.value)} placeholder="+233…" className="text-sm" />
            </Field>
          </div>
          <Field label="Organization">
            <Input value={form.organization} onChange={(e) => set("organization", e.target.value)} placeholder="Company name" className="text-sm" />
          </Field>
          <Field label="Affiliation type">
            <select
              value={form.affiliationType}
              onChange={(e) => set("affiliationType", e.target.value)}
              className="w-full rounded-xl border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            >
              {(["external_agency", "contractor", "consultant", "vendor", "shared_service"] as const).map((a) => (
                <option key={a} value={a}>{AFFILIATION_LABELS[a]}</option>
              ))}
            </select>
          </Field>
          {isEdit && (
            <div className="flex items-center gap-3">
              <Switch checked={form.isActive} onCheckedChange={(v) => set("isActive", v)} />
              <span className="text-sm">Active</span>
            </div>
          )}
          <Field label="Notes">
            <Textarea value={form.notes} onChange={(e) => set("notes", e.target.value)} rows={2} className="text-sm" />
          </Field>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isPending}>Cancel</Button>
          <Button onClick={handleSave} disabled={isPending || !form.name.trim()}>
            {isPending ? "Saving…" : isEdit ? "Save changes" : "Add contact"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Group dialog ──────────────────────────────────────────────────────────

type GroupDialogProps = {
  open: boolean;
  onClose: () => void;
  onSave: (data: Record<string, unknown>) => void;
  isPending: boolean;
  editData?: Record<string, unknown> | null;
};

function GroupDialog({ open, onClose, onSave, isPending, editData }: GroupDialogProps) {
  const isEdit = !!editData;
  const [form, setForm] = useState({
    name: (editData?.name as string) ?? "",
    platform: (editData?.platform as string) ?? "ad",
    groupType: (editData?.groupType as string) ?? "ad_group",
    description: (editData?.description as string) ?? "",
    externalId: (editData?.externalId as string) ?? "",
    syncMode: (editData?.syncMode as string) ?? "manual",
    isActive: (editData?.isActive as boolean) ?? true,
  });

  const set = (k: string, v: unknown) => setForm((f) => ({ ...f, [k]: v }));

  const handleSave = () => {
    const payload: Record<string, unknown> = {
      name: form.name.trim(),
      platform: form.platform,
      groupType: form.groupType,
      syncMode: form.syncMode,
    };
    if (isEdit && editData?.id) { payload.id = editData.id as string; payload.isActive = form.isActive; }
    if (form.description.trim()) payload.description = form.description.trim();
    if (form.externalId.trim()) payload.externalId = form.externalId.trim();
    onSave(payload);
  };

  const GROUP_TYPE_LABELS: Record<GroupType, string> = {
    ad_group: "AD Group", vpn_group: "VPN Group", platform_role: "Platform Role",
    local_group: "Local Group", radius_group: "RADIUS Group",
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Group" : "Add Access Group"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <Field label="Group name *">
            <Input value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="NDMA_VPN_USERS" className="text-sm" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Platform">
              <select
                value={form.platform}
                onChange={(e) => set("platform", e.target.value)}
                className="w-full rounded-xl border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                disabled={isEdit}
              >
                {(Object.keys(PLATFORM_LABELS) as Platform[]).map((p) => (
                  <option key={p} value={p}>{PLATFORM_LABELS[p]}</option>
                ))}
              </select>
            </Field>
            <Field label="Group type">
              <select
                value={form.groupType}
                onChange={(e) => set("groupType", e.target.value)}
                className="w-full rounded-xl border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                disabled={isEdit}
              >
                {(["ad_group", "vpn_group", "platform_role", "local_group", "radius_group"] as const).map((t) => (
                  <option key={t} value={t}>{GROUP_TYPE_LABELS[t]}</option>
                ))}
              </select>
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Sync mode">
              <select
                value={form.syncMode}
                onChange={(e) => set("syncMode", e.target.value)}
                className="w-full rounded-xl border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                {(["manual", "synced", "hybrid"] as const).map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </Field>
            <Field label="External ID">
              <Input value={form.externalId} onChange={(e) => set("externalId", e.target.value)} placeholder="CN=NDMA_VPN,DC=…" className="text-sm" />
            </Field>
          </div>
          <Field label="Description">
            <Textarea value={form.description} onChange={(e) => set("description", e.target.value)} rows={2} className="text-sm" />
          </Field>
          {isEdit && (
            <div className="flex items-center gap-3">
              <Switch checked={form.isActive} onCheckedChange={(v) => set("isActive", v)} />
              <span className="text-sm">Active</span>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isPending}>Cancel</Button>
          <Button onClick={handleSave} disabled={isPending || !form.name.trim()}>
            {isPending ? "Saving…" : isEdit ? "Save changes" : "Add group"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Integration dialog (2-step wizard for create, flat form for edit) ────

type IntegrationDialogProps = {
  open: boolean;
  onClose: () => void;
  onSave: (data: Record<string, unknown>) => void;
  isPending: boolean;
  editData?: Record<string, unknown> | null;
};

// Group platforms by category preserving order
const PLATFORM_CATEGORIES = ["Network", "Identity", "Monitoring", "Security", "Physical", "Other"] as const;
type PlatformCategory = typeof PLATFORM_CATEGORIES[number];

const PLATFORMS_BY_CATEGORY: Record<PlatformCategory, PlatformType[]> = {
  Network:    ["vpn", "fortigate", "ipam", "phpipam", "radius"],
  Identity:   ["ad", "uportal"],
  Monitoring: ["zabbix", "esight", "ivs_neteco", "neteco", "lte_grafana", "gen_grafana", "kibana"],
  Security:   ["nce_fan_atp"],
  Physical:   ["biometric"],
  Other:      ["plum", "other"],
};

function IntegrationDialog({ open, onClose, onSave, isPending, editData }: IntegrationDialogProps) {
  const isEdit = !!editData;
  // For create: step 1 = select platform type, step 2 = fill config fields
  const [step, setStep] = useState<1 | 2>(isEdit ? 2 : 1);
  const [selectedPlatform, setSelectedPlatform] = useState<PlatformType>(
    (editData?.platform as PlatformType) ?? "phpipam"
  );
  const [form, setForm] = useState({
    name: (editData?.name as string) ?? "",
    baseUrl: (editData?.baseUrl as string) ?? (editData?.apiBaseUrl as string) ?? "",
    notes: (editData?.notes as string) ?? (editData?.description as string) ?? "",
    syncEnabled: (editData?.syncEnabled as boolean) ?? false,
    syncDirection: (editData?.syncDirection as string) ?? "inbound",
    syncFrequency: String((editData?.syncFrequency as number) ?? (editData?.syncFrequencyMinutes as number) ?? ""),
    // edit-only
    status: (editData?.status as string) ?? "pending",
  });

  // Reset step when dialog opens/closes
  const handleOpenChange = (o: boolean) => {
    if (!o) {
      onClose();
      if (!isEdit) setStep(1);
    }
  };

  const set = (k: string, v: unknown) => setForm((f) => ({ ...f, [k]: v }));

  const handleSave = () => {
    const payload: Record<string, unknown> = {
      name: form.name.trim(),
      syncEnabled: form.syncEnabled,
      syncDirection: form.syncDirection,
    };
    if (!isEdit) {
      payload.platformType = selectedPlatform;
    } else {
      payload.id = editData!.id as string;
      payload.status = form.status;
    }
    if (form.baseUrl.trim()) payload.baseUrl = form.baseUrl.trim();
    if (form.notes.trim()) payload.notes = form.notes.trim();
    if (form.syncFrequency) payload.syncFrequency = Number(form.syncFrequency);
    onSave(payload);
  };

  const platformInfo = PLATFORMS[selectedPlatform];
  const catStyle = CATEGORY_STYLES[platformInfo?.category ?? "Other"];

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {isEdit
              ? "Edit Integration"
              : step === 1
              ? "Add Platform Integration — Step 1: Select Platform"
              : `Add Platform Integration — Step 2: Configure ${platformInfo?.label}`}
          </DialogTitle>
        </DialogHeader>

        {/* ── Step 1: Platform type card grid ────────────────────────── */}
        {!isEdit && step === 1 && (
          <div className="space-y-4 py-2">
            {PLATFORM_CATEGORIES.map((cat) => {
              const catPlatforms = PLATFORMS_BY_CATEGORY[cat];
              if (!catPlatforms.length) return null;
              const cs = CATEGORY_STYLES[cat];
              return (
                <div key={cat}>
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">{cat}</p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                    {catPlatforms.map((pt) => {
                      const info = PLATFORMS[pt];
                      const isSelected = selectedPlatform === pt;
                      return (
                        <button
                          key={pt}
                          type="button"
                          onClick={() => setSelectedPlatform(pt)}
                          className={`flex flex-col items-start gap-1 rounded-lg border p-3 text-left transition-all hover:shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                            isSelected
                              ? `${cs.border} ${cs.bg} ring-2 ring-offset-1 ring-current`
                              : "border-border hover:border-muted-foreground/40 hover:bg-muted/40"
                          }`}
                        >
                          <span className="text-xl leading-none">{info.icon}</span>
                          <span className="text-xs font-semibold leading-tight">{info.label}</span>
                          <span className="text-[10px] text-muted-foreground leading-tight">{info.description}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}

            <DialogFooter className="pt-2">
              <Button variant="outline" onClick={onClose}>Cancel</Button>
              <Button onClick={() => setStep(2)}>
                Next — Configure {platformInfo?.label}
              </Button>
            </DialogFooter>
          </div>
        )}

        {/* ── Step 2 (create) or flat form (edit) ────────────────────── */}
        {(isEdit || step === 2) && (
          <div className="space-y-4 py-2">
            {/* Selected platform banner (create only) */}
            {!isEdit && (
              <div className={`flex items-center gap-3 rounded-lg border p-3 ${catStyle.border} ${catStyle.bg}`}>
                <span className="text-2xl">{platformInfo?.icon}</span>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm">{platformInfo?.label}</p>
                  <p className="text-xs text-muted-foreground truncate">{platformInfo?.description}</p>
                </div>
                <span className={`shrink-0 inline-flex items-center rounded-lg px-1.5 py-0.5 text-xs font-medium ${catStyle.badge}`}>
                  {platformInfo?.category}
                </span>
              </div>
            )}

            <Field label="Integration name *">
              <Input
                value={form.name}
                onChange={(e) => set("name", e.target.value)}
                placeholder={`${platformInfo?.label ?? "Integration"} — DC Network`}
                className="text-sm"
                autoFocus
              />
            </Field>

            <Field label="Base URL (optional)">
              <Input
                value={form.baseUrl}
                onChange={(e) => set("baseUrl", e.target.value)}
                placeholder="https://ipam.ndma.gov.gh/api/"
                className="text-sm"
              />
            </Field>

            {isEdit && (
              <Field label="Status">
                <select
                  value={form.status}
                  onChange={(e) => set("status", e.target.value)}
                  className="w-full rounded-xl border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  {(["active", "inactive", "error", "pending"] as const).map((s) => (
                    <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
                  ))}
                </select>
              </Field>
            )}

            <div className="flex items-center gap-3 rounded-xl border p-3">
              <Switch checked={form.syncEnabled} onCheckedChange={(v) => set("syncEnabled", v)} />
              <div>
                <span className="text-sm font-medium">Auto-sync enabled</span>
                <p className="text-xs text-muted-foreground">Automatically pull records on a schedule</p>
              </div>
            </div>

            {form.syncEnabled && (
              <div className="grid grid-cols-2 gap-3">
                <Field label="Sync direction">
                  <select
                    value={form.syncDirection}
                    onChange={(e) => set("syncDirection", e.target.value)}
                    className="w-full rounded-xl border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  >
                    <option value="inbound">Inbound (pull from platform)</option>
                    <option value="outbound">Outbound (push to platform)</option>
                    <option value="bidirectional">Bidirectional</option>
                  </select>
                </Field>
                <Field label="Sync frequency (minutes)">
                  <Input
                    type="number"
                    value={form.syncFrequency}
                    onChange={(e) => set("syncFrequency", e.target.value)}
                    placeholder="60"
                    className="text-sm"
                  />
                </Field>
              </div>
            )}

            <Field label="Notes (optional)">
              <Textarea
                value={form.notes}
                onChange={(e) => set("notes", e.target.value)}
                rows={2}
                placeholder="Support team, runbook link, any relevant context…"
                className="text-sm"
              />
            </Field>

            <DialogFooter>
              {!isEdit && (
                <Button variant="outline" onClick={() => setStep(1)} disabled={isPending}>
                  Back
                </Button>
              )}
              <Button variant="outline" onClick={onClose} disabled={isPending}>Cancel</Button>
              <Button onClick={handleSave} disabled={isPending || !form.name.trim()}>
                {isPending ? "Saving…" : isEdit ? "Save changes" : "Add integration"}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────

function PlatformAccountsPage() {
  const [activeTab, setActiveTab] = useState<Tab>("accounts");
  const [platform, setPlatform] = useState<Platform | "">("");
  const [statusFilter, setStatusFilter] = useState<AccountStatus | "">("");
  const [syncMode, setSyncMode] = useState<SyncMode | "">("");

  // Dialog state
  const [showCreateAccount, setShowCreateAccount] = useState(false);
  const [editAccount, setEditAccount] = useState<Record<string, unknown> | null>(null);
  const [showCreateContact, setShowCreateContact] = useState(false);
  const [editContact, setEditContact] = useState<Record<string, unknown> | null>(null);
  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const [editGroup, setEditGroup] = useState<Record<string, unknown> | null>(null);
  const [showCreateIntegration, setShowCreateIntegration] = useState(false);
  const [editIntegration, setEditIntegration] = useState<Record<string, unknown> | null>(null);

  // ── Queries ───────────────────────────────────────────────────────────

  const { data, isLoading } = useQuery(
    orpc.access.accounts.list.queryOptions({
      input: {
        platform: platform || undefined,
        status: statusFilter || undefined,
        syncMode: syncMode || undefined,
      },
    })
  );

  const { data: expiring } = useQuery(
    orpc.access.accounts.getExpiring.queryOptions({ input: { withinDays: 30 } })
  );

  const { data: vpnAccounts, isLoading: vpnLoading } = useQuery(
    orpc.access.accounts.getVpnEnabled.queryOptions()
  );

  const { data: groups, isLoading: groupsLoading } = useQuery(
    orpc.access.groups.list.queryOptions({ input: {} })
  );

  const { data: externalContacts, isLoading: extLoading } = useQuery(
    orpc.access.externalContacts.list.queryOptions({ input: {} })
  );

  const { data: pendingReviews, isLoading: reviewsLoading } = useQuery(
    orpc.access.reviews.getPending.queryOptions()
  );

  const { data: integrations, isLoading: integrationsLoading } = useQuery(
    orpc.access.integrations.list.queryOptions()
  );

  const { data: reconciliationData, isLoading: reconcLoading } = useQuery(
    orpc.access.reconciliation.list.queryOptions({ input: { resolved: false } })
  );

  const { data: staffList } = useQuery(
    orpc.staff.list.queryOptions({ input: { limit: 200, offset: 0 } })
  );

  // ── Mutations ─────────────────────────────────────────────────────────

  const invalidateAccounts = () => {
    queryClient.invalidateQueries({ queryKey: orpc.access.accounts.list.key() });
    queryClient.invalidateQueries({ queryKey: orpc.access.accounts.getVpnEnabled.key() });
  };

  const markReviewedMutation = useMutation(
    orpc.access.accounts.markReviewed.mutationOptions({
      onSuccess: () => { invalidateAccounts(); toast.success("Account marked as reviewed"); },
      onError: (err) => toast.error(err.message),
    })
  );

  const createAccountMutation = useMutation(
    orpc.access.accounts.create.mutationOptions({
      onSuccess: () => { invalidateAccounts(); setShowCreateAccount(false); toast.success("Account created"); },
      onError: (err) => toast.error(err.message),
    })
  );

  const updateAccountMutation = useMutation(
    orpc.access.accounts.update.mutationOptions({
      onSuccess: () => { invalidateAccounts(); setEditAccount(null); toast.success("Account updated"); },
      onError: (err) => toast.error(err.message),
    })
  );

  const disableAccountMutation = useMutation(
    orpc.access.accounts.disable.mutationOptions({
      onSuccess: () => { invalidateAccounts(); toast.success("Account disabled"); },
      onError: (err) => toast.error(err.message),
    })
  );

  const createContactMutation = useMutation(
    orpc.access.externalContacts.create.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: orpc.access.externalContacts.list.key() });
        setShowCreateContact(false);
        toast.success("External contact added");
      },
      onError: (err) => toast.error(err.message),
    })
  );

  const updateContactMutation = useMutation(
    orpc.access.externalContacts.update.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: orpc.access.externalContacts.list.key() });
        setEditContact(null);
        toast.success("Contact updated");
      },
      onError: (err) => toast.error(err.message),
    })
  );

  const createGroupMutation = useMutation(
    orpc.access.groups.create.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: orpc.access.groups.list.key() });
        setShowCreateGroup(false);
        toast.success("Group created");
      },
      onError: (err) => toast.error(err.message),
    })
  );

  const updateGroupMutation = useMutation(
    orpc.access.groups.update.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: orpc.access.groups.list.key() });
        setEditGroup(null);
        toast.success("Group updated");
      },
      onError: (err) => toast.error(err.message),
    })
  );

  const createIntegrationMutation = useMutation(
    orpc.access.integrations.create.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: orpc.access.integrations.list.key() });
        setShowCreateIntegration(false);
        toast.success("Integration added");
      },
      onError: (err) => toast.error(err.message),
    })
  );

  const updateIntegrationMutation = useMutation(
    orpc.access.integrations.update.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: orpc.access.integrations.list.key() });
        setEditIntegration(null);
        toast.success("Integration updated");
      },
      onError: (err) => toast.error(err.message),
    })
  );

  const triggerSyncMutation = useMutation(
    orpc.access.integrations.triggerSync.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: orpc.access.integrations.list.key() });
        queryClient.invalidateQueries({ queryKey: orpc.access.syncJobs.list.key() });
        toast.success("Sync job queued");
      },
      onError: (err) => toast.error(err.message),
    })
  );

  const resolveIssueMutation = useMutation(
    orpc.access.reconciliation.resolve.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: orpc.access.reconciliation.list.key() });
        toast.success("Issue resolved");
      },
      onError: (err) => toast.error(err.message),
    })
  );

  const completeReviewMutation = useMutation(
    orpc.access.reviews.complete.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: orpc.access.reviews.getPending.key() });
        toast.success("Review completed");
      },
      onError: (err) => toast.error(err.message),
    })
  );

  const openIssueCount = reconciliationData?.length ?? 0;
  const pendingReviewCount = pendingReviews?.length ?? 0;

  const staffForPicker: StaffItem[] = (staffList ?? []).map((s) => ({
    id: s.id,
    employeeId: (s as Record<string, unknown>).employeeId as string | undefined,
    user: (s as Record<string, unknown>).user as { name: string } | null,
  }));

  const contactsForPicker: ContactItem[] = (externalContacts ?? []).map((c) => ({
    id: c.id,
    name: c.name,
  }));

  const TABS = [
    { key: "accounts" as Tab, label: "Accounts", icon: Key, count: data?.length },
    { key: "vpn" as Tab, label: "VPN Access", icon: Network, count: vpnAccounts?.length },
    { key: "groups" as Tab, label: "Groups", icon: Users, count: groups?.length },
    { key: "external" as Tab, label: "External Contacts", icon: ExternalLink, count: externalContacts?.length },
    { key: "reviews" as Tab, label: "Access Reviews", icon: Shield, count: pendingReviewCount, alert: pendingReviewCount > 0 },
    { key: "integrations" as Tab, label: "Integrations", icon: Plug, count: integrations?.length },
    { key: "reconciliation" as Tab, label: "Reconciliation", icon: AlertTriangle, count: openIssueCount || undefined, alert: openIssueCount > 0 },
  ];

  // Tab-contextual "New" button
  const newBtnConfig: Record<string, { label: string; onClick: () => void } | undefined> = {
    accounts: { label: "Add Account", onClick: () => setShowCreateAccount(true) },
    groups: { label: "Add Group", onClick: () => setShowCreateGroup(true) },
    external: { label: "Add Contact", onClick: () => setShowCreateContact(true) },
    integrations: { label: "Add Integration", onClick: () => setShowCreateIntegration(true) },
  };
  const currentNewBtn = newBtnConfig[activeTab];

  return (
    <>
      <Header fixed>
        <div className="flex items-center gap-2">
          <Key className="size-4 text-muted-foreground" />
          <span className="text-sm font-medium">Access & Accounts</span>
        </div>
        <div className="ms-auto flex items-center gap-2">
          {currentNewBtn && (
            <Button size="sm" className="gap-1.5" onClick={currentNewBtn.onClick}>
              <Plus className="size-3.5" />
              {currentNewBtn.label}
            </Button>
          )}
          <ThemeSwitch />
        </div>
      </Header>

      <Main>
        <div className="mb-6">
          <h1 className="text-2xl font-bold tracking-tight">Access & Accounts</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Identity governance for all managed platforms — VPN, AD, RADIUS, phpIPAM,
            Zabbix, and more. Tracks NDMA staff, contractors, vendors, and external agencies.
          </p>
        </div>

        {/* Alert banners */}
        {expiring && expiring.length > 0 && (
          <div className="mb-3 flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 dark:bg-amber-900/20 p-3 text-sm text-amber-700 dark:text-amber-300">
            <AlertCircle className="size-4 shrink-0" />
            <strong>{expiring.length}</strong> account{expiring.length > 1 ? "s" : ""} expiring within 30 days.
          </div>
        )}
        {openIssueCount > 0 && (
          <div className="mb-3 flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 dark:bg-red-900/20 p-3 text-sm text-red-700 dark:text-red-300">
            <AlertTriangle className="size-4 shrink-0" />
            <strong>{openIssueCount}</strong> unresolved reconciliation {openIssueCount === 1 ? "issue" : "issues"}.{" "}
            <button onClick={() => setActiveTab("reconciliation")} className="underline font-medium">View</button>
          </div>
        )}
        {pendingReviewCount > 0 && (
          <div className="mb-3 flex items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 dark:bg-blue-900/20 p-3 text-sm text-blue-700 dark:text-blue-300">
            <Shield className="size-4 shrink-0" />
            <strong>{pendingReviewCount}</strong> access {pendingReviewCount === 1 ? "review" : "reviews"} pending certification.{" "}
            <button onClick={() => setActiveTab("reviews")} className="underline font-medium">Review now</button>
          </div>
        )}

        {/* Tabs */}
        <div className="mb-4 flex gap-0.5 border-b overflow-x-auto">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium whitespace-nowrap transition-colors ${
                activeTab === tab.key
                  ? "border-b-2 border-primary text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <tab.icon className="size-3.5" />
              {tab.label}
              {tab.count !== undefined && (
                <span className={`rounded-full px-1.5 py-0.5 text-xs ${tab.alert ? "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300" : "bg-muted text-muted-foreground"}`}>
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* ── Accounts Tab ─────────────────────────────────────────────── */}
        {activeTab === "accounts" && (
          <>
            {data && (
              <div className="mb-4 flex flex-wrap gap-4 text-sm">
                <span><strong>{data.length}</strong> total</span>
                <span className="text-blue-600"><strong>{data.filter((a) => a.status === "active").length}</strong> active</span>
                <span className="text-muted-foreground"><strong>{data.filter((a) => a.vpnEnabled).length}</strong> VPN enabled</span>
                <span className="text-muted-foreground"><strong>{data.filter((a) => a.affiliationType !== "ndma_internal").length}</strong> external</span>
              </div>
            )}

            <div className="mb-4 flex flex-wrap gap-3">
              <select
                value={platform}
                onChange={(e) => setPlatform(e.target.value as Platform | "")}
                className="rounded-xl border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="">All Platforms</option>
                {(Object.keys(PLATFORM_LABELS) as Platform[]).map((p) => (
                  <option key={p} value={p}>{PLATFORM_LABELS[p]}</option>
                ))}
              </select>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as AccountStatus | "")}
                className="rounded-xl border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="">All Statuses</option>
                <option value="active">Active</option>
                <option value="suspended">Suspended</option>
                <option value="disabled">Disabled</option>
                <option value="orphaned">Orphaned</option>
                <option value="pending_review">Pending Review</option>
              </select>
              <select
                value={syncMode}
                onChange={(e) => setSyncMode(e.target.value as SyncMode | "")}
                className="rounded-xl border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="">All Sync Modes</option>
                <option value="manual">Manual</option>
                <option value="synced">Synced</option>
                <option value="hybrid">Hybrid</option>
              </select>
            </div>

            <div className="rounded-xl border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Identity</TableHead>
                    <TableHead>Platform</TableHead>
                    <TableHead>Account / ID</TableHead>
                    <TableHead>Affiliation</TableHead>
                    <TableHead>Auth Source</TableHead>
                    <TableHead>Sync</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Expires</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    Array.from({ length: 5 }).map((_, i) => (
                      <TableRow key={i}>
                        {Array.from({ length: 9 }).map((_, j) => (
                          <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                        ))}
                      </TableRow>
                    ))
                  ) : !data?.length ? (
                    <TableRow>
                      <TableCell colSpan={9} className="py-12 text-center text-muted-foreground">
                        No platform accounts found.
                      </TableCell>
                    </TableRow>
                  ) : (
                    data.map((account) => {
                      const isExpired = account.expiresAt && isPast(parseISO(account.expiresAt));
                      const displayName = (account as Record<string, unknown> & { staffProfile?: { user?: { name?: string } }; externalContact?: { name?: string } }).staffProfile?.user?.name ?? (account as Record<string, unknown> & { externalContact?: { name?: string } }).externalContact?.name ?? account.displayName ?? "—";
                      return (
                        <TableRow key={account.id}>
                          <TableCell className="font-medium">
                            <Link to="/access/$accountId" params={{ accountId: account.id }} className="hover:underline">
                              {displayName}
                            </Link>
                            {(account as Record<string, unknown> & { externalContact?: { organization?: string } }).externalContact?.organization && (
                              <p className="text-xs text-muted-foreground mt-0.5">{(account as Record<string, unknown> & { externalContact?: { organization?: string } }).externalContact!.organization}</p>
                            )}
                          </TableCell>
                          <TableCell className="text-sm">{PLATFORM_LABELS[account.platform as Platform] ?? account.platform}</TableCell>
                          <TableCell className="font-mono text-xs text-muted-foreground">
                            {account.accountIdentifier}
                            {account.privilegeLevel && (
                              <span className="ml-1 text-xs text-amber-600">({account.privilegeLevel})</span>
                            )}
                          </TableCell>
                          <TableCell><AffiliationBadge affiliation={account.affiliationType} /></TableCell>
                          <TableCell><AuthBadge source={account.authSource} /></TableCell>
                          <TableCell>
                            <span className={`inline-flex items-center rounded-lg px-1.5 py-0.5 text-xs font-medium ${SYNC_MODE_COLORS[account.syncMode as SyncMode] ?? ""}`}>
                              {account.syncMode}
                            </span>
                          </TableCell>
                          <TableCell><StatusBadge status={account.status} /></TableCell>
                          <TableCell className={`text-xs ${isExpired ? "text-red-600 font-medium" : "text-muted-foreground"}`}>
                            {account.expiresAt ? format(parseISO(account.expiresAt), "dd MMM yyyy") : "—"}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1">
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 w-7 p-0"
                                onClick={() => setEditAccount(account as unknown as Record<string, unknown>)}
                                title="Edit account"
                              >
                                <Pencil className="size-3" />
                              </Button>
                              {account.status !== "disabled" && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-7 w-7 p-0 text-red-600 hover:text-red-700"
                                  onClick={() => disableAccountMutation.mutate({ id: account.id })}
                                  disabled={disableAccountMutation.isPending}
                                  title="Disable account"
                                >
                                  <Ban className="size-3" />
                                </Button>
                              )}
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 text-xs gap-1"
                                onClick={() => markReviewedMutation.mutate({ id: account.id })}
                                disabled={markReviewedMutation.isPending}
                              >
                                <CheckCircle className="size-3" />
                                Review
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>
          </>
        )}

        {/* ── VPN Tab ──────────────────────────────────────────────────── */}
        {activeTab === "vpn" && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              All identities with VPN access enabled, grouped by VPN group/profile.
              Covers NDMA staff, contractors, and other external users.
            </p>

            {vpnLoading ? (
              Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-14 w-full rounded-xl" />)
            ) : !vpnAccounts?.length ? (
              <div className="rounded-xl border border-dashed p-12 text-center text-muted-foreground">
                <Network className="size-8 mx-auto mb-3 opacity-40" />
                <p className="font-medium">No VPN accounts recorded</p>
              </div>
            ) : (
              <div className="rounded-xl border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Identity</TableHead>
                      <TableHead>Account ID</TableHead>
                      <TableHead>Affiliation</TableHead>
                      <TableHead>VPN Group</TableHead>
                      <TableHead>VPN Profile</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Expires</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {vpnAccounts.map((account) => {
                      const displayName = (account as Record<string, unknown> & { staffProfile?: { user?: { name?: string } }; externalContact?: { name?: string } }).staffProfile?.user?.name ?? (account as Record<string, unknown> & { externalContact?: { name?: string } }).externalContact?.name ?? account.displayName ?? "—";
                      const isExpired = account.expiresAt && isPast(parseISO(account.expiresAt));
                      return (
                        <TableRow key={account.id}>
                          <TableCell className="font-medium">
                            <Link to="/access/$accountId" params={{ accountId: account.id }} className="hover:underline">
                              {displayName}
                            </Link>
                            {(account as Record<string, unknown> & { externalContact?: { organization?: string } }).externalContact?.organization && (
                              <p className="text-xs text-muted-foreground mt-0.5">{(account as Record<string, unknown> & { externalContact?: { organization?: string } }).externalContact!.organization}</p>
                            )}
                          </TableCell>
                          <TableCell className="font-mono text-xs text-muted-foreground">{account.accountIdentifier}</TableCell>
                          <TableCell><AffiliationBadge affiliation={account.affiliationType} /></TableCell>
                          <TableCell className="text-sm">{account.vpnGroup ?? <span className="text-muted-foreground">—</span>}</TableCell>
                          <TableCell className="text-sm">{account.vpnProfile ?? <span className="text-muted-foreground">—</span>}</TableCell>
                          <TableCell><StatusBadge status={account.status} /></TableCell>
                          <TableCell className={`text-xs ${isExpired ? "text-red-600 font-medium" : "text-muted-foreground"}`}>
                            {account.expiresAt ? format(parseISO(account.expiresAt), "dd MMM yyyy") : "—"}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        )}

        {/* ── Groups Tab ───────────────────────────────────────────────── */}
        {activeTab === "groups" && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              AD groups, VPN groups, platform roles, and local groups. Each group may
              contain NDMA staff accounts or external contact accounts.
            </p>

            {groupsLoading ? (
              Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-14 w-full rounded-xl" />)
            ) : !groups?.length ? (
              <div className="rounded-xl border border-dashed p-12 text-center text-muted-foreground">
                <Users className="size-8 mx-auto mb-3 opacity-40" />
                <p className="font-medium">No access groups defined</p>
                <p className="text-sm mt-1">Define AD groups, VPN groups, or platform roles.</p>
              </div>
            ) : (
              <div className="rounded-xl border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Group Name</TableHead>
                      <TableHead>Platform</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Sync</TableHead>
                      <TableHead>External ID</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {groups.map((group) => (
                      <TableRow key={group.id}>
                        <TableCell className="font-medium">{group.name}</TableCell>
                        <TableCell className="text-sm">{PLATFORM_LABELS[group.platform as Platform] ?? group.platform}</TableCell>
                        <TableCell>
                          <span className="inline-flex items-center rounded-lg px-1.5 py-0.5 text-xs font-medium bg-muted text-muted-foreground">
                            {group.groupType.replace(/_/g, " ")}
                          </span>
                        </TableCell>
                        <TableCell>
                          <span className={`inline-flex items-center rounded-lg px-1.5 py-0.5 text-xs font-medium ${SYNC_MODE_COLORS[group.syncMode as SyncMode] ?? ""}`}>
                            {group.syncMode}
                          </span>
                        </TableCell>
                        <TableCell className="font-mono text-xs text-muted-foreground">{group.externalId ?? "—"}</TableCell>
                        <TableCell>
                          <span className={`inline-flex items-center rounded-lg px-1.5 py-0.5 text-xs font-medium ${group.isActive ? "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300" : "bg-muted text-muted-foreground"}`}>
                            {group.isActive ? "Active" : "Inactive"}
                          </span>
                        </TableCell>
                        <TableCell>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 w-7 p-0"
                            onClick={() => setEditGroup(group as unknown as Record<string, unknown>)}
                          >
                            <Pencil className="size-3" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        )}

        {/* ── External Contacts Tab ─────────────────────────────────────── */}
        {activeTab === "external" && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              External identities — contractors, consultants, vendors, and external agency
              users — who hold accounts on DCS-managed platforms.
            </p>

            {extLoading ? (
              Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-14 w-full rounded-xl" />)
            ) : !externalContacts?.length ? (
              <div className="rounded-xl border border-dashed p-12 text-center text-muted-foreground">
                <UserX className="size-8 mx-auto mb-3 opacity-40" />
                <p className="font-medium">No external contacts</p>
                <p className="text-sm mt-1">External contacts are non-NDMA identities with platform access.</p>
              </div>
            ) : (
              <div className="rounded-xl border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Organization</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Affiliation</TableHead>
                      <TableHead>Accounts</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {externalContacts.map((contact) => (
                      <TableRow key={contact.id}>
                        <TableCell className="font-medium">{contact.name}</TableCell>
                        <TableCell className="text-sm">{contact.organization ?? <span className="text-muted-foreground">—</span>}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{contact.email ?? "—"}</TableCell>
                        <TableCell><AffiliationBadge affiliation={contact.affiliationType} /></TableCell>
                        <TableCell className="text-sm">{(contact as unknown as Record<string, unknown> & { platformAccounts?: unknown[] }).platformAccounts?.length ?? 0}</TableCell>
                        <TableCell>
                          <span className={`inline-flex items-center rounded-lg px-1.5 py-0.5 text-xs font-medium ${contact.isActive ? "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300" : "bg-muted text-muted-foreground"}`}>
                            {contact.isActive ? "Active" : "Inactive"}
                          </span>
                        </TableCell>
                        <TableCell>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 w-7 p-0"
                            onClick={() => setEditContact(contact as unknown as Record<string, unknown>)}
                          >
                            <Pencil className="size-3" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        )}

        {/* ── Access Reviews Tab ───────────────────────────────────────── */}
        {activeTab === "reviews" && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Pending access certifications. Approve to confirm access is still required,
              Revoke to immediately disable the account, or Escalate for manager review.
            </p>

            {reviewsLoading ? (
              Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-16 w-full rounded-xl" />)
            ) : !pendingReviews?.length ? (
              <div className="rounded-xl border border-dashed p-12 text-center text-muted-foreground">
                <Shield className="size-8 mx-auto mb-3 opacity-40 text-blue-500" />
                <p className="font-medium">All access reviews complete</p>
                <p className="text-sm mt-1">No pending certifications.</p>
              </div>
            ) : (
              pendingReviews.map((review) => {
                const account = (review as unknown as Record<string, unknown> & { platformAccount?: Record<string, unknown> & { staffProfile?: { user?: { name?: string } }; externalContact?: { name?: string }; platform?: string; accountIdentifier?: string; affiliationType?: string } }).platformAccount;
                const displayName = account?.staffProfile?.user?.name ?? account?.externalContact?.name ?? "Unknown";
                return (
                  <div key={review.id} className="rounded-xl border p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-medium text-sm">{displayName}</p>
                          {account && <span className="text-xs text-muted-foreground">{PLATFORM_LABELS[account.platform as Platform] ?? account.platform} · {account.accountIdentifier}</span>}
                          {account && <AffiliationBadge affiliation={account.affiliationType as string} />}
                        </div>
                        {String(review.nextReviewDate ?? "").length > 0 && (
                          <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                            <Clock className="size-3" />
                            Due: {format(parseISO(review.nextReviewDate as string), "dd MMM yyyy")}
                          </p>
                        )}
                        {String(review.notes ?? "").length > 0 && (
                          <p className="text-xs text-muted-foreground mt-1">{review.notes as string}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs text-blue-600 hover:text-blue-700"
                          onClick={() => completeReviewMutation.mutate({ id: review.id, status: "approved" })}
                          disabled={completeReviewMutation.isPending}
                        >
                          Approve
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs text-red-600 hover:text-red-700"
                          onClick={() => completeReviewMutation.mutate({ id: review.id, status: "revoked" })}
                          disabled={completeReviewMutation.isPending}
                        >
                          Revoke
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* ── Integrations Tab ─────────────────────────────────────────── */}
        {activeTab === "integrations" && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground mb-4">
              Platform connectors for API-based account synchronization. Configure to pull
              records automatically from phpIPAM, Active Directory, RADIUS, Zabbix, or other
              managed systems. Manual entry remains available for all platforms.
            </p>

            {integrationsLoading ? (
              Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-24 w-full rounded-xl" />)
            ) : !integrations?.length ? (
              <div className="rounded-xl border border-dashed p-12 text-center text-muted-foreground">
                <Plug className="size-8 mx-auto mb-3 opacity-40" />
                <p className="font-medium">No integrations configured</p>
                <p className="text-sm mt-1">Platform integrations enable automatic account sync from external APIs.</p>
                <Button size="sm" className="mt-4 gap-1.5" onClick={() => setShowCreateIntegration(true)}>
                  <Plus className="size-3.5" />Add your first integration
                </Button>
              </div>
            ) : (
              <div className="grid gap-3">
                {integrations.map((integration) => {
                  const ptKey = (integration.platform) as PlatformType;
                  const platformInfo = PLATFORMS[ptKey] ?? PLATFORMS.other;
                  const catStyle = CATEGORY_STYLES[platformInfo.category] ?? CATEGORY_STYLES.Other;
                  const syncDir = (integration.syncDirection as string) ?? "";
                  const syncFreq = (integration as unknown as Record<string, unknown>).syncFrequency as number | undefined
                    ?? integration.syncFrequencyMinutes;
                  const lastSyncAt = integration.lastSyncAt;
                  const lastSyncError = (integration as unknown as Record<string, unknown>).lastSyncError as string | undefined;
                  const notes = (integration as unknown as Record<string, unknown>).notes as string | undefined
                    ?? (integration as unknown as Record<string, unknown>).description as string | undefined;
                  const supportTeam = (integration as unknown as Record<string, unknown>).supportTeam as string | undefined;
                  const runbookUrl = (integration as unknown as Record<string, unknown>).runbookUrl as string | undefined;

                  return (
                    <div key={integration.id} className={`rounded-lg border p-4 transition-shadow hover:shadow-sm ${integration.status === "error" ? "border-red-200 bg-red-50/40 dark:border-red-800 dark:bg-red-950/20" : ""}`}>
                      <div className="flex items-start gap-4">
                        {/* Platform icon */}
                        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border text-xl ${catStyle.border} ${catStyle.bg}`}>
                          {platformInfo.icon}
                        </div>

                        {/* Main content */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="font-semibold text-sm">{integration.name}</p>
                            {/* Status badge */}
                            <span className={`inline-flex items-center rounded-lg px-1.5 py-0.5 text-xs font-medium ${INTEGRATION_STATUS_COLORS[integration.status] ?? "bg-muted text-muted-foreground"}`}>
                              {integration.status.charAt(0).toUpperCase() + integration.status.slice(1)}
                            </span>
                            {/* Sync badge */}
                            {integration.syncEnabled ? (
                              <span className="inline-flex items-center gap-1 rounded-lg px-1.5 py-0.5 text-xs font-medium bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">
                                <Activity className="size-3" />Auto-sync
                              </span>
                            ) : (
                              <span className="inline-flex items-center rounded-lg px-1.5 py-0.5 text-xs font-medium bg-muted text-muted-foreground">
                                Manual
                              </span>
                            )}
                            {/* Category badge */}
                            <span className={`inline-flex items-center rounded-lg px-1.5 py-0.5 text-xs font-medium ${catStyle.badge}`}>
                              {platformInfo.category}
                            </span>
                          </div>

                          <p className="text-xs text-muted-foreground mt-1">
                            {platformInfo.label}
                            {syncDir && <span className="ml-2">· {syncDir}</span>}
                            {syncFreq && <span className="ml-2">· every {syncFreq}m</span>}
                          </p>

                          {supportTeam && (
                            <p className="text-xs text-muted-foreground mt-0.5">Support: {supportTeam}</p>
                          )}

                          {notes && (
                            <p className="text-xs text-muted-foreground mt-0.5 truncate">{notes}</p>
                          )}

                          {lastSyncAt && (
                            <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                              <Clock className="size-3" />
                              Last sync: {format(lastSyncAt instanceof Date ? lastSyncAt : new Date(lastSyncAt), "dd MMM yyyy, HH:mm")}
                            </p>
                          )}

                          {lastSyncError && (
                            <p className="text-xs text-red-600 mt-1 flex items-center gap-1">
                              <AlertCircle className="size-3 shrink-0" />
                              {lastSyncError}
                            </p>
                          )}
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-1.5 shrink-0">
                          {runbookUrl && (
                            <a
                              href={runbookUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs text-blue-600 hover:underline px-1"
                            >
                              Runbook
                            </a>
                          )}
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 w-7 p-0"
                            onClick={() => setEditIntegration(integration as unknown as Record<string, unknown>)}
                            title="Edit integration"
                          >
                            <Pencil className="size-3" />
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs gap-1"
                            onClick={() => triggerSyncMutation.mutate({ integrationId: integration.id })}
                            disabled={triggerSyncMutation.isPending}
                            title="Trigger sync now"
                          >
                            <RefreshCw className={`size-3 ${triggerSyncMutation.isPending ? "animate-spin" : ""}`} />
                            Sync now
                          </Button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ── Reconciliation Tab ───────────────────────────────────────── */}
        {activeTab === "reconciliation" && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground mb-4">
              Discrepancies detected during sync — orphaned accounts, disabled staff with
              active accounts, expired contractors, stale records, and mismatches. Resolve
              each issue manually or dismiss with a note.
            </p>

            {reconcLoading ? (
              Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-16 w-full rounded-xl" />)
            ) : !reconciliationData?.length ? (
              <div className="rounded-xl border border-dashed p-12 text-center text-muted-foreground">
                <CheckCircle className="size-8 mx-auto mb-3 opacity-40" />
                <p className="font-medium">No open issues</p>
                <p className="text-sm mt-1">All reconciliation checks passed.</p>
              </div>
            ) : (
              reconciliationData.map((issue) => (
                <div key={issue.id} className="rounded-xl border border-amber-200 bg-amber-50 dark:bg-amber-900/10 p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="inline-flex items-center rounded-lg px-2 py-0.5 text-xs font-medium bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
                          {issue.issueType.replace(/_/g, " ")}
                        </span>
                        <span className="text-xs text-muted-foreground">{(issue as unknown as Record<string, unknown> & { integration?: { name?: string } }).integration?.name}</span>
                      </div>
                      {(issue as unknown as Record<string, unknown> & { platformAccount?: { staffProfile?: { user?: { name?: string } }; externalContact?: { name?: string } } }).platformAccount?.staffProfile?.user?.name && (
                        <p className="text-sm font-medium mt-1">{(issue as unknown as Record<string, unknown> & { platformAccount?: { staffProfile?: { user?: { name?: string } } } }).platformAccount!.staffProfile!.user!.name}</p>
                      )}
                      {(issue as unknown as Record<string, unknown> & { platformAccount?: { externalContact?: { name?: string } } }).platformAccount?.externalContact?.name && (
                        <p className="text-sm font-medium mt-1">{(issue as unknown as Record<string, unknown> & { platformAccount?: { externalContact?: { name?: string } } }).platformAccount!.externalContact!.name} (external)</p>
                      )}
                      {issue.externalAccountId && (
                        <p className="text-xs text-muted-foreground font-mono mt-0.5">External ID: {issue.externalAccountId}</p>
                      )}
                      {issue.details && (
                        <p className="text-xs text-muted-foreground mt-1">{issue.details}</p>
                      )}
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs shrink-0"
                      onClick={() => resolveIssueMutation.mutate({ id: issue.id })}
                      disabled={resolveIssueMutation.isPending}
                    >
                      Resolve
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </Main>

      {/* ── Dialogs ──────────────────────────────────────────────────────── */}

      <AccountDialog
        key={editAccount ? (editAccount.id as string) : "new-account"}
        open={showCreateAccount || !!editAccount}
        onClose={() => { setShowCreateAccount(false); setEditAccount(null); }}
        staff={staffForPicker}
        contacts={contactsForPicker}
        onSave={(data) => {
          if (editAccount) updateAccountMutation.mutate(data as Parameters<typeof updateAccountMutation.mutate>[0]);
          else createAccountMutation.mutate(data as Parameters<typeof createAccountMutation.mutate>[0]);
        }}
        isPending={createAccountMutation.isPending || updateAccountMutation.isPending}
        editData={editAccount}
      />

      <ContactDialog
        key={editContact ? (editContact.id as string) : "new-contact"}
        open={showCreateContact || !!editContact}
        onClose={() => { setShowCreateContact(false); setEditContact(null); }}
        onSave={(data) => {
          if (editContact) updateContactMutation.mutate(data as Parameters<typeof updateContactMutation.mutate>[0]);
          else createContactMutation.mutate(data as Parameters<typeof createContactMutation.mutate>[0]);
        }}
        isPending={createContactMutation.isPending || updateContactMutation.isPending}
        editData={editContact}
      />

      <GroupDialog
        key={editGroup ? (editGroup.id as string) : "new-group"}
        open={showCreateGroup || !!editGroup}
        onClose={() => { setShowCreateGroup(false); setEditGroup(null); }}
        onSave={(data) => {
          if (editGroup) updateGroupMutation.mutate(data as Parameters<typeof updateGroupMutation.mutate>[0]);
          else createGroupMutation.mutate(data as Parameters<typeof createGroupMutation.mutate>[0]);
        }}
        isPending={createGroupMutation.isPending || updateGroupMutation.isPending}
        editData={editGroup}
      />

      <IntegrationDialog
        key={editIntegration ? (editIntegration.id as string) : "new-integration"}
        open={showCreateIntegration || !!editIntegration}
        onClose={() => { setShowCreateIntegration(false); setEditIntegration(null); }}
        onSave={(data) => {
          if (editIntegration) updateIntegrationMutation.mutate(data as Parameters<typeof updateIntegrationMutation.mutate>[0]);
          else createIntegrationMutation.mutate(data as Parameters<typeof createIntegrationMutation.mutate>[0]);
        }}
        isPending={createIntegrationMutation.isPending || updateIntegrationMutation.isPending}
        editData={editIntegration}
      />
    </>
  );
}
