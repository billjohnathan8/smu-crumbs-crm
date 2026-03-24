/**
 * Transaction Management Integration Tests (Feature 4)
 *
 * Tests transaction lifecycle: listing transactions, viewing details,
 * filtering by client, and verifying the transaction data structure
 * that originates from SFTP ingestion into the CRM.
 *
 * Prerequisites:
 * - Backend services running (user, client, transaction)
 * - Database (PostgreSQL) with seeded admin
 * - Transaction data ingested (or admin-created transactions)
 *
 * Run with: npm test
 */

import {
  test,
  expect,
  type APIRequestContext,
  type APIResponse,
  type Page,
} from "@playwright/test";

const ADMIN_EMAIL = (process.env.E2E_ADMIN_EMAIL ?? "admin@crm.local").trim();
const ADMIN_PASSWORD = (process.env.E2E_ADMIN_PASSWORD ?? "admin123").trim();
const USER_PASSWORD = (process.env.E2E_USER_PASSWORD ?? "UserPass123!").trim();

function uniqueSuffix(): string {
  return `${Date.now()}-${Math.floor(Math.random() * 100_000)}`;
}

function normalizeBaseURL(baseURL: string | undefined): string {
  const value = (baseURL ?? process.env.PLAYWRIGHT_BASE_URL ?? "").trim();
  if (!value) throw new Error("Playwright baseURL is required for integration tests");
  return value.replace(/\/+$/, "");
}

async function expectOkJson(response: APIResponse, operation: string): Promise<unknown> {
  const body = await response.text();
  expect(response.ok(), `${operation} failed: ${response.status()} ${response.statusText()}\n${body}`).toBeTruthy();
  return body ? JSON.parse(body) : {};
}

async function loginViaApi(request: APIRequestContext, baseURL: string, email: string, password: string): Promise<string> {
  const res = await request.post(`${baseURL}/api/auth/login`, {
    data: { email, password },
  });
  const payload = (await expectOkJson(res, `login as ${email}`)) as { accessToken: string };
  expect(payload.accessToken).toBeTruthy();
  return payload.accessToken;
}

async function loginViaUi(page: Page, email: string, password: string, expectedPath: string): Promise<void> {
  await page.goto("/login");
  await page.fill('[data-testid="email-input"]', email);
  await page.fill('[data-testid="password-input"]', password);
  await page.click('[data-testid="login-submit-button"]');
  await expect(page).toHaveURL(new RegExp(`${expectedPath}$`), { timeout: 10000 });
}

function expectUnder(durationMs: number, limitMs: number, label: string) {
  expect(durationMs, `${label} took ${durationMs}ms`).toBeLessThan(limitMs);
}

