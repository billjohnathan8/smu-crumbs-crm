/**
 * Client Profile Management Integration Tests (Feature 2)
 *
 * Tests the full client profile lifecycle: Create, Get, Update, Verify, Delete.
 * Each operation is validated against the live backend and audit log generation
 * is confirmed where required.
 *
 * Prerequisites:
 * - Backend services running (user, client, log)
 * - Database (PostgreSQL) with seeded admin
 * - LocalStack for log Lambda
 *
 * Run with: npm test
 */

import { createHmac, randomUUID } from "node:crypto";
import {
  test,
  expect,
  type APIRequestContext,
  type APIResponse,
  type Page,
} from "@playwright/test";
import { requireE2eEnv, requireJwtVerificationSecret } from "./helpers/e2eEnv.js";

const ADMIN_EMAIL = (process.env.E2E_ADMIN_EMAIL ?? "admin@crm.com").trim();
const ADMIN_PASSWORD = requireE2eEnv("E2E_ADMIN_PASSWORD");
const USER_PASSWORD = requireE2eEnv("E2E_USER_PASSWORD");
const VERIFICATION_TOKEN_SECRET = requireJwtVerificationSecret();

function base64UrlJson(payload: object): string {
  return Buffer.from(JSON.stringify(payload)).toString("base64url");
}

