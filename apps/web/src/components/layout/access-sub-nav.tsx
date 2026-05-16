// Shared sub-navigation for the Identity & Access hub.
// One sidebar entry "Access" → internal tabs: Accounts · Registry · Platforms.
//
// Usage in each access route:
//   import { AccessSubNav } from "@/components/layout/access-sub-nav";
//   <AccessSubNav activeView="accounts" />

import { useNavigate } from "@tanstack/react-router";
import { Boxes, IdCard, KeyRound } from "lucide-react";

export type AccessView = "accounts" | "registry" | "platforms";

const TABS: Array<{
  value: AccessView;
  label: string;
  Icon: React.FC<React.SVGProps<SVGSVGElement>>;
  route: string;
}> = [
  { value: "accounts", label: "Accounts", Icon: KeyRound, route: "/access" },
  { value: "registry", label: "Registry", Icon: IdCard, route: "/access/registry" },
  { value: "platforms", label: "Platforms", Icon: Boxes, route: "/access/platforms" },
];

export function AccessSubNav({ activeView }: { activeView: AccessView }) {
  const navigate = useNavigate();
  return (
    <div className="flex items-center gap-0.5 border-b px-6">
      {TABS.map((tab) => {
        const active = tab.value === activeView;
        return (
          <button
            key={tab.value}
            type="button"
            onClick={() => navigate({ to: tab.route })}
            className={[
              "flex items-center gap-1.5 border-b-2 px-3 py-3 text-sm font-medium transition-colors",
              active
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:border-border hover:text-foreground",
            ].join(" ")}
          >
            <tab.Icon className="size-3.5" />
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
