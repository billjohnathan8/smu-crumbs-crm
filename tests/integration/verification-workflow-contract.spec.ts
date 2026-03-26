import { expect, test, type APIRequestContext, type APIResponse } from "@playwright/test";
import { authHeaders, expectOkJson, normalizeBaseURL } from "./helpers/apiClient";
import { createAgentPairAndLogin, createClientForUser, loginAsSeedAdmin } from "./helpers/dataFactory";

interface ClientRecord {
  clientId: string;
  identityVerificationStatus: string;
}

async function expectErrorStatus(
  response: APIResponse,
  expectedStatus: number,
  operation: string,
): Promise<{ error?: string; message?: string }> {
  const bodyText = await response.text();
  expect(
    response.status(),
    `${operation} returned ${response.status()} ${response.statusText()}\n${bodyText}`,
  ).toBe(expectedStatus);
  return bodyText ? (JSON.parse(bodyText) as { error?: string; message?: string }) : {};
}

async function submitVerification(
  request: APIRequestContext,
  baseURL: string,
  token: string,
  clientId: string,
): Promise<{ clientId: string; identityVerificationStatus: string }> {
  const response = await request.post(`${baseURL}/api/clients/${clientId}/verify`, {
    headers: authHeaders(token),
    data: {
      approved: true,
    },
  });
  return expectOkJson<{ clientId: string; identityVerificationStatus: string }>(
    response,
    "submit client verification",
  );
}

async function getClient(
  request: APIRequestContext,
  baseURL: string,
  token: string,
  clientId: string,
): Promise<ClientRecord> {
  const response = await request.get(`${baseURL}/api/clients/${clientId}`, {
    headers: authHeaders(token),
  });
  return expectOkJson<ClientRecord>(response, "get client");
}

test.describe("Verification Workflow Governance Contract", () => {
  test("should enforce pending -> review approval governance and forbid non-admin review", async ({
    request,
    baseURL: rawBaseURL,
  }) => {
    const baseURL = normalizeBaseURL(rawBaseURL);
    const adminTokens = await loginAsSeedAdmin(request, baseURL);
    const { agentA, agentB } = await createAgentPairAndLogin(request, baseURL, adminTokens.accessToken);
    const { clientId } = await createClientForUser(request, baseURL, agentA.tokens.accessToken);

    const submitPayload = await submitVerification(request, baseURL, agentA.tokens.accessToken, clientId);
    expect(submitPayload.clientId).toBe(clientId);
    expect(submitPayload.identityVerificationStatus).toBe("pending");

    const pendingClient = await getClient(request, baseURL, agentA.tokens.accessToken, clientId);
    expect(pendingClient.identityVerificationStatus).toBe("pending");

    const nonAdminReview = await request.patch(`${baseURL}/api/clients/${clientId}/verify/review`, {
      headers: authHeaders(agentB.tokens.accessToken),
      data: { action: "approve" },
    });
    const nonAdminError = await expectErrorStatus(nonAdminReview, 403, "non-admin review");
    expect(nonAdminError.error).toBe("forbidden");

    const approveResponse = await request.patch(`${baseURL}/api/clients/${clientId}/verify/review`, {
      headers: authHeaders(adminTokens.accessToken),
      data: { action: "approve" },
    });
    const approvePayload = await expectOkJson<{ clientId: string; identityVerificationStatus: string }>(
      approveResponse,
      "admin approve review",
    );
    expect(approvePayload.clientId).toBe(clientId);
    expect(approvePayload.identityVerificationStatus).toBe("verified");

    const verifiedClient = await getClient(request, baseURL, adminTokens.accessToken, clientId);
    expect(verifiedClient.identityVerificationStatus).toBe("verified");

    const secondReview = await request.patch(`${baseURL}/api/clients/${clientId}/verify/review`, {
      headers: authHeaders(adminTokens.accessToken),
      data: { action: "reject" },
    });
    const secondReviewError = await expectErrorStatus(
      secondReview,
      409,
      "review non-pending verification client",
    );
    expect(secondReviewError.error).toBe("conflict");
  });

  test("should support admin rejection path and reject representative invalid payloads", async ({
    request,
    baseURL: rawBaseURL,
  }) => {
    const baseURL = normalizeBaseURL(rawBaseURL);
    const adminTokens = await loginAsSeedAdmin(request, baseURL);
    const { agentA } = await createAgentPairAndLogin(request, baseURL, adminTokens.accessToken);

    const { clientId: rejectedClientId } = await createClientForUser(request, baseURL, agentA.tokens.accessToken);
    await submitVerification(request, baseURL, agentA.tokens.accessToken, rejectedClientId);

    const rejectResponse = await request.patch(`${baseURL}/api/clients/${rejectedClientId}/verify/review`, {
      headers: authHeaders(adminTokens.accessToken),
      data: { action: "reject" },
    });
    const rejectPayload = await expectOkJson<{ clientId: string; identityVerificationStatus: string }>(
      rejectResponse,
      "admin reject review",
    );
    expect(rejectPayload.clientId).toBe(rejectedClientId);
    expect(rejectPayload.identityVerificationStatus).toBe("rejected");

    const rejectedClient = await getClient(request, baseURL, adminTokens.accessToken, rejectedClientId);
    expect(rejectedClient.identityVerificationStatus).toBe("rejected");

    const { clientId: invalidPayloadClientId } = await createClientForUser(
      request,
      baseURL,
      agentA.tokens.accessToken,
    );
    await submitVerification(request, baseURL, agentA.tokens.accessToken, invalidPayloadClientId);

    const invalidReview = await request.patch(`${baseURL}/api/clients/${invalidPayloadClientId}/verify/review`, {
      headers: authHeaders(adminTokens.accessToken),
      data: {},
    });
    const invalidReviewError = await expectErrorStatus(invalidReview, 400, "review with missing action");
    expect(invalidReviewError.error).toBe("validation_error");
  });
});
