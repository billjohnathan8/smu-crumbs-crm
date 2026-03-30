import { createHmac } from "node:crypto";
import { expect, test } from "@playwright/test";
import { authHeaders, normalizeBaseURL } from "./helpers/apiClient";
import {
  createAgentPairAndLogin,
  createClientForUser,
  loginAsSeedAdmin,
} from "./helpers/dataFactory";

const VERIFICATION_TOKEN_SECRET = (
  process.env.E2E_VERIFICATION_HMAC_SECRET ?? "dev-only-insecure-secret"
).trim();

function base64UrlJson(payload: object): string {
  return Buffer.from(JSON.stringify(payload)).toString("base64url");
}

function mintVerificationToken(clientId: string, expSecondsFromNow: number): string {
  const header = base64UrlJson({ alg: "HS256", typ: "JWT" });
  const exp = Math.floor(Date.now() / 1000) + expSecondsFromNow;
  const body = base64UrlJson({ clientId, exp });
  const signingInput = `${header}.${body}`;
  const signature = createHmac("sha256", VERIFICATION_TOKEN_SECRET)
    .update(signingInput)
    .digest("base64url");
  return `${signingInput}.${signature}`;
}

function validUploadPayload(clientId: string, ttlSeconds: number) {
  return {
    verificationToken: mintVerificationToken(clientId, ttlSeconds),
    primaryDocumentType: "NRIC",
    primaryDocumentRef: "primary-id.jpg",
    primaryDocumentBase64: Buffer.from([0xff, 0xd8, 0xff, 0x00, 0x11, 0x22]).toString("base64"),
    primaryDocumentMimeType: "image/jpeg",
    addressDocumentType: "UTILITY_BILL",
    addressDocumentRef: "proof-of-address.pdf",
    addressDocumentBase64: Buffer.from("%PDF-1.4 proof").toString("base64"),
    addressDocumentMimeType: "application/pdf",
  };
}

test.describe("Security Adversarial API Checks", () => {
  test("rejects malformed, injected, replayed, expired, and over-posted verification payloads", async ({
    request,
    baseURL: rawBaseURL,
  }) => {
    const baseURL = normalizeBaseURL(rawBaseURL);
    const admin = await loginAsSeedAdmin(request, baseURL);
    const { agentA } = await createAgentPairAndLogin(request, baseURL, admin.accessToken);
    const { clientId } = await createClientForUser(request, baseURL, agentA.tokens.accessToken);

    const injectionPayload = {
      ...validUploadPayload(clientId, 3600),
      primaryDocumentRef: "' OR 1=1 --.jpg",
    };
    const injectionRes = await request.post(`${baseURL}/api/clients/${clientId}/upload-verify`, {
      data: injectionPayload,
    });
    expect(injectionRes.status()).toBe(400);

    const overPostingRes = await request.post(`${baseURL}/api/clients/${clientId}/upload-verify`, {
      data: {
        ...validUploadPayload(clientId, 3600),
        assignedAgentId: "usr_attacker",
      },
    });
    expect(overPostingRes.status()).toBe(400);

    const expiredRes = await request.post(`${baseURL}/api/clients/${clientId}/upload-verify`, {
      data: validUploadPayload(clientId, -60),
    });
    expect(expiredRes.status()).toBe(401);
    const expiredBody = await expiredRes.text();
    expect(expiredBody.toLowerCase()).not.toContain("token");

    const replayPayload = validUploadPayload(clientId, 3600);
    const firstReplayAttempt = await request.post(`${baseURL}/api/clients/${clientId}/upload-verify`, {
      data: replayPayload,
    });
    expect(firstReplayAttempt.status()).toBe(200);
    const secondReplayAttempt = await request.post(`${baseURL}/api/clients/${clientId}/upload-verify`, {
      data: replayPayload,
    });
    expect(secondReplayAttempt.status()).toBe(401);

    const idemPayload = validUploadPayload(clientId, 3600);
    const idemKey = "dup-submission-key";
    const firstIdemRes = await request.post(`${baseURL}/api/clients/${clientId}/upload-verify`, {
      headers: { "Idempotency-Key": idemKey },
      data: idemPayload,
    });
    expect([200, 409]).toContain(firstIdemRes.status());
    const secondIdemRes = await request.post(`${baseURL}/api/clients/${clientId}/upload-verify`, {
      headers: { "Idempotency-Key": idemKey },
      data: validUploadPayload(clientId, 3600),
    });
    expect(secondIdemRes.status()).toBe(409);
  });

  test("enforces auth and ownership boundaries for protected client endpoints", async ({
    request,
    baseURL: rawBaseURL,
  }) => {
    const baseURL = normalizeBaseURL(rawBaseURL);
    const admin = await loginAsSeedAdmin(request, baseURL);
    const { agentA, agentB } = await createAgentPairAndLogin(request, baseURL, admin.accessToken);
    const created = await createClientForUser(request, baseURL, agentA.tokens.accessToken);

    const unauthRes = await request.get(`${baseURL}/api/clients`);
    expect(unauthRes.status()).toBe(401);

    const bypassRes = await request.get(`${baseURL}/api/clients/${created.clientId}`, {
      headers: authHeaders(agentB.tokens.accessToken),
    });
    expect(bypassRes.status()).toBe(404);
  });
});
