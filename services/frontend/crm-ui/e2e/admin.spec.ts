import { test, expect, Route } from "@playwright/test";

test.describe("Admin Flow", () => {
  // Set up routes and clear state before each test
  test.beforeEach(async ({ page, context }) => {
    // Clear all cookies and storage state
    await context.clearCookies();

    // Log console messages for debugging
    page.on("console", (msg) => console.warn("Browser console:", msg.text()));
    page.on("pageerror", (err) => console.error("Browser error:", err.message));

    // Set up API route mocking - only intercept actual API calls to backend
    await page.route("**/api/**", (route: Route) => {
      const url = route.request().url();

      // Don't intercept Vite's internal requests
      if (
        url.includes("/@vite") ||
        url.includes("/@fs") ||
        url.includes("/@id") ||
        url.includes(".js") ||
        url.includes(".ts") ||
        url.includes(".jsx") ||
        url.includes(".tsx") ||
        url.includes(".css")
      ) {
        return route.continue();
      }

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

      if (url.includes("/api/agents") && route.request().method() === "GET") {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            data: [
              {
                id: "agent-1",
                firstName: "Agent",
                lastName: "One",
                email: "agent1@example.com",
                role: "agent",
                status: "active",
              },
              {
                id: "agent-2",
                firstName: "Agent",
                lastName: "Two",
                email: "agent2@example.com",
                role: "agent",
                status: "active",
              },
            ],
            pagination: {
              limit: 10,
              offset: 0,
              total: 2,
            },
          }),
        });
      }

      if (url.includes("/api/clients")) {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            data: [],
            pagination: { limit: 10, offset: 0, total: 5 },
          }),
        });
      }

      if (url.includes("/api/logs")) {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            data: [
              {
                logId: "log-1",
                action: "CREATE",
                attributeName: "client",
                agentId: "agent-1",
                clientId: "client-1",
                dateTime: "2024-01-15T10:30:00Z",
              },
            ],
            pagination: { limit: 10, offset: 0, total: 10 },
          }),
        });
      }

      // For any other API requests, return 404 to prevent hanging
      // This prevents the test from trying to reach the real backend
      return route.fulfill({
        status: 404,
        contentType: "application/json",
        body: JSON.stringify({
          error: "not_found",
          message: "Endpoint not mocked in test",
        }),
      });
    });
  });

  test("should login as admin and navigate to manage accounts page", async ({
    page,
  }) => {
    const startTime = Date.now();

    await page.goto("http://localhost:4173/login");

    // Clear storage after navigation to ensure clean state
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    });

    // Wait for the page to be fully loaded
    await page.waitForLoadState("domcontentloaded");

    await page.fill('[data-testid="email-input"]', "admin@example.com");
    await page.fill('[data-testid="password-input"]', "password123");
    await page.click('[data-testid="login-submit-button"]');

    await expect(page).toHaveURL("http://localhost:4173/admin");
    await expect(page.getByText("Admin Dashboard")).toBeVisible();

    const dashboardLoadTime = Date.now() - startTime;
    expect(dashboardLoadTime).toBeLessThan(5000);

    const accountsStartTime = Date.now();

    await page.click('a[href="/admin/accounts"]');

    await expect(page).toHaveURL("http://localhost:4173/admin/accounts");
    await expect(page.getByRole("main").getByRole("link", { name: "Manage Accounts" })).toBeVisible();

    const accountsLoadTime = Date.now() - accountsStartTime;
    expect(accountsLoadTime).toBeLessThan(3000);
  });

  test("should display stats on admin dashboard", async ({ page }) => {
    await page.goto("http://localhost:4173/login");
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    });
    await page.waitForLoadState("domcontentloaded");

    await page.fill('[data-testid="email-input"]', "admin@example.com");
    await page.fill('[data-testid="password-input"]', "password123");
    await page.click('[data-testid="login-submit-button"]');

    await expect(page).toHaveURL("http://localhost:4173/admin");

    // Wait for stats to load
    await expect(page.getByText("Total Agents")).toBeVisible();
    await expect(page.getByText("Total Clients")).toBeVisible();
    await expect(page.getByText("Recent Activity")).toBeVisible();
  });

  test("should navigate back to dashboard from manage accounts", async ({
    page,
  }) => {
    await page.goto("http://localhost:4173/login");
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    });
    await page.waitForLoadState("domcontentloaded");

    await page.fill('[data-testid="email-input"]', "admin@example.com");
    await page.fill('[data-testid="password-input"]', "password123");
    await page.click('[data-testid="login-submit-button"]');

    await expect(page).toHaveURL("http://localhost:4173/admin");

    await page.click('a[href="/admin/accounts"]');
    await expect(page).toHaveURL("http://localhost:4173/admin/accounts");

    // Click back to dashboard
    await page.click('a[href="/admin"]');
    await expect(page).toHaveURL("http://localhost:4173/admin");
    await expect(page.getByText("Admin Dashboard")).toBeVisible();
  });

  test("should logout successfully", async ({ page }) => {
    await page.goto("http://localhost:4173/login");
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    });
    await page.waitForLoadState("domcontentloaded");

    await page.fill('[data-testid="email-input"]', "admin@example.com");
    await page.fill('[data-testid="password-input"]', "password123");
    await page.click('[data-testid="login-submit-button"]');

    await expect(page).toHaveURL("http://localhost:4173/admin");

    // Click logout button
    await page.click('button:has-text("Logout")');

    await expect(page).toHaveURL("http://localhost:4173/login");
  });
});
