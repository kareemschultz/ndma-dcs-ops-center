import { test } from "@playwright/test";

const PAGES = [
  ["/", "home"],
  ["/work", "work"],
  ["/incidents", "incidents"],
  ["/changes", "changes"],
  ["/services", "services"],
  ["/ops-readiness", "ops-readiness"],
  ["/scheduling", "scheduling"],
  ["/leave", "leave"],
  ["/staff", "staff-directory"],
  ["/appraisals", "appraisals"],
  ["/contracts", "contracts"],
  ["/compliance", "compliance"],
  ["/analytics", "analytics"],
  ["/reports", "reports"],
  ["/import", "import"],
  ["/policy", "policy"],
  ["/procurement", "procurement"],
  ["/audit", "audit"],
  ["/noc-performance", "noc-performance"],
  ["/training", "training"],
  ["/work/workload", "workload"],
  ["/cycles", "cycles"],
  // Phase 17 — changed / consolidated pages
  ["/attendance", "attendance-logs"],
  ["/attendance/roll-call", "attendance-roll-call"],
  ["/attendance/tosd", "attendance-tosd"],
  ["/attendance/timesheet-documents", "attendance-timesheet-documents"],
  ["/lateness", "lateness"],
  ["/scheduling/noc-shifts", "scheduling-noc-shifts"],
];

for (const [path, name] of PAGES) {
  test(`screenshot: ${name}`, async ({ page }) => {
    await page.goto(path, { waitUntil: "networkidle" });
    await page.waitForTimeout(500);
    await page.screenshot({
      path: `tests/screenshots/${name}.png`,
      fullPage: false,
    });
  });
}
