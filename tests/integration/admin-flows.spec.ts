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

import { test, expect, Page } from "@playwright/test";

const ROOT_ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL ?? "admin@crm.local";
const ROOT_ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? "admin123";

const NEW_ADMIN_EMAIL = `admin.test.${Date.now()}@crm.local`;
const NEW_ADMIN_PASSWORD = "AdminTest123!";
const NEW_ADMIN_FIRST_NAME = "Test";
const NEW_ADMIN_LAST_NAME = "Admin";

const NEW_AGENT_EMAIL = `agent.test@crm.local`;
const NEW_AGENT_PASSWORD = "AgentTest123!";
const NEW_AGENT_FIRST_NAME = "Test";
const NEW_AGENT_LAST_NAME = "Agent";


// Helper functions for login/logout to reduce duplication
async function login(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.waitForLoadState("domcontentloaded");
  await page.fill('[data-testid="email-input"]', email);
  await page.fill('[data-testid="password-input"]', password);
  await page.click('[data-testid="login-submit-button"]');
}

function expectUnder(durationMs: number, limitMs: number, label: string) {
  expect(durationMs, `${label} took ${durationMs}ms`).toBeLessThan(limitMs)
}

// Test Starts!!
// Root admin logins -> root admin create admin -> admin logins -> admin create agent
test.describe("Admins Full Flow (Integration)", () => {
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

  test("should login as root admin and see admin dashboard", async ({page,}) => {
    const startTime = Date.now();

    await login(page, ROOT_ADMIN_EMAIL, ROOT_ADMIN_PASSWORD);

    await expect(page).toHaveURL(/\/admin$/, { timeout: 10000 });
    await expect(page).toHaveURL(/\/admin$/, { timeout: 10000 })
    await expect(page.getByRole('heading', { name: 'Admin Dashboard' })).toBeVisible()
    await expect(page.getByText('Total Agents')).toBeVisible()
    await expect(page.getByText('Total Clients')).toBeVisible()
    await expect(page.getByText('Recent Activities')).toBeVisible()
    
    const loadTime = Date.now() - startTime
    expectUnder(loadTime, 15000, 'Root admin dashboard load')
  })

 test('root admin should navigate to user management page', async ({ page }) => {
    const loginStartTime = Date.now();
    await login(page, ROOT_ADMIN_EMAIL, ROOT_ADMIN_PASSWORD)
    await expect(page).toHaveURL(/\/admin$/, { timeout: 10000 })
    expectUnder(Date.now() - loginStartTime, 15000, 'Root admin login')
    
    const navStartTime = Date.now();
    await page.click('a[href="/admin/users"]')
    await expect(page).toHaveURL(/\/admin\/users$/)
    await expect(page.getByRole('heading', { name: 'User Management' })).toBeVisible()
    expectUnder(Date.now() - navStartTime, 10000, 'Navigate to user management')
  })

 test('root admin should create a new admin', async ({ page }) => {
    await login(page, ROOT_ADMIN_EMAIL, ROOT_ADMIN_PASSWORD)
    await expect(page).toHaveURL(/\/admin$/, { timeout: 10000 })

    await page.click('a[href="/admin/users"]')
    await expect(page).toHaveURL(/\/admin\/users$/)
    await expect(page.getByRole('heading', { name: 'User Management' })).toBeVisible()
    
    await page.click('[data-testid="create-new-user-button"]')
    await expect(page).toHaveURL(/\/admin\/users\/new$/)
    
    const createUserStartTime = Date.now();
    await page.fill('[data-testid="first-name-input"]', NEW_ADMIN_FIRST_NAME)
    await page.fill('[data-testid="last-name-input"]', NEW_ADMIN_LAST_NAME)
    await page.fill('[data-testid="email-input"]', NEW_ADMIN_EMAIL)
    await page.selectOption('[data-testid="role-select"]', 'admin')
    await page.click('[data-testid="create-user-button"]')

<<<<<<< HEAD
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
    await expect(page.getByText("Total Users")).toBeVisible({ timeout: 10000 });
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
=======
    await expect(page.getByText('Admin created successfully')).toBeVisible({ timeout: 5000 })
    expectUnder(Date.now() - createUserStartTime, 10000, 'Create new admin')
  })
>>>>>>> 10b8a4e2ff593505dcd80e0a1a5e5a1c7d0ea492

  test("root admin should logout successfully", async ({ page }) => {
    await login(page, ROOT_ADMIN_EMAIL, ROOT_ADMIN_PASSWORD);
    await expect(page).toHaveURL(/\/admin$/, { timeout: 10000 });

    const logoutStart = Date.now()
    // Click logout button
    await page.click('button:has-text("Logout")');
    await expect(page).toHaveURL(/\/login$/);
    expectUnder(Date.now() - logoutStart, 5000, 'Root admin logout')
  });

   test('new admin should login and access user management', async ({ page }) => {
    await login(page, NEW_ADMIN_EMAIL, NEW_ADMIN_PASSWORD)

    await expect(page).toHaveURL(/\/admin$/, { timeout: 10000 })
    await expect(page.getByRole('heading', { name: 'Admin Dashboard' })).toBeVisible()

    await page.click('a[href="/admin/users"]')
    await expect(page).toHaveURL(/\/admin\/users$/)
    await expect(page.getByRole('heading', { name: 'User Management' })).toBeVisible()
  })

  test("should create a new agent account and verify it appears in the list", async ({ page }) => {
    await login(page, NEW_ADMIN_EMAIL, NEW_ADMIN_PASSWORD);

    await expect(page).toHaveURL(/\/admin$/, { timeout: 10000 });

    await page.click('a[href="/admin/users"]');
    await expect(page).toHaveURL(/\/admin\/users$/);

    await page.click('button:has-text("Create New User")');

    await page.fill('[data-testid="first-name-input"]', NEW_AGENT_FIRST_NAME)
    await page.fill('[data-testid="last-name-input"]', NEW_AGENT_LAST_NAME)
    await page.fill('[data-testid="email-input"]', NEW_AGENT_EMAIL)
    await page.selectOption('[data-testid="role-select"]', 'agent')
    await page.click('[data-testid="create-user-button"]')

    await expect(page.getByText('Agent created successfully')).toBeVisible({ timeout: 5000 })
  })

  test('normal admin should not be able to create admin role in UI', async ({ page }) => {
    await login(page, NEW_ADMIN_EMAIL, ROOT_ADMIN_PASSWORD)

    await expect(page).toHaveURL(/\/admin$/, { timeout: 10000 })

    await page.goto('/admin/users/new')
    await expect(page.locator('[data-testid="role-select"] option[value="admin"]')).toHaveCount(0)
    await expect(page.locator('[data-testid="role-select"] option[value="agent"]')).toHaveCount(1)
  })

  test('admin should logout successfully', async ({ page }) => {
    await login(page, NEW_ADMIN_EMAIL, ROOT_ADMIN_PASSWORD)

    await expect(page).toHaveURL(/\/admin$/, { timeout: 10000 })

    await page.click('button:has-text("Logout")')
    await expect(page).toHaveURL(/\/login$/)
  })
})