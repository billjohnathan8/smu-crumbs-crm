import { test, expect } from "@playwright/test";
import { setupAdminRoutes } from "./helpers/mockRoutes";

test("simple admin login test", async ({ page }) => {
  await setupAdminRoutes(page);

  // Navigate to login page
  await page.goto("/login");

  // Fill in the form
  await page.fill('input[type="email"]', "admin@example.com");
  await page.fill('input[type="password"]', "password123");
  await page.click('button[type="submit"]');

  // Check we're on the admin page
  await expect(page).toHaveURL("/admin");
});
