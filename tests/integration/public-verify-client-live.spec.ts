import { createHmac } from "node:crypto";
import { expect, test } from "@playwright/test";
import { authHeaders, expectOkJson, normalizeBaseURL } from "./helpers/apiClient";
import { createAgentAndLogin, createClientForUser, loginAsSeedAdmin } from "./helpers/dataFactory";

const VERIFICATION_TOKEN_SECRET = (process.env.E2E_VERIFICATION_HMAC_SECRET ?? "dev-only-insecure-secret").trim();

function base64UrlJson(payload: object): string {
  return Buffer.from(JSON.stringify(payload)).toString("base64url");
}

function mintVerificationToken(clientId: string, secret: string): string {
  const header = base64UrlJson({ alg: "HS256", typ: "JWT" });
  const exp = Math.floor(Date.now() / 1000) + 60 * 60;
  const body = base64UrlJson({ clientId, exp });
  const signingInput = `${header}.${body}`;
  const signature = createHmac("sha256", secret).update(signingInput).digest("base64url");
  return `${signingInput}.${signature}`;
}

async function uploadVerificationDocuments(page: import("@playwright/test").Page): Promise<void> {
  const fileInputs = page.locator('input[type="file"]');
  await expect(fileInputs).toHaveCount(2);

  await fileInputs.nth(0).setInputFiles({
    name: "primary-id.jpg",
    mimeType: "image/jpeg",
    buffer: Buffer.from([0xff, 0xd8, 0xff, 0x00, 0x11, 0x22, 0x33]),
  });
  await fileInputs.nth(1).setInputFiles({
    name: "proof-of-address.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("%PDF-1.4 fake-proof-of-address"),
  });
}

test.describe("Public Verify Client Live Flow", () => {
  test("valid verification link uploads documents and sets pending status", async ({
    page,
    request,
    baseURL: rawBaseURL,
  }) => {
    const baseURL = normalizeBaseURL(rawBaseURL);
    const adminTokens = await loginAsSeedAdmin(request, baseURL);
    const agent = await createAgentAndLogin(request, baseURL, adminTokens.accessToken);
    const createdClient = await createClientForUser(request, baseURL, agent.tokens.accessToken);

    const verificationToken = mintVerificationToken(createdClient.clientId, VERIFICATION_TOKEN_SECRET);

    await page.goto(`/verify-client#token=${encodeURIComponent(verificationToken)}`);
    await expect(page.getByRole("heading", { name: "Identity Verification" })).toBeVisible();

    await uploadVerificationDocuments(page);
    await page.getByRole("button", { name: "Upload & Verify" }).click();

    await expect(
      page.getByText("Documents uploaded and verification requested. Thank you."),
    ).toBeVisible();

    const clientResponse = await request.get(`${baseURL}/api/clients/${createdClient.clientId}`, {
      headers: authHeaders(agent.tokens.accessToken),
    });
    const client = await expectOkJson<{ identityVerificationStatus: string }>(
      clientResponse,
      "read verified client",
    );
    expect(client.identityVerificationStatus).toBe("pending");
  });

  test("invalid verification token signature surfaces live failure state", async ({
    page,
    request,
    baseURL: rawBaseURL,
  }) => {
    const baseURL = normalizeBaseURL(rawBaseURL);
    const adminTokens = await loginAsSeedAdmin(request, baseURL);
    const agent = await createAgentAndLogin(request, baseURL, adminTokens.accessToken);
    const createdClient = await createClientForUser(request, baseURL, agent.tokens.accessToken);

    const invalidToken = mintVerificationToken(createdClient.clientId, "wrong-secret");

    await page.goto(`/verify-client#token=${encodeURIComponent(invalidToken)}`);
    await expect(page.getByRole("heading", { name: "Identity Verification" })).toBeVisible();

    await uploadVerificationDocuments(page);
    await page.getByRole("button", { name: "Upload & Verify" }).click();

    await expect(page.getByText(/unauthorized|invalid|expired|upload failed/i)).toBeVisible();
  });
});
