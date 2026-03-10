import { test, expect } from "@playwright/test";
import { setupAdminRoutes } from "./helpers/mockRoutes";

test("inline admin login test", async ({ page }) => {
  await setupAdminRoutes(page);

  // Guard against occasional first-navigation network jitter in local runs.
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      await page.goto("/login", { waitUntil: "domcontentloaded" });
      break;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const isNetworkChanged = message.includes("ERR_NETWORK_CHANGED");
      const isLastAttempt = attempt === 1;

      if (!isNetworkChanged || isLastAttempt) {
        throw error;
      }
    }
  }

  await page.fill('input[type="email"]', "admin@example.com");
  await page.fill('input[type="password"]', "password123");
  await page.click('button[type="submit"]');

  await expect(page).toHaveURL("/admin");
  await expect(page.getByText("Admin Dashboard")).toBeVisible();
});
