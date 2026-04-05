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

const adminUser = {
  id: "admin-1",
  firstName: "Admin",
  lastName: "User",
  email: "admin@example.com",
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

async function setupCommunicationsApiMocks(page: Page, currentUser: typeof adminUser) {
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

    if ((path === "/api/communications" || path === "/api/communications/queued") && method === "GET") {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: [
            {
              communicationId: "com_1",
              clientId: "clt_1",
              userId: "usr_1",
              channel: "email",
              toEmail: "client@example.com",
              subject: "Subject",
              body: "Body",
              status: "queued",
              createdAt: "2026-03-21T10:00:00Z",
              updatedAt: "2026-03-21T10:00:00Z",
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
          pagination: { limit: 5, offset: 0, total: 0 },
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

test.describe("Admin Communications Access Matrix", () => {
  test.beforeEach(async ({ page, context }) => {
    await context.clearCookies();
    await page.unrouteAll({ behavior: "ignoreErrors" });
  });

  test("non-root admin is redirected to unauthorized page", async ({ page }) => {
    await setupCommunicationsApiMocks(page, adminUser);
    await gotoWithNetworkRetry(page, "/login");
    await setAuthState(page, "admin");

    await gotoWithNetworkRetry(page, "/admin/communications");

    await expect(page).toHaveURL(/\/unauthorized$/);
    await expect(page.getByRole("heading", { name: "Access Denied" })).toBeVisible();
  });

  test("root admin can access communications page", async ({ page }) => {
    await setupCommunicationsApiMocks(page, rootAdminUser);
    await gotoWithNetworkRetry(page, "/login");
    await setRootAdminAuthState(page);

    await gotoWithNetworkRetry(page, "/admin/communications");

    await expect(page).toHaveURL(/\/admin\/communications$/);
    await expect(page.getByRole("heading", { name: "Communications" })).toBeVisible();
    await expect(page.getByRole("cell", { name: "Subject" })).toBeVisible();
  });
});