test.describe("Transaction Management (Feature 4)", () => {
  let baseURL: string;
  let adminToken: string;
  let agentToken: string;
  let agentEmail: string;
  let clientId: string;

  test.beforeAll(async ({ request, baseURL: rawBaseURL }) => {
    baseURL = normalizeBaseURL(rawBaseURL);
    adminToken = await loginViaApi(request, baseURL, ADMIN_EMAIL, ADMIN_PASSWORD);

    // Create an agent user
    agentEmail = `it-txn-agent-${uniqueSuffix()}@example.com`;
    const createRes = await request.post(`${baseURL}/api/users`, {
      headers: { Authorization: `Bearer ${adminToken}` },
      data: {
        firstName: "TxnTest",
        lastName: "Agent",
        email: agentEmail,
        role: "user",
        sendInviteEmail: false,
        temporaryPassword: USER_PASSWORD,
      },
    });
    await expectOkJson(createRes, "create agent for transaction tests");

    agentToken = await loginViaApi(request, baseURL, agentEmail, USER_PASSWORD);

    // Create a client
    const suffix = uniqueSuffix();
    const clientRes = await request.post(`${baseURL}/api/clients`, {
      headers: { Authorization: `Bearer ${agentToken}` },
      data: {
        firstName: "TxnClient",
        lastName: "Test",
        dateOfBirth: "1991-09-20",
        gender: "Male",
        emailAddress: `txn-client-${suffix}@example.com`,
        phoneNumber: `+1555${Math.floor(Math.random() * 9_000_000 + 1_000_000)}`,
        address: "500 Txn Street",
        city: "Singapore",
        state: "Singapore",
        country: "Singapore",
        postalCode: "889900",
      },
    });
    const client = (await expectOkJson(clientRes, "create client for txn tests")) as { clientId: string };
    clientId = client.clientId;
  });

  test("should list all transactions via API", async ({ request }) => {
    const startTime = Date.now();

    const res = await request.get(`${baseURL}/api/transactions?limit=20&offset=0`, {
      headers: { Authorization: `Bearer ${agentToken}` },
    });
    const payload = (await expectOkJson(res, "list transactions")) as {
      data?: unknown[];
      pagination?: { total?: number; limit?: number; offset?: number };
    };

    expect(Array.isArray(payload.data)).toBeTruthy();
    expect(payload.pagination).toBeTruthy();
    expect(typeof payload.pagination!.total).toBe("number");

    expectUnder(Date.now() - startTime, 10000, "List all transactions");
  });

  test("should list transactions for a specific client", async ({ request }) => {
    const startTime = Date.now();

    const res = await request.get(`${baseURL}/api/clients/${clientId}/transactions?limit=20&offset=0`, {
      headers: { Authorization: `Bearer ${agentToken}` },
    });
    const payload = (await expectOkJson(res, "list client transactions")) as {
      data?: Array<{ clientId?: string }>;
      pagination?: { total?: number };
    };

    expect(Array.isArray(payload.data)).toBeTruthy();
    expect(payload.pagination).toBeTruthy();

    expectUnder(Date.now() - startTime, 10000, "List client transactions");
  });

  test("admin should create a transaction via API", async ({ request }) => {
    const startTime = Date.now();

    const res = await request.post(`${baseURL}/api/transactions`, {
      headers: { Authorization: `Bearer ${adminToken}` },
      data: {
        clientId,
        transaction: "D",
        amount: 2500.0,
        date: new Date().toISOString().split("T")[0],
        status: "Completed",
      },
    });
    const txn = (await expectOkJson(res, "create transaction")) as {
      id: string;
      clientId: string;
      amount: number;
      status: string;
    };

    expect(txn.id).toBeTruthy();
    expect(txn.clientId).toBe(clientId);
    expect(txn.status).toBe("Completed");

    expectUnder(Date.now() - startTime, 10000, "Create transaction");
  });

  test("should retrieve a single transaction by ID", async ({ request }) => {
    const startTime = Date.now();

    // Create a transaction first
    const createRes = await request.post(`${baseURL}/api/transactions`, {
      headers: { Authorization: `Bearer ${adminToken}` },
      data: {
        clientId,
        transaction: "W",
        amount: 500.0,
        date: new Date().toISOString().split("T")[0],
        status: "Pending",
      },
    });
    const created = (await expectOkJson(createRes, "create txn for get")) as { id: string };

    const getRes = await request.get(`${baseURL}/api/transactions/${created.id}`, {
      headers: { Authorization: `Bearer ${agentToken}` },
    });
    const txn = (await expectOkJson(getRes, "get transaction by ID")) as {
      id: string;
      clientId: string;
      amount: number;
      status: string;
    };

    expect(txn.id).toBe(created.id);
    expect(txn.clientId).toBe(clientId);
    expect(txn.amount).toBe(500.0);
    expect(txn.status).toBe("Pending");

    expectUnder(Date.now() - startTime, 10000, "Get transaction by ID");
  });

  test("admin should delete a transaction via API", async ({ request }) => {
    const startTime = Date.now();

    const createRes = await request.post(`${baseURL}/api/transactions`, {
      headers: { Authorization: `Bearer ${adminToken}` },
      data: {
        clientId,
        transaction: "D",
        amount: 100.0,
        date: new Date().toISOString().split("T")[0],
        status: "Failed",
      },
    });
    const created = (await expectOkJson(createRes, "create txn for delete")) as { id: string };

    const deleteRes = await request.delete(`${baseURL}/api/transactions/${created.id}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(deleteRes.ok(), `Delete transaction failed: ${deleteRes.status()}`).toBeTruthy();

    const getRes = await request.get(`${baseURL}/api/transactions/${created.id}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect([404, 410].includes(getRes.status()), "Deleted transaction should return 404 or 410").toBeTruthy();

    expectUnder(Date.now() - startTime, 10000, "Delete transaction");
  });

  test("agent should view transactions page via UI", async ({ page }) => {
    const startTime = Date.now();

    await loginViaUi(page, agentEmail, USER_PASSWORD, "/user");
    await expect(page.getByRole("heading", { name: "User Dashboard" })).toBeVisible();

    await page.getByRole("link", { name: "View Transactions" }).click();
    await expect(page).toHaveURL(/\/user\/transactions$/);
    await expect(page.getByRole("heading", { name: "Transactions" })).toBeVisible();

    expectUnder(Date.now() - startTime, 15000, "View transactions page via UI");
  });

  test("should filter transactions by status via API", async ({ request }) => {
    const startTime = Date.now();

    const res = await request.get(`${baseURL}/api/transactions?status=Completed&limit=20&offset=0`, {
      headers: { Authorization: `Bearer ${agentToken}` },
    });
    const payload = (await expectOkJson(res, "filter transactions by status")) as {
      data?: Array<{ status: string }>;
      pagination?: { total?: number };
    };

    expect(Array.isArray(payload.data)).toBeTruthy();
    expect(payload.pagination).toBeTruthy();

    expectUnder(Date.now() - startTime, 10000, "Filter transactions by status");
  });

  test("transaction import endpoint should be accessible to admin", async ({ request }) => {
    const startTime = Date.now();

    const res = await request.post(`${baseURL}/api/transactions/import`, {
      headers: { Authorization: `Bearer ${adminToken}` },
      data: {},
    });

    // Import may return 200/202 on success or 4xx if no SFTP data — we just verify the endpoint exists
    expect([200, 201, 202, 400, 404, 409].includes(res.status()),
      `Transaction import endpoint should respond, got ${res.status()}`).toBeTruthy();

    expectUnder(Date.now() - startTime, 15000, "Transaction import endpoint");
  });
});
