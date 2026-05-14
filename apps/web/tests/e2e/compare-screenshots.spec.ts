import { test } from "@playwright/test";

// Full-coverage screenshot tour: every prototype hash-route vs every live route.

const DIR = "tests/screenshots";

test.describe("design-comparison", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  // Every prototype route from design handoff/app.jsx
  const PROTOTYPE_ROUTES: Array<{ name: string; hash: string }> = [
    { name: "home", hash: "" },
    { name: "work", hash: "#/work" },
    { name: "incidents", hash: "#/incidents" },
    { name: "changes", hash: "#/changes" },
    { name: "services", hash: "#/services" },
    { name: "ops-readiness", hash: "#/ops-readiness" },
    { name: "scheduling", hash: "#/scheduling" },
    { name: "scheduling-maintenance", hash: "#/scheduling/maintenance" },
    { name: "attendance", hash: "#/attendance" },
    { name: "lateness", hash: "#/lateness" },
    { name: "timesheets", hash: "#/timesheets" },
    { name: "staff", hash: "#/staff" },
    { name: "leave", hash: "#/leave" },
    { name: "leave-planner", hash: "#/leave/planner" },
    { name: "career-progression", hash: "#/career-progression" },
    { name: "contracts", hash: "#/contracts" },
    { name: "compliance", hash: "#/compliance" },
    { name: "appraisals", hash: "#/appraisals" },
    { name: "appraisals-tracker", hash: "#/appraisals/tracker" },
    { name: "cycles", hash: "#/cycles" },
    { name: "noc-performance", hash: "#/noc-performance" },
    { name: "training", hash: "#/training" },
    { name: "access", hash: "#/access" },
    { name: "access-registry", hash: "#/access/registry" },
    { name: "access-platforms", hash: "#/access/platforms" },
    { name: "procurement", hash: "#/procurement" },
    { name: "advances", hash: "#/advances" },
    { name: "advances-new", hash: "#/advances/new" },
    { name: "policy", hash: "#/policy" },
    { name: "forms", hash: "#/forms" },
    { name: "analytics", hash: "#/analytics" },
    { name: "reports", hash: "#/reports" },
    { name: "audit", hash: "#/audit" },
    { name: "notifications", hash: "#/notifications" },
    { name: "settings", hash: "#/settings" },
  ];

  for (const { name, hash } of PROTOTYPE_ROUTES) {
    test(`prototype: ${name}`, async ({ page }) => {
      await page.goto(`http://localhost:8765/index.html${hash}`);
      await page.waitForTimeout(2500);
      await page.screenshot({ path: `${DIR}/prototype-${name}.png` });
    });
  }

  const LIVE_ROUTES: Array<{ name: string; url: string }> = [
    { name: "home", url: "/" },
    { name: "work", url: "/work" },
    { name: "incidents", url: "/incidents" },
    { name: "changes", url: "/changes" },
    { name: "services", url: "/services" },
    { name: "ops-readiness", url: "/ops-readiness" },
    { name: "scheduling", url: "/scheduling" },
    { name: "scheduling-dcs", url: "/scheduling/dcs-oncall" },
    { name: "scheduling-noc", url: "/scheduling/noc-shifts" },
    { name: "scheduling-maintenance", url: "/scheduling/maintenance" },
    { name: "attendance", url: "/attendance" },
    { name: "attendance-rollcall", url: "/attendance/roll-call" },
    { name: "attendance-monthly", url: "/attendance/monthly" },
    { name: "attendance-holidays", url: "/attendance/holidays" },
    { name: "lateness", url: "/lateness" },
    { name: "timesheets", url: "/timesheets" },
    { name: "staff", url: "/staff" },
    { name: "leave", url: "/leave" },
    { name: "leave-planner", url: "/leave/planner" },
    { name: "career-progression", url: "/career-progression" },
    { name: "contracts", url: "/contracts" },
    { name: "compliance", url: "/compliance" },
    { name: "appraisals", url: "/appraisals" },
    { name: "cycles", url: "/cycles" },
    { name: "noc-performance", url: "/noc-performance" },
    { name: "training", url: "/training" },
    { name: "access", url: "/access" },
    { name: "access-registry", url: "/access/registry" },
    { name: "access-platforms", url: "/access/platforms" },
    { name: "procurement", url: "/procurement" },
    { name: "advances", url: "/advances" },
    { name: "advances-new", url: "/advances/new" },
    { name: "policy", url: "/policy" },
    { name: "forms", url: "/forms" },
    { name: "analytics", url: "/analytics" },
    { name: "reports", url: "/reports" },
    { name: "audit", url: "/audit" },
    { name: "notifications", url: "/notifications" },
    { name: "settings", url: "/settings" },
  ];

  for (const { name, url } of LIVE_ROUTES) {
    test(`live: ${name}`, async ({ page }) => {
      await page.goto(`http://localhost:3001${url}`, {
        waitUntil: "networkidle",
        timeout: 30_000,
      });
      await page.waitForTimeout(1500);
      await page.screenshot({ path: `${DIR}/live-${name}.png` });
    });
  }
});
