/**
 * Agent Logout Integration Tests
 * 
 * Moved from e2e/agent/agent-logout.spec.ts due to proxy errors.
 * Tests navigation to /agent dashboard which auto-loads data.
 * 
 * Run with: npm run e2e:integration:real
 */

import { test, expect } from "@playwright/test";
import { setAuthState } from "../helpers/auth";

const AGENT_EMAIL = process.env.E2E_AGENT_EMAIL ?? "agent@crm.local";
const AGENT_PASSWORD = process.env.E2E_AGENT_PASSWORD ?? "AgentPass123!";

test.describe("Agent Logout Flow (Integration)", () => {
  test.beforeEach(async ({ page, context }) => {
    await context.clearCookies();
    await page.goto("/login");
    // Note: setAuthState may need updating for integration tests
    // Consider using real login instead of mocked auth state
  });

  test("should logout from agent dashboard", async ({ page }) => {
    await test.step("Login as agent", async () => {
      await page.fill('[data-testid="email-input"]', AGENT_EMAIL);
      await page.fill('[data-testid="password-input"]', AGENT_PASSWORD);
      await page.click('[data-testid="login-submit-button"]');
      await expect(page).toHaveURL(/\/agent$/, { timeout: 10000 });
    });

    await test.step("Navigate to agent dashboard", async () => {
      await page.goto("/agent");
      await page.waitForLoadState("domcontentloaded");
    });

    await test.step("Verify agent is logged in", async () => {
      await expect(page.getByText("Agent Dashboard")).toBeVisible({ timeout: 10000 });
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
      await page.goto("/agent");
      await expect(page).toHaveURL(/\/login/, { timeout: 5000 });
    });
  });

  test("should logout from agent create client page", async ({ page }) => {
    await test.step("Login as agent", async () => {
      await page.fill('[data-testid="email-input"]', AGENT_EMAIL);
      await page.fill('[data-testid="password-input"]', AGENT_PASSWORD);
      await page.click('[data-testid="login-submit-button"]');
      await expect(page).toHaveURL(/\/agent$/, { timeout: 10000 });
    });

    await test.step("Navigate to create client page", async () => {
      await page.goto("/agent/clients/new");
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

  test("should logout from agent transactions page", async ({ page }) => {
    await test.step("Login as agent", async () => {
      await page.fill('[data-testid="email-input"]', AGENT_EMAIL);
      await page.fill('[data-testid="password-input"]', AGENT_PASSWORD);
      await page.click('[data-testid="login-submit-button"]');
      await expect(page).toHaveURL(/\/agent$/, { timeout: 10000 });
    });

    await test.step("Navigate to transactions page", async () => {
      await page.goto("/agent/transactions");
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
