import { Link } from "@tanstack/react-router";

const TRAINING_TABS = [
  { to: "/training", label: "Overview" },
  { to: "/training/plan", label: "Plan Matrix" },
  { to: "/training/catalog", label: "Catalog" },
  { to: "/training/exams", label: "Exams" },
  { to: "/training/events", label: "Events" },
  { to: "/training/vouchers", label: "Vouchers" },
  { to: "/training/in-house", label: "In-House Log" },
] as const;

export function TrainingSubNav({ active }: { active: string }) {
  return (
    <div className="flex items-center gap-0.5 overflow-x-auto border-b px-6">
      {TRAINING_TABS.map((tab) => (
        <Link
          key={tab.to}
          to={tab.to as string}
          className={[
            "flex shrink-0 items-center border-b-2 px-3 py-3 text-sm font-medium transition-colors",
            active === tab.to
              ? "border-primary text-foreground"
              : "border-transparent text-muted-foreground hover:border-border hover:text-foreground",
          ].join(" ")}
        >
          {tab.label}
        </Link>
      ))}
    </div>
  );
}
