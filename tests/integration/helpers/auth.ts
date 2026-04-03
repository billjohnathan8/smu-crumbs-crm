import { Page } from "@playwright/test";

import { requireE2eEnv } from "./e2eEnv.js";

const ADMIN_EMAIL = (process.env.E2E_ADMIN_EMAIL ?? "admin@crm.com").trim();
const ADMIN_PASSWORD = requireE2eEnv("E2E_ADMIN_PASSWORD");
const AGENT_EMAIL = (process.env.E2E_USER_EMAIL ?? "agent1@crm.com").trim();
const AGENT_PASSWORD = requireE2eEnv("E2E_USER_PASSWORD");

/**
 * Login as admin user and wait for dashboard
 */
export async function loginAsAdmin(page: Page) {
  await page.goto("/login");

  // Clear storage to ensure clean state
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

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
  await page.goto("/login");

  // Clear storage to ensure clean state
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

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

  await page.evaluate(
    ({ user, token }) => {
      localStorage.setItem("authToken", token);
      localStorage.setItem("currentUser", JSON.stringify(user));
    },
    { user, token: `mock-${role}-token` },
  );
}
