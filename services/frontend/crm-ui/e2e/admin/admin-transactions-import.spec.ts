import { test, expect, Route } from "@playwright/test";
import { gotoWithNetworkRetry, setAuthState } from "../helpers/auth";
import { setupAdminRoutes } from "../helpers/mockRoutes";

test.describe("Admin Transactions Import", () => {
  test.beforeEach(async ({ page, context }) => {
    await context.clearCookies();
    // Clear all route handlers to prevent accumulation across tests
    await page.unrouteAll({ behavior: 'ignoreErrors' });
    await setupAdminRoutes(page);
    await gotoWithNetworkRetry(page, "/login");
    await setAuthState(page, "super_admin");
  });

  test("should start an import and display batch status history", async ({ page }) => {
    await test.step("Set up import routes", async () => {
      await page.route("**/api/**", async (route: Route) => {
        const url = route.request().url();
        const method = route.request().method();

        if (
          url.includes("/@vite") ||
          url.includes("/@fs") ||
          url.includes("/@id") ||
          url.includes(".js") ||
          url.includes(".ts") ||
          url.includes(".jsx") ||
          url.includes(".tsx") ||
          url.includes(".css")
        ) {
          return route.continue();
        }

        if (url.includes("/api/users/me")) {
          return route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({
              id: "usr_1",
              firstName: "Root",
              lastName: "User",
              email: "admin@crm.com",
              role: "super_admin",
              status: "active",
            }),
          });
        }

        if (url.includes("/api/transactions/imports/imp_1") && method === "GET") {
          return route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({
              importBatchId: "imp_1",
              status: "completed",
              requestedClientId: null,
              requestedAt: "2026-03-20T12:00:00Z",
              startedAt: "2026-03-20T12:00:01Z",
              finishedAt: "2026-03-20T12:00:03Z",
              totalRecords: 12,
              importedRecords: 12,
              failedRecords: 0,
              errorMessage: null,
            }),
          });
        }

        if (url.includes("/api/transactions/import") && method === "POST") {
          return route.fulfill({
            status: 202,
            contentType: "application/json",
            body: JSON.stringify({
              importBatchId: "imp_1",
              status: "running",
              requestedClientId: null,
              requestedAt: "2026-03-20T12:00:00Z",
              startedAt: "2026-03-20T12:00:01Z",
              finishedAt: null,
              totalRecords: 0,
              importedRecords: 0,
              failedRecords: 0,
              errorMessage: null,
            }),
          });
        }

        if (url.includes("/api/transactions") && method === "GET") {
          return route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({
              data: [
                {
                  id: "txn-100",
                  clientId: "client-100",
                  transaction: "D",
                  amount: 1200,
                  date: "2026-03-20T12:00:00Z",
                  status: "Completed",
                },
              ],
              pagination: { limit: 20, offset: 0, total: 1 },
            }),
          });
        }

        return route.fulfill({
          status: 404,
          contentType: "application/json",
          body: JSON.stringify({ error: "not_found" }),
        });
      });
    });

    await test.step("Navigate to admin transactions", async () => {
      await page.goto("/admin/transactions");
      await page.waitForLoadState("domcontentloaded");
      await expect(page.getByText("Transaction Import")).toBeVisible();
    });

    await test.step("Start import from page", async () => {
      await page.click('button:has-text("Start Import")');
      await expect(page.getByText(/Import batch imp_1 started/i)).toBeVisible();
    });

    await test.step("Verify batch appears in history with terminal status", async () => {
      const importPanel = page.getByTestId("transaction-import-panel");
      await expect(importPanel.getByRole("cell", { name: "imp_1" })).toBeVisible();
      await expect(importPanel.getByText("completed")).toBeVisible();
      await expect(importPanel.getByText("12/12")).toBeVisible();
    });
  });

  test("should surface failed import state", async ({ page }) => {
    await test.step("Set up failing import routes", async () => {
      await page.route("**/api/**", async (route: Route) => {
        const url = route.request().url();
        const method = route.request().method();

        if (
          url.includes("/@vite") ||
          url.includes("/@fs") ||
          url.includes("/@id") ||
          url.includes(".js") ||
          url.includes(".ts") ||
          url.includes(".jsx") ||
          url.includes(".tsx") ||
          url.includes(".css")
        ) {
          return route.continue();
        }

        if (url.includes("/api/users/me")) {
          return route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({
              id: "usr_1",
              firstName: "Root",
              lastName: "User",
              email: "admin@crm.com",
              role: "super_admin",
              status: "active",
            }),
          });
        }

        if (url.includes("/api/transactions/imports/imp_2") && method === "GET") {
          return route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({
              importBatchId: "imp_2",
              status: "failed",
              requestedClientId: "clt_500",
              requestedAt: "2026-03-20T14:00:00Z",
              startedAt: "2026-03-20T14:00:01Z",
              finishedAt: "2026-03-20T14:00:03Z",
              totalRecords: 7,
              importedRecords: 2,
              failedRecords: 5,
              errorMessage: "Unable to parse 5 records",
            }),
          });
        }

        if (url.includes("/api/transactions/import") && method === "POST") {
          return route.fulfill({
            status: 202,
            contentType: "application/json",
            body: JSON.stringify({
              importBatchId: "imp_2",
              status: "failed",
              requestedClientId: "clt_500",
              requestedAt: "2026-03-20T14:00:00Z",
              startedAt: "2026-03-20T14:00:01Z",
              finishedAt: "2026-03-20T14:00:03Z",
              totalRecords: 7,
              importedRecords: 2,
              failedRecords: 5,
              errorMessage: "Unable to parse 5 records",
            }),
          });
        }

        if (url.includes("/api/transactions") && method === "GET") {
          return route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({
              data: [],
              pagination: { limit: 20, offset: 0, total: 0 },
            }),
          });
        }

        return route.fulfill({
          status: 404,
          contentType: "application/json",
          body: JSON.stringify({ error: "not_found" }),
        });
      });
    });

    await test.step("Navigate and trigger failed import", async () => {
      await page.goto("/admin/transactions");
      await page.waitForLoadState("domcontentloaded");
      await page.fill('input[placeholder="Import for one client"]', "clt_500");
      await page.click('button:has-text("Start Import")');
    });

    await test.step("Verify failure notice and history row", async () => {
      const importPanel = page.getByTestId("transaction-import-panel");
      await expect(
        importPanel.locator("p", { hasText: "Unable to parse 5 records" }),
      ).toBeVisible();
      await expect(importPanel.getByRole("cell", { name: "imp_2" })).toBeVisible();
      await expect(importPanel.locator("tbody span", { hasText: "failed" })).toBeVisible();
      await expect(importPanel.getByText("2/7")).toBeVisible();
    });
  });
});
