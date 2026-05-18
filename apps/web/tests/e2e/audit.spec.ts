/**
 * Deep audit spec — drives real Chrome over every route and reports:
 *  - console errors
 *  - uncaught page errors
 *  - failed network requests (HTTP >= 400, incl. oRPC /rpc calls)
 * Unlike smoke.spec.ts this does NOT fail the run; it prints a consolidated
 * report so we can triage + fix. Run: bunx playwright test audit.spec.ts
 */
import { test, type Page } from "@playwright/test";

const ROUTES: readonly string[] = [
  "/",
  "/ops-readiness",
  "/notifications",
  "/profile",
  "/work",
  "/work/workload",
  "/incidents",
  "/changes",
  "/services",
  "/scheduling",
  "/scheduling/dcs-oncall",
  "/scheduling/noc-shifts",
  "/scheduling/maintenance",
  "/attendance",
  "/attendance/roll-call",
  "/attendance/tosd",
  "/lateness",
  "/attendance/timesheet-documents",
  "/staff",
  "/leave",
  "/leave/calendar",
  "/career-progression",
  "/contracts",
  "/compliance",
  "/compliance/ppe",
  "/compliance/items",
  "/compliance/training",
  "/appraisals",
  "/appraisals/inbox",
  "/cycles",
  "/noc-performance",
  "/training",
  "/training/plan",
  "/training/exams",
  "/training/vouchers",
  "/training/events",
  "/training/in-house",
  "/training/catalog",
  "/access",
  "/access/registry",
  "/access/platforms",
  "/procurement",
  "/policy",
  "/analytics",
  "/reports",
  "/audit",
  "/settings",
  "/settings/general",
  "/settings/departments",
  "/settings/roles",
  "/settings/leave-types",
  "/settings/automation",
  "/settings/escalation",
  "/import",
] as const;

type Finding = {
  route: string;
  consoleErrors: string[];
  pageErrors: string[];
  failedRequests: string[];
};

function ignore(text: string): boolean {
  return (
    text.includes("favicon") ||
    text.includes("Download the React DevTools") ||
    text.includes("[vite]")
  );
}

test.describe("Deep audit — all routes", () => {
  test.use({ storageState: "tests/.auth/user.json" });

  const findings: Finding[] = [];

  for (const route of ROUTES) {
    test(`audit ${route}`, async ({ page }: { page: Page }) => {
      const consoleErrors: string[] = [];
      const pageErrors: string[] = [];
      const failedRequests: string[] = [];

      page.on("console", (msg) => {
        if (msg.type() === "error" && !ignore(msg.text())) {
          consoleErrors.push(msg.text());
        }
      });
      page.on("pageerror", (err) => {
        if (!ignore(err.message)) pageErrors.push(err.message);
      });
      page.on("response", (res) => {
        const status = res.status();
        if (status >= 400) {
          failedRequests.push(`${status} ${res.request().method()} ${res.url()}`);
        }
      });

      try {
        await page.goto(route, { waitUntil: "networkidle", timeout: 25_000 });
      } catch (e) {
        pageErrors.push(`navigation: ${(e as Error).message}`);
      }
      await page.waitForTimeout(1_200);

      findings.push({ route, consoleErrors, pageErrors, failedRequests });
    });
  }

  test.afterAll(() => {
    const bad = findings.filter(
      (f) => f.consoleErrors.length || f.pageErrors.length || f.failedRequests.length,
    );
    console.log("\n========== AUDIT REPORT ==========");
    console.log(`Routes scanned: ${findings.length} | Routes with issues: ${bad.length}`);
    for (const f of bad) {
      console.log(`\n### ${f.route}`);
      for (const e of f.pageErrors) console.log(`  [PAGE ERROR] ${e}`);
      for (const e of f.consoleErrors) console.log(`  [CONSOLE]    ${e}`);
      for (const e of f.failedRequests) console.log(`  [HTTP]       ${e}`);
    }
    if (!bad.length) console.log("\n✅ No issues found on any route.");
    console.log("\n==================================\n");
  });
});
