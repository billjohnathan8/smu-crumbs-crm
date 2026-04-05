import { test, expect } from "@playwright/test";
import { gotoWithNetworkRetry } from "./helpers/auth";
import { setupAdminRoutes } from "./helpers/mockRoutes";

test("inline admin login test", async ({ page }) => {
  await setupAdminRoutes(page);
  await gotoWithNetworkRetry(page, "/login");

  await page.fill('input[type="email"]', "admin@example.com");
  await page.fill('input[type="password"]', "password123");
  await page.click('button[type="submit"]');

  await expect(page).toHaveURL("/admin/users");
  await expect(page.getByRole("heading", { name: "User Management" })).toBeVisible();
});
