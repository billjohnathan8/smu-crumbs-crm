/**
 * Admin Flow Integration Tests
 * 
 * These tests require a REAL backend with database and run against a full-stack environment.
 * They were moved from e2e/admin.spec.ts due to Vite proxy errors.
 * 
 * Prerequisites:
 * - Backend service running (Spring Boot)
 * - Database (PostgreSQL) with test data
 * - Admin user credentials configured
 * 
 * Run with: npm run e2e:integration:real
 */

import { test, expect } from "@playwright/test";

const ADMIN_EMAIL = (process.env.E2E_ADMIN_EMAIL ?? "admin@crm.local").trim();
const ADMIN_PASSWORD = (process.env.E2E_ADMIN_PASSWORD ?? "admin123").trim();

test.describe("Admin Flow (Integration)", () => {
  test.beforeEach(async ({ page, context }) => {
    // Clear all cookies and storage state for clean slate
    await context.clearCookies();
    await page.goto("/");
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    });

    // Optional: Log browser errors for debugging
    page.on("pageerror", (err) => console.error("Browser error:", err.message));
  });

  test("should login as admin and navigate to manage accounts page", async ({
    page,
  }) => {
    const startTime = Date.now();

    await page.goto("/login");
    await page.waitForLoadState("domcontentloaded");

    await page.fill('[data-testid="email-input"]', ADMIN_EMAIL);
    await page.fill('[data-testid="password-input"]', ADMIN_PASSWORD);
    await page.click('[data-testid="login-submit-button"]');

    await expect(page).toHaveURL(/\/admin$/, { timeout: 10000 });
    await expect(page.getByText("Admin Dashboard")).toBeVisible();

    const dashboardLoadTime = Date.now() - startTime;
    expect(dashboardLoadTime).toBeLessThan(15000); // Generous timeout for real backend

    const accountsStartTime = Date.now();

    await page.click('a[href="/admin/accounts"]');

    await expect(page).toHaveURL(/\/admin\/accounts$/);
    await expect(page.getByRole("heading", { name: "Manage Accounts" })).toBeVisible();

    const accountsLoadTime = Date.now() - accountsStartTime;
    expect(accountsLoadTime).toBeLessThan(10000);
  });

  test("should display stats on admin dashboard", async ({ page }) => {
    await page.goto("/login");
    await page.waitForLoadState("domcontentloaded");

    await page.fill('[data-testid="email-input"]', ADMIN_EMAIL);
    await page.fill('[data-testid="password-input"]', ADMIN_PASSWORD);
    await page.click('[data-testid="login-submit-button"]');

    await expect(page).toHaveURL(/\/admin$/, { timeout: 10000 });

    // Wait for stats to load from real backend (may take time)
    await expect(page.getByText("Total Agents")).toBeVisible({ timeout: 10000 });
    await expect(page.getByText("Total Clients")).toBeVisible();
    await expect(page.getByText("Recent Activity")).toBeVisible();
  });

  test("should navigate back to dashboard from manage accounts", async ({
    page,
  }) => {
    await page.goto("/login");
    await page.waitForLoadState("domcontentloaded");

    await page.fill('[data-testid="email-input"]', ADMIN_EMAIL);
    await page.fill('[data-testid="password-input"]', ADMIN_PASSWORD);
    await page.click('[data-testid="login-submit-button"]');

    await expect(page).toHaveURL(/\/admin$/, { timeout: 10000 });

    await page.click('a[href="/admin/accounts"]');
    await expect(page).toHaveURL(/\/admin\/accounts$/);

    // Click back to dashboard
    await page.click('a[href="/admin"]');
    await expect(page).toHaveURL(/\/admin$/);
    await expect(page.getByText("Admin Dashboard")).toBeVisible();
  });

  test("should logout successfully", async ({ page }) => {
    await page.goto("/login");
    await page.waitForLoadState("domcontentloaded");

    await page.fill('[data-testid="email-input"]', ADMIN_EMAIL);
    await page.fill('[data-testid="password-input"]', ADMIN_PASSWORD);
    await page.click('[data-testid="login-submit-button"]');

    await expect(page).toHaveURL(/\/admin$/, { timeout: 10000 });

    // Click logout button
    await page.click('button:has-text("Logout")');

    await expect(page).toHaveURL(/\/login$/);
  });
});

