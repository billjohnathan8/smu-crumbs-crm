import { test, expect, type Page } from "@playwright/test";
import { gotoWithNetworkRetry, setAuthState } from "../helpers/auth";

const rootAdminUser = {
  id: "usr_1",
  firstName: "Root",
  lastName: "Admin",
  email: "admin@crm.com",
  role: "admin",
  status: "active",
};

async function setRootAdminAuthState(page: Page) {
  await page.addInitScript(({ user, token }) => {
    localStorage.setItem("authToken", token);
    localStorage.setItem("currentUser", JSON.stringify(user));
  }, { user: rootAdminUser, token: "mock-root-token" });

  await page.evaluate(({ user, token }) => {
    localStorage.setItem("authToken", token);
    localStorage.setItem("currentUser", JSON.stringify(user));
  }, { user: rootAdminUser, token: "mock-root-token" });
}

async function setupCoreRouteMocks(page: Page, userRole: "admin" | "user" | "root_admin") {
  const currentUser =
    userRole === "root_admin"
      ? rootAdminUser
      : {
          id: userRole === "admin" ? "admin-1" : "user-1",
          firstName: userRole === "admin" ? "Admin" : "Agent",
          lastName: "User",
          email: userRole === "admin" ? "admin@example.com" : "agent@example.com",
          role: userRole === "admin" ? "admin" : "user",
          status: "active",
        };

  await page.route("**/api/**", async route => {
    const method = route.request().method();
    const path = new URL(route.request().url()).pathname;

    if (path === "/api/users/me" && method === "GET") {
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
        body: JSON.stringify({ data: [], pagination: { limit: 10, offset: 0, total: 0 } }),
      });
    }

    if (path === "/api/clients" && method === "GET") {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: [
            {
              clientId: "clt_1",
              firstName: "Alice",
              lastName: "Tan",
              dateOfBirth: "1990-01-01",
              gender: "Female",
              emailAddress: "alice@example.com",
              phoneNumber: "+65 1111 2222",
              address: "1 Main St",
              city: "Singapore",
              state: "Singapore",
              country: "Singapore",
              postalCode: "123456",
              identityVerificationStatus: "verified",
              clientStatus: "active",
              assignedUserId: "user-1",
            },
          ],
          pagination: { limit: 20, offset: 0, total: 1 },
        }),
      });
    }

    if (path === "/api/clients/clt_1/transactions" && method === "GET") {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: [
            {
              id: "txn_1",
              clientId: "clt_1",
              transaction: "D",
              amount: 100,
              date: "2026-04-01T00:00:00Z",
              status: "Completed",
            },
          ],
          pagination: { limit: 100, offset: 0, total: 1 },
        }),
      });
    }

    if (path === "/api/transactions" && method === "GET") {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: [
            {
              id: "txn_1",
              clientId: "clt_1",
              transaction: "D",
              amount: 100,
              date: "2026-04-01T00:00:00Z",
              status: "Completed",
            },
          ],
          pagination: { limit: 20, offset: 0, total: 1 },
        }),
      });
    }

    return route.fulfill({
      status: 404,
      contentType: "application/json",
      body: JSON.stringify({ error: "not_found", message: `No mock for ${method} ${path}` }),
    });
  });
}

test.describe("F1-F4 Evaluator Walkthrough", () => {
  test.beforeEach(async ({ page, context }) => {
    await context.clearCookies();
    await page.unrouteAll({ behavior: "ignoreErrors" });
  });

  test("F1 auth routes remain reachable", async ({ page }) => {
    await gotoWithNetworkRetry(page, "/login");
    await expect(page.getByRole("heading", { name: "Login to the CRM" })).toBeVisible();

    await page.getByRole("button", { name: /Forgot your password\?/i }).click();
    await expect(page).toHaveURL(/\/forgot-password$/);
    await expect(page.getByRole("heading", { name: "Get back into your account" })).toBeVisible();

    await gotoWithNetworkRetry(page, "/reset-password");
    await expect(page.getByRole("heading", { name: "Reset Password" })).toBeVisible();
  });

  test("F2 user management remains reachable for admin", async ({ page }) => {
    await setupCoreRouteMocks(page, "admin");
    await gotoWithNetworkRetry(page, "/login");
    await setAuthState(page, "admin");

    await gotoWithNetworkRetry(page, "/admin/users");
    await expect(page.getByRole("heading", { name: "User Management" })).toBeVisible();
  });

  test("F3 client management remains reachable for root admin", async ({ page }) => {
    await setupCoreRouteMocks(page, "root_admin");
    await gotoWithNetworkRetry(page, "/login");
    await setRootAdminAuthState(page);

    await gotoWithNetworkRetry(page, "/admin/clients");
    await expect(page.getByRole("heading", { name: "All Clients" })).toBeVisible();
    await expect(page.getByText("Alice Tan")).toBeVisible();
  });

  test("F4 transactions view remains reachable for agent", async ({ page }) => {
    await setupCoreRouteMocks(page, "user");
    await gotoWithNetworkRetry(page, "/login");
    await setAuthState(page, "user");

    await gotoWithNetworkRetry(page, "/user/transactions");
    await expect(page.getByRole("heading", { name: "Transactions" })).toBeVisible();
    await expect(page.getByText("txn_1")).toBeVisible();
  });
});
