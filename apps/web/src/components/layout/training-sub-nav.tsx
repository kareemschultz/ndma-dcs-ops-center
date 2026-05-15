import { Link } from "@tanstack/react-router";

/**
 * Training section sub-navigation.
 * Labels are written as plain-English tasks so users know what each page is for.
 */
const TRAINING_TABS = [
  { to: "/training", label: "Hub" },
  { to: "/training/plan", label: "Training Plan" },
  { to: "/training/events", label: "Training Events" },
  { to: "/training/in-house", label: "In-House Sessions" },
  { to: "/training/vouchers", label: "Exam Vouchers" },
  { to: "/training/exams", label: "Exam Bookings" },
  { to: "/training/catalog", label: "Certification Catalog" },
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
