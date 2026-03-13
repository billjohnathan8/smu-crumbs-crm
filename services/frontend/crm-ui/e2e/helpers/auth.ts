import { Page } from "@playwright/test";

/**
 * Retry navigation once when Chromium reports transient network-change errors.
 */
export async function gotoWithNetworkRetry(
  page: Page,
  path: string,
  maxAttempts = 2,
) {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      await page.goto(path, { waitUntil: "domcontentloaded" });
      return;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const isNetworkChanged = message.includes("ERR_NETWORK_CHANGED");
      const isLastAttempt = attempt === maxAttempts - 1;

      if (!isNetworkChanged || isLastAttempt) {
        throw error;
      }
    }
  }
}

/**
 * Login as admin user and wait for dashboard
 */
export async function loginAsAdmin(page: Page) {
  await gotoWithNetworkRetry(page, "/login");

  // Clear storage to ensure clean state
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  await page.waitForLoadState("domcontentloaded");

  await page.fill('[data-testid="email-input"]', "admin@example.com");
  await page.fill('[data-testid="password-input"]', "password123");
  await page.click('[data-testid="login-submit-button"]');

  // Wait for redirect to admin dashboard
  await page.waitForURL("**/admin", { timeout: 5000 });
  await page.waitForSelector("text=Admin Dashboard", { timeout: 5000 });
}

/**
 * Login as agent user and wait for dashboard
 */
export async function loginAsAgent(page: Page) {
  await gotoWithNetworkRetry(page, "/login");

  // Clear storage to ensure clean state
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  await page.waitForLoadState("domcontentloaded");

  await page.fill('[data-testid="email-input"]', "agent@example.com");
  await page.fill('[data-testid="password-input"]', "password123");
  await page.click('[data-testid="login-submit-button"]');

  // Wait for redirect to agent dashboard
  await page.waitForURL("**/agent", { timeout: 5000 });
  await page.waitForSelector("text=Agent Dashboard", { timeout: 5000 });
}

/**
 * Set up localStorage with auth state without going through login flow
 * Useful for tests that need to start already authenticated
 */
export async function setAuthState(page: Page, role: "admin" | "agent") {
  const user = {
    id: role === "admin" ? "admin-1" : "agent-1",
    firstName: role === "admin" ? "Admin" : "Agent",
    lastName: "User",
    email: `${role}@example.com`,
    role,
    status: "active",
  };

  await page.evaluate(
    ({ user, token }) => {
      localStorage.setItem("authToken", token);
      localStorage.setItem("currentUser", JSON.stringify(user));
    },
    { user, token: `mock-${role}-token` },
  );
}
