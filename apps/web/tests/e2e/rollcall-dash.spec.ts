/**
 * Verifies the roll-call "dash" (Not Marked / clear) action:
 *  - legend shows a "Not Marked" entry
 *  - marking then clearing a staff member round-trips back to "—"
 */
import { test, expect } from "@playwright/test";

test.describe("Roll-call dash / clear", () => {
  test.use({ storageState: "tests/.auth/user.json" });

  test("legend shows Not Marked + clear round-trips", async ({ page }) => {
    const errors: string[] = [];
    page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
    page.on("pageerror", (e) => errors.push(e.message));

    await page.goto("/attendance/roll-call", { waitUntil: "networkidle" });

    // Legend includes the new "Not Marked" entry.
    await expect(page.getByText("Not Marked").first()).toBeVisible();

    // First staff row: mark On Site (P), then clear with the dash button.
    const firstRow = page.locator("div.border-b").filter({ has: page.locator("button", { hasText: "P" }) }).first();
    await firstRow.locator('button[title="On Site"]').click();
    await page.waitForTimeout(900);

    const dash = firstRow.locator('button[title="Not marked (clear)"]');
    await dash.click();
    await page.waitForTimeout(900);

    // After clearing, the current-status pill column shows the "—" placeholder.
    await expect(firstRow.locator("span", { hasText: /^—$/ }).first()).toBeVisible();

    await page.screenshot({ path: "test-results/visual/roll-call.png", fullPage: true });
    expect(errors.filter((e) => !e.includes("favicon"))).toHaveLength(0);
  });
});
