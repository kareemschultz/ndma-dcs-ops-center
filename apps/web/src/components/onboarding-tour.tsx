/**
 * OnboardingTour — a dismissible first-run welcome walkthrough.
 *
 * Shows once on the first authenticated load (when the localStorage flag is
 * absent). A clean centered card sequence of 5 steps — no fragile DOM
 * spotlighting. Built on the shared Base UI Dialog, which already provides
 * focus-trapping, Escape-to-close and a backdrop.
 *
 * Persistence: the flag `dcs-onboarding-seen-v1` in localStorage. Finishing,
 * skipping or pressing Escape sets it so the tour never auto-shows again.
 * "Replay tour" (in the user menu) clears the flag and dispatches the
 * `dcs-onboarding:replay` event to re-open it without a reload.
 */
import { useCallback, useEffect, useState } from "react";
import {
  Compass,
  Filter,
  LayoutGrid,
  PartyPopper,
  Sparkles,
} from "lucide-react";
import { Button } from "@ndma-dcs-staff-portal/ui/components/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@ndma-dcs-staff-portal/ui/components/dialog";

const STORAGE_KEY = "dcs-onboarding-seen-v1";
/** Fired by the "Replay tour" menu item to re-open the tour. */
export const ONBOARDING_REPLAY_EVENT = "dcs-onboarding:replay";

type TourStep = {
  icon: typeof Sparkles;
  title: string;
  body: string;
};

const STEPS: ReadonlyArray<TourStep> = [
  {
    icon: Sparkles,
    title: "Welcome to DCS Ops Center",
    body: "Your hub for work, scheduling, attendance, leave and more. Here's a 30-second tour.",
  },
  {
    icon: Compass,
    title: "Find your way around",
    body: "The left sidebar groups everything — Operations, Scheduling, People, Performance. Click a group to expand it.",
  },
  {
    icon: Filter,
    title: "Filter by department",
    body: "Most pages can be filtered to DCS or NOC using the filter in the top bar. Your choice is remembered as you move around.",
  },
  {
    icon: LayoutGrid,
    title: "Switch how you see data",
    body: "Registers offer multiple views — table, board, timeline. Use the view toggle in each page's toolbar to pick what suits the task.",
  },
  {
    icon: PartyPopper,
    title: "You're all set",
    body: "Your profile, leave requests and notifications are in the top-right menu. You can replay this tour anytime from there.",
  },
] as const;

/** Clears the seen flag — used by the "Replay tour" menu item. */
export function resetOnboardingTour(): void {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // localStorage unavailable (private mode) — ignore.
  }
  window.dispatchEvent(new Event(ONBOARDING_REPLAY_EVENT));
}

function markSeen(): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, "1");
  } catch {
    // localStorage unavailable — ignore.
  }
}

function hasSeen(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return true; // No storage → don't nag the user every load.
  }
}

export function OnboardingTour() {
  const [open, setOpen] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);

  // Auto-open once on the first authenticated load (localStorage-gated).
  useEffect(() => {
    if (!hasSeen()) {
      setStepIndex(0);
      setOpen(true);
    }
  }, []);

  // Re-open when "Take the tour" / "Replay tour" is invoked.
  useEffect(() => {
    const handleReplay = () => {
      setStepIndex(0);
      setOpen(true);
    };
    window.addEventListener(ONBOARDING_REPLAY_EVENT, handleReplay);
    return () =>
      window.removeEventListener(ONBOARDING_REPLAY_EVENT, handleReplay);
  }, []);

  // Any close (finish, skip, Escape, backdrop) marks the tour as seen.
  const handleOpenChange = useCallback((next: boolean) => {
    setOpen(next);
    if (!next) markSeen();
  }, []);

  const close = useCallback(() => handleOpenChange(false), [handleOpenChange]);

  const step = STEPS[stepIndex];
  const isFirst = stepIndex === 0;
  const isLast = stepIndex === STEPS.length - 1;
  const StepIcon = step.icon;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="sm:max-w-md"
        aria-label="DCS Ops Center welcome tour"
      >
        <DialogHeader>
          <div className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <StepIcon className="size-5" aria-hidden="true" />
          </div>
          <DialogTitle className="text-base">{step.title}</DialogTitle>
          <DialogDescription className="text-sm">
            {step.body}
          </DialogDescription>
        </DialogHeader>

        {/* Progress dots */}
        <div
          className="flex items-center gap-1.5"
          aria-label={`Step ${stepIndex + 1} of ${STEPS.length}`}
        >
          {STEPS.map((s, i) => (
            <span
              key={s.title}
              aria-hidden="true"
              className={
                i === stepIndex
                  ? "h-1.5 w-5 rounded-full bg-primary transition-all"
                  : "h-1.5 w-1.5 rounded-full bg-muted-foreground/30 transition-all"
              }
            />
          ))}
        </div>

        <DialogFooter className="sm:items-center sm:justify-between">
          <DialogClose
            render={
              <Button
                variant="ghost"
                size="sm"
                aria-label="Skip the welcome tour"
              />
            }
          >
            Skip tour
          </DialogClose>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={isFirst}
              onClick={() => setStepIndex((i) => Math.max(0, i - 1))}
            >
              Back
            </Button>
            {isLast ? (
              <Button size="sm" onClick={close}>
                Get started
              </Button>
            ) : (
              <Button
                size="sm"
                onClick={() =>
                  setStepIndex((i) => Math.min(STEPS.length - 1, i + 1))
                }
              >
                Next
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
