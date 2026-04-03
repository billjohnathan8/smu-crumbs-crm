import { test, expect, type APIRequestContext, type APIResponse } from "@playwright/test";
import { authHeaders, expectOkJson, normalizeBaseURL } from "./helpers/apiClient";
import {
  createAccountForClient,
  createAgentAndLogin,
  createClientForUser,
  createTransactionAsAdmin,
  loginAsSeedAdmin,
} from "./helpers/dataFactory";

function runTag(): string {
  return `${Date.now()}-${process.pid}`;
}

async function expectApiError(
  response: APIResponse,
  expectedStatus: number,
  expectedError?: "not_found" | "forbidden" | "unauthorized" | "validation_error" | "conflict" | "internal_error",
): Promise<void> {
  const bodyText = await response.text();
  expect(response.status(), `Unexpected status. Body: ${bodyText}`).toBe(expectedStatus);

  if (!bodyText) {
    return;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(bodyText);
  }
  catch {
    return;
  }

  if (expectedError && parsed && typeof parsed === "object" && "error" in parsed) {
    expect((parsed as { error?: string }).error).toBe(expectedError);
  }
}

async function createTransactionForClient(
  request: APIRequestContext,
  baseURL: string,
  adminToken: string,
  agentToken: string,
  clientId: string,
): Promise<{ id: string; clientId: string }> {
  const asAgent = await request.post(`${baseURL}/api/transactions`, {
    headers: authHeaders(agentToken),
    data: {
      clientId,
      transaction: "D",
      amount: 700,
      date: new Date().toISOString().split("T")[0],
      status: "Completed",
    },
  });

  if (asAgent.status() === 201) {
    return expectOkJson<{ id: string; clientId: string }>(asAgent, "agent create transaction");
  }

  await expectApiError(asAgent, 403, "forbidden");
  return createTransactionAsAdmin(request, baseURL, adminToken, clientId, {
    transaction: "D",
    amount: 700,
    status: "Completed",
  });
}

