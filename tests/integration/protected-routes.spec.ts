/**
 * Protected Route Access Integration Tests
 * 
 * Moved from e2e/auth/protected-routes.spec.ts due to proxy errors.
 * Tests navigation to protected routes that auto-load data.
 * 
 * Run with: npm run e2e:integration:real
 */

import { test, expect, type Page } from "@playwright/test";

async function setAuthState(page: Page, role: "admin" | "user"): Promise<void> {
  const mockUser = {
    id: `${role}-1`,
    firstName: role === "admin" ? "Admin" : "User",
    lastName: "User",
    email: `${role}@example.com`,
    role,
    status: "active",
  };

  await page.evaluate((user) => {
    localStorage.setItem("authToken", `mock-token-${user.role}`);
    localStorage.setItem("currentUser", JSON.stringify(user));
  }, mockUser);

  await page.route("**/api/**", async (route) => {
    const url = route.request().url();

    if (url.includes("/api/users/me")) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(mockUser),
      });
    }

    if (url.includes("/api/users") && route.request().method() === "GET") {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: [],
          pagination: { limit: 10, offset: 0, total: 0 },
        }),
      });
    }

    if (url.includes("/api/clients")) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: [],
          pagination: { limit: 10, offset: 0, total: 0 },
        }),
      });
    }

    if (url.includes("/api/transactions")) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: [],
          pagination: { limit: 20, offset: 0, total: 0 },
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

    return route.fulfill({
      status: 404,
      contentType: "application/json",
      body: JSON.stringify({
        error: "not_found",
        message: "Endpoint not mocked",
      }),
    });
  });
}

test.describe("Protected Route Access (Integration)", () => {
  test.beforeEach(async ({ page, context }) => {
    // Clear cookies and storage for clean state
    await context.clearCookies();
    await page.goto("/");
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    });
  });

  test("should redirect unauthenticated user to login when accessing /admin", async ({
    page,
  }) => {
    await test.step("Navigate to /admin without authentication", async () => {
      await page.goto("/admin");
    });

    await test.step("Verify redirect to /login", async () => {
      await expect(page).toHaveURL(/\/login$/, { timeout: 5000 });
    });
  });

  test("should redirect unauthenticated user to login when accessing /user", async ({
    page,
  }) => {
    await test.step("Navigate to /user without authentication", async () => {
      await page.goto("/user");
    });

    await test.step("Verify redirect to /login", async () => {
      await expect(page).toHaveURL(/\/login$/, { timeout: 5000 });
    });
  });

  test("should redirect unauthenticated user to login when accessing /admin/accounts", async ({
    page,
  }) => {
    await test.step("Navigate to /admin/accounts without authentication", async () => {
      await page.goto("/admin/accounts");
    });

    await test.step("Verify redirect to /login", async () => {
      await expect(page).toHaveURL(/\/login$/, { timeout: 5000 });
    });
  });

  test("should redirect unauthenticated user to login when accessing /user/clients/new", async ({
    page,
  }) => {
    await test.step("Navigate to /user/clients/new without authentication", async () => {
      await page.goto("/user/clients/new");
    });

    await test.step("Verify redirect to /login", async () => {
      await expect(page).toHaveURL(/\/login$/, { timeout: 5000 });
    });
  });

  test("should show Access Denied when admin tries to access user routes", async ({
    page,
  }) => {
    await test.step("Set up admin authentication", async () => {
      await page.goto("/login");
      await setAuthState(page, "admin");
    });

    await test.step("Navigate to /user (user-only route)", async () => {
      await page.goto("/user");
      await page.waitForLoadState("domcontentloaded");
    });

    await test.step("Verify Access Denied message is shown", async () => {
      await expect(page.getByText("Access Denied")).toBeVisible({
        timeout: 5000,
      });
      await expect(
        page.getByText("You don't have permission to access this page."),
      ).toBeVisible();
    });

    await test.step("Verify Go Back button is present", async () => {
      await expect(
        page.getByRole("button", { name: /go back/i }),
      ).toBeVisible();
    });
  });

  test("should show Access Denied when admin tries to access /user/clients/new", async ({
    page,
  }) => {
    await test.step("Set up admin authentication", async () => {
      await page.goto("/login");
      await setAuthState(page, "admin");
    });

    await test.step("Navigate to /user/clients/new (user-only route)", async () => {
      await page.goto("/user/clients/new");
      await page.waitForLoadState("domcontentloaded");
    });

    await test.step("Verify Access Denied message is shown", async () => {
      await expect(page.getByText("Access Denied")).toBeVisible({
        timeout: 5000,
      });
    });
  });

  test("should show Access Denied when user tries to access admin routes", async ({
    page,
  }) => {
    await test.step("Set up user authentication", async () => {
      await page.goto("/login");
      await setAuthState(page, "user");
    });

    await test.step("Navigate to /admin (admin-only route)", async () => {
      await page.goto("/admin");
      await page.waitForLoadState("domcontentloaded");
    });

    await test.step("Verify Access Denied message is shown", async () => {
      await expect(page.getByText("Access Denied")).toBeVisible({
        timeout: 5000,
      });
      await expect(
        page.getByText("You don't have permission to access this page."),
      ).toBeVisible();
    });
  });

  test("should show Access Denied when user tries to access /admin/accounts", async ({
    page,
  }) => {
    await test.step("Set up user authentication", async () => {
      await page.goto("/login");
      await setAuthState(page, "user");
    });

    await test.step("Navigate to /admin/accounts (admin-only route)", async () => {
      await page.goto("/admin/accounts");
      await page.waitForLoadState("domcontentloaded");
    });

    await test.step("Verify Access Denied message is shown", async () => {
      await expect(page.getByText("Access Denied")).toBeVisible({
        timeout: 5000,
      });
    });
  });

  test("should allow admin to access admin routes", async ({ page }) => {
    await test.step("Set up admin authentication", async () => {
      await page.goto("/login");
      await setAuthState(page, "admin");
    });

    await test.step("Navigate to /admin", async () => {
      await page.goto("/admin");
      await page.waitForLoadState("domcontentloaded");
    });

    await test.step("Verify admin dashboard is shown", async () => {
      await expect(page.getByText("Admin Dashboard")).toBeVisible({
        timeout: 5000,
      });
      // Should NOT see Access Denied
      await expect(page.getByText("Access Denied")).not.toBeVisible();
    });
  });

  test("should allow user to access user routes", async ({ page }) => {
    await test.step("Set up user authentication", async () => {
      await page.goto("/login");
      await setAuthState(page, "user");
    });

    await test.step("Navigate to /user", async () => {
      await page.goto("/user");
      await page.waitForLoadState("domcontentloaded");
    });

    await test.step("Verify user dashboard is shown", async () => {
      await expect(page.getByText("User Dashboard")).toBeVisible({
        timeout: 5000,
      });
      // Should NOT see Access Denied
      await expect(page.getByText("Access Denied")).not.toBeVisible();
    });
  });
});
