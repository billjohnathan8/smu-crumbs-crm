import { test, expect } from "@playwright/test";

test("simple admin login test", async ({ page }) => {
  // Set up route mocking
  await page.route("**/api/**", (route) => {
    const url = route.request().url();

    if (url.includes("/api/auth/login")) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          accessToken: "mock-admin-token",
          refreshToken: "mock-refresh-token",
          expiresIn: 3600,
          tokenType: "Bearer",
        }),
      });
    }

    if (url.includes("/api/agents/me")) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          id: "admin-1",
          firstName: "Admin",
          lastName: "User",
          email: "admin@example.com",
          role: "admin",
          status: "active",
        }),
      });
    }

    route.continue();
  });

  // Navigate to login page
  await page.goto("/login");

  // Fill in the form
  await page.fill('input[type="email"]', "admin@example.com");
  await page.fill('input[type="password"]', "password123");
  await page.click('button[type="submit"]');

  // Check we're on the admin page
  await expect(page).toHaveURL("/admin");
});
