/**
 * User Logout Integration Tests
 * 
 * Moved from e2e/user/user-logout.spec.ts due to proxy errors.
 * Tests navigation to /user dashboard which auto-loads data.
 * 
 * Run with: npm run e2e:integration:real
 */

import { test, expect } from "@playwright/test";
import { setAuthState } from "../helpers/auth";

const USER_EMAIL = (process.env.E2E_USER_EMAIL ?? "agent1@crm.com").trim();
const USER_PASSWORD = (process.env.E2E_USER_PASSWORD ?? "V7!mQ2#pL9@xR4$k").trim();

test.describe("User Logout Flow (Integration)", () => {
  test.beforeEach(async ({ page, context }) => {
    await context.clearCookies();
    await page.goto("/login");
    // Note: setAuthState may need updating for integration tests
    // Consider using real login instead of mocked auth state
  });

  test("should logout from user dashboard", async ({ page }) => {
    await test.step("Login as user", async () => {
      await page.fill('[data-testid="email-input"]', USER_EMAIL);
      await page.fill('[data-testid="password-input"]', USER_PASSWORD);
      await page.click('[data-testid="login-submit-button"]');
      await expect(page).toHaveURL(/\/user$/, { timeout: 10000 });
    });

    await test.step("Navigate to user dashboard", async () => {
      await page.goto("/user");
      await page.waitForLoadState("domcontentloaded");
    });

    await test.step("Verify user is logged in", async () => {
      await expect(page.getByText("User Dashboard")).toBeVisible({ timeout: 10000 });
    });

    await test.step("Click logout button", async () => {
      await page.click('button:has-text("Logout")');
    });

    await test.step("Verify redirect to login page", async () => {
      await expect(page).toHaveURL(/\/login/, { timeout: 5000 });
    });

    await test.step("Verify auth state is cleared", async () => {
      const authToken = await page.evaluate(() =>
        localStorage.getItem("authToken"),
      );
      const currentUser = await page.evaluate(() =>
        localStorage.getItem("currentUser"),
      );

      expect(authToken).toBeNull();
      expect(currentUser).toBeNull();
    });

    await test.step("Verify cannot access protected route after logout", async () => {
      await page.goto("/user");
      await expect(page).toHaveURL(/\/login/, { timeout: 5000 });
    });
  });

  test("should logout from user create client page", async ({ page }) => {
    await test.step("Login as user", async () => {
      await page.fill('[data-testid="email-input"]', USER_EMAIL);
      await page.fill('[data-testid="password-input"]', USER_PASSWORD);
      await page.click('[data-testid="login-submit-button"]');
      await expect(page).toHaveURL(/\/user$/, { timeout: 10000 });
    });

    await test.step("Navigate to create client page", async () => {
      await page.goto("/user/clients/new");
      await page.waitForLoadState("domcontentloaded");
    });

    await test.step("Verify on create client page", async () => {
      await expect(
        page.getByRole("heading", { name: "Create Client" }),
      ).toBeVisible();
    });

    await test.step("Click logout button", async () => {
      await page.click('button:has-text("Logout")');
    });

    await test.step("Verify redirect to login page", async () => {
      await expect(page).toHaveURL(/\/login/, { timeout: 5000 });
    });

    await test.step("Verify auth state is cleared", async () => {
      const authToken = await page.evaluate(() =>
        localStorage.getItem("authToken"),
      );
      expect(authToken).toBeNull();
    });
  });

  test("should logout from user transactions page", async ({ page }) => {
    await test.step("Login as user", async () => {
      await page.fill('[data-testid="email-input"]', USER_EMAIL);
      await page.fill('[data-testid="password-input"]', USER_PASSWORD);
      await page.click('[data-testid="login-submit-button"]');
      await expect(page).toHaveURL(/\/user$/, { timeout: 10000 });
    });

    await test.step("Navigate to transactions page", async () => {
      await page.goto("/user/transactions");
      await page.waitForLoadState("domcontentloaded");
    });

    await test.step("Verify on transactions page", async () => {
      await expect(page.getByRole("heading", { name: "Transactions" })).toBeVisible();
    });

    await test.step("Click logout button", async () => {
      await page.click('button:has-text("Logout")');
    });

    await test.step("Verify redirect to login page", async () => {
      await expect(page).toHaveURL(/\/login/, { timeout: 5000 });
    });

    await test.step("Verify auth state is cleared", async () => {
      const authToken = await page.evaluate(() =>
        localStorage.getItem("authToken"),
      );
      expect(authToken).toBeNull();
    });
  });
});
