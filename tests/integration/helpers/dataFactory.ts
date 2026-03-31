import { type APIRequestContext } from "@playwright/test";
import { authHeaders, expectOkJson, loginViaApi, type TokenResponse } from "./apiClient";
import { uniqueEmail, uniqueId } from "./testData";

const ADMIN_EMAIL = (process.env.E2E_ADMIN_EMAIL ?? "admin@crm.com").trim();
const ADMIN_PASSWORD = (process.env.E2E_ADMIN_PASSWORD ?? "Scrooge@Bank2026!").trim();
const USER_PASSWORD = (process.env.E2E_USER_PASSWORD ?? "UserPass123!").trim();

type UserRole = "admin" | "user";

export interface CreatedUser {
  id: string;
  email: string;
  password: string;
  role: UserRole;
}

export interface AuthenticatedUser extends CreatedUser {
  tokens: TokenResponse;
}

interface CreateUserInput {
  firstName?: string;
  lastName?: string;
  email?: string;
  role?: UserRole;
  password?: string;
}

interface CreateClientInput {
  firstName?: string;
  lastName?: string;
  dateOfBirth?: string;
  gender?: string;
  emailAddress?: string;
  phoneNumber?: string;
  address?: string;
  city?: string;
  state?: string;
  country?: string;
  postalCode?: string;
}

interface CreateAccountInput {
  accountType?: "Savings" | "Checking" | "Business";
  accountStatus?: "Active" | "Inactive" | "Pending";
  openingDate?: string;
  initialDeposit?: number;
  currency?: string;
  branchId?: string;
}

interface CreateTransactionInput {
  transaction?: "D" | "W";
  amount?: number;
  date?: string;
  status?: "Completed" | "Pending" | "Failed";
}

export async function loginAsSeedAdmin(
  request: APIRequestContext,
  baseURL: string,
): Promise<TokenResponse> {
  return loginViaApi(request, baseURL, ADMIN_EMAIL, ADMIN_PASSWORD);
}

export async function createUserAsAdmin(
  request: APIRequestContext,
  baseURL: string,
  adminAccessToken: string,
  input?: CreateUserInput,
): Promise<CreatedUser> {
  const role = input?.role ?? "user";
  const password = input?.password ?? USER_PASSWORD;
  const email = input?.email ?? uniqueEmail(`it-${role}`);
  const response = await request.post(`${baseURL}/api/users`, {
    headers: authHeaders(adminAccessToken),
    data: {
      firstName: input?.firstName ?? "Integration",
      lastName: input?.lastName ?? "User",
      email,
      role,
      sendInviteEmail: false,
      temporaryPassword: password,
    },
  });
  const created = await expectOkJson<{ id: string }>(response, `create ${role} user`);
  return { id: created.id, email, password, role };
}

export async function createAgentAndLogin(
  request: APIRequestContext,
  baseURL: string,
  adminAccessToken: string,
  input?: Omit<CreateUserInput, "role">,
): Promise<AuthenticatedUser> {
  const user = await createUserAsAdmin(request, baseURL, adminAccessToken, {
    ...input,
    role: "user",
  });
  const tokens = await loginViaApi(request, baseURL, user.email, user.password);
  return { ...user, tokens };
}

export async function createAgentPairAndLogin(
  request: APIRequestContext,
  baseURL: string,
  adminAccessToken: string,
): Promise<{ agentA: AuthenticatedUser; agentB: AuthenticatedUser }> {
  const [agentA, agentB] = await Promise.all([
    createAgentAndLogin(request, baseURL, adminAccessToken, {
      firstName: "Agent",
      lastName: "Alpha",
      email: uniqueEmail("it-agent-a"),
    }),
    createAgentAndLogin(request, baseURL, adminAccessToken, {
      firstName: "Agent",
      lastName: "Bravo",
      email: uniqueEmail("it-agent-b"),
    }),
  ]);
  return { agentA, agentB };
}

export async function createClientForUser(
  request: APIRequestContext,
  baseURL: string,
  userAccessToken: string,
  input?: CreateClientInput,
): Promise<{ clientId: string; emailAddress: string }> {
  const emailAddress = input?.emailAddress ?? uniqueEmail("it-client");
  const phoneNumber = input?.phoneNumber ?? `+1555${Math.floor(Math.random() * 9_000_000 + 1_000_000)}`;
  const response = await request.post(`${baseURL}/api/clients`, {
    headers: authHeaders(userAccessToken),
    data: {
      firstName: input?.firstName ?? "Client",
      lastName: input?.lastName ?? "Record",
      dateOfBirth: input?.dateOfBirth ?? "1990-01-01",
      gender: input?.gender ?? "Male",
      emailAddress,
      phoneNumber,
      address: input?.address ?? "100 Integration Street",
      city: input?.city ?? "Singapore",
      state: input?.state ?? "Singapore",
      country: input?.country ?? "Singapore",
      postalCode: input?.postalCode ?? "123456",
    },
  });
  const created = await expectOkJson<{ clientId: string }>(response, "create client");
  return { clientId: created.clientId, emailAddress };
}

export async function createAccountForClient(
  request: APIRequestContext,
  baseURL: string,
  userAccessToken: string,
  clientId: string,
  input?: CreateAccountInput,
): Promise<{ accountId: string; clientId: string }> {
  const response = await request.post(`${baseURL}/api/accounts`, {
    headers: authHeaders(userAccessToken),
    data: {
      clientId,
      accountType: input?.accountType ?? "Savings",
      accountStatus: input?.accountStatus ?? "Active",
      openingDate: input?.openingDate ?? new Date().toISOString().split("T")[0],
      initialDeposit: input?.initialDeposit ?? 1000,
      currency: input?.currency ?? "SGD",
      branchId: input?.branchId ?? `BR-${uniqueId()}`,
    },
  });
  return expectOkJson<{ accountId: string; clientId: string }>(response, "create account");
}

export async function createTransactionAsAdmin(
  request: APIRequestContext,
  baseURL: string,
  adminAccessToken: string,
  clientId: string,
  input?: CreateTransactionInput,
): Promise<{ id: string; clientId: string }> {
  const response = await request.post(`${baseURL}/api/transactions`, {
    headers: authHeaders(adminAccessToken),
    data: {
      clientId,
      transaction: input?.transaction ?? "D",
      amount: input?.amount ?? 100,
      date: input?.date ?? new Date().toISOString().split("T")[0],
      status: input?.status ?? "Completed",
    },
  });
  return expectOkJson<{ id: string; clientId: string }>(response, "create transaction");
}
