/**
 * Communication Tracking Integration Tests (Feature 3)
 *
 * Tests the communication subsystem: creating email communications,
 * retrieving communication status, and listing communications by client.
 *
 * Prerequisites:
 * - Backend services running (user, client, log)
 * - Database (PostgreSQL) with seeded admin
 * - LocalStack for log Lambda (communication endpoints)
 *
 * Run with: npm test
 */

import {
  test,
  expect,
  type APIRequestContext,
  type APIResponse,
} from "@playwright/test";
import { createHmac } from "node:crypto";
import { requireE2eEnv, requireJwtVerificationSecret } from "./helpers/e2eEnv.js";

const ADMIN_EMAIL = (process.env.E2E_ADMIN_EMAIL ?? "admin@crm.com").trim();
const ADMIN_PASSWORD = requireE2eEnv("E2E_ADMIN_PASSWORD");
const USER_PASSWORD = requireE2eEnv("E2E_USER_PASSWORD");
const JWT_HMAC_SECRET = requireJwtVerificationSecret();

function base64UrlJson(payload: object): string {
  return Buffer.from(JSON.stringify(payload)).toString("base64url");
}

function mintServiceToken(sub = "svc_worker"): string {
  const header = base64UrlJson({ alg: "HS256", typ: "JWT" });
  const now = Math.floor(Date.now() / 1000);
  const body = base64UrlJson({ sub, role: "service", iat: now, exp: now + 3600 });
  const signingInput = `${header}.${body}`;
  const signature = createHmac("sha256", JWT_HMAC_SECRET)
    .update(signingInput)
    .digest("base64url");
  return `${signingInput}.${signature}`;
}

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

