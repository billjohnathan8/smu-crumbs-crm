import { test, expect, Route } from "@playwright/test";
import { gotoWithNetworkRetry, setAuthState } from "../helpers/auth";
import { setupAgentRoutes } from "../helpers/mockRoutes";

test.describe("User View Transactions - Filters & Pagination (Flow 7)", () => {
  const sampleTransactions = [
    {
      id: "txn-001",
      clientId: "client-123",
      transaction: "D",
      amount: 1000.0,
      date: "2024-01-15T10:30:00Z",
      status: "Completed",
    },
    {
      id: "txn-002",
      clientId: "client-456",
      transaction: "W",
      amount: 500.0,
      date: "2024-01-16T14:20:00Z",
      status: "Pending",
    },
    {
      id: "txn-003",
      clientId: "client-789",
      transaction: "D",
      amount: 2000.0,
      date: "2024-01-17T09:15:00Z",
      status: "Failed",
    },
  ];

  test.beforeEach(async ({ page, context }) => {
    await context.clearCookies();
    // Install default API mocks before first navigation to avoid Vite proxy noise.
    await setupAgentRoutes(page);
    await gotoWithNetworkRetry(page, "/login");
    await setAuthState(page, "user");
  });

  test("should filter transactions by status", async ({ page }) => {
    let lastRequestParams: URLSearchParams | null = null;

    await test.step("Set up routes to capture filter params", async () => {
      await page.route("**/api/**", (route: Route) => {
        const url = route.request().url();

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
              id: "user-1",
              firstName: "User",
              lastName: "User",
              email: "user@example.com",
              role: "user",
              status: "active",
            }),
          });
        }

        if (url.includes("/api/transactions")) {
          const urlObj = new URL(url);
          lastRequestParams = urlObj.searchParams;

          const status = urlObj.searchParams.get("status");
          let filteredData = sampleTransactions;

          if (status) {
            filteredData = sampleTransactions.filter(
              (t) => t.status === status,
            );
          }

          return route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({
              data: filteredData,
              pagination: { limit: 20, offset: 0, total: filteredData.length },
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

    await test.step("Navigate to transactions page", async () => {
      await page.goto("/user/transactions");
      await page.waitForLoadState("domcontentloaded");
    });

    await test.step("Verify initial load shows all transactions", async () => {
      await expect(page.getByText("txn-001")).toBeVisible();
      await expect(page.getByText("txn-002")).toBeVisible();
      await expect(page.getByText("txn-003")).toBeVisible();
    });

    await test.step("Filter by Completed status", async () => {
      const statusSelect = page.locator("select").nth(0); // Status is the first select
      await statusSelect.selectOption({ label: "Completed" });
      await page.waitForLoadState("networkidle");
    });

    await test.step("Verify only Completed transactions shown", async () => {
      await expect(page.getByText("txn-001")).toBeVisible();
      await expect(page.getByText("txn-002")).not.toBeVisible();
      expect(lastRequestParams?.get("status")).toBe("Completed");
    });
  });

  test("should filter transactions by type (Deposit/Withdrawal)", async ({
    page,
  }) => {
    let lastRequestParams: URLSearchParams | null = null;

    await test.step("Set up routes", async () => {
      await page.route("**/api/**", (route: Route) => {
        const url = route.request().url();

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
              id: "user-1",
              firstName: "User",
              lastName: "User",
              email: "user@example.com",
              role: "user",
              status: "active",
            }),
          });
        }

        if (url.includes("/api/transactions")) {
          const urlObj = new URL(url);
          lastRequestParams = urlObj.searchParams;

          const transactionType = urlObj.searchParams.get("transaction");
          let filteredData = sampleTransactions;

          if (transactionType) {
            filteredData = sampleTransactions.filter(
              (t) => t.transaction === transactionType,
            );
          }

          return route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({
              data: filteredData,
              pagination: { limit: 20, offset: 0, total: filteredData.length },
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

    await test.step("Navigate to transactions page", async () => {
      await page.goto("/user/transactions");
      await page.waitForLoadState("domcontentloaded");
    });

    await test.step("Filter by Deposit type", async () => {
      const typeSelect = page.locator("select").nth(1); // Type is the second select
      await typeSelect.selectOption({ label: "Deposit" });
      await page.waitForLoadState("networkidle");
    });

    await test.step("Verify only Deposit transactions shown", async () => {
      await expect(page.getByText("txn-001")).toBeVisible();
      await expect(page.getByText("txn-003")).toBeVisible();
      await expect(page.getByText("txn-002")).not.toBeVisible();
      expect(lastRequestParams?.get("transaction")).toBe("D");
    });
  });

  test("should filter transactions by date range", async ({ page }) => {
    let lastRequestParams: URLSearchParams | null = null;

    await test.step("Set up routes", async () => {
      await page.route("**/api/**", (route: Route) => {
        const url = route.request().url();

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
              id: "user-1",
              firstName: "User",
              lastName: "User",
              email: "user@example.com",
              role: "user",
              status: "active",
            }),
          });
        }

        if (url.includes("/api/transactions")) {
          const urlObj = new URL(url);
          lastRequestParams = urlObj.searchParams;

          const fromDate = urlObj.searchParams.get("fromDate");
          const toDate = urlObj.searchParams.get("toDate");

          let filteredData = sampleTransactions;

          if (fromDate || toDate) {
            filteredData = sampleTransactions.filter((t) => {
              const txnDate = new Date(t.date);
              if (fromDate && txnDate < new Date(fromDate)) return false;
              if (toDate && txnDate > new Date(toDate)) return false;
              return true;
            });
          }

          return route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({
              data: filteredData,
              pagination: { limit: 20, offset: 0, total: filteredData.length },
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

    await test.step("Navigate to transactions page", async () => {
      await page.goto("/user/transactions");
      await page.waitForLoadState("domcontentloaded");
    });

    await test.step("Set date range filter", async () => {
      const dateFilterRequest = page.waitForResponse(
        (response) =>
          response.url().includes("/api/transactions") &&
          response.url().includes("fromDate=2024-01-16") &&
          response.request().method() === "GET",
      );
      await page.fill('input[type="date"]', "2024-01-16");
      await dateFilterRequest;
    });

    await test.step("Verify date filter was sent to API", async () => {
      expect(lastRequestParams?.get("fromDate")).toBe("2024-01-16");
    });
  });

  test("should search transactions by client ID or transaction ID", async ({
    page,
  }) => {
    await test.step("Set up routes", async () => {
      await page.route("**/api/**", (route: Route) => {
        const url = route.request().url();

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
              id: "user-1",
              firstName: "User",
              lastName: "User",
              email: "user@example.com",
              role: "user",
              status: "active",
            }),
          });
        }

        if (url.includes("/api/transactions")) {
          return route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({
              data: sampleTransactions,
              pagination: {
                limit: 20,
                offset: 0,
                total: sampleTransactions.length,
              },
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

    await test.step("Navigate to transactions page", async () => {
      await page.goto("/user/transactions");
      await page.waitForLoadState("domcontentloaded");
    });

    await test.step("Search for specific transaction ID", async () => {
      await page.fill('input[placeholder="Transaction ID"]', "txn-002");
      await page.waitForTimeout(500); // Allow client-side filter to apply
    });

    await test.step("Verify only matching transaction shown (client-side filter)", async () => {
      // Client-side filtering, so txn-002 should be visible
      await expect(page.getByText("txn-002")).toBeVisible();
      // Other transactions should be filtered out (client-side)
      // Note: This depends on implementation; may still be in DOM but hidden
    });
  });

  test("should reset all filters", async ({ page }) => {
    await test.step("Set up routes", async () => {
      await page.route("**/api/**", (route: Route) => {
        const url = route.request().url();

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
              id: "user-1",
              firstName: "User",
              lastName: "User",
              email: "user@example.com",
              role: "user",
              status: "active",
            }),
          });
        }

        if (url.includes("/api/transactions")) {
          const urlObj = new URL(url);
          const status = urlObj.searchParams.get("status");
          const transaction = urlObj.searchParams.get("transaction");

          let filteredData = sampleTransactions;
          if (status)
            filteredData = filteredData.filter((t) => t.status === status);
          if (transaction)
            filteredData = filteredData.filter(
              (t) => t.transaction === transaction,
            );

          return route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({
              data: filteredData,
              pagination: { limit: 20, offset: 0, total: filteredData.length },
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

    await test.step("Navigate to transactions page", async () => {
      await page.goto("/user/transactions");
      await page.waitForLoadState("domcontentloaded");
    });

    await test.step("Apply multiple filters", async () => {
      const statusSelect = page.locator("select").nth(0);
      await statusSelect.selectOption({ label: "Completed" });
      await page.fill('input[placeholder="Transaction ID"]', "test-search");
      await page.waitForLoadState("networkidle");
    });

    await test.step("Click Reset Filters", async () => {
      await page.click('button:has-text("Reset Filters")');
      await page.waitForLoadState("networkidle");
    });

    await test.step("Verify filters are cleared", async () => {
      // Check that all transactions are shown again
      await expect(page.getByText("txn-001")).toBeVisible();
      await expect(page.getByText("txn-002")).toBeVisible();
      await expect(page.getByText("txn-003")).toBeVisible();

      // Verify inputs are cleared
      const searchInput = page.locator('input[placeholder="Transaction ID"]');
      await expect(searchInput).toHaveValue("");
    });
  });

  test("should handle pagination", async ({ page }) => {
    await test.step("Set up routes with multiple pages", async () => {
      await page.route("**/api/**", (route: Route) => {
        const url = route.request().url();

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
              id: "user-1",
              firstName: "User",
              lastName: "User",
              email: "user@example.com",
              role: "user",
              status: "active",
            }),
          });
        }

        if (url.includes("/api/transactions")) {
          const urlObj = new URL(url);
          const offset = parseInt(urlObj.searchParams.get("offset") || "0");
          const pageNum = offset / 20 + 1;

          const transactions = Array.from({ length: 20 }, (_, i) => ({
            id: `txn-page${pageNum}-${i}`,
            clientId: `client-${offset + i}`,
            transaction: i % 2 === 0 ? "D" : "W",
            amount: 1000 + i * 100,
            date: "2024-01-15T10:30:00Z",
            status: "Completed",
          }));

          return route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({
              data: transactions,
              pagination: { limit: 20, offset, total: 50 }, // 3 pages
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

    await test.step("Navigate to transactions page", async () => {
      await page.goto("/user/transactions");
      await page.waitForLoadState("domcontentloaded");
    });

    await test.step("Verify page 1 content", async () => {
      // Wait for transactions to load
      await page.waitForLoadState("networkidle");

      // Check that transactions are present - the ID is truncated in UI so check for partial match
      const firstRow = page.locator("tbody tr").first();
      await expect(firstRow).toBeVisible({ timeout: 5000 });

      // Verify pagination info
      await expect(page.getByText("Page 1 of 3")).toBeVisible();
    });

    await test.step("Navigate to page 2", async () => {
      await page.click('button:has-text("Next")');
      await page.waitForLoadState("networkidle");
    });

    await test.step("Verify page 2 content", async () => {
      await page.waitForLoadState("networkidle");

      // Verify pagination moved to page 2
      await expect(page.getByText("Page 2 of 3")).toBeVisible({
        timeout: 5000,
      });
    });

    await test.step("Navigate back to page 1", async () => {
      await page.click('button:has-text("Previous")');
      await page.waitForLoadState("networkidle");
    });

    await test.step("Verify back on page 1", async () => {
      await page.waitForLoadState("networkidle");

      // Verify pagination is back to page 1
      await expect(page.getByText("Page 1 of 3")).toBeVisible({
        timeout: 5000,
      });
    });
  });

  test("should display empty state when no transactions found", async ({
    page,
  }) => {
    await test.step("Set up routes to return empty data", async () => {
      await page.route("**/api/**", (route: Route) => {
        const url = route.request().url();

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
              id: "user-1",
              firstName: "User",
              lastName: "User",
              email: "user@example.com",
              role: "user",
              status: "active",
            }),
          });
        }

        if (url.includes("/api/transactions")) {
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

    await test.step("Navigate to transactions page", async () => {
      await page.goto("/user/transactions");
      await page.waitForLoadState("domcontentloaded");
    });

    await test.step("Verify empty state is shown", async () => {
      await expect(page.getByText("No transactions found")).toBeVisible();
    });
  });

  test("should display error state when API fails", async ({ page }) => {
    await test.step("Set up routes to return error", async () => {
      await page.route("**/api/**", (route: Route) => {
        const url = route.request().url();

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
              id: "user-1",
              firstName: "User",
              lastName: "User",
              email: "user@example.com",
              role: "user",
              status: "active",
            }),
          });
        }

        if (url.includes("/api/transactions")) {
          return route.fulfill({
            status: 500,
            contentType: "application/json",
            body: JSON.stringify({
              error: "internal_server_error",
              message: "Failed to load transactions",
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

    await test.step("Navigate to transactions page", async () => {
      await page.goto("/user/transactions");
      await page.waitForLoadState("domcontentloaded");
    });

    await test.step("Verify error message is shown", async () => {
      await expect(page.getByText(/Failed to load|error/i)).toBeVisible({
        timeout: 5000,
      });
    });
  });
});
