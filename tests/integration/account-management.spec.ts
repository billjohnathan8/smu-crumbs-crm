/**
 * Account Management Integration Tests (Feature 2)
 *
 * Tests bank account lifecycle: Create account for a client, retrieve it,
 * and delete it. Validates that accounts are correctly linked to clients
 * and that audit logs are generated.
 *
 * Prerequisites:
 * - Backend services running (user, client, log)
 * - Database (PostgreSQL) with seeded admin
 * - LocalStack for log Lambda
 *
 * Run with: npm test
 */

import {
  test,
  expect,
  type APIRequestContext,
  type APIResponse,
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

async function loginAsAdmin(request: APIRequestContext, baseURL: string): Promise<string> {
  const res = await request.post(`${baseURL}/api/auth/login`, {
    data: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
  });
  const payload = (await expectOkJson(res, "admin login")) as { accessToken: string };
  expect(payload.accessToken).toBeTruthy();
  return payload.accessToken;
}

async function createAgentAndLogin(
  request: APIRequestContext,
  baseURL: string,
  adminToken: string,
): Promise<{ token: string; userId: string; email: string }> {
  const email = `it-acct-agent-${uniqueSuffix()}@example.com`;
  const createRes = await request.post(`${baseURL}/api/users`, {
    headers: { Authorization: `Bearer ${adminToken}` },
    data: {
      firstName: "AcctTest",
      lastName: "Agent",
      email,
      role: "user",
      sendInviteEmail: false,
      temporaryPassword: USER_PASSWORD,
    },
  });
  const user = (await expectOkJson(createRes, "create agent")) as { id: string };

  const loginRes = await request.post(`${baseURL}/api/auth/login`, {
    data: { email, password: USER_PASSWORD },
  });
  const auth = (await expectOkJson(loginRes, "agent login")) as { accessToken: string };
  return { token: auth.accessToken, userId: user.id, email };
}

async function createClientForAccount(
  request: APIRequestContext,
  baseURL: string,
  token: string,
): Promise<string> {
  const suffix = uniqueSuffix();
  const res = await request.post(`${baseURL}/api/clients`, {
    headers: { Authorization: `Bearer ${token}` },
    data: {
      firstName: "AcctClient",
      lastName: "Test",
      dateOfBirth: "1988-07-10",
      gender: "Female",
      emailAddress: `acct-client-${suffix}@example.com`,
      phoneNumber: `+1555${Math.floor(Math.random() * 9_000_000 + 1_000_000)}`,
      address: "100 Account Lane",
      city: "Singapore",
      state: "Singapore",
      country: "Singapore",
      postalCode: "321654",
    },
  });
  const payload = (await expectOkJson(res, "create client for account test")) as { clientId: string };
  expect(payload.clientId).toBeTruthy();
  return payload.clientId;
}

function expectUnder(durationMs: number, limitMs: number, label: string) {
  expect(durationMs, `${label} took ${durationMs}ms`).toBeLessThan(limitMs);
}

test.describe("Account Management (Feature 2)", () => {
  let baseURL: string;
  let adminToken: string;
  let agent: { token: string; userId: string; email: string };
  let clientId: string;

  test.beforeAll(async ({ request, baseURL: rawBaseURL }) => {
    baseURL = normalizeBaseURL(rawBaseURL);
    adminToken = await loginAsAdmin(request, baseURL);
    agent = await createAgentAndLogin(request, baseURL, adminToken);
    clientId = await createClientForAccount(request, baseURL, agent.token);
  });

  test("should create a bank account for a client", async ({ request }) => {
    const startTime = Date.now();

    const res = await request.post(`${baseURL}/api/accounts`, {
      headers: { Authorization: `Bearer ${agent.token}` },
      data: {
        clientId,
        accountType: "Savings",
        accountStatus: "Active",
        openingDate: new Date().toISOString().split("T")[0],
        initialDeposit: 1000.0,
        currency: "SGD",
        branchId: "BR001",
      },
    });

    const account = (await expectOkJson(res, "create account")) as {
      accountId: string;
      clientId: string;
      accountType: string;
      accountStatus: string;
      currency: string;
    };

    expect(account.accountId).toBeTruthy();
    expect(account.clientId).toBe(clientId);
    expect(account.accountType).toBe("Savings");
    expect(account.currency).toBe("SGD");

    expectUnder(Date.now() - startTime, 10000, "Create bank account");
  });

  test("should list accounts for a specific client", async ({ request }) => {
    const startTime = Date.now();

    // Create an account first
    const createRes = await request.post(`${baseURL}/api/accounts`, {
      headers: { Authorization: `Bearer ${agent.token}` },
      data: {
        clientId,
        accountType: "Checking",
        accountStatus: "Active",
        openingDate: new Date().toISOString().split("T")[0],
        initialDeposit: 500.0,
        currency: "SGD",
        branchId: "BR002",
      },
    });
    await expectOkJson(createRes, "create account for listing");

    const listRes = await request.get(`${baseURL}/api/clients/${clientId}/accounts`, {
      headers: { Authorization: `Bearer ${agent.token}` },
    });
    const payload = (await expectOkJson(listRes, "list client accounts")) as {
      data?: Array<{ accountId: string; clientId: string }>;
    };

    expect(Array.isArray(payload.data)).toBeTruthy();
    expect(payload.data!.length).toBeGreaterThanOrEqual(1);
    expect(payload.data!.every((a) => a.clientId === clientId)).toBeTruthy();

    expectUnder(Date.now() - startTime, 10000, "List client accounts");
  });

  test("should retrieve a single account by ID", async ({ request }) => {
    const startTime = Date.now();

    const createRes = await request.post(`${baseURL}/api/accounts`, {
      headers: { Authorization: `Bearer ${agent.token}` },
      data: {
        clientId,
        accountType: "Business",
        accountStatus: "Active",
        openingDate: new Date().toISOString().split("T")[0],
        initialDeposit: 5000.0,
        currency: "SGD",
        branchId: "BR003",
      },
    });
    const created = (await expectOkJson(createRes, "create account for get")) as { accountId: string };

    const getRes = await request.get(`${baseURL}/api/accounts/${created.accountId}`, {
      headers: { Authorization: `Bearer ${agent.token}` },
    });
    const account = (await expectOkJson(getRes, "get account by ID")) as {
      accountId: string;
      clientId: string;
      accountType: string;
    };

    expect(account.accountId).toBe(created.accountId);
    expect(account.clientId).toBe(clientId);
    expect(account.accountType).toBe("Business");

    expectUnder(Date.now() - startTime, 10000, "Get account by ID");
  });

  test("should delete a bank account", async ({ request }) => {
    const startTime = Date.now();

    const createRes = await request.post(`${baseURL}/api/accounts`, {
      headers: { Authorization: `Bearer ${agent.token}` },
      data: {
        clientId,
        accountType: "Savings",
        accountStatus: "Active",
        openingDate: new Date().toISOString().split("T")[0],
        initialDeposit: 250.0,
        currency: "SGD",
        branchId: "BR004",
      },
    });
    const created = (await expectOkJson(createRes, "create account for delete")) as { accountId: string };

    const deleteRes = await request.delete(`${baseURL}/api/accounts/${created.accountId}`, {
      headers: { Authorization: `Bearer ${agent.token}` },
    });
    expect(deleteRes.ok(), `Delete account failed: ${deleteRes.status()}`).toBeTruthy();

    const getRes = await request.get(`${baseURL}/api/accounts/${created.accountId}`, {
      headers: { Authorization: `Bearer ${agent.token}` },
    });
    expect([404, 410].includes(getRes.status()), "Deleted account should return 404 or 410").toBeTruthy();

    expectUnder(Date.now() - startTime, 10000, "Delete bank account");
  });

  test("account creation should generate an audit log entry", async ({ request }) => {
    const createRes = await request.post(`${baseURL}/api/accounts`, {
      headers: { Authorization: `Bearer ${agent.token}` },
      data: {
        clientId,
        accountType: "Savings",
        accountStatus: "Active",
        openingDate: new Date().toISOString().split("T")[0],
        initialDeposit: 100.0,
        currency: "SGD",
        branchId: "BR005",
      },
    });
    await expectOkJson(createRes, "create account for audit log check");

    let hasLog = false;
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const res = await request.get(`${baseURL}/api/logs?clientId=${clientId}&limit=100`, {
        headers: { Authorization: `Bearer ${agent.token}` },
      });
      const payload = (await expectOkJson(res, "list logs for account")) as {
        data?: Array<{ action: string; clientId: string }>;
      };
      hasLog = payload.data?.some((row) => row.clientId === clientId && row.action === "CREATE") ?? false;
      if (hasLog) break;
      await new Promise((r) => setTimeout(r, 1000));
    }
    expect(hasLog, "Audit log entry should exist after account creation").toBeTruthy();
  });
});