function mintVerificationToken(clientId: string, secret: string): string {
  const header = base64UrlJson({ alg: "HS256", typ: "JWT" });
  const exp = Math.floor(Date.now() / 1000) + 60 * 60;
  const body = base64UrlJson({ clientId, exp, jti: randomUUID() });
  const signingInput = `${header}.${body}`;
  const signature = createHmac("sha256", secret).update(signingInput).digest("base64url");
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

async function loginAsAdmin(request: APIRequestContext, baseURL: string): Promise<string> {
  const res = await request.post(`${baseURL}/api/auth/login`, {
    data: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
  });
  const payload = (await expectOkJson(res, "admin login")) as { accessToken: string };
  expect(payload.accessToken).toBeTruthy();
  return payload.accessToken;
}

async function createAgentUser(
  request: APIRequestContext,
  baseURL: string,
  adminToken: string,
): Promise<{ email: string; password: string; id: string }> {
  const email = `it-agent-${uniqueSuffix()}@example.com`;
  const res = await request.post(`${baseURL}/api/users`, {
    headers: { Authorization: `Bearer ${adminToken}` },
    data: {
      firstName: "ClientTest",
      lastName: "Agent",
      email,
      role: "user",
      sendInviteEmail: false,
      temporaryPassword: USER_PASSWORD,
    },
  });
  const payload = (await expectOkJson(res, "create agent user")) as { id: string };
  expect(payload.id).toBeTruthy();
  return { email, password: USER_PASSWORD, id: payload.id };
}

async function loginAsUser(request: APIRequestContext, baseURL: string, email: string, password: string): Promise<string> {
  const res = await request.post(`${baseURL}/api/auth/login`, {
    data: { email, password },
  });
  const payload = (await expectOkJson(res, "user login")) as { accessToken: string };
  expect(payload.accessToken).toBeTruthy();
  return payload.accessToken;
}

async function createClientViaApi(
  request: APIRequestContext,
  baseURL: string,
  token: string,
): Promise<{ clientId: string; emailAddress: string }> {
  const suffix = uniqueSuffix();
  const emailAddress = `client-profile-${suffix}@example.com`;
  const phoneNumber = `+1555${Math.floor(Math.random() * 9_000_000 + 1_000_000)}`;

  const res = await request.post(`${baseURL}/api/clients`, {
    headers: { Authorization: `Bearer ${token}` },
    data: {
      firstName: "Profile",
      lastName: "Test",
      dateOfBirth: "1990-05-20",
      gender: "Male",
      emailAddress,
      phoneNumber,
      address: "456 Test Ave",
      city: "Singapore",
      state: "Singapore",
      country: "Singapore",
      postalCode: "567890",
    },
  });

  const payload = (await expectOkJson(res, "create client")) as { clientId: string };
  expect(payload.clientId).toBeTruthy();
  return { clientId: payload.clientId, emailAddress };
}

function expectUnder(durationMs: number, limitMs: number, label: string) {
  expect(durationMs, `${label} took ${durationMs}ms`).toBeLessThan(limitMs);
}

test.describe("Client Profile Management (Feature 2)", () => {
  let baseURL: string;
  let adminToken: string;
  let agentUser: { email: string; password: string; id: string };
  let agentToken: string;

  test.beforeAll(async ({ request, baseURL: rawBaseURL }) => {
    baseURL = normalizeBaseURL(rawBaseURL);
    adminToken = await loginAsAdmin(request, baseURL);
    agentUser = await createAgentUser(request, baseURL, adminToken);
    agentToken = await loginAsUser(request, baseURL, agentUser.email, agentUser.password);
  });

  test("agent should create a client profile via UI and receive a client ID", async ({ page }) => {
    const startTime = Date.now();

    await page.goto("/login");
    await page.fill('[data-testid="email-input"]', agentUser.email);
    await page.fill('[data-testid="password-input"]', agentUser.password);
    await page.click('[data-testid="login-submit-button"]');
    await expect(page).toHaveURL(/\/user$/, { timeout: 10000 });

    await page.click('a[href="/user/clients/new"]');
    await expect(page).toHaveURL(/\/user\/clients\/new$/);

    const suffix = uniqueSuffix();
    await page.fill('input[name="firstName"]', "UICreate");
    await page.fill('input[name="lastName"]', "Client");
    await page.fill('input[name="dateOfBirth"]', "1985-03-15");
    await page.selectOption('select[name="gender"]', "Female");
    await page.fill('input[name="emailAddress"]', `ui-create-${suffix}@example.com`);
    await page.fill('input[name="phoneNumber"]', `+6591234${Math.floor(Math.random() * 9000 + 1000)}`);
    await page.fill('input[name="address"]', "789 UI Street");
    await page.fill('input[name="city"]', "Singapore");
    await page.fill('input[name="state"]', "Singapore");
    await page.selectOption('select[name="country"]', { label: "Singapore" });
    await page.fill('input[name="postalCode"]', "654321");

    await page.click('button[type="submit"]');
    await expect(page).toHaveURL(/\/user$/, { timeout: 10000 });

    expectUnder(Date.now() - startTime, 20000, "Create client via UI");
  });

  test("should retrieve a client profile by ID via API", async ({ request }) => {
    const startTime = Date.now();
    const { clientId, emailAddress } = await createClientViaApi(request, baseURL, agentToken);

    const res = await request.get(`${baseURL}/api/clients/${clientId}`, {
      headers: { Authorization: `Bearer ${agentToken}` },
    });
    const client = (await expectOkJson(res, "get client by ID")) as {
      clientId: string;
      firstName: string;
      lastName: string;
      emailAddress: string;
    };

    expect(client.clientId).toBe(clientId);
    expect(client.firstName).toBe("Profile");
    expect(client.lastName).toBe("Test");
    expect(client.emailAddress.toLowerCase()).toBe(emailAddress.toLowerCase());

    expectUnder(Date.now() - startTime, 10000, "Get client profile by ID");
  });

  test("should update a client profile via API", async ({ request }) => {
    const startTime = Date.now();
    const { clientId } = await createClientViaApi(request, baseURL, agentToken);

    const res = await request.put(`${baseURL}/api/clients/${clientId}`, {
      headers: { Authorization: `Bearer ${agentToken}` },
      data: {
        firstName: "Updated",
        lastName: "Name",
        dateOfBirth: "1990-05-20",
        gender: "Male",
        emailAddress: `updated-${uniqueSuffix()}@example.com`,
        phoneNumber: `+1555${Math.floor(Math.random() * 9_000_000 + 1_000_000)}`,
        address: "999 Updated Road",
        city: "Singapore",
        state: "Singapore",
        country: "Singapore",
        postalCode: "111222",
      },
    });

    const updated = (await expectOkJson(res, "update client")) as {
      clientId: string;
      firstName: string;
      lastName: string;
      address: string;
    };

    expect(updated.clientId).toBe(clientId);
    expect(updated.firstName).toBe("Updated");
    expect(updated.lastName).toBe("Name");
    expect(updated.address).toBe("999 Updated Road");

    expectUnder(Date.now() - startTime, 10000, "Update client profile");
  });

  test("should submit public verification documents via API and set pending status", async ({ request }) => {
    const startTime = Date.now();
    const { clientId } = await createClientViaApi(request, baseURL, agentToken);
    const verificationToken = mintVerificationToken(clientId, VERIFICATION_TOKEN_SECRET);

    const verifyRes = await request.post(`${baseURL}/api/clients/${clientId}/upload-verify`, {
      data: {
        verificationToken,
        primaryDocumentType: "NRIC",
        primaryDocumentRef: "primary-id.jpg",
        primaryDocumentBase64: Buffer.from([0xff, 0xd8, 0xff, 0x00, 0x11, 0x22]).toString("base64"),
        primaryDocumentMimeType: "image/jpeg",
        addressDocumentType: "UTILITY_BILL",
        addressDocumentRef: "proof-of-address.pdf",
        addressDocumentBase64: Buffer.from("%PDF-1.4 fake-proof-of-address").toString("base64"),
        addressDocumentMimeType: "application/pdf",
      },
    });
    const verifyPayload = (await expectOkJson(verifyRes, "submit client verification")) as {
      clientId: string;
      identityVerificationStatus: string;
    };

    expect(verifyPayload.clientId).toBe(clientId);
    expect(verifyPayload.identityVerificationStatus).toBe("pending");

    expectUnder(Date.now() - startTime, 10000, "Client identity verification");
  });

  test("should delete a client profile via API", async ({ request }) => {
    const startTime = Date.now();
    const { clientId } = await createClientViaApi(request, baseURL, agentToken);

    const deleteRes = await request.delete(`${baseURL}/api/clients/${clientId}`, {
      headers: { Authorization: `Bearer ${agentToken}` },
    });
    expect(deleteRes.ok(), `Delete client failed: ${deleteRes.status()}`).toBeTruthy();

    const getRes = await request.get(`${baseURL}/api/clients/${clientId}`, {
      headers: { Authorization: `Bearer ${agentToken}` },
    });
    expect([404, 410].includes(getRes.status()), "Deleted client should return 404 or 410").toBeTruthy();

    expectUnder(Date.now() - startTime, 10000, "Delete client profile");
  });

  test("client CRUD operations should generate audit log entries", async ({ request }) => {
    const { clientId } = await createClientViaApi(request, baseURL, agentToken);

    // Wait for CREATE audit log
    let hasCreateLog = false;
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const res = await request.get(`${baseURL}/api/logs?clientId=${clientId}&limit=50`, {
        headers: { Authorization: `Bearer ${agentToken}` },
      });
      const payload = (await expectOkJson(res, "list logs")) as {
        data?: Array<{ action: string; clientId: string }>;
      };
      hasCreateLog = payload.data?.some((row) => row.clientId === clientId && row.action === "CREATE") ?? false;
      if (hasCreateLog) break;
      await new Promise((r) => setTimeout(r, 1000));
    }
    expect(hasCreateLog, "CREATE audit log should exist for new client").toBeTruthy();

    // Update the client to trigger an UPDATE log
    await request.put(`${baseURL}/api/clients/${clientId}`, {
      headers: { Authorization: `Bearer ${agentToken}` },
      data: {
        firstName: "AuditUpdated",
        lastName: "Test",
        dateOfBirth: "1990-05-20",
        gender: "Male",
        emailAddress: `audit-updated-${uniqueSuffix()}@example.com`,
        phoneNumber: `+1555${Math.floor(Math.random() * 9_000_000 + 1_000_000)}`,
        address: "456 Test Ave",
        city: "Singapore",
        state: "Singapore",
        country: "Singapore",
        postalCode: "567890",
      },
    });

    let hasUpdateLog = false;
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const res = await request.get(`${baseURL}/api/logs?clientId=${clientId}&limit=50`, {
        headers: { Authorization: `Bearer ${agentToken}` },
      });
      const payload = (await expectOkJson(res, "list logs after update")) as {
        data?: Array<{ action: string; clientId: string }>;
      };
      hasUpdateLog = payload.data?.some((row) => row.clientId === clientId && row.action === "UPDATE") ?? false;
      if (hasUpdateLog) break;
      await new Promise((r) => setTimeout(r, 1000));
    }
    expect(hasUpdateLog, "UPDATE audit log should exist after client update").toBeTruthy();
  });
});
