import { test, expect, type Page } from "@playwright/test";
import { gotoWithNetworkRetry, setAuthState } from "../helpers/auth";

const adminUser = {
  id: "admin-1",
  firstName: "Admin",
  lastName: "User",
  email: "admin@example.com",
  role: "admin",
  status: "active",
};

async function setupAdminRiskOpsRoutes(page: Page) {
  let queuedCommunications = [
    {
      communicationId: "com_001",
      clientId: "clt_001",
      userId: "admin-1",
      channel: "email",
      toEmail: "alice@example.com",
      subject: "Verification Follow-up",
      body: "Please submit the missing verification document.",
      status: "queued",
      providerMessageId: "provider-001",
      errorMessage: null,
      createdAt: "2026-03-01T08:00:00Z",
      updatedAt: "2026-03-01T08:00:00Z",
    },
  ];

  let amlAlerts = [
    {
      alertId: "aml_001",
      clientId: "clt_001",
      transactionId: "txn_001",
      alertType: "STRUCTURING",
      description: "Unusual withdrawal burst in a short window.",
      detectedAt: "2026-03-02T10:00:00Z",
      reviewStatus: "Pending",
      createdAt: "2026-03-02T10:01:00Z",
      updatedAt: "2026-03-02T10:01:00Z",
    },
  ];

  await page.route("**/api/**", async route => {
    const request = route.request();
    const method = request.method();
    const url = new URL(request.url());
    const path = url.pathname;

    if (path === "/api/users/me") {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(adminUser),
      });
    }

    if (path === "/api/communications/queued" && method === "GET") {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: queuedCommunications,
          pagination: { limit: 200, offset: 0, total: queuedCommunications.length },
        }),
      });
    }

    const communicationLookupMatch = path.match(/^\/api\/communications\/([^/]+)$/);
    if (communicationLookupMatch && method === "GET") {
      const communication = queuedCommunications.find(
        row => row.communicationId === communicationLookupMatch[1],
      );
      if (!communication) {
        return route.fulfill({
          status: 404,
          contentType: "application/json",
          body: JSON.stringify({ error: "not_found", message: "Communication not found" }),
        });
      }

      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(communication),
      });
    }

    const providerLookupMatch = path.match(/^\/api\/communications\/provider\/([^/]+)\/status$/);
    if (providerLookupMatch && method === "PATCH") {
      const communication = queuedCommunications.find(
        row => row.providerMessageId === providerLookupMatch[1],
      );
      if (!communication) {
        return route.fulfill({
          status: 404,
          contentType: "application/json",
          body: JSON.stringify({ error: "not_found", message: "Communication not found" }),
        });
      }

      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(communication),
      });
    }

    const communicationStatusMatch = path.match(/^\/api\/communications\/([^/]+)\/status$/);
    if (communicationStatusMatch && method === "PATCH") {
      const communicationId = communicationStatusMatch[1];
      const payload = request.postDataJSON() as { status?: "queued" | "sent" | "failed" };
      queuedCommunications = queuedCommunications.map(row =>
        row.communicationId === communicationId
          ? {
              ...row,
              status: payload.status ?? row.status,
              updatedAt: "2026-03-03T12:00:00Z",
            }
          : row,
      );

      const updated = queuedCommunications.find(row => row.communicationId === communicationId);
      if (!updated) {
        return route.fulfill({
          status: 404,
          contentType: "application/json",
          body: JSON.stringify({ error: "not_found", message: "Communication not found" }),
        });
      }

      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(updated),
      });
    }

    if (path === "/api/aml/alerts" && method === "GET") {
      const clientId = (url.searchParams.get("clientId") ?? "").trim();
      const alertType = (url.searchParams.get("alertType") ?? "").trim();
      const reviewStatus = (url.searchParams.get("reviewStatus") ?? "").trim();

      const filtered = amlAlerts.filter(alert => {
        if (clientId && alert.clientId !== clientId) return false;
        if (alertType && alert.alertType !== alertType) return false;
        if (reviewStatus && alert.reviewStatus !== reviewStatus) return false;
        return true;
      });

      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: filtered,
          pagination: {
            limit: Number(url.searchParams.get("limit") ?? 20),
            offset: Number(url.searchParams.get("offset") ?? 0),
            total: filtered.length,
          },
        }),
      });
    }

    const amlReviewMatch = path.match(/^\/api\/aml\/alerts\/([^/]+)\/review$/);
    if (amlReviewMatch && method === "PUT") {
      const alertId = amlReviewMatch[1];
      const payload = request.postDataJSON() as { reviewStatus?: "Pending" | "Confirmed" | "Dismissed" };
      amlAlerts = amlAlerts.map(alert =>
        alert.alertId === alertId
          ? {
              ...alert,
              reviewStatus: payload.reviewStatus ?? alert.reviewStatus,
              updatedAt: "2026-03-03T13:00:00Z",
            }
          : alert,
      );

      const updated = amlAlerts.find(alert => alert.alertId === alertId);
      if (!updated) {
        return route.fulfill({
          status: 404,
          contentType: "application/json",
          body: JSON.stringify({ error: "not_found", message: "Alert not found" }),
        });
      }

      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(updated),
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

test.describe("Admin Communications and AML (Mocked)", () => {
  test.beforeEach(async ({ page, context }) => {
    await context.clearCookies();
    await gotoWithNetworkRetry(page, "/login");
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    });
  });

test("shows queued communications as read-only and supports ID lookup", async ({ page }) => {
    await setupAdminRiskOpsRoutes(page);
    await gotoWithNetworkRetry(page, "/login");
    await setAuthState(page, "admin");

    await gotoWithNetworkRetry(page, "/admin/communications");
    await expect(page.getByRole("heading", { name: "Communications", exact: true })).toBeVisible();
    await expect(page.getByText("Communications")).toBeVisible();
    await expect(page.locator("tbody tr").first().locator("select")).toHaveCount(0);
    await expect(page.locator("tbody tr").first().getByRole("button", { name: "Update" })).toHaveCount(0);
    await expect(page.locator("tbody tr").first().getByText("queued")).toBeVisible();

    await page.getByPlaceholder("com_...").fill("com_001");
    await page.getByRole("button", { name: /^Lookup$/ }).first().click();
    await expect(page.getByText("provider-001")).toBeVisible();
  });

  test("filters AML alerts and updates review status", async ({ page }) => {
    await setupAdminRiskOpsRoutes(page);
    await gotoWithNetworkRetry(page, "/login");
    await setAuthState(page, "admin");

    await gotoWithNetworkRetry(page, "/admin/aml-alerts");
    await expect(page.getByRole("heading", { name: "AML Alerts", exact: true })).toBeVisible();
    await expect(page.getByText("aml_001")).toBeVisible();

    await page.getByLabel("Client ID").fill("clt_001");
    await page.getByLabel("Review Status").selectOption("Pending");
    await expect(page.getByText("aml_001")).toBeVisible();

    await page.locator("tbody tr").first().locator("select").selectOption("Confirmed");
    await page.locator("tbody tr").first().getByRole("button", { name: "Save" }).click();
    await expect(page.locator("tbody tr").first().locator("select")).toHaveValue("Confirmed");
  });
});
