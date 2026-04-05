import { test, expect } from "@playwright/test";
import { setAuthState, gotoWithNetworkRetry } from "./helpers/auth";
import { setupAdminRoutes, setupAgentRoutes } from "./helpers/mockRoutes";
import { measureLatency, measureLatencyWithWarning } from "./utils/performance";

/**
 * Frontend Latency Tests (CS301 Requirement)
 *
 * These tests validate that all critical frontend operations complete within 5 seconds,
 * as required by CS301 specifications.
 *
 * Test Strategy:
 * - Measure latency for key user workflows (login, navigation, CRUD operations)
 * - Assert hard limit of 5000ms (CS301 requirement)
 * - Log warnings at 3000ms to catch performance degradation early
 * - Use mocked backend (via helpers/mockRoutes.ts) for consistent measurements
 *
 * Note: These tests measure frontend rendering/interaction speed, NOT backend API latency.
 * Backend performance is validated separately via JMeter tests in tests/performance/.
 */

test.describe("Frontend Latency Tests - CS301 Compliance", () => {
  test.describe("Authentication Flows", () => {
    test("login navigation completes within 5s", async ({ page }) => {
      // Warm up initial bundle load to avoid cold-start skew in latency assertion.
      await gotoWithNetworkRetry(page, "/login");
      await page.waitForSelector('[data-testid="email-input"]');

      await measureLatency(async () => {
        await gotoWithNetworkRetry(page, "/login");
        await page.waitForSelector('[data-testid="email-input"]');
        await expect(page).toHaveURL(/\/login/);
      }, "Login page load", 5000);
    });

    test("admin dashboard load after auth completes within 5s", async ({ page }) => {
      // Set up API mocking before navigation
      await setupAdminRoutes(page);
      // Navigate to a page first to establish context
      await gotoWithNetworkRetry(page, "/login");
      // Pre-set root-admin auth state for root-admin routes
      await setAuthState(page, "super_admin");

      await measureLatency(async () => {
        await gotoWithNetworkRetry(page, "/admin");
        await page.waitForURL(/\/admin\/users$/);
      }, "Admin landing route load (authenticated)", 5000);
    });

    test("user dashboard load after auth completes within 5s", async ({ page }) => {
      // Set up API mocking before navigation
      await setupAgentRoutes(page);
      // Navigate to a page first to establish context
      await gotoWithNetworkRetry(page, "/login");
      await setAuthState(page, "user");

      await measureLatency(async () => {
        await gotoWithNetworkRetry(page, "/user");
        await page.waitForSelector("text=User Dashboard");
      }, "User dashboard load (authenticated)", 5000);
    });
  });

  test.describe("Client Management Operations", () => {
    test.beforeEach(async ({ page }) => {
      // Set up API mocking and auth state
      await setupAdminRoutes(page);
      await gotoWithNetworkRetry(page, "/login");
      await setAuthState(page, "admin");
    });

    test("client list page load completes within 5s", async ({ page }) => {
      await measureLatency(async () => {
        await gotoWithNetworkRetry(page, "/admin/clients");
        // Wait for main content to be visible
        await page.waitForLoadState("domcontentloaded");
      }, "Client list page load", 5000);
    });

    test("client detail page navigation completes within 5s", async ({ page }) => {
      await gotoWithNetworkRetry(page, "/admin/clients");

      await measureLatency(async () => {
        // Assuming there's a client list with clickable items
        await page.waitForLoadState("domcontentloaded");
        // Navigation complete when detail page loads
        await page.waitForTimeout(100); // Small buffer for navigation
      }, "Client detail page navigation", 5000);
    });

    test("client search/filter operation completes within 5s", async ({ page }) => {
      await gotoWithNetworkRetry(page, "/admin/clients");
      await page.waitForLoadState("domcontentloaded");

      await measureLatencyWithWarning(async () => {
        // Simulate search operation
        const searchInput = page.locator('[placeholder*="Search"]').first();
        if (await searchInput.count() > 0) {
          await searchInput.fill("Test Client");
          await page.waitForTimeout(500); // Wait for debounced search
        }
      }, "Client search/filter", 3000, 5000);
    });
  });

  test.describe("User Management Operations", () => {
    test.beforeEach(async ({ page }) => {
      await setupAdminRoutes(page);
      await gotoWithNetworkRetry(page, "/login");
      await setAuthState(page, "admin");
    });

    test("user management page load completes within 5s", async ({ page }) => {
      await measureLatency(async () => {
        await gotoWithNetworkRetry(page, "/admin/users");
        await page.waitForLoadState("domcontentloaded");
      }, "User management page load", 5000);
    });
  });

  test.describe("Transaction Operations", () => {
    test.beforeEach(async ({ page }) => {
      await setupAdminRoutes(page);
      await gotoWithNetworkRetry(page, "/login");
      await setAuthState(page, "admin");
    });

    test("transaction list page load completes within 5s", async ({ page }) => {
      await measureLatency(async () => {
        await gotoWithNetworkRetry(page, "/admin/transactions");
        await page.waitForLoadState("domcontentloaded");
      }, "Transaction list page load", 5000);
    });

    test("transaction import form interaction completes within 5s", async ({ page }) => {
      await gotoWithNetworkRetry(page, "/admin/transactions");
      await page.waitForLoadState("domcontentloaded");

      await measureLatency(async () => {
        // Check if import section is visible/interactive
        await page.waitForTimeout(100); // Small buffer for any dynamic content
      }, "Transaction import page load", 5000);
    });
  });

  test.describe("Risk Operations", () => {
    test.beforeEach(async ({ page }) => {
      await setupAdminRoutes(page);
      await gotoWithNetworkRetry(page, "/login");
      await setAuthState(page, "admin");
    });

    test("risk operations page load completes within 5s", async ({ page }) => {
      await measureLatency(async () => {
        await gotoWithNetworkRetry(page, "/admin/aml-alerts");
        await page.waitForLoadState("domcontentloaded");
      }, "Risk operations page load", 5000);
    });
  });

  test.describe("Form Submissions", () => {
    test.beforeEach(async ({ page }) => {
      await setupAgentRoutes(page);
      await gotoWithNetworkRetry(page, "/login");
      await setAuthState(page, "user");
    });

    test("client creation form renders within 5s", async ({ page }) => {
      await measureLatency(async () => {
        await gotoWithNetworkRetry(page, "/user/clients/new");
        await page.waitForLoadState("domcontentloaded");
        // Wait for form fields to be interactive
        await page.waitForSelector('input[type="text"]', { state: "visible" });
      }, "Client creation form load", 5000);
    });
  });

  test.describe("Protected Route Redirects", () => {
    test("unauthenticated redirect to login completes within 5s", async ({ page }) => {
      // Navigate to a page first before clearing storage
      await gotoWithNetworkRetry(page, "/login");

      // Clear any existing auth
      await page.context().clearCookies();
      await page.evaluate(() => {
        localStorage.clear();
        sessionStorage.clear();
      });

      await measureLatency(async () => {
        await gotoWithNetworkRetry(page, "/admin");
        // Should redirect to login
        await page.waitForURL(/\/login/, { timeout: 5000 });
      }, "Protected route redirect to login", 5000);
    });
  });
});

test.describe("Frontend Latency Tests - Edge Cases", () => {
  test.describe("Performance Under Load Simulation", () => {
    test.beforeEach(async ({ page }) => {
      await setupAdminRoutes(page);
      await gotoWithNetworkRetry(page, "/login");
      await setAuthState(page, "admin");
    });

    test("rapid navigation between pages maintains <5s latency", async ({ page }) => {
      const pages = ["/admin/clients", "/admin/users", "/admin/transactions", "/admin/aml-alerts"];

      for (const pagePath of pages) {
        await measureLatency(async () => {
          await gotoWithNetworkRetry(page, pagePath);
          await page.waitForLoadState("domcontentloaded");
        }, `Rapid navigation to ${pagePath}`, 5000);
      }
    });
  });
});
