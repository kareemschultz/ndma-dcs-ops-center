import path from "node:path";
import { fileURLToPath } from "node:url";

import { expect, test } from "@playwright/test";

const authDir = path.join(path.dirname(fileURLToPath(import.meta.url)), ".auth");

test.describe("Staff", () => {
  test.use({ storageState: path.join(authDir, "staff.json") });

  test("can update self-service contact details", async ({ page }) => {
    await page.goto("/profile");
    await expect(page.getByRole("heading", { name: "My Profile" })).toBeVisible();

    const contactForm = page.locator("form").nth(1);
    await contactForm.locator("input").nth(0).fill("+592 555-1000");
    await contactForm.locator("input").nth(1).fill("Emergency Contact One");
    await contactForm.locator("input").nth(2).fill("+592 555-2000");
    await contactForm.locator("select").selectOption("Sibling");
    await page.getByRole("button", { name: "Save Contact Details" }).click();

    await expect(page.getByText("Contact details updated successfully")).toBeVisible();
  });
});

test.describe("Team Lead", () => {
  test.use({ storageState: path.join(authDir, "team-lead.json") });

  test("can submit a draft appraisal", async ({ page }) => {
    await page.goto("/appraisals");
    await page.getByRole("tab", { name: "Approval Pipeline" }).click();
    await page.waitForTimeout(1000);
    const draftCard = page
      .locator("div.rounded-xl.border")
      .filter({ hasText: "Kareem Schultz" })
      .filter({ hasText: "Draft" })
      .first();
    await expect(draftCard).toBeVisible();
    await draftCard.getByRole("button", { name: /Submit for Approval/i }).click();
    await expect(
      page
        .locator("div.rounded-xl.border")
        .filter({ hasText: "Kareem Schultz" })
        .filter({ hasText: "Pending_Approval" }),
    ).toBeVisible();
  });
});

test.describe("Manager", () => {
  test.use({ storageState: path.join(authDir, "manager.json") });

  test("can approve a pending appraisal", async ({ page }) => {
    await page.goto("/appraisals");
    await page.getByRole("tab", { name: "Approval Pipeline" }).click();
    await page.waitForTimeout(1000);
    const pendingCard = page
      .locator("div.rounded-xl.border")
      .filter({ hasText: "Shemar Henry" })
      .filter({ hasText: "Pending_Approval" })
      .first();
    await expect(pendingCard).toBeVisible();
    await pendingCard.getByRole("button", { name: /Approve/i }).click();
    await expect(
      page
        .locator("div.rounded-xl.border")
        .filter({ hasText: "Shemar Henry" })
        .filter({ hasText: "Approved_By_Manager" }),
    ).toBeVisible();
  });
});

test.describe("PA", () => {
  test.use({ storageState: path.join(authDir, "pa.json") });

  test("can process an approved appraisal", async ({ page }) => {
    await page.goto("/appraisals");
    await page.getByRole("tab", { name: "Approval Pipeline" }).click();
    await page.waitForTimeout(1000);
    const approvedCard = page
      .locator("div.rounded-xl.border")
      .filter({ hasText: "Richie Goring" })
      .filter({ hasText: "Approved_By_Manager" })
      .first();
    await expect(approvedCard).toBeVisible();
    await approvedCard.getByRole("button", { name: /Export & Send to HR/i }).click();
    await expect(
      page
        .locator("div.rounded-xl.border")
        .filter({ hasText: "Richie Goring" })
        .filter({ hasText: "Processed_By_PA" }),
    ).toBeVisible();
  });
});

test.describe("Admin", () => {
  test.use({ storageState: path.join(authDir, "admin.json") });

  test("can create a work item", async ({ page }) => {
    await page.goto("/work/new");
    await page.locator("#title").fill("E2E work item");
    await page.locator("#description").fill("Created by Playwright during role-based smoke tests.");
    await page.locator("#type").selectOption("project");
    await page.locator("#priority").selectOption("high");
    await page.locator("#assignedToId").selectOption("sp-kareem");
    await page.locator("#departmentId").selectOption("dept-asn");
    await page.locator("#dueDate").fill("2026-05-10");
    await page.getByRole("button", { name: "Create Work Item" }).click();
    await expect(page).toHaveURL(/\/work\/.+/);
    await expect(page.getByRole("heading", { name: "E2E work item" })).toBeVisible();
  });
});