test.describe("Cross-Agent Data Isolation", () => {
  test("agent B cannot access agent A client/account/transaction resources", async ({
    request,
    baseURL: rawBaseURL,
  }) => {
    const baseURL = normalizeBaseURL(rawBaseURL);
    const seed = runTag();

    const admin = await loginAsSeedAdmin(request, baseURL);
    const agentA = await createAgentAndLogin(request, baseURL, admin.accessToken, {
      firstName: "Isolation",
      lastName: "AgentA",
      email: `it-iso-a-${seed}@example.com`,
    });
    const agentB = await createAgentAndLogin(request, baseURL, admin.accessToken, {
      firstName: "Isolation",
      lastName: "AgentB",
      email: `it-iso-b-${seed}@example.com`,
    });

    const clientA = await createClientForUser(request, baseURL, agentA.tokens.accessToken, {
      firstName: "Owner",
      lastName: "Client",
      emailAddress: `it-iso-client-${seed}@example.com`,
      phoneNumber: "+15551234567",
      dateOfBirth: "1990-01-01",
      gender: "Male",
      address: "101 Isolation Ave",
      city: "Singapore",
      state: "Singapore",
      country: "Singapore",
      postalCode: "123456",
    });
    const accountA = await createAccountForClient(
      request,
      baseURL,
      agentA.tokens.accessToken,
      clientA.clientId,
      {
        accountType: "Savings",
        accountStatus: "Active",
        initialDeposit: 1000,
        currency: "SGD",
        branchId: "SG-001",
      },
    );
    const transactionA = await createTransactionForClient(
      request,
      baseURL,
      admin.accessToken,
      agentA.tokens.accessToken,
      clientA.clientId,
    );

    const bGetClient = await request.get(`${baseURL}/api/clients/${clientA.clientId}`, {
      headers: authHeaders(agentB.tokens.accessToken),
    });
    await expectApiError(bGetClient, 404, "not_found");

    const bPutClient = await request.put(`${baseURL}/api/clients/${clientA.clientId}`, {
      headers: authHeaders(agentB.tokens.accessToken),
      data: {
        firstName: "Hacked",
        city: "Blocked",
      },
    });
    await expectApiError(bPutClient, 404, "not_found");

    const bDeleteClient = await request.delete(`${baseURL}/api/clients/${clientA.clientId}`, {
      headers: authHeaders(agentB.tokens.accessToken),
    });
    await expectApiError(bDeleteClient, 404, "not_found");

    const bGetAccount = await request.get(`${baseURL}/api/accounts/${accountA.accountId}`, {
      headers: authHeaders(agentB.tokens.accessToken),
    });
    await expectApiError(bGetAccount, 404, "not_found");

    const bPutAccount = await request.put(`${baseURL}/api/accounts/${accountA.accountId}`, {
      headers: authHeaders(agentB.tokens.accessToken),
      data: {
        branchId: "SG-002",
      },
    });
    await expectApiError(bPutAccount, 404, "not_found");

    const bDeleteAccount = await request.delete(`${baseURL}/api/accounts/${accountA.accountId}`, {
      headers: authHeaders(agentB.tokens.accessToken),
    });
    await expectApiError(bDeleteAccount, 404, "not_found");

    const bGetTransaction = await request.get(`${baseURL}/api/transactions/${transactionA.id}`, {
      headers: authHeaders(agentB.tokens.accessToken),
    });
    await expectApiError(bGetTransaction, 404, "not_found");

    const bListClientAccounts = await request.get(`${baseURL}/api/clients/${clientA.clientId}/accounts`, {
      headers: authHeaders(agentB.tokens.accessToken),
    });
    await expectApiError(bListClientAccounts, 404, "not_found");

    const bListClientTransactions = await request.get(
      `${baseURL}/api/clients/${clientA.clientId}/transactions?limit=20&offset=0`,
      {
        headers: authHeaders(agentB.tokens.accessToken),
      },
    );
    await expectApiError(bListClientTransactions, 403, "forbidden");

    const bFilterTransactionsByClient = await request.get(
      `${baseURL}/api/transactions?clientId=${encodeURIComponent(clientA.clientId)}&limit=20&offset=0`,
      {
        headers: authHeaders(agentB.tokens.accessToken),
      },
    );
    await expectApiError(bFilterTransactionsByClient, 403, "forbidden");

    const aGetClient = await request.get(`${baseURL}/api/clients/${clientA.clientId}`, {
      headers: authHeaders(agentA.tokens.accessToken),
    });
    const aClientPayload = await expectOkJson<{ clientId: string; firstName: string; city: string }>(
      aGetClient,
      "agent A get own client",
    );
    expect(aClientPayload.clientId).toBe(clientA.clientId);
    expect(aClientPayload.firstName).toBe("Owner");
    expect(aClientPayload.city).toBe("Singapore");

    const aGetAccount = await request.get(`${baseURL}/api/accounts/${accountA.accountId}`, {
      headers: authHeaders(agentA.tokens.accessToken),
    });
    const aAccountPayload = await expectOkJson<{ accountId: string; branchId: string; clientId: string }>(
      aGetAccount,
      "agent A get own account",
    );
    expect(aAccountPayload.accountId).toBe(accountA.accountId);
    expect(aAccountPayload.clientId).toBe(clientA.clientId);
    expect(aAccountPayload.branchId).toBe("SG-001");

    const aGetTransaction = await request.get(`${baseURL}/api/transactions/${transactionA.id}`, {
      headers: authHeaders(agentA.tokens.accessToken),
    });
    const aTransactionPayload = await expectOkJson<{ id: string; clientId: string }>(
      aGetTransaction,
      "agent A get own transaction",
    );
    expect(aTransactionPayload.id).toBe(transactionA.id);
    expect(aTransactionPayload.clientId).toBe(clientA.clientId);

    const aListAccounts = await request.get(`${baseURL}/api/clients/${clientA.clientId}/accounts?limit=20&offset=0`, {
      headers: authHeaders(agentA.tokens.accessToken),
    });
    const aAccountsPayload = await expectOkJson<{
      data: Array<{ accountId: string; clientId: string }>;
    }>(aListAccounts, "agent A list own client accounts");
    expect(aAccountsPayload.data.some((account) => account.accountId === accountA.accountId)).toBeTruthy();
    expect(aAccountsPayload.data.every((account) => account.clientId === clientA.clientId)).toBeTruthy();

    const aListClientTransactions = await request.get(
      `${baseURL}/api/clients/${clientA.clientId}/transactions?limit=20&offset=0`,
      {
        headers: authHeaders(agentA.tokens.accessToken),
      },
    );
    const aClientTransactionsPayload = await expectOkJson<{
      data: Array<{ id: string; clientId: string }>;
    }>(aListClientTransactions, "agent A list own client transactions");
    expect(
      aClientTransactionsPayload.data.some((transaction) => transaction.id === transactionA.id),
    ).toBeTruthy();
    expect(
      aClientTransactionsPayload.data.every((transaction) => transaction.clientId === clientA.clientId),
    ).toBeTruthy();

    const aFilterTransactionsByClient = await request.get(
      `${baseURL}/api/transactions?clientId=${encodeURIComponent(clientA.clientId)}&limit=20&offset=0`,
      {
        headers: authHeaders(agentA.tokens.accessToken),
      },
    );
    const aFilteredTransactionsPayload = await expectOkJson<{
      data: Array<{ id: string; clientId: string }>;
    }>(aFilterTransactionsByClient, "agent A filter own transactions by clientId");
    expect(
      aFilteredTransactionsPayload.data.some((transaction) => transaction.id === transactionA.id),
    ).toBeTruthy();
    expect(
      aFilteredTransactionsPayload.data.every((transaction) => transaction.clientId === clientA.clientId),
    ).toBeTruthy();
  });
});
