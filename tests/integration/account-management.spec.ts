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
} from "@playwright/test";
import { normalizeBaseURL, expectOkJson, authHeaders } from "./helpers/apiClient";
import { createAgentAndLogin, createClientForUser, loginAsSeedAdmin } from "./helpers/dataFactory";
import { waitForAuditLogAction } from "./helpers/polling";

function expectUnder(durationMs: number, limitMs: number, label: string) {
  expect(durationMs, `${label} took ${durationMs}ms`).toBeLessThan(limitMs);
}

test.describe("Account Management (Feature 2)", () => {
  let baseURL: string;
  let agent: { token: string; userId: string; email: string };
  let clientId: string;

  test.beforeAll(async ({ request, baseURL: rawBaseURL }) => {
    baseURL = normalizeBaseURL(rawBaseURL);
    const adminTokens = await loginAsSeedAdmin(request, baseURL);
    const agentUser = await createAgentAndLogin(request, baseURL, adminTokens.accessToken, {
      firstName: "AcctTest",
      lastName: "Agent",
    });
    agent = { token: agentUser.tokens.accessToken, userId: agentUser.id, email: agentUser.email };
    const client = await createClientForUser(request, baseURL, agent.token, {
      firstName: "AcctClient",
      lastName: "Test",
      dateOfBirth: "1988-07-10",
      gender: "Female",
      address: "100 Account Lane",
      postalCode: "321654",
    });
    clientId = client.clientId;
  });

  test("should create a bank account for a client", async ({ request }) => {
    const startTime = Date.now();

    const res = await request.post(`${baseURL}/api/accounts`, {
      headers: authHeaders(agent.token),
      data: {
        clientId,
        accountType: "Savings",
        accountStatus: "Active",
        openingDate: new Date().toISOString().split("T")[0],
        initialDeposit: 1000.0,
        currency: "SGD",
        branchId: "SG-001",
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
      headers: authHeaders(agent.token),
      data: {
        clientId,
        accountType: "Checking",
        accountStatus: "Active",
        openingDate: new Date().toISOString().split("T")[0],
        initialDeposit: 500.0,
        currency: "SGD",
        branchId: "SG-001",
      },
    });
    await expectOkJson(createRes, "create account for listing");

    const listRes = await request.get(`${baseURL}/api/clients/${clientId}/accounts`, {
      headers: authHeaders(agent.token),
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
      headers: authHeaders(agent.token),
      data: {
        clientId,
        accountType: "Business",
        accountStatus: "Active",
        openingDate: new Date().toISOString().split("T")[0],
        initialDeposit: 5000.0,
        currency: "SGD",
        branchId: "SG-001",
      },
    });
    const created = (await expectOkJson(createRes, "create account for get")) as { accountId: string };

    const getRes = await request.get(`${baseURL}/api/accounts/${created.accountId}`, {
      headers: authHeaders(agent.token),
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
      headers: authHeaders(agent.token),
      data: {
        clientId,
        accountType: "Savings",
        accountStatus: "Active",
        openingDate: new Date().toISOString().split("T")[0],
        initialDeposit: 250.0,
        currency: "SGD",
        branchId: "SG-001",
      },
    });
    const created = (await expectOkJson(createRes, "create account for delete")) as { accountId: string };

    const deleteRes = await request.delete(`${baseURL}/api/accounts/${created.accountId}`, {
      headers: authHeaders(agent.token),
    });
    expect(deleteRes.ok(), `Delete account failed: ${deleteRes.status()}`).toBeTruthy();

    const getRes = await request.get(`${baseURL}/api/accounts/${created.accountId}`, {
      headers: authHeaders(agent.token),
    });
    expect([404, 410].includes(getRes.status()), "Deleted account should return 404 or 410").toBeTruthy();

    expectUnder(Date.now() - startTime, 10000, "Delete bank account");
  });

  test("account creation should generate an audit log entry", async ({ request }) => {
    const createRes = await request.post(`${baseURL}/api/accounts`, {
      headers: authHeaders(agent.token),
      data: {
        clientId,
        accountType: "Savings",
        accountStatus: "Active",
        openingDate: new Date().toISOString().split("T")[0],
        initialDeposit: 100.0,
        currency: "SGD",
        branchId: "SG-001",
      },
    });
    await expectOkJson(createRes, "create account for audit log check");

    const auditLog = await waitForAuditLogAction(request, baseURL, agent.token, {
      clientId,
      action: "CREATE",
      limit: 100,
    });
    expect(auditLog.logId, "Audit log entry should exist after account creation").toBeTruthy();
  });
});