test.describe("Communication Tracking (Feature 3)", () => {
  let baseURL: string;
  let adminToken: string;
  let agentToken: string;
  let agentUserId: string;
  let clientId: string;
  let clientEmail: string;

  test.beforeAll(async ({ request, baseURL: rawBaseURL }) => {
    baseURL = normalizeBaseURL(rawBaseURL);
    adminToken = await loginViaApi(request, baseURL, ADMIN_EMAIL, ADMIN_PASSWORD);

    // Create an agent user
    const agentEmailAddr = `it-comm-agent-${uniqueSuffix()}@example.com`;
    const createRes = await request.post(`${baseURL}/api/users`, {
      headers: { Authorization: `Bearer ${adminToken}` },
      data: {
        firstName: "CommTest",
        lastName: "Agent",
        email: agentEmailAddr,
        role: "user",
        sendInviteEmail: false,
        temporaryPassword: USER_PASSWORD,
      },
    });
    const agentUser = (await expectOkJson(createRes, "create agent for communication tests")) as { id: string };
    agentUserId = agentUser.id;

    agentToken = await loginViaApi(request, baseURL, agentEmailAddr, USER_PASSWORD);

    // Create a client to use in communication tests
    const suffix = uniqueSuffix();
    clientEmail = `comm-client-${suffix}@example.com`;
    const clientRes = await request.post(`${baseURL}/api/clients`, {
      headers: { Authorization: `Bearer ${agentToken}` },
      data: {
        firstName: "CommClient",
        lastName: "Test",
        dateOfBirth: "1993-04-25",
        gender: "Male",
        emailAddress: clientEmail,
        phoneNumber: `+1555${Math.floor(Math.random() * 9_000_000 + 1_000_000)}`,
        address: "400 Comm Blvd",
        city: "Singapore",
        state: "Singapore",
        country: "Singapore",
        postalCode: "556677",
      },
    });
    const client = (await expectOkJson(clientRes, "create client for comms")) as { clientId: string };
    clientId = client.clientId;
  });

  test("should create a communication record via API", async ({ request }) => {
    const startTime = Date.now();

    const res = await request.post(`${baseURL}/api/communications`, {
      headers: { Authorization: `Bearer ${agentToken}` },
      data: {
        clientId,
        userId: agentUserId,
        toEmail: clientEmail,
        subject: "Welcome to Scrooge Bank",
        body: "Dear client, welcome to our CRM platform.",
        channel: "email",
      },
    });

    const comm = (await expectOkJson(res, "create communication")) as {
      communicationId: string;
      clientId: string;
      status: string;
    };

    expect(comm.communicationId).toBeTruthy();
    expect(comm.clientId).toBe(clientId);
    expect(comm.status).toBeTruthy();

    expectUnder(Date.now() - startTime, 10000, "Create communication");
  });

  test("should retrieve a communication by ID", async ({ request }) => {
    const startTime = Date.now();

    const createRes = await request.post(`${baseURL}/api/communications`, {
      headers: { Authorization: `Bearer ${agentToken}` },
      data: {
        clientId,
        userId: agentUserId,
        toEmail: clientEmail,
        subject: "Account Update",
        body: "Your account details have been updated.",
        channel: "email",
      },
    });
    const created = (await expectOkJson(createRes, "create comm for get")) as { communicationId: string };

    const getRes = await request.get(`${baseURL}/api/communications/${created.communicationId}`, {
      headers: { Authorization: `Bearer ${agentToken}` },
    });
    const comm = (await expectOkJson(getRes, "get communication by ID")) as {
      communicationId: string;
      clientId: string;
      subject: string;
      status: string;
    };

    expect(comm.communicationId).toBe(created.communicationId);
    expect(comm.clientId).toBe(clientId);
    expect(comm.subject).toBe("Account Update");
    expect(comm.status).toBeTruthy();

    expectUnder(Date.now() - startTime, 10000, "Get communication by ID");
  });

  test("should list communications for a specific client", async ({ request }) => {
    const startTime = Date.now();

    const res = await request.get(`${baseURL}/api/clients/${clientId}/communications?limit=50&offset=0`, {
      headers: { Authorization: `Bearer ${agentToken}` },
    });
    const payload = (await expectOkJson(res, "list client communications")) as {
      data?: Array<{ communicationId: string; clientId: string }>;
    };

    expect(Array.isArray(payload.data)).toBeTruthy();
    expect(payload.data!.length).toBeGreaterThanOrEqual(1);
    expect(payload.data!.every((c) => c.clientId === clientId)).toBeTruthy();

    expectUnder(Date.now() - startTime, 10000, "List client communications");
  });

  test("should list queued communications", async ({ request }) => {
    const startTime = Date.now();

    const res = await request.get(`${baseURL}/api/communications/queued`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const payload = (await expectOkJson(res, "list queued communications")) as {
      data?: Array<{ communicationId: string; status: string }>;
    };

    expect(Array.isArray(payload.data)).toBeTruthy();

    expectUnder(Date.now() - startTime, 10000, "List queued communications");
  });

  test("should enforce service-only communication status updates", async ({ request }) => {
    const startTime = Date.now();

    const createRes = await request.post(`${baseURL}/api/communications`, {
      headers: { Authorization: `Bearer ${agentToken}` },
      data: {
        clientId,
        userId: agentUserId,
        toEmail: clientEmail,
        subject: "Status Update Test",
        body: "Testing status update flow.",
        channel: "email",
      },
    });
    const created = (await expectOkJson(createRes, "create comm for status update")) as { communicationId: string };

    const adminUpdateRes = await request.patch(`${baseURL}/api/communications/${created.communicationId}/status`, {
      headers: { Authorization: `Bearer ${adminToken}` },
      data: {
        status: "sent",
      },
    });

    expect(adminUpdateRes.status()).toBe(403);

    const serviceToken = mintServiceToken();
    const serviceUpdateRes = await request.patch(
      `${baseURL}/api/communications/${created.communicationId}/status`,
      {
        headers: { Authorization: `Bearer ${serviceToken}` },
        data: {
          status: "sent",
        },
      },
    );
    const updated = (await expectOkJson(serviceUpdateRes, "update communication status as service")) as {
      communicationId: string;
      status: string;
    };

    expect(updated.communicationId).toBe(created.communicationId);
    expect(updated.status).toBe("sent");

    expectUnder(Date.now() - startTime, 10000, "Update communication status");
  });
});
