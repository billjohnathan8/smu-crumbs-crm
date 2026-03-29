import { test, expect, type Page } from "@playwright/test";
import { gotoWithNetworkRetry, setAuthState } from "../helpers/auth";
import { measureLatency } from "../utils/performance";

const adminUser = {
  id: "admin-1",
  firstName: "Admin",
  lastName: "User",
  email: "admin@example.com",
  role: "admin",
  status: "active",
};

type ClientFixture = {
  clientId: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  gender: "Male" | "Female";
  emailAddress: string;
  phoneNumber: string;
  address: string;
  city: string;
  state: string;
  country: string;
  postalCode: string;
  identityVerificationStatus: "unverified" | "pending" | "verified" | "rejected";
};

type AccountFixture = {
  accountId: string;
  clientId: string;
  accountType: "Savings" | "Checking" | "Business";
  accountStatus: "Active" | "Inactive" | "Pending";
  openingDate: string;
  initialDeposit: number;
  currency: string;
  branchId: string;
};

async function setupAdminClientRoutes(page: Page) {
  const clients: ClientFixture[] = [
    {
      clientId: "clt_001",
      firstName: "Alice",
      lastName: "Tan",
      dateOfBirth: "1990-05-01",
      gender: "Female",
      emailAddress: "alice.tan@example.com",
      phoneNumber: "+65 91234567",
      address: "1 Raffles Place",
      city: "Singapore",
      state: "Singapore",
      country: "Singapore",
      postalCode: "048616",
      identityVerificationStatus: "verified",
    },
    {
      clientId: "clt_002",
      firstName: "Ben",
      lastName: "Lim",
      dateOfBirth: "1988-11-10",
      gender: "Male",
      emailAddress: "ben.lim@example.com",
      phoneNumber: "+65 92345678",
      address: "2 Marina Blvd",
      city: "Singapore",
      state: "Singapore",
      country: "Singapore",
      postalCode: "018987",
      identityVerificationStatus: "pending",
    },
  ];

  let accounts: AccountFixture[] = [
    {
      accountId: "acc_001",
      clientId: "clt_001",
      accountType: "Savings",
      accountStatus: "Active",
      openingDate: "2024-01-10",
      initialDeposit: 2500,
      currency: "SGD",
      branchId: "BR-001",
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

    if (path === "/api/clients" && method === "GET") {
      const q = (url.searchParams.get("q") ?? "").trim().toLowerCase();
      const filtered =
        q.length === 0
          ? clients
          : clients.filter(
              client =>
                `${client.firstName} ${client.lastName}`.toLowerCase().includes(q) ||
                client.emailAddress.toLowerCase().includes(q) ||
                client.phoneNumber.toLowerCase().includes(q),
            );

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

    const clientByIdMatch = path.match(/^\/api\/clients\/([^/]+)$/);
    if (clientByIdMatch && method === "GET") {
      const clientId = clientByIdMatch[1];
      const client = clients.find(row => row.clientId === clientId);
      if (!client) {
        return route.fulfill({
          status: 404,
          contentType: "application/json",
          body: JSON.stringify({ error: "not_found", message: "Client not found" }),
        });
      }

      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(client),
      });
    }

    const clientTransactionsMatch = path.match(/^\/api\/clients\/([^/]+)\/transactions$/);
    if (clientTransactionsMatch && method === "GET") {
      const clientId = clientTransactionsMatch[1];
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: [
            {
              id: "txn_001",
              clientId,
              transaction: "D",
              amount: 1200,
              date: "2026-03-01T09:30:00Z",
              status: "Completed",
            },
          ],
          pagination: { limit: 10, offset: 0, total: 1 },
        }),
      });
    }

    const clientCommunicationsMatch = path.match(/^\/api\/clients\/([^/]+)\/communications$/);
    if (clientCommunicationsMatch && method === "GET") {
      const clientId = clientCommunicationsMatch[1];
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: [
            {
              communicationId: "com_001",
              clientId,
              userId: "admin-1",
              channel: "email",
              toEmail: "alice.tan@example.com",
              subject: "Follow-up",
              body: "Your account is in good standing.",
              status: "sent",
              providerMessageId: "provider-001",
              createdAt: "2026-03-01T10:00:00Z",
              updatedAt: "2026-03-01T10:01:00Z",
            },
          ],
          pagination: { limit: 10, offset: 0, total: 1 },
        }),
      });
    }

    const clientAccountsMatch = path.match(/^\/api\/clients\/([^/]+)\/accounts$/);
    if (clientAccountsMatch && method === "GET") {
      const clientId = clientAccountsMatch[1];
      const clientAccounts = accounts.filter(row => row.clientId === clientId);
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: clientAccounts,
          pagination: { limit: clientAccounts.length || 20, offset: 0, total: clientAccounts.length },
        }),
      });
    }

    if (path === "/api/accounts" && method === "POST") {
      const payload = request.postDataJSON() as AccountFixture;
      const created: AccountFixture = {
        accountId: `acc_new_${accounts.length + 1}`,
        clientId: payload.clientId,
        accountType: payload.accountType,
        accountStatus: payload.accountStatus,
        openingDate: payload.openingDate,
        initialDeposit: payload.initialDeposit,
        currency: payload.currency,
        branchId: payload.branchId,
      };
      accounts = [created, ...accounts];
      return route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify(created),
      });
    }

    const accountByIdMatch = path.match(/^\/api\/accounts\/([^/]+)$/);
    if (accountByIdMatch && method === "PUT") {
      const accountId = accountByIdMatch[1];
      const payload = request.postDataJSON() as Partial<AccountFixture>;
      accounts = accounts.map(account =>
        account.accountId === accountId
          ? {
              ...account,
              accountType: payload.accountType ?? account.accountType,
              accountStatus: payload.accountStatus ?? account.accountStatus,
              branchId: payload.branchId ?? account.branchId,
            }
          : account,
      );

      const updated = accounts.find(account => account.accountId === accountId);
      if (!updated) {
        return route.fulfill({
          status: 404,
          contentType: "application/json",
          body: JSON.stringify({ error: "not_found", message: "Account not found" }),
        });
      }

      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(updated),
      });
    }

    if (accountByIdMatch && method === "DELETE") {
      const accountId = accountByIdMatch[1];
      accounts = accounts.filter(account => account.accountId !== accountId);
      return route.fulfill({
        status: 204,
        contentType: "application/json",
        body: "",
      });
    }

    if (path === "/api/logs" && method === "GET") {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: [],
          pagination: { limit: 10, offset: 0, total: 0 },
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

test.describe("Admin Client Management (Mocked)", () => {
  test.beforeEach(async ({ page, context }) => {
    await context.clearCookies();
    await gotoWithNetworkRetry(page, "/login");
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    });
  });

  test("navigates from client list to client detail to account management", async ({ page }) => {
    await setupAdminClientRoutes(page);
    await gotoWithNetworkRetry(page, "/login");
    await setAuthState(page, "admin");

    await measureLatency(async () => {
      await gotoWithNetworkRetry(page, "/admin/clients");
      await expect(page.getByRole("heading", { name: "All Clients" })).toBeVisible();
      await expect(page.getByText("Alice Tan")).toBeVisible();
    }, "Client list page load");

    await measureLatency(async () => {
      await page.getByRole("button", { name: "View" }).first().click();
      await expect(page).toHaveURL(/\/admin\/clients\/clt_001$/);
      await expect(page.getByRole("heading", { name: /Alice Tan/ })).toBeVisible();
      await expect(page.getByRole("heading", { name: "Client Profile" })).toBeVisible();
    }, "Client detail page navigation");

    await measureLatency(async () => {
      await page.getByRole("button", { name: /Manage accounts/i }).click();
      await expect(page).toHaveURL(/\/admin\/clients\/clt_001\/accounts$/);
      await expect(page.getByRole("heading", { name: "Bank Accounts" })).toBeVisible();
    }, "Account management page navigation");
  });

  test("creates, edits, and deletes an account from client account management page", async ({
    page,
  }) => {
    await setupAdminClientRoutes(page);
    await gotoWithNetworkRetry(page, "/login");
    await setAuthState(page, "admin");

    await gotoWithNetworkRetry(page, "/admin/clients/clt_001/accounts");
    await expect(page.getByRole("heading", { name: "Bank Accounts" })).toBeVisible();

    await measureLatency(async () => {
      await page.getByRole("button", { name: "+ New Account" }).click();
      await expect(page.getByRole("heading", { name: "Create Account" })).toBeVisible();
      await page.getByLabel(/Initial Deposit/i).fill("1500");
      await page.getByLabel(/Branch ID/i).fill("BR-NEW-01");
      await page.getByRole("button", { name: "Create Account" }).click();
      await expect(page.getByText("BR-NEW-01")).toBeVisible();
    }, "Create account form submission");

    await measureLatency(async () => {
      const createdRow = page.locator("tr", { hasText: "BR-NEW-01" });
      await createdRow.getByRole("button", { name: "Edit" }).click();
      await expect(page.getByRole("heading", { name: "Edit Account" })).toBeVisible();
      await page.getByLabel(/Account Status/i).selectOption("Inactive");
      await page.getByLabel(/Branch ID/i).fill("BR-EDIT-01");
      await page.getByRole("button", { name: "Save Changes" }).click();

      await expect(page.getByText("BR-EDIT-01")).toBeVisible();
      await expect(page.getByText("Inactive")).toBeVisible();
    }, "Edit account form submission");

    const updatedRow = page.locator("tr", { hasText: "BR-EDIT-01" });
    await updatedRow.getByRole("button", { name: "Delete" }).click();
    await expect(page.getByTestId("delete-account-modal")).toBeVisible();
    await page
      .getByTestId("delete-account-modal")
      .getByRole("button", { name: "Delete Account" })
      .click();
    await expect(page.getByText("BR-EDIT-01")).not.toBeVisible();
  });

  test("opens create client page from admin client list", async ({ page }) => {
    await setupAdminClientRoutes(page);
    await gotoWithNetworkRetry(page, "/login");
    await setAuthState(page, "admin");

    await gotoWithNetworkRetry(page, "/admin/clients");
    await measureLatency(async () => {
      await page.getByRole("button", { name: "+ New Client" }).click();
      await expect(page).toHaveURL(/\/admin\/clients\/new$/);
      await expect(page.getByRole("heading", { name: "Create Client" })).toBeVisible();
    }, "Create client form navigation");
  });

  test("opens edit client page from client detail", async ({ page }) => {
    await setupAdminClientRoutes(page);
    await gotoWithNetworkRetry(page, "/login");
    await setAuthState(page, "admin");

    await gotoWithNetworkRetry(page, "/admin/clients/clt_001");
    await page.getByRole("button", { name: "Edit Client" }).click();
    await expect(page).toHaveURL(/\/admin\/clients\/clt_001\/edit$/);
    await expect(page.getByRole("heading", { name: "Edit Client" })).toBeVisible();
  });
});
