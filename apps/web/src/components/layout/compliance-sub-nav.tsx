// Compliance Sub-Nav — persistent tabs across all compliance pages
// Create: apps/web/src/components/layout/compliance-sub-nav.tsx
// Import in: compliance/index.tsx, compliance/ppe.tsx, compliance/training.tsx, compliance/items.tsx

import { useNavigate, useLocation } from "@tanstack/react-router";
import { BookOpen, HardHat, LayoutDashboard, ShieldCheck } from "lucide-react";

const COMPLIANCE_TABS = [
  { to: "/compliance",           label: "Overview",     Icon: LayoutDashboard },
  { to: "/compliance/ppe",       label: "PPE",          Icon: HardHat         },
  { to: "/compliance/training",  label: "Training",     Icon: BookOpen        },
  { to: "/compliance/items",     label: "Policy Acks",  Icon: ShieldCheck     },
] as const;

export function ComplianceSubNav() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const active = COMPLIANCE_TABS.find((t) => t.to === pathname)?.to ?? "/compliance";

  return (
    <div className="flex items-center gap-0.5 border-b px-6">
      {COMPLIANCE_TABS.map((tab) => (
        <button
          key={tab.to}
          onClick={() => navigate({ to: tab.to })}
          className={[
            "flex items-center gap-1.5 border-b-2 px-3 py-3 text-sm font-medium transition-colors",
            active === tab.to
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:border-border hover:text-foreground",
          ].join(" ")}
        >
          <tab.Icon className="size-3.5" />
          {tab.label}
        </button>
      ))}
    </div>
  );
}
