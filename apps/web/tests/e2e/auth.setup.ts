/**
 * Auth setup fixture — signs in once and saves the session cookie so all
 * other tests can reuse it without hitting the login page on every spec.
 */
import { test as setup, expect } from "@playwright/test";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const STORAGE_STATE = path.join(__dirname, "../.auth/user.json");

setup("authenticate", async ({ page }) => {
  await page.goto("/login");
  await page.waitForLoadState("domcontentloaded");

  // Fill email (htmlFor="email", type="email")
  await page.fill('input[name="email"]', "admin@ndma.gov");
  await page.fill('input[name="password"]', "admin1234");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();

  // Wait for redirect to dashboard (unauthenticated redirects to /login, so
  // successful login ends up at /)
  await expect(page).toHaveURL("/", { timeout: 15_000 });

  await page.context().storageState({ path: STORAGE_STATE });
});
