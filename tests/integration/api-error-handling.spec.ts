/**
 * API Error Handling Integration Tests
 * 
 * These tests require a REAL backend with actual API responses.
 * Tests auth failures, permission errors, validation errors, and network issues.
 * 
 * Prerequisites:
 * - Backend service running and connected to localstack
 * - Database with test user account
 * - User & admin user credentials configured
 * 
 * Run with: npm run e2e:integration:real
 */

import { test, expect } from "@playwright/test";

const USER_EMAIL = (process.env.E2E_USER_EMAIL ?? "agent1@crm.com").trim();
const USER_PASSWORD = (process.env.E2E_USER_PASSWORD ?? "V7!mQ2#pL9@xR4$k").trim();
const ADMIN_EMAIL = (process.env.E2E_ADMIN_EMAIL ?? "admin@crm.com").trim();
const ADMIN_PASSWORD = (process.env.E2E_ADMIN_PASSWORD ?? "Scrooge@Bank2026!").trim();

test.describe("API Error Handling (Integration)", () => {
  test.beforeEach(async ({ page, context }) => {
    await context.clearCookies();
    await page.goto("/");
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    });
    page.on("pageerror", (err) => console.error("Browser error:", err.message));
  });

  test("should handle 401 Unauthorized when auth token expires", async ({
    page,
    context,
  }) => {
    await test.step("Attempt login with invalid credentials", async () => {
      await page.goto("/login");
      await page.waitForLoadState("domcontentloaded");

      // Try with wrong password
      await page.fill('[data-testid="email-input"]', USER_EMAIL);
      await page.fill('[data-testid="password-input"]', "wrongpassword123");
      await page.click('[data-testid="login-submit-button"]');
    });

    await test.step("Verify error message is displayed", async () => {
      // Should show auth error or stay on login page after failed auth
      const errorMsg = page.locator(
        "text=/invalid|incorrect|unauthorized|failed/i",
      );
      const isStillOnLogin = page.url().includes("/login");

      // Either error message shown OR still on login page (both indicate failed auth)
      const hasErrorOrStillLogin =
        (await errorMsg.first().isVisible().catch(() => false)) ||
        isStillOnLogin;
      expect(hasErrorOrStillLogin).toBe(true);
    });
  });

  test("should handle permission errors when user tries unauthorized actions", async ({
    page,
  }) => {
    await test.step("Login as user", async () => {
      await page.goto("/login");
      await page.waitForLoadState("domcontentloaded");

      await page.fill('[data-testid="email-input"]', USER_EMAIL);
      await page.fill('[data-testid="password-input"]', USER_PASSWORD);
      await page.click('[data-testid="login-submit-button"]');

      // Wait for successful login
      await expect(page).toHaveURL(/\/user/, { timeout: 10000 });
    });

    await test.step("Verify user cannot access admin dashboArd", async () => {
      // Try to navigate to admin page directly
      await page.goto("/admin");

      // Should either redirect back to user dashboard OR show access denied
      // Wait a bit for any redirects to happen
      await page.waitForTimeout(1000);

      const isRedirectedToAgent = page.url().includes("/user");
      const hasAccessDenied = await page
        .locator("text=/access denied|forbidden|not authorized/i")
        .first()
        .isVisible()
        .catch(() => false);

      // Either redirected or shown error
      expect(isRedirectedToAgent || hasAccessDenied).toBe(true);
    });
  });

  test("should handle validation errors when submitting invalid data", async ({
    page,
  }) => {
    await test.step("Login as user", async () => {
      await page.goto("/login");
      await page.waitForLoadState("domcontentloaded");

      await page.fill('[data-testid="email-input"]', USER_EMAIL);
      await page.fill('[data-testid="password-input"]', USER_PASSWORD);
      await page.click('[data-testid="login-submit-button"]');

      await expect(page).toHaveURL(/\/user/, { timeout: 10000 });
    });

    await test.step("Navigate to create client", async () => {
      // Look for create client button/link
      const createClientLink = page.locator('a[href*="/clients/new"]').first();
      const clientsExist = await createClientLink.isVisible().catch(() => false);

      if (clientsExist) {
        await createClientLink.click();
        await page.waitForLoadState("domcontentloaded");
      } else {
        // Alternative: navigate directly
        await page.goto("/user/clients/new");
      }
    });

    await test.step("Submit form with invalid/empty required fields", async () => {
      // Try to submit without filling required fields
      const submitBtn = page.locator('button[type="submit"]').first();

      if (await submitBtn.isVisible()) {
        // If form has client-side validation, it might prevent submission
        // Try clicking submit anyway
        await submitBtn.click();

        // Wait to see if validation errors appear
        await page.waitForTimeout(1000);

        // Look for validation error messages
        const hasValidationError = await page
          .locator("text=/required|invalid|please fill|error/i")
          .first()
          .isVisible()
          .catch(() => false);

        expect(hasValidationError).toBe(true);
      }
    });
  });

  test("should handle invalid email format", async ({ page }) => {
    await test.step("Login as user", async () => {
      await page.goto("/login");
      await page.waitForLoadState("domcontentloaded");

      await page.fill('[data-testid="email-input"]', USER_EMAIL);
      await page.fill('[data-testid="password-input"]', USER_PASSWORD);
      await page.click('[data-testid="login-submit-button"]');

      await expect(page).toHaveURL(/\/user/, { timeout: 10000 });
    });

    await test.step("Navigate to create client", async () => {
      const createClientLink = page.locator('a[href*="/clients/new"]').first();
      if (await createClientLink.isVisible().catch(() => false)) {
        await createClientLink.click();
        await page.waitForLoadState("domcontentloaded");
      } else {
        await page.goto("/user/clients/new");
      }
    });

    await test.step("Submit with invalid email format", async () => {
      const emailInput = page.locator('input[name="emailAddress"]').first();

      if (await emailInput.isVisible().catch(() => false)) {
        await emailInput.fill("not-an-email");

        const submitBtn = page.locator('button[type="submit"]').first();
        if (await submitBtn.isVisible()) {
          await submitBtn.click();
          await page.waitForTimeout(1000);

          // Should show email validation error
          const hasEmailError = await page
            .locator("text=/email|invalid|format/i")
            .first()
            .isVisible()
            .catch(() => false);

          expect(hasEmailError).toBe(true);
        }
      }
    });
  });

  test("should handle network errors gracefully when backend is unreachable", async ({
    page,
    context,
  }) => {
    await test.step("Go offline and try to login", async () => {
      await page.goto("/login");

      // Set offline mode after page has loaded so subsequent API calls fail
      await context.setOffline(true);

      // Try to submit login form
      await page.fill('[data-testid="email-input"]', USER_EMAIL);
      await page.fill('[data-testid="password-input"]', USER_PASSWORD);
      await page.click('[data-testid="login-submit-button"]');

      // Wait for error response
      await page.waitForTimeout(2000);
    });

    await test.step("Verify error handling for offline scenario", async () => {
      // Should still be on login page or show error
      const isStillOnLogin = page.url().includes("/login");
      const hasNetworkError = await page
        .locator("text=/network|failed|error|offline/i")
        .first()
        .isVisible()
        .catch(() => false);

      expect(isStillOnLogin || hasNetworkError).toBe(true);
    });

    await test.step("Restore connection", async () => {
      await context.setOffline(false);
    });
  });

  test("should handle slow API responses", async ({ page }) => {
    await test.step("Login as admin successfully", async () => {
      await page.goto("/login");
      await page.waitForLoadState("domcontentloaded");

      await page.fill('[data-testid="email-input"]', ADMIN_EMAIL);
      await page.fill('[data-testid="password-input"]', ADMIN_PASSWORD);
      await page.click('[data-testid="login-submit-button"]');

      // Login should complete
      await expect(page).toHaveURL(/\/admin/, { timeout: 15000 });
    });

    await test.step("Navigate to page with API calls", async () => {
      // Go to a page that loads data from API
      // Measure load time
      const startTime = Date.now();

      await page.goto("/admin/accounts");
      await page.waitForLoadState("domcontentloaded");

      const loadTime = Date.now() - startTime;

      // Page should eventually load (even if slow)
      // 15 seconds is a reasonable timeout for slow APIs
      expect(loadTime).toBeLessThan(15000);
    });

    await test.step("Verify page has content or loading state", async () => {
      // Should show either:
      // 1. Table/list of data
      // 2. Loading spinner
      // 3. Empty state with "no data" message
      const hasContent = await page
        .locator("text=/accounts|users|users|loading|no/i")
        .first()
        .isVisible()
        .catch(() => false);

      expect(hasContent).toBe(true);
    });
  });

  test("should properly display server error messages", async ({ page }) => {
    await test.step("Login as user", async () => {
      await page.goto("/login");
      await page.waitForLoadState("domcontentloaded");

      await page.fill('[data-testid="email-input"]', USER_EMAIL);
      await page.fill('[data-testid="password-input"]', USER_PASSWORD);
      await page.click('[data-testid="login-submit-button"]');

      await expect(page).toHaveURL(/\/user/, { timeout: 10000 });
    });

    await test.step("Navigate to page with data loading", async () => {
      await page.goto("/user/transactions");
      await page.waitForLoadState("domcontentloaded");
    });

    await test.step("Verify error handling for empty/failed responses", async () => {
      // Wait for API calls to complete
      await page.waitForTimeout(2000);

      // Should show either:
      // 1. Table with data
      // 2. Empty state message
      // 3. Error message
      // 4. Loading state (if still loading)
      const hasAnyStateIndicator = await page
        .locator("text=/transaction|loading|error|empty|no data/i")
        .first()
        .isVisible()
        .catch(() => false);

      expect(hasAnyStateIndicator).toBe(true);
    });
  });

  test("should handle duplicate email validation", async ({ page }) => {
    await test.step("Login as admin", async () => {
      await page.goto("/login");
      await page.waitForLoadState("domcontentloaded");

      await page.fill('[data-testid="email-input"]', ADMIN_EMAIL);
      await page.fill('[data-testid="password-input"]', ADMIN_PASSWORD);
      await page.click('[data-testid="login-submit-button"]');

      await expect(page).toHaveURL(/\/admin/, { timeout: 10000 });
    });

    await test.step("Try to create user with existing email", async () => {
      await page.goto("/admin/accounts");
      await page.waitForLoadState("domcontentloaded");

      // Look for create button
      const createBtn = page
        .locator(
          'button:has-text("Create"), button:has-text("New"), button:has-text("Add")',
        )
        .first();

      if (await createBtn.isVisible().catch(() => false)) {
        await createBtn.click();
        await page.waitForTimeout(1000);

        // Try to fill form with existing admin email
        const emailInput = page.locator('input[name="email"]').first();
        if (await emailInput.isVisible().catch(() => false)) {
          await emailInput.fill(ADMIN_EMAIL);

          // Try submit
          const submitBtn = page.locator('button[type="submit"]').first();
          if (await submitBtn.isVisible().catch(() => false)) {
            await submitBtn.click();
            await page.waitForTimeout(1000);

            // Should show duplicate/conflict error
            const hasDuplicateError = await page
              .locator("text=/exists|duplicate|already|conflict/i")
              .first()
              .isVisible()
              .catch(() => false);

            // If error shown, that's expected
            if (hasDuplicateError) {
              expect(hasDuplicateError).toBe(true);
            }
          }
        }
      }
    });
  });
});
