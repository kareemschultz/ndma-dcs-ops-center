/**
 * Visual capture — full-page screenshots of key routes for visual review.
 * Saves PNGs to test-results/visual/. Not a pass/fail test.
 * Run: bunx playwright test visual-capture.spec.ts --project=chromium
 */
import { test } from "@playwright/test";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, "../../test-results/visual");

const PAGES: ReadonlyArray<readonly [string, string]> = [
  ["/", "dashboard"],
  ["/work", "work"],
  ["/incidents", "incidents"],
  ["/changes", "changes"],
  ["/scheduling", "scheduling"],
  ["/attendance", "attendance"],
  ["/attendance/roll-call", "roll-call"],
  ["/leave", "leave"],
  ["/staff", "staff"],
  ["/appraisals", "appraisals"],
  ["/training", "training"],
  ["/access", "access"],
  ["/procurement", "procurement"],
  ["/analytics", "analytics"],
  ["/timesheets", "timesheets"],
  ["/compliance", "compliance"],
  ["/settings", "settings"],
  ["/profile", "profile"],
];

test.describe("Visual capture", () => {
  test.use({ storageState: "tests/.auth/user.json" });

  for (const [route, name] of PAGES) {
    test(`capture ${name}`, async ({ page }) => {
      await page.goto(route, { waitUntil: "networkidle", timeout: 25_000 });
      await page.waitForTimeout(1_500);
      await page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: true });
    });
  }

  test("capture mobile dashboard", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/", { waitUntil: "networkidle", timeout: 25_000 });
    await page.waitForTimeout(1_500);
    await page.screenshot({ path: path.join(OUT, "mobile-dashboard.png"), fullPage: true });
  });

  test("capture mobile work", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/work", { waitUntil: "networkidle", timeout: 25_000 });
    await page.waitForTimeout(1_500);
    await page.screenshot({ path: path.join(OUT, "mobile-work.png"), fullPage: true });
  });
});
