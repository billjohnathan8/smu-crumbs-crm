import { test, expect } from "@playwright/test";
import { gotoWithNetworkRetry } from "../helpers/auth";

function buildUnsignedJwt(payload: Record<string, unknown>): string {
  const header = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url");
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${header}.${body}.signature`;
}

test.describe("Client Verify Link (Mocked)", () => {
  test("shows invalid link state when token is missing", async ({ page, context }) => {
    await context.clearCookies();
    await gotoWithNetworkRetry(page, "/verify-client");

    await expect(page.getByText("Verification Link Invalid")).toBeVisible();
  });

  test("loads verification form when token payload is valid", async ({ page, context }) => {
    await context.clearCookies();
    const token = buildUnsignedJwt({
      clientId: "clt_001",
      exp: Math.floor(Date.now() / 1000) + 3600,
    });

    await gotoWithNetworkRetry(page, `/verify-client?token=${token}`);
    await expect(page.getByText("Identity Verification")).toBeVisible();
    await expect(page.getByText("Upload & Verify")).toBeVisible();
  });
});
