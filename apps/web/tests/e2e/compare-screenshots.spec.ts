import { test } from "@playwright/test";

// Comprehensive screenshot tour: dev server (3001) vs prototype (8765).
// Run: bunx playwright test compare-screenshots.spec.ts --project=chromium --reporter=list

const DIR = "tests/screenshots";

test.describe("design-comparison", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  const PROTOTYPE_PAGES: Array<{ name: string; hash: string }> = [
    { name: "home", hash: "" },
    { name: "appraisals", hash: "#/appraisals" },
    { name: "staff", hash: "#/staff" },
    { name: "attendance", hash: "#/attendance" },
    { name: "leave-planner", hash: "#/leave/planner" },
    { name: "advances", hash: "#/advances" },
  ];

  for (const { name, hash } of PROTOTYPE_PAGES) {
    test(`prototype: ${name}`, async ({ page }) => {
      await page.goto(`http://localhost:8765/index.html${hash}`);
      await page.waitForTimeout(2500);
      await page.screenshot({ path: `${DIR}/prototype-${name}.png` });
    });
  }

  const LIVE_PAGES: Array<{ name: string; url: string }> = [
    { name: "home", url: "/" },
    { name: "appraisals", url: "/appraisals" },
    { name: "advances", url: "/advances" },
    { name: "advances-new", url: "/advances/new" },
    { name: "leave", url: "/leave" },
    { name: "leave-planner", url: "/leave/planner" },
    { name: "staff", url: "/staff" },
    { name: "attendance", url: "/attendance" },
    { name: "attendance-rollcall", url: "/attendance/roll-call" },
    { name: "attendance-monthly", url: "/attendance/monthly" },
    { name: "attendance-holidays", url: "/attendance/holidays" },
    { name: "contracts", url: "/contracts" },
    { name: "timesheets", url: "/timesheets" },
    { name: "scheduling", url: "/scheduling" },
    { name: "noc-performance", url: "/noc-performance" },
    { name: "training", url: "/training" },
    { name: "compliance", url: "/compliance" },
  ];

  for (const { name, url } of LIVE_PAGES) {
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
