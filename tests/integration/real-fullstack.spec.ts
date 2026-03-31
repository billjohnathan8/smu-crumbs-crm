import {
  expect,
  test,
  type APIRequestContext,
  type APIResponse,
  type Page,
} from "@playwright/test";

const ADMIN_EMAIL = (process.env.E2E_ADMIN_EMAIL ?? "admin@crm.com").trim();
const ADMIN_PASSWORD = (process.env.E2E_ADMIN_PASSWORD ?? "Scrooge@Bank2026!").trim();
const USER_PASSWORD = (process.env.E2E_USER_PASSWORD ?? "UserPass123!").trim();

function uniqueSuffix(): string {
  return `${Date.now()}-${Math.floor(Math.random() * 100_000)}`;
}

function normalizeBaseURL(baseURL: string | undefined): string {
  const value = (baseURL ?? process.env.PLAYWRIGHT_BASE_URL ?? "").trim();
  if (!value) {
    throw new Error("Playwright baseURL is required for integration tests");
  }
  return value.replace(/\/+$/, "");
}

async function expectOkJson(response: APIResponse, operation: string): Promise<unknown> {
  const body = await response.text();
  expect(response.ok(), `${operation} failed: ${response.status()} ${response.statusText()}\n${body}`).toBeTruthy();
  return body ? JSON.parse(body) : {};
}

async function loginViaUi(page: Page, email: string, password: string, expectedPath: string): Promise<void> {
  await page.goto("/login");
  await page.fill('[data-testid="email-input"]', email);
  await page.fill('[data-testid="password-input"]', password);
  await page.click('[data-testid="login-submit-button"]');
  await expect(page).toHaveURL(new RegExp(`${expectedPath}$`));
}

async function loginAsAdmin(request: APIRequestContext, baseURL: string): Promise<string> {
  const loginResponse = await request.post(`${baseURL}/api/auth/login`, {
    data: {
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD,
    },
  });
  const payload = (await expectOkJson(
    loginResponse,
    "admin login API request",
  )) as { accessToken: string };
  expect(payload.accessToken).toBeTruthy();
  return payload.accessToken;
}

async function createUser(
  request: APIRequestContext,
  baseURL: string,
  adminToken: string,
): Promise<{ email: string; password: string; id: string }> {
  const email = `it-user-${uniqueSuffix()}@example.com`;
  const createResponse = await request.post(`${baseURL}/api/users`, {
    headers: {
      Authorization: `Bearer ${adminToken}`,
    },
    data: {
      firstName: "Integration",
      lastName: "User",
      email,
      role: "user",
      sendInviteEmail: false,
      temporaryPassword: USER_PASSWORD,
    },
  });
  const payload = (await expectOkJson(
    createResponse,
    "create user API request",
  )) as { id: string };
  expect(payload.id).toMatch(/^usr_/);
  return { email, password: USER_PASSWORD, id: payload.id };
}

async function waitForClientByEmail(
  request: APIRequestContext,
  baseURL: string,
  bearerToken: string,
  emailAddress: string,
): Promise<{ clientId: string }> {
  for (let attempt = 0; attempt < 15; attempt += 1) {
    const response = await request.get(`${baseURL}/api/clients?limit=200&offset=0`, {
      headers: { Authorization: `Bearer ${bearerToken}` },
    });
    const payload = (await expectOkJson(
      response,
      "list clients API request",
    )) as { data?: Array<{ clientId: string; emailAddress: string }> };
    const match = payload.data?.find((row) => row.emailAddress.toLowerCase() === emailAddress.toLowerCase());
    if (match) {
      return { clientId: match.clientId };
    }
    await new Promise((resolve) => {
      setTimeout(resolve, 1000);
    });
  }

  throw new Error(`Client with email ${emailAddress} was not found via /api/clients`);
}

async function waitForCreateAuditLog(
  request: APIRequestContext,
  baseURL: string,
  bearerToken: string,
  clientId: string,
): Promise<void> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const response = await request.get(`${baseURL}/api/logs?clientId=${clientId}&limit=50`, {
      headers: { Authorization: `Bearer ${bearerToken}` },
    });
    const payload = (await expectOkJson(
      response,
      "list logs API request",
    )) as { data?: Array<{ action: string; clientId: string }> };
    const hasCreate = payload.data?.some((row) => row.clientId === clientId && row.action === "CREATE");
    if (hasCreate) {
      return;
    }
    await new Promise((resolve) => {
      setTimeout(resolve, 1000);
    });
  }

  throw new Error(`CREATE audit log was not observed for client ${clientId}`);
}

