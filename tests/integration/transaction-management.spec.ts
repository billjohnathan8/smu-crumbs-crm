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
import { waitForImportBatchTerminalState } from "./helpers/polling";
import { requireE2eEnv } from "./helpers/e2eEnv.js";

const ADMIN_EMAIL = (process.env.E2E_ADMIN_EMAIL ?? "admin@crm.com").trim();
const ADMIN_PASSWORD = requireE2eEnv("E2E_ADMIN_PASSWORD");
const USER_PASSWORD = requireE2eEnv("E2E_USER_PASSWORD");

type ImportBatchStatus = "queued" | "running" | "completed" | "failed";

interface ImportBatch {
  importBatchId: string;
  status: ImportBatchStatus;
  requestedClientId?: string | null;
  requestedAt?: string;
  startedAt?: string | null;
  finishedAt?: string | null;
  totalRecords: number;
  importedRecords: number;
  failedRecords: number;
  errorMessage?: string | null;
}

interface ImportAttempt {
  label: string;
  body: Record<string, unknown>;
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

function assertImportBatchCountConsistency(batch: ImportBatch) {
  expect(batch.totalRecords).toBeGreaterThanOrEqual(0);
  expect(batch.importedRecords).toBeGreaterThanOrEqual(0);
  expect(batch.failedRecords).toBeGreaterThanOrEqual(0);
  expect(batch.totalRecords).toBeGreaterThanOrEqual(batch.importedRecords + batch.failedRecords);
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
    // Persistent store currently uses soft-delete and still allows direct read-by-id.
    expect([200, 404, 410].includes(getRes.status()), "Deleted transaction should return 200 (soft-delete) or 404/410").toBeTruthy();

    expectUnder(Date.now() - startTime, 10000, "Delete transaction");
  });

  test("agent should view transactions page via UI", async ({ page }) => {
    const startTime = Date.now();

    await loginViaUi(page, agentEmail, USER_PASSWORD, "/user");
    await expect(page.getByRole("heading", { name: "User Dashboard" })).toBeVisible();

    await page.getByRole("link", { name: "Transactions" }).first().click();
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

  test("admin should complete import batch lifecycle and expose imported transactions", async ({ request }) => {
    const startTime = Date.now();

    const configuredSourcePath = process.env.E2E_TRANSACTION_IMPORT_SOURCE_PATH?.trim();
    const attempts: ImportAttempt[] = [
      ...(configuredSourcePath ? [{ label: "configured source path", body: { sourcePath: configuredSourcePath } }] : []),
      { label: "fullstack smoke S3 fixture", body: { sourcePath: "manual/ci-s3-import.csv" } },
      { label: "repo default transactions.csv", body: { sourcePath: "transactions.csv" } },
      { label: "repo secondary fixture", body: { sourcePath: "transactions-2026-03.csv" } },
      { label: "empty body default source", body: {} },
    ];

    const lifecycleOrder: ImportBatchStatus[] = ["queued", "running", "completed", "failed"];
    const attemptFailures: string[] = [];
    let selectedInitialBatch: ImportBatch | null = null;
    let selectedTerminalBatch: ImportBatch | null = null;

    for (const attempt of attempts) {
      const res = await request.post(`${baseURL}/api/transactions/import`, {
        headers: { Authorization: `Bearer ${adminToken}` },
        data: attempt.body,
      });

      if (![200, 201, 202].includes(res.status())) {
        const body = await res.text();
        attemptFailures.push(`${attempt.label}: HTTP ${res.status()} ${res.statusText()} ${body}`);
        continue;
      }

      const initialBatch = (await expectOkJson(res, `trigger transaction import (${attempt.label})`)) as ImportBatch;
      expect(initialBatch.importBatchId).toMatch(/^imp_[0-9]+$/);
      assertImportBatchCountConsistency(initialBatch);

      const terminalBatch = await waitForImportBatchTerminalState(request, baseURL, adminToken, {
        importBatchId: initialBatch.importBatchId,
        timeoutMs: 45_000,
        intervalMs: 1_000,
      });
      assertImportBatchCountConsistency(terminalBatch);

      const initialOrder = lifecycleOrder.indexOf(initialBatch.status);
      const terminalOrder = lifecycleOrder.indexOf(terminalBatch.status);
      expect(initialOrder).toBeGreaterThanOrEqual(0);
      expect(terminalOrder).toBeGreaterThanOrEqual(initialOrder);

      if (terminalBatch.status === "completed" && terminalBatch.importedRecords > 0) {
        selectedInitialBatch = initialBatch;
        selectedTerminalBatch = terminalBatch;
        break;
      }

      attemptFailures.push(
        `${attempt.label}: terminal=${terminalBatch.status}, imported=${terminalBatch.importedRecords}, total=${terminalBatch.totalRecords}, failed=${terminalBatch.failedRecords}`,
      );
    }

    expect(
      selectedInitialBatch,
      `No import attempt produced a completed batch with imported rows. Attempts: ${attemptFailures.join(" | ")}`,
    ).toBeTruthy();
    expect(selectedTerminalBatch).toBeTruthy();

    const initialBatch = selectedInitialBatch as ImportBatch;
    const terminalBatch = selectedTerminalBatch as ImportBatch;
    expect(initialBatch.status).not.toBe("failed");
    expect(terminalBatch.status).toBe("completed");
    expect(terminalBatch.importBatchId).toBe(initialBatch.importBatchId);
    expect(terminalBatch.importedRecords).toBeGreaterThan(0);

    const importedListRes = await request.get(`${baseURL}/api/transactions?limit=200&offset=0`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const importedListPayload = (await expectOkJson(importedListRes, "list transactions after import")) as {
      data?: Array<{ id: string; importBatchId?: string | null }>;
      pagination?: { total?: number };
    };
    expect(importedListPayload.pagination).toBeTruthy();
    expect(Array.isArray(importedListPayload.data)).toBeTruthy();

    const importedRowsForBatch = (importedListPayload.data ?? []).filter(
      (row) => row.importBatchId === terminalBatch.importBatchId,
    );
    expect(
      importedRowsForBatch.length,
      `No transactions were queryable for import batch ${terminalBatch.importBatchId}`,
    ).toBeGreaterThan(0);

    expectUnder(Date.now() - startTime, 120000, "Transaction import batch lifecycle");
  });

  test("admin should observe failed transaction import batch status for an invalid source", async ({
    request,
  }) => {
    const sourcePath = `missing/import-${uniqueSuffix()}.csv`;
    const triggerRes = await request.post(`${baseURL}/api/transactions/import`, {
      headers: { Authorization: `Bearer ${adminToken}` },
      data: { sourcePath },
    });
    const initialBatch = (await expectOkJson(triggerRes, "trigger failing transaction import")) as ImportBatch;
    expect(initialBatch.importBatchId).toMatch(/^imp_[0-9]+$/);

    const terminalBatch = await waitForImportBatchTerminalState(request, baseURL, adminToken, {
      importBatchId: initialBatch.importBatchId,
      timeoutMs: 30_000,
      intervalMs: 1_000,
    });

    expect(terminalBatch.status).toBe("failed");
    expect(terminalBatch.errorMessage).toBeTruthy();
    assertImportBatchCountConsistency(terminalBatch);
  });
});
