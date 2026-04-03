/**
 * Audit Logging Integration Tests (Feature 3)
 *
 * Tests the logging subsystem: CRUD operations on log entries,
 * verification that client profile operations generate audit logs,
 * and filtering/retrieval of logs by client and user.
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

const ADMIN_EMAIL = (process.env.E2E_ADMIN_EMAIL ?? "admin@crm.com").trim();
const ADMIN_PASSWORD = (process.env.E2E_ADMIN_PASSWORD ?? "Scrooge@Bank2026!").trim();
const USER_PASSWORD = (process.env.E2E_USER_PASSWORD ?? "V7!mQ2#pL9@xR4$k").trim();

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

function expectUnder(durationMs: number, limitMs: number, label: string) {
  expect(durationMs, `${label} took ${durationMs}ms`).toBeLessThan(limitMs);
}

test.describe("Audit Logging (Feature 3)", () => {
  let baseURL: string;
  let adminToken: string;
  let agentToken: string;
  let agentUserId: string;
  let clientId: string;

  test.beforeAll(async ({ request, baseURL: rawBaseURL }) => {
    baseURL = normalizeBaseURL(rawBaseURL);
    adminToken = await loginViaApi(request, baseURL, ADMIN_EMAIL, ADMIN_PASSWORD);

    // Create an agent user
    const email = `it-log-agent-${uniqueSuffix()}@example.com`;
    const createRes = await request.post(`${baseURL}/api/users`, {
      headers: { Authorization: `Bearer ${adminToken}` },
      data: {
        firstName: "LogTest",
        lastName: "Agent",
        email,
        role: "user",
        sendInviteEmail: false,
        temporaryPassword: USER_PASSWORD,
      },
    });
    const user = (await expectOkJson(createRes, "create agent")) as { id: string };
    agentUserId = user.id;

    agentToken = await loginViaApi(request, baseURL, email, USER_PASSWORD);

    // Create a client so we have a clientId for log operations
    const suffix = uniqueSuffix();
    const clientRes = await request.post(`${baseURL}/api/clients`, {
      headers: { Authorization: `Bearer ${agentToken}` },
      data: {
        firstName: "LogClient",
        lastName: "Test",
        dateOfBirth: "1992-11-30",
        gender: "Female",
        emailAddress: `log-client-${suffix}@example.com`,
        phoneNumber: `+1555${Math.floor(Math.random() * 9_000_000 + 1_000_000)}`,
        address: "200 Log Ave",
        city: "Singapore",
        state: "Singapore",
        country: "Singapore",
        postalCode: "445566",
      },
    });
    const client = (await expectOkJson(clientRes, "create client for logs")) as { clientId: string };
    clientId = client.clientId;
  });

  test("should create a log entry via API", async ({ request }) => {
    const startTime = Date.now();

    const res = await request.post(`${baseURL}/api/logs`, {
      headers: { Authorization: `Bearer ${agentToken}` },
      data: {
        action: "CREATE",
        attributeName: clientId,
        beforeValue: "",
        afterValue: "New client created",
        userId: agentUserId,
        clientId,
        dateTime: new Date().toISOString(),
      },
    });

    const log = (await expectOkJson(res, "create log entry")) as {
      logId: string;
      action: string;
      clientId: string;
    };

    expect(log.logId).toBeTruthy();
    expect(log.action).toBe("CREATE");
    expect(log.clientId).toBe(clientId);

    expectUnder(Date.now() - startTime, 10000, "Create log entry");
  });

  test("should retrieve logs filtered by clientId", async ({ request }) => {
    const startTime = Date.now();

    const res = await request.get(`${baseURL}/api/logs?clientId=${clientId}&limit=50`, {
      headers: { Authorization: `Bearer ${agentToken}` },
    });
    const payload = (await expectOkJson(res, "list logs by clientId")) as {
      data?: Array<{ logId: string; clientId: string; action: string }>;
      pagination?: { total?: number };
    };

    expect(Array.isArray(payload.data)).toBeTruthy();
    expect(payload.data!.length).toBeGreaterThanOrEqual(1);
    expect(payload.data!.every((log) => log.clientId === clientId)).toBeTruthy();

    expectUnder(Date.now() - startTime, 10000, "List logs by clientId");
  });

  test("should retrieve a single log entry by ID", async ({ request }) => {
    const startTime = Date.now();

    // Create a log entry first
    const createRes = await request.post(`${baseURL}/api/logs`, {
      headers: { Authorization: `Bearer ${agentToken}` },
      data: {
        action: "READ",
        attributeName: clientId,
        beforeValue: "",
        afterValue: "",
        userId: agentUserId,
        clientId,
        dateTime: new Date().toISOString(),
      },
    });
    const created = (await expectOkJson(createRes, "create log for get")) as { logId: string };

    const getRes = await request.get(`${baseURL}/api/logs/${created.logId}`, {
      headers: { Authorization: `Bearer ${agentToken}` },
    });
    const log = (await expectOkJson(getRes, "get log by ID")) as {
      logId: string;
      action: string;
      clientId: string;
    };

    expect(log.logId).toBe(created.logId);
    expect(log.action).toBe("READ");
    expect(log.clientId).toBe(clientId);

    expectUnder(Date.now() - startTime, 10000, "Get log by ID");
  });

  test("should update a log entry via API", async ({ request }) => {
    const startTime = Date.now();

    const createRes = await request.post(`${baseURL}/api/logs`, {
      headers: { Authorization: `Bearer ${agentToken}` },
      data: {
        action: "UPDATE",
        attributeName: "First Name",
        beforeValue: "OldName",
        afterValue: "NewName",
        userId: agentUserId,
        clientId,
        dateTime: new Date().toISOString(),
      },
    });
    const created = (await expectOkJson(createRes, "create log for update")) as { logId: string };

    const updateRes = await request.put(`${baseURL}/api/logs/${created.logId}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
      data: {
        attributeName: "First Name|Last Name",
        beforeValue: "OldName|OldLast",
        afterValue: "NewName|NewLast",
        dateTime: new Date().toISOString(),
      },
    });
    const updated = (await expectOkJson(updateRes, "update log entry")) as {
      logId: string;
      attributeName: string;
    };

    expect(updated.logId).toBe(created.logId);
    expect(updated.attributeName).toContain("Last Name");

    expectUnder(Date.now() - startTime, 10000, "Update log entry");
  });

  test("should delete a log entry via API", async ({ request }) => {
    const startTime = Date.now();

    const createRes = await request.post(`${baseURL}/api/logs`, {
      headers: { Authorization: `Bearer ${agentToken}` },
      data: {
        action: "DELETE",
        attributeName: clientId,
        beforeValue: "Existed",
        afterValue: "",
        userId: agentUserId,
        clientId,
        dateTime: new Date().toISOString(),
      },
    });
    const created = (await expectOkJson(createRes, "create log for delete")) as { logId: string };

    const deleteRes = await request.delete(`${baseURL}/api/logs/${created.logId}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(deleteRes.ok(), `Delete log failed: ${deleteRes.status()}`).toBeTruthy();

    const getRes = await request.get(`${baseURL}/api/logs/${created.logId}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect([404, 410].includes(getRes.status()), "Deleted log should return 404 or 410").toBeTruthy();

    expectUnder(Date.now() - startTime, 10000, "Delete log entry");
  });

  test("should retrieve logs for a specific client via /api/clients/{clientId}/logs", async ({ request }) => {
    const startTime = Date.now();

    const res = await request.get(`${baseURL}/api/clients/${clientId}/logs`, {
      headers: { Authorization: `Bearer ${agentToken}` },
    });
    const payload = (await expectOkJson(res, "list client logs")) as {
      data?: Array<{ logId: string; clientId: string }>;
    };

    expect(Array.isArray(payload.data)).toBeTruthy();
    expect(payload.data!.every((log) => log.clientId === clientId)).toBeTruthy();

    expectUnder(Date.now() - startTime, 10000, "List client-specific logs");
  });

  test("client profile create should auto-generate an audit log", async ({ request }) => {
    const suffix = uniqueSuffix();
    const clientEmail = `auto-log-${suffix}@example.com`;

    const clientRes = await request.post(`${baseURL}/api/clients`, {
      headers: { Authorization: `Bearer ${agentToken}` },
      data: {
        firstName: "AutoLog",
        lastName: "Client",
        dateOfBirth: "1995-06-15",
        gender: "Male",
        emailAddress: clientEmail,
        phoneNumber: `+1555${Math.floor(Math.random() * 9_000_000 + 1_000_000)}`,
        address: "300 Auto Log Street",
        city: "Singapore",
        state: "Singapore",
        country: "Singapore",
        postalCode: "778899",
      },
    });
    const newClient = (await expectOkJson(clientRes, "create client for auto-log")) as { clientId: string };

    let hasCreateLog = false;
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const res = await request.get(`${baseURL}/api/logs?clientId=${newClient.clientId}&limit=50`, {
        headers: { Authorization: `Bearer ${agentToken}` },
      });
      const payload = (await expectOkJson(res, "poll auto-generated log")) as {
        data?: Array<{ action: string; clientId: string }>;
      };
      hasCreateLog = payload.data?.some(
        (row) => row.clientId === newClient.clientId && row.action === "CREATE",
      ) ?? false;
      if (hasCreateLog) break;
      await new Promise((r) => setTimeout(r, 1000));
    }

    expect(hasCreateLog, "CREATE audit log should be auto-generated on client creation").toBeTruthy();
  });
});
