/**
 * User Management Advanced Integration Tests (Feature 1)
 *
 * Tests advanced user management flows: disable user, update user,
 * and protection of the root administrator from deletion.
 *
 * Prerequisites:
 * - Backend services running (user service)
 * - Database (PostgreSQL) with seeded root admin
 *
 * Run with: npm test
 */

import {
  test,
  expect,
  type APIRequestContext,
  type APIResponse,
  type Page,
} from "@playwright/test";

const ADMIN_EMAIL = (process.env.E2E_ADMIN_EMAIL ?? "admin@crm.local").trim();
const ADMIN_PASSWORD = (process.env.E2E_ADMIN_PASSWORD ?? "admin123").trim();
const USER_PASSWORD = (process.env.E2E_USER_PASSWORD ?? "UserPass123!").trim();

function uniqueSuffix(): string {
  return `${Date.now()}-${Math.floor(Math.random() * 100_000)}`;
}

function normalizeBaseURL(baseURL: string | undefined): string {
  const value = (baseURL ?? process.env.PLAYWRIGHT_BASE_URL ?? "").trim();
  if (!value) throw new Error("Playwright baseURL is required for integration tests");
  return value.replace(/\/+$/, "");
}

async function expectOkJson(response: APIResponse, operation: string): Promise<unknown> {
  const body = await response.text();
  expect(response.ok(), `${operation} failed: ${response.status()} ${response.statusText()}\n${body}`).toBeTruthy();
  return body ? JSON.parse(body) : {};
}

async function loginAsAdmin(request: APIRequestContext, baseURL: string): Promise<string> {
  const res = await request.post(`${baseURL}/api/auth/login`, {
    data: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
  });
  const payload = (await expectOkJson(res, "admin login")) as { accessToken: string };
  expect(payload.accessToken).toBeTruthy();
  return payload.accessToken;
}

async function loginViaUi(page: Page, email: string, password: string, expectedPath: string): Promise<void> {
  await page.goto("/login");
  await page.fill('[data-testid="email-input"]', email);
  await page.fill('[data-testid="password-input"]', password);
  await page.click('[data-testid="login-submit-button"]');
  await expect(page).toHaveURL(new RegExp(`${expectedPath}$`), { timeout: 10000 });
}

function expectUnder(durationMs: number, limitMs: number, label: string) {
  expect(durationMs, `${label} took ${durationMs}ms`).toBeLessThan(limitMs);
}

