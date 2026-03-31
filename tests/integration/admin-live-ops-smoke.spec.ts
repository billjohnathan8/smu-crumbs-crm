import { expect, test, type Page } from "@playwright/test";
import { authHeaders, expectOkJson, normalizeBaseURL, pollUntil } from "./helpers/apiClient";
import {
  createAgentAndLogin,
  createClientForUser,
  loginAsSeedAdmin,
} from "./helpers/dataFactory";
import { uniqueId } from "./helpers/testData";

const ADMIN_EMAIL = (process.env.E2E_ADMIN_EMAIL ?? "admin@crm.com").trim();
const ADMIN_PASSWORD = (process.env.E2E_ADMIN_PASSWORD ?? "Scrooge@Bank2026!").trim();

interface AccountListResponse {
  data: Array<{
    accountId: string;
    clientId: string;
    accountType: "Savings" | "Checking" | "Business";
    accountStatus: "Active" | "Inactive" | "Pending";
    openingDate: string;
    initialDeposit: number;
    currency: string;
    branchId: string;
  }>;
}

async function loginViaUi(page: Page, email: string, password: string): Promise<void> {
  await page.goto("/login");
  await page.fill('[data-testid="email-input"]', email);
  await page.fill('[data-testid="password-input"]', password);
  await page.click('[data-testid="login-submit-button"]');
  await expect(page).toHaveURL(/\/admin$/);
}

test.describe("Admin Live Ops Smoke", () => {
  let baseURL: string;
  let seededClientId: string;

  test.beforeAll(async ({ request, baseURL: rawBaseURL }) => {
    baseURL = normalizeBaseURL(rawBaseURL);

    const adminTokens = await loginAsSeedAdmin(request, baseURL);
    const agent = await createAgentAndLogin(request, baseURL, adminTokens.accessToken);
    const createdClient = await createClientForUser(
      request,
      baseURL,
      agent.tokens.accessToken,
      {
        firstName: "Admin",
        lastName: "OpsClient",
      },
    );
    seededClientId = createdClient.clientId;
  });

  test("admin creates an account via live UI and persisted account is readable via API", async ({
    page,
    request,
  }) => {
    const branchId = `BR-${uniqueId()}`;

    await loginViaUi(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await expect(page.getByRole("heading", { name: "Admin Dashboard" })).toBeVisible();

    await page.goto(`/admin/clients/${seededClientId}/accounts`);
    await expect(page.getByRole("heading", { name: "Bank Accounts" })).toBeVisible();

    await page.getByRole("button", { name: /new account/i }).click();
    await expect(page.getByRole("heading", { name: "Create Account" })).toBeVisible();

    await page.getByLabel(/Initial Deposit/i).fill("1500");
    await page.getByLabel(/Branch ID/i).fill(branchId);
    await page.getByRole("button", { name: "Create Account" }).click();

    await expect(page.getByTestId("account-modal")).not.toBeVisible();
    await expect(page.getByText(branchId)).toBeVisible();

    const uiAccessToken = await page.evaluate(() => window.localStorage.getItem("authToken"));
    expect(uiAccessToken, "UI auth token missing after admin login").toBeTruthy();

    const accountsPayload = await pollUntil(
      async () => {
        const response = await request.get(
          `${baseURL}/api/clients/${seededClientId}/accounts?limit=200&offset=0`,
          {
            headers: authHeaders(uiAccessToken as string),
          },
        );
        return expectOkJson<AccountListResponse>(response, "read back client accounts");
      },
      (payload) => payload.data.some((account) => account.branchId === branchId),
      {
        timeoutMs: 15_000,
        intervalMs: 1_000,
        description: `account ${branchId} to persist`,
      },
    );

    const persisted = accountsPayload.data.find((account) => account.branchId === branchId);
    expect(persisted).toBeTruthy();
    expect(persisted?.clientId).toBe(seededClientId);
    expect(persisted?.initialDeposit).toBe(1500);
    expect(persisted?.accountStatus).toBe("Active");
  });

  test("admin sees failed import state in live transaction import UI", async ({ page }) => {
    const missingSourcePath = `missing/import-${uniqueId()}.csv`;

    await loginViaUi(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.goto("/admin/transactions");
    await expect(page.getByRole("heading", { name: "Transactions" })).toBeVisible();

    await page.getByPlaceholder("Override source path").fill(missingSourcePath);
    await page.getByRole("button", { name: "Start Import" }).click();

    const importPanel = page.getByTestId("transaction-import-panel");
    await expect(importPanel.getByText(/failed to read source/i).first()).toBeVisible();
    await expect(importPanel.locator("tbody span", { hasText: "failed" }).first()).toBeVisible();
  });

  test("admin risk-ops lookup shows failure state for invalid communication id", async ({
    page,
  }) => {
    await loginViaUi(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.goto("/admin/communications");
    await expect(page.getByRole("heading", { name: "Communications", level: 1 })).toBeVisible();

    const idLookupPanel = page.locator("div", { hasText: "Lookup by Communication ID" }).first();
    await idLookupPanel.getByPlaceholder("com_...").fill("invalid-communication-id");
    await page.getByRole("button", { name: /^Lookup$/ }).first().click();

    await expect(page.getByText(/invalid id|not found/i)).toBeVisible();
  });
});