test.describe("Real Fullstack Integration", () => {
  test("admin can sign in and load manage accounts from live backend", async ({ page }) => {
    await loginViaUi(page, ADMIN_EMAIL, ADMIN_PASSWORD, "/admin");
    await expect(page.getByRole("heading", { name: "Admin Dashboard" })).toBeVisible();

    await page.goto("/admin/accounts");
    await expect(page).toHaveURL(/\/admin\/users$/);
    await expect(page.getByRole("heading", { name: "User Management" })).toBeVisible();
  });

  test("user can create client and exercise cross-service APIs without mocks", async ({
    baseURL,
    page,
    request,
  }) => {
    const normalizedBaseURL = normalizeBaseURL(baseURL);

    const adminToken = await loginAsAdmin(request, normalizedBaseURL);
    const normalUser = await createUser(request, normalizedBaseURL, adminToken);

    await loginViaUi(page, normalUser.email, normalUser.password, "/user");
    await expect(page.getByRole("heading", { name: "User Dashboard" })).toBeVisible();

    await page.getByRole("link", { name: "Create Client" }).first().click();
    await expect(page).toHaveURL(/\/user\/clients\/new$/);

    const clientEmail = `integration-client-${uniqueSuffix()}@example.com`;
    const clientPhone = `+1555${Math.floor(Math.random() * 9_000_000 + 1_000_000)}`;

    await page.fill('input[name="firstName"]', "Jordan");
    await page.fill('input[name="lastName"]', "Taylor");
    await page.fill('input[name="dateOfBirth"]', "1990-01-15");
    await page.selectOption('select[name="gender"]', "Male");
    await page.fill('input[name="emailAddress"]', clientEmail);
    await page.fill('input[name="phoneNumber"]', clientPhone);
    await page.fill('input[name="address"]', "123 Main Street");
    await page.fill('input[name="city"]', "Springfield");
    await page.fill('input[name="state"]', "Illinois");
    await page.fill('input[name="country"]', "United States");
    await page.fill('input[name="postalCode"]', "62704");
    await page.getByRole("button", { name: "Create Client" }).click();

    await expect(page).toHaveURL(/\/user$/);
    await expect(page.getByRole("heading", { name: "User Dashboard" })).toBeVisible();

    const authToken = await page.evaluate(() => window.localStorage.getItem("authToken"));
    expect(authToken).toBeTruthy();

    const { clientId } = await waitForClientByEmail(request, normalizedBaseURL, authToken as string, clientEmail);
    await waitForCreateAuditLog(request, normalizedBaseURL, authToken as string, clientId);

    const alertId = `aml-${uniqueSuffix()}`;
    const amlCreateResponse = await request.post(`${normalizedBaseURL}/api/aml/alerts`, {
      headers: { Authorization: `Bearer ${adminToken}` },
      data: {
        alertId,
        clientId,
        transactionId: null,
        alertType: "STRUCTURING",
        description: "Integration test alert",
        detectedAt: new Date().toISOString(),
        reviewStatus: "Pending",
      },
    });
    const amlCreated = (await expectOkJson(
      amlCreateResponse,
      "create AML alert API request",
    )) as { alertId: string; reviewStatus: string };
    expect(amlCreated.alertId).toBe(alertId);
    expect(amlCreated.reviewStatus).toBe("Pending");

    const amlReviewResponse = await request.put(`${normalizedBaseURL}/api/aml/alerts/${alertId}/review`, {
      headers: { Authorization: `Bearer ${authToken}` },
      data: { reviewStatus: "Confirmed" },
    });
    const amlReviewed = (await expectOkJson(
      amlReviewResponse,
      "review AML alert API request",
    )) as { reviewStatus: string };
    expect(amlReviewed.reviewStatus).toBe("Confirmed");

    const txResponse = await request.get(`${normalizedBaseURL}/api/clients/${clientId}/transactions?limit=20&offset=0`, {
      headers: { Authorization: `Bearer ${authToken}` },
    });
    const txPayload = (await expectOkJson(
      txResponse,
      "list client transactions API request",
    )) as { data?: unknown[]; pagination?: { total?: number } };
    expect(Array.isArray(txPayload.data)).toBeTruthy();
    expect(txPayload.pagination).toBeTruthy();

    await page.getByRole("link", { name: "Transactions" }).first().click();
    await expect(page).toHaveURL(/\/user\/transactions$/);
    await expect(page.getByRole("heading", { name: "Transactions" })).toBeVisible();
  });
});
