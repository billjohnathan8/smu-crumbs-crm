import { Page } from "@playwright/test";

const ADMIN_EMAIL = (process.env.E2E_ADMIN_EMAIL ?? "admin@crm.com").trim();
const ADMIN_PASSWORD = (process.env.E2E_ADMIN_PASSWORD ?? "Scrooge@Bank2026!").trim();
const AGENT_EMAIL = (process.env.E2E_USER_EMAIL ?? "agent1@crm.com").trim();
const AGENT_PASSWORD = (process.env.E2E_USER_PASSWORD ?? "UserPass123!").trim();

async function clearBrowserStorage(page: Page) {
  const clear = async () => {
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    });
  };

  try {
    await clear();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const isStorageAccessError =
      message.includes("SecurityError") ||
      message.includes("localStorage") ||
      message.includes("Access is denied");

    if (!isStorageAccessError) throw error;

    await gotoWithNetworkRetry(page, "/login");
    await clear();
  }
}

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
  await clearBrowserStorage(page);

  await page.waitForLoadState("domcontentloaded");

  await page.fill('[data-testid="email-input"]', ADMIN_EMAIL);
  await page.fill('[data-testid="password-input"]', ADMIN_PASSWORD);
  await page.click('[data-testid="login-submit-button"]');

  // Wait for redirect to admin dashboard
  await page.waitForURL("**/admin", { timeout: 5000 });
  await page.waitForSelector("text=Admin Dashboard", { timeout: 5000 });
}

/**
 * Login as user and wait for dashboard
 */
export async function loginAsAgent(page: Page) {
  await gotoWithNetworkRetry(page, "/login");

  // Clear storage to ensure clean state
  await clearBrowserStorage(page);

  await page.waitForLoadState("domcontentloaded");

  await page.fill('[data-testid="email-input"]', AGENT_EMAIL);
  await page.fill('[data-testid="password-input"]', AGENT_PASSWORD);
  await page.click('[data-testid="login-submit-button"]');

  // Wait for redirect to user dashboard
  await page.waitForURL("**/user", { timeout: 5000 });
  await page.waitForSelector("text=User Dashboard", { timeout: 5000 });
}

/**
 * Set up localStorage with auth state without going through login flow
 * Useful for tests that need to start already authenticated
 */
export async function setAuthState(page: Page, role: "admin" | "user") {
  const user = {
    id: role === "admin" ? "admin-1" : "user-1",
    firstName: role === "admin" ? "Admin" : "User",
    lastName: "User",
    email: `${role}@example.com`,
    role,
    status: "active",
  };

  const payload = { user, token: `mock-${role}-token` };

  // Ensure future navigations are authenticated without needing a bootstrap page.
  await page.addInitScript(({ user, token }) => {
    localStorage.setItem("authToken", token);
    localStorage.setItem("currentUser", JSON.stringify(user));
  }, payload);

  const setState = async () => {
    await page.evaluate(
      ({ user, token }) => {
        localStorage.setItem("authToken", token);
        localStorage.setItem("currentUser", JSON.stringify(user));
      },
      payload,
    );
  };

  try {
    await setState();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const isStorageAccessError =
      message.includes("SecurityError") ||
      message.includes("localStorage") ||
      message.includes("Access is denied");

    if (!isStorageAccessError) throw error;

    if (page.url() === "about:blank") {
      return;
    }

    await gotoWithNetworkRetry(page, "/login");
    await setState();
  }
}