test.describe("User Management Advanced (Feature 1)", () => {
  let baseURL: string;
  let adminToken: string;

  test.beforeAll(async ({ request, baseURL: rawBaseURL }) => {
    baseURL = normalizeBaseURL(rawBaseURL);
    adminToken = await loginAsAdmin(request, baseURL);
  });

  test("should update user information via API", async ({ request }) => {
    const startTime = Date.now();
    const email = `update-user-${uniqueSuffix()}@example.com`;

    const createRes = await request.post(`${baseURL}/api/users`, {
      headers: { Authorization: `Bearer ${adminToken}` },
      data: {
        firstName: "Before",
        lastName: "Update",
        email,
        role: "user",
        sendInviteEmail: false,
        temporaryPassword: USER_PASSWORD,
      },
    });
    const created = (await expectOkJson(createRes, "create user for update")) as { id: string };

    const updateRes = await request.put(`${baseURL}/api/users/${created.id}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
      data: {
        firstName: "After",
        lastName: "Updated",
        role: "user",
      },
    });
    const updated = (await expectOkJson(updateRes, "update user")) as {
      id: string;
      firstName: string;
      lastName: string;
    };

    expect(updated.id).toBe(created.id);
    expect(updated.firstName).toBe("After");
    expect(updated.lastName).toBe("Updated");

    expectUnder(Date.now() - startTime, 10000, "Update user");
  });

  test("should disable a user via API", async ({ request }) => {
    const startTime = Date.now();
    const email = `disable-user-${uniqueSuffix()}@example.com`;

    const createRes = await request.post(`${baseURL}/api/users`, {
      headers: { Authorization: `Bearer ${adminToken}` },
      data: {
        firstName: "Disable",
        lastName: "Target",
        email,
        role: "user",
        sendInviteEmail: false,
        temporaryPassword: USER_PASSWORD,
      },
    });
    const created = (await expectOkJson(createRes, "create user for disable")) as { id: string };

    const disableRes = await request.post(`${baseURL}/api/users/${created.id}/disable`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const disabled = (await expectOkJson(disableRes, "disable user")) as {
      id: string;
      status: string;
    };

    expect(disabled.id).toBe(created.id);
    expect(disabled.status.toLowerCase()).toMatch(/disabled|inactive/);

    expectUnder(Date.now() - startTime, 10000, "Disable user");
  });

  test("disabled user should not be able to login", async ({ request }) => {
    const email = `disabled-login-${uniqueSuffix()}@example.com`;

    const createRes = await request.post(`${baseURL}/api/users`, {
      headers: { Authorization: `Bearer ${adminToken}` },
      data: {
        firstName: "DisabledLogin",
        lastName: "Test",
        email,
        role: "user",
        sendInviteEmail: false,
        temporaryPassword: USER_PASSWORD,
      },
    });
    const created = (await expectOkJson(createRes, "create user for disabled login")) as { id: string };

    await request.post(`${baseURL}/api/users/${created.id}/disable`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });

    const loginRes = await request.post(`${baseURL}/api/auth/login`, {
      data: { email, password: USER_PASSWORD },
    });

    expect(loginRes.ok(), "Disabled user login should be rejected").toBeFalsy();
    expect([401, 403].includes(loginRes.status()), "Should return 401 or 403 for disabled user").toBeTruthy();
  });

  test("should delete a non-root user via API", async ({ request }) => {
    const startTime = Date.now();
    const email = `delete-user-${uniqueSuffix()}@example.com`;

    const createRes = await request.post(`${baseURL}/api/users`, {
      headers: { Authorization: `Bearer ${adminToken}` },
      data: {
        firstName: "Delete",
        lastName: "Target",
        email,
        role: "user",
        sendInviteEmail: false,
        temporaryPassword: USER_PASSWORD,
      },
    });
    const created = (await expectOkJson(createRes, "create user for delete")) as { id: string };

    const deleteRes = await request.delete(`${baseURL}/api/users/${created.id}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(deleteRes.ok() || deleteRes.status() === 204, `Delete user failed: ${deleteRes.status()}`).toBeTruthy();

    const getRes = await request.get(`${baseURL}/api/users/${created.id}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    // Soft delete: user still returns 200 but with status "deleted", or 404 if hard-deleted
    if (getRes.ok()) {
      const body = (await getRes.json()) as { status: string };
      expect(body.status.toLowerCase()).toBe("deleted");
    } else {
      expect([404, 410].includes(getRes.status()), "Deleted user should return 404 or 410").toBeTruthy();
    }

    expectUnder(Date.now() - startTime, 10000, "Delete user");
  });

  test("root admin must not be deletable", async ({ request }) => {
    const startTime = Date.now();

    // Retrieve root admin's own user ID
    const meRes = await request.get(`${baseURL}/api/users/me`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const me = (await expectOkJson(meRes, "get root admin profile")) as { id: string; email: string };
    expect(me.email.toLowerCase()).toBe(ADMIN_EMAIL.toLowerCase());

    const deleteRes = await request.delete(`${baseURL}/api/users/${me.id}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });

    expect(deleteRes.ok(), "Deleting root admin should be rejected").toBeFalsy();
    expect([400, 403, 409, 422].includes(deleteRes.status()), "Should return a client error status for root admin delete").toBeTruthy();

    // Confirm root admin is still accessible
    const verifyRes = await request.get(`${baseURL}/api/users/me`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const verifyPayload = (await expectOkJson(verifyRes, "verify root admin still exists")) as { id: string };
    expect(verifyPayload.id).toBe(me.id);

    expectUnder(Date.now() - startTime, 10000, "Root admin delete protection");
  });

  test("admin should view user management page via UI", async ({ page }) => {
    const startTime = Date.now();

    await loginViaUi(page, ADMIN_EMAIL, ADMIN_PASSWORD, "/admin");
    await expect(page.getByRole("heading", { name: "Admin Dashboard" })).toBeVisible();

    await page.click('a[href="/admin/users"]');
    await expect(page).toHaveURL(/\/admin\/users$/);
    await expect(page.getByRole("heading", { name: "User Management", level: 1 })).toBeVisible();

    // Wait for loading to finish
    const loadingText = page.getByText("Loading users...");
    if (await loadingText.isVisible().catch(() => false)) {
      await expect(loadingText).toBeHidden({ timeout: 10000 });
    }

    // Verify the page displays user content: either "My Users" section heading,
    // "No users found" text, or the Create New User button
    const myUsersHeading = page.getByRole("heading", { name: "My Users" });
    const noUsersText = page.getByText("No users found");
    const createButton = page.getByTestId("create-new-user-button");

    const hasMyUsers = await myUsersHeading.isVisible().catch(() => false);
    const hasNoUsers = await noUsersText.isVisible().catch(() => false);
    const hasCreateBtn = await createButton.isVisible().catch(() => false);

    expect(
      hasMyUsers || hasNoUsers || hasCreateBtn,
      "User management page should display user content or create button",
    ).toBeTruthy();

    expectUnder(Date.now() - startTime, 15000, "Admin view user management");
  });
});
