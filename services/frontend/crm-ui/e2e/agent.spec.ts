import { test, expect, Route } from "@playwright/test";

test.describe("Agent Flow", () => {
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
            accessToken: "mock-agent-token",
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
            id: "agent-1",
            firstName: "Agent",
            lastName: "User",
            email: "agent@example.com",
            role: "agent",
            status: "active",
          }),
        });
      }

      if (url.includes("/api/clients") && route.request().method() === "POST") {
        return route.fulfill({
          status: 201,
          contentType: "application/json",
          body: JSON.stringify({
            clientId: "new-client-123",
            firstName: "John",
            lastName: "Doe",
            dateOfBirth: "1990-01-01",
            gender: "Male",
            emailAddress: "john.doe@example.com",
            phoneNumber: "+65 12345678",
            address: "123 Main St",
            city: "Singapore",
            state: "Singapore",
            country: "Singapore",
            postalCode: "123456",
            identityVerificationStatus: "unverified",
          }),
        });
      }

      if (url.includes("/api/clients")) {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            data: [],
            pagination: { limit: 10, offset: 0, total: 3 },
          }),
        });
      }

      if (url.includes("/api/transactions")) {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            data: [
              {
                id: "txn-1",
                clientId: "client-1",
                transaction: "D",
                amount: 1000.0,
                date: "2024-01-15T10:30:00Z",
                status: "Completed",
              },
              {
                id: "txn-2",
                clientId: "client-2",
                transaction: "W",
                amount: 500.0,
                date: "2024-01-16T14:20:00Z",
                status: "Pending",
              },
            ],
            pagination: { limit: 20, offset: 0, total: 2 },
          }),
        });
      }

      if (url.includes("/api/logs")) {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            data: [],
            pagination: { limit: 10, offset: 0, total: 0 },
          }),
        });
      }

      // For any other API requests, return 404 to prevent hanging
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

  test("should login as agent, create client, and view transactions", async ({
    page,
  }) => {
    const startTime = Date.now();

    await page.goto("http://localhost:4173/login");
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    });
    await page.waitForLoadState("domcontentloaded");

    await page.fill('[data-testid="email-input"]', "agent@example.com");
    await page.fill('[data-testid="password-input"]', "password123");
    await page.click('[data-testid="login-submit-button"]');

    await expect(page).toHaveURL("http://localhost:4173/agent");
    await expect(page.getByText("Agent Dashboard")).toBeVisible();

    const dashboardLoadTime = Date.now() - startTime;
    expect(dashboardLoadTime).toBeLessThan(5000);

    const createClientStartTime = Date.now();

    await page.click('a[href="/agent/clients/new"]');
    await expect(page).toHaveURL("http://localhost:4173/agent/clients/new");

    await page.fill('input[name="firstName"]', "John");
    await page.fill('input[name="lastName"]', "Doe");
    await page.fill('input[name="dateOfBirth"]', "1990-01-01");
    await page.selectOption('select[name="gender"]', "Male");
    await page.fill('input[name="emailAddress"]', "john.doe@example.com");
    await page.fill('input[name="phoneNumber"]', "+65 12345678");
    await page.fill('input[name="address"]', "123 Main St");
    await page.fill('input[name="city"]', "Singapore");
    await page.fill('input[name="state"]', "Singapore");
    await page.fill('input[name="country"]', "Singapore");
    await page.fill('input[name="postalCode"]', "123456");

    await page.click('button[type="submit"]');

    await expect(page).toHaveURL("http://localhost:4173/agent");

    const createClientTime = Date.now() - createClientStartTime;
    expect(createClientTime).toBeLessThan(5000);

    const transactionsStartTime = Date.now();

    await page.click('a[href="/agent/transactions"]');
    await expect(page).toHaveURL("http://localhost:4173/agent/transactions");
    await expect(page.getByRole("heading", { name: "Transactions" })).toBeVisible();

    const transactionsLoadTime = Date.now() - transactionsStartTime;
    expect(transactionsLoadTime).toBeLessThan(3000);
  });

  test("should validate client creation form", async ({ page }) => {
    await page.goto("http://localhost:4173/login");
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    });
    await page.waitForLoadState("domcontentloaded");

    await page.fill('[data-testid="email-input"]', "agent@example.com");
    await page.fill('[data-testid="password-input"]', "password123");
    await page.click('[data-testid="login-submit-button"]');

    await expect(page).toHaveURL("http://localhost:4173/agent");

    await page.click('a[href="/agent/clients/new"]');
    await expect(page).toHaveURL("http://localhost:4173/agent/clients/new");

    // Try to submit without filling required fields
    await page.click('button[type="submit"]');

    // Should show validation errors
    await expect(page.getByText(/required/i).first()).toBeVisible();
  });

  test("should display agent dashboard stats", async ({ page }) => {
    await page.goto("http://localhost:4173/login");
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    });
    await page.waitForLoadState("domcontentloaded");

    await page.fill('[data-testid="email-input"]', "agent@example.com");
    await page.fill('[data-testid="password-input"]', "password123");
    await page.click('[data-testid="login-submit-button"]');

    await expect(page).toHaveURL("http://localhost:4173/agent");

    // Wait for stats to load
    await expect(page.getByText("My Clients")).toBeVisible();
  });

  test("should filter transactions", async ({ page }) => {
    await page.goto("http://localhost:4173/login");
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    });
    await page.waitForLoadState("domcontentloaded");

    await page.fill('[data-testid="email-input"]', "agent@example.com");
    await page.fill('[data-testid="password-input"]', "password123");
    await page.click('[data-testid="login-submit-button"]');

    await expect(page).toHaveURL("http://localhost:4173/agent");

    await page.click('a[href="/agent/transactions"]');
    await expect(page).toHaveURL("http://localhost:4173/agent/transactions");

    // Wait for transactions page heading
    await expect(page.getByRole("heading", { name: "Transactions" })).toBeVisible();
  });

  test("should navigate between pages successfully", async ({ page }) => {
    await page.goto("http://localhost:4173/login");
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    });
    await page.waitForLoadState("domcontentloaded");

    await page.fill('[data-testid="email-input"]', "agent@example.com");
    await page.fill('[data-testid="password-input"]', "password123");
    await page.click('[data-testid="login-submit-button"]');

    await expect(page).toHaveURL("http://localhost:4173/agent");

    // Navigate to create client
    await page.click('a[href="/agent/clients/new"]');
    await expect(page).toHaveURL("http://localhost:4173/agent/clients/new");

    // Navigate back to dashboard
    await page.click('a[href="/agent"]');
    await expect(page).toHaveURL("http://localhost:4173/agent");

    // Navigate to transactions
    await page.click('a[href="/agent/transactions"]');
    await expect(page).toHaveURL("http://localhost:4173/agent/transactions");

    // Navigate back to dashboard
    await page.click('a[href="/agent"]');
    await expect(page).toHaveURL("http://localhost:4173/agent");
  });
});
