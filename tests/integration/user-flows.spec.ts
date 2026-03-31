/**
 * User Flow Integration Tests
 * 
 * These tests require a REAL backend with database. Moved from e2e/user.spec.ts
 * due to Vite proxy errors when navigating to pages that auto-load data.
 * 
 * Prerequisites:
 * - Backend service running
 * - Database with test user account
 * - User user credentials configured
 * 
 * Run with: npm run e2e:integration:real
 */

import { test, expect } from "@playwright/test";

const USER_EMAIL = (process.env.E2E_USER_EMAIL ?? "agent1@crm.com").trim();
const USER_PASSWORD = (process.env.E2E_USER_PASSWORD ?? "UserPass123!").trim();

test.describe("User Flow (Integration)", () => {
  test.beforeEach(async ({ page, context }) => {
    await context.clearCookies();
    await page.goto("/");
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    });
    page.on("pageerror", (err) => console.error("Browser error:", err.message));
  });

  test("should login as user and view dashboard", async ({ page }) => {
    const startTime = Date.now();

    await page.goto("/login");
    await page.waitForLoadState("domcontentloaded");

    await page.fill('[data-testid="email-input"]', USER_EMAIL);
    await page.fill('[data-testid="password-input"]', USER_PASSWORD);
    await page.click('[data-testid="login-submit-button"]');

    await expect(page).toHaveURL(/\/user$/);
    await expect(page.getByText("User Dashboard")).toBeVisible({ timeout: 10000 });

    const dashboardLoadTime = Date.now() - startTime;
    expect(dashboardLoadTime).toBeLessThan(10000);
  });

  test("should display clients and transactions on user dashboard", async ({ page }) => {
    const startTime = Date.now();
    await page.goto("/login");
    await page.waitForLoadState("domcontentloaded");

    await page.fill('[data-testid="email-input"]', USER_EMAIL);
    await page.fill('[data-testid="password-input"]', USER_PASSWORD);
    await page.click('[data-testid="login-submit-button"]');

    await expect(page).toHaveURL(/\/user$/, { timeout: 10000 });
    await expect(page.getByText("User Dashboard")).toBeVisible();

    const dashboardLoadTime = Date.now() - startTime;
    expect(dashboardLoadTime).toBeLessThan(15000);

    const createClientStartTime = Date.now();

    await page.click('a[href="/user/clients/new"]');
    await expect(page).toHaveURL(/\/user\/clients\/new$/);

    const suffix = `${Date.now()}-${Math.floor(Math.random() * 10000)}`;
    await page.fill('input[name="firstName"]', "John");
    await page.fill('input[name="lastName"]', "Doe");
    await page.fill('input[name="dateOfBirth"]', "1990-01-01");
    await page.selectOption('select[name="gender"]', "Male");
    await page.fill('input[name="emailAddress"]', `john.doe.${suffix}@example.com`);
    await page.fill('input[name="phoneNumber"]', "+6512345678");
    await page.fill('input[name="address"]', "123 Main St");
    await page.fill('input[name="city"]', "Singapore");
    await page.fill('input[name="state"]', "Singapore");
    await page.fill('input[name="country"]', "Singapore");
    await page.fill('input[name="postalCode"]', "123456");

    await page.click('button[type="submit"]');

    await expect(page).toHaveURL(/\/user$/, { timeout: 10000 });

    const createClientTime = Date.now() - createClientStartTime;
    expect(createClientTime).toBeLessThan(15000);

    const transactionsStartTime = Date.now();

    await page.click('a[href="/user/transactions"]');
    await expect(page).toHaveURL(/\/user\/transactions$/);
    await expect(page.getByRole("heading", { name: "Transactions" })).toBeVisible();

    const transactionsLoadTime = Date.now() - transactionsStartTime;
    expect(transactionsLoadTime).toBeLessThan(10000);
  });

  test("should validate client creation form", async ({ page }) => {
    await page.goto("/login");
    await page.waitForLoadState("domcontentloaded");

    await page.fill('[data-testid="email-input"]', USER_EMAIL);
    await page.fill('[data-testid="password-input"]', USER_PASSWORD);
    await page.click('[data-testid="login-submit-button"]');

    await expect(page).toHaveURL(/\/user$/, { timeout: 10000 });

    await page.click('a[href="/user/clients/new"]');
    await expect(page).toHaveURL(/\/user\/clients\/new$/);

    // Try to submit without filling required fields
    await page.click('button[type="submit"]');

    // Should show validation errors
    await expect(page.getByText(/required/i).first()).toBeVisible();
  });

  test("should display user dashboard stats", async ({ page }) => {
    await page.goto("/login");
    await page.waitForLoadState("domcontentloaded");

    await page.fill('[data-testid="email-input"]', USER_EMAIL);
    await page.fill('[data-testid="password-input"]', USER_PASSWORD);
    await page.click('[data-testid="login-submit-button"]');

    await expect(page).toHaveURL(/\/user$/);

    // Wait for stats/data to load from real backend
    await expect(page.getByRole("heading", { name: "My Clients" })).toBeVisible({ timeout: 10000 });
  });

  test("should navigate to create client page", async ({ page }) => {
    await page.goto("/login");
    await page.waitForLoadState("domcontentloaded");

    await page.fill('[data-testid="email-input"]', USER_EMAIL);
    await page.fill('[data-testid="password-input"]', USER_PASSWORD);
    await page.click('[data-testid="login-submit-button"]');

    await expect(page).toHaveURL(/\/user$/);

    await page.click('a[href="/user/clients/new"]');
    await expect(page).toHaveURL(/\/user\/clients\/new$/);
  });

  test("should navigate between pages successfully", async ({ page }) => {
    await page.goto("/login");
    await page.waitForLoadState("domcontentloaded");

    await page.fill('[data-testid="email-input"]', USER_EMAIL);
    await page.fill('[data-testid="password-input"]', USER_PASSWORD);
    await page.click('[data-testid="login-submit-button"]');

    await expect(page).toHaveURL(/\/user$/);

    // Navigate to create client
    await page.click('a[href="/user/clients/new"]');
    await expect(page).toHaveURL(/\/user\/clients\/new$/);

    // Navigate back to dashboard
    await page.click('a[href="/user"]');
    await expect(page).toHaveURL(/\/user$/);

    // Navigate to transactions (if link exists)
    const transactionsLink = page.locator('a[href="/user/transactions"]');
    if (await transactionsLink.count() > 0) {
      await transactionsLink.first().click();
      await expect(page).toHaveURL(/\/user\/transactions$/);
      
      // Navigate back to dashboard
      await page.click('a[href="/user"]');
      await expect(page).toHaveURL(/\/user$/);
    }
  });
});

