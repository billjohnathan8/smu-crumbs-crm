import { test, expect } from "@playwright/test";
import { authHeaders, expectOkJson, normalizeBaseURL } from "./helpers/apiClient";
import {
  createAccountForClient,
  createAgentAndLogin,
  createClientForUser,
  createTransactionAsAdmin,
  loginAsSeedAdmin,
} from "./helpers/dataFactory";
import { waitForAuditLogAction } from "./helpers/polling";

function uniqueSuffix(): string {
  return `${Date.now()}-${Math.floor(Math.random() * 100_000)}`;
}

interface AuditLogRowWithDetails {
  logId: string;
  action: string;
  clientId: string;
  attributeName?: string;
  beforeValue?: string | null;
  afterValue?: string | null;
}

test.describe("Update And Audit Side Effects (P1)", () => {
  let baseURL: string;
  let adminAccessToken: string;
  let agentAccessToken: string;

  test.beforeAll(async ({ request, baseURL: rawBaseURL }) => {
    baseURL = normalizeBaseURL(rawBaseURL);
    const adminTokens = await loginAsSeedAdmin(request, baseURL);
    adminAccessToken = adminTokens.accessToken;

    const agent = await createAgentAndLogin(request, baseURL, adminAccessToken, {
      firstName: "UpdateAudit",
      lastName: "Agent",
    });
    agentAccessToken = agent.tokens.accessToken;
  });

  test("account update persists changes and emits UPDATE audit log", async ({ request }) => {
    const client = await createClientForUser(request, baseURL, agentAccessToken, {
      firstName: "AcctUpdate",
      lastName: "Client",
      dateOfBirth: "1990-04-11",
      gender: "Female",
      address: "101 Update Lane",
      postalCode: "123123",
    });

    const initialBranchId = `BR-OLD-${uniqueSuffix()}`;
    const updatedBranchId = `BR-NEW-${uniqueSuffix()}`;

    const createdAccount = await createAccountForClient(
      request,
      baseURL,
      agentAccessToken,
      client.clientId,
      {
        accountType: "Savings",
        accountStatus: "Active",
        initialDeposit: 1000,
        currency: "SGD",
        branchId: initialBranchId,
      },
    );

    const updateRes = await request.put(`${baseURL}/api/accounts/${createdAccount.accountId}`, {
      headers: authHeaders(agentAccessToken),
      data: {
        accountType: "Checking",
        accountStatus: "Inactive",
        branchId: updatedBranchId,
      },
    });
    const updatedAccount = (await expectOkJson(updateRes, "update account")) as {
      accountId: string;
      accountType: string;
      accountStatus: string;
      branchId: string;
    };
    expect(updatedAccount.accountId).toBe(createdAccount.accountId);
    expect(updatedAccount.accountType).toBe("Checking");
    expect(updatedAccount.accountStatus).toBe("Inactive");
    expect(updatedAccount.branchId).toBe(updatedBranchId);

    const getRes = await request.get(`${baseURL}/api/accounts/${createdAccount.accountId}`, {
      headers: authHeaders(agentAccessToken),
    });
    const persistedAccount = (await expectOkJson(getRes, "get updated account")) as {
      accountId: string;
      accountType: string;
      accountStatus: string;
      branchId: string;
    };
    expect(persistedAccount.accountId).toBe(createdAccount.accountId);
    expect(persistedAccount.accountType).toBe("Checking");
    expect(persistedAccount.accountStatus).toBe("Inactive");
    expect(persistedAccount.branchId).toBe(updatedBranchId);

    const auditLog = (await waitForAuditLogAction(request, baseURL, agentAccessToken, {
      clientId: client.clientId,
      action: "UPDATE",
      limit: 100,
    })) as AuditLogRowWithDetails;

    expect(auditLog.logId).toBeTruthy();
    expect(auditLog.action).toBe("UPDATE");
    expect(auditLog.clientId).toBe(client.clientId);
    expect(auditLog.attributeName).toBe("accountType|accountStatus|branchId");
    expect(auditLog.beforeValue).toBe(`Savings|Active|${initialBranchId}`);
    expect(auditLog.afterValue).toBe(`Checking|Inactive|${updatedBranchId}`);
  });

  test("transaction update persists changes and emits UPDATE audit log", async ({ request }) => {
    const client = await createClientForUser(request, baseURL, agentAccessToken, {
      firstName: "TxnUpdate",
      lastName: "Client",
      dateOfBirth: "1987-03-08",
      gender: "Male",
      address: "202 Update Street",
      postalCode: "456456",
    });

    const createdTransaction = await createTransactionAsAdmin(
      request,
      baseURL,
      adminAccessToken,
      client.clientId,
      {
        transaction: "D",
        amount: 150,
        status: "Pending",
      },
    );

    const updateRes = await request.put(`${baseURL}/api/transactions/${createdTransaction.id}`, {
      headers: authHeaders(adminAccessToken),
      data: {
        transaction: "W",
        amount: 275,
        status: "Completed",
      },
    });
    const updatedTransaction = (await expectOkJson(updateRes, "update transaction")) as {
      id: string;
      clientId: string;
      transaction: string;
      amount: number;
      status: string;
    };
    expect(updatedTransaction.id).toBe(createdTransaction.id);
    expect(updatedTransaction.clientId).toBe(client.clientId);
    expect(updatedTransaction.transaction).toBe("W");
    expect(updatedTransaction.amount).toBe(275);
    expect(updatedTransaction.status).toBe("Completed");

    const getRes = await request.get(`${baseURL}/api/transactions/${createdTransaction.id}`, {
      headers: authHeaders(adminAccessToken),
    });
    const persistedTransaction = (await expectOkJson(getRes, "get updated transaction")) as {
      id: string;
      clientId: string;
      transaction: string;
      amount: number;
      status: string;
    };
    expect(persistedTransaction.id).toBe(createdTransaction.id);
    expect(persistedTransaction.clientId).toBe(client.clientId);
    expect(persistedTransaction.transaction).toBe("W");
    expect(persistedTransaction.amount).toBe(275);
    expect(persistedTransaction.status).toBe("Completed");

    const auditLog = (await waitForAuditLogAction(request, baseURL, adminAccessToken, {
      clientId: client.clientId,
      action: "UPDATE",
      limit: 100,
      timeoutMs: 45_000,
      intervalMs: 1_500,
    })) as AuditLogRowWithDetails;

    expect(auditLog.logId).toBeTruthy();
    expect(auditLog.action).toBe("UPDATE");
    expect(auditLog.clientId).toBe(client.clientId);
    expect(auditLog.attributeName).toBe("transaction|amount|status");
    expect(auditLog.beforeValue).toMatch(/^D\|150(?:\.00)?\|Pending$/);
    expect(auditLog.afterValue).toMatch(/^W\|275(?:\.00)?\|Completed$/);
  });
});
