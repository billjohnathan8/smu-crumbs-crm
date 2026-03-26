import { test, expect, type Page } from "@playwright/test";
import { gotoWithNetworkRetry, setAuthState } from "../helpers/auth";

const adminUser = {
  id: "admin-1",
  firstName: "Admin",
  lastName: "User",
  email: "admin@example.com",
  role: "admin",
  status: "active",
};

const normalUser = {
  id: "user-1",
  firstName: "User",
  lastName: "User",
  email: "user@example.com",
  role: "user",
  status: "active",
};

async function setupRoleApiMocks(page: Page, role: "admin" | "user") {
  const currentUser = role === "admin" ? adminUser : normalUser;

  await page.route("**/api/**", async route => {
    const method = route.request().method();
    const path = new URL(route.request().url()).pathname;

    if (path === "/api/users/me") {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(currentUser),
      });
    }

    if (path === "/api/users" && method === "GET") {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: [
            {
              id: "usr_001",
              firstName: "Agent",
              lastName: "One",
              email: "agent.one@example.com",
              role: "user",
              status: "active",
            },
          ],
          pagination: { limit: 10, offset: 0, total: 1 },
        }),
      });
    }

    if (path === "/api/clients" && method === "GET") {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: [],
          pagination: { limit: 20, offset: 0, total: 0 },
        }),
      });
    }

    if (path === "/api/transactions" && method === "GET") {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: [],
          pagination: { limit: 20, offset: 0, total: 0 },
        }),
      });
    }

    if (path === "/api/logs" && method === "GET") {
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
        message: `No mock configured for ${method} ${path}`,
      }),
    });
  });
}

test.describe("Protected Routes (Mocked)", () => {
  test.beforeEach(async ({ page, context }) => {
    await context.clearCookies();
    await gotoWithNetworkRetry(page, "/login");
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    });
  });

  test("redirects unauthenticated user from /admin to /login", async ({ page }) => {
    await gotoWithNetworkRetry(page, "/admin");
    await expect(page).toHaveURL(/\/login$/);
  });

  test("redirects unauthenticated user from /user/clients/new to /login", async ({
    page,
  }) => {
    await gotoWithNetworkRetry(page, "/user/clients/new");
    await expect(page).toHaveURL(/\/login$/);
  });

  test("shows Access Denied when admin visits /user route", async ({ page }) => {
    await setupRoleApiMocks(page, "admin");
    await gotoWithNetworkRetry(page, "/login");
    await setAuthState(page, "admin");

    await gotoWithNetworkRetry(page, "/user");
    await expect(page.getByText("Access Denied")).toBeVisible();
    await expect(page.getByText("You don't have permission to access this page.")).toBeVisible();
  });

  test("shows Access Denied when user visits /admin/users", async ({ page }) => {
    await setupRoleApiMocks(page, "user");
    await gotoWithNetworkRetry(page, "/login");
    await setAuthState(page, "user");

    await gotoWithNetworkRetry(page, "/admin/users");
    await expect(page.getByText("Access Denied")).toBeVisible();
  });

  test("allows admin to access /admin/users and /admin/users/new", async ({ page }) => {
    await setupRoleApiMocks(page, "admin");
    await gotoWithNetworkRetry(page, "/login");
    await setAuthState(page, "admin");

    await gotoWithNetworkRetry(page, "/admin/users");
    await expect(page.getByRole("heading", { name: "User Management" })).toBeVisible();

    await page.getByTestId("create-new-user-button").click();
    await expect(page).toHaveURL(/\/admin\/users\/new$/);
    await expect(page.getByRole("heading", { name: "Create New User" })).toBeVisible();
  });

  test("redirects /admin/accounts to /admin/users for admin", async ({ page }) => {
    await setupRoleApiMocks(page, "admin");
    await gotoWithNetworkRetry(page, "/login");
    await setAuthState(page, "admin");

    await gotoWithNetworkRetry(page, "/admin/accounts");
    await expect(page).toHaveURL(/\/admin\/users$/);
  });

  test("allows user to access /user/transactions", async ({ page }) => {
    await setupRoleApiMocks(page, "user");
    await gotoWithNetworkRetry(page, "/login");
    await setAuthState(page, "user");

    await gotoWithNetworkRetry(page, "/user/transactions");
    await expect(page.getByRole("heading", { name: "Transactions" })).toBeVisible();
    await expect(page.getByText("Access Denied")).not.toBeVisible();
  });

  test("allows admin to access /admin/settings and navigate to /reset-password", async ({
    page,
  }) => {
    await setupRoleApiMocks(page, "admin");
    await gotoWithNetworkRetry(page, "/login");
    await setAuthState(page, "admin");

    await gotoWithNetworkRetry(page, "/admin/settings");
    await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
    await page.getByRole("button", { name: "Reset Password" }).click();
    await expect(page).toHaveURL(/\/reset-password$/);
  });
});
