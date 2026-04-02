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

async function setupAdminUserManagementRoutes(page: Page) {
  let capturedCreatePayload: Record<string, unknown> | null = null;

  await page.route("**/api/**", async route => {
    const request = route.request();
    const method = request.method();
    const path = new URL(request.url()).pathname;

    if (path === "/api/users/me" && method === "GET") {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(adminUser),
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
              firstName: "Existing",
              lastName: "Agent",
              email: "existing.agent@example.com",
              role: "user",
              status: "active",
            },
          ],
          pagination: { limit: 10, offset: 0, total: 1 },
        }),
      });
    }

    if (path === "/api/users" && method === "POST") {
      capturedCreatePayload = request.postDataJSON() as Record<string, unknown>;
      return route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({
          id: "usr_999",
          firstName: capturedCreatePayload.firstName,
          lastName: capturedCreatePayload.lastName,
          email: capturedCreatePayload.email,
          role: capturedCreatePayload.role,
          status: "active",
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

  return {
    getCapturedCreatePayload: () => capturedCreatePayload,
  };
}

test.describe("Admin User Management (Mocked)", () => {
  test.beforeEach(async ({ context }) => {
    await context.clearCookies();
  });

  test("creates a new user from /admin/users/new", async ({ page }) => {
    const mockState = await setupAdminUserManagementRoutes(page);
    await gotoWithNetworkRetry(page, "/login");
    await setAuthState(page, "admin");

    await gotoWithNetworkRetry(page, "/admin/users/new");
    await expect(page.getByRole("heading", { name: "Create New User" })).toBeVisible();

    await page.getByTestId("first-name-input").fill("Jamie");
    await page.getByTestId("last-name-input").fill("Wong");
    await page.getByTestId("email-input").fill("jamie.wong@example.com");
    await page.getByTestId("password-input").fill("TempPass123!");
    await page.getByTestId("create-user-button").click();

    await expect(page.getByText("Agent created successfully")).toBeVisible();

    const payload = mockState.getCapturedCreatePayload();
    expect(payload).not.toBeNull();
    expect(payload?.role).toBe("user");
    expect(payload?.sendInviteEmail).toBe(true);
  });
});
