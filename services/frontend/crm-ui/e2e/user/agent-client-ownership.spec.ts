import { test, expect, type Page } from "@playwright/test";
import { gotoWithNetworkRetry, setAuthState } from "../helpers/auth";

async function setupAgentOwnershipMocks(page: Page) {
  await page.route("**/api/**", async route => {
    const method = route.request().method();
    const path = new URL(route.request().url()).pathname;

    if (path === "/api/users/me" && method === "GET") {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          id: "user-1",
          firstName: "Agent",
          lastName: "One",
          email: "agent@example.com",
          role: "user",
          status: "active",
        }),
      });
    }

    if (path === "/api/clients" && method === "GET") {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: [
            {
              clientId: "clt_own",
              firstName: "Owned",
              lastName: "Client",
              dateOfBirth: "1990-01-01",
              gender: "Female",
              emailAddress: "owned@example.com",
              phoneNumber: "+65 1111 1111",
              address: "1 Main St",
              city: "SG",
              state: "SG",
              country: "Singapore",
              postalCode: "123456",
              identityVerificationStatus: "verified",
              clientStatus: "active",
            },
          ],
          pagination: { limit: 100, offset: 0, total: 1 },
        }),
      });
    }

    if (path === "/api/clients/clt_own/transactions" && method === "GET") {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: [
            {
              id: "txn_own_1",
              clientId: "clt_own",
              transaction: "D",
              amount: 100,
              date: "2026-04-01T00:00:00Z",
              status: "Completed",
            },
          ],
          pagination: { limit: 100, offset: 0, total: 1 },
        }),
      });
    }

    if (path === "/api/clients/clt_other/transactions" && method === "GET") {
      return route.fulfill({
        status: 403,
        contentType: "application/json",
        body: JSON.stringify({
          error: "forbidden",
          message: "Access denied",
        }),
      });
    }

    return route.fulfill({
      status: 404,
      contentType: "application/json",
      body: JSON.stringify({
        error: "not_found",
        message: `No mock configured for ${method} ${path}`,
      }),
    });
  });
}

test.describe("Agent Ownership Access", () => {
  test.beforeEach(async ({ page, context }) => {
    await context.clearCookies();
    await page.unrouteAll({ behavior: "ignoreErrors" });
  });

  test("agent cannot access non-owned client transactions and sees guidance", async ({ page }) => {
    await setupAgentOwnershipMocks(page);
    await gotoWithNetworkRetry(page, "/login");
    await setAuthState(page, "user");

    await gotoWithNetworkRetry(page, "/user/transactions");
    await expect(page.getByRole("heading", { name: "Transactions" })).toBeVisible();

    await page.getByPlaceholder("clt_..").fill("clt_other");

    await expect(
      page.getByText(
        "Access denied for selected client. You can only view transactions for your assigned clients."
      )
    ).toBeVisible();
    await expect(page.getByText("No transactions found")).toBeVisible();
  });
});
