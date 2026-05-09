/**
 * Smoke tests — visit every page, assert no unhandled JS errors.
 * This mirrors the audit-errors.ts script but runs as a proper test suite.
 */
import { test, expect } from "@playwright/test";

const PAGES = [
  // Core
  { path: "/", name: "Dashboard" },
  { path: "/ops-readiness", name: "Ops Readiness" },
  { path: "/profile", name: "My Profile" },
  // Work
  { path: "/work", name: "Work Register" },
  { path: "/work/workload", name: "Workload" },
  // Incidents & Changes
  { path: "/incidents", name: "Incidents" },
  { path: "/changes", name: "Changes" },
  // Scheduling (Phase 3)
  { path: "/scheduling/noc-shifts", name: "NOC Shifts" },
  { path: "/scheduling/dcs-oncall", name: "DCS On-Call" },
  // Leave (Phase 2)
  { path: "/leave", name: "Leave" },
  { path: "/leave/tosd", name: "TOSD Register" },
  // Procurement
  { path: "/procurement", name: "Procurement" },
  // Staff & HR
  { path: "/staff", name: "Staff" },
  { path: "/contracts", name: "Contracts" },
  // Appraisals (Phase 4)
  { path: "/appraisals", name: "Appraisals" },
  // NOC Performance (Phase 5)
  { path: "/noc-performance", name: "NOC Performance" },
  // Training (Phase 7)
  { path: "/training", name: "Training" },
  // PPE & Lateness (Phase 8)
  { path: "/compliance/ppe", name: "PPE Matrix" },
  { path: "/lateness", name: "Lateness Register" },
  { path: "/timesheets", name: "Timesheets" },
  // Access & Services
  { path: "/services", name: "Services" },
  { path: "/access", name: "Access" },
  // Compliance
  { path: "/compliance/training", name: "Compliance Training" },
  { path: "/compliance/items", name: "Compliance Items" },
  // Reports & Audit
  { path: "/reports", name: "Reports" },
  { path: "/audit", name: "Audit Log" },
  // Import (Phase 12)
  { path: "/import", name: "Import" },
  // Notifications & Policy
  { path: "/notifications", name: "Notifications" },
  { path: "/policy", name: "Policy" },
  // Settings
  { path: "/settings/general", name: "Settings General" },
  { path: "/settings/departments", name: "Settings Departments" },
  { path: "/settings/leave-types", name: "Settings Leave Types" },
  { path: "/settings/roles", name: "Settings Roles" },
];

for (const { path, name } of PAGES) {
  test(`${name} (${path}) loads without JS errors`, async ({ page }) => {
    const errors: { type: string; text: string }[] = [];

    page.on("console", (msg) => {
      if (msg.type() === "error") {
        errors.push({ type: "console.error", text: msg.text() });
      }
    });
    page.on("pageerror", (err) => {
      errors.push({ type: "pageerror", text: err.message });
    });

    await page.goto(path);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(600);

    // Filter out known non-critical browser noise
    const critical = errors.filter(
      (e) =>
        !e.text.includes("favicon") &&
        !e.text.includes("net::ERR_ABORTED") &&
        !e.text.includes("Failed to load resource"),
    );

    if (critical.length > 0) {
      const report = critical.map((e) => `[${e.type}] ${e.text}`).join("\n");
      expect.soft(critical, `${name} had JS errors:\n${report}`).toHaveLength(0);
    }
  });
}
